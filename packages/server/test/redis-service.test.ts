import * as assert from 'assert'

import { RedisService } from '../src/service/redis.service'

async function testRateLimitUsesAtomicRedisScript() {
  const calls: unknown[][] = []
  const redis = {
    eval: async (...args: unknown[]) => {
      calls.push(args)
      return [20, 3_599]
    }
  }
  const service = new RedisService(redis as any)

  await service.throttler('ai:user:user-1', 20, '1h')

  assert.strictEqual(calls.length, 1)
  assert.ok(String(calls[0][0]).includes("redis.call('INCR', KEYS[1])"))
  assert.ok(String(calls[0][0]).includes("redis.call('EXPIRE', KEYS[1], ARGV[1])"))
  assert.deepStrictEqual(calls[0].slice(1), [1, 'ai:user:user-1', 3_600])
}

async function testRateLimitReturnsHttp429() {
  const service = new RedisService({
    eval: async () => [21, 3_500]
  } as any)

  await assert.rejects(
    () => service.throttler('ai:user:user-1', 20, '1h'),
    (error: any) => {
      assert.strictEqual(error.getStatus(), 429)
      assert.match(error.message, /3500 seconds/)
      return true
    }
  )
}

async function run() {
  await testRateLimitUsesAtomicRedisScript()
  await testRateLimitReturnsHttp429()
}

if (require.main === module) {
  run().catch(error => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  })
}
