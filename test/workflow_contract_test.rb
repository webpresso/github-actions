require "minitest/autorun"
require "yaml"

class WorkflowContractTest < Minitest::Test
  REPO_ROOT = File.expand_path("..", __dir__)
  WORKFLOW_PREVIEW = File.join(REPO_ROOT, ".github", "workflows", "cloudflare-preview.yml")
  WORKFLOW_PRODUCTION = File.join(REPO_ROOT, ".github", "workflows", "cloudflare-production.yml")
  WORKFLOW_RELEASE = File.join(REPO_ROOT, ".github", "workflows", "changesets-release.yml")
  WORKFLOW_CI = File.join(REPO_ROOT, ".github", "workflows", "webpresso-ci.yml")
  WORKFLOW_SECURITY = File.join(REPO_ROOT, ".github", "workflows", "webpresso-security.yml")
  ACTION_TOOLCHAIN = File.join(REPO_ROOT, ".github", "actions", "setup-webpresso-toolchain", "action.yml")

  def test_preview_workflow_bootstrap_contract_and_pins
    workflow = load_yaml(WORKFLOW_PREVIEW)
    refute_includes File.read(WORKFLOW_PREVIEW), "skip_when_ci_secret_missing"
    refute_includes File.read(WORKFLOW_PREVIEW), "secret_env_profile"
    assert_equal "string", workflow_call_inputs(workflow).dig("secret_profile", "type")
    assert_equal false, workflow_call_secrets(workflow).dig("ci_secret_provider_token", "required")
    assert_equal "string", workflow_call_inputs(workflow).dig("doppler_identity_id", "type")
    assert_equal "string", workflow_call_inputs(workflow).dig("infisical_identity_id", "type")
    assert_equal "write", workflow.dig("jobs", "preview", "permissions", "id-token")
    assert_step_uses(WORKFLOW_PREVIEW, "DopplerHQ/secrets-fetch-action@451892f16195f9ac360e1a5bcbf0b5fd0e957534")
    assert_step_uses(WORKFLOW_PREVIEW, "Infisical/secrets-action@77ab1f4ccd183a543cb5b42435fbd181189f4995")
    assert_step_uses(WORKFLOW_PREVIEW, "webpresso/github-actions/.github/actions/setup-webpresso-toolchain@0f82e2717c0e406ac25212f696fe3ba6fd9f851d")
    refute_includes File.read(WORKFLOW_PREVIEW), "__DIRECT_SECRET__"
  end

  def test_production_workflow_bootstrap_contract_and_pins
    workflow = load_yaml(WORKFLOW_PRODUCTION)
    refute_includes File.read(WORKFLOW_PRODUCTION), "secret_env_profile"
    assert_equal "string", workflow_call_inputs(workflow).dig("secret_profile", "type")
    assert_equal false, workflow_call_secrets(workflow).dig("ci_secret_provider_token", "required")
    assert_equal "string", workflow_call_inputs(workflow).dig("doppler_identity_id", "type")
    assert_equal "string", workflow_call_inputs(workflow).dig("infisical_identity_id", "type")
    assert_equal "write", workflow.dig("jobs", "production", "permissions", "id-token")
    assert_step_uses(WORKFLOW_PRODUCTION, "DopplerHQ/secrets-fetch-action@451892f16195f9ac360e1a5bcbf0b5fd0e957534")
    assert_step_uses(WORKFLOW_PRODUCTION, "Infisical/secrets-action@77ab1f4ccd183a543cb5b42435fbd181189f4995")
    assert_step_uses(WORKFLOW_PRODUCTION, "webpresso/github-actions/.github/actions/setup-webpresso-toolchain@0f82e2717c0e406ac25212f696fe3ba6fd9f851d")
    refute_includes File.read(WORKFLOW_PRODUCTION), "__DIRECT_SECRET__"
  end



  def test_deploy_workflows_map_direct_secret_inputs_to_job_env
    { WORKFLOW_PREVIEW => "preview", WORKFLOW_PRODUCTION => "production" }.each do |path, job_name|
      workflow = load_yaml(path)
      env = workflow.dig("jobs", job_name, "env")
      {
        "CLOUDFLARE_ACCOUNT_ID" => "${{ secrets.cloudflare_account_id }}",
        "CLOUDFLARE_API_TOKEN" => "${{ secrets.cloudflare_api_token }}",
        "CLOUDFLARE_ZONE_ID" => "${{ secrets.cloudflare_zone_id }}",
        "NEON_API_KEY" => "${{ secrets.neon_api_key }}",
        "NEON_PROJECT_ID" => "${{ secrets.neon_project_id }}",
        "NEON_PARENT_BRANCH_ID" => "${{ secrets.neon_parent_branch_id }}",
        "PULUMI_ACCESS_TOKEN" => "${{ secrets.pulumi_access_token }}",
        "BETTER_AUTH_SECRET" => "${{ secrets.better_auth_secret }}",
        "JWT_SECRET" => "${{ secrets.jwt_secret }}",
        "LANGFUSE_PUBLIC_KEY" => "${{ secrets.langfuse_public_key }}",
        "LANGFUSE_SECRET_KEY" => "${{ secrets.langfuse_secret_key }}",
      }.each do |name, expression|
        assert_equal expression, env.fetch(name), "#{path} should expose direct secret #{name}"
      end
    end
  end


  def test_deploy_workflows_skip_provider_fetch_when_direct_secrets_are_supplied
    [WORKFLOW_PREVIEW, WORKFLOW_PRODUCTION].each do |path|
      contents = File.read(path)
      assert_includes contents, "id: direct_secrets"
      assert_includes contents, "DIRECT_SECRETS_PRESENT: ${{ steps.direct_secrets.outputs.present }}"
      assert_includes contents, "steps.direct_secrets.outputs.present != 'true' && steps.secret_config.outputs.manager == 'doppler'"
      assert_includes contents, "steps.direct_secrets.outputs.present != 'true' && steps.secret_config.outputs.manager == 'infisical'"
      assert_includes contents, 'if [[ "${DIRECT_SECRETS_PRESENT}" != "true" && "${TOKEN_PRESENT}" != "true" && -z "${DOPPLER_IDENTITY_ID}" ]]; then'
    end
  end

  def test_deploy_workflows_accept_legacy_secret_metadata_without_profiles
    [WORKFLOW_PREVIEW, WORKFLOW_PRODUCTION].each do |path|
      contents = File.read(path)
      assert_includes contents, 'if (payload?.schemaVersion === 1) {'
      assert_includes contents, 'const defaultProvider = payload?.providers?.default;'
      assert_includes contents, 'manager = defaultProvider?.type;'
      assert_includes contents, 'projectId = defaultProvider?.project;'
      assert_includes contents, 'manager = payload?.manager;'
      assert_includes contents, 'projectId = payload?.projectId;'
      assert_includes contents, 'const hasProfiles = typeof profiles === "object" && profiles !== null && !Array.isArray(profiles);'
      assert_includes contents, 'const environment = hasProfiles ? profile?.environment : secretProfile;'
      assert_includes contents, 'Unknown secret profile "${secretProfile}"'
    end
  end

  def test_release_workflow_uses_shared_toolchain_setup
    workflow = load_yaml(WORKFLOW_RELEASE)
    steps = workflow.dig("jobs", "release", "steps")
    assert_includes extract_uses(steps), "webpresso/github-actions/.github/actions/setup-webpresso-toolchain@0f82e2717c0e406ac25212f696fe3ba6fd9f851d"
    refute_includes File.read(WORKFLOW_RELEASE), "Resolve caller pnpm version"
  end

  def test_shared_toolchain_action_is_fully_pinned
    action = load_yaml(ACTION_TOOLCHAIN)
    assert_equal "composite", action.dig("runs", "using")
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


  def test_shared_ci_and_security_do_not_duplicate_cli_global_install_blocks
    [WORKFLOW_CI, WORKFLOW_SECURITY].each do |path|
      contents = File.read(path)
      refute_includes contents, "/tmp/webpresso-cli-globals", "#{path} should use setup-webpresso-toolchain cli-global-packages instead of temp-file bootstrap"
      refute_match(/npm\s+install\s+-g\s+\$\(cat\s+[^)]*\)/, contents, "#{path} should not install globals from cat output inline")
    end

    ci = load_yaml(WORKFLOW_CI)
    ci_toolchain_steps = all_steps(ci).select { |step| step["uses"] == "webpresso/github-actions/.github/actions/setup-webpresso-toolchain@0f82e2717c0e406ac25212f696fe3ba6fd9f851d" }
    assert_equal 4, ci_toolchain_steps.length
    ci_toolchain_steps.each do |step|
      assert_equal "vite-plus @webpresso/agent-kit@2.4.1", step.dig("with", "cli-global-packages")
    end

    security = load_yaml(WORKFLOW_SECURITY)
    security_toolchain_steps = all_steps(security).select { |step| step["uses"] == "webpresso/github-actions/.github/actions/setup-webpresso-toolchain@0f82e2717c0e406ac25212f696fe3ba6fd9f851d" }
    assert_equal 1, security_toolchain_steps.length
    assert_equal "vite-plus @webpresso/agent-kit@2.4.1", security_toolchain_steps.first.dig("with", "cli-global-packages")
  end

  def test_all_workflow_and_action_uses_are_full_sha_pins
    Dir.glob(File.join(REPO_ROOT, ".github", "{workflows,actions}", "**", "*.yml")).each do |path|
      uses_values = all_uses(load_yaml(path))
      uses_values.each do |value|
        next if value.start_with?("./")
        assert_match(/@[a-f0-9]{40}\z/, value, "expected full SHA pin for #{value} in #{path}")
      end
    end
  end

  def test_readme_describes_oidc_only_contract
    readme = File.read(File.join(REPO_ROOT, "README.md"))
    assert_includes readme, "repo-owned secret profiles"
    assert_includes readme, "ci_secret_provider_token"
    assert_includes readme, "full commit SHA"
    assert_includes readme, "explicit package specs such as `@webpresso/agent-kit@2.4.1` pass through unchanged"
  end

  def test_shared_ci_workflow_uses_shared_toolchain_and_aggregate_gate
    workflow = load_yaml(WORKFLOW_CI)
    inputs = workflow_call_inputs(workflow)
    assert_equal "string", inputs.dig("install_command", "type")
    assert_equal "string", inputs.dig("quality_command", "type")
    assert_equal "", inputs.dig("e2e_command", "default")
    assert_equal "", inputs.dig("architecture_command", "default")
    assert_equal "", inputs.dig("deploy_verify_command", "default")
    assert_step_uses(WORKFLOW_CI, "webpresso/github-actions/.github/actions/setup-webpresso-toolchain@0f82e2717c0e406ac25212f696fe3ba6fd9f851d")
    assert_equal ["quality", "e2e", "architecture", "deploy-verify"], workflow.dig("jobs", "ci", "needs")
    assert_equal "ci", workflow.dig("jobs", "ci", "name")
  end

  def test_shared_security_workflow_uses_pinned_scanners_and_shared_toolchain
    workflow = load_yaml(WORKFLOW_SECURITY)
    inputs = workflow_call_inputs(workflow)
    assert_equal "string", inputs.dig("install_command", "type")
    assert_equal "string", inputs.dig("security_command", "type")
    assert_step_uses(WORKFLOW_SECURITY, "gitleaks/gitleaks-action@ff98106e4c7b2bc287b24eaf42907196329070c7")
    assert_step_uses(WORKFLOW_SECURITY, "google/osv-scanner-action/osv-scanner-action@9a498708959aeaef5ef730655706c5a1df1edbc2")
    assert_step_uses(WORKFLOW_SECURITY, "webpresso/github-actions/.github/actions/setup-webpresso-toolchain@0f82e2717c0e406ac25212f696fe3ba6fd9f851d")
  end

  private

  def load_yaml(path)
    YAML.load_file(path)
  end

  def extract_uses(steps)
    Array(steps).map { |step| step["uses"] }.compact
  end


  def all_steps(workflow)
    workflow.fetch("jobs").values.flat_map do |job|
      Array(job["steps"])
    end
  end

  def all_uses(node)
    case node
    when Hash
      node.flat_map do |key, value|
        key == "uses" ? [value] : all_uses(value)
      end
    when Array
      node.flat_map { |value| all_uses(value) }
    else
      []
    end.compact
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
