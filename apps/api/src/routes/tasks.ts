import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { parseBookLabel } from "@adt/types"
import type { TaskService } from "../services/task-service.js"

export function createTaskRoutes(taskService: TaskService): Hono {
  const app = new Hono()

  // GET /books/:label/tasks — List active/recent tasks for a book
  app.get("/books/:label/tasks", (c) => {
    const { label } = c.req.param()
    let safeLabel: string
    try {
      safeLabel = parseBookLabel(label)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new HTTPException(400, { message })
    }
    const tasks = taskService.getActiveTasks(safeLabel)
    return c.json({ tasks })
  })

  return app
}
