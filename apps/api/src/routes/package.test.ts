import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import type { ExtractedPage } from "@adt/pdf"
import { createBookStorage } from "@adt/storage"
import { AccessibilityAssessmentOutput } from "@adt/types"
import { errorHandler } from "../middleware/error-handler.js"
import { createPackageRoutes } from "./package.js"

describe("Package routes", () => {
  let tmpDir: string
  let webAssetsDir: string
  let app: Hono

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "package-routes-"))
    webAssetsDir = path.join(tmpDir, "web-assets")
    fs.mkdirSync(webAssetsDir, { recursive: true })

    app = new Hono()
    app.onError(errorHandler)
    app.route("/api", createPackageRoutes(tmpDir, webAssetsDir))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function createTestBook(label: string): void {
    const storage = createBookStorage(label, tmpDir)
    storage.close()
  }

  function createRenderedBook(label: string): void {
    const storage = createBookStorage(label, tmpDir)
    const page: ExtractedPage = {
      pageId: "pg001",
      pageNumber: 1,
      text: "Page one",
      pageImage: {
        imageId: "pg001_page",
        pageId: "pg001",
        buffer: Buffer.from("fake-png-800x1200"),
        format: "png",
        width: 800,
        height: 1200,
        hash: "page-hash",
      },
      images: [],
    }

    storage.putExtractedPage(page)
    storage.putNodeData("page-sectioning", "pg001", {
      reasoning: "ok",
      sections: [
        {
          sectionId: "pg001_sec001",
          sectionType: "content",
          parts: [],
          backgroundColor: "#ffffff",
          textColor: "#000000",
          pageNumber: 1,
          isPruned: false,
        },
      ],
    })
    storage.putNodeData("web-rendering", "pg001", {
      sections: [
        {
          sectionIndex: 0,
          sectionType: "content",
          reasoning: "ok",
          html: '<main><img src="cover.png"></main>',
        },
      ],
    })
    storage.close()
  }

  function createWebAssets(): void {
    fs.writeFileSync(path.join(webAssetsDir, "base.js"), 'window.__ADT_BUNDLE_TEST__ = "ok";\n')
    fs.writeFileSync(path.join(webAssetsDir, "fonts.css"), "body { font-family: serif; }")
    fs.writeFileSync(
      path.join(webAssetsDir, "tailwind_css.css"),
      "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n",
    )
  }

  describe("POST /api/books/:label/package-adt", () => {
    it("returns 404 for missing book", async () => {
      const res = await app.request("/api/books/missing/package-adt", {
        method: "POST",
      })
      expect(res.status).toBe(404)
    })

    it("returns 409 when no pages have web rendering", async () => {
      createTestBook("book1")

      const res = await app.request("/api/books/book1/package-adt", {
        method: "POST",
      })

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toContain("web rendering")
    })

    it("stores accessibility assessment output after packaging", async () => {
      createRenderedBook("book-a11y")
      createWebAssets()

      const res = await app.request("/api/books/book-a11y/package-adt", {
        method: "POST",
      })

      expect(res.status).toBe(200)

      const storage = createBookStorage("book-a11y", tmpDir)
      const row = storage.getLatestNodeData("accessibility-assessment", "book")
      storage.close()

      expect(row?.version).toBe(1)
      const parsed = AccessibilityAssessmentOutput.safeParse(row?.data)
      expect(parsed.success).toBe(true)
      expect(parsed.success && parsed.data.summary.pageCount).toBe(1)
    })
  })

  describe("GET /api/books/:label/package-adt/status", () => {
    it("returns hasAdt=false when pages.json is missing", async () => {
      createTestBook("book2")

      const res = await app.request("/api/books/book2/package-adt/status")
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ label: "book2", hasAdt: false })
    })

    it("returns hasAdt=false when pages.json is invalid JSON", async () => {
      createTestBook("book3")
      const pagesPath = path.join(tmpDir, "book3", "adt", "content", "pages.json")
      fs.mkdirSync(path.dirname(pagesPath), { recursive: true })
      fs.writeFileSync(pagesPath, "{not-json")

      const res = await app.request("/api/books/book3/package-adt/status")
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ label: "book3", hasAdt: false })
    })

    it("returns hasAdt=false when pages.json has no href entries", async () => {
      createTestBook("book4")
      const pagesPath = path.join(tmpDir, "book4", "adt", "content", "pages.json")
      fs.mkdirSync(path.dirname(pagesPath), { recursive: true })
      fs.writeFileSync(pagesPath, JSON.stringify([{ section_id: "pg001" }]))

      const res = await app.request("/api/books/book4/package-adt/status")
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ label: "book4", hasAdt: false })
    })

    it("returns hasAdt=true when pages.json has at least one href entry", async () => {
      createTestBook("book5")
      const pagesPath = path.join(tmpDir, "book5", "adt", "content", "pages.json")
      fs.mkdirSync(path.dirname(pagesPath), { recursive: true })
      fs.writeFileSync(
        pagesPath,
        JSON.stringify([{ section_id: "pg001", href: "pg001.html" }]),
      )

      const res = await app.request("/api/books/book5/package-adt/status")
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ label: "book5", hasAdt: true })
    })
  })
})
