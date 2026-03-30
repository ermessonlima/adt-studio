import { createContext, useContext } from "react"

export const DEBUG_TAB_VALUES = [
  "stats",
  "logs",
  "config",
  "versions",
] as const

export type DebugTabValue = (typeof DEBUG_TAB_VALUES)[number]

export function normalizeDebugTabValue(value: unknown): DebugTabValue | null {
  if (typeof value !== "string") {
    return null
  }

  return (DEBUG_TAB_VALUES as readonly string[]).includes(value)
    ? (value as DebugTabValue)
    : null
}

interface DebugPanelStateContextValue {
  openPanel: (options?: { tab?: DebugTabValue }) => void
  panelOpen: boolean
}

const DebugPanelStateContext = createContext<DebugPanelStateContextValue>({
  openPanel: () => {},
  panelOpen: false,
})

export function useDebugPanelState(): DebugPanelStateContextValue {
  return useContext(DebugPanelStateContext)
}

export const DebugPanelStateProvider = DebugPanelStateContext.Provider
