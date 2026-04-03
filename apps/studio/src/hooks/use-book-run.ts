import { useEffect, useCallback, useRef, createContext, useContext, useState } from "react"
import { useQueryClient, useQuery } from "@tanstack/react-query"
import { i18n } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import {
  api,
  BASE_URL,
  type TaskInfoResponse,
  type StageRunProviderCredentials,
} from "@/api/client"
import { STEP_TO_STAGE, PIPELINE, getStageClearOrder, PAGE_PROGRESS_STEPS } from "@adt/types"
import type { StageName } from "@adt/types"
import { isStageComplete } from "./run-state"
import { bookTasksKey } from "./use-book-tasks"
import { invalidateStoryboardDependents } from "./use-page-mutations"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StageState = "idle" | "queued" | "running" | "done" | "error"
export type StepState = "idle" | "running" | "done" | "error" | "skipped"

export interface StepProgress {
  page?: number
  totalPages?: number
}

export interface QueueRunOptions {
  fromStage: string
  toStage: string
  apiKey: string
  /** When true, skip page-sectioning and only re-render from existing section data. */
  renderOnly?: boolean
  providerCredentials?: StageRunProviderCredentials
}

/** Shape returned by the enriched GET /books/:label/step-status endpoint. */
interface StepStatusResponse {
  stages: Record<string, string>
  steps: Record<string, string>
  error: string | null
  stepErrors?: Record<string, string> | null
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface BookRunContextValue {
  /** Stage state: idle / queued / running / done / error */
  stageState(stage: string): StageState
  /** Step state: idle / running / done / error */
  stepState(step: string): StepState
  /** Sub-step progress for running steps (page X/Y) */
  stepProgress(step: string): StepProgress | undefined
  /** Per-step error message (if in error state) */
  stepError(step: string): string | undefined
  /** Run error message */
  error: string | null
  /** Is any stage running or queued? */
  isRunning: boolean
  /** Queue a stage run */
  queueRun(options: QueueRunOptions): void
}

const BookRunContext = createContext<BookRunContextValue | null>(null)
export const BookRunProvider = BookRunContext.Provider

export function useBookRun(): BookRunContextValue {
  const ctx = useContext(BookRunContext)
  if (!ctx) throw new Error("useBookRun must be used within a BookRunProvider")
  return ctx
}

// ---------------------------------------------------------------------------
// Query key
// ---------------------------------------------------------------------------

const stepStatusKey = (label: string) => ["books", label, "step-status"] as const

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBookRunStatus(label: string): BookRunContextValue {
  const queryClient = useQueryClient()

  // Primary source of truth: enriched step-status from the server
  const { data } = useQuery<StepStatusResponse>({
    queryKey: stepStatusKey(label),
    queryFn: () => api.getStepStatus(label),
    enabled: !!label,
  })

  // Sub-step progress is cosmetic (page X/Y during a running step).
  // Stored in a ref + state counter so we don't trigger full re-renders on
  // every progress tick — only the counter bump causes the memo to recalc.
  const progressRef = useRef<Map<string, StepProgress>>(new Map())
  const [progressTick, setProgressTick] = useState(0)

  // Throttle progressive page invalidations during storyboard runs
  const lastPageInvalidateRef = useRef<number>(0)

  // Serialized run queue — chains API calls so they arrive in click order
  const runChainRef = useRef<Promise<void>>(Promise.resolve())

  // ------------------------------------------------------------------
  // Always-on SSE — opens on mount, closes on unmount
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!label) return

    const url = `${BASE_URL}/books/${label}/stages/status`
    const es = new EventSource(url)

    // Refetch on (re)connection to catch up on any missed events
    es.addEventListener("open", () => {
      queryClient.invalidateQueries({ queryKey: stepStatusKey(label) })
    })

    es.addEventListener("progress", (e) => {
      const d = JSON.parse(e.data)
      const pipelineStep = d.step as string
      const uiStage = (STEP_TO_STAGE as Record<string, string>)[pipelineStep]
      if (!uiStage) return

      // Cancel any in-flight step-status fetch — its response reflects a
      // point-in-time snapshot that is already stale relative to this SSE event.
      // Only cancel if we already have baseline data; otherwise the initial
      // fetch (on page load) would be killed and the UI would stay idle.
      if (queryClient.getQueryData(stepStatusKey(label))) {
        queryClient.cancelQueries({ queryKey: stepStatusKey(label) })
      }

      if (d.type === "step-start") {
        // Mark step as running in the query cache
        queryClient.setQueryData<StepStatusResponse>(stepStatusKey(label), (old) => {
          if (!old) return old
          return {
            ...old,
            stages: { ...old.stages, [uiStage]: "running" },
            steps: { ...old.steps, [pipelineStep]: "running" },
          }
        })
        // Clear progress for this step
        progressRef.current.delete(pipelineStep)
      } else if (d.type === "step-progress" && d.totalPages) {
        progressRef.current.set(pipelineStep, {
          page: d.page ?? 0,
          totalPages: d.totalPages,
        })
        setProgressTick((t) => t + 1)
        // Also ensure step is marked running in the cache (handles missed step-start on reconnect)
        queryClient.setQueryData<StepStatusResponse>(stepStatusKey(label), (old) => {
          if (!old || old.steps[pipelineStep] === "running") return old
          return {
            ...old,
            stages: { ...old.stages, [uiStage]: "running" },
            steps: { ...old.steps, [pipelineStep]: "running" },
          }
        })
        // Progressively refresh page data during storyboard steps so the UI
        // can show sections/renderings as they complete (throttled to ~2s).
        // Invalidates both the page list (sidebar) and individual page details.
        if ((PAGE_PROGRESS_STEPS as ReadonlySet<string>).has(pipelineStep)) {
          const now = Date.now()
          if (now - lastPageInvalidateRef.current > 2000) {
            lastPageInvalidateRef.current = now
            queryClient.invalidateQueries({ queryKey: ["books", label, "pages"] })
          }
        }
      } else if (d.type === "step-complete" || d.type === "step-skip") {
        // Mark step as done/skipped, recompute stage state
        const nextStepState: StepState = d.type === "step-skip" ? "skipped" : "done"
        queryClient.setQueryData<StepStatusResponse>(stepStatusKey(label), (old) => {
          if (!old) return old
          const steps = { ...old.steps, [pipelineStep]: nextStepState }

          // Recompute the parent stage: if all steps are done/skipped, stage is done
          const stageDef = PIPELINE.find((s) => s.name === uiStage)
          const allDone = isStageComplete(stageDef?.steps.map((s) => steps[s.name]) ?? [])
          const stages = {
            ...old.stages,
            [uiStage]: allDone ? "done" : old.stages[uiStage],
          }

          return { ...old, stages, steps }
        })
        progressRef.current.delete(pipelineStep)

        // Also invalidate data queries for the completed step's stage
        invalidateStageData(queryClient, label, uiStage)
        if (pipelineStep === "metadata") {
          queryClient.invalidateQueries({ queryKey: ["books", label] })
          queryClient.invalidateQueries({ queryKey: ["books"] })
        }
      } else if (d.type === "step-error") {
        queryClient.setQueryData<StepStatusResponse>(stepStatusKey(label), (old) => {
          if (!old) return old
          return {
            ...old,
            stages: { ...old.stages, [uiStage]: "error" },
            steps: { ...old.steps, [pipelineStep]: "error" },
            stepErrors: { ...old.stepErrors, [pipelineStep]: d.error ?? i18n._(msg`Step failed`) },
            error: d.error ?? i18n._(msg`Step failed`),
          }
        })
      }
    })

    // A queued run has started executing — full refetch to reconcile
    es.addEventListener("queue-next", () => {
      progressRef.current.clear()
      lastPageInvalidateRef.current = 0
      queryClient.invalidateQueries({ queryKey: stepStatusKey(label) })
    })

    // Run completed — full refetch to reconcile with DB
    es.addEventListener("complete", () => {
      progressRef.current.clear()
      queryClient.invalidateQueries({ queryKey: stepStatusKey(label) })
      invalidateBookQueries(queryClient, label)
    })

    es.addEventListener("error", (e) => {
      if (es.readyState === EventSource.CLOSED) return
      const me = e as MessageEvent
      if (me.data) {
        try {
          const d = JSON.parse(me.data)
          queryClient.setQueryData<StepStatusResponse>(stepStatusKey(label), (old) => {
            if (!old) return old
            return { ...old, error: d.error ?? i18n._(msg`Step run failed`) }
          })
        } catch { /* ignore */ }
      }
      // Refetch to get the authoritative state
      queryClient.invalidateQueries({ queryKey: stepStatusKey(label) })
    })

    // Handle ad-hoc task events (image generation, packaging, etc.)
    es.addEventListener("task", (e) => {
      const d = JSON.parse(e.data) as { type: string; taskId: string; kind?: string; description?: string; pageId?: string; url?: string; error?: string; result?: unknown; message?: string; percent?: number }
      const tasksKey = bookTasksKey(label)

      queryClient.setQueryData<{ tasks: TaskInfoResponse[] }>(tasksKey, (old) => {
        const tasks = [...(old?.tasks ?? [])]
        const idx = tasks.findIndex((t) => t.taskId === d.taskId)

        if (d.type === "task-start") {
          if (idx === -1) {
            tasks.push({
              taskId: d.taskId,
              kind: d.kind ?? "package-adt",
              status: "running",
              description: d.description ?? "",
              pageId: d.pageId,
              url: d.url,
              startedAt: Date.now(),
            })
          }
        } else if (d.type === "task-complete") {
          if (idx !== -1) {
            tasks[idx] = { ...tasks[idx], status: "completed", result: d.result, completedAt: Date.now() }
          }
          // Invalidate related data — use cache entry if available, fall back to polling
          const completedTask = idx !== -1 ? tasks[idx] : undefined
          if (completedTask?.kind === "package-adt") {
            queryClient.invalidateQueries({ queryKey: ["books", label, "step-status"] })
            queryClient.invalidateQueries({ queryKey: ["debug", "accessibility", label] })
            queryClient.invalidateQueries({ queryKey: ["debug", "versions", label, "accessibility-assessment", "book"] })
            queryClient.invalidateQueries({ queryKey: ["book-config", label] })
          }
          if ((completedTask?.kind === "image-generate" || completedTask?.kind === "re-render" || completedTask?.kind === "ai-edit") && completedTask.pageId) {
            queryClient.invalidateQueries({ queryKey: ["books", label, "pages", completedTask.pageId] })
          }
          if (completedTask?.kind === "re-render" || completedTask?.kind === "ai-edit" || completedTask?.kind === "image-generate") {
            invalidateStoryboardDependents(queryClient, label)
          }
          // Always refetch tasks so we pick up the final state even if we missed start
          queryClient.invalidateQueries({ queryKey: bookTasksKey(label) })
        } else if (d.type === "task-error") {
          if (idx !== -1) {
            tasks[idx] = { ...tasks[idx], status: "failed", error: d.error, completedAt: Date.now() }
          }
        }
        // task-progress: no status change needed, could update description

        return { tasks }
      })
    })

    return () => {
      es.close()
    }
  }, [label, queryClient])

  // ------------------------------------------------------------------
  // queueRun — optimistic update + API call
  // ------------------------------------------------------------------
  const queueRun = useCallback(
    (options: QueueRunOptions) => {
      const { fromStage, toStage, apiKey, renderOnly, providerCredentials } = options

      // Optimistically mark target stage(s) as queued and clear downstream
      const stagesToClear = new Set(getStageClearOrder(fromStage as StageName))
      queryClient.setQueryData<StepStatusResponse>(stepStatusKey(label), (old) => {
        if (!old) return old
        const stages = { ...old.stages }
        const steps = { ...old.steps }

        for (const stage of stagesToClear) {
          const stageDef = PIPELINE.find((s) => s.name === stage)
          if (stageDef) {
            for (const step of stageDef.steps) {
              // Render-only: preserve page-sectioning step state
              if (renderOnly && step.name === "page-sectioning") continue
              steps[step.name] = "idle"
            }
          }
          stages[stage] = "idle"
        }

        // Mark the target stage as queued
        stages[fromStage] = "queued"

        return { ...old, stages, steps, error: null }
      })

      // Clear cosmetic progress only for downstream steps being reset
      for (const stage of stagesToClear) {
        const stageDef = PIPELINE.find((s) => s.name === stage)
        if (stageDef) {
          for (const step of stageDef.steps) {
            if (renderOnly && step.name === "page-sectioning") continue
            progressRef.current.delete(step.name)
          }
        }
      }
      setProgressTick((t) => t + 1)

      // Chain the API call so they arrive in click order
      runChainRef.current = runChainRef.current.then(async () => {
        try {
          await api.runStages(label, apiKey, { fromStage, toStage, renderOnly }, providerCredentials)
          // Refetch to reconcile — backend cleared step_runs
          queryClient.invalidateQueries({ queryKey: stepStatusKey(label) })
        } catch {
          // Don't reset — other stages may still be running/queued
        }
      })
    },
    [label, queryClient]
  )

  // ------------------------------------------------------------------
  // Accessors
  // ------------------------------------------------------------------
  const stageState = useCallback(
    (stage: string): StageState => {
      return (data?.stages[stage] as StageState) ?? "idle"
    },
    [data]
  )

  const stepStateAccessor = useCallback(
    (step: string): StepState => {
      return (data?.steps[step] as StepState) ?? "idle"
    },
    [data]
  )

  const stepProgressAccessor = useCallback(
    (step: string): StepProgress | undefined => {
      // Reference progressTick to ensure reactivity
      void progressTick
      return progressRef.current.get(step)
    },
    [progressTick]
  )

  const stepErrorAccessor = useCallback(
    (step: string): string | undefined => {
      return data?.stepErrors?.[step]
    },
    [data]
  )

  const isRunning = Object.values(data?.stages ?? {}).some(
    (s) => s === "running" || s === "queued"
  )

  return {
    stageState,
    stepState: stepStateAccessor,
    stepProgress: stepProgressAccessor,
    stepError: stepErrorAccessor,
    error: data?.error ?? null,
    isRunning,
    queueRun,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function invalidateBookQueries(qc: ReturnType<typeof useQueryClient>, label: string) {
  qc.invalidateQueries({ queryKey: ["books", label] })
  qc.invalidateQueries({ queryKey: ["books"] })
  qc.invalidateQueries({ queryKey: ["books", label, "pages"] })
  qc.invalidateQueries({ queryKey: ["debug"] })
}

/** Invalidate data queries when a stage completes so views refresh. */
function invalidateStageData(qc: ReturnType<typeof useQueryClient>, label: string, stage: string) {
  // Invalidate stage-specific data
  switch (stage) {
    case "extract":
      qc.invalidateQueries({ queryKey: ["books", label, "pages"] })
      qc.invalidateQueries({ queryKey: ["books", label] })
      qc.invalidateQueries({ queryKey: ["books"] })
      break
    case "storyboard":
      qc.invalidateQueries({ queryKey: ["books", label, "pages"] })
      qc.invalidateQueries({ queryKey: ["books", label] })
      break
    case "quizzes":
      qc.invalidateQueries({ queryKey: ["books", label, "quizzes"] })
      break
    case "captions":
      qc.invalidateQueries({ queryKey: ["books", label, "pages"] })
      break
    case "glossary":
      qc.invalidateQueries({ queryKey: ["books", label, "glossary"] })
      break
    case "text-and-speech":
      qc.invalidateQueries({ queryKey: ["books", label, "text-catalog"] })
      qc.invalidateQueries({ queryKey: ["books", label, "tts"] })
      break
  }
}
