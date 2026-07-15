# Caller-controlled agent-kit version

## Outcome

Make every reusable workflow that installs `wp` use one immutable
`setup-wp` action, hosted in this public repo so callers outside the
`webpresso` GitHub org can resolve it. Consumer repositories adopt a new
shared-workflow revision by bumping the action's commit SHA and, separately,
the `version` input they pass it — no per-job install block duplicated
across workflows.

## Scope

- Inventory every reusable workflow under `.github/workflows/` that installs
  `@webpresso/agent-kit`, including the release and Cloudflare preview
  workflows consumed by `aksaprocess.tr`.
- Install `wp` globally through a `setup-wp` composite action **hosted in
  this repo** (not the private `webpresso/agent-kit` repo, whose Actions
  cannot be shared with out-of-org callers) pinned to an immutable commit,
  taking an explicit, caller-supplied `version` input.
- Keep Vite+ setup and all third-party action references immutable.
- Document the public action host and caller-versioned contract.
- Add discovery-based regression tests so a new reusable workflow cannot
  reintroduce a hidden or stale agent-kit pin, or drop the version input.

## Constraints

- Do not add `@webpresso/agent-kit` as a consumer repository dependency.
- Install the exact published semantic version the caller supplies via the
  action's `version` input; consumers do not provide ranges or dist-tags.
- Preserve existing workflow defaults and caller compatibility.

## Tasks

- [x] Replace every inline agent-kit global package spec with the pinned,
  caller-versioned `setup-wp` action.
- [x] Add discovery-based workflow contract coverage for the immutable
  action pin, the required `version` input, and absence of inline agent-kit
  specs or a duplicated workflow-level version input.
- [x] Update the README with the public-host, caller-versioned contract.
- [x] Run the repository contract suite and syntax/static validation.

## Acceptance criteria

- Every reusable workflow that invokes `wp` uses the same immutable
  `webpresso/github-actions/.github/actions/setup-wp@<full-commit-sha>`
  reference (hosted in this public repo, not the private agent-kit repo).
- Every such invocation passes an explicit `with: version:` matching the
  exact published `@webpresso/agent-kit` semver the caller intends.
- No reusable workflow exposes or passes a duplicated `agent_kit_version`
  workflow-level input.
- No reusable workflow contains an inline `@webpresso/agent-kit@<version>`
  installation spec.
- All action references remain full 40-character commit SHAs.
- `ruby test/workflow_contract_test.rb` passes.

## Verification

```bash
ruby test/workflow_contract_test.rb
actionlint -no-color .github/workflows/*.yml
git diff --check
```

## Revision note

The original version of this blueprint (drafted 2026-07-11) specified an
immutable action **hosted in the private `webpresso/agent-kit` repo**, which
"self-resolves its exact published version from the owning agent-kit
release" with no caller-supplied version input. That design does not work:
GitHub does not allow a private repo to grant Actions-resolution access to
callers outside its own organization, so every consumer repository outside
the `webpresso` org (`ozby/ingest-lens`, `ozby/edge-matte`,
`ozby/aksaprocess.tr`) failed CI at "Set up job" with `Unable to resolve
action 'webpresso/agent-kit', not found`. This revision corrects the design:
the action is hosted in this public repo (`webpresso/github-actions#23`,
merged as `c2c71a7`), and requires an explicit caller-supplied `version`
input rather than self-resolving one, since there is no owning package.json
to read from outside agent-kit's own repo.
