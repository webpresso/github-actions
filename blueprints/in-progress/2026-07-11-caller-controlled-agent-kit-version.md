# Caller-controlled agent-kit version

## Outcome

Make every reusable workflow that installs `wp` accept one exact caller-controlled
`@webpresso/agent-kit` version while retaining a centrally owned default. Consumer
repositories can then adopt a new shared-workflow revision without copying an
agent-kit installation block into every job or workflow.

## Scope

- Inventory every reusable workflow under `.github/workflows/` that installs
  `@webpresso/agent-kit`, including the release and Cloudflare preview workflows
  consumed by `aksaprocess.tr`.
- Add an `agent_kit_version` `workflow_call` input with the current published
  default `3.1.10` to every such workflow.
- Install `wp` globally through the published `setup-wp` composite action pinned
  to commit `b112795412048280c49b0bd8f8cc94d2f9428d71`.
- Keep Vite+ setup and all third-party action references immutable.
- Document the caller override and global-only dependency contract.
- Add discovery-based regression tests so a new reusable workflow cannot
  reintroduce a hidden or stale agent-kit pin.

## Constraints

- Do not add `@webpresso/agent-kit` as a consumer repository dependency.
- Accept exact published semantic versions only; the pinned `setup-wp` action
  owns validation and rejects ranges and dist-tags.
- Preserve existing workflow defaults and caller compatibility.
- Do not publish or merge from this change.

## Tasks

- [x] Replace every inline agent-kit global package spec with the pinned
  `setup-wp` action and the reusable workflow input.
- [x] Add discovery-based workflow contract coverage for the version input,
  immutable action pin, and absence of inline agent-kit specs.
- [x] Update the README with the caller migration contract.
- [x] Run the repository contract suite and syntax/static validation available
  in this repository.

## Acceptance criteria

- Every reusable workflow that invokes `wp` exposes `agent_kit_version` as a
  string input defaulting to `3.1.10`.
- Every such workflow passes that input to
  `webpresso/agent-kit/.github/actions/setup-wp@b112795412048280c49b0bd8f8cc94d2f9428d71`.
- No reusable workflow contains an inline `@webpresso/agent-kit@<version>`
  installation spec.
- Existing callers that omit the new input receive `3.1.10`; callers may pin a
  different exact published version once at each reusable-workflow call site.
- All action references remain full 40-character commit SHAs.
- `ruby test/workflow_contract_test.rb` passes.

## Verification

```bash
ruby test/workflow_contract_test.rb
actionlint -no-color .github/workflows/*.yml
git diff --check
```
