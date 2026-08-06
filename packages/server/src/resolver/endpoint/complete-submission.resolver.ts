import {
  Answer,
  CaptchaKindEnum,
  FieldKindEnum,
  SubmissionCategoryEnum,
  SubmissionStatusEnum,
  Variable
} from '@heyform-inc/shared-types-enums'
import { BadRequestException, UseGuards } from '@nestjs/common'

import { CompleteSubmissionInput, CompleteSubmissionType } from '@graphql'
import { EndpointAnonymousIdGuard } from '@guard'
import { applyLogicToFields, fieldValuesToAnswers, flattenFields } from '@heyform-inc/answer-utils'
import { helper, timestamp } from '@heyform-inc/utils'
import { Args, Mutation, Resolver } from '@nestjs/graphql'
import {
  EndpointService,
  FormReportService,
  FormService,
  IntegrationService,
  PaymentService,
  SubmissionIpLimitService,
  SubmissionService
} from '@service'
import {
  ClientInfo,
  GqlClient,
  assertFormIsAcceptingSubmissions,
  normalizeSubmissionHiddenFields,
  resolvePaymentConfiguration,
  selectSubmissionFields
} from '@utils'

@Resolver()
@UseGuards(EndpointAnonymousIdGuard)
export class CompleteSubmissionResolver {
  constructor(
    private readonly endpointService: EndpointService,
    private readonly formService: FormService,
    private readonly submissionService: SubmissionService,
    private readonly submissionIpLimitService: SubmissionIpLimitService,
    private readonly formReportService: FormReportService,
    private readonly integrationService: IntegrationService,
    private readonly paymentService: PaymentService
  ) {}

  @Mutation(returns => CompleteSubmissionType)
  async completeSubmission(
    @GqlClient() client: ClientInfo,
    @Args('input') input: CompleteSubmissionInput
  ): Promise<CompleteSubmissionType> {
    const form = await this.formService.findById(input.formId)

    if (!form) {
      throw new BadRequestException('The form does not exist')
    }

    if (form.suspended) {
      throw new BadRequestException('The form is suspended')
    }

    if (form.settings.active !== true) {
      throw new BadRequestException('The form does not active')
    }

    const now = timestamp()
    assertFormIsAcceptingSubmissions(form.settings, now)

    if (helper.isEmpty(form!.fields)) {
      throw new BadRequestException('The form does not have content')
    }

    if (
      form.settings.enableQuotaLimit &&
      helper.isValid(form.settings.quotaLimit) &&
      form.settings.quotaLimit > 0
    ) {
      const count = await this.submissionService.countInForm(input.formId)

      if (count >= form.settings.quotaLimit) {
        throw new BadRequestException(
          'The submission quota exceeds, new submissions are no longer accepted'
        )
      }
    }

    if (
      form.settings.enableIpLimit &&
      helper.isValid(form.settings.ipLimitCount) &&
      form.settings.ipLimitCount > 0
    ) {
      await this.submissionIpLimitService.checkIp(form, client.ip)
    }

    // Check password
    if (form.settings.requirePassword) {
      const { password } = this.endpointService.decryptToken(input.passwordToken)

      if (password !== form.settings.password) {
        throw new BadRequestException('The password does not match')
      }
    }

    // Start submit time
    const openToken = this.endpointService.decryptToken(input.openToken)

    const startAt = this.endpointService.assertOpenToken(
      openToken,
      input.formId,
      form.settings,
      now
    )

    // Bot prevention check
    if (form.settings?.captchaKind !== CaptchaKindEnum.NONE) {
      await this.endpointService.antiBotCheck(form.settings?.captchaKind, input)
    }

    // Verify user submit content
    let answers: Answer[] = []
    let variables: Variable[] = []
    let variableValues: Record<string, any> = {}

    try {
      const logicResult = applyLogicToFields(
        flattenFields(form.fields, true),
        form.logics,
        form.variables,
        input.answers
      )
      const fields = selectSubmissionFields(
        logicResult.fields,
        form.logics,
        input.partialSubmission === true
      )
      variableValues = logicResult.variables

      answers = fieldValuesToAnswers(fields, input.answers)
      variables = form.variables?.map(variable => ({
        ...variable,
        value: variableValues[variable.id]
      }))
    } catch (err) {
      throw new BadRequestException(err.response)
    }

    let category = SubmissionCategoryEnum.INBOX
    let status = SubmissionStatusEnum.PUBLIC

    // Spam check
    if (form.settings?.filterSpam) {
      const isSpam = await this.endpointService.verifySpam({
        answers,
        ip: client.ip
      })

      if (isSpam) {
        category = SubmissionCategoryEnum.SPAM
      }
    }

    // Notification and Webhook still need the submission data
    // even archive settings have been disabled
    if (!form.settings?.allowArchive) {
      status = SubmissionStatusEnum.PRIVATE
    }

    const endAt = timestamp()

    // Payment amounts and currencies are always derived from the published form
    // configuration, never from respondent-controlled answer values.
    const paymentAnswers = answers.filter(answer => answer.kind === FieldKindEnum.PAYMENT)

    for (const paymentAnswer of paymentAnswers) {
      const payment = resolvePaymentConfiguration(paymentAnswer.properties, variableValues)
      const billingName = paymentAnswer.value?.billingDetails?.name

      paymentAnswer.value = {
        ...payment,
        billingDetails: {
          name: typeof billingName === 'string' ? billingName : ''
        }
      }
    }

    const paymentAnswer = paymentAnswers[0]

    const submissionId = await this.submissionService.create({
      teamId: form.teamId,
      formId: form.id,
      category,
      title: form.name,
      answers,
      hiddenFields: normalizeSubmissionHiddenFields(form.hiddenFields, input.hiddenFields),
      variables,
      startAt,
      endAt,
      ip: client.ip,
      userAgent: client.userAgent,
      status
    })

    // Payment
    const result: CompleteSubmissionType = {}

    if (helper.isValid(paymentAnswer) && helper.isValid(form.stripeAccount)) {
      result.clientSecret = await this.paymentService.createPaymentIntent({
        amount: paymentAnswer.value.amount,
        currency: paymentAnswer.value.currency,
        stripeAccountId: form.stripeAccount.accountId,
        metadata: {
          submissionId,
          fieldId: paymentAnswer.id
        }
      })

      await this.submissionService.updateAnswer(submissionId, {
        ...paymentAnswer,
        value: {
          ...paymentAnswer.value,
          clientSecret: result.clientSecret
        }
      })
    }

    // Form report Queue
    this.formReportService.addQueue(form.id)

    // Integration Queue
    this.integrationService.addQueue(form, submissionId)

    return result
  }
}
