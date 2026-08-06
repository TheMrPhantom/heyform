import { CaptchaKindEnum, FieldKindEnum } from '@heyform-inc/shared-types-enums'
import * as assert from 'assert'

import { CompleteSubmissionResolver } from '../src/resolver/endpoint/complete-submission.resolver'

async function testPaymentUsesPublishedFormConfiguration() {
  let storedSubmission: Record<string, any> | undefined
  let paymentIntent: Record<string, any> | undefined
  const now = Math.floor(Date.now() / 1_000)
  const form = {
    id: 'form_1',
    teamId: 'team_1',
    name: 'Payment form',
    suspended: false,
    fields: [
      {
        id: 'payment_1',
        title: 'Pay',
        kind: FieldKindEnum.PAYMENT,
        validations: { required: true },
        properties: {
          currency: 'USD',
          price: { type: 'number', value: 49.99 }
        }
      },
      {
        id: 'payment_2',
        title: 'Additional payment field',
        kind: FieldKindEnum.PAYMENT,
        validations: { required: true },
        properties: {
          currency: 'EUR',
          price: { type: 'number', value: 10 }
        }
      }
    ],
    hiddenFields: [],
    logics: [],
    variables: [],
    settings: {
      active: true,
      allowArchive: true,
      captchaKind: CaptchaKindEnum.NONE
    },
    stripeAccount: {
      accountId: 'acct_1'
    }
  }
  const endpointService = {
    decryptToken: () => ({ formId: 'form_1', timestamp: now }),
    assertOpenToken: () => now,
    verifySpam: async () => false
  }
  const submissionService = {
    create: async (submission: Record<string, any>) => {
      storedSubmission = submission
      return 'submission_1'
    },
    updateAnswer: async () => true,
    countInForm: async () => 0
  }
  const paymentService = {
    createPaymentIntent: async (options: Record<string, any>) => {
      paymentIntent = options
      return 'client_secret_1'
    }
  }
  const resolver = new CompleteSubmissionResolver(
    endpointService as any,
    { findById: async () => form } as any,
    submissionService as any,
    { checkIp: async () => undefined } as any,
    { addQueue: () => undefined } as any,
    { addQueue: () => undefined } as any,
    paymentService as any
  )

  const result = await resolver.completeSubmission(
    {
      ip: '203.0.113.10',
      deviceId: 'device_1',
      lang: 'en',
      userAgent: {} as any
    },
    {
      formId: 'form_1',
      answers: {
        payment_1: {
          amount: 1,
          currency: 'xxx',
          billingDetails: { name: 'Respondent' }
        },
        payment_2: {
          amount: 2,
          currency: 'yyy',
          billingDetails: { name: 'Respondent' }
        }
      },
      hiddenFields: [],
      openToken: 'encrypted-token'
    }
  )

  assert.strictEqual(result.clientSecret, 'client_secret_1')
  assert.strictEqual(paymentIntent?.amount, 4999)
  assert.strictEqual(paymentIntent?.currency, 'usd')
  assert.strictEqual(storedSubmission?.answers[0].value.amount, 4999)
  assert.strictEqual(storedSubmission?.answers[0].value.currency, 'usd')
  assert.strictEqual(storedSubmission?.answers[1].value.amount, 1000)
  assert.strictEqual(storedSubmission?.answers[1].value.currency, 'eur')
}

async function run() {
  await testPaymentUsesPublishedFormConfiguration()
}

if (require.main === module) {
  run().catch(error => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  })
}
