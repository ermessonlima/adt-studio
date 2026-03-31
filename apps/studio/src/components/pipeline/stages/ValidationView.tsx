import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertCircle, Loader2, RotateCcw, ShieldCheck } from "lucide-react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { api } from "@/api/client"
import { useBookRun } from "@/hooks/use-book-run"
import { useBookTasks } from "@/hooks/use-book-tasks"
import { AccessibilityOverviewTab } from "@/components/validation/AccessibilityValidationTabs"
import { ReviewerValidationSummaryTab } from "@/components/validation/ReviewerValidationSummaryTab"
import { useReviewerValidationCatalog } from "@/hooks/use-reviewer-validation"

const VALIDATION_TABS = new Set([
  "accessibility-summary",
  "reviewer-validation",
] as const)

function normalizeValidationTab(value: string | undefined) {
  if (value === "accessibility-config") {
    return "accessibility-summary"
  }
  return value && VALIDATION_TABS.has(value as never) ? value : "accessibility-summary"
}

export function ValidationView({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { tab?: string }
  const { stageState } = useBookRun()
  const { isTaskRunning, getTask } = useBookTasks(bookLabel)
  const reviewerValidationCatalog = useReviewerValidationCatalog(bookLabel)
  const reviewerValidationEnabled = reviewerValidationCatalog.data?.enabled ?? false
  const storyboardDone = stageState("storyboard") === "done"
  const ranRef = useRef(false)
  const [isSubmittingPackage, setIsSubmittingPackage] = useState(false)
  const [pendingPackagingTaskId, setPendingPackagingTaskId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const tab = useMemo(() => {
    const normalized = normalizeValidationTab(search.tab)
    return reviewerValidationEnabled ? normalized : "accessibility-summary"
  }, [reviewerValidationEnabled, search.tab])

  const runPackage = useCallback(async () => {
    setIsSubmittingPackage(true)
    setError(null)
    let taskId: string | undefined
    try {
      const result = await api.packageAdt(bookLabel)
      taskId = result.taskId
      if (taskId) {
        setPendingPackagingTaskId(taskId)
        return
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t`Packaging failed`)
    } finally {
      if (!taskId) {
        setIsSubmittingPackage(false)
      }
    }
  }, [bookLabel, t])

  useEffect(() => {
    if (!storyboardDone || ranRef.current) return
    ranRef.current = true
    void runPackage()
  }, [storyboardDone, runPackage])

  // Track task completion/failure to update local loading/error state.
  // Query invalidation is handled by the SSE task-complete handler in use-book-run.ts.
  useEffect(() => {
    if (!pendingPackagingTaskId) return
    const task = getTask(pendingPackagingTaskId)
    if (!task) return
    if (task.status === "completed") {
      setPendingPackagingTaskId(null)
      setIsSubmittingPackage(false)
    } else if (task.status === "failed") {
      setError(task.error ?? t`Packaging failed`)
      setPendingPackagingTaskId(null)
      setIsSubmittingPackage(false)
    }
  }, [getTask, pendingPackagingTaskId, t])

  if (!storyboardDone) {
    return (
      <div className="flex max-w-xl flex-col items-center gap-3 p-6 text-center">
        <AlertCircle className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          <Trans>A storyboard must be built before running validation.</Trans>
        </p>
        <p className="text-sm text-muted-foreground">
          <Trans>
            Run the pipeline through at least the <span className="font-medium text-foreground">Storyboard</span> stage first.
          </Trans>
        </p>
      </div>
    )
  }

  const packaging = isSubmittingPackage || pendingPackagingTaskId !== null || isTaskRunning("package-adt")

  if (packaging) {
    return (
      <div className="flex h-full items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        <span className="text-sm"><Trans>Packaging validation results...</Trans></span>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/20">
      <div className="border-b border-border bg-background/80 px-4 py-3 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold"><Trans>Validation</Trans></h3>
              <p className="mt-1 text-sm text-muted-foreground">
                <Trans>Whole-book checks for packaged ADT output, plus reviewer findings captured from Preview.</Trans>
              </p>
            </div>
          </div>

          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => void runPackage()}>
            <RotateCcw className="h-3.5 w-3.5" />
            <Trans>Refresh validation</Trans>
          </Button>
        </div>

        {error ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          void navigate({
            to: "/books/$label/$step",
            params: { label: bookLabel, step: "validation" },
            search: { tab: value },
            replace: true,
          })
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="border-b border-border bg-background px-4 py-2">
          <TabsList className="h-auto gap-1 bg-muted/80 p-1">
            <TabsTrigger value="accessibility-summary" className="px-3 py-1.5 text-xs">
              <Trans>Accessibility Summary</Trans>
            </TabsTrigger>
            {reviewerValidationEnabled ? (
              <TabsTrigger value="reviewer-validation" className="px-3 py-1.5 text-xs">
                <Trans>Reviewer Validation</Trans>
              </TabsTrigger>
            ) : null}
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <TabsContent value="accessibility-summary" className="m-0 h-full">
            <AccessibilityOverviewTab label={bookLabel} />
          </TabsContent>
          {reviewerValidationEnabled ? (
            <TabsContent value="reviewer-validation" className="m-0 h-full">
              <ReviewerValidationSummaryTab
                label={bookLabel}
                onOpenPreview={() => navigate({
                  to: "/books/$label/$step",
                  params: { label: bookLabel, step: "preview" },
                })}
                onOpenPreviewToPage={(href) => navigate({
                  to: "/books/$label/$step",
                  params: { label: bookLabel, step: "preview" },
                  search: { previewHref: href },
                })}
              />
            </TabsContent>
          ) : null}
        </div>
      </Tabs>
    </div>
  )
}
