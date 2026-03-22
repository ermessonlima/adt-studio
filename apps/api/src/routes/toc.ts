import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { TocGenerationOutput, PageSectioningOutput, WebRenderingOutput, parseBookLabel } from "@adt/types"
import { openBookDb, createBookStorage } from "@adt/storage"

function safeParseLabel(label: string): string {
  try {
    return parseBookLabel(label)
  } catch (err) {
    throw new HTTPException(400, {
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

export function createTocRoutes(booksDir: string): Hono {
  const app = new Hono()

  // GET /books/:label/toc — Get latest TOC
  app.get("/books/:label/toc", (c) => {
    const { label } = c.req.param()
    const safeLabel = safeParseLabel(label)
    const dbPath = path.join(
      path.resolve(booksDir),
      safeLabel,
      `${safeLabel}.db`,
    )

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, {
        message: `Book not found: ${safeLabel}`,
      })
    }

    const db = openBookDb(dbPath)
    try {
      const rows = db.all(
        "SELECT data, version FROM node_data WHERE node = ? AND item_id = ? ORDER BY version DESC LIMIT 1",
        ["toc-generation", "book"],
      ) as Array<{ data: string; version: number }>

      if (rows.length === 0) {
        return c.json(null)
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(rows[0].data)
      } catch {
        throw new HTTPException(500, {
          message: `Stored TOC data is corrupted for book: ${safeLabel}`,
        })
      }

      const validated = TocGenerationOutput.safeParse(parsed)
      if (!validated.success) {
        throw new HTTPException(500, {
          message: `Stored TOC data is invalid for book: ${safeLabel}`,
        })
      }

      return c.json({ ...validated.data, version: rows[0].version })
    } finally {
      db.close()
    }
  })

  // PUT /books/:label/toc — Update TOC
  app.put("/books/:label/toc", async (c) => {
    const { label } = c.req.param()
    const safeLabel = safeParseLabel(label)

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      throw new HTTPException(400, { message: "Invalid JSON body" })
    }
    const parsed = TocGenerationOutput.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid TOC data: ${parsed.error.message}`,
      })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const version = storage.putNodeData("toc-generation", "book", parsed.data)
      return c.json({ version })
    } finally {
      storage.close()
    }
  })

  // GET /books/:label/toc/sections — Available sections for linking
  app.get("/books/:label/toc/sections", (c) => {
    const { label } = c.req.param()
    const safeLabel = safeParseLabel(label)

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const pages = storage.getPages()
      const sections: Array<{ sectionId: string; href: string; title: string; pageNumber: number }> = []

      for (const page of pages) {
        const renderRow = storage.getLatestNodeData("web-rendering", page.pageId)
        if (!renderRow) continue
        const renderParsed = WebRenderingOutput.safeParse(renderRow.data)
        if (!renderParsed.success) continue

        const sectioningRow = storage.getLatestNodeData("page-sectioning", page.pageId)
        const sectioningParsed = sectioningRow ? PageSectioningOutput.safeParse(sectioningRow.data) : null
        const sectioning = sectioningParsed?.success ? sectioningParsed.data : undefined

        for (const rs of renderParsed.data.sections) {
          const meta = sectioning?.sections?.[rs.sectionIndex]
          if (meta?.isPruned) continue

          const sectionId = meta?.sectionId ?? `${page.pageId}_sec${String(rs.sectionIndex + 1).padStart(3, "0")}`

          // Extract a title from the first heading-like text in the section
          let title = sectionId
          if (meta) {
            for (const part of meta.parts) {
              if (part.type !== "text_group" || part.isPruned) continue
              for (const t of part.texts) {
                if (t.isPruned) continue
                title = t.text
                break
              }
              if (title !== sectionId) break
            }
          }

          sections.push({
            sectionId,
            href: `${sectionId}.html`,
            title,
            pageNumber: page.pageNumber,
          })
        }
      }

      return c.json(sections)
    } finally {
      storage.close()
    }
  })

  return app
}
