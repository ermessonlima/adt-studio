import { useCallback } from "react"
import { Link } from "@tanstack/react-router"
import { getBookOverviewStages, isPipelineStage, type NonBookStageDefinition } from "../stage-config"
import { useBookRun } from "@/hooks/use-book-run"
import { useApiKey } from "@/hooks/use-api-key"
import { useAccessibilityAssessment } from "@/hooks/use-debug"
import { StageRunCard } from "../components/StageRunCard"

interface ViewProps {
  bookLabel: string
  selectedPageId?: string
  onSelectPage?: (pageId: string | null) => void
}

export function BookView({ bookLabel }: ViewProps) {
  const overviewSteps = getBookOverviewStages()
  const { stageState, queueRun } = useBookRun()
  const { apiKey, hasApiKey, azureKey, azureRegion, geminiKey } = useApiKey()
  const { data: accessibilityAssessment } = useAccessibilityAssessment(bookLabel)
  const validationCompleted = Boolean(accessibilityAssessment?.assessment)

  const handleRun = useCallback((stage: NonBookStageDefinition) => {
    if (!hasApiKey || !isPipelineStage(stage)) return

    const state = stageState(stage.slug)
    if (state === "running" || state === "queued") return

    queueRun({
      fromStage: stage.slug,
      toStage: stage.slug,
      apiKey,
      providerCredentials: {
        azure: { key: azureKey, region: azureRegion },
        geminiApiKey: geminiKey,
      },
    })
  }, [hasApiKey, stageState, queueRun, apiKey, azureKey, azureRegion, geminiKey])

  return (
    <div className="flex max-w-xl flex-col items-start">
      {overviewSteps.map((step, index) => {
        const isLast = index === overviewSteps.length - 1
        const state = step.slug === "validation" && validationCompleted ? "done" : stageState(step.slug)
        const isRunning = step.slug !== "validation" && (state === "running" || state === "queued")
        const stageCompleted = state === "done"
        const showRunButton = isPipelineStage(step) && step.slug !== "preview"

        return (
          <div key={step.slug} className="w-full">
            <Link
              to="/books/$label/$step"
              params={{ label: bookLabel, step: step.slug }}
              className="block"
            >
              <StageRunCard
                stageSlug={step.slug}
                isRunning={isRunning}
                completed={stageCompleted}
                showRunButton={showRunButton}
                onRun={() => handleRun(step)}
                disabled={!hasApiKey || isRunning}
              />
            </Link>
            {!isLast && (
              <div className={`mb-1 ml-3 flex w-8 flex-col items-center ${step.textColor} opacity-40`}>
                <div className="h-2 w-1.5 bg-current" />
                <svg viewBox="0 0 12 8" className="h-2 w-3" fill="currentColor">
                  <path d="M6 8L0 0h12z" />
                </svg>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
