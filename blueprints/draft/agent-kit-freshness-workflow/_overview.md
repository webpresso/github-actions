---
type: blueprint
title: "agent-kit freshness workflow"
status: draft
complexity: M
owner: "webpresso"
created: "2026-07-24"
last_updated: "2026-07-24"
tags:
  - "github-actions"
  - "agent-kit"
  - "dependency-freshness"
---

# agent-kit freshness workflow

## Product wedge anchor

- **Stage outcome:** Reference consumers of webpresso/github-actions reusable workflows (ingest-lens, edge-matte, aksaprocess.tr, framework, monorepo) currently must manually notice and hand-bump stale @webpresso/agent-kit pins scattered across their own workflow YAML; nothing else in the ecosystem watches these pins (Renovate is not installed on these orgs, and Dependabot cannot read a version out of arbitrary workflow YAML).
- **Consuming surface:** New reusable workflow .github/workflows/agent-kit-freshness.yml (on: workflow_call + workflow_dispatch) that any consumer repo adopts via a 4-line scheduled caller workflow (see README.md caller stanza).
- **New user-visible capability:** A consumer repo maintainer gets an automatically opened (and kept up to date) pull request bumping every pinned @webpresso/agent-kit reference to the latest published npm version, instead of having to notice and hand-edit stale pins.

## Summary

Add a scheduled reusable workflow that resolves the latest published @webpresso/agent-kit version from npm, scans the calling repo's own .github/**/*.yml|.yaml files for the four known pin shapes (env/shell assignment, shell default, setup-wp `with: version:` input, composite agent-kit-version input default), and opens or updates a single idempotent PR bumping every stale pin. Fails loudly (non-zero exit) instead of silently passing when zero pins are found in a repo that called it. Uses only the caller's own GITHUB_TOKEN; never runs `wp setup`; does not touch setup-wp's exact-version install contract; deliberately does not pull in the shared setup-webpresso-toolchain action (npm + git + gh only). Covered by a node:test contract test (agent-kit-freshness.contract.test.cjs) following the cloudflare-production.contract.test.cjs precedent, plus updates to test/workflow_contract_test.rb documenting the deliberate shared-toolchain exception.

#### Task T1: Add .github/workflows/agent-kit-freshness.yml

**Status:** done

**Acceptance:**
- [x] Declares both workflow_call and workflow_dispatch triggers
- [x] Job permissions are contents: write and pull-requests: write only
- [x] Every third-party action reference is pinned by full 40-character commit SHA
- [x] Uses a fixed idempotent branch name (chore/bump-agent-kit-version) and edits an existing open PR instead of duplicating it
- [x] Relies only on the caller's secrets.GITHUB_TOKEN (no PAT, no GitHub App)

#### Task T2: Add .github/workflows/agent-kit-freshness.contract.test.cjs

**Status:** done

**Acceptance:**
- [x] Extracts and syntax-checks the embedded scan script via node --check
- [x] Verifies all four documented pin shapes are matched and bumped against real-world fixtures
- [x] Verifies unrelated version:/release_version: keys are left untouched
- [x] Verifies the scan is idempotent (changed=false, pins_bumped=0) once every pin is already at latest
- [x] Verifies the scan script exits non-zero with a clear error when zero agent-kit pins are found
- [x] node --test .github/workflows/agent-kit-freshness.contract.test.cjs passes (8/8)

#### Task T3: Update test/workflow_contract_test.rb for the new workflow

**Status:** done

**Acceptance:**
- [x] agent-kit-freshness.yml is excluded from the shared-toolchain invariant with a documented NON_TOOLCHAIN_WORKFLOWS reason, not a silent gap
- [x] A positive test asserts the exclusion is deliberate: workflow_call + workflow_dispatch triggers exist, contents/pull-requests permissions are write, and it does NOT use setup-webpresso-toolchain or setup-wp
- [x] ruby test/workflow_contract_test.rb passes (21 runs, 0 failures)

#### Task T4: Document the caller stanza and behavior contract in README.md

**Status:** done

**Acceptance:**
- [x] README lists agent-kit-freshness.yml under Current workflows
- [x] README shows the minimal caller stanza: a 4-ish line scheduled workflow with schedule + workflow_dispatch triggers, contents/pull-requests write permissions, and a uses: pin
- [x] README states the zero-pins-fails-loudly behavior and the GITHUB_TOKEN-only auth contract

#### Task T5: Validate the whole change set

**Status:** done

**Acceptance:**
- [x] actionlint -no-color .github/workflows/agent-kit-freshness.yml is clean
- [x] ruby test/workflow_contract_test.rb passes
- [x] node --test .github/workflows/agent-kit-freshness.contract.test.cjs passes
