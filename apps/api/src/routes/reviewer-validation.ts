import { Hono } from "hono"
import { loadBookConfig } from "@adt/pipeline"
import { HTTPException } from "hono/http-exception"
import {
  ReviewerPageValidationRecord,
  ReviewerValidationSession,
  parseBookLabel,
} from "@adt/types"
import {
  ReviewerValidationListQuery,
  listReviewerPageValidationRecords,
  listReviewerValidationSessions,
  saveReviewerPageValidationRecord,
  saveReviewerValidationSession,
} from "../services/reviewer-validation-service.js"
import { getReviewerValidationCatalog, isReviewerValidationEnabled } from "../services/reviewer-validation-catalog.js"

export function createReviewerValidationRoutes(booksDir: string, configPath?: string): Hono {
  const app = new Hono()

  app.get("/books/:label/validation/catalog", (c) => {
    const safeLabel = parseBookLabel(c.req.param("label"))
    const config = configPath ? loadBookConfig(safeLabel, booksDir, configPath) : null
    return c.json({
      enabled: isReviewerValidationEnabled(config?.reviewer_validation),
      ...getReviewerValidationCatalog(config?.reviewer_validation),
    })
  })

  app.get("/books/:label/validation/sessions", (c) => {
    const { label } = c.req.param()
    const sessions = listReviewerValidationSessions(label, booksDir)
    return c.json({ sessions })
  })

  app.post("/books/:label/validation/sessions", async (c) => {
    const { label } = c.req.param()
    const safeLabel = parseBookLabel(label)
    const body = await c.req.json<unknown>()
    const parsed = ReviewerValidationSession.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, { message: parsed.error.message })
    }

    const config = configPath ? loadBookConfig(safeLabel, booksDir, configPath) : null
    if (!isReviewerValidationEnabled(config?.reviewer_validation)) {
      throw new HTTPException(409, { message: "Reviewer validation is disabled for this book" })
    }
    const catalogSnapshot = getReviewerValidationCatalog(config?.reviewer_validation)
    const saved = saveReviewerValidationSession(label, booksDir, {
      ...parsed.data,
      catalog_snapshot: parsed.data.catalog_snapshot ?? catalogSnapshot,
    })
    return c.json(saved, 201)
  })

  app.get("/books/:label/validation/page-results", (c) => {
    const { label } = c.req.param()
    const parsed = ReviewerValidationListQuery.safeParse({
      sessionId: c.req.query("sessionId"),
      pageId: c.req.query("pageId") || undefined,
      language: c.req.query("language") || undefined,
    })

    if (!parsed.success) {
      throw new HTTPException(400, { message: parsed.error.message })
    }

    const records = listReviewerPageValidationRecords(label, booksDir, parsed.data)
    return c.json({ records })
  })

  app.post("/books/:label/validation/page-results", async (c) => {
    const { label } = c.req.param()
    const safeLabel = parseBookLabel(label)
    const config = configPath ? loadBookConfig(safeLabel, booksDir, configPath) : null
    if (!isReviewerValidationEnabled(config?.reviewer_validation)) {
      throw new HTTPException(409, { message: "Reviewer validation is disabled for this book" })
    }
    const body = await c.req.json<unknown>()
    const parsed = ReviewerPageValidationRecord.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, { message: parsed.error.message })
    }

    const saved = saveReviewerPageValidationRecord(label, booksDir, parsed.data)
    return c.json(saved, 201)
  })

  return app
}
