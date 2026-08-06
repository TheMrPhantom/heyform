import * as assert from 'assert'
import 'reflect-metadata'

import { AIResolver } from '../src/resolver/form/ai.resolver'

async function testEveryAIMutationConsumesUserAndTeamQuota() {
  const throttleCalls: unknown[][] = []
  const completions = [
    JSON.stringify({ name: 'Generated form', fields: [{ id: 'field-1' }] }),
    JSON.stringify([{ id: 'field-2' }]),
    JSON.stringify([{ id: 'logic-1' }]),
    JSON.stringify({ fontFamily: 'Inter' })
  ]
  const openAIService = {
    chatCompletion: async () => ({
      choices: [
        {
          message: {
            content: completions.shift()
          }
        }
      ]
    })
  }
  const formService = {
    create: async () => 'generated-form-id'
  }
  const redisService = {
    throttler: async (...args: unknown[]) => {
      throttleCalls.push(args)
    }
  }
  const resolver = new AIResolver(openAIService as any, formService as any, redisService as any)
  const team = {
    id: 'team-1',
    plan: {
      aiForm: true,
      themeCustomization: true
    }
  } as any
  const user = { id: 'user-1' } as any
  const form = {
    id: 'form-1',
    name: 'Existing form',
    _drafts: '[]',
    logics: []
  } as any

  await resolver.createFormWithAI(team, user, {
    projectId: 'project-1',
    topic: 'Security survey'
  } as any)
  await resolver.createFieldsWithAI(team, user, form, { prompt: 'Add a question' } as any)
  await resolver.createFormLogicsWithAI(team, user, form, { prompt: 'Add logic' } as any)
  await resolver.createFormThemeWithAI(team, user, {
    prompt: 'Use blue',
    theme: {}
  } as any)

  assert.deepStrictEqual(throttleCalls, [
    ['ai:user:user-1', 20, '1h'],
    ['ai:team:team-1', 100, '1h'],
    ['ai:user:user-1', 20, '1h'],
    ['ai:team:team-1', 100, '1h'],
    ['ai:user:user-1', 20, '1h'],
    ['ai:team:team-1', 100, '1h'],
    ['ai:user:user-1', 20, '1h'],
    ['ai:team:team-1', 100, '1h']
  ])
}

async function testQuotaFailurePreventsOpenAIRequest() {
  let openAIRequests = 0
  const quotaError = new Error('quota exceeded')
  const resolver = new AIResolver(
    {
      chatCompletion: async () => {
        openAIRequests += 1
      }
    } as any,
    {} as any,
    {
      throttler: async () => {
        throw quotaError
      }
    } as any
  )

  await assert.rejects(
    () =>
      resolver.createFieldsWithAI(
        { id: 'team-1', plan: { aiForm: true } } as any,
        { id: 'user-1' } as any,
        { id: 'form-1', name: 'Form', _drafts: '[]' } as any,
        { prompt: 'Generate' } as any
      ),
    quotaError
  )
  assert.strictEqual(openAIRequests, 0)
}

async function run() {
  await testEveryAIMutationConsumesUserAndTeamQuota()
  await testQuotaFailurePreventsOpenAIRequest()
}

if (require.main === module) {
  run().catch(error => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  })
}
