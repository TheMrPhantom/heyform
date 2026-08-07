import { BadRequestException } from '@nestjs/common'
import * as assert from 'assert'

import { GraphqlService } from '../src/config/graphql'

import { AllExceptionsFilter } from '../src/common/filter/all-exceptions.filter'

function createHttpHost() {
  let body: any
  let status: number | undefined
  const response = {
    get: () => undefined,
    headersSent: false,
    json: (value: any) => {
      body = value
    },
    status: (value: number) => {
      status = value
      return response
    }
  }
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({ getResponse: () => response })
  }

  return { host, getBody: () => body, getStatus: () => status }
}

function createFilter() {
  const filter = new AllExceptionsFilter()
  ;(filter as any).logger = { error: () => undefined }
  return filter
}

function testHttpErrorsAlwaysReceiveAResponse() {
  const unexpected = createHttpHost()
  createFilter().catch(new Error('database host and collection leaked'), unexpected.host as any)
  assert.strictEqual(unexpected.getStatus(), 500)
  assert.deepStrictEqual(unexpected.getBody(), {
    statusCode: 500,
    message: 'Internal server error',
    error: 'Internal Server Error'
  })

  const expected = createHttpHost()
  createFilter().catch(new BadRequestException('Invalid upload'), expected.host as any)
  assert.strictEqual(expected.getStatus(), 400)
  assert.strictEqual(expected.getBody().message, 'Invalid upload')
}

function testGraphqlFilterMasksUnexpectedErrors() {
  const result = createFilter().catch(new Error('private internal detail'), {
    getType: () => 'graphql'
  } as any)

  assert.strictEqual(result.getStatus(), 500)
  assert.strictEqual(result.message, 'Internal server error')
}

async function testGraphqlFormatterOnlyExposesClientSafeMessages() {
  const options = await new GraphqlService().createGqlOptions()
  const formatError = options.formatError!

  assert.deepStrictEqual(
    formatError({ message: 'Cannot read privateProperty', extensions: {} } as any, undefined),
    { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' }
  )
  assert.deepStrictEqual(
    formatError(
      {
        message: 'wrapped',
        extensions: {
          originalError: {
            response: { error: 'Bad Request', message: 'Invalid form', statusCode: 400 }
          }
        }
      } as any,
      undefined
    ),
    { code: 'BAD_REQUEST', message: 'Invalid form' }
  )
}

async function run() {
  testHttpErrorsAlwaysReceiveAResponse()
  testGraphqlFilterMasksUnexpectedErrors()
  await testGraphqlFormatterOnlyExposesClientSafeMessages()
}

if (require.main === module) {
  run().catch(error => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  })
}
