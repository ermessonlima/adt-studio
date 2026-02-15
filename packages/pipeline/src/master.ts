import path from "node:path"
import { createBookStorage } from "@adt/storage"
import type { Storage, PageData } from "@adt/storage"
import { createLLMModel, createPromptEngine, createRateLimiter } from "@adt/llm"
import type { LlmLogEntry, LogLevel } from "@adt/llm"
import { buildTextCatalog } from "./text-catalog.js"
import { translateCatalogBatch, buildCatalogTranslationConfig, getTargetLanguages } from "./catalog-translation.js"
import { loadBookConfig } from "./config.js"
import { nullProgress, type Progress } from "./progress.js"
import { processWithConcurrency } from "./proof.js"
import type { StepName, TextCatalogOutput, TextCatalogEntry } from "@adt/types"

export interface RunMasterOptions {
  label: string
  booksRoot: string
  promptsDir: string
  configPath?: string
  /** Override cache directory. Defaults to {booksRoot}/{label}/.cache */
  cacheDir?: string
  /** LLM console log level. Defaults to "info". Use "silent" for no output. */
  logLevel?: LogLevel
}

/**
 * Runs the master stage: builds text catalog and translates to output languages.
 * Requires storyboard to be accepted first.
 *
 * Caller is responsible for setting OPENAI_API_KEY in the environment.
 */
export async function runMaster(
  options: RunMasterOptions,
  progress: Progress = nullProgress
): Promise<void> {
  const { label, booksRoot, promptsDir, configPath, logLevel } = options

  const storage = createBookStorage(label, booksRoot)

  try {
    // Verify storyboard is accepted
    const acceptance = storage.getLatestNodeData(
      "storyboard-acceptance",
      "book"
    )
    if (!acceptance) {
      throw new Error(
        "Storyboard must be accepted before running master"
      )
    }

    // Load config
    const config = loadBookConfig(label, booksRoot, configPath)
    const cacheDir =
      options.cacheDir ?? path.join(path.resolve(booksRoot), label, ".cache")
    const promptEngine = createPromptEngine(promptsDir)
    const rateLimiter = config.rate_limit
      ? createRateLimiter(config.rate_limit.requests_per_minute)
      : undefined

    // Get book language from metadata
    const metadataRow = storage.getLatestNodeData("metadata", "book")
    const metadata = metadataRow?.data as {
      language_code?: string | null
    } | null
    const language =
      config.editing_language ??
      metadata?.language_code ??
      "en"

    const onLlmLog = (entry: LlmLogEntry) => {
      storage.appendLlmLog(entry)
      const step = entry.taskType as StepName
      progress.emit({
        type: "llm-log",
        step,
        itemId: entry.pageId ?? "",
        promptName: entry.promptName,
        modelId: entry.modelId,
        cacheHit: entry.cacheHit,
        durationMs: entry.durationMs,
        inputTokens: entry.usage?.inputTokens,
        outputTokens: entry.usage?.outputTokens,
        validationErrors: entry.validationErrors,
      })
    }

    const pages = storage.getPages()
    const effectiveConcurrency = config.concurrency ?? 32

    // Build text catalog from whatever data is available
    runTextCatalog(pages, storage, progress)

    // Translate catalog to all output languages
    const targetLanguages = getTargetLanguages(config.output_languages, language)
    if (targetLanguages.length > 0) {
      await runCatalogTranslation(
        storage,
        targetLanguages,
        language,
        config,
        cacheDir,
        promptEngine,
        rateLimiter,
        logLevel,
        onLlmLog,
        effectiveConcurrency,
        progress
      )
    } else {
      progress.emit({ type: "step-skip", step: "catalog-translation" })
    }
  } finally {
    storage.close()
  }
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function runTextCatalog(
  pages: PageData[],
  storage: Storage,
  progress: Progress
): void {
  progress.emit({ type: "step-start", step: "text-catalog" })
  progress.emit({
    type: "step-progress",
    step: "text-catalog",
    message: "Building text catalog...",
  })

  try {
    const catalog = buildTextCatalog(storage, pages)
    storage.putNodeData("text-catalog", "book", catalog)

    progress.emit({
      type: "step-progress",
      step: "text-catalog",
      message: `${catalog.entries.length} entries`,
    })
    progress.emit({ type: "step-complete", step: "text-catalog" })
  } catch (err) {
    const msg = toErrorMessage(err)
    progress.emit({
      type: "step-error",
      step: "text-catalog",
      error: msg,
    })
  }
}

async function runCatalogTranslation(
  storage: Storage,
  targetLanguages: string[],
  sourceLanguage: string,
  config: ReturnType<typeof loadBookConfig>,
  cacheDir: string,
  promptEngine: ReturnType<typeof createPromptEngine>,
  rateLimiter: ReturnType<typeof createRateLimiter> | undefined,
  logLevel: LogLevel | undefined,
  onLlmLog: (entry: LlmLogEntry) => void,
  concurrency: number,
  progress: Progress
): Promise<void> {
  progress.emit({ type: "step-start", step: "catalog-translation" })

  const catalogRow = storage.getLatestNodeData("text-catalog", "book")
  if (!catalogRow) {
    progress.emit({
      type: "step-error",
      step: "catalog-translation",
      error: "No text catalog available to translate",
    })
    return
  }

  const catalog = catalogRow.data as TextCatalogOutput
  if (catalog.entries.length === 0) {
    progress.emit({ type: "step-skip", step: "catalog-translation" })
    return
  }

  const translationConfig = buildCatalogTranslationConfig(config, sourceLanguage)
  const translationModel = createLLMModel({
    modelId: translationConfig.modelId,
    cacheDir,
    promptEngine,
    rateLimiter,
    logLevel,
    onLog: onLlmLog,
  })

  // Build flat list of work items: {language, batchIndex, entries}
  const batchSize = translationConfig.batchSize
  interface WorkItem {
    language: string
    batchIndex: number
    entries: TextCatalogEntry[]
  }
  const workItems: WorkItem[] = []
  for (const lang of targetLanguages) {
    for (let i = 0; i < catalog.entries.length; i += batchSize) {
      workItems.push({
        language: lang,
        batchIndex: Math.floor(i / batchSize),
        entries: catalog.entries.slice(i, i + batchSize),
      })
    }
  }

  const totalBatches = workItems.length
  let completedBatches = 0

  // Results keyed by language
  const resultsByLang = new Map<string, TextCatalogEntry[]>()
  for (const lang of targetLanguages) {
    resultsByLang.set(lang, [])
  }

  progress.emit({
    type: "step-progress",
    step: "catalog-translation",
    message: `0/${totalBatches} batches (${targetLanguages.length} languages)`,
    page: 0,
    totalPages: totalBatches,
  })

  try {
    await processWithConcurrency(
      workItems,
      concurrency,
      async (item: WorkItem) => {
        const translated = await translateCatalogBatch(
          item.entries,
          item.language,
          translationConfig,
          translationModel
        )
        resultsByLang.get(item.language)!.push(...translated)
        completedBatches++
        progress.emit({
          type: "step-progress",
          step: "catalog-translation",
          message: `${completedBatches}/${totalBatches} batches (${targetLanguages.length} languages)`,
          page: completedBatches,
          totalPages: totalBatches,
        })
      }
    )

    // Store per-language results
    for (const lang of targetLanguages) {
      const entries = resultsByLang.get(lang)!
      // Sort entries back to original catalog order (batches may complete out of order)
      const idOrder = new Map(catalog.entries.map((e, i) => [e.id, i]))
      entries.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0))

      const output: TextCatalogOutput = {
        entries,
        generatedAt: new Date().toISOString(),
      }
      storage.putNodeData("text-catalog-translation", lang, output)
    }

    progress.emit({ type: "step-complete", step: "catalog-translation" })
  } catch (err) {
    const msg = toErrorMessage(err)
    progress.emit({
      type: "step-error",
      step: "catalog-translation",
      error: msg,
    })
    throw new Error(`Catalog translation failed: ${msg}`)
  }
}
