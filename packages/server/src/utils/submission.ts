import {
  ActionEnum,
  FieldKindEnum,
  FormField,
  HiddenField,
  HiddenFieldAnswer,
  Logic,
  Property
} from '@heyform-inc/shared-types-enums'
import { BadRequestException } from '@nestjs/common'

import { APP_HOMEPAGE_URL, S3_PUBLIC_URL } from '@environments'

import { isAllowedUrlOrigin } from './outbound-url'

export const TRUSTED_SIGNATURE_ORIGINS = [APP_HOMEPAGE_URL, S3_PUBLIC_URL].filter(
  (origin): origin is string => typeof origin === 'string' && origin.length > 0
)

export function isTrustedSignatureUrl(
  value: unknown,
  allowedOrigins: string[] = TRUSTED_SIGNATURE_ORIGINS
): value is string {
  if (typeof value !== 'string') {
    return false
  }

  if (value.startsWith('data:image/png;base64,')) {
    return true
  }

  try {
    const url = new URL(value)

    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      isAllowedUrlOrigin(url, allowedOrigins)
    )
  } catch {
    return false
  }
}

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

export function assertSafeSpecialFieldAnswers(
  fields: FormField[],
  values: Record<string, any>
): void {
  for (const field of fields) {
    const value = values?.[field.id]

    if (value === undefined || value === null) {
      continue
    }

    let valid = true

    switch (field.kind) {
      case FieldKindEnum.LEGAL_TERMS:
        valid =
          typeof value === 'boolean' && (field.validations?.required !== true || value === true)
        break

      case FieldKindEnum.INPUT_TABLE:
        valid =
          Array.isArray(value) &&
          value.every(row => row !== null && typeof row === 'object' && !Array.isArray(row))
        break

      case FieldKindEnum.SIGNATURE:
        valid = isTrustedSignatureUrl(value)
        break
    }

    if (!valid) {
      throw new BadRequestException({
        id: field.id,
        kind: field.kind,
        message: 'Invalid field value',
        title: field.title
      })
    }
  }
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
