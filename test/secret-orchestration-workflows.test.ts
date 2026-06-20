import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const preview = readFileSync(join(import.meta.dirname, '..', '.github', 'workflows', 'cloudflare-preview.yml'), 'utf8')
const production = readFileSync(join(import.meta.dirname, '..', '.github', 'workflows', 'cloudflare-production.yml'), 'utf8')
const e2e = readFileSync(join(import.meta.dirname, '..', '.github', 'workflows', 'wp-e2e.yml'), 'utf8')
const cleanup = readFileSync(join(import.meta.dirname, '..', '.github', 'workflows', 'wp-cleanup-preview.yml'), 'utf8')

describe('secret orchestration reusable workflows', () => {
  test('preview and production workflows declare workflow_call and explicit provider secrets', () => {
    for (const workflow of [preview, production]) {
      expect(workflow).toContain('workflow_call:')
      expect(workflow).toContain('ci_secret_provider_token:')
      expect(workflow).not.toContain('secrets: inherit')
    }
  })

  test('secret-bearing actions are SHA-pinned', () => {
    for (const workflow of [preview, production, e2e]) {
      expect(workflow).toContain(
        'dopplerhq/cli-action@014df23b1329b615816a38eb5f473bb9000700b1',
      )
      expect(workflow).toContain(
        'dopplerhq/secrets-fetch-action@451892f16195f9ac360e1a5bcbf0b5fd0e957534',
      )
    }
  })

  test('reusable secret workflows request id-token write for OIDC-ready auth', () => {
    for (const workflow of [preview, production, e2e]) {
      expect(workflow).toContain('id-token: write')
    }
    expect(cleanup).toContain('id-token: write')
  })

  test('cleanup wrapper delegates to preview destroy mode with explicit secrets', () => {
    expect(cleanup).toContain('uses: ./.github/workflows/cloudflare-preview.yml')
    expect(cleanup).toContain('mode: destroy')
    expect(cleanup).toContain('ci_secret_provider_token:')
    expect(cleanup).toContain('pulumi_access_token:')
    expect(cleanup).toContain('better_auth_secret:')
    expect(cleanup).toContain('langfuse_secret_key:')
    expect(cleanup).not.toContain('secrets: inherit')
  })

  test('wp-e2e masks Infisical secrets safely and exports declared direct runtime secrets', () => {
    expect(e2e).toContain("trap 'rm -f \"$tmp_json\"' EXIT")
    expect(e2e).toContain('::add-mask::')
    expect(e2e).toContain('crypto.randomUUID()')
    expect(e2e).toContain('write_secret_env "CLOUDFLARE_ACCOUNT_ID"')
    expect(e2e).toContain('write_secret_env "NEON_PARENT_BRANCH_ID"')
  })
})
