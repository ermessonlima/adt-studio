import path from "node:path"
import fs from "node:fs"
import { Hono } from "hono"

export function createPromptRoutes(promptsDir: string) {
  const app = new Hono()

  // GET /prompts/:name — read prompt template content
  app.get("/prompts/:name", (c) => {
    const name = c.req.param("name")

    // Validate name: alphanumeric + underscores only (no path traversal)
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      return c.json({ error: "Invalid prompt name" }, 400)
    }

    const filePath = path.join(promptsDir, `${name}.liquid`)
    if (!fs.existsSync(filePath)) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    const content = fs.readFileSync(filePath, "utf-8")
    return c.json({ name, content })
  })

  // PUT /prompts/:name — update prompt template content
  app.put("/prompts/:name", async (c) => {
    const name = c.req.param("name")

    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      return c.json({ error: "Invalid prompt name" }, 400)
    }

    const body = await c.req.json<{ content: string }>()
    if (typeof body.content !== "string") {
      return c.json({ error: "Missing content field" }, 400)
    }

    const filePath = path.join(promptsDir, `${name}.liquid`)
    if (!fs.existsSync(filePath)) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    fs.writeFileSync(filePath, body.content, "utf-8")
    return c.json({ name, content: body.content })
  })

  return app
}
