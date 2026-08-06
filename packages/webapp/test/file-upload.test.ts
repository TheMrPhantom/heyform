import * as assert from 'assert'

import { getFileUploadValue } from '../src/utils/file-upload'

function testNormalizesCurrentAndLegacyFileValues() {
  assert.deepStrictEqual(getFileUploadValue('https://forms.example.com/static/upload/file-id'), {
    filename: 'Attachment',
    url: 'https://forms.example.com/static/upload/file-id?attname=Attachment'
  })
  assert.deepStrictEqual(
    getFileUploadValue({
      filename: 'report.pdf',
      url: 'https://forms.example.com/static/upload/file-id?token=abc'
    }),
    {
      filename: 'report.pdf',
      url: 'https://forms.example.com/static/upload/file-id?token=abc&attname=report.pdf'
    }
  )
  assert.deepStrictEqual(
    getFileUploadValue({
      filename: 'report.pdf',
      urlPrefix: 'https://cdn.example.com/uploads/',
      key: '/file-id'
    }),
    {
      filename: 'report.pdf',
      url: 'https://cdn.example.com/uploads/file-id?attname=report.pdf'
    }
  )
  assert.deepStrictEqual(
    getFileUploadValue({
      filename: 'report.pdf',
      cdnUrlPrefix: 'https://legacy-cdn.example.com/uploads',
      cdnKey: 'file-id'
    }),
    {
      filename: 'report.pdf',
      url: 'https://legacy-cdn.example.com/uploads/file-id?attname=report.pdf'
    }
  )
}

function testSupportsSelfHostedUrlsAndRejectsUnsafeProtocols() {
  assert.deepStrictEqual(
    getFileUploadValue({
      filename: 'local.txt',
      url: 'http://heyform_backend:9157/static/upload/id'
    }),
    {
      filename: 'local.txt',
      url: 'http://heyform_backend:9157/static/upload/id?attname=local.txt'
    }
  )
  assert.deepStrictEqual(getFileUploadValue('/static/upload/id'), {
    filename: 'Attachment',
    url: '/static/upload/id?attname=Attachment'
  })
  assert.strictEqual(getFileUploadValue('ftp://forms.example.com/upload/id'), undefined)
  assert.strictEqual(getFileUploadValue('javascript:alert(1)'), undefined)
}

function run() {
  testNormalizesCurrentAndLegacyFileValues()
  testSupportsSelfHostedUrlsAndRejectsUnsafeProtocols()
}

if (require.main === module) {
  try {
    run()
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  }
}
