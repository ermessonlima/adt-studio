import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { parseBookLabel } from "@adt/types"
import { createBookStorage } from "@adt/storage"
import {
  packageAdtWeb,
  loadBookConfig,
  normalizeLocale,
  runAccessibilityAssessment,
} from "@adt/pipeline"
import type { TaskService } from "../services/task-service.js"

export function createPackageRoutes(
  booksDir: string,
  webAssetsDir: string,
  configPath?: string,
  taskService?: TaskService,
): Hono {
  const app = new Hono()

  app.post("/books/:label/package-adt", async (c) => {
    const { label } = c.req.param()
    let safeLabel: string
    try {
      safeLabel = parseBookLabel(label)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new HTTPException(400, { message })
    }

    const resolvedBooksDir = path.resolve(booksDir)
    const bookDir = path.join(resolvedBooksDir, safeLabel)
    if (!fs.existsSync(path.join(bookDir, `${safeLabel}.db`))) {
      throw new HTTPException(404, {
        message: `Book not found: ${safeLabel}`,
      })
    }

    if (!fs.existsSync(webAssetsDir)) {
      throw new HTTPException(500, {
        message: "Web assets directory not found",
      })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const pages = storage.getPages()
      const hasRendering = pages.some(
        (p) => storage.getLatestNodeData("web-rendering", p.pageId) !== null,
      )
      if (!hasRendering) {
        throw new HTTPException(409, {
          message: "At least one page must have a web rendering before packaging",
        })
      }
    } finally {
      storage.close()
    }

    if (taskService) {
      const { taskId } = taskService.submitTask(
        safeLabel,
        "package-adt",
        "Packaging ADT preview",
        async () => {
          await runPackaging(safeLabel, booksDir, bookDir, webAssetsDir, configPath)
        },
        { url: `/books/${safeLabel}/preview` },
      )
      return c.json({ status: "submitted", taskId, label: safeLabel })
    }

    try {
      await runPackaging(safeLabel, booksDir, bookDir, webAssetsDir, configPath)
      return c.json({ status: "completed", label: safeLabel })
    } catch (err) {
      if (err instanceof HTTPException) throw err
      const message = err instanceof Error ? err.message : String(err)
      throw new HTTPException(500, { message: `Packaging failed: ${message}` })
    }
  })

  app.get("/books/:label/package-adt/status", (c) => {
    const { label } = c.req.param()
    let safeLabel: string
    try {
      safeLabel = parseBookLabel(label)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new HTTPException(400, { message })
    }

    const bookDir = path.join(path.resolve(booksDir), safeLabel)
    const pagesPath = path.join(bookDir, "adt", "content", "pages.json")
    const hasAdt = hasPackagedAdtPages(pagesPath)

    return c.json({ label: safeLabel, hasAdt })
  })

  return app
}

async function runPackaging(
  safeLabel: string,
  booksDir: string,
  bookDir: string,
  webAssetsDir: string,
  configPath?: string,
): Promise<void> {
  const storage = createBookStorage(safeLabel, booksDir)
  try {
    const config = loadBookConfig(safeLabel, booksDir, configPath)
    const metadataRow = storage.getLatestNodeData("metadata", "book")
    const metadata = metadataRow?.data as {
      title?: string | null
      language_code?: string | null
    } | null
    const language = normalizeLocale(
      config.editing_language ?? metadata?.language_code ?? "en",
    )
    const outputLanguages = Array.from(
      new Set(
        (config.output_languages && config.output_languages.length > 0
          ? config.output_languages
          : [language]).map((code) => normalizeLocale(code)),
      ),
    )
    const title = metadata?.title ?? safeLabel

    await packageAdtWeb(storage, {
      bookDir,
      label: safeLabel,
      language,
      outputLanguages,
      title,
      webAssetsDir,
      applyBodyBackground: config.apply_body_background,
    })

    const accessibilityOutput = await runAccessibilityAssessment({
      bookDir,
      config: config.accessibility_assessment,
    })
    storage.putNodeData("accessibility-assessment", "book", accessibilityOutput)
  } finally {
    storage.close()
  }
}

function hasPackagedAdtPages(pagesPath: string): boolean {
  if (!fs.existsSync(pagesPath)) {
    return false
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(pagesPath, "utf-8")) as unknown
    if (!Array.isArray(parsed)) {
      return false
    }

    return parsed.some((entry) => {
      if (typeof entry !== "object" || entry === null) {
        return false
      }
      const href = (entry as { href?: unknown }).href
      return typeof href === "string" && href.length > 0
    })
  } catch {
    return false
  }
}
