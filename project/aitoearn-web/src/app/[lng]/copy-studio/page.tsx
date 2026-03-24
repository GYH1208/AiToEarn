import { useTranslation } from '@/app/i18n'
import { fallbackLng, languages } from '@/app/i18n/settings'
import { getMetadata } from '@/utils/server-general'
import { CopyStudioPageContent } from './CopyStudioPageContent'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>
}) {
  let { lng } = await params
  if (!languages.includes(lng))
    lng = fallbackLng
  const { t } = await useTranslation(lng, 'route')

  return getMetadata(
    {
      title: `${t('copyStudio')} - AiToEarn`,
      description: 'AI Copy Studio for platform-specific marketing copywriting.',
      keywords: 'AI copywriting, social media copy, platform-specific copy',
    },
    lng,
    '/copy-studio',
  )
}

export default function CopyStudioPage() {
  return <CopyStudioPageContent />
}

