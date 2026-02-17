import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { createBookStorage } from "@adt/storage"
import type { StepService, StepSSEEvent } from "../services/step-service.js"
import type { PipelineService } from "../services/pipeline-service.js"

const UIStepSlug = z.enum([
  "extract",
  "storyboard",
  "quizzes",
  "captions",
  "glossary",
  "translations",
  "text-to-speech",
])

const StepRunBody = z
  .object({
    fromStep: UIStepSlug,
    toStep: UIStepSlug,
  })
  .strict()

export function createStepRoutes(
  stepService: StepService,
  pipelineService: PipelineService,
  booksDir: string,
  promptsDir: string,
  configPath?: string
): Hono {
  const app = new Hono()

  // POST /books/:label/steps/run — Start a step-scoped run
  app.post("/books/:label/steps/run", async (c) => {
    const { label } = c.req.param()
    const apiKey = c.req.header("X-OpenAI-Key")

    if (!apiKey) {
      throw new HTTPException(400, {
        message: "API key required. Set X-OpenAI-Key header.",
      })
    }

    // Check for conflicts
    const pipelineJob = pipelineService.getStatus(label)
    if (pipelineJob?.status === "running") {
      throw new HTTPException(409, {
        message: `Full pipeline already running for book: ${label}`,
      })
    }

    const existing = stepService.getStatus(label)
    if (existing?.status === "running") {
      throw new HTTPException(409, {
        message: `Step run already in progress for book: ${label}`,
      })
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      throw new HTTPException(400, { message: "Invalid JSON body" })
    }

    const parsed = StepRunBody.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid step run options: ${parsed.error.message}`,
      })
    }

    const { fromStep, toStep } = parsed.data

    // Synchronously clear data that will be rebuilt before returning,
    // so the frontend can immediately reflect the cleared state.
    if (fromStep === "extract") {
      const storage = createBookStorage(label, booksDir)
      try {
        storage.clearExtractedData()
      } finally {
        storage.close()
      }
    } else if (fromStep === "storyboard") {
      const storage = createBookStorage(label, booksDir)
      try {
        storage.clearNodesByType(["page-sectioning", "web-rendering", "storyboard-acceptance"])
      } finally {
        storage.close()
      }
    } else if (fromStep === "quizzes") {
      const storage = createBookStorage(label, booksDir)
      try {
        storage.clearNodesByType(["quiz-generation"])
      } finally {
        storage.close()
      }
    } else if (fromStep === "captions") {
      const storage = createBookStorage(label, booksDir)
      try {
        storage.clearNodesByType(["image-captioning"])
      } finally {
        storage.close()
      }
    } else if (fromStep === "glossary") {
      const storage = createBookStorage(label, booksDir)
      try {
        storage.clearNodesByType(["glossary"])
      } finally {
        storage.close()
      }
    } else if (fromStep === "translations") {
      const storage = createBookStorage(label, booksDir)
      try {
        storage.clearNodesByType(["text-catalog", "text-catalog-translation"])
      } finally {
        storage.close()
      }
    } else if (fromStep === "text-to-speech") {
      const storage = createBookStorage(label, booksDir)
      try {
        storage.clearNodesByType(["text-catalog", "text-catalog-translation", "tts"])
      } finally {
        storage.close()
      }
    }

    stepService
      .startStepRun(label, {
        booksDir,
        apiKey,
        promptsDir,
        configPath,
        fromStep,
        toStep,
      })
      .catch(() => {
        // Error is tracked in job status
      })

    return c.json({ status: "started", label, fromStep, toStep })
  })

  // GET /books/:label/steps/status — Get step run status (JSON or SSE)
  app.get("/books/:label/steps/status", (c) => {
    const { label } = c.req.param()
    const accept = c.req.header("accept") ?? ""

    if (accept.includes("text/event-stream")) {
      return streamSSE(c, async (stream) => {
        const job = stepService.getStatus(label)

        if (job?.status === "completed") {
          await stream.writeSSE({
            event: "complete",
            data: JSON.stringify({ label }),
          })
          return
        }
        if (job?.status === "failed") {
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify({ label, error: job.error }),
          })
          return
        }

        const queue: StepSSEEvent[] = []
        let done = false

        const unsubscribe = stepService.addListener(label, (event) => {
          if (done) return
          queue.push(event)
        })

        // Re-check after subscribing to avoid race
        const jobAfterSubscribe = stepService.getStatus(label)
        if (
          jobAfterSubscribe?.status === "completed" ||
          jobAfterSubscribe?.status === "failed"
        ) {
          const event =
            jobAfterSubscribe.status === "completed" ? "complete" : "error"
          const data =
            jobAfterSubscribe.status === "completed"
              ? { label }
              : { label, error: jobAfterSubscribe.error }
          await stream.writeSSE({ event, data: JSON.stringify(data) })
          unsubscribe()
          return
        }

        stream.onAbort(() => {
          done = true
          unsubscribe()
        })

        while (!done) {
          while (queue.length > 0) {
            const event = queue.shift()!
            try {
              if (event.type === "progress") {
                await stream.writeSSE({
                  event: "progress",
                  data: JSON.stringify(event.data),
                })
              } else if (event.type === "step-run-complete") {
                await stream.writeSSE({
                  event: "complete",
                  data: JSON.stringify({ label: event.label }),
                })
                done = true
                break
              } else if (event.type === "step-run-error") {
                await stream.writeSSE({
                  event: "error",
                  data: JSON.stringify({
                    label: event.label,
                    error: event.error,
                  }),
                })
                done = true
                break
              }
            } catch {
              done = true
              break
            }
          }
          if (!done) {
            await new Promise((r) => setTimeout(r, 50))
          }
        }

        unsubscribe()
      })
    }

    const job = stepService.getStatus(label)
    if (!job) {
      return c.json({ status: "idle", label })
    }
    return c.json(job)
  })

  return app
}
