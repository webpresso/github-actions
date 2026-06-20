import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const ROOT = '/Users/ozby/repos/webpresso/github-actions/_worktrees/wp-secret-orchestration-20260619'

function readWorkflow(name: string): string {
  return readFileSync(join(ROOT, '.github', 'workflows', name), 'utf8')
}

const workflowFiles = [
  'cloudflare-preview.yml',
  'cloudflare-production.yml',
  'wp-e2e.yml',
  'wp-cleanup-preview.yml',
  'wp-secret-orchestration-smoke.yml',
] as const

test('secret orchestration reusable workflows require id-token write and explicit secret contract', () => {
  for (const file of workflowFiles) {
    const text = readWorkflow(file)
    assert.match(text, /permissions:\n\s+contents: read\n\s+packages: read\n\s+id-token: write/u)
    assert.match(text, /secrets:\n\s+ci_secret_provider_token:/u)
    assert.doesNotMatch(text, /secrets:\s+inherit/u)
  }
})

test('secret orchestration reusable workflows pin third-party secret-bearing actions', () => {
  for (const file of workflowFiles) {
    const text = readWorkflow(file)
    assert.match(
      text,
      /dopplerhq\/secrets-fetch-action@[0-9a-f]{40}/u,
      `${file} must pin dopplerhq/secrets-fetch-action by full SHA`,
    )
    assert.match(
      text,
      /dopplerhq\/cli-action@[0-9a-f]{40}/u,
      `${file} must pin dopplerhq/cli-action by full SHA when used`,
    )
  }
})

test('reusable workflows keep provider bootstrap as the only secret contract', () => {
  for (const file of workflowFiles) {
    const text = readWorkflow(file)
    for (const secretName of [
      'cloudflare_account_id',
      'cloudflare_api_token',
      'cloudflare_zone_id',
      'neon_api_key',
      'neon_project_id',
      'neon_parent_branch_id',
      'pulumi_access_token',
      'better_auth_secret',
      'jwt_secret',
      'langfuse_public_key',
      'langfuse_secret_key',
    ]) {
      assert.doesNotMatch(text, new RegExp(`\n\s+${secretName}:`, 'u'))
    }
  }
})
