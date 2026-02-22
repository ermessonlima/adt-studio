import { useState, useEffect } from "react"
import { DEFAULT_LLM_MAX_RETRIES } from "@adt/types"

const DEFAULT_MAX_RETRIES = String(DEFAULT_LLM_MAX_RETRIES)

/**
 * Manages model + retries state for a single pipeline step config key.
 *
 * Reads defaults from the merged (preset + book) config and provides:
 * - Props to spread onto PromptViewer
 * - Config overrides to spread into buildOverrides
 *
 * Adding a new StepConfig field (e.g. timeout) only requires updating
 * this hook and PromptViewer — all settings files get it automatically.
 */
export function useStepConfig(
  mergedConfig: Record<string, unknown> | undefined,
  configKey: string,
  markDirty: (key: string) => void
) {
  const [model, setModel] = useState("")
  const [retries, setRetries] = useState("")

  useEffect(() => {
    // Reset when switching books/presets/keys so values don't bleed across contexts.
    setModel("")
    setRetries("")

    if (!mergedConfig) return
    const cfg = mergedConfig[configKey]
    if (cfg && typeof cfg === "object") {
      const c = cfg as Record<string, unknown>
      if (c.model) setModel(String(c.model))
      if (c.max_retries != null) setRetries(String(c.max_retries))
    }
  }, [mergedConfig, configKey])

  return {
    model,
    onModelChange: (v: string) => { setModel(v); markDirty(configKey) },
    // Show the effective default in the UI when config does not set one.
    maxRetries: retries || DEFAULT_MAX_RETRIES,
    onMaxRetriesChange: (v: string) => { setRetries(v); markDirty(configKey) },
    /** Spread into the config section object in buildOverrides */
    configOverrides: {
      model: model.trim() || undefined,
      max_retries: retries.trim() ? Number(retries) : undefined,
    },
  }
}
