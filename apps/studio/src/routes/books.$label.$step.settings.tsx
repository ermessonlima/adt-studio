import { useState } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { X } from "lucide-react"
import { STAGES, isStageSlug } from "@/components/pipeline/stage-config"
import { resolveSettingsStageSlug } from "@/components/pipeline/settings-routing"
import { ExtractSettings } from "@/components/pipeline/stages/extract/ExtractSettings"
import { StoryboardSettings } from "@/components/pipeline/stages/storyboard/StoryboardSettings"
import { QuizzesSettings } from "@/components/pipeline/stages/quizzes/QuizzesSettings"
import { GlossarySettings } from "@/components/pipeline/stages/glossary/GlossarySettings"
import { TocSettings } from "@/components/pipeline/stages/toc/TocSettings"
import { CaptionsSettings } from "@/components/pipeline/stages/captions/CaptionsSettings"
import { TranslationsSettings } from "@/components/pipeline/stages/translations/TranslationsSettings"
import { ValidationSettings } from "@/components/pipeline/stages/ValidationSettings"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { cn } from "@/lib/utils"
import { Trans } from "@lingui/react/macro"

export const Route = createFileRoute("/books/$label/$step/settings")({
  component: StepSettingsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as string) ?? "general",
  }),
})

export function StepSettingsPage() {
  const { label, step } = Route.useParams()
  const { tab } = Route.useSearch()
  const stage = isStageSlug(step) ? STAGES.find((s) => s.slug === step) : undefined

  if (!stage) {
    return (
      <div className="flex flex-col h-full">
        <div className="shrink-0 h-10 px-4 flex items-center gap-2 text-white bg-gray-700">
          <span className="text-sm font-semibold"><Trans>Unknown stage</Trans></span>
        </div>
        <div className="p-4 max-w-2xl">
          <p className="text-sm text-muted-foreground">
            <Trans>Unknown step slug: {step}</Trans>
          </p>
          <Link
            to="/books/$label/$step"
            params={{ label, step: "book" }}
            className="text-sm text-primary hover:underline"
          >
            <Trans>Go to book</Trans>
          </Link>
        </div>
      </div>
    )
  }

  const stepLabel = stage.label
  const Icon = stage.icon
  const [headerTarget, setHeaderTarget] = useState<HTMLDivElement | null>(null)

  return (
    <div className="flex flex-col h-full">
      {/* Step header */}
      <div className={cn("shrink-0 h-10 px-4 flex items-center gap-2 text-white", stage.color)}>
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-white/20">
          <Icon className="w-3 h-3" />
        </div>
        <Link
          to="/books/$label/$step"
          params={{ label, step }}
          className="text-sm font-semibold hover:text-white/70 transition-colors"
        >
          {getStageLabelI18n(step)}
        </Link>
        <span className="text-white/40 text-sm">/</span>
        <span className="text-sm font-medium"><Trans>Settings</Trans></span>
        <div ref={setHeaderTarget} className="ml-auto" />
        <Link
          to="/books/$label/$step"
          params={{ label, step }}
          className="text-white/60 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </Link>
      </div>

      {/* Settings content */}
      <div className="flex-1 min-h-0 overflow-auto">
        {(() => {
          const settingsStage = resolveSettingsStageSlug(step)

          switch (settingsStage) {
            case "extract":
              return <ExtractSettings bookLabel={label} headerTarget={headerTarget} tab={tab} />
            case "storyboard":
              return <StoryboardSettings bookLabel={label} headerTarget={headerTarget} tab={tab} />
            case "quizzes":
              return <QuizzesSettings bookLabel={label} headerTarget={headerTarget} tab={tab} />
            case "glossary":
              return <GlossarySettings bookLabel={label} headerTarget={headerTarget} tab={tab} />
            case "toc":
              return <TocSettings bookLabel={label} headerTarget={headerTarget} />
            case "captions":
              return <CaptionsSettings bookLabel={label} headerTarget={headerTarget} tab={tab} />
            case "translate":
              return <TranslationsSettings bookLabel={label} headerTarget={headerTarget} tab={tab} stageSlug="translate" />
            case "speech":
              return <TranslationsSettings bookLabel={label} headerTarget={headerTarget} tab={tab} stageSlug="speech" />
            case "validation":
              return <ValidationSettings bookLabel={label} headerTarget={headerTarget} tab={tab} />
            default:
              return (
                <div className="p-4 max-w-2xl">
                  <p className="text-sm text-muted-foreground">
                    <Trans>Settings for this step are not yet available.</Trans>
                  </p>
                </div>
              )
          }
        })()}
      </div>
    </div>
  )
}
