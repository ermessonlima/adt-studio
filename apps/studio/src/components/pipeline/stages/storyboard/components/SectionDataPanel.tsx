import { useState, useRef, useCallback, useEffect, type ReactNode } from "react"
import {
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  ImagePlus,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react"
import { SectionActionsDropdown } from "./SectionActionsDropdown"
import { BASE_URL } from "@/api/client"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { PageSection } from "@adt/types"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { getSectionTypeLabel, getSectionTypeDescription } from "@/lib/section-constants"

function getSectionTypeDisplayLabel(value: string): string {
  return getSectionTypeLabel(value) || value.replace(/_/g, " ")
}

function getSectionTypeDisplayDescription(value: string, configDesc: string): string {
  return getSectionTypeDescription(value) ?? configDesc
}

// -- Types --

interface SectionDataPanelProps {
  open: boolean
  onClose: () => void
  section: PageSection
  sectionIndex: number
  sectionCount: number
  bookLabel: string
  sectionTypes?: Record<string, string>
  textTypes?: Record<string, string>
  groupTypes?: Record<string, string>
  activityAnswers?: Record<string, string | boolean | number>
  onChangeSectionType: (type: string) => void
  onToggleSectionPruned: () => void
  onTogglePartPruned: (partIndex: number) => void
  onChangeGroupType: (partIndex: number, type: string) => void
  onChangeTextType: (partIndex: number, textIndex: number, type: string) => void
  onToggleTextPruned: (partIndex: number, textIndex: number) => void
  onDeleteTextEntry: (partIndex: number, textIndex: number) => void
  onDuplicateTextEntry: (partIndex: number, textIndex: number) => void
  onAddGroup: () => void
  onDuplicateGroup: (partIndex: number) => void
  onDeleteGroup: (partIndex: number) => void
  onReorderParts: (fromIndex: number, toIndex: number) => void
  onEditText: (partIndex: number, textIndex: number, newText: string) => void
  onMoveText: (
    fromPartIndex: number,
    textIndex: number,
    toPartIndex: number,
    toTextIndex: number
  ) => void
  onMergeSection: (dir: "prev" | "next") => void
  onMergeCrossPage?: (dir: "prev" | "next") => void
  hasPrevPage?: boolean
  hasNextPage?: boolean
  onCloneSection: () => void
  onDeleteSection: () => void
  onRerender: (prompt?: string) => void
  onAddImage: () => void
  onUpdateAnswer: (itemKey: string, value: string) => void
  // Version picker
  versionPickerNode: ReactNode
  // Disabled states
  pipelineRunning?: boolean
  merging: boolean
  cloning: boolean
  deleting: boolean
  saving: boolean
  rerendering: boolean
  dirty: boolean
  renderingDirty: boolean
  hasApiKey: boolean
  showPrunedImages: boolean
  onToggleShowPrunedImages: () => void
}

// -- ImageCard (inline) --

function ImageCard({
  imageId,
  bookLabel,
  isPruned,
  reason,
}: {
  imageId: string
  bookLabel: string
  isPruned?: boolean
  reason?: string
}) {
  const { t } = useLingui()
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(
    null
  )

  return (
    <div
      className={`relative rounded border overflow-hidden bg-card flex flex-col items-center min-h-[80px] transition-opacity duration-300 ${isPruned ? "opacity-40" : ""}`}
      title={isPruned ? t`Pruned: ${reason ?? ""}` : undefined}
    >
      <img
        src={`${BASE_URL}/books/${bookLabel}/images/${imageId}`}
        alt={imageId}
        className={`max-w-full h-auto block my-auto ${isPruned ? "grayscale" : ""}`}
        onLoad={(e) => {
          const img = e.target as HTMLImageElement
          setDimensions({ w: img.naturalWidth, h: img.naturalHeight })
        }}
        onError={(e) => {
          const target = e.target as HTMLImageElement
          target.style.display = "none"
        }}
      />
      <div className="px-2 py-1 flex items-center justify-between border-t bg-muted/30 w-full mt-auto">
        <span className="text-[10px] text-muted-foreground truncate">
          {imageId}
        </span>
        {dimensions && (
          <span className="text-[10px] text-muted-foreground shrink-0 ml-1">
            {dimensions.w}&times;{dimensions.h}
          </span>
        )}
      </div>
    </div>
  )
}

// -- Inline editable text --

function EditableText({
  value,
  onCommit,
  disabled,
}: {
  value: string
  onCommit: (newText: string) => void
  disabled?: boolean
}) {
  const { t } = useLingui()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  // Guard against double-commit (Enter triggers blur when textarea is removed)
  // and against committing on Escape (blur fires when editing is cancelled).
  const cancelRef = useRef(false)

  // Sync draft when value changes externally while not editing
  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  const commit = useCallback(() => {
    if (cancelRef.current) {
      cancelRef.current = false
      return
    }
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) {
      onCommit(trimmed)
    } else {
      setDraft(value)
    }
  }, [draft, value, onCommit])

  if (!editing) {
    return (
      <span
        className={cn("leading-relaxed flex-1 min-w-0 text-xs rounded px-0.5 -mx-0.5 transition-colors", disabled ? "cursor-default opacity-60" : "cursor-text hover:bg-accent/50")}
        onClick={() => {
          if (!disabled) setEditing(true)
        }}
        title={disabled ? undefined : t`Click to edit`}
      >
        {value}
      </span>
    )
  }

  return (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault()
          // Let blur handler do the commit — prevents double-fire
          cancelRef.current = false
          e.currentTarget.blur()
        }
        if (e.key === "Escape") {
          // Discard edit — suppress the blur commit
          cancelRef.current = true
          setDraft(value)
          setEditing(false)
        }
      }}
      className="leading-relaxed flex-1 min-w-0 text-xs rounded border border-ring bg-background px-1 py-0.5 -mx-0.5 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
      rows={Math.max(2, Math.ceil(draft.length / 50))}
      autoFocus
    />
  )
}

// -- Drag types --

const DRAG_TYPE_GROUP = "application/x-group-index"
const DRAG_TYPE_TEXT = "application/x-text-entry"

// -- Component --

export function SectionDataPanel({
  open,
  onClose,
  section,
  sectionIndex,
  sectionCount,
  bookLabel,
  sectionTypes,
  textTypes,
  groupTypes,
  activityAnswers,
  onChangeSectionType,
  onToggleSectionPruned,
  onTogglePartPruned,
  onChangeGroupType,
  onChangeTextType,
  onToggleTextPruned,
  onDeleteTextEntry,
  onDuplicateTextEntry,
  onEditText,
  onAddGroup,
  onDuplicateGroup,
  onDeleteGroup,
  onReorderParts,
  onMoveText,
  onMergeSection,
  onMergeCrossPage,
  hasPrevPage,
  hasNextPage,
  onCloneSection,
  onDeleteSection,
  onRerender,
  onAddImage,
  onUpdateAnswer,
  versionPickerNode,
  pipelineRunning,
  merging,
  cloning,
  deleting,
  saving,
  rerendering,
  dirty,
  renderingDirty,
  hasApiKey,
  showPrunedImages,
  onToggleShowPrunedImages,
}: SectionDataPanelProps) {
  const { t } = useLingui()
  const [rerenderOpen, setRerenderOpen] = useState(false)
  const [rerenderPrompt, setRerenderPrompt] = useState("")
  const parts = section.parts

  const hasTextParts = parts.some((p) => p.type === "text_group")
  const hasImageParts = parts.some((p) => p.type === "image")

  // -- Group drag state --
  const [dragGroupIdx, setDragGroupIdx] = useState<number | null>(null)
  // dropGroupSlot tracks the insertion point: "before:3" means insert before partIndex 3, "after:3" means insert after
  const [dropGroupSlot, setDropGroupSlot] = useState<string | null>(null)

  // -- Text drag state --
  const [dragText, setDragText] = useState<{
    partIndex: number
    textIndex: number
  } | null>(null)
  const [dropTarget, setDropTarget] = useState<{
    partIndex: number
    textIndex: number
  } | null>(null)
  const dragCounterRef = useRef(0)

  // -- Group drag handlers --
  const handleGroupDragStart = useCallback(
    (e: React.DragEvent, partIndex: number) => {
      e.dataTransfer.effectAllowed = "move"
      e.dataTransfer.setData(DRAG_TYPE_GROUP, String(partIndex))
      setDragGroupIdx(partIndex)
    },
    []
  )

  const handleGroupDragEnd = useCallback(() => {
    setDragGroupIdx(null)
    setDropGroupSlot(null)
  }, [])

  const handleGroupDragOver = useCallback(
    (e: React.DragEvent, partIndex: number) => {
      if (dragGroupIdx === null) return
      if (!e.dataTransfer.types.includes(DRAG_TYPE_GROUP)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "move"
      // Determine if cursor is in the top or bottom half of the element
      const rect = e.currentTarget.getBoundingClientRect()
      const midY = rect.top + rect.height / 2
      const slot = e.clientY < midY ? `before:${partIndex}` : `after:${partIndex}`
      setDropGroupSlot(slot)
    },
    [dragGroupIdx]
  )

  // Drop zone between groups: handles drops in the gaps
  const handleGapDragOver = useCallback(
    (e: React.DragEvent, insertBeforePartIndex: number) => {
      if (dragGroupIdx === null) return
      if (!e.dataTransfer.types.includes(DRAG_TYPE_GROUP)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "move"
      setDropGroupSlot(`before:${insertBeforePartIndex}`)
    },
    [dragGroupIdx]
  )

  const handleGroupDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (!dropGroupSlot) return
      const fromStr = e.dataTransfer.getData(DRAG_TYPE_GROUP)
      if (!fromStr) return
      const fromIndex = parseInt(fromStr, 10)
      const [position, idxStr] = dropGroupSlot.split(":")
      const targetIdx = parseInt(idxStr, 10)
      const toIndex = position === "after" ? targetIdx + 1 : targetIdx
      // Adjust: if dragging from before the insertion point, the removal shifts indices
      const adjustedTo = fromIndex < toIndex ? toIndex - 1 : toIndex
      if (fromIndex !== adjustedTo) {
        onReorderParts(fromIndex, adjustedTo)
      }
      setDragGroupIdx(null)
      setDropGroupSlot(null)
    },
    [onReorderParts, dropGroupSlot]
  )

  // -- Text drag handlers --
  const handleTextDragStart = useCallback(
    (e: React.DragEvent, partIndex: number, textIndex: number) => {
      e.stopPropagation() // don't trigger group drag
      e.dataTransfer.effectAllowed = "move"
      e.dataTransfer.setData(
        DRAG_TYPE_TEXT,
        JSON.stringify({ partIndex, textIndex })
      )
      setDragText({ partIndex, textIndex })
    },
    []
  )

  const handleTextDragEnd = useCallback(() => {
    setDragText(null)
    setDropTarget(null)
    dragCounterRef.current = 0
  }, [])

  const handleTextDragOver = useCallback(
    (e: React.DragEvent, partIndex: number, textIndex: number) => {
      if (!dragText) return
      if (!e.dataTransfer.types.includes(DRAG_TYPE_TEXT)) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = "move"
      setDropTarget({ partIndex, textIndex })
    },
    [dragText]
  )

  const handleGroupBodyDragOver = useCallback(
    (e: React.DragEvent, partIndex: number, textCount: number) => {
      if (!dragText) return
      if (!e.dataTransfer.types.includes(DRAG_TYPE_TEXT)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "move"
      // Drop at the end of the group
      setDropTarget({ partIndex, textIndex: textCount })
    },
    [dragText]
  )

  const handleTextDrop = useCallback(
    (e: React.DragEvent, toPartIndex: number, toTextIndex: number) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE_TEXT)) return // let group drops bubble up
      e.preventDefault()
      e.stopPropagation()
      const raw = e.dataTransfer.getData(DRAG_TYPE_TEXT)
      if (!raw) return
      const { partIndex: fromPartIndex, textIndex: fromTextIndex } = JSON.parse(
        raw
      ) as { partIndex: number; textIndex: number }

      if (fromPartIndex === toPartIndex && fromTextIndex === toTextIndex) {
        // No-op
      } else {
        onMoveText(fromPartIndex, fromTextIndex, toPartIndex, toTextIndex)
      }
      setDragText(null)
      setDropTarget(null)
      dragCounterRef.current = 0
    },
    [onMoveText]
  )

  const handleGroupBodyDrop = useCallback(
    (e: React.DragEvent, partIndex: number, textCount: number) => {
      handleTextDrop(e, partIndex, textCount)
    },
    [handleTextDrop]
  )

  return (
    <div
      className={`absolute top-0 right-0 h-full w-[480px] flex flex-col bg-background border-l shadow-lg transition-transform duration-200 ease-in-out z-30 ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      {/* Panel header */}
      <div className="border-b">
        <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground">
          <span className="font-medium uppercase tracking-wider">{t`Content`}</span>
          {sectionTypes ? (
            <Select
              value={section.sectionType}
              onValueChange={onChangeSectionType}
              disabled={pipelineRunning}
            >
              <SelectTrigger className="h-6 text-[10px] font-medium px-1.5 py-0 w-auto min-w-[80px] border-0 bg-muted/50">
                <SelectValue>
                  {getSectionTypeDisplayLabel(section.sectionType)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(sectionTypes).map(([key, desc]) => (
                  <SelectItem key={key} value={key} className="text-xs">
                    {getSectionTypeDisplayLabel(key)}
                    <span className="ml-1 text-muted-foreground text-[10px]">
                      {getSectionTypeDisplayDescription(key, desc)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="font-medium">{getSectionTypeDisplayLabel(section.sectionType)}</span>
          )}
          {/* Re-render button — right next to section type */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setRerenderOpen(!rerenderOpen)}
              disabled={rerendering || pipelineRunning || dirty || renderingDirty || saving || !hasApiKey}
              className="p-0.5 rounded hover:bg-accent transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
              title={
                pipelineRunning
                  ? t`Wait for storyboard to complete`
                  : !hasApiKey
                    ? t`API key required to re-render`
                    : dirty
                      ? t`Save changes before re-rendering`
                      : renderingDirty
                        ? t`Re-render (your edits will be preserved)`
                      : t`Re-render this section`
              }
            >
              {rerendering ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 text-blue-600" />
              )}
            </button>
            {rerenderOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 w-72 rounded-lg border bg-popover p-3 shadow-lg">
                <p className="text-xs font-medium mb-2">{t`Re-render section`}</p>
                <textarea
                  value={rerenderPrompt}
                  onChange={(e) => setRerenderPrompt(e.target.value)}
                  placeholder={t`Optional instructions for the LLM...`}
                  className="w-full text-xs rounded border bg-background px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  rows={3}
                />
                <div className="flex items-center justify-end gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRerenderOpen(false)
                      setRerenderPrompt("")
                    }}
                    className="text-xs px-2 py-1 rounded hover:bg-accent transition-colors cursor-pointer"
                  >
                    {t`Cancel`}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onRerender(rerenderPrompt.trim() || undefined)
                      setRerenderOpen(false)
                      setRerenderPrompt("")
                    }}
                    className="text-xs px-2.5 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
                  >
                    {t`Re-render`}
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <SectionActionsDropdown
              sectionIndex={sectionIndex}
              sectionCount={sectionCount}
              isPruned={section.isPruned}
              hasPrevPage={hasPrevPage}
              hasNextPage={hasNextPage}
              onTogglePrune={onToggleSectionPruned}
              onMerge={onMergeSection}
              onMergeCrossPage={onMergeCrossPage}
              onClone={onCloneSection}
              onDelete={onDeleteSection}
              disabled={merging || cloning || deleting || dirty || renderingDirty || saving || !!pipelineRunning}
            />
            {versionPickerNode}
            <button
              type="button"
              onClick={onClose}
              className="p-0.5 rounded hover:bg-accent transition-colors cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {/* Page row — background & text color */}
        {!section.isPruned && (
          <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-muted-foreground border-t">
            <span className="font-medium uppercase tracking-wider">{t`Page`}</span>
            <span
              className="w-3.5 h-3.5 rounded border"
              style={{ backgroundColor: section.backgroundColor }}
              title={t`Background: ${section.backgroundColor}`}
            />
            <span className="text-[10px]">{section.backgroundColor}</span>
            <span
              className="w-3.5 h-3.5 rounded border ml-2"
              style={{ backgroundColor: section.textColor }}
              title={t`Text color: ${section.textColor}`}
            />
            <span className="text-[10px]">{section.textColor}</span>
          </div>
        )}
      </div>

      {/* Pipeline running banner */}
      {pipelineRunning && (
        <div className="flex items-center gap-2 px-4 py-2 bg-violet-50 border-b text-xs text-violet-700">
          <Loader2 className="h-3 w-3 animate-spin shrink-0" />
          {t`Editing is disabled while the storyboard is running`}
        </div>
      )}

      {/* Panel body — scrollable */}
      <div className="overflow-auto flex-1 px-4 py-3 space-y-5">
        {/* Text groups */}
        <div>
          <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            <Layers className="h-3 w-3" />
            {t`Text Groups`}
          </h3>
          {hasTextParts && (
            <div>
              {parts.map((p, partIndex) => {
                if (p.type !== "text_group") return null
                const isGroupDragging = dragGroupIdx === partIndex
                const showDropLine = dropGroupSlot === `before:${partIndex}` && dragGroupIdx !== null && dragGroupIdx !== partIndex
                return (
                  <div key={p.groupId}>
                    {/* Drop zone gap before each group */}
                    <div
                      className={`transition-all duration-150 ${dragGroupIdx !== null ? "py-1.5" : "py-1"}`}
                      onDragOver={(e) => handleGapDragOver(e, partIndex)}
                      onDrop={handleGroupDrop}
                    >
                      {showDropLine && (
                        <div className="h-0.5 bg-primary rounded-full" />
                      )}
                    </div>
                    <div
                      className={`group/card rounded border overflow-hidden transition-all duration-150 ${
                        p.isPruned ? "opacity-40" : ""
                      } ${isGroupDragging ? "opacity-50 scale-[0.98]" : ""}`}
                      onDragOver={(e) => handleGroupDragOver(e, partIndex)}
                      onDrop={handleGroupDrop}
                    >
                    <div className="px-3 py-1.5 bg-muted/50 border-b flex items-center gap-1.5">
                      {/* Drag handle — visible on hover */}
                      <div
                        draggable={!pipelineRunning}
                        onDragStart={(e) => { if (pipelineRunning) { e.preventDefault(); return } handleGroupDragStart(e, partIndex) }}
                        onDragEnd={handleGroupDragEnd}
                        className={cn("p-0.5 -ml-1 rounded transition-colors opacity-0 group-hover/card:opacity-100", pipelineRunning ? "cursor-default opacity-30" : "cursor-grab active:cursor-grabbing hover:bg-accent")}
                        title={pipelineRunning ? undefined : t`Drag to reorder`}
                      >
                        <GripVertical className="h-3 w-3 text-muted-foreground" />
                      </div>
                      {groupTypes ? (
                        <Select
                          value={p.groupType}
                          onValueChange={(val) => onChangeGroupType(partIndex, val)}
                          disabled={pipelineRunning}
                        >
                          <SelectTrigger className="h-5 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0 w-auto min-w-[60px] border-0 bg-transparent text-muted-foreground">
                            <SelectValue>{p.groupType}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(groupTypes).map(([key, desc]) => (
                              <SelectItem key={key} value={key} className="text-xs">
                                {key}
                                <span className="ml-1 text-muted-foreground text-[10px]">{desc}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {p.groupType}
                        </span>
                      )}
                      <div className="ml-auto flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => onDuplicateGroup(partIndex)}
                          disabled={pipelineRunning}
                          className="p-0.5 rounded hover:bg-accent transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
                          title={t`Duplicate group`}
                        >
                          <Copy className="h-3 w-3 text-muted-foreground" />
                        </button>
                        {p.isPruned && (
                          <button
                            type="button"
                            onClick={() => onDeleteGroup(partIndex)}
                            disabled={pipelineRunning}
                            className="p-0.5 rounded hover:bg-red-100 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
                            title={t`Delete group`}
                          >
                            <Trash2 className="h-3 w-3 text-red-600" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onTogglePartPruned(partIndex)}
                          disabled={pipelineRunning}
                          className="p-0.5 rounded hover:bg-accent transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
                          title={
                            p.isPruned
                              ? t`Include in render`
                              : t`Exclude from render`
                          }
                        >
                          {p.isPruned ? (
                            <EyeOff className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <Eye className="h-3 w-3 text-muted-foreground" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div
                      className="divide-y"
                      onDragOver={(e) =>
                        handleGroupBodyDragOver(e, partIndex, p.texts.length)
                      }
                      onDrop={(e) =>
                        handleGroupBodyDrop(e, partIndex, p.texts.length)
                      }
                    >
                      {p.texts.length === 0 && (
                        <div className="px-3 py-3 text-xs text-muted-foreground/50 italic text-center">
                          {t`Empty group — drag text entries here`}
                        </div>
                      )}
                      {p.texts.map((textEntry, ti) => {
                        const isTextDragging =
                          dragText?.partIndex === partIndex &&
                          dragText?.textIndex === ti
                        const isTextDropTarget =
                          dropTarget?.partIndex === partIndex &&
                          dropTarget?.textIndex === ti &&
                          dragText !== null
                        return (
                          <div
                            key={textEntry.textId}
                            className={`group/text px-3 py-1.5 flex items-start gap-2 text-sm transition-all duration-150 ${
                              textEntry.isPruned ? "opacity-40" : ""
                            } ${isTextDragging ? "opacity-30 bg-muted/30" : ""} ${
                              isTextDropTarget
                                ? "border-t-2 !border-t-primary"
                                : ""
                            }`}
                            onDragOver={(e) =>
                              handleTextDragOver(e, partIndex, ti)
                            }
                            onDrop={(e) => handleTextDrop(e, partIndex, ti)}
                          >
                            {/* Drag handle — visible on hover */}
                            <div
                              draggable={!pipelineRunning}
                              onDragStart={(e) => { if (pipelineRunning) { e.preventDefault(); return } handleTextDragStart(e, partIndex, ti) }}
                              onDragEnd={handleTextDragEnd}
                              className={cn("shrink-0 p-0.5 mt-0.5 rounded transition-colors opacity-0 group-hover/text:opacity-100", pipelineRunning ? "cursor-default opacity-30" : "cursor-grab active:cursor-grabbing hover:bg-accent")}
                              title={pipelineRunning ? undefined : t`Drag to reorder or move to another group`}
                            >
                              <GripVertical className="h-3 w-3 text-muted-foreground/50" />
                            </div>
                            {textTypes ? (
                              <Select
                                value={textEntry.textType}
                                onValueChange={(val) =>
                                  onChangeTextType(partIndex, ti, val)
                                }
                                disabled={pipelineRunning}
                              >
                                <SelectTrigger className="shrink-0 h-5 text-[10px] font-medium px-1.5 py-0 w-auto min-w-[60px] border-0 bg-muted/50">
                                  <SelectValue>{textEntry.textType}</SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(textTypes).map(
                                    ([key, desc]) => (
                                      <SelectItem
                                        key={key}
                                        value={key}
                                        className="text-xs"
                                      >
                                        {key}
                                        <span className="ml-1 text-muted-foreground text-[10px]">
                                          {desc}
                                        </span>
                                      </SelectItem>
                                    )
                                  )}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="shrink-0 text-xs font-medium text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5 text-center">
                                {textEntry.textType}
                              </span>
                            )}
                            <EditableText
                              value={textEntry.text}
                              onCommit={(newText) =>
                                onEditText(partIndex, ti, newText)
                              }
                              disabled={pipelineRunning}
                            />
                            <div className="shrink-0 flex items-center gap-0.5 self-center opacity-0 group-hover/text:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={() => onDuplicateTextEntry(partIndex, ti)}
                                disabled={pipelineRunning}
                                className="p-0.5 rounded hover:bg-accent transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
                                title={t`Duplicate text entry`}
                              >
                                <Copy className="h-3 w-3 text-muted-foreground" />
                              </button>
                              {textEntry.isPruned && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteTextEntry(partIndex, ti)}
                                  disabled={pipelineRunning}
                                  className="p-0.5 rounded hover:bg-red-100 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
                                  title={t`Delete text entry`}
                                >
                                  <Trash2 className="h-3 w-3 text-red-600" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => onToggleTextPruned(partIndex, ti)}
                                disabled={pipelineRunning}
                                className="p-0.5 rounded hover:bg-accent transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
                                title={
                                  textEntry.isPruned
                                    ? t`Include in render`
                                    : t`Exclude from render`
                                }
                              >
                                {textEntry.isPruned ? (
                                  <EyeOff className="h-3 w-3 text-muted-foreground" />
                                ) : (
                                  <Eye className="h-3 w-3 text-muted-foreground" />
                                )}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    </div>
                  </div>
                )
              })}
              {/* Drop zone after the last group */}
              {dragGroupIdx !== null && (() => {
                const lastTextGroupIdx = parts.reduce((last, p, i) => p.type === "text_group" ? i : last, -1)
                const showDropLine = dropGroupSlot === `after:${lastTextGroupIdx}` && dragGroupIdx !== lastTextGroupIdx
                return (
                  <div
                    className="py-1.5"
                    onDragOver={(e) => {
                      if (!e.dataTransfer.types.includes(DRAG_TYPE_GROUP)) return
                      e.preventDefault()
                      e.dataTransfer.dropEffect = "move"
                      setDropGroupSlot(`after:${lastTextGroupIdx}`)
                    }}
                    onDrop={handleGroupDrop}
                  >
                    {showDropLine && (
                      <div className="h-0.5 bg-primary rounded-full" />
                    )}
                  </div>
                )
              })()}
            </div>
          )}
          <button
            type="button"
            onClick={onAddGroup}
            disabled={pipelineRunning}
            className={cn(
              "flex items-center justify-center gap-1.5 w-full rounded border border-dashed py-3 text-xs transition-colors mt-3",
              pipelineRunning
                ? "border-muted-foreground/20 text-muted-foreground/50 cursor-default"
                : "border-muted-foreground/30 hover:border-muted-foreground/60 text-muted-foreground hover:text-foreground cursor-pointer"
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            {t`Add Group`}
          </button>
        </div>

        {/* Activity Answers */}
        {activityAnswers && Object.keys(activityAnswers).length > 0 && (
          <div>
            <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              {t`Answers`}
            </h3>
            <div className="space-y-1.5">
              {Object.entries(activityAnswers)
                .sort(([a], [b]) => {
                  const numA = parseInt(a.replace(/\D/g, ""), 10) || 0
                  const numB = parseInt(b.replace(/\D/g, ""), 10) || 0
                  return numA - numB
                })
                .map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2 px-3 py-1.5 rounded border bg-amber-50/60">
                    <span className="shrink-0 text-[10px] font-medium text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">
                      {key}
                    </span>
                    <input
                      type="text"
                      value={String(value)}
                      onChange={(e) => onUpdateAnswer(key, e.target.value)}
                      disabled={pipelineRunning}
                      className="flex-1 min-w-0 text-xs rounded border border-transparent bg-transparent px-1.5 py-1 hover:border-border hover:bg-white focus:border-ring focus:bg-white focus:outline-none focus:ring-1 focus:ring-ring transition-colors disabled:opacity-50 disabled:cursor-default"
                    />
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Images */}
        <div>
          <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            {t`Images`}
            {hasImageParts &&
              parts.some((p) => p.type === "image" && p.isPruned) && (
                <button
                  type="button"
                  onClick={onToggleShowPrunedImages}
                  className="ml-auto flex items-center gap-1 text-[10px] font-normal normal-case tracking-normal text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title={
                    showPrunedImages
                      ? t`Hide pruned images`
                      : t`Show pruned images`
                  }
                >
                  {showPrunedImages ? (
                    <Eye className="h-3 w-3" />
                  ) : (
                    <EyeOff className="h-3 w-3" />
                  )}
                  {showPrunedImages ? t`Hide Pruned` : t`Show Pruned`}
                </button>
              )}
          </h3>
          {hasImageParts && (
            <div className="grid grid-cols-2 gap-2 mb-2">
              {parts.map((p, partIndex) => {
                if (p.type !== "image") return null
                if (p.isPruned && !showPrunedImages) return null
                return (
                  <div key={p.imageId} className="group relative">
                    <ImageCard
                      imageId={p.imageId}
                      bookLabel={bookLabel}
                      isPruned={p.isPruned}
                      reason={p.reason}
                    />
                    <button
                      type="button"
                      onClick={() => onTogglePartPruned(partIndex)}
                      disabled={pipelineRunning}
                      className="absolute top-1 right-1 p-1 rounded bg-background/80 hover:bg-accent transition-colors cursor-pointer opacity-0 group-hover:opacity-100 disabled:opacity-30 disabled:cursor-default"
                      title={
                        p.isPruned
                          ? t`Include in render`
                          : t`Exclude from render`
                      }
                    >
                      {p.isPruned ? (
                        <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          <button
            type="button"
            onClick={onAddImage}
            disabled={pipelineRunning}
            className={cn(
              "flex items-center justify-center gap-1.5 w-full rounded border border-dashed py-3 text-xs transition-colors",
              pipelineRunning
                ? "border-muted-foreground/20 text-muted-foreground/50 cursor-default"
                : "border-muted-foreground/30 hover:border-muted-foreground/60 text-muted-foreground hover:text-foreground cursor-pointer"
            )}
          >
            <ImagePlus className="h-3.5 w-3.5" />
            {t`Add Image`}
          </button>
        </div>
      </div>
    </div>
  )
}
