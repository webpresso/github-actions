# Owner-controlled agent-kit version

## Outcome

Make every reusable workflow that installs `wp` use one immutable, self-versioning
agent-kit setup action. Consumer repositories can then adopt a new shared-workflow
revision without copying an agent-kit version or installation block into every
job or workflow.

## Scope

- Inventory every reusable workflow under `.github/workflows/` that installs
  `@webpresso/agent-kit`, including the release and Cloudflare preview workflows
  consumed by `aksaprocess.tr`.
- Install `wp` globally through a published `setup-wp` composite action pinned
  to the immutable commit that owns and derives its package version.
- Keep Vite+ setup and all third-party action references immutable.
- Document the owner-versioned action and global-only dependency contract.
- Add discovery-based regression tests so a new reusable workflow cannot
  reintroduce a hidden or stale agent-kit pin.

## Constraints

- Do not add `@webpresso/agent-kit` as a consumer repository dependency.
- Install the exact published semantic version owned by the pinned `setup-wp`
  action; consumers do not provide ranges, dist-tags, or duplicate pins.
- Preserve existing workflow defaults and caller compatibility.
- Do not publish or merge from this change.

## Tasks

- [x] Replace every inline agent-kit global package spec with the pinned,
  self-versioning `setup-wp` action.
- [x] Add discovery-based workflow contract coverage for the immutable action
  pin and absence of inline agent-kit specs or version inputs.
- [x] Update the README with the caller migration contract.
- [x] Run the repository contract suite and syntax/static validation available
  in this repository.

## Acceptance criteria

- Every reusable workflow that invokes `wp` uses the same immutable
  `webpresso/agent-kit/.github/actions/setup-wp@<full-commit-sha>` reference.
- No reusable workflow exposes or passes a duplicated agent-kit version input.
- No reusable workflow contains an inline `@webpresso/agent-kit@<version>`
  installation spec.
- Existing callers require no new inputs; updating the reusable-workflow commit
  picks up the owner-selected agent-kit release.
- All action references remain full 40-character commit SHAs.
- `ruby test/workflow_contract_test.rb` passes.

## Verification

```bash
ruby test/workflow_contract_test.rb
actionlint -no-color .github/workflows/*.yml
git diff --check
```
