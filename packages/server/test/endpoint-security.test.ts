import { ActionEnum, CaptchaKindEnum, FieldKindEnum, Logic } from '@heyform-inc/shared-types-enums'
import * as assert from 'assert'

import { parseTrustProxy } from '../src/environments'
import { EndpointService } from '../src/service/endpoint.service'
import { ip } from '../src/utils/decorators/ip'
import {
  OPEN_FORM_TOKEN_MAX_AGE_SECONDS,
  assertFormIsAcceptingSubmissions,
  assertOpenToken
} from '../src/utils/endpoint'
import { literalSearchRegex } from '../src/utils/search'
import { resolvePaymentConfiguration, selectSubmissionFields } from '../src/utils/submission'

async function testRecaptchaMustReturnStrictTrue() {
  const endpointService = new EndpointService()
  endpointService.verifyRecaptcha = async () => false

  await assert.rejects(
    () =>
      endpointService.antiBotCheck(CaptchaKindEnum.GOOGLE_RECAPTCHA, {
        recaptchaToken: 'failed-token'
      }),
    (error: any) => error?.message === 'Failed to pass the bot-detection check'
  )

  endpointService.verifyRecaptcha = async () => true
  await endpointService.antiBotCheck(CaptchaKindEnum.GOOGLE_RECAPTCHA, {
    recaptchaToken: 'valid-token'
  })
}

function testFormAvailabilityAndOpenTokenExpiry() {
  assert.throws(
    () =>
      assertFormIsAcceptingSubmissions(
        {
          enableExpirationDate: true,
          enabledAt: 101
        },
        100
      ),
    /not accepting submissions/
  )
  assert.throws(
    () =>
      assertFormIsAcceptingSubmissions(
        {
          enableExpirationDate: true,
          closedAt: 99
        },
        100
      ),
    /not accepting submissions/
  )

  assert.strictEqual(assertOpenToken({ formId: 'form_1', timestamp: 90 }, 'form_1', {}, 100), 90)
  assert.throws(
    () =>
      assertOpenToken(
        { formId: 'form_1', timestamp: 100 - OPEN_FORM_TOKEN_MAX_AGE_SECONDS - 1 },
        'form_1',
        {},
        100
      ),
    /Invalid form token/
  )
  assert.throws(
    () =>
      assertOpenToken(
        { formId: 'form_1', timestamp: 90 },
        'form_1',
        { enableTimeLimit: true, timeLimit: 5 },
        100
      ),
    /time limit has expired/
  )
}

function testPartialSubmissionsAreSelectedFromServerLogic() {
  const fields = [
    { id: 'first', kind: FieldKindEnum.SHORT_TEXT },
    { id: 'branch', kind: FieldKindEnum.SHORT_TEXT, isTouched: false },
    { id: 'required_later', kind: FieldKindEnum.SHORT_TEXT }
  ]
  const logics: Logic[] = [
    {
      fieldId: 'branch',
      payloads: [
        {
          id: 'payload_1',
          condition: {} as any,
          action: { kind: ActionEnum.NAVIGATE, fieldId: 'required_later' }
        }
      ]
    }
  ]

  assert.deepStrictEqual(
    selectSubmissionFields(fields as any, logics, true).map(field => field.id),
    ['first', 'branch']
  )
  assert.throws(() => selectSubmissionFields(fields as any, [], true), /Invalid partial submission/)
}

function testPaymentConfigurationIsServerControlled() {
  assert.deepStrictEqual(
    resolvePaymentConfiguration(
      {
        currency: 'USD',
        price: { type: 'number', value: 12.34 }
      },
      {}
    ),
    { amount: 1234, currency: 'usd' }
  )
  assert.deepStrictEqual(
    resolvePaymentConfiguration(
      {
        currency: 'EUR',
        price: { type: 'variable', ref: 'total' }
      },
      { total: 9.5 }
    ),
    { amount: 950, currency: 'eur' }
  )
  assert.throws(
    () =>
      resolvePaymentConfiguration({ currency: 'USD', price: { type: 'number', value: -1 } }, {}),
    /Invalid payment amount/
  )
}

function testSearchIsLiteralAndIpUsesExpressTrustPolicy() {
  const regex = literalSearchRegex('form.*(secret)')

  assert.strictEqual(regex.test('FORM.*(SECRET)'), true)
  assert.strictEqual(regex.test('form anything secret'), false)

  const req = {
    ip: '203.0.113.10',
    get: () => '127.0.0.1'
  }
  assert.strictEqual(ip(req), '203.0.113.10')
}

function testTrustProxyFailsClosedByDefault() {
  assert.strictEqual(parseTrustProxy(undefined), false)
  assert.strictEqual(parseTrustProxy('false'), false)
  assert.strictEqual(parseTrustProxy('1'), 1)
  assert.strictEqual(parseTrustProxy('loopback, 10.0.0.0/8'), 'loopback, 10.0.0.0/8')
}

async function run() {
  await testRecaptchaMustReturnStrictTrue()
  testFormAvailabilityAndOpenTokenExpiry()
  testPartialSubmissionsAreSelectedFromServerLogic()
  testPaymentConfigurationIsServerControlled()
  testSearchIsLiteralAndIpUsesExpressTrustPolicy()
  testTrustProxyFailsClosedByDefault()
}

if (require.main === module) {
  run().catch(error => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  })
}
