import {
  Answer,
  FieldKindEnum,
  FormField,
  HiddenField,
  STATEMENT_FIELD_KINDS
} from '@heyform-inc/shared-types-enums'
import { Injectable } from '@nestjs/common'
import { FieldInfo, parseAsync } from 'json2csv'

import { htmlUtils, parsePlainAnswer } from '@heyform-inc/answer-utils'
import { helper, unixDate } from '@heyform-inc/utils'
import { SubmissionModel } from '@model'

const FIELD_ID_KEY = '#'
const START_DATE_KEY = 'Start Date (UTC)'
const SUBMIT_DATE_KEY = 'Submit Date (UTC)'

@Injectable()
export class ExportFileService {
  async csv(
    formFields: FormField[],
    selectedHiddenFields: HiddenField[],
    submissions: SubmissionModel[]
  ): Promise<string> {
    const selectedFormFields = formFields
      .filter(field => !STATEMENT_FIELD_KINDS.includes(field.kind))
      .map(field => ({
        ...field,
        title: helper.isArray(field.title) ? htmlUtils.serialize(field.title) : field.title
      }))

    const fields: FieldInfo<SubmissionModel>[] = [
      {
        label: FIELD_ID_KEY,
        value: submission => submission.id
      },
      ...selectedFormFields.map(field => ({
        label: field.title,
        value: (submission: SubmissionModel) => {
          const answer = submission.answers.find(answer => answer.id === field.id)

          return helper.isEmpty(answer) ? '' : this.parseAnswer(answer)
        }
      })),
      ...selectedHiddenFields.map(hiddenField => ({
        label: hiddenField.name,
        value: (submission: SubmissionModel) =>
          submission.hiddenFields.find(answer => answer.id === hiddenField.id)?.value
      })),
      {
        label: START_DATE_KEY,
        value: submission => (submission.startAt ? unixDate(submission.startAt).toISOString() : '')
      },
      {
        label: SUBMIT_DATE_KEY,
        value: submission => (submission.startAt ? unixDate(submission.endAt!).toISOString() : '')
      }
    ]

    return parseAsync(submissions, {
      fields
    })
  }

  private parseAnswer(answer: Answer): string {
    const value = answer.value
    let result = ''

    if (helper.isEmpty(value)) {
      return result
    }

    switch (answer?.kind) {
      case FieldKindEnum.FILE_UPLOAD:
        if (helper.isString(value)) {
          result = value
        } else if (helper.isObject(value)) {
          if (helper.isString(value.url)) {
            result = value.url
          } else {
            const prefix = value.urlPrefix || value.cdnUrlPrefix
            const key = value.key || value.cdnKey

            if (helper.isString(prefix) && helper.isString(key)) {
              result = `${prefix.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`
            }
          }
        }
        break

      default:
        result = parsePlainAnswer(answer)
        break
    }

    return result
  }
}
