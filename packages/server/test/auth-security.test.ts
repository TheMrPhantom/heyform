import * as assert from 'assert'
import * as bcrypt from 'bcrypt'

import { LoginResolver, loginAttemptKey } from '../src/resolver/auth/login.resolver'
import { SendResetPasswordEmailResolver } from '../src/resolver/auth/send-reset-password-email.resolver'
import { AuthService } from '../src/service/auth.service'

async function testVerificationCodesAreConsumedAtomically() {
  const codes = new Map<string, string>([
    ['verify_email:user_1:123456', String(Date.now() + 60_000)]
  ])
  let hgetCalls = 0
  let hgetdelCalls = 0
  const redisService = {
    hget: async () => {
      hgetCalls += 1
      return null
    },
    hgetdel: async ({ key, field }: { key: string; field: string }) => {
      hgetdelCalls += 1
      const mapKey = `${key}:${field}`
      const value = codes.get(mapKey) || null
      codes.delete(mapKey)
      return value
    }
  }
  const service = new AuthService({} as any, redisService as any)

  await service.checkVerificationCode('verify_email:user_1', '123456')
  await assert.rejects(
    () => service.checkVerificationCode('verify_email:user_1', '123456'),
    /Invalid verification code/
  )

  assert.strictEqual(hgetCalls, 0)
  assert.strictEqual(hgetdelCalls, 2)
}

async function testLoginAttemptsAreScopedToTrustedSourceAndClearedOnSuccess() {
  const first = loginAttemptKey('user_1', { ip: '203.0.113.10', deviceId: 'device_1' } as any)
  const second = loginAttemptKey('user_1', { ip: '203.0.113.11', deviceId: 'device_1' } as any)
  assert.notStrictEqual(first, second)
  assert.strictEqual(first.includes('203.0.113.10'), false)

  const password = 'StrongPassword1!'
  const passwordHash = await bcrypt.hash(password, 4)
  let checkedKey: string | undefined
  let clearedKey: string | undefined
  const authService = {
    attemptsCheck: async (key: string, check: () => Promise<void>) => {
      checkedKey = key
      await check()
    },
    clearAttempts: async (key: string) => {
      clearedKey = key
    },
    devices: async () => ['device_1'],
    createUserActivity: async () => ({}),
    login: async () => undefined
  }
  const resolver = new LoginResolver(
    authService as any,
    {
      findByEmail: async () => ({
        id: 'user_1',
        email: 'user@example.com',
        password: passwordHash
      })
    } as any,
    { userSecurityAlert: () => undefined } as any
  )
  const client = {
    deviceId: 'device_1',
    ip: '203.0.113.10',
    lang: 'en',
    userAgent: {
      browser: { name: 'Browser' },
      os: { name: 'OS' }
    }
  } as any

  await resolver.login(client, {}, {}, { email: 'user@example.com', password })

  assert.strictEqual(checkedKey, first)
  assert.strictEqual(clearedKey, first)
}

async function testResetEmailDoesNotRevealWhetherAccountExists() {
  let mailCount = 0
  let codeCount = 0
  const resolver = new SendResetPasswordEmailResolver(
    {
      emailVerificationRequest: () => {
        mailCount += 1
      }
    } as any,
    {
      findByEmail: async (email: string) =>
        email === 'exists@example.com' ? { id: 'user_1', email, lang: 'en' } : null
    } as any,
    {
      getVerificationCodeWithRateLimit: async () => {
        codeCount += 1
        return '123456'
      }
    } as any
  )

  assert.strictEqual(await resolver.sendResetPasswordEmail({ email: 'missing@example.com' }), true)
  assert.strictEqual(await resolver.sendResetPasswordEmail({ email: 'exists@example.com' }), true)
  assert.strictEqual(codeCount, 1)
  assert.strictEqual(mailCount, 1)
}

async function run() {
  await testVerificationCodesAreConsumedAtomically()
  await testLoginAttemptsAreScopedToTrustedSourceAndClearedOnSuccess()
  await testResetEmailDoesNotRevealWhetherAccountExists()
}

if (require.main === module) {
  run().catch(error => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  })
}
