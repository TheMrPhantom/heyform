import * as assert from 'assert'
import { Buffer } from 'buffer'

import { E2EClient } from './helpers/client'
import { defineSuite } from './helpers/runner'

// 1x1 transparent PNG, base64-encoded (smallest valid PNG)
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

export function build(baseUrl: string) {
  const { suite, test } = defineSuite('static & upload')
  const client = new E2EClient({ baseUrl })

  test('POST /api/upload rejects anonymous uploads without form context', async () => {
    const res = await client.uploadFile('/api/upload', {
      filename: `e2e-${Date.now()}.png`,
      contentType: 'image/png',
      data: Buffer.from(TINY_PNG_BASE64, 'base64')
    })
    assert.strictEqual(
      res.status,
      400,
      `expected 400, got ${res.status}: ${res.text.slice(0, 200)}`
    )
    assert.ok(!res.body?.url, 'response should not contain a URL')
  })

  return suite
}
