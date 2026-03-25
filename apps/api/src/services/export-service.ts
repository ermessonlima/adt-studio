import fs from "node:fs"
import path from "node:path"
import { Zip, ZipDeflate, ZipPassThrough } from "fflate"
import { parseBookLabel } from "@adt/types"
import { createBookStorage } from "@adt/storage"
import { packageAdtWeb, packageWebpub, loadBookConfig, normalizeLocale } from "@adt/pipeline"

/** File extensions that are already compressed — skip deflation to save CPU */
const COMPRESSED_EXTS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif",
  ".mp3", ".mp4", ".ogg", ".wav", ".aac", ".m4a", ".opus", ".flac",
  ".zip", ".gz", ".br", ".zst",
  ".woff", ".woff2",
  ".pdf", ".db",
])

export interface ExportResult {
  stream: ReadableStream<Uint8Array>
  filename: string
}

/**
 * Prepare export by rebuilding the adt/ (and optionally webpub/) directories.
 * Called as a separate step before the actual download so the client can show
 * a spinner during the rebuild.
 */
export async function prepareExport(
  label: string,
  format: "book" | "webpub" | "scorm",
  booksDir: string,
  webAssetsDir: string,
  configPath?: string,
): Promise<void> {
  const safeLabel = parseBookLabel(label)
  const resolvedDir = path.resolve(booksDir)
  const bookDir = path.join(resolvedDir, safeLabel)

  if (!fs.existsSync(bookDir)) {
    throw new Error(`Book not found: ${safeLabel}`)
  }
  if (!webAssetsDir || !fs.existsSync(webAssetsDir)) {
    throw new Error("Web assets directory not found")
  }

  const storage = createBookStorage(safeLabel, resolvedDir)
  try {
    const config = loadBookConfig(safeLabel, resolvedDir, configPath)
    const metadataRow = storage.getLatestNodeData("metadata", "book")
    const metadata = metadataRow?.data as {
      title?: string | null
      language_code?: string | null
    } | null
    const language = normalizeLocale(config.editing_language ?? metadata?.language_code ?? "en")
    const outputLanguages = Array.from(
      new Set(
        (config.output_languages && config.output_languages.length > 0
          ? config.output_languages
          : [language]).map((code) => normalizeLocale(code))
      )
    )
    const title = metadata?.title ?? safeLabel

    const opts = {
      bookDir,
      label: safeLabel,
      language,
      outputLanguages,
      title,
      webAssetsDir,
      applyBodyBackground: config.apply_body_background,
    }

    await packageAdtWeb(storage, opts)

    if (format === "webpub") {
      packageWebpub(storage, opts)
    }
  } finally {
    storage.close()
  }
}

export async function exportBook(
  label: string,
  booksDir: string,
): Promise<ExportResult> {
  const safeLabel = parseBookLabel(label)
  const resolvedDir = path.resolve(booksDir)
  const bookDir = path.join(resolvedDir, safeLabel)

  if (!fs.existsSync(bookDir)) {
    throw new Error(`Book not found: ${safeLabel}`)
  }

  return {
    stream: createZipStream(bookDir),
    filename: `${safeLabel}.zip`,
  }
}

export interface WebpubExportResult {
  stream: ReadableStream<Uint8Array>
  filename: string
  safeFilename: string
}

export async function exportWebpub(
  label: string,
  booksDir: string,
): Promise<WebpubExportResult> {
  const safeLabel = parseBookLabel(label)
  const resolvedDir = path.resolve(booksDir)
  const bookDir = path.join(resolvedDir, safeLabel)

  if (!fs.existsSync(bookDir)) {
    throw new Error(`Book not found: ${safeLabel}`)
  }

  // Read title from metadata for the filename
  let title = safeLabel
  const storage = createBookStorage(safeLabel, resolvedDir)
  try {
    const metadataRow = storage.getLatestNodeData("metadata", "book")
    const metadata = metadataRow?.data as { title?: string | null } | null
    title = metadata?.title ?? safeLabel
  } finally {
    storage.close()
  }

  const webpubDir = path.join(bookDir, "webpub")

  return {
    stream: createZipStream(webpubDir),
    filename: `${title}.webpub`,
    safeFilename: `${safeLabel}.webpub`,
  }
}

export interface ScormExportResult {
  stream: ReadableStream<Uint8Array>
  filename: string
  safeFilename: string
}

export async function exportScorm(
  label: string,
  booksDir: string,
): Promise<ScormExportResult> {
  const safeLabel = parseBookLabel(label)
  const resolvedDir = path.resolve(booksDir)
  const bookDir = path.join(resolvedDir, safeLabel)

  if (!fs.existsSync(bookDir)) {
    throw new Error(`Book not found: ${safeLabel}`)
  }

  // Read title from metadata for the filename
  let title = safeLabel
  const storage = createBookStorage(safeLabel, resolvedDir)
  try {
    const metadataRow = storage.getLatestNodeData("metadata", "book")
    const metadata = metadataRow?.data as { title?: string | null } | null
    title = metadata?.title ?? safeLabel
  } finally {
    storage.close()
  }

  const adtDir = path.join(bookDir, "adt")
  if (!fs.existsSync(adtDir)) {
    throw new Error("ADT directory not found — run the pipeline first")
  }

  return {
    stream: createZipStream(adtDir),
    filename: `${title}.zip`,
    safeFilename: `${safeLabel}.zip`,
  }
}

/**
 * Collect relative file paths under a directory (lightweight — no file content read).
 */
function collectFilePaths(dir: string, prefix = ""): string[] {
  const result: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const zipPath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      result.push(...collectFilePaths(path.join(dir, entry.name), zipPath))
    } else if (entry.isFile()) {
      result.push(zipPath)
    }
  }
  return result
}

/**
 * Create a streaming ZIP of a directory. Files are read and compressed one at a
 * time so memory stays bounded regardless of total directory size.
 */
function createZipStream(sourceDir: string): ReadableStream<Uint8Array> {
  const filePaths = collectFilePaths(sourceDir)

  return new ReadableStream({
    async start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) { controller.error(err); return }
        if (chunk.length > 0) controller.enqueue(chunk)
        if (final) controller.close()
      })

      for (let i = 0; i < filePaths.length; i++) {
        const relPath = filePaths[i]
        const absPath = path.join(sourceDir, relPath)
        const data = new Uint8Array(fs.readFileSync(absPath))
        const ext = path.extname(relPath).toLowerCase()

        const file = COMPRESSED_EXTS.has(ext)
          ? new ZipPassThrough(relPath)
          : new ZipDeflate(relPath, { level: 6 })

        zip.add(file)
        file.push(data, true)

        // Yield to event loop every 50 files to avoid blocking
        if (i % 50 === 49) {
          await new Promise(resolve => setTimeout(resolve, 0))
        }
      }
      zip.end()
    },
  })
}
