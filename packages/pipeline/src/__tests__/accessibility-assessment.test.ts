import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { runAccessibilityAssessment } from "../accessibility-assessment.js"

describe("runAccessibilityAssessment", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a11y-assessment-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("audits packaged pages and reports axe violations", async () => {
    const bookDir = path.join(tmpDir, "book")
    const adtDir = path.join(bookDir, "adt")
    const contentDir = path.join(adtDir, "content")
    fs.mkdirSync(contentDir, { recursive: true })

    fs.writeFileSync(
      path.join(contentDir, "pages.json"),
      JSON.stringify([
        { section_id: "pg001_sec001", href: "index.html", page_number: 1 },
        { section_id: "qz001", href: "quiz.html" },
      ])
    )

    fs.writeFileSync(
      path.join(adtDir, "index.html"),
      '<!doctype html><html lang="en"><head><title>Page One</title></head><body><main><img src="cover.png"></main></body></html>'
    )
    fs.writeFileSync(
      path.join(adtDir, "quiz.html"),
      '<!doctype html><html lang="en"><head><title>Quiz</title></head><body><main><button aria-label="Continue">Go</button></main></body></html>'
    )

    const result = await runAccessibilityAssessment({ bookDir })

    expect(result.tool).toBe("axe-core")
    expect(result.summary.pageCount).toBe(2)
    expect(result.pages[0].pageId).toBe("pg001")
    expect(result.pages[0].title).toBe("Page One")
    expect(result.pages[0].violations.some((item) => item.id === "image-alt")).toBe(true)
  })


  it("uses configured run tags and disabled rules", async () => {
    const bookDir = path.join(tmpDir, "book")
    const adtDir = path.join(bookDir, "adt")
    const contentDir = path.join(adtDir, "content")
    fs.mkdirSync(contentDir, { recursive: true })

    fs.writeFileSync(
      path.join(contentDir, "pages.json"),
      JSON.stringify([{ section_id: "pg001_sec001", href: "index.html", page_number: 1 }])
    )

    fs.writeFileSync(
      path.join(adtDir, "index.html"),
      '<!doctype html><html lang="en"><head><title>Page One</title></head><body><main><img src="cover.png"></main></body></html>'
    )

    const result = await runAccessibilityAssessment({
      bookDir,
      config: {
        run_only_tags: ["wcag2a", "cat.forms"],
        disabled_rules: [],
      },
    })

    expect(result.runOnlyTags).toEqual(["wcag2a", "cat.forms"])
    expect(result.disabledRules).toEqual([])
  })

  it("records a page error when manifest href escapes the ADT directory", async () => {
    const bookDir = path.join(tmpDir, "book")
    const contentDir = path.join(bookDir, "adt", "content")
    fs.mkdirSync(contentDir, { recursive: true })

    fs.writeFileSync(
      path.join(contentDir, "pages.json"),
      JSON.stringify([{ section_id: "pg001_sec001", href: "../escape.html", page_number: 1 }])
    )

    const result = await runAccessibilityAssessment({ bookDir })

    expect(result.summary.pagesWithErrors).toBe(1)
    expect(result.pages[0].error).toContain("outside the ADT directory")
  })
})
