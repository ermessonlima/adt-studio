import type { ProgressEvent, TaskEvent } from "@adt/types"

export type BookSSEEvent =
  | { type: "progress"; data: ProgressEvent }
  | { type: "stage-run-complete"; label: string }
  | { type: "stage-run-error"; label: string; error: string }
  | { type: "queue-next"; label: string; fromStage: string; toStage: string }
  | { type: "task"; data: TaskEvent }

export type BookEventListener = (event: BookSSEEvent) => void

export interface BookEventBus {
  emit(label: string, event: BookSSEEvent): void
  addListener(label: string, listener: BookEventListener): () => void
}

export function createBookEventBus(): BookEventBus {
  const listeners = new Map<string, Set<BookEventListener>>()

  return {
    emit(label: string, event: BookSSEEvent): void {
      const set = listeners.get(label)
      if (!set) return
      for (const listener of set) {
        try {
          listener(event)
        } catch {
          // Listener errors should not crash the emitter
        }
      }
    },

    addListener(label: string, listener: BookEventListener): () => void {
      let set = listeners.get(label)
      if (!set) {
        set = new Set()
        listeners.set(label, set)
      }
      set.add(listener)

      return () => {
        set!.delete(listener)
        if (set!.size === 0) {
          listeners.delete(label)
        }
      }
    },
  }
}
