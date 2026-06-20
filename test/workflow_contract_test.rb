require "minitest/autorun"
require "yaml"

class WorkflowContractTest < Minitest::Test
  REPO_ROOT = File.expand_path("..", __dir__)
  WORKFLOW_PREVIEW = File.join(REPO_ROOT, ".github", "workflows", "cloudflare-preview.yml")
  WORKFLOW_PRODUCTION = File.join(REPO_ROOT, ".github", "workflows", "cloudflare-production.yml")
  WORKFLOW_RELEASE = File.join(REPO_ROOT, ".github", "workflows", "changesets-release.yml")
  ACTION_TOOLCHAIN = File.join(REPO_ROOT, ".github", "actions", "setup-webpresso-toolchain", "action.yml")

  def test_preview_workflow_bootstrap_contract_and_pins
    workflow = load_yaml(WORKFLOW_PREVIEW)
    refute_includes File.read(WORKFLOW_PREVIEW), "skip_when_ci_secret_missing"
    refute_includes File.read(WORKFLOW_PREVIEW), "secret_env_profile"
    assert_equal "string", workflow_call_inputs(workflow).dig("secret_profile", "type")
    assert_equal false, workflow_call_secrets(workflow).dig("ci_secret_provider_token", "required")
    assert_equal "write", workflow.dig("jobs", "preview", "permissions", "id-token")
    assert_step_uses(WORKFLOW_PREVIEW, "dopplerhq/secrets-fetch-action@451892f16195f9ac360e1a5bcbf0b5fd0e957534")
    refute_includes File.read(WORKFLOW_PREVIEW), "__DIRECT_SECRET__"
  end

  def test_production_workflow_bootstrap_contract_and_pins
    workflow = load_yaml(WORKFLOW_PRODUCTION)
    refute_includes File.read(WORKFLOW_PRODUCTION), "secret_env_profile"
    assert_equal "string", workflow_call_inputs(workflow).dig("secret_profile", "type")
    assert_equal false, workflow_call_secrets(workflow).dig("ci_secret_provider_token", "required")
    assert_equal "write", workflow.dig("jobs", "production", "permissions", "id-token")
    assert_step_uses(WORKFLOW_PRODUCTION, "dopplerhq/secrets-fetch-action@451892f16195f9ac360e1a5bcbf0b5fd0e957534")
    refute_includes File.read(WORKFLOW_PRODUCTION), "__DIRECT_SECRET__"
  end

  def test_release_workflow_uses_shared_toolchain_setup
    workflow = load_yaml(WORKFLOW_RELEASE)
    steps = workflow.dig("jobs", "release", "steps")
    assert_includes extract_uses(steps), "webpresso/github-actions/.github/actions/setup-webpresso-toolchain@0b8eca2d5b7079f0b1432371a375ae9928596f4d"
    refute_includes File.read(WORKFLOW_RELEASE), "Resolve caller pnpm version"
  end

  def test_changesets_release_references_existing_shared_toolchain_action
    expected_ref = "webpresso/github-actions/.github/actions/setup-webpresso-toolchain@0b8eca2d5b7079f0b1432371a375ae9928596f4d"
    assert_includes extract_uses(load_yaml(WORKFLOW_RELEASE).dig("jobs", "release", "steps")), expected_ref
    assert system("git", "cat-file", "-e", "0b8eca2d5b7079f0b1432371a375ae9928596f4d:.github/actions/setup-webpresso-toolchain/action.yml", chdir: REPO_ROOT), "expected pinned setup-webpresso-toolchain action to exist at 0b8eca2d5b7079f0b1432371a375ae9928596f4d"
  end

  def test_shared_toolchain_action_is_fully_pinned
    action = load_yaml(ACTION_TOOLCHAIN)
    assert_equal "composite", action.dig("runs", "using")
    assert_equal "true", action.dig("inputs", "install-wp", "default")
    assert_equal "@webpresso/agent-kit@latest", action.dig("inputs", "wp-package", "default")
    uses_values = extract_uses(action.dig("runs", "steps"))
    assert_includes uses_values, "pnpm/action-setup@0e279bb959325dab635dd2c09392533439d90093"
    assert_includes uses_values, "actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444"
    assert_includes uses_values, "actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e"
    assert_includes uses_values, "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6"
    uses_values.each do |value|
      next if value.start_with?("./")
      assert_match(/@[a-f0-9]{40}\z/, value, "expected full SHA pin for #{value}")
    end
  end

  def test_readme_describes_oidc_only_contract
    readme = File.read(File.join(REPO_ROOT, "README.md"))
    assert_includes readme, "repo-owned secret profiles"
    assert_includes readme, "ci_secret_provider_token"
    assert_includes readme, "full commit SHA"
  end

  private

  def load_yaml(path)
    YAML.load_file(path)
  end

  def extract_uses(steps)
    Array(steps).map { |step| step["uses"] }.compact
  end

  def assert_step_uses(path, expected_uses)
    workflow = load_yaml(path)
    steps =
      workflow.fetch("jobs").values.flat_map do |job|
        Array(job["steps"])
      end
    assert_includes extract_uses(steps), expected_uses
  end

  def workflow_call_inputs(workflow)
    on_section = workflow["on"] || workflow[true]
    on_section.fetch("workflow_call").fetch("inputs")
  end

  def workflow_call_secrets(workflow)
    on_section = workflow["on"] || workflow[true]
    on_section.fetch("workflow_call").fetch("secrets")
  end
end
