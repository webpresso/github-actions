#!/usr/bin/env node
// Arms squash auto-merge on eligible open pull requests, for the
// auto-merge-sweeper workflow. Runs from the default branch's copy and never
// checks out or executes PR code: it only reads PR metadata through the API.
//
// A pull request is armed only when ALL of these hold (the D7 predicate):
//   - it is open, not a draft, and targets the repository's default branch;
//   - its head branch is in the same repository (never a fork);
//   - its author's effective permission is write, maintain or admin, read from
//     GET /repos/{o}/{r}/collaborators/{user}/permission. A permission that
//     cannot be read, or is not understood, means do not arm;
//   - it does not carry the `webpresso:no-automerge` label (a PR with more
//     labels than one page returns, and no opt-out label on that page, is not
//     armed: the label may be on the part not read);
//   - auto-merge is not already enabled (those are skipped).
// At most MAX_ARMED_PER_REPO pull requests per repository are newly armed per
// sweep, so a backlog is admitted a few per tick instead of all at once. PRs
// that already have auto-merge enabled do not count: a stuck armed PR must not
// block every newer one. Candidates go oldest first. A refusal GitHub gives for
// a state of the PR or repository (clean status, auto-merge not allowed,
// conflicts) is a skip, not an error, and does not use up a slot.
//
// Known limit: GitHub refuses to enable auto-merge on a PR whose checks are
// already all green (clean status), and the sweeper does not merge. Such a PR is
// reported as a ::notice:: on every tick until someone merges it.
//
// The arm-once caveat: eligibility is read when the PR is armed. Auto-merge
// stays armed if the author is later demoted, a label is added, or someone
// else pushes to the head branch; disarm those by hand. Bot authors (GraphQL
// login `dependabot`, REST `dependabot[bot]`) have no readable collaborator
// permission, so they are never armed; the blueprint's "or is a Webpresso App"
// clause is deferred.
//
// Repositories are governed only when the `webpresso-governance` custom
// property is `full` or `guarded`; everything else (off, self, unset) is
// skipped.
//
// Environment:
//   SWEEP_TOKEN        Webpresso Internal App installation token (live mode).
//   SWEEP_API_URL      REST base, default https://api.github.com.
//   SWEEP_GRAPHQL_URL  GraphQL endpoint, default https://api.github.com/graphql.
//   SWEEP_OWNER        Organization to sweep on a scheduled run.
//   SWEEP_REPOSITORY   owner/name. When set, only that repository is swept and
//                      SWEEP_SWITCH is ignored (workflow_dispatch mode).
//   SWEEP_SWITCH       The org variable WP_AUTO_MERGE_SWEEP; an org-wide sweep
//                      runs only when it is `on`. Unset, empty or anything
//                      else means stopped.
//   SWEEP_DRY_RUN      `true` to plan without arming.
//   SWEEP_FIXTURE      Path to a fixture JSON: no network, implies dry run.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const MAX_ARMED_PER_REPO = 3;
export const OPT_OUT_LABEL = "webpresso:no-automerge";
export const GOVERNANCE_PROPERTY = "webpresso-governance";
export const GOVERNED_LEVELS = ["full", "guarded"];
const ARMING_PERMISSIONS = ["write", "maintain", "admin"];
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
// GraphQL refusals that describe the PR or repository, not a failure of the
// sweep. They recur every tick until someone fixes the cause.
const EXPECTED_ARM_REFUSAL =
  /clean status|auto[- ]?merge is not allowed|not allowed for this repository|merge conflict|conflicting|not mergeable/iu;

const CLEAN_STATUS_REFUSAL = /clean status/iu;

/** True when an arm failure is an expected refusal to skip, not an error. */
export function isExpectedArmRefusal(message) {
  return EXPECTED_ARM_REFUSAL.test(message);
}

/** True for a permission response that proves effective write access. */
export function canArm(permissionResponse) {
  if (permissionResponse === null || typeof permissionResponse !== "object") {
    return false;
  }
  // role_name distinguishes maintain (legacy `permission` folds it into write)
  // and custom roles; fall back to the legacy field only when it is absent.
  const { role_name: role, permission } = permissionResponse;
  if (typeof role === "string" && role !== "") {
    return ARMING_PERMISSIONS.includes(role);
  }
  return permission === "write" || permission === "admin";
}

/**
 * Why a PR is not eligible before the permission check, or null when it passes
 * the structural predicate. `repository` is { fullName, defaultBranch }.
 */
export function structuralSkipReason(pr, repository) {
  if (pr.isDraft) return "draft";
  if (pr.baseRefName !== repository.defaultBranch) return "not the default branch";
  if (pr.headRepository === null || pr.headRepository === undefined) return "head repository gone";
  if (pr.headRepository.toLowerCase() !== repository.fullName.toLowerCase()) return "fork head";
  if (pr.labels.includes(OPT_OUT_LABEL)) return `labelled ${OPT_OUT_LABEL}`;
  if (pr.labelsTruncated) return "labels truncated";
  if (pr.author === null || pr.author === undefined) return "no author";
  return null;
}

/**
 * Plans one repository's sweep. Returns the PRs to arm now (oldest first, at
 * most MAX_ARMED_PER_REPO), `reserve` (eligible PRs
 * beyond that room, to take over when an arm is refused) and why each other
 * open PR was skipped. `getPermission(login)` resolves a
 * collaborator-permission response, or rejects when it cannot be read.
 */
export async function planRepository(repository, pullRequests, getPermission) {
  const eligible = [];
  const skipped = [];
  const ordered = [...pullRequests].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.number - b.number,
  );
  for (const pr of ordered) {
    if (pr.autoMergeEnabled) {
      skipped.push({ number: pr.number, reason: "auto-merge already enabled" });
      continue;
    }
    const structural = structuralSkipReason(pr, repository);
    if (structural !== null) {
      skipped.push({ number: pr.number, reason: structural });
      continue;
    }
    let permission;
    try {
      permission = await getPermission(pr.author);
    } catch (error) {
      skipped.push({ number: pr.number, reason: `permission unreadable (${error.message})` });
      continue;
    }
    if (!canArm(permission)) {
      skipped.push({ number: pr.number, reason: `author ${pr.author} lacks write access` });
      continue;
    }
    eligible.push(pr);
  }
  const room = MAX_ARMED_PER_REPO;
  return { arm: eligible.slice(0, room), reserve: eligible.slice(room), skipped, room };
}

/**
 * Repositories to sweep. A dispatched repository ignores the org switch; an
 * org-wide sweep runs only when the switch is `on`.
 */
export function selectRepositories(repositories, { repository, switchValue }) {
  if (repository !== undefined && repository !== "") {
    return repositories.filter(
      (candidate) => candidate.fullName.toLowerCase() === repository.toLowerCase(),
    );
  }
  if (switchValue !== "on") {
    return [];
  }
  return repositories;
}

export function isGoverned(level) {
  return GOVERNED_LEVELS.includes(level);
}

/* -------------------------------------------------------------------------- */
/* Sources: a fixture file (dry run) or the live GitHub API                    */
/* -------------------------------------------------------------------------- */

const PULL_REQUESTS_QUERY = `
query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef { name }
    pullRequests(states: OPEN, first: 100, after: $cursor, orderBy: {field: CREATED_AT, direction: ASC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        number
        isDraft
        createdAt
        baseRefName
        author { login }
        headRepository { nameWithOwner }
        labels(first: 100) { pageInfo { hasNextPage } nodes { name } }
        autoMergeRequest { enabledAt }
      }
    }
  }
}`;

const ENABLE_AUTO_MERGE_MUTATION = `
mutation($id: ID!) {
  enablePullRequestAutoMerge(input: {pullRequestId: $id, mergeMethod: SQUASH}) {
    pullRequest { number autoMergeRequest { enabledAt } }
  }
}`;

const MAX_PULL_REQUEST_PAGES = 5;

function normalizePullRequest(node) {
  return {
    id: node.id,
    number: node.number,
    isDraft: node.isDraft,
    createdAt: node.createdAt,
    baseRefName: node.baseRefName,
    author: node.author === null ? null : node.author.login,
    headRepository: node.headRepository === null ? null : node.headRepository.nameWithOwner,
    labels: node.labels.nodes.map((label) => label.name),
    labelsTruncated: node.labels.pageInfo?.hasNextPage === true,
    autoMergeEnabled: node.autoMergeRequest !== null,
  };
}

export function fixtureSource(fixture) {
  const byName = new Map(fixture.repositories.map((repo) => [repo.fullName, repo]));
  return {
    async listGovernedRepositories(owner) {
      return fixture.repositories
        .filter((repo) => repo.fullName.startsWith(`${owner}/`))
        .map((repo) => ({ fullName: repo.fullName, level: repo.level ?? null }));
    },
    async repositoryLevel(fullName) {
      return byName.get(fullName)?.level ?? null;
    },
    async listPullRequests(fullName) {
      const repo = byName.get(fullName);
      return {
        defaultBranch: repo.defaultBranch,
        pullRequests: repo.pullRequests.map((pr) => ({ ...pr })),
      };
    },
    async getPermission(fullName, login) {
      const response = byName.get(fullName).permissions?.[login];
      if (response === undefined || response === "error") {
        throw new Error("fixture has no readable permission");
      }
      return response;
    },
    async arm() {
      throw new Error("a fixture source never arms");
    },
  };
}

const MAX_ATTEMPTS = 3;

function isRetryable(response) {
  if (response.status === 429 || response.status >= 500) return true;
  // 403 is a rate limit only when GitHub says so; otherwise it is a refusal.
  return (
    response.status === 403 &&
    (response.headers?.get?.("retry-after") != null ||
      response.headers?.get?.("x-ratelimit-remaining") === "0")
  );
}

export function liveSource({
  token,
  apiUrl,
  graphqlUrl,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  // Retries 429, 5xx and rate-limited 403 with a short backoff.
  async function send(url, init) {
    for (let attempt = 1; ; attempt += 1) {
      const response = await fetchImpl(url, init);
      if (response.ok || attempt >= MAX_ATTEMPTS || !isRetryable(response)) return response;
      await sleep(attempt * 2000);
    }
  }
  async function rest(path) {
    const response = await send(`${apiUrl.replace(/\/$/u, "")}${path}`, { headers });
    if (!response.ok) {
      throw new Error(`GET ${path} returned ${response.status}`);
    }
    return response.json();
  }
  async function graphql(query, variables) {
    const response = await send(graphqlUrl, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
      throw new Error(`GraphQL returned ${response.status}`);
    }
    const body = await response.json();
    if (body.errors !== undefined && body.errors.length > 0) {
      throw new Error(body.errors.map((error) => error.message).join("; "));
    }
    return body.data;
  }
  const levelOf = (properties) =>
    properties.find((property) => property.property_name === GOVERNANCE_PROPERTY)?.value ?? null;
  return {
    async listGovernedRepositories(owner) {
      const found = [];
      for (let page = 1; ; page += 1) {
        const rows = await rest(`/orgs/${owner}/properties/values?per_page=100&page=${page}`);
        for (const row of rows) {
          found.push({ fullName: `${owner}/${row.repository_name}`, level: levelOf(row.properties) });
        }
        if (rows.length < 100) return found;
      }
    },
    async repositoryLevel(fullName) {
      return levelOf(await rest(`/repos/${fullName}/properties/values`));
    },
    async listPullRequests(fullName) {
      const [owner, name] = fullName.split("/");
      const pullRequests = [];
      let defaultBranch = null;
      let cursor = null;
      let truncated = false;
      for (let page = 0; page < MAX_PULL_REQUEST_PAGES; page += 1) {
        const data = await graphql(PULL_REQUESTS_QUERY, { owner, name, cursor });
        const repository = data.repository;
        defaultBranch = repository.defaultBranchRef?.name ?? null;
        pullRequests.push(...repository.pullRequests.nodes.map(normalizePullRequest));
        if (!repository.pullRequests.pageInfo.hasNextPage) break;
        cursor = repository.pullRequests.pageInfo.endCursor;
        truncated = page === MAX_PULL_REQUEST_PAGES - 1;
      }
      return { defaultBranch, pullRequests, truncated };
    },
    getPermission(fullName, login) {
      return rest(`/repos/${fullName}/collaborators/${encodeURIComponent(login)}/permission`);
    },
    async arm(pr) {
      await graphql(ENABLE_AUTO_MERGE_MUTATION, { id: pr.id });
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Sweep                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Runs one sweep and returns { armed, errors, lines }. `log` receives one line
 * per decision.
 */
export async function sweep({ source, owner, repository, switchValue, dryRun, log }) {
  const result = { armed: 0, errors: 0 };
  const dispatched = repository !== undefined && repository !== "";
  if (!dispatched && switchValue !== "on") {
    log("WP_AUTO_MERGE_SWEEP is not on: arming nothing.");
    return result;
  }

  let candidates;
  if (dispatched) {
    const [repositoryOwner] = repository.split("/");
    if (
      !REPOSITORY_PATTERN.test(repository) ||
      owner === undefined ||
      repositoryOwner.toLowerCase() !== owner.toLowerCase()
    ) {
      log(`::error::'${repository}' is not an owner/name repository in ${owner ?? "the sweep owner"}.`);
      result.errors += 1;
      return result;
    }
    try {
      candidates = [{ fullName: repository, level: await source.repositoryLevel(repository) }];
    } catch (error) {
      log(`::error::${repository}: could not read ${GOVERNANCE_PROPERTY} (${error.message}).`);
      result.errors += 1;
      return result;
    }
  } else {
    candidates = await source.listGovernedRepositories(owner);
  }
  const selected = selectRepositories(candidates, { repository, switchValue });
  if (selected.length === 0) {
    log("No matching repositories.");
  }

  for (const candidate of selected) {
    if (!isGoverned(candidate.level)) {
      log(`${candidate.fullName}: skipped, ${GOVERNANCE_PROPERTY} is ${candidate.level ?? "unset"}.`);
      continue;
    }
    try {
      const { defaultBranch, pullRequests, truncated } = await source.listPullRequests(candidate.fullName);
      if (defaultBranch === null) {
        log(`${candidate.fullName}: skipped, no default branch.`);
        continue;
      }
      if (truncated) {
        log(`::warning::${candidate.fullName}: only the oldest ${pullRequests.length} open pull requests were read; newer ones are not considered.`);
      }
      const permissions = new Map();
      const getPermission = (login) => {
        if (!permissions.has(login)) {
          permissions.set(login, source.getPermission(candidate.fullName, login));
        }
        return permissions.get(login);
      };
      const plan = await planRepository(
        { fullName: candidate.fullName, defaultBranch },
        pullRequests,
        getPermission,
      );
      for (const entry of plan.skipped) {
        log(`${candidate.fullName}#${entry.number}: not armed, ${entry.reason}.`);
      }
      // A refused arm does not use up a slot: the next candidate takes it.
      const queue = [...plan.arm, ...plan.reserve];
      let armed = 0;
      while (queue.length > 0 && armed < plan.room) {
        const pr = queue.shift();
        if (dryRun) {
          log(`${candidate.fullName}#${pr.number}: would arm squash auto-merge.`);
          armed += 1;
          result.armed += 1;
          continue;
        }
        try {
          await source.arm(pr);
          log(`${candidate.fullName}#${pr.number}: armed squash auto-merge.`);
          armed += 1;
          result.armed += 1;
        } catch (error) {
          if (isExpectedArmRefusal(error.message)) {
            log(`${candidate.fullName}#${pr.number}: not armed, refused (${error.message}).`);
            if (CLEAN_STATUS_REFUSAL.test(error.message)) {
              log(`::notice::${candidate.fullName}#${pr.number}: checks already passed, so auto-merge cannot be armed; merge it by hand.`);
            }
          } else {
            log(`::error::${candidate.fullName}#${pr.number}: could not arm (${error.message}).`);
            result.errors += 1;
          }
        }
      }
      for (const pr of queue) {
        log(`${candidate.fullName}#${pr.number}: not armed, per-repository limit reached.`);
      }
    } catch (error) {
      log(`::error::${candidate.fullName}: sweep failed (${error.message}).`);
      result.errors += 1;
    }
  }
  log(`${dryRun ? "Would arm" : "Armed"} ${result.armed} pull request(s), ${result.errors} error(s).`);
  return result;
}

async function main(env) {
  const fixturePath = env.SWEEP_FIXTURE;
  const dryRun = fixturePath !== undefined && fixturePath !== "" ? true : env.SWEEP_DRY_RUN === "true";
  let source;
  if (fixturePath !== undefined && fixturePath !== "") {
    source = fixtureSource(JSON.parse(readFileSync(fixturePath, "utf8")));
  } else {
    if (!env.SWEEP_TOKEN) {
      console.error("::error::SWEEP_TOKEN is not set");
      return 1;
    }
    source = liveSource({
      token: env.SWEEP_TOKEN,
      apiUrl: env.SWEEP_API_URL || "https://api.github.com",
      graphqlUrl: env.SWEEP_GRAPHQL_URL || "https://api.github.com/graphql",
    });
  }
  const result = await sweep({
    source,
    owner: env.SWEEP_OWNER,
    repository: env.SWEEP_REPOSITORY,
    switchValue: env.SWEEP_SWITCH,
    dryRun,
    log: (line) => console.log(line),
  });
  return result.errors > 0 ? 1 : 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.env);
}
