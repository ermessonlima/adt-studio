import { useEffect, useState } from "react"
import type { AccessibilityAssessmentOutput, AccessibilityFinding, AccessibilityPageResult } from "@adt/types"
import type { I18n } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import { Trans, useLingui } from "@lingui/react/macro"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
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

function formatFindingCount(
  i18n: I18n,
  issueCount: number,
  reviewCount: number,
): string {
  const issuesLabel = issueCount > 0 ? i18n._(msg`${issueCount} ${issueCount === 1 ? "issue" : "issues"}`) : null
  const reviewLabel = reviewCount > 0
    ? i18n._(msg`${reviewCount} ${reviewCount === 1 ? "manual review item" : "manual review items"}`)
    : null

  if (issuesLabel && reviewLabel) {
    return i18n._(msg`${issuesLabel}, ${reviewLabel}`)
  }
  if (issuesLabel) {
    return issuesLabel
  }
  if (reviewLabel) {
    return reviewLabel
  }
  return i18n._(msg`No findings`)
}

function formatPageSummary(
  i18n: I18n,
  page: PageAccessibilitySummary,
): string {
  if (page.hasError) {
    return i18n._(msg`Accessibility check failed for this page`)
  }

  const countSummary = formatFindingCount(i18n, page.issueCount, page.reviewCount)
  return page.totalCount > 0 ? i18n._(msg`${countSummary} this page`) : i18n._(msg`No findings this page`)
}

function StatusIcon({
  isLoading,
  error,
  violationCount,
  incompleteCount,
  collapsed,
}: {
  isLoading: boolean
  error: Error | null
  violationCount: number
  incompleteCount: number
  collapsed: boolean
}) {
  const sizeClass = collapsed ? "h-3.5 w-3.5" : "h-4 w-4"

  if (isLoading) {
    return <Loader2 className={cn(sizeClass, "animate-spin text-muted-foreground")} />
  }
  if (error) {
    return <FileWarning className={cn(sizeClass, "text-destructive")} />
  }
  if (violationCount > 0) {
    return <AlertTriangle className={cn(sizeClass, "text-amber-600")} />
  }
  if (incompleteCount > 0) {
    return <CircleHelp className={cn(sizeClass, "text-sky-600")} />
  }
  return <CheckCircle2 className={cn(sizeClass, "text-emerald-600")} />
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
  const { t, i18n } = useLingui()
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

  const violationCount = assessment?.summary.violationCount ?? 0
  const incompleteCount = assessment?.summary.incompleteCount ?? 0

  const overallSummary = isLoading
    ? t`Checking accessibility`
    : error
      ? t`Unavailable`
      : assessment
        ? formatFindingCount(i18n,violationCount, incompleteCount)
        : t`No assessment`

  const pageSummary = currentPage
    ? formatPageSummary(i18n,currentPage)
    : assessment
      ? t`Open a page to see page-level findings`
      : isLoading
        ? t`Loading page-level findings`
        : t`Package preview to generate results`

  const expandedSummary = isLoading
    ? t`Refreshing results for this packaged preview.`
    : error
      ? t`Accessibility results are temporarily unavailable.`
      : null

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
          <StatusIcon
            isLoading={isLoading}
            error={error}
            violationCount={violationCount}
            incompleteCount={incompleteCount}
            collapsed
          />
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
          <StatusIcon
            isLoading={isLoading}
            error={error}
            violationCount={violationCount}
            incompleteCount={incompleteCount}
            collapsed={false}
          />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold"><Trans>Accessibility Findings</Trans></h3>
          {expandedSummary ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {expandedSummary}
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
