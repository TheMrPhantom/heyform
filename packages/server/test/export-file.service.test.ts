import { FieldKindEnum, FormField } from '@heyform-inc/shared-types-enums'
import * as assert from 'assert'

import { ExportFileService } from '../src/service/export-file.service'

async function testExportsRepeatedQuestionTitlesByFieldId() {
  const formFields: FormField[] = Array.from({ length: 9 }, (_, index) => [
    {
      id: `appeal-${index + 1}`,
      kind: FieldKindEnum.OPINION_SCALE,
      title: 'Appeal'
    },
    {
      id: `likelihood-${index + 1}`,
      kind: FieldKindEnum.OPINION_SCALE,
      title: 'Likelihood'
    }
  ]).flat()

  const expectedAnswers = formFields.map((field, index) => `${index + 1}`)
  const csv = await new ExportFileService().csv(
    formFields,
    [],
    [
      {
        id: 'submission-1',
        answers: formFields.map((field, index) => ({
          id: field.id,
          kind: field.kind,
          title: field.title,
          value: expectedAnswers[index]
        })),
        hiddenFields: []
      } as any
    ]
  )

  const [header, row] = csv.split(/\r?\n/)
  const parseRow = (value: string) => value.split(',').map(cell => JSON.parse(cell))

  assert.deepStrictEqual(parseRow(header), [
    '#',
    ...formFields.map(field => field.title),
    'Start Date (UTC)',
    'Submit Date (UTC)'
  ])
  assert.deepStrictEqual(parseRow(row), ['submission-1', ...expectedAnswers, '', ''])
}

async function testExportsLegacyFileUploadUrls() {
  const csv = await new ExportFileService().csv(
    [
      {
        id: 'attachment',
        kind: FieldKindEnum.FILE_UPLOAD,
        title: 'Attachment'
      }
    ],
    [],
    [
      {
        id: 'submission-1',
        answers: [
          {
            id: 'attachment',
            kind: FieldKindEnum.FILE_UPLOAD,
            title: 'Attachment',
            value: {
              filename: 'report.pdf',
              cdnUrlPrefix: 'https://cdn.example.com/uploads/',
              cdnKey: '/file-id'
            }
          }
        ],
        hiddenFields: []
      } as any
    ]
  )

  const [, row] = csv.split(/\r?\n/)

  assert.deepStrictEqual(
    row.split(',').map(cell => JSON.parse(cell)),
    ['submission-1', 'https://cdn.example.com/uploads/file-id', '', '']
  )
}

async function run() {
  await testExportsRepeatedQuestionTitlesByFieldId()
  await testExportsLegacyFileUploadUrls()
}

if (require.main === module) {
  run().catch(error => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  })
}
