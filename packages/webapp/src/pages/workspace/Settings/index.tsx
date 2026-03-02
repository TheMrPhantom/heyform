import { useTranslation } from 'react-i18next'

import { AnchorNavigation } from '@/components'

import BrandKitModal from './BrandKitModal'
import WorkspaceBranding from './Branding'
import WorkspaceDeletion from './Deletion'
import WorkspaceDeletionModal from './DeletionModal'
import WorkspaceGeneral from './General'

export default function WorkspaceSettings() {
  const { t } = useTranslation()

  return (
    <>
      <div className="w-full">
        <div className="mx-auto max-w-5xl">
          <h1 className="hf-page-title">{t('settings.title')}</h1>

          <hr className="my-6 w-full border-t border-[#e5e7eb]" />

          <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
            <aside className="lg:w-1/4">
              <AnchorNavigation
                menus={[
                  {
                    label: t('settings.general.title'),
                    value: 'general'
                  },
                  {
                    label: t('settings.branding.title'),
                    value: 'branding'
                  },
                  {
                    label: t('settings.deletion.title'),
                    value: 'deletion'
                  }
                ]}
              />
            </aside>

            <div className="hf-card flex-1 p-6">
              <WorkspaceGeneral />
              <WorkspaceBranding />
              <WorkspaceDeletion />
            </div>
          </div>
        </div>
      </div>

      <BrandKitModal />
      <WorkspaceDeletionModal />
    </>
  )
}
