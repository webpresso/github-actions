---
type: blueprint
title: "Bun-only contract tests behind a real CI gate"
status: in-progress
complexity: M
owner: "claude"
created: "2026-07-25"
last_updated: "2026-07-25"
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

**Status:** todo

**Depends:** Task 1.2

Both suites hardcode `setup-wp@c2c71a7a…`, the toolchain SHA, and `3.1.17`. Those constants make the test files sites 9–13 of a value that already lives at 8 irreducible YAML sites, so every freshness bump PR has to edit tests. Replace the literal expectations with assertions that every workflow site carries the *same* value and that the value is full-SHA / semver shaped. Fixture SHAs inside the freshness contract test stay literal — they are inputs, not assertions.

**Files:**

- Modify: `test/workflow_contract_test.rb`
- Modify: `.github/workflows/agent-kit-freshness.contract.test.cjs`

**Acceptance:**

- [ ] No test asserts a literal setup-wp SHA, toolchain SHA, or agent-kit version
- [ ] Cross-site consistency and value shape are asserted instead
- [ ] A hand-edited single-site drift fails the suite
- [ ] Both suites pass

#### [qa] Task 2.2: Port both suites to `bun:test` under `test/`

**Status:** todo

**Depends:** Task 2.1

Port `test/workflow_contract_test.rb` and the two `*.contract.test.cjs` files into `test/*.test.ts` running under `bun test`, sharing one `test/helpers.ts` (workflow loading via `Bun.YAML.parse`, `allUses`, one unified heredoc extractor, fixture-repo builders). Adopt the Ruby heredoc regex — it also matches `cat >` heredocs, which the Node one misses. Embedded workflow scripts continue to execute under `node`, matching the Actions runtime. Keep the old suites in `self-test.yml` for this task so both run in the same CI job and parity is proven by co-execution.

**Files:**

- Create: `test/helpers.ts`, `test/workflow-shape.test.ts`, `test/freshness.test.ts`, `test/production-auth.test.ts`
- Modify: `.github/workflows/self-test.yml`

**Acceptance:**

- [ ] Every invariant from the 22 Ruby tests and 11 Node tests has a named counterpart in the Bun suites (mapping recorded in this task)
- [ ] Zero npm dependencies and no `package.json` required
- [ ] Old and new suites both pass in the same CI run

#### [qa] Task 2.3: Delete the Ruby and node:test suites

**Status:** todo

**Depends:** Task 2.2

**Files:**

- Delete: `test/workflow_contract_test.rb`, `.github/workflows/*.contract.test.cjs`
- Modify: `.github/workflows/self-test.yml`, `README.md`

**Acceptance:**

- [ ] `self-test.yml` installs only Bun (pinned `oven-sh/setup-bun`) and runs `bun test`
- [ ] Repo contains zero Ruby and zero `node:test` files
- [ ] README documents the single prerequisite and the one command
- [ ] `bun test` green in CI

#### [docs] Task 2.4: Correct the "scheduled" claim for the freshness workflow

**Status:** todo

**Depends:** Task 2.3

`README.md` describes `agent-kit-freshness.yml` as a scheduled workflow, but it declares only `workflow_call` and `workflow_dispatch` — the caller supplies the schedule. Adding a `schedule:` trigger here would run it against this library rather than the consumer, so the README is what is wrong. Pin the trigger set in a contract test so prose and workflow cannot diverge silently again.

**Files:**

- Modify: `README.md`, `test/workflow-shape.test.ts`

**Acceptance:**

- [ ] README describes it as a caller-scheduled reusable workflow
- [ ] A contract test pins the exact trigger set

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

## Non-goals

- Adopting a third test framework or an external workflow linter as the primary gate (`actionlint`/`zizmor` remain optional supplements, never replacements for the custom invariants).
- Changing any reusable workflow's runtime behavior. This arc is test-and-gate only.
- Fixing the pre-existing task-ID drift in this repo's older blueprints (`#### Task T1:` does not match the canonical `#### Task X.Y:` grammar, so those blueprints parse as zero-task). Observed, recorded here, out of scope.

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Bun's YAML parser disagrees with Psych on a workflow edge case | Ported assertions silently weaken | Co-execution in Task 2.2 makes any disagreement a visible failure before the Ruby suite is deleted |
| Contributors on Ruby muscle memory | Confusion after deletion | README documents the single prerequisite and command in Task 2.3 |
