import {
  ActionEnum,
  FormField,
  HiddenField,
  HiddenFieldAnswer,
  Logic,
  Property
} from '@heyform-inc/shared-types-enums'
import { BadRequestException } from '@nestjs/common'

interface EvaluatedFormField extends FormField {
  isTouched?: boolean
}

export function selectSubmissionFields(
  fields: EvaluatedFormField[],
  logics: Logic[] = [],
  partialSubmission = false
): FormField[] {
  if (!partialSubmission) {
    return fields
  }

  const navigationFieldIds = new Set(
    logics
      .filter(logic => logic.payloads?.some(payload => payload.action.kind === ActionEnum.NAVIGATE))
      .map(logic => logic.fieldId)
  )
  const terminalIndex = fields.findIndex(
    field => navigationFieldIds.has(field.id) && field.isTouched !== true
  )

  if (terminalIndex < 0) {
    throw new BadRequestException('Invalid partial submission')
  }

  return fields.slice(0, terminalIndex + 1)
}

export function resolvePaymentConfiguration(
  properties: Property | undefined,
  variables: Record<string, any>
): { amount: number; currency: string } {
  const price = properties?.price
  const priceValue = price?.type === 'variable' ? variables[price.ref] : price?.value
  const currency = properties?.currency
  const amount = typeof priceValue === 'number' ? Math.round(priceValue * 100) : Number.NaN

  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new BadRequestException('Invalid payment amount')
  }

  if (typeof currency !== 'string' || !/^[a-z]{3}$/i.test(currency)) {
    throw new BadRequestException('Invalid payment currency')
  }

  return {
    amount,
    currency: currency.toLowerCase()
  }
}

export function normalizeSubmissionHiddenFields(
  definitions: HiddenField[] = [],
  submitted: HiddenFieldAnswer[] = []
): HiddenFieldAnswer[] {
  const used = new Set<string>()

  return definitions
    .map(definition => {
      if (used.has(definition.id)) {
        return
      }

      const answer = submitted.find(
        row => row?.id === definition.id || row?.name === definition.name
      )

      if (!answer) {
        return
      }

      used.add(definition.id)

      return {
        id: definition.id,
        name: definition.name,
        value: answer.value === undefined || answer.value === null ? '' : String(answer.value)
      }
    })
    .filter(Boolean) as HiddenFieldAnswer[]
}
