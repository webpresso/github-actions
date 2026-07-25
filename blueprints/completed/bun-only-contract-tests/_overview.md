---
type: blueprint
title: "Bun-only contract tests behind a real CI gate"
status: completed
complexity: M
owner: "claude"
created: "2026-07-25"
last_updated: "2026-07-25"
completed_at: "2026-07-25"
tags:
  - "github-actions"
  - "testing"
  - "ci"
---

# Bun-only contract tests behind a real CI gate

## Product wedge anchor

- **Stage outcome:** This repository is the shared CI surface for every Webpresso consumer (ingest-lens, edge-matte, framework, monorepo). Its reusable workflows are protected by 725 lines of contract tests across two languages — and **no CI ran either suite**: there was no `on: pull_request` workflow in the repo, so a contract violation merged green. A regression here breaks every consumer's pipeline at once.
- **Consuming surface:** `.github/workflows/self-test.yml` — runs on every pull request to this repo, so consumers inherit workflows whose contracts were actually enforced at merge time.
- **New user-visible capability:** A maintainer who breaks a pin, permission scope, secret-sink boundary, or embedded scan script now gets a red PR instead of a silently merged regression that surfaces in a downstream repo's deploy.

## Summary

Two problems, one arc.

**(1) Gate theater.** `test/workflow_contract_test.rb` (21 tests) and the `*.contract.test.cjs` suites (11 tests) were executable only by a developer who remembered two undocumented local commands. Nothing enforced them. Fixed first, before any refactor, so the refactor itself is CI-proven.

**(2) Dual-toolchain cliff.** The same invariants are asserted in two languages by two different mechanisms — the full-SHA-pin rule is checked by Ruby (YAML parse) *and* by Node (regex over stripped text); heredoc extraction is implemented twice with divergent regexes (Ruby also catches `cat >` heredocs, Node does not). The Ruby suite runs on unpinned, deprecated system Ruby with no `Gemfile`. Contributors need both toolchains and the repo documents neither.

The end state is one toolchain: `bun test` over `test/*.test.ts`, zero npm dependencies (`Bun.YAML` is built in), zero manifest, one shared helper module. Node stays only as the runtime that *executes* extracted workflow scripts, matching what GitHub Actions actually runs.

## Key decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Gate before port | Land `self-test.yml` first, running both existing suites unchanged | The port is a rewrite of the only thing protecting this repo. Proving the executor works first means the rewrite lands against a live gate rather than on trust. |
| Target language | Bun (`bun test`) | Node is already mandatory (the repo's domain is an npm package and its embedded scripts are Node). Bun adds `Bun.YAML` so the port needs **zero** dependencies and no `package.json` — strictly less footprint than the Ruby+Node status quo. Ruby's only advantage was "no npm needed", which stopped being true the moment `*.contract.test.cjs` landed. |
| Ruby suite fate | Delete after port parity is proven by co-execution | Keeping it would preserve the dual-SSOT that causes the divergent-regex class of bug. |
| Pin assertions | Assert cross-site consistency + shape, not literal values | The setup-wp SHA appears at 12 sites and the agent-kit version at 13, five of them test-side literals. Consistency assertions drop the test-side copies so a freshness bump touches YAML only. |
| Runner | `ubuntu-latest` | This repo is public: GitHub-hosted minutes are free here, so the Ubicloud default for private repos does not apply. |

## Task list

### Phase 1: Make the existing suites binding

#### [infra] Task 1.1: Add the self-test CI gate

**Status:** done

**Depends:** None

Create `.github/workflows/self-test.yml` running on `pull_request` and on `push` to `main`, executing both existing suites unchanged: `ruby -Itest test/workflow_contract_test.rb` and `node --test .github/workflows/*.contract.test.cjs`. Least-privilege `permissions: contents: read`; `concurrency` with `cancel-in-progress`; every `uses:` pinned by full 40-character SHA (the repo's own `test_all_workflow_and_action_uses_are_full_sha_pins` globs all workflows and will enforce this automatically). The file must be named `.yml`, not `.yaml` — the pin test globs `*.yml` only, so a `.yaml` file would silently evade the pin contract.

**Files:**

- Create: `.github/workflows/self-test.yml`

**Steps:**

1. Write the workflow with pinned `actions/checkout`, `ruby/setup-ruby`, `actions/setup-node`
2. Run `ruby -Itest test/workflow_contract_test.rb` — verify the new workflow does not break existing invariants
3. Run `node --test .github/workflows/*.contract.test.cjs` — verify unchanged

**Acceptance:**

- [x] Triggers on `pull_request` and on `push` to `main`
- [x] Runs both contract suites as separate named steps
- [x] `permissions: contents: read` only — no write scope
- [x] Every `uses:` is a full 40-character SHA pin
- [x] Both suites pass locally against the new file

**Verification:** `ruby -Itest test/workflow_contract_test.rb` → 22 runs, 434 assertions, 0 failures (exit 0). `node --test .github/workflows/*.contract.test.cjs` → 11 pass, 0 fail (exit 0). Pins used: `actions/checkout@93cb6efe…` (already in repo), `ruby/setup-ruby@95ef2b04…` (v1.321.0), `actions/setup-node@48b55a01…` (v6, already in repo).

#### [qa] Task 1.2: Register the toolchain exception and pin the gate's own contract

**Status:** done

**Depends:** Task 1.1

`test_every_reusable_toolchain_workflow_uses_caller_versioned_agent_kit_setup` asserts that every `.github/workflows/*.yml` minus `NON_TOOLCHAIN_WORKFLOWS` wires the shared toolchain, and `test_reusable_workflows_do_not_request_removed_global_cli_input` iterates the same set. A new `self-test.yml` that installs Ruby and Node instead of pnpm/Vite+/wp breaks both unless it is registered as a deliberate exception — mirroring the existing `agent-kit-freshness.yml` precedent rather than inventing a new escape.

The exception must not become a silent gap: add a positive contract test asserting the gate's trigger set, read-only permission scope, and both suite invocations, so nobody can narrow the trigger or drop a suite without going red.

**Files:**

- Modify: `test/workflow_contract_test.rb`

**Steps:**

1. Add `WORKFLOW_SELF_TEST` and extend `NON_TOOLCHAIN_WORKFLOWS` with a documented reason
2. Add `test_self_test_workflow_gates_both_contract_suites` asserting triggers, permissions, and both `run:` commands
3. Prove the new test bites: remove the `pull_request:` trigger, confirm failure, restore, confirm pass

**Acceptance:**

- [x] `self-test.yml` is excluded from the toolchain invariant with a written rationale, not a silent gap
- [x] A positive test pins the trigger set, `contents: read`, and both suite commands
- [x] The new test provably fails against a gutted gate and passes when restored
- [x] `ruby -Itest test/workflow_contract_test.rb` passes

**Verification:** suite went 21 runs/410 assertions → 22 runs/434 assertions. Mutation proof: deleting the `pull_request:` trigger produced `1) Failure: WorkflowContractTest#test_self_test_workflow_gates_both_contract_suites [test/workflow_contract_test.rb:392]: contract suites must gate every pull request` (22 runs, 1 failure); restoring the trigger returned 0 failures.

### Phase 2: Collapse to one toolchain

#### [qa] Task 2.1: Replace literal pin assertions with consistency assertions

**Status:** done

**Depends:** Task 1.2

Both suites hardcode `setup-wp@c2c71a7a…`, the toolchain SHA, and `3.1.17`. Those constants make the test files sites 9–13 of a value that already lives at 8 irreducible YAML sites, so every freshness bump PR has to edit tests. Replace the literal expectations with assertions that every workflow site carries the *same* value and that the value is full-SHA / semver shaped. Fixture SHAs inside the freshness contract test stay literal — they are inputs, not assertions.

**Files:**

- Modify: `test/workflow_contract_test.rb`
- Modify: `.github/workflows/agent-kit-freshness.contract.test.cjs` — **no change needed** (see below)

**Implementation:**

The three constants are now derived at runtime from one canonical workflow
(`.github/workflows/webpresso-ci.yml`, the only workflow that carries the
toolchain pin, the setup-wp pin, and the version input together). `sole(...)`
refuses to derive anything if the canonical file itself disagrees with itself.
The suite then asserts:

- **shape** — toolchain and setup-wp `uses:` match `/@[a-f0-9]{40}\z/`, the
  agent-kit version matches `/\A\d+\.\d+\.\d+\z/`;
- **cross-site agreement** — the de-duplicated set of every
  `setup-webpresso-toolchain@…` reference, every `setup-wp@…` reference, and
  every `setup-wp` `with: version:` value across all of
  `.github/{workflows,actions}/**/*.yml` must each be exactly one element.

Audit of `agent-kit-freshness.contract.test.cjs` found **zero literal pin
assertions** in it: every occurrence of `c2c71a7a…`, `3.1.17`,
`0123456789abcdef…`, and `fedcba98…` in that file is inside a synthetic fixture
string (a fake `ci.yml` the scan script is run against), i.e. test *input*, not
an expectation. Those stay literal, as the task requires. The file therefore
needed no edit, and the same holds for the ported `test/freshness.test.ts`.

**Acceptance:**

- [x] No test asserts a literal setup-wp SHA, toolchain SHA, or agent-kit version
- [x] Cross-site consistency and value shape are asserted instead
- [x] A hand-edited single-site drift fails the suite
- [x] Both suites pass

**Verification:** `ruby -Itest test/workflow_contract_test.rb` → **24 runs, 451
assertions, 0 failures, 0 errors** (22 → 24: `test_canonical_pins_are_correctly_shaped`
and `test_pin_values_agree_across_every_site` added by this task).
`node --test .github/workflows/*.contract.test.cjs` → **11 pass, 0 fail**.
Drift proof: rewriting the setup-wp SHA at exactly one of its 12 sites
(`changesets-release.yml:67` → `setup-wp@0000…0000`) turned the suite red with
`(fail) pin consistency > every setup-wp reference in the repo is the same
full-SHA pin` / `expect(received).toStrictEqual(expected)` listing both the
drifted and the canonical value; restoring the line returned 39 pass / 0 fail.

#### [qa] Task 2.2: Port both suites to `bun:test` under `test/`

**Status:** done

**Depends:** Task 2.1

Port `test/workflow_contract_test.rb` and the two `*.contract.test.cjs` files into `test/*.test.ts` running under `bun test`, sharing one `test/helpers.ts` (workflow loading via `Bun.YAML.parse`, `allUses`, one unified heredoc extractor, fixture-repo builders). Adopt the Ruby heredoc regex — it also matches `cat >` heredocs, which the Node one misses. Embedded workflow scripts continue to execute under `node`, matching the Actions runtime. Keep the old suites in `self-test.yml` for this task so both run in the same CI job and parity is proven by co-execution.

**Files:**

- Create: `test/helpers.ts`, `test/workflow-shape.test.ts`, `test/freshness.test.ts`, `test/production-auth.test.ts`
- Modify: `.github/workflows/self-test.yml`

**Implementation notes:**

- `Bun.YAML.parse` keeps GitHub's `on:` key as the string `"on"` (Psych coerces
  it to boolean `true`). `onSection()` absorbs the difference so no test has to
  know.
- One `HEREDOC_PATTERN` constant backs **both** `extractHeredocs` and
  `stripHeredocs`, so the extractor and the stripper cannot diverge again the
  way Ruby's and Node's did. It is the Ruby pattern, extended with an opener
  capture group so the Doppler-OIDC helper can be selected by its
  `cat > "${DOPPLER_OIDC_HELPER}"` opener rather than by a second regex.
- Embedded scripts run via `spawnSync("node", …)`, never `process.execPath` —
  under Bun that would be the `bun` binary, which is not what the Actions
  runner uses.
- `allStepsAnywhere()` collects any `steps:` array in a document, so the
  repo-wide pin sweep covers a composite action's `runs.steps` as well as a
  workflow's `jobs.*.steps`.

**Parity mapping (old test → new test).** 22 Ruby + 11 Node = 33 old invariants;
all 33 have a named counterpart. Task 2.1 added 2 more Ruby tests, and 2 tests
are genuinely new. Bun total: **39**.

| Old test | New test (file › describe › it) |
| -------- | ------------------------------- |
| rb `test_preview_workflow_bootstrap_contract_and_pins` | `workflow-shape` › deploy workflow bootstrap contract › preview workflow declares required sink inputs, id-token write, and pinned bootstrap actions |
| rb `test_production_workflow_bootstrap_contract_and_pins` | `workflow-shape` › deploy workflow bootstrap contract › production workflow declares required sink inputs, id-token write, and pinned bootstrap actions |
| rb `test_deploy_workflows_allow_callers_to_pin_a_trusted_checkout` | `workflow-shape` › deploy workflow bootstrap contract › deploy workflows allow callers to pin a trusted checkout |
| rb `test_deploy_workflows_never_export_profiles_or_runtime_secrets_job_wide` | `workflow-shape` › secret-sink boundary › deploy workflows never export profiles or runtime secrets job-wide |
| rb `test_provider_auth_is_scoped_to_secret_gated_mutation_steps` | `workflow-shape` › secret-sink boundary › provider auth is scoped to secret-gated mutation steps |
| rb `test_deploy_workflows_validate_sink_and_fail_closed_for_infisical` | `workflow-shape` › secret-sink boundary › deploy workflows validate the sink and fail closed for Infisical |
| rb `test_doppler_oidc_exchanges_for_a_masked_short_lived_token_only` | `workflow-shape` › secret-sink boundary › Doppler OIDC exchanges for a masked short-lived token only |
| rb `test_mutation_commands_run_only_through_caller_selected_secret_sink` | `workflow-shape` › secret-sink boundary › mutation commands run only through the caller-selected secret sink |
| rb `test_smoke_failure_runs_optional_rollback_and_still_fails` | `workflow-shape` › secret-sink boundary › smoke failure runs the optional rollback and still fails the run |
| rb `test_embedded_node_programs_parse` | `workflow-shape` › embedded workflow scripts › every embedded node program in the deploy workflows parses |
| rb `test_doppler_oidc_helper_is_shared_and_exchanges_only_provider_auth` | `workflow-shape` › embedded workflow scripts › the Doppler OIDC helper is shared and exchanges only provider auth |
| rb `test_release_workflow_uses_shared_toolchain_setup` | `workflow-shape` › shared toolchain wiring › the release workflow uses the shared toolchain setup |
| rb `test_shared_toolchain_action_is_fully_pinned` | `workflow-shape` › shared toolchain wiring › the shared toolchain action is fully pinned |
| rb `test_shared_toolchain_action_uses_catalog_aware_vite_plus_setup` | `workflow-shape` › shared toolchain wiring › the shared toolchain action uses catalog-aware Vite+ setup |
| rb `test_reusable_workflows_do_not_request_removed_global_cli_input` | `workflow-shape` › shared toolchain wiring › reusable workflows do not request the removed global CLI input |
| rb `test_every_reusable_toolchain_workflow_uses_caller_versioned_agent_kit_setup` | `workflow-shape` › shared toolchain wiring › every reusable toolchain workflow uses caller-versioned agent-kit setup |
| rb `test_all_workflow_and_action_uses_are_full_sha_pins` | `workflow-shape` › repo-wide pin and prose contracts › all workflow and action uses are full SHA pins |
| rb `test_readme_describes_sink_scoped_secret_contract` | `workflow-shape` › repo-wide pin and prose contracts › the README describes the sink-scoped secret contract |
| rb `test_shared_ci_workflow_uses_shared_toolchain_and_aggregate_gate` | `workflow-shape` › repo-wide pin and prose contracts › the shared CI workflow uses the shared toolchain and an aggregate gate |
| rb `test_shared_security_workflow_uses_pinned_scanners_and_shared_toolchain` | `workflow-shape` › repo-wide pin and prose contracts › the shared security workflow uses pinned scanners and the shared toolchain |
| rb `test_agent_kit_freshness_workflow_is_a_deliberate_toolchain_exception` | `workflow-shape` › toolchain exceptions › agent-kit-freshness.yml is a deliberate toolchain exception |
| rb `test_self_test_workflow_gates_both_contract_suites` | `workflow-shape` › toolchain exceptions › self-test.yml gates the contract suite on every pull request — **updated in 2.3**: after deletion the gate runs one suite (`bun test`), not two. `NON_TOOLCHAIN_WORKFLOWS` (both `agent-kit-freshness.yml` and `self-test.yml`) carried over to `helpers.ts` with its rationale comment. |
| rb `test_canonical_pins_are_correctly_shaped` *(added in 2.1)* | `workflow-shape` › pin consistency › derives the canonical pins from a single workflow and they are correctly shaped |
| rb `test_pin_values_agree_across_every_site` *(added in 2.1)* | split into three: `workflow-shape` › pin consistency › every setup-webpresso-toolchain reference in the repo is the same full-SHA pin · every setup-wp reference in the repo is the same full-SHA pin · every setup-wp step installs the same exact agent-kit semver |
| cjs `agent-kit-freshness.yml declares workflow_call and workflow_dispatch triggers with least-privilege permissions` | `freshness` › agent-kit-freshness.yml shape › declares workflow_call and workflow_dispatch triggers with least-privilege permissions |
| cjs `… uses a fixed idempotent branch name and refreshes title+body when editing an existing open PR` | `freshness` › agent-kit-freshness.yml shape › uses a fixed idempotent branch name and refreshes title+body when editing an existing open PR |
| cjs `… only relies on the caller's GITHUB_TOKEN, never a PAT or app token` | `freshness` › agent-kit-freshness.yml shape › only relies on the caller's GITHUB_TOKEN, never a PAT or app token |
| cjs `… pins every third-party action reference by full commit SHA` | `freshness` › agent-kit-freshness.yml shape › pins every third-party action reference by full commit SHA |
| cjs `stripEmbeddedNodeHeredocs removes every NODE heredoc so later real uses: lines stay scannable` | `freshness` › heredoc stripping › removes every NODE heredoc so later real uses: lines stay scannable |
| cjs `embedded scan script has valid syntax` | `freshness` › embedded scan script behavior › has valid syntax |
| cjs `scan script matches all four documented pin shapes and bumps them to latest, leaving unrelated version: keys untouched` | `freshness` › embedded scan script behavior › matches all four documented pin shapes and bumps them to latest, leaving unrelated version: keys untouched |
| cjs `scan script bumps setup-wp with: version (shape 3) in isolation` | `freshness` › embedded scan script behavior › bumps setup-wp with: version (shape 3) in isolation |
| cjs `scan script is idempotent: no-op and no PR body when every pin is already at latest` | `freshness` › embedded scan script behavior › is idempotent: no-op and no PR body when every pin is already at latest |
| cjs `scan script fails loudly (does not silently pass) when zero agent-kit pins are found` | `freshness` › embedded scan script behavior › fails loudly (does not silently pass) when zero agent-kit pins are found |
| cjs `deploy GitHub auth is explicit, opt-in, and scoped to the deploy step` | `production-auth` › cloudflare-production.yml GitHub auth › is explicit, opt-in, and scoped to the deploy step |
| *(new — closes the divergent-regex gap)* | `freshness` › heredoc stripping › also removes `cat >` heredocs, which the previous node:test regex missed |
| *(new — Task 2.4)* | `workflow-shape` › toolchain exceptions › agent-kit-freshness.yml declares exactly workflow_call and workflow_dispatch, never a schedule |

**Acceptance:**

- [x] Every invariant from the 22 Ruby tests and 11 Node tests has a named counterpart in the Bun suites (mapping recorded in this task)
- [x] Zero npm dependencies and no `package.json` required
- [x] Old and new suites both pass in the same CI run

**Verification:** all three suites green in the same worktree, same commit
(`7b1c247`):
`ruby -Itest test/workflow_contract_test.rb` → **24 runs, 451 assertions, 0
failures, 0 errors, 0 skips**;
`node --test .github/workflows/*.contract.test.cjs` → **11 pass, 0 fail**;
`bun test` → **39 pass, 0 fail, 343 expect() calls, 3 files**.
`self-test.yml` ran all three as separate named steps for exactly this commit.
No `package.json` exists anywhere in the repo — `bun test` discovers
`test/*.test.ts` with no manifest.

#### [qa] Task 2.3: Delete the Ruby and node:test suites

**Status:** done

**Depends:** Task 2.2

**Files:**

- Delete: `test/workflow_contract_test.rb`, `.github/workflows/*.contract.test.cjs`
- Modify: `.github/workflows/self-test.yml`, `README.md`

**Acceptance:**

- [x] `self-test.yml` installs only Bun (pinned `oven-sh/setup-bun`) and runs `bun test`
- [x] Repo contains zero Ruby and zero `node:test` files
- [x] README documents the single prerequisite and the one command
- [x] `bun test` green in CI

**Verification:** `self-test.yml` is now pinned `actions/checkout@93cb6efe…` (v5)
+ pinned `oven-sh/setup-bun@0c5077e5…` (v2) + one `run: bun test` step;
`ruby/setup-ruby` and `actions/setup-node` are gone. `git ls-files | grep -E
'\.rb$|contract\.test\.cjs'` → no matches; `find . -name '*.rb'` (excluding
`.git`) → no matches. `bun test` → **39 pass, 0 fail, 341 expect() calls**
(343 → 341 because the deleted `self-test.yml` steps removed two `uses:` values
from the repo-wide pin sweep). Documentation landed as a README
`## Contributing: the contract tests` section (fewer files than a separate
CONTRIBUTING.md) stating the single prerequisite — Bun >= 1.2 — and the single
command, `bun test`.

`node` is still required *inside* the tests (it executes the workflows'
embedded scripts, matching the Actions runtime) but is no longer installed by
the gate: it ships preinstalled on `ubuntu-latest`. This is documented in both
the workflow header comment and the README section.

**Bite proof:** unpinning a `uses:` — `actions/checkout@93cb6efe…` →
`actions/checkout@v5` in `self-test.yml` — produced

```
error: expected full SHA pin for actions/checkout@v5 in …/.github/workflows/self-test.yml
Expected substring or pattern: /@[0-9a-f]{40}$/u
Received: "actions/checkout@v5"
(fail) repo-wide pin and prose contracts > all workflow and action uses are full SHA pins
```

Restoring the pin returned 39 pass / 0 fail.

#### [docs] Task 2.4: Correct the "scheduled" claim for the freshness workflow

**Status:** done

**Depends:** Task 2.3

`README.md` describes `agent-kit-freshness.yml` as a scheduled workflow, but it declares only `workflow_call` and `workflow_dispatch` — the caller supplies the schedule. Adding a `schedule:` trigger here would run it against this library rather than the consumer, so the README is what is wrong. Pin the trigger set in a contract test so prose and workflow cannot diverge silently again.

**Files:**

- Modify: `README.md`, `test/workflow-shape.test.ts`

**Acceptance:**

- [x] README describes it as a caller-scheduled reusable workflow
- [x] A contract test pins the exact trigger set

**Verification:** README now states the workflow "is a **caller-scheduled
reusable workflow**: it declares only `workflow_call` and `workflow_dispatch`,
so it has no `schedule:` trigger of its own. The cadence lives in the caller's
workflow", and the adoption snippet is introduced as "Add a tiny caller workflow
— this is where the schedule lives". The new test
`workflow-shape › toolchain exceptions › agent-kit-freshness.yml declares
exactly workflow_call and workflow_dispatch, never a schedule` asserts
`Object.keys(on).sort() === ["workflow_call", "workflow_dispatch"]` **and** that
the README contains the phrase `caller-scheduled reusable workflow`, so neither
side can drift alone.

**Bite proof:** inserting `schedule: - cron: "0 6 * * 1"` into
`agent-kit-freshness.yml` produced

```
error: expect(received).toStrictEqual(expected)
+   "schedule",
    "workflow_call",
(fail) toolchain exceptions > agent-kit-freshness.yml declares exactly workflow_call and workflow_dispatch, never a schedule
```

(the pre-existing regex-based trigger test in `freshness.test.ts` went red too).
Removing the trigger returned 39 pass / 0 fail.

## Verification gates

| Gate | Command | Success criteria |
| ---- | ------- | ---------------- |
| Structural contracts | `ruby -Itest test/workflow_contract_test.rb` (until Task 2.3) | 0 failures |
| Behavioral contracts | `node --test .github/workflows/*.contract.test.cjs` (until Task 2.3) | 0 failures |
| Unified suite | `bun test` (from Task 2.2) | 0 failures |
| Gate bites | Break a contract on a scratch branch | CI goes red |

## Edge cases and error handling

| Edge case | Risk | Solution | Task |
| --------- | ---- | -------- | ---- |
| `self-test.yml` breaks the toolchain-required invariant | Suite goes red on the PR that adds the gate | Register in `NON_TOOLCHAIN_WORKFLOWS` in the same PR | 1.2 |
| File named `.yaml` instead of `.yml` | Silently evades the full-SHA-pin contract (glob is `*.yml`) | Named `.yml`; pin test covers it | 1.1 |
| Freshness scan rewrites the new workflow | Unintended auto-bump PRs | Scan matches only agent-kit pin shapes (`AGENT_KIT_VERSION=`, setup-wp `version:`, composite `agent-kit-version:` default); `self-test.yml` has none — verified, no defensive exclusion needed | 1.1 |
| Port loses an invariant | Silent coverage regression | Co-execution of old and new suites in one CI run before deletion | 2.2 |
| Bun's YAML parser disagrees with Psych on `on:` | Ported trigger assertions read `undefined` and vacuously pass | Observed and handled: `Bun.YAML` keeps the key as the string `"on"`, Psych coerces to boolean `true`. `onSection()` accepts either and `asRecord` **throws** rather than returning `undefined`, so a future divergence fails loudly | 2.2 |
| `node` dropped from the gate but still used by tests | Embedded-script tests fail on a runner without node | `ubuntu-latest` preinstalls Node; documented in the workflow header and README | 2.3 |

## Non-goals

- Adopting a third test framework or an external workflow linter as the primary gate (`actionlint`/`zizmor` remain optional supplements, never replacements for the custom invariants).
- Changing any reusable workflow's runtime behavior. This arc is test-and-gate only.
- Fixing the pre-existing task-ID drift in this repo's older blueprints (`#### Task T1:` does not match the canonical `#### Task X.Y:` grammar, so those blueprints parse as zero-task). Observed, recorded here, out of scope.

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Bun's YAML parser disagrees with Psych on a workflow edge case | Ported assertions silently weaken | Co-execution in Task 2.2 makes any disagreement a visible failure before the Ruby suite is deleted — and it did surface one (`on:` key type), handled in `onSection()` |
| Contributors on Ruby muscle memory | Confusion after deletion | README `## Contributing: the contract tests` documents the single prerequisite and command in Task 2.3 |
