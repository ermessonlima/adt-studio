import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import {
  parseBookLabel,
  TTSOutput,
  type SpeechFileEntry,
  type TextCatalogEntry,
  type TextCatalogOutput,
} from "@adt/types"
import { openBookDb, createBookStorage } from "@adt/storage"
import { createGeminiTTSSynthesizer, type LlmLogEntry } from "@adt/llm"
import {
  getBaseLanguage,
  loadBookConfig,
  loadVoicesConfig,
  normalizeLocale,
  resolveProviderForLanguage,
  resolveSpeechFormat,
  resolveSpeechModel,
  resolveVoice,
  generateSpeechFile,
  type ProviderRouting,
} from "@adt/pipeline"

const GenerateSingleTTSBody = z
  .object({
    textId: z.string().min(1),
    language: z.string().min(1),
  })
  .strict()

function safeParseLabel(label: string): string {
  try {
    return parseBookLabel(label)
  } catch (err) {
    throw new HTTPException(400, {
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

function getBookDbPath(booksDir: string, label: string): string {
  return path.join(path.resolve(booksDir), label, `${label}.db`)
}

function getConfigDir(configPath?: string): string {
  return configPath
    ? path.join(path.dirname(configPath), "config")
    : path.resolve(process.cwd(), "config")
}

function getSourceLanguage(
  storage: ReturnType<typeof createBookStorage>,
  booksDir: string,
  label: string,
  configPath?: string
): { config: ReturnType<typeof loadBookConfig>; language: string } {
  const config = loadBookConfig(label, booksDir, configPath)
  const metadataRow = storage.getLatestNodeData("metadata", "book")
  const metadata = metadataRow?.data as { language_code?: string | null } | null
  return {
    config,
    language: normalizeLocale(
      config.editing_language ?? metadata?.language_code ?? "en"
    ),
  }
}

function getOutputLanguages(
  config: ReturnType<typeof loadBookConfig>,
  sourceLanguage: string
): string[] {
  return Array.from(
    new Set(
      (config.output_languages && config.output_languages.length > 0
        ? config.output_languages
        : [sourceLanguage]).map((code) => normalizeLocale(code))
    )
  )
}

function getCatalogEntriesForLanguage(
  storage: ReturnType<typeof createBookStorage>,
  sourceLanguage: string,
  language: string
): TextCatalogEntry[] {
  const normalizedLanguage = normalizeLocale(language)
  const baseSource = getBaseLanguage(sourceLanguage)
  const baseLanguage = getBaseLanguage(normalizedLanguage)

  if (baseLanguage === baseSource) {
    const catalogRow = storage.getLatestNodeData("text-catalog", "book")
    if (!catalogRow) {
      throw new HTTPException(404, { message: "Text catalog not found" })
    }
    return (catalogRow.data as TextCatalogOutput).entries
  }

  const legacyLanguage = normalizedLanguage.replace("-", "_")
  const translatedRow =
    storage.getLatestNodeData("text-catalog-translation", normalizedLanguage) ??
    storage.getLatestNodeData("text-catalog-translation", legacyLanguage)

  if (!translatedRow) {
    throw new HTTPException(404, {
      message: `Translated text catalog not found for ${normalizedLanguage}`,
    })
  }

  return (translatedRow.data as TextCatalogOutput).entries
}

function getLatestTtsEntries(
  storage: ReturnType<typeof createBookStorage>,
  language: string
): SpeechFileEntry[] {
  const normalizedLanguage = normalizeLocale(language)
  const legacyLanguage = normalizedLanguage.replace("-", "_")
  const row =
    storage.getLatestNodeData("tts", normalizedLanguage) ??
    storage.getLatestNodeData("tts", legacyLanguage)

  return row ? (row.data as { entries?: SpeechFileEntry[] }).entries ?? [] : []
}

function mergeSpeechEntry(
  existingEntries: SpeechFileEntry[],
  nextEntry: SpeechFileEntry,
  orderedIds: string[]
): SpeechFileEntry[] {
  const byId = new Map(existingEntries.map((entry) => [entry.textId, entry]))
  byId.set(nextEntry.textId, nextEntry)

  const order = new Map(orderedIds.map((id, index) => [id, index]))
  return [...byId.values()].sort(
    (left, right) =>
      (order.get(left.textId) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(right.textId) ?? Number.MAX_SAFE_INTEGER)
  )
}

function getTtsCompletionSummary(
  storage: ReturnType<typeof createBookStorage>,
  config: ReturnType<typeof loadBookConfig>,
  sourceLanguage: string
): { remainingItems: number; allComplete: boolean } {
  const outputLanguages = getOutputLanguages(config, sourceLanguage)
  let remainingItems = 0

  for (const language of outputLanguages) {
    let expectedEntries: TextCatalogEntry[]
    try {
      expectedEntries = getCatalogEntriesForLanguage(
        storage,
        sourceLanguage,
        language
      )
    } catch (err) {
      if (err instanceof HTTPException) {
        remainingItems++
        continue
      }
      throw err
    }
    const availableIds = new Set(
      getLatestTtsEntries(storage, language).map((entry) => entry.textId)
    )
    for (const entry of expectedEntries) {
      if (!availableIds.has(entry.id)) {
        remainingItems++
      }
    }
  }

  return {
    remainingItems,
    allComplete: remainingItems === 0,
  }
}

function appendSingleTtsLog(
  storage: ReturnType<typeof createBookStorage>,
  options: {
    textId: string
    language: string
    voice: string
    model: string
    provider: string
    text: string
    durationMs: number
    success: boolean
    cached: boolean
    error?: string
  }
): void {
  const logEntry: LlmLogEntry = {
    requestId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    taskType: "tts",
    pageId: options.textId,
    promptName: `tts-${options.provider}`,
    modelId: `${options.provider}/${options.model}`,
    cacheHit: options.cached,
    success: options.success,
    errorCount: options.success ? 0 : 1,
    attempt: 1,
    durationMs: options.durationMs,
    messages: [{
      role: "user",
      content: [{
        type: "text" as const,
        text: `[${options.language}] voice=${options.voice}\n${options.error ? `ERROR: ${options.error}\n\n` : ""}${options.text.slice(0, 300)}`,
      }],
    }],
  }

  storage.appendLlmLog(logEntry)
}

export function createTTSRoutes(booksDir: string, configPath?: string): Hono {
  const app = new Hono()

  // GET /books/:label/tts — Get all TTS data grouped by language
  app.get("/books/:label/tts", (c) => {
    const { label } = c.req.param()
    const safeLabel = safeParseLabel(label)
    const dbPath = getBookDbPath(booksDir, safeLabel)

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
    }

    const db = openBookDb(dbPath)
    try {
      // TTS is stored per language: node="tts", item_id=language code
      // Get latest version per language
      const rows = db.all(
        `SELECT item_id, data, version FROM node_data
         WHERE node = ? AND (item_id, version) IN (
           SELECT item_id, MAX(version) FROM node_data WHERE node = ? GROUP BY item_id
         )`,
        ["tts", "tts"]
      ) as Array<{ item_id: string; data: string; version: number }>

      const languages: Record<string, { entries: Array<{ textId: string; fileName: string; voice: string; model: string; cached: boolean; provider?: string }>; generatedAt: string; version: number }> = {}
      for (const row of rows) {
        try {
          const parsed = JSON.parse(row.data)
          const validated = TTSOutput.safeParse(parsed)
          if (!validated.success) continue
          languages[row.item_id] = {
            entries: validated.data.entries.map((e) => ({
              textId: e.textId,
              fileName: e.fileName,
              voice: e.voice,
              model: e.model,
              cached: e.cached,
              provider: e.provider,
            })),
            generatedAt: validated.data.generatedAt,
            version: row.version,
          }
        } catch {
          // skip corrupted
        }
      }

      return c.json({ languages })
    } finally {
      db.close()
    }
  })

  app.post("/books/:label/tts/generate-one", async (c) => {
    const { label } = c.req.param()
    const safeLabel = safeParseLabel(label)
    const dbPath = getBookDbPath(booksDir, safeLabel)

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      throw new HTTPException(400, { message: "Invalid JSON body" })
    }

    const parsed = GenerateSingleTTSBody.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid TTS item request: ${parsed.error.message}`,
      })
    }

    const geminiApiKey = c.req.header("X-Gemini-API-Key")?.trim()
    if (!geminiApiKey) {
      throw new HTTPException(400, {
        message: "Gemini API key required. Set X-Gemini-API-Key header.",
      })
    }

    const normalizedLanguage = normalizeLocale(parsed.data.language)
    const storage = createBookStorage(safeLabel, booksDir)

    try {
      const { config, language: sourceLanguage } = getSourceLanguage(
        storage,
        booksDir,
        safeLabel,
        configPath
      )
      const outputLanguages = getOutputLanguages(config, sourceLanguage)
      if (!outputLanguages.includes(normalizedLanguage)) {
        throw new HTTPException(400, {
          message: `Language is not configured for TTS output: ${normalizedLanguage}`,
        })
      }

      const providerConfigs = config.speech?.providers ?? {}
      const routing: ProviderRouting = {
        providers: providerConfigs,
        defaultProvider: config.speech?.default_provider ?? "openai",
      }
      const provider = resolveProviderForLanguage(normalizedLanguage, routing)
      if (provider !== "gemini") {
        throw new HTTPException(400, {
          message:
            "Single-item audio generation is only available when Gemini is selected for that language.",
        })
      }

      const languageEntries = getCatalogEntriesForLanguage(
        storage,
        sourceLanguage,
        normalizedLanguage
      )
      const textEntry = languageEntries.find(
        (entry) => entry.id === parsed.data.textId
      )
      if (!textEntry) {
        throw new HTTPException(404, {
          message: `Text entry not found for ${parsed.data.textId} (${normalizedLanguage})`,
        })
      }

      const configDir = getConfigDir(configPath)
      const voiceMaps = loadVoicesConfig(configDir)
      const model = resolveSpeechModel(provider, providerConfigs, config.speech?.model)
      const format = resolveSpeechFormat(provider, config.speech?.format)
      const voice = resolveVoice(
        provider,
        normalizedLanguage,
        voiceMaps,
        config.speech?.voice
      )

      const startMs = Date.now()

      try {
        const entry = await generateSpeechFile({
          textId: textEntry.id,
          text: textEntry.text,
          language: normalizedLanguage,
          model,
          voice,
          instructions: "",
          format,
          bookDir: path.join(path.resolve(booksDir), safeLabel),
          cacheDir: path.join(path.resolve(booksDir), safeLabel, ".cache"),
          ttsSynthesizer: createGeminiTTSSynthesizer({ apiKey: geminiApiKey }),
          provider,
        })

        if (!entry) {
          throw new HTTPException(422, {
            message: `Text entry is not speakable: ${textEntry.id}`,
          })
        }

        appendSingleTtsLog(storage, {
          textId: textEntry.id,
          language: normalizedLanguage,
          voice,
          model,
          provider,
          text: textEntry.text,
          durationMs: Date.now() - startMs,
          success: true,
          cached: entry.cached,
        })

        const mergedEntries = mergeSpeechEntry(
          getLatestTtsEntries(storage, normalizedLanguage),
          entry,
          languageEntries.map((item) => item.id)
        )

        const version = storage.putNodeData("tts", normalizedLanguage, {
          entries: mergedEntries,
          generatedAt: new Date().toISOString(),
        })

        const completion = getTtsCompletionSummary(
          storage,
          config,
          sourceLanguage
        )
        if (completion.allComplete) {
          storage.markStepCompleted("tts")
        } else {
          const currentStatus = storage
            .getStepRuns()
            .find((step) => step.step === "tts")?.status
          if (currentStatus === "error") {
            storage.recordStepError(
              "tts",
              `${completion.remainingItems} Gemini audio item(s) still need generation.`
            )
          }
        }

        return c.json({
          entry,
          version,
          completed: completion.allComplete,
          remainingItems: completion.remainingItems,
        })
      } catch (err) {
        if (err instanceof HTTPException) {
          throw err
        }

        const message = err instanceof Error ? err.message : String(err)
        appendSingleTtsLog(storage, {
          textId: textEntry.id,
          language: normalizedLanguage,
          voice,
          model,
          provider,
          text: textEntry.text,
          durationMs: Date.now() - startMs,
          success: false,
          cached: false,
          error: message,
        })
        storage.recordStepError(
          "tts",
          `Gemini audio generation failed for ${textEntry.id}: ${message}`
        )

        const status = /\(429\)|quota|rate limit/i.test(message) ? 429 : 502
        return c.json({ error: message }, status)
      }
    } finally {
      storage.close()
    }
  })

  // GET /books/:label/audio/:language/:fileName — Serve audio file
  app.get("/books/:label/audio/:language/:fileName", (c) => {
    const { label, language, fileName } = c.req.param()
    const safeLabel = safeParseLabel(label)
    const resolvedDir = path.resolve(booksDir)
    const bookDir = path.join(resolvedDir, safeLabel)

    // Validate language and fileName to prevent path traversal
    if (!/^[a-zA-Z0-9_-]+$/.test(language)) {
      throw new HTTPException(400, { message: "Invalid language" })
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(fileName)) {
      throw new HTTPException(400, { message: "Invalid file name" })
    }

    const audioPath = path.resolve(bookDir, "audio", language, fileName)
    // Verify path doesn't escape book directory
    if (!audioPath.startsWith(bookDir + path.sep)) {
      throw new HTTPException(400, { message: "Invalid audio path" })
    }

    let stat: fs.Stats
    try {
      stat = fs.statSync(audioPath)
    } catch {
      throw new HTTPException(404, {
        message: `Audio file not found: ${fileName}`,
      })
    }
    if (!stat.isFile()) {
      throw new HTTPException(404, {
        message: `Audio file not found: ${fileName}`,
      })
    }

    const audioBuffer = fs.readFileSync(audioPath)
    const ext = path.extname(fileName).toLowerCase()
    const contentType =
      ext === ".mp3" ? "audio/mpeg"
        : ext === ".wav" ? "audio/wav"
          : ext === ".ogg" ? "audio/ogg"
            : "audio/mpeg"
    c.header("Content-Type", contentType)
    c.header("Cache-Control", "public, max-age=86400")
    return c.body(audioBuffer)
  })

  return app
}
