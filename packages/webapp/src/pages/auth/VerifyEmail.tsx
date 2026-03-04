import { useRequest } from 'ahooks'
import { useEffect } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import { UserService } from '@/services'
import { useRouter } from '@/utils'

import {
  Button,
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
  useToast
} from '@/components'
import { useUserStore } from '@/store'

export default function VerifyEmail() {
  const { t } = useTranslation()

  const router = useRouter()
  const toast = useToast()
  const { temporaryEmail, user, updateUser } = useUserStore()

  const { loading: sendLoading, run: sendRun } = useRequest(
    async () => {
      if (user.isEmailVerified) {
        return router.redirect('/')
      }

      await UserService.emailVerificationCode()
    },
    {
      manual: true,
      refreshDeps: [user.isEmailVerified],
      onError: err => {
        toast({
          title: t('components.error.title'),
          message: err.message
        })
      }
    }
  )

  useEffect(() => {
    if (!user.isEmailVerified && !temporaryEmail) {
      sendRun()
    }
  }, [sendRun, temporaryEmail, user.isEmailVerified])

  const { loading: verifyLoading, run: verifyRun } = useRequest(
    async (code: string) => {
      await UserService.verifyEmail(code)
      updateUser({
        isEmailVerified: true
      })
      router.redirect('/')
    },
    {
      manual: true
    }
  )

  return (
    <div className="mx-auto grid w-[21.875rem] gap-6 py-12 lg:py-0">
      <div className="grid gap-2 text-center">
        <h1 className="text-3xl font-bold">{t('verifyEmail.title')}</h1>
        <p className="text-secondary text-sm">
          {t('verifyEmail.subHeadline', { email: temporaryEmail })}
        </p>
      </div>

      <div className="mt-10">
        <InputOTP maxLength={6} loading={verifyLoading} onComplete={verifyRun}>
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
          </InputOTPGroup>
          <InputOTPSeparator />
          <InputOTPGroup>
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>

        <p className="text-secondary mt-4 text-center text-sm">
          <Trans
            t={t}
            i18nKey="verifyEmail.resend"
            components={{
              button: (
                <Button.Link
                  className="text-secondary hover:text-primary !p-0 underline hover:bg-transparent"
                  loading={sendLoading}
                  onClick={sendRun}
                />
              )
            }}
          />
        </p>
      </div>
    </div>
  )
}
