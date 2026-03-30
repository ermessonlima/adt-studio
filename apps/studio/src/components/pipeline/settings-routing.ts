export const SETTINGS_STAGE_SLUGS = [
  "extract",
  "storyboard",
  "quizzes",
  "glossary",
  "toc",
  "captions",
  "text-and-speech",
  "validation",
] as const

export type SettingsStageSlug = (typeof SETTINGS_STAGE_SLUGS)[number]

export function resolveSettingsStageSlug(step: string): SettingsStageSlug | null {
  return SETTINGS_STAGE_SLUGS.includes(step as SettingsStageSlug)
    ? (step as SettingsStageSlug)
    : null
}
