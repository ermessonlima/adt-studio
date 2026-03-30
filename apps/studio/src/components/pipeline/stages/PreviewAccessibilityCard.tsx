import { useEffect, useState } from "react"
import type { AccessibilityAssessmentOutput, AccessibilityFinding, AccessibilityPageResult } from "@adt/types"
import { useLingui } from "@lingui/react/macro"
import { Trans } from "@lingui/react/macro"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileWarning,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { AccessibilityCurrentPagePanel } from "@/components/accessibility/AccessibilityCurrentPagePanel"
import { cn } from "@/lib/utils"
import type { PageAccessibilitySummary } from "@/lib/accessibility-summary"

interface PreviewAccessibilityCardProps {
  label: string
  assessment: AccessibilityAssessmentOutput | null | undefined
  isLoading: boolean
  error: Error | null
  currentPage: PageAccessibilitySummary | null
  currentPageResult: AccessibilityPageResult | null
  panelOpen: boolean
  otherCardExpanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  onFindingHover?: (finding: AccessibilityFinding | null) => void
}

export function PreviewAccessibilityCard({
  label,
  assessment,
  isLoading,
  error,
  currentPage,
  currentPageResult,
  panelOpen,
  otherCardExpanded = false,
  onExpandedChange,
  onFindingHover,
}: PreviewAccessibilityCardProps) {
  const { t } = useLingui()
  const storageKey = `adt-preview-a11y-card:${label}`
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return true
    }
    return window.sessionStorage.getItem(storageKey) !== "expanded"
  })
  const [showCollapsedCard, setShowCollapsedCard] = useState(() => collapsed && !panelOpen)
  const [collapsedCardVisible, setCollapsedCardVisible] = useState(() => collapsed && !panelOpen)
  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }
    window.sessionStorage.setItem(storageKey, collapsed ? "collapsed" : "expanded")
  }, [collapsed, storageKey])

  useEffect(() => {
    if (panelOpen) {
      setCollapsed(true)
    }
  }, [panelOpen])

  useEffect(() => {
    onExpandedChange?.(!collapsed)
  }, [collapsed, onExpandedChange])

  useEffect(() => {
    if (!collapsed || panelOpen || otherCardExpanded) {
      setCollapsedCardVisible(false)
      setShowCollapsedCard(false)
      return
    }

    if (typeof window === "undefined") {
      setShowCollapsedCard(true)
      setCollapsedCardVisible(true)
      return
    }

    const timeoutId = window.setTimeout(() => {
      setShowCollapsedCard(true)
      window.requestAnimationFrame(() => {
        setCollapsedCardVisible(true)
      })
    }, 140)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [collapsed, otherCardExpanded, panelOpen])

  const overallSummary = isLoading
    ? t`Checking accessibility`
    : error
      ? t`Unavailable`
      : assessment
        ? ""
        : t`No assessment`
  const pageSummary = currentPage
    ? currentPage.hasError
      ? t`Accessibility check failed for this page`
      : t`${currentPage.totalCount} ${currentPage.totalCount === 1 ? "finding" : "findings"} this page`
    : assessment
      ? t`Open a page to see page-level findings`
      : isLoading
        ? t`Loading page-level findings`
        : t`Package preview to generate results`

  if (collapsed) {
    if (!showCollapsedCard) {
      return null
    }

    return (
      <button
        type="button"
        className={cn(
          "fixed bottom-14 right-4 z-40 flex w-[min(22.5rem,calc(100vw-2rem))] items-start gap-3 rounded-2xl border bg-background/95 px-3.5 py-3 text-left shadow-md backdrop-blur-sm transition-all duration-150 ease-out supports-[backdrop-filter]:bg-background/90",
          collapsedCardVisible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0",
        )}
        onClick={() => setCollapsed(false)}
        title={t`Show accessibility summary`}
      >
        <div className="mt-0.5 shrink-0">
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : error ? (
            <FileWarning className="h-3.5 w-3.5 text-destructive" />
          ) : assessment?.summary.violationCount || assessment?.summary.incompleteCount ? (
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium"><Trans>Accessibility</Trans></span>
            {overallSummary ? <span className="shrink-0 text-[11px] text-muted-foreground">{overallSummary}</span> : null}
          </div>
          <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{pageSummary}</div>
        </div>

        <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
    )
  }

  return (
    <div className="absolute right-4 top-4 z-20 flex max-h-[calc(100%-2rem)] w-[440px] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-3xl border bg-background/95 shadow-xl backdrop-blur-sm supports-[backdrop-filter]:bg-background/90">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <div className="shrink-0">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : error ? (
            <FileWarning className="h-4 w-4 text-destructive" />
          ) : assessment?.summary.violationCount || assessment?.summary.incompleteCount ? (
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold"><Trans>Accessibility Findings</Trans></h3>
          {!assessment && (isLoading || error) ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {isLoading
                ? <Trans>Refreshing results for this packaged preview.</Trans>
                : <Trans>Accessibility results are temporarily unavailable.</Trans>}
            </p>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-full"
          onClick={() => setCollapsed(true)}
          title={t`Collapse accessibility summary`}
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 pb-4 pt-3 text-sm">
        <AccessibilityCurrentPagePanel
          page={currentPageResult}
          summary={currentPage}
          embedded
          emptyMessage={t`Open a page in Preview to show its page-specific accessibility findings here.`}
          onFindingHover={onFindingHover}
        />
      </div>
    </div>
  )
}
