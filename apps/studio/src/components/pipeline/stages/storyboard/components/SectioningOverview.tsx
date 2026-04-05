import { useState, useEffect, useRef, useCallback } from "react"
import { useQueries, useQueryClient, useMutation } from "@tanstack/react-query"
import { api, BASE_URL, type PageSummaryItem, type PageDetail } from "@/api/client"
import type { SectionPart, PageSection } from "@adt/types"
import { invalidateStoryboardDependents } from "@/hooks/use-page-mutations"
import {
  ChevronDown,
  ChevronRight,
  Layers,
  Image,
  FileText,
  Loader2,
  SlidersHorizontal,
} from "lucide-react"
import { SectionActionsDropdown } from "./SectionActionsDropdown"
import { SectionEditToolbar } from "./SectionEditToolbar"
import { ImageCropDialog } from "./ImageCropDialog"
import { AiImageDialog } from "./AiImageDialog"
import { useApiKey } from "@/hooks/use-api-key"
import { useBookRun } from "@/hooks/use-book-run"
import { Trans } from "@lingui/react/macro"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"

type DetailPanel = "preview" | "metadata" | "textGroups" | "images" | "prunedImages"
const ALL_PANELS: DetailPanel[] = ["preview", "metadata", "textGroups", "images", "prunedImages"]

interface SectioningOverviewProps {
  bookLabel: string
  pages: PageSummaryItem[]
  onNavigateToSection?: (pageId: string, sectionIndex: number) => void
}

export function SectioningOverview({ bookLabel, pages, onNavigateToSection }: SectioningOverviewProps) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const { stageState } = useBookRun()
  const storyboardRunning = stageState("storyboard") === "running" || stageState("storyboard") === "queued"
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null)
  const [visiblePanels, setVisiblePanels] = useState<Set<DetailPanel>>(() => new Set(ALL_PANELS))
  const [allExpanded, setAllExpanded] = useState(false)
  const [expandSignal, setExpandSignal] = useState<{ action: "expand" | "collapse"; tick: number }>({ action: "collapse", tick: 0 })

  const togglePanel = (panel: DetailPanel) => {
    setVisiblePanels((prev) => {
      const next = new Set(prev)
      if (next.has(panel)) next.delete(panel)
      else next.add(panel)
      return next
    })
  }

  const panelLabels: Record<DetailPanel, string> = {
    preview: t`Preview`,
    metadata: t`Metadata`,
    textGroups: t`Text Groups`,
    images: t`Images`,
    prunedImages: t`Pruned Images`,
  }

  // Fetch full page details for all pages that have sections
  const pagesWithSections = pages.filter((p) => p.sectionCount > 0)
  const pageQueries = useQueries({
    queries: pagesWithSections.map((p) => ({
      queryKey: ["books", bookLabel, "pages", p.pageId],
      queryFn: () => api.getPage(bookLabel, p.pageId),
      staleTime: 30_000,
    })),
  })

  const isLoading = pageQueries.some((q) => q.isLoading)
  const pageDetails = pageQueries
    .map((q) => q.data)
    .filter((d): d is PageDetail => d != null)

  // Build ordered list of all page IDs (including those without sections) for adjacency
  const allPageIds = pages.map((p) => p.pageId)

  const invalidatePages = (...pageIds: string[]) => {
    for (const pid of pageIds) {
      queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages", pid] })
    }
    queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages"] })
    invalidateStoryboardDependents(queryClient, bookLabel)
  }

  const mergeMutation = useMutation({
    mutationFn: ({ pageId, sectionIndex, direction }: { pageId: string; sectionIndex: number; direction: "prev" | "next" }) =>
      api.mergeSection(bookLabel, pageId, sectionIndex, direction),
    onSuccess: (_data, vars) => invalidatePages(vars.pageId),
  })

  const mergeCrossPageMutation = useMutation({
    mutationFn: ({ pageId, sectionIndex, direction }: { pageId: string; sectionIndex: number; direction: "prev" | "next" }) =>
      api.mergeSectionCrossPage(bookLabel, pageId, sectionIndex, direction),
    onSuccess: (data) => invalidatePages(data.sourcePageId, data.targetPageId),
  })

  const cloneMutation = useMutation({
    mutationFn: ({ pageId, sectionIndex }: { pageId: string; sectionIndex: number }) =>
      api.cloneSection(bookLabel, pageId, sectionIndex),
    onSuccess: (_data, vars) => invalidatePages(vars.pageId),
  })

  const deleteMutation = useMutation({
    mutationFn: ({ pageId, sectionIndex }: { pageId: string; sectionIndex: number }) =>
      api.deleteSection(bookLabel, pageId, sectionIndex),
    onSuccess: (_data, vars) => invalidatePages(vars.pageId),
  })

  const togglePruneMutation = useMutation({
    mutationFn: ({ pageId, sectionIndex }: { pageId: string; sectionIndex: number }) => {
      const page = pageDetails.find((p) => p.pageId === pageId)
      if (!page?.sectioning) throw new Error("No sectioning data")
      const updated = {
        ...page.sectioning,
        sections: page.sectioning.sections.map((s, i) =>
          i === sectionIndex ? { ...s, isPruned: !s.isPruned } : s
        ),
      }
      return api.updateSectioning(bookLabel, pageId, updated)
    },
    onSuccess: (_data, vars) => invalidatePages(vars.pageId),
  })

  const isMutating = storyboardRunning || mergeMutation.isPending || mergeCrossPageMutation.isPending || cloneMutation.isPending || deleteMutation.isPending || togglePruneMutation.isPending

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <Trans>Loading sectioning data...</Trans>
      </div>
    )
  }

  if (pageDetails.length === 0) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        <Trans>No sectioning data available.</Trans>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-4 space-y-3">
        {/* Filter bar */}
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground"><Trans>Show:</Trans></span>
          {ALL_PANELS.map((panel) => (
            <button
              key={panel}
              type="button"
              onClick={() => togglePanel(panel)}
              className={cn(
                "px-2 py-1 text-xs rounded border transition-colors",
                visiblePanels.has(panel)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-accent"
              )}
            >
              {panelLabels[panel]}
            </button>
          ))}
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-8">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !allExpanded
                      setAllExpanded(next)
                      setExpandSignal({ action: next ? "expand" : "collapse", tick: Date.now() })
                    }}
                    className="hover:bg-accent rounded p-0.5 transition-colors"
                    title={allExpanded ? t`Collapse all sections` : t`Expand all sections`}
                  >
                    {allExpanded ? (
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    )}
                  </button>
                </th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-24">
                  <Trans>Page</Trans>
                </th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-40">
                  <Trans>Section</Trans>
                </th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-36">
                  <Trans>Type</Trans>
                </th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                  <Trans>Content</Trans>
                </th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-16 text-center">
                  <Trans>Parts</Trans>
                </th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-10" />
              </tr>
            </thead>
            <tbody>
              {pageDetails.map((page) => {
                const pageIdx = allPageIds.indexOf(page.pageId)
                const hasPrevPage = pageIdx > 0
                const hasNextPage = pageIdx < allPageIds.length - 1

                return (
                  <PageSectionRows
                    key={page.pageId}
                    page={page}
                    bookLabel={bookLabel}
                    hasPrevPage={hasPrevPage}
                    hasNextPage={hasNextPage}
                    onNavigateToSection={onNavigateToSection}
                    onMerge={(sectionIndex, direction) =>
                      mergeMutation.mutate({ pageId: page.pageId, sectionIndex, direction })
                    }
                    onMergeCrossPage={(sectionIndex, direction) =>
                      mergeCrossPageMutation.mutate({ pageId: page.pageId, sectionIndex, direction })
                    }
                    onClone={(sectionIndex) =>
                      cloneMutation.mutate({ pageId: page.pageId, sectionIndex })
                    }
                    onDelete={(sectionIndex) =>
                      deleteMutation.mutate({ pageId: page.pageId, sectionIndex })
                    }
                    onTogglePrune={(sectionIndex) =>
                      togglePruneMutation.mutate({ pageId: page.pageId, sectionIndex })
                    }
                    onConfirmAction={setConfirmDialog}
                    isMutating={isMutating}
                    visiblePanels={visiblePanels}
                    expandSignal={expandSignal}
                    onInvalidatePages={invalidatePages}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation dialog */}
      {confirmDialog && (
        <ConfirmDialog
          message={confirmDialog.message}
          onConfirm={() => {
            confirmDialog.onConfirm()
            setConfirmDialog(null)
          }}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Confirmation dialog
// ---------------------------------------------------------------------------

function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
}: {
  message: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useLingui()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-popover border rounded-lg shadow-lg p-4 max-w-sm mx-4">
        <p className="text-sm mb-4">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded border hover:bg-accent transition-colors"
          >
            {t`Cancel`}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {t`Continue`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Per-page section rows (with reasoning header)
// ---------------------------------------------------------------------------

function PageSectionRows({
  page,
  bookLabel,
  hasPrevPage,
  hasNextPage,
  onNavigateToSection,
  onMerge,
  onMergeCrossPage,
  onClone,
  onDelete,
  onTogglePrune,
  onConfirmAction,
  isMutating,
  visiblePanels,
  expandSignal,
  onInvalidatePages,
}: {
  page: PageDetail
  bookLabel: string
  hasPrevPage: boolean
  hasNextPage: boolean
  onNavigateToSection?: (pageId: string, sectionIndex: number) => void
  onMerge: (sectionIndex: number, direction: "prev" | "next") => void
  onMergeCrossPage: (sectionIndex: number, direction: "prev" | "next") => void
  onClone: (sectionIndex: number) => void
  onDelete: (sectionIndex: number) => void
  onTogglePrune: (sectionIndex: number) => void
  onConfirmAction: (dialog: { message: string; onConfirm: () => void }) => void
  isMutating: boolean
  visiblePanels: Set<DetailPanel>
  expandSignal: { action: "expand" | "collapse"; tick: number }
  onInvalidatePages: (...pageIds: string[]) => void
}) {
  const { t } = useLingui()
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [reasoningOpen, setReasoningOpen] = useState(false)

  const lastTick = useRef(expandSignal.tick)
  useEffect(() => {
    if (expandSignal.tick === lastTick.current) return
    lastTick.current = expandSignal.tick
    if (!page.sectioning) return
    if (expandSignal.action === "expand") {
      setExpanded(new Set(page.sectioning.sections.map((_, i) => i)))
    } else {
      setExpanded(new Set())
    }
  }, [expandSignal, page.sectioning])

  if (!page.sectioning) return null

  const sections = page.sectioning.sections
  const reasoning = page.sectioning.reasoning

  const toggleSection = (idx: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  return (
    <>
      {/* Page reasoning header row */}
      <tr className="bg-muted/30 border-b border-t">
        <td colSpan={7} className="px-0 py-0">
          <button
            type="button"
            onClick={() => setReasoningOpen(!reasoningOpen)}
            className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors"
          >
            <span className="font-medium text-xs">
              {page.pageId}
              {sections[0]?.pageNumber != null && (
                <span className="text-muted-foreground font-normal ml-1.5">
                  <Trans>(p.{sections[0].pageNumber})</Trans>
                </span>
              )}
            </span>
            <span className="text-muted-foreground text-[10px] ml-1">
              — {sections.length} {sections.length === 1 ? t`section` : t`sections`}
            </span>
            {reasoning && reasoning !== "No content to section" && (
              <>
                {reasoningOpen ? (
                  <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto shrink-0" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto shrink-0" />
                )}
              </>
            )}
          </button>
          {/* Expanded reasoning */}
          {reasoningOpen && reasoning && reasoning !== "No content to section" && (
            <div className="px-3 pb-3 pt-0">
              <div className="rounded border bg-violet-50/50 dark:bg-violet-950/20 p-3">
                <span className="text-[10px] font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wider">
                  {t`Sectioning Reasoning`}
                </span>
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed mt-1.5">
                  {reasoning}
                </pre>
              </div>
            </div>
          )}
        </td>
      </tr>

      {/* Section rows */}
      {sections.map((section, idx) => {
        const textParts = section.parts.filter((p) => p.type === "text_group")
        const imageParts = section.parts.filter((p) => p.type === "image")
        const isExpanded = expanded.has(idx)

        // Get rendering reasoning if available
        const renderSection = page.rendering?.sections.find(
          (r) => r.sectionIndex === idx
        )

        return (
          <SectionRow
            key={section.sectionId}
            page={page}
            section={section}
            sectionIndex={idx}
            sectionCount={sections.length}
            hasPrevPage={hasPrevPage}
            hasNextPage={hasNextPage}
            textParts={textParts}
            imageParts={imageParts}
            isExpanded={isExpanded}
            onToggle={() => toggleSection(idx)}
            renderReasoning={renderSection?.reasoning}
            bookLabel={bookLabel}
            onNavigate={onNavigateToSection ? () => onNavigateToSection(page.pageId, idx) : undefined}
            onMerge={(direction) => onMerge(idx, direction)}
            onMergeCrossPage={(direction) => onMergeCrossPage(idx, direction)}
            onClone={() => onClone(idx)}
            onDelete={() => onDelete(idx)}
            onTogglePrune={() => onTogglePrune(idx)}
            onConfirmAction={onConfirmAction}
            isMutating={isMutating}
            visiblePanels={visiblePanels}
            renderingVersion={page.versions.rendering}
            onInvalidatePages={onInvalidatePages}
          />
        )
      })}
    </>
  )
}

// ---------------------------------------------------------------------------
// Individual section row with expandable detail
// ---------------------------------------------------------------------------

function SectionRow({
  page,
  section,
  sectionIndex,
  sectionCount,
  hasPrevPage,
  hasNextPage,
  textParts,
  imageParts,
  isExpanded,
  onToggle,
  renderReasoning,
  bookLabel,
  onNavigate,
  onMerge,
  onMergeCrossPage,
  onClone,
  onDelete,
  onTogglePrune,
  onConfirmAction,
  isMutating,
  visiblePanels,
  renderingVersion,
  onInvalidatePages,
}: {
  page: PageDetail
  section: PageSection
  sectionIndex: number
  sectionCount: number
  hasPrevPage: boolean
  hasNextPage: boolean
  textParts: SectionPart[]
  imageParts: SectionPart[]
  isExpanded: boolean
  onToggle: () => void
  renderReasoning?: string
  bookLabel: string
  onNavigate?: () => void
  onMerge: (direction: "prev" | "next") => void
  onMergeCrossPage: (direction: "prev" | "next") => void
  onClone: () => void
  onDelete: () => void
  onTogglePrune: () => void
  onConfirmAction: (dialog: { message: string; onConfirm: () => void }) => void
  isMutating: boolean
  visiblePanels: Set<DetailPanel>
  renderingVersion: number | null
  onInvalidatePages: (...pageIds: string[]) => void
}) {
  const { t } = useLingui()
  const textCount = textParts.length
  const imageCount = imageParts.length

  // Build a content preview from the first text group
  const firstText = textParts[0]
  const preview = firstText?.type === "text_group"
    ? firstText.texts.map((tx) => tx.text).join(" ").slice(0, 120)
    : null

  return (
    <>
      <tr
        className={cn(
          "border-b hover:bg-muted/30 cursor-pointer transition-colors",
          section.isPruned && "opacity-50"
        )}
        onClick={onToggle}
      >
        <td className="px-3 py-2">
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </td>
        <td className="px-3 py-2">
          <span className="font-mono text-muted-foreground">
            {page.pageId}
          </span>
        </td>
        <td className="px-3 py-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onNavigate?.()
            }}
            className={cn(
              "font-mono hover:underline",
              onNavigate ? "text-violet-600 dark:text-violet-400" : "text-foreground"
            )}
            title={section.sectionId}
          >
            {section.sectionId}
          </button>
          {section.isPruned && (
            <span className="ml-1.5 text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1 rounded">
              <Trans>pruned</Trans>
            </span>
          )}
        </td>
        <td className="px-3 py-2">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            <Layers className="h-3 w-3" />
            {section.sectionType}
          </span>
        </td>
        <td className="px-3 py-2 text-muted-foreground truncate max-w-xs">
          {preview ? (
            <span title={preview}>{preview}…</span>
          ) : imageCount > 0 ? (
            <span className="italic"><Trans>Images only</Trans></span>
          ) : (
            <span className="italic"><Trans>Empty section</Trans></span>
          )}
        </td>
        <td className="px-3 py-2 text-center">
          <div className="flex items-center justify-center gap-2">
            {textCount > 0 && (
              <span className="flex items-center gap-0.5" title={t`${textCount} text groups`}>
                <FileText className="h-3 w-3 text-blue-500" />
                {textCount}
              </span>
            )}
            {imageCount > 0 && (
              <span className="flex items-center gap-0.5" title={t`${imageCount} images`}>
                <Image className="h-3 w-3 text-green-500" />
                {imageCount}
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-2">
          <SectionActionsDropdown
            sectionIndex={sectionIndex}
            sectionCount={sectionCount}
            isPruned={section.isPruned}
            hasPrevPage={hasPrevPage}
            hasNextPage={hasNextPage}
            onMerge={onMerge}
            onMergeCrossPage={onMergeCrossPage}
            onClone={onClone}
            onDelete={() => {
              onConfirmAction({
                message: t`Are you sure you want to delete this section? This action cannot be undone.`,
                onConfirm: onDelete,
              })
            }}
            onTogglePrune={onTogglePrune}
            onConfirmMerge={(label, action) => {
              onConfirmAction({
                message: t`Are you sure you want to ${label}? This action cannot be undone.`,
                onConfirm: action,
              })
            }}
            disabled={isMutating}
          />
        </td>
      </tr>

      {/* Expanded detail */}
      {isExpanded && (
        <tr className="border-b bg-muted/10">
          <td colSpan={7} className="px-6 py-3">
            <SectionDetail
              section={section}
              sectionIndex={sectionIndex}
              textParts={textParts as Extract<SectionPart, { type: "text_group" }>[]}
              imageParts={imageParts as Extract<SectionPart, { type: "image" }>[]}
              renderReasoning={renderReasoning}
              bookLabel={bookLabel}
              pageId={page.pageId}
              onConfirmAction={onConfirmAction}
              visiblePanels={visiblePanels}
              renderingVersion={renderingVersion}
              onNavigate={onNavigate}
              onInvalidatePages={onInvalidatePages}
            />
          </td>
        </tr>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Expanded section detail panel
// ---------------------------------------------------------------------------

function SectionDetail({
  section,
  sectionIndex,
  textParts,
  imageParts,
  renderReasoning,
  bookLabel,
  pageId,
  onConfirmAction,
  visiblePanels,
  renderingVersion,
  onNavigate,
  onInvalidatePages,
}: {
  section: { sectionId: string; sectionType: string; backgroundColor: string; textColor: string }
  sectionIndex: number
  textParts: Array<{ type: "text_group"; groupId: string; groupType: string; texts: Array<{ textId: string; textType: string; text: string; isPruned: boolean }>; isPruned: boolean }>
  imageParts: Array<{ type: "image"; imageId: string; isPruned: boolean; reason?: string }>
  renderReasoning?: string
  bookLabel: string
  pageId: string
  onConfirmAction: (dialog: { message: string; onConfirm: () => void }) => void
  visiblePanels: Set<DetailPanel>
  renderingVersion: number | null
  onNavigate?: () => void
  onInvalidatePages: (...pageIds: string[]) => void
}) {
  const { t } = useLingui()
  const { apiKey, hasApiKey } = useApiKey()
  const { stageState: detailStageState } = useBookRun()
  const storyboardRunning = detailStageState("storyboard") === "running" || detailStageState("storyboard") === "queued"
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const replaceTargetRef = useRef<string | null>(null)

  const [selectedImage, setSelectedImage] = useState<{
    imageId: string
    isPruned: boolean
    rect: DOMRect
  } | null>(null)
  const [cropTarget, setCropTarget] = useState<string | null>(null)
  const [recropPageSrc, setRecropPageSrc] = useState<string | null>(null)
  const [aiImageTarget, setAiImageTarget] = useState<string | null>(null)

  const handleImageClick = useCallback((e: React.MouseEvent, img: { imageId: string; isPruned: boolean }) => {
    if (storyboardRunning) return
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setSelectedImage({ imageId: img.imageId, isPruned: img.isPruned, rect })
  }, [storyboardRunning])

  const handleCrop = useCallback((dataId: string) => {
    setSelectedImage(null)
    setCropTarget(dataId)
  }, [])

  const handleCropApply = useCallback(async (blob: Blob) => {
    if (!cropTarget) return
    const result = await api.uploadCroppedImage(bookLabel, pageId, cropTarget, blob)
    // Swap the imageId in sectioning data
    const pageData = queryClient.getQueryData<PageDetail>(["books", bookLabel, "pages", pageId])
    if (pageData?.sectioning) {
      const updated = {
        ...pageData.sectioning,
        sections: pageData.sectioning.sections.map((s: PageSection, si: number) => {
          if (si !== sectionIndex) return s
          return {
            ...s,
            parts: s.parts.map((p: SectionPart) =>
              p.type === "image" && p.imageId === cropTarget ? { ...p, imageId: result.imageId } : p
            ),
          }
        }),
      }
      await api.updateSectioning(bookLabel, pageId, updated)
    }
    setCropTarget(null)
    setRecropPageSrc(null)
    onInvalidatePages(pageId)
  }, [cropTarget, bookLabel, pageId, sectionIndex, queryClient, onInvalidatePages])

  const handleRecropFromPage = useCallback(async (dataId: string) => {
    setSelectedImage(null)
    try {
      const { imageBase64 } = await api.getPageImage(bookLabel, pageId)
      setCropTarget(dataId)
      setRecropPageSrc(`data:image/png;base64,${imageBase64}`)
    } catch (err) {
      console.error(t`Failed to load page image`, err)
    }
  }, [bookLabel, pageId, t])

  const handleReplace = useCallback((dataId: string) => {
    setSelectedImage(null)
    replaceTargetRef.current = dataId
    fileInputRef.current?.click()
  }, [])

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const targetId = replaceTargetRef.current
    if (!file || !targetId) return
    e.target.value = ""
    replaceTargetRef.current = null
    const result = await api.uploadCroppedImage(bookLabel, pageId, targetId, file)
    const pageData = queryClient.getQueryData<PageDetail>(["books", bookLabel, "pages", pageId])
    if (pageData?.sectioning) {
      const updated = {
        ...pageData.sectioning,
        sections: pageData.sectioning.sections.map((s: PageSection, si: number) => {
          if (si !== sectionIndex) return s
          return {
            ...s,
            parts: s.parts.map((p: SectionPart) =>
              p.type === "image" && p.imageId === targetId ? { ...p, imageId: result.imageId } : p
            ),
          }
        }),
      }
      await api.updateSectioning(bookLabel, pageId, updated)
    }
    onInvalidatePages(pageId)
  }, [bookLabel, pageId, sectionIndex, queryClient, onInvalidatePages])

  const handleAiImage = useCallback((dataId: string) => {
    setSelectedImage(null)
    setAiImageTarget(dataId)
  }, [])

  const handleAiImageSubmit = useCallback(async (
    prompt: string,
    referenceImageId?: string,
    options?: { style?: string; imageType?: string; styleImageId?: string },
  ) => {
    if (!aiImageTarget) return
    setAiImageTarget(null)
    await api.aiGenerateImage(bookLabel, pageId, prompt, apiKey, aiImageTarget, referenceImageId, undefined, {
      ...options,
      sectionIndex,
      mode: "swap",
    })
    // Task-based: server saves on completion. Invalidate after a short delay to pick up the task.
    setTimeout(() => onInvalidatePages(pageId), 2000)
  }, [aiImageTarget, bookLabel, pageId, apiKey, sectionIndex, onInvalidatePages])

  const handleDelete = useCallback(async (dataId: string) => {
    setSelectedImage(null)
    const pageData = queryClient.getQueryData<PageDetail>(["books", bookLabel, "pages", pageId])
    if (pageData?.sectioning) {
      const updated = {
        ...pageData.sectioning,
        sections: pageData.sectioning.sections.map((s: PageSection, si: number) => {
          if (si !== sectionIndex) return s
          return { ...s, parts: s.parts.filter((p: SectionPart) => !(p.type === "image" && p.imageId === dataId)) }
        }),
      }
      await api.updateSectioning(bookLabel, pageId, updated)
    }
    onInvalidatePages(pageId)
  }, [bookLabel, pageId, sectionIndex, queryClient, onInvalidatePages])

  const handleTogglePrune = useCallback(async (dataId: string) => {
    setSelectedImage(null)
    const pageData = queryClient.getQueryData<PageDetail>(["books", bookLabel, "pages", pageId])
    if (pageData?.sectioning) {
      const updated = {
        ...pageData.sectioning,
        sections: pageData.sectioning.sections.map((s: PageSection, si: number) => {
          if (si !== sectionIndex) return s
          return {
            ...s,
            parts: s.parts.map((p: SectionPart) =>
              p.type === "image" && p.imageId === dataId ? { ...p, isPruned: !p.isPruned } : p
            ),
          }
        }),
      }
      await api.updateSectioning(bookLabel, pageId, updated)
    }
    onInvalidatePages(pageId)
  }, [bookLabel, pageId, sectionIndex, queryClient, onInvalidatePages])

  const sectionFilename = `${pageId}_sec${String(sectionIndex + 1).padStart(3, "0")}.html`
  const previewSrc = `${BASE_URL}/books/${bookLabel}/adt-preview/${sectionFilename}?embed=1&v=${renderingVersion ?? 0}`

  return (
    <div className="space-y-3">
      <div className="flex gap-4">
        {/* Rendered section thumbnail */}
        {visiblePanels.has("preview") && renderingVersion != null && (
          <div className="shrink-0">
            <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
              <Trans>Preview</Trans>
            </h4>
            <button
              type="button"
              className="w-[200px] h-[260px] border rounded overflow-hidden bg-white relative cursor-pointer hover:ring-2 hover:ring-violet-400 transition-shadow"
              onClick={() => onNavigate?.()}
              title={t`Edit this section`}
            >
              <iframe
                src={previewSrc}
                title={t`Section preview`}
                className="pointer-events-none origin-top-left"
                style={{
                  width: "800px",
                  height: "1040px",
                  transform: "scale(0.25)",
                  transformOrigin: "top left",
                }}
                sandbox="allow-same-origin"
              />
            </button>
          </div>
        )}

        {/* Detail panels */}
        <div className="flex-1 space-y-3 min-w-0">
          {/* Section metadata */}
          {visiblePanels.has("metadata") && (
            <>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-muted-foreground"><Trans>Background</Trans>:</span>
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block w-3 h-3 rounded border"
                    style={{ backgroundColor: section.backgroundColor }}
                  />
                  <span className="font-mono">{section.backgroundColor}</span>
                </span>
                <span className="text-muted-foreground"><Trans>Text</Trans>:</span>
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block w-3 h-3 rounded border"
                    style={{ backgroundColor: section.textColor }}
                  />
                  <span className="font-mono">{section.textColor}</span>
                </span>
              </div>

              {/* Render reasoning */}
              {renderReasoning && (
                <div className="rounded border bg-violet-50/50 dark:bg-violet-950/20 p-2">
                  <span className="text-[10px] font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wider">
                    {t`Render Reasoning`}
                  </span>
                  <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{renderReasoning}</p>
                </div>
              )}
            </>
          )}

          {/* Text groups */}
          {visiblePanels.has("textGroups") && textParts.length > 0 && (
            <div>
              <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                <Trans>Text Groups</Trans>
              </h4>
              <div className="space-y-2">
                {textParts.map((part) => (
                  <div
                    key={part.groupId}
                    className={cn(
                      "border rounded p-2",
                      part.isPruned && "opacity-50 border-dashed"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-[10px] text-muted-foreground">{part.groupId}</span>
                      <span className="text-[10px] px-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                        {part.groupType}
                      </span>
                      {part.isPruned && (
                        <span className="text-[10px] px-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                          <Trans>pruned</Trans>
                        </span>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      {part.texts.map((text) => (
                        <div
                          key={text.textId}
                          className={cn(
                            "flex gap-2 text-xs",
                            text.isPruned && "opacity-40 line-through"
                          )}
                        >
                          <span className="shrink-0 text-[10px] font-mono text-muted-foreground w-24">{text.textType}</span>
                          <span className="text-foreground">{text.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Images */}
          {visiblePanels.has("images") && imageParts.length > 0 && (() => {
            const showPruned = visiblePanels.has("prunedImages")
            const filteredImages = showPruned ? imageParts : imageParts.filter((img) => !img.isPruned)
            if (filteredImages.length === 0) return null
            return (
            <div>
              <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                <Trans>Images</Trans>
              </h4>
              <div className="flex flex-wrap gap-2">
                {filteredImages.map((img) => (
                  <div
                    key={img.imageId}
                    className={cn(
                      "border rounded p-1.5 flex flex-col items-center gap-1 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-shadow",
                      img.isPruned && "opacity-50 border-dashed",
                      selectedImage?.imageId === img.imageId && "ring-2 ring-primary"
                    )}
                    onClick={(e) => handleImageClick(e, img)}
                  >
                    <img
                      src={`${BASE_URL}/books/${bookLabel}/images/${img.imageId}`}
                      alt={img.imageId}
                      className="h-16 w-auto object-contain rounded"
                    />
                    <span className="text-[10px] font-mono text-muted-foreground">{img.imageId}</span>
                    {img.isPruned && (
                      <span className="text-[10px] text-amber-600"><Trans>pruned</Trans></span>
                    )}
                  </div>
                ))}
              </div>
            </div>
            )
          })()}
        </div>
      </div>

      {/* Image action toolbar (same as storyboard) */}
      {selectedImage && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setSelectedImage(null)} />
          <SectionEditToolbar
            dataId={selectedImage.imageId}
            rect={selectedImage.rect}
            containerOffset={{ top: 0, left: 0 }}
            isImage
            isPruned={selectedImage.isPruned}
            imageSrc={`${BASE_URL}/books/${bookLabel}/images/${selectedImage.imageId}`}
            onCrop={!storyboardRunning ? handleCrop : undefined}
            onRecropFromPage={!storyboardRunning ? handleRecropFromPage : undefined}
            onReplace={!storyboardRunning ? handleReplace : undefined}
            onAiImage={hasApiKey && !storyboardRunning ? handleAiImage : undefined}
            onDelete={!storyboardRunning ? (dataId) => {
              onConfirmAction({
                message: t`Are you sure you want to delete this image? This action cannot be undone.`,
                onConfirm: () => handleDelete(dataId),
              })
            } : undefined}
            onTogglePrune={!storyboardRunning ? handleTogglePrune : undefined}
          />
        </>
      )}

      {/* Hidden file input for image replace */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Crop dialog */}
      {cropTarget && (
        <ImageCropDialog
          imageSrc={recropPageSrc ?? `${BASE_URL}/books/${bookLabel}/images/${cropTarget}`}
          onApply={handleCropApply}
          onClose={() => { setCropTarget(null); setRecropPageSrc(null) }}
        />
      )}

      {/* AI image dialog */}
      {aiImageTarget && (
        <AiImageDialog
          currentImageSrc={`${BASE_URL}/books/${bookLabel}/images/${aiImageTarget}`}
          imageId={aiImageTarget}
          bookLabel={bookLabel}
          onSubmit={handleAiImageSubmit}
          onClose={() => setAiImageTarget(null)}
        />
      )}
    </div>
  )
}
