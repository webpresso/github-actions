require "minitest/autorun"
require "open3"
require "tmpdir"
require "yaml"

class WorkflowContractTest < Minitest::Test
  REPO_ROOT = File.expand_path("..", __dir__)
  WORKFLOW_PREVIEW = File.join(REPO_ROOT, ".github", "workflows", "cloudflare-preview.yml")
  WORKFLOW_PRODUCTION = File.join(REPO_ROOT, ".github", "workflows", "cloudflare-production.yml")
  WORKFLOW_RELEASE = File.join(REPO_ROOT, ".github", "workflows", "changesets-release.yml")
  WORKFLOW_CI = File.join(REPO_ROOT, ".github", "workflows", "webpresso-ci.yml")
  WORKFLOW_SECURITY = File.join(REPO_ROOT, ".github", "workflows", "webpresso-security.yml")
  WORKFLOW_AGENT_KIT_FRESHNESS = File.join(REPO_ROOT, ".github", "workflows", "agent-kit-freshness.yml")
  WORKFLOW_SELF_TEST = File.join(REPO_ROOT, ".github", "workflows", "self-test.yml")
  ACTION_TOOLCHAIN = File.join(REPO_ROOT, ".github", "actions", "setup-webpresso-toolchain", "action.yml")

  TOOLCHAIN_USES_PATTERN = %r{/setup-webpresso-toolchain@}.freeze
  SETUP_WP_USES_PATTERN = %r{/setup-wp@}.freeze
  FULL_SHA_SUFFIX = /@[a-f0-9]{40}\z/.freeze
  EXACT_SEMVER = /\A\d+\.\d+\.\d+\z/.freeze

  # The setup-wp SHA, the toolchain SHA, and the agent-kit version each live at
  # many irreducible YAML sites. Hardcoding them here would make this file one
  # more site every freshness bump has to edit, so the expected value is derived
  # from a single canonical workflow at runtime; what the suite asserts is
  # cross-site agreement plus value shape.
  CANONICAL_PIN_WORKFLOW = WORKFLOW_CI

  def self.collect_uses(node)
    case node
    when Hash
      node.flat_map { |key, value| key == "uses" ? [value] : collect_uses(value) }
    when Array
      node.flat_map { |value| collect_uses(value) }
    else
      []
    end.compact
  end

  def self.sole(values, label)
    unique = values.uniq
    unless unique.length == 1
      raise "expected exactly one distinct #{label} in #{CANONICAL_PIN_WORKFLOW}, got #{unique.length}"
    end
    unique.first
  end

  CANONICAL_WORKFLOW = YAML.load_file(CANONICAL_PIN_WORKFLOW)
  SETUP_TOOLCHAIN_USES = sole(collect_uses(CANONICAL_WORKFLOW).grep(TOOLCHAIN_USES_PATTERN), "toolchain pin")
  SETUP_WP_USES = sole(collect_uses(CANONICAL_WORKFLOW).grep(SETUP_WP_USES_PATTERN), "setup-wp pin")
  SETUP_WP_VERSION = sole(
    CANONICAL_WORKFLOW
      .fetch("jobs")
      .values
      .flat_map { |job| Array(job["steps"]) }
      .select { |step| step["uses"] == SETUP_WP_USES }
      .map { |step| step.fetch("with", {})["version"] }
      .compact,
    "setup-wp version",
  )

  # agent-kit-freshness.yml is not a caller-consuming CI/deploy workflow: it
  # is a repo-maintenance automation (npm registry lookup + git + gh CLI)
  # that keeps other workflows' agent-kit pins fresh. It deliberately does
  # not install pnpm/Vite+/wp -- pulling in the shared toolchain for it would
  # be pure scope creep. Exclude it from the toolchain-required invariant
  # below; its own contract lives in agent-kit-freshness.contract.test.cjs.
  #
  # self-test.yml is this repository's own CI gate: it runs the contract suites
  # against the repo itself and is never called by a consumer. Installing the
  # shared toolchain (pnpm/Vite+/wp) for a Ruby+Node test run would be pure
  # scope creep, so it is excluded from the toolchain-required invariant too.
  # Its own contract is test_self_test_workflow_gates_both_contract_suites.
  NON_TOOLCHAIN_WORKFLOWS = [WORKFLOW_AGENT_KIT_FRESHNESS, WORKFLOW_SELF_TEST].freeze

  def test_preview_workflow_bootstrap_contract_and_pins
    workflow = load_yaml(WORKFLOW_PREVIEW)
    inputs = workflow_call_inputs(workflow)
    assert_equal true, inputs.dig("secret_profile", "required")
    assert_equal true, inputs.dig("secret_sink", "required")
    assert_equal true, inputs.dig("github_environment", "required")
    assert_equal false, workflow_call_secrets(workflow).dig("ci_secret_provider_token", "required")
    assert_equal "string", inputs.dig("doppler_identity_id", "type")
    assert_equal "write", workflow.dig("jobs", "preview", "permissions", "id-token")
    assert_equal "${{ inputs.github_environment }}", workflow.dig("jobs", "preview", "environment")
    assert_step_uses(WORKFLOW_PREVIEW, "DopplerHQ/cli-action@4819d808ab99e5cde19a0637a16536a4038fad73")
    assert_step_uses(WORKFLOW_PREVIEW, SETUP_TOOLCHAIN_USES)
  end

  def test_production_workflow_bootstrap_contract_and_pins
    workflow = load_yaml(WORKFLOW_PRODUCTION)
    inputs = workflow_call_inputs(workflow)
    assert_equal true, inputs.dig("secret_profile", "required")
    assert_equal true, inputs.dig("secret_sink", "required")
    assert_equal true, inputs.dig("github_environment", "required")
    assert_equal false, workflow_call_secrets(workflow).dig("ci_secret_provider_token", "required")
    assert_equal "string", inputs.dig("doppler_identity_id", "type")
    assert_equal "write", workflow.dig("jobs", "production", "permissions", "id-token")
    assert_equal "${{ inputs.github_environment }}", workflow.dig("jobs", "production", "environment")
    assert_step_uses(WORKFLOW_PRODUCTION, "DopplerHQ/cli-action@4819d808ab99e5cde19a0637a16536a4038fad73")
    assert_step_uses(WORKFLOW_PRODUCTION, SETUP_TOOLCHAIN_USES)
  end

  def test_deploy_workflows_allow_callers_to_pin_a_trusted_checkout
    { WORKFLOW_PREVIEW => "preview", WORKFLOW_PRODUCTION => "production" }.each do |path, job_name|
      workflow = load_yaml(path)
      inputs = workflow_call_inputs(workflow)
      assert_equal "", inputs.dig("checkout_ref", "default"), path

      checkout = all_steps(workflow).find do |step|
        step["uses"] == "actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd"
      end
      refute_nil checkout, path
      assert_equal "${{ inputs.checkout_ref || github.sha }}", checkout.dig("with", "ref"), path
      assert_equal "${{ inputs.github_environment }}", workflow.dig("jobs", job_name, "environment")
    end
  end

  def test_deploy_workflows_never_export_profiles_or_runtime_secrets_job_wide
    { WORKFLOW_PREVIEW => "preview", WORKFLOW_PRODUCTION => "production" }.each do |path, job_name|
      workflow = load_yaml(path)
      job_env = workflow.dig("jobs", job_name, "env") || {}
      refute job_env.keys.any? { |name| name.match?(/(?:TOKEN|PASSWORD|_KEY)\z/u) }, path

      contents = File.read(path)
      refute_includes contents, "inject-env-vars"
      refute_includes contents, "DopplerHQ/secrets-fetch-action@"
      refute_includes contents, "Infisical/secrets-action@"
      refute_includes contents, "CLOUDFLARE_API_TOKEN"
      refute_includes contents, "PULUMI_ACCESS_TOKEN"
    end
  end

  def test_provider_auth_is_scoped_to_secret_gated_mutation_steps
    { WORKFLOW_PREVIEW => %w[deploy destroy rollback], WORKFLOW_PRODUCTION => %w[deploy rollback] }.each do |path, allowed_ids|
      workflow = load_yaml(path)
      steps = all_steps(workflow)
      token_steps = steps.select { |step| step.fetch("env", {}).key?("DOPPLER_TOKEN") }
      refute_empty token_steps, path
      assert_empty token_steps.map { |step| step["id"] }.compact - allowed_ids, path
      provider_secret_steps = steps.select do |step|
        step.to_s.include?("secrets.ci_secret_provider_token")
      end
      assert_equal allowed_ids, provider_secret_steps.map { |step| step["id"] }, path

      %w[install verify smoke].each do |id|
        step = steps.find { |candidate| candidate["id"] == id }
        next unless step
        expected_env = id == "install" ? %w[GITHUB_TOKEN NODE_AUTH_TOKEN INSTALL_COMMAND] : ["#{id.upcase}_COMMAND"]
        assert_equal expected_env, step.fetch("env", {}).keys, "#{path} #{id} must remain provider-runtime-secretless"
      end
    end
  end

  def test_embedded_node_programs_parse
    [WORKFLOW_PREVIEW, WORKFLOW_PRODUCTION].each do |path|
      programs = File.read(path).scan(/(?:node[^\n]*|cat >[^\n]*) <<'NODE'[^\n]*\n(.*?)^\s*NODE$/m).flatten
      refute_empty programs, path
      programs.each do |program|
        _stdout, stderr, status = Open3.capture3("node", "--check", stdin_data: program)
        assert status.success?, "#{path} contains invalid embedded JavaScript:\n#{stderr}"
      end
    end
  end

  def test_doppler_oidc_helper_is_shared_and_exchanges_only_provider_auth
    preview_helper = extract_doppler_oidc_helper(WORKFLOW_PREVIEW)
    production_helper = extract_doppler_oidc_helper(WORKFLOW_PRODUCTION)
    assert_equal preview_helper, production_helper

    Dir.mktmpdir("doppler-oidc-contract") do |directory|
      helper_path = File.join(directory, "exchange.cjs")
      preload_path = File.join(directory, "mock-fetch.cjs")
      output_path = File.join(directory, "github-output")
      File.write(helper_path, preview_helper)
      File.write(
        preload_path,
        <<~'JAVASCRIPT',
          global.fetch = async (url, options = {}) => {
            if (url === "https://github.example.test/oidc") {
              if (options.headers?.Authorization !== "Bearer request-token") {
                throw new Error("missing GitHub request authorization");
              }
              return { ok: true, status: 200, json: async () => ({ value: "github-oidc-token" }) };
            }
            if (url === "https://api.doppler.com/v3/auth/oidc") {
              const body = JSON.parse(options.body ?? "{}");
              if (body.identity !== "identity-id" || body.token !== "github-oidc-token") {
                throw new Error("invalid Doppler exchange payload");
              }
              return { ok: true, status: 200, json: async () => ({ token: "dp.said.short-lived" }) };
            }
            throw new Error(`unexpected URL: ${url}`);
          };
        JAVASCRIPT
      )
      stdout, stderr, status = Open3.capture3(
        {
          "ACTIONS_ID_TOKEN_REQUEST_URL" => "https://github.example.test/oidc",
          "ACTIONS_ID_TOKEN_REQUEST_TOKEN" => "request-token",
          "DOPPLER_IDENTITY_ID" => "identity-id",
          "GITHUB_OUTPUT" => output_path,
        },
        "node",
        "--require",
        preload_path,
        helper_path,
      )
      assert status.success?, stderr
      assert_includes stdout, "::add-mask::github-oidc-token"
      assert_includes stdout, "::add-mask::dp.said.short-lived"
      assert_equal "token=dp.said.short-lived\n", File.read(output_path)
    end
  end

  def test_deploy_workflows_validate_sink_and_fail_closed_for_infisical
    [WORKFLOW_PREVIEW, WORKFLOW_PRODUCTION].each do |path|
      contents = File.read(path)
      assert_includes contents, 'Missing workflow_call input secret_sink.'
      assert_includes contents, 'Unknown secret sink "${secretSink}"'
      assert_includes contents, 'does not allow the run operation'
      assert_includes contents, 'Unknown secret profile "${secretProfile}"'
      assert_includes contents, 'Infisical is not supported by the sink-scoped reusable deploy harness'
    end
  end

  def test_doppler_oidc_exchanges_for_a_masked_short_lived_token_only
    [WORKFLOW_PREVIEW, WORKFLOW_PRODUCTION].each do |path|
      contents = File.read(path)
      assert_includes contents, "id: doppler_oidc"
      assert_includes contents, "ACTIONS_ID_TOKEN_REQUEST_URL"
      assert_includes contents, "https://api.doppler.com/v3/auth/oidc"
      assert_equal 1, contents.scan("https://api.doppler.com/v3/auth/oidc").length
      assert_includes contents, "::add-mask::"
      assert_includes contents, 'token=${token}'
      refute_includes contents, "inject-env-vars"
    end
  end

  def test_mutation_commands_run_only_through_caller_selected_secret_sink
    [WORKFLOW_PREVIEW, WORKFLOW_PRODUCTION].each do |path|
      contents = File.read(path)
      assert_includes contents, 'wp secrets run --sink "${SECRET_SINK}" --profile "${SECRET_PROFILE}" -- bash -leo pipefail -c'
      refute_match(/^\s+bash -leo pipefail -c "\$(?:DEPLOY|DESTROY|ROLLBACK)_COMMAND"$/u, contents)
    end
  end

  def test_smoke_failure_runs_optional_rollback_and_still_fails
    [WORKFLOW_PREVIEW, WORKFLOW_PRODUCTION].each do |path|
      workflow = load_yaml(path)
      inputs = workflow_call_inputs(workflow)
      assert_equal "", inputs.dig("rollback_command", "default")

      steps = all_steps(workflow)
      deploy = steps.find { |step| step["id"] == "deploy" }
      smoke = steps.find { |step| step["id"] == "smoke" }
      rollback = steps.find { |step| step["id"] == "rollback" }
      failure_gate = steps.find { |step| step["id"] == "smoke_failure" }

      refute_nil deploy, path
      assert_equal true, smoke["continue-on-error"], path
      assert_includes rollback.fetch("if"), "steps.deploy.outcome == 'success'"
      assert_includes rollback.fetch("if"), "steps.smoke.outcome == 'failure'"
      assert_equal "${{ steps.deploy.outputs.release_id }}", rollback.dig("env", "RELEASE_ID")
      assert_includes failure_gate.fetch("if"), "steps.smoke.outcome == 'failure'"
      assert_includes failure_gate.fetch("run"), "exit 1"
    end
  end

  def test_release_workflow_uses_shared_toolchain_setup
    workflow = load_yaml(WORKFLOW_RELEASE)
    steps = workflow.dig("jobs", "release", "steps")
    assert_includes extract_uses(steps), SETUP_TOOLCHAIN_USES
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

  def test_shared_toolchain_action_uses_catalog_aware_vite_plus_setup
    action = load_yaml(ACTION_TOOLCHAIN)
    steps = action.dig("runs", "steps")
    setup_vp = steps.find do |step|
      step["uses"] == "voidzero-dev/setup-vp@250f29ce396baf5e8f24498e17c0dfdebabc26eb"
    end

    refute_nil setup_vp
    assert_equal false, setup_vp.dig("with", "run-install")
    refute action.fetch("inputs").key?("cli-global-packages")
    refute_includes File.read(ACTION_TOOLCHAIN), "npm install -g"
  end


  def test_reusable_workflows_do_not_request_removed_global_cli_input
    workflow_paths.each do |path|
      contents = File.read(path)
      refute_includes contents, "/tmp/webpresso-cli-globals", path
      refute_match(/npm\s+install\s+-g\s+\$\(cat\s+[^)]*\)/, contents, "#{path} should not install globals from cat output inline")

      next if NON_TOOLCHAIN_WORKFLOWS.include?(path)

      toolchain_steps = all_steps(load_yaml(path)).select { |step| step["uses"] == SETUP_TOOLCHAIN_USES }
      refute_empty toolchain_steps, path
      toolchain_steps.each do |step|
        refute step.fetch("with", {}).key?("cli-global-packages"), path
      end
    end
  end

  def test_every_reusable_toolchain_workflow_uses_caller_versioned_agent_kit_setup
    workflow_paths = Dir.glob(File.join(REPO_ROOT, ".github", "workflows", "*.yml")).sort - NON_TOOLCHAIN_WORKFLOWS
    toolchain_workflow_paths = workflow_paths.select do |path|
      all_uses(load_yaml(path)).include?(SETUP_TOOLCHAIN_USES)
    end

    assert_equal workflow_paths, toolchain_workflow_paths

    toolchain_workflow_paths.each do |path|
      workflow = load_yaml(path)
      inputs = workflow_call_inputs(workflow)
      refute inputs.key?("agent_kit_version"), path

      setup_wp_count = 0
      workflow.fetch("jobs").each_value do |job|
        steps = job.fetch("steps", [])
        steps.each_index do |index|
          step = steps[index]
          next unless step["uses"] == SETUP_WP_USES

          setup_wp_count += 1
          toolchain_index = steps.index { |candidate| candidate["uses"] == SETUP_TOOLCHAIN_USES }
          refute_nil toolchain_index, path
          assert_operator toolchain_index, :<, index, path
          assert_equal SETUP_WP_VERSION, step.fetch("with", {})["version"], path
        end
      end
      assert_operator setup_wp_count, :>, 0, path

      refute_match(%r{@webpresso/agent-kit@}, File.read(path), path)
      refute_includes File.read(path), "agent_kit_version", path
    end
  end

  def workflow_paths
    Dir.glob(File.join(REPO_ROOT, ".github", "workflows", "*.yml")).sort
  end

  def workflow_and_action_paths
    Dir.glob(File.join(REPO_ROOT, ".github", "{workflows,actions}", "**", "*.yml")).sort
  end

  def test_canonical_pins_are_correctly_shaped
    assert_match(FULL_SHA_SUFFIX, SETUP_TOOLCHAIN_USES)
    assert_match(FULL_SHA_SUFFIX, SETUP_WP_USES)
    assert_match(EXACT_SEMVER, SETUP_WP_VERSION)
  end

  def test_pin_values_agree_across_every_site
    toolchain = workflow_and_action_paths.flat_map do |path|
      self.class.collect_uses(load_yaml(path)).grep(TOOLCHAIN_USES_PATTERN)
    end
    refute_empty toolchain
    assert_equal [SETUP_TOOLCHAIN_USES], toolchain.uniq

    setup_wp = workflow_and_action_paths.flat_map do |path|
      self.class.collect_uses(load_yaml(path)).grep(SETUP_WP_USES_PATTERN)
    end
    refute_empty setup_wp
    assert_equal [SETUP_WP_USES], setup_wp.uniq

    versions = workflow_and_action_paths.flat_map do |path|
      collect_steps(load_yaml(path))
        .select { |step| step["uses"].to_s.match?(SETUP_WP_USES_PATTERN) }
        .map { |step| step.fetch("with", {})["version"] || "<missing in #{path}>" }
    end
    refute_empty versions
    assert_equal [SETUP_WP_VERSION], versions.uniq
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

  def test_readme_describes_sink_scoped_secret_contract
    readme = File.read(File.join(REPO_ROOT, "README.md"))
    assert_includes readme, "repo-owned secret profiles"
    assert_includes readme, "ci_secret_provider_token"
    assert_includes readme, "secret_sink"
    assert_includes readme, "github_environment"
    assert_includes readme, "rollback_command"
    assert_includes readme, "full commit SHA"
    assert_includes readme, "does not self-resolve a version"
    assert_includes readme, "must not add `@webpresso/agent-kit`"
    assert_includes readme, "workspace catalogs"
    assert_includes readme, "`run-install: false`"
    refute_includes readme, "cli-global-packages"
  end

  def test_shared_ci_workflow_uses_shared_toolchain_and_aggregate_gate
    workflow = load_yaml(WORKFLOW_CI)
    inputs = workflow_call_inputs(workflow)
    assert_equal "string", inputs.dig("install_command", "type")
    assert_equal "string", inputs.dig("quality_command", "type")
    assert_equal "", inputs.dig("e2e_command", "default")
    assert_equal "", inputs.dig("architecture_command", "default")
    assert_equal "", inputs.dig("deploy_verify_command", "default")
    assert_step_uses(WORKFLOW_CI, SETUP_TOOLCHAIN_USES)
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
    assert_step_uses(WORKFLOW_SECURITY, SETUP_TOOLCHAIN_USES)
  end

  def test_agent_kit_freshness_workflow_is_a_deliberate_toolchain_exception
    assert File.exist?(WORKFLOW_AGENT_KIT_FRESHNESS), "expected #{WORKFLOW_AGENT_KIT_FRESHNESS} to exist"
    workflow = load_yaml(WORKFLOW_AGENT_KIT_FRESHNESS)
    on_section = workflow["on"] || workflow[true]
    assert on_section.key?("workflow_call"), "must be callable as a reusable workflow"
    assert on_section.key?("workflow_dispatch"), "must be manually exercisable without waiting for a schedule"

    job = workflow.dig("jobs", "freshness")
    refute_nil job, "expected a `freshness` job"
    assert_equal "write", job.dig("permissions", "contents")
    assert_equal "write", job.dig("permissions", "pull-requests")

    # Deliberately excluded from the shared-toolchain invariant above: this
    # is a repo-maintenance automation, not a caller-consuming CI/deploy
    # workflow, so it does not install pnpm/Vite+/wp.
    refute_includes all_uses(workflow), SETUP_TOOLCHAIN_USES
    refute_includes all_uses(workflow), SETUP_WP_USES
  end

  # The gate that makes every other test in this file binding. Without an
  # executor the suites are documentation: a broken contract merges green
  # because nothing ran it. Pin the trigger and both invocations so the gate
  # cannot be silently narrowed or gutted.
  def test_self_test_workflow_gates_both_contract_suites
    assert File.exist?(WORKFLOW_SELF_TEST), "expected #{WORKFLOW_SELF_TEST} to exist"
    workflow = load_yaml(WORKFLOW_SELF_TEST)
    on_section = workflow["on"] || workflow[true]
    assert on_section.key?("pull_request"), "contract suites must gate every pull request"
    assert_equal ["main"], on_section.dig("push", "branches"), "main must stay proven after merge"

    assert_equal "read", workflow.dig("permissions", "contents")
    assert_nil workflow.dig("permissions", "pull-requests"), "read-only gate needs no write scope"

    job = workflow.dig("jobs", "contract-tests")
    refute_nil job, "expected a `contract-tests` job"
    commands = Array(job["steps"]).map { |step| step["run"] }.compact
    assert_includes commands, "ruby -Itest test/workflow_contract_test.rb"
    assert_includes commands, "node --test .github/workflows/*.contract.test.cjs"

    # Deliberately excluded from the shared-toolchain invariant above: this
    # gate runs Ruby and Node against the repo itself and is never called by a
    # consumer, so it does not install pnpm/Vite+/wp.
    refute_includes all_uses(workflow), SETUP_TOOLCHAIN_USES
    refute_includes all_uses(workflow), SETUP_WP_USES
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

  # Every `steps:` entry anywhere in a document: reaches a composite action's
  # `runs.steps` as well as a workflow's `jobs.*.steps`.
  def collect_steps(node)
    case node
    when Hash
      node.flat_map do |key, value|
        key == "steps" && value.is_a?(Array) ? value.select { |step| step.is_a?(Hash) } : collect_steps(value)
      end
    when Array
      node.flat_map { |value| collect_steps(value) }
    else
      []
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

  def extract_doppler_oidc_helper(path)
    match = File.read(path).match(/cat > "\$\{DOPPLER_OIDC_HELPER\}" <<'NODE'\n(.*?)^\s*NODE$/m)
    refute_nil match, path
    match[1]
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
