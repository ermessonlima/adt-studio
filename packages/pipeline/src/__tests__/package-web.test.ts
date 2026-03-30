import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { Storage, PageData } from "@adt/storage"
import { packageAdtWeb, packageWebpub, renderPageHtml, rewriteImageUrls, convertLatexToMathml, convertLatexString } from "../package-web.js"

function createMockStorage(
  pages: PageData[],
  nodeData: Record<string, Record<string, unknown>>,
): Storage {
  return {
    getLatestNodeData(node: string, itemId: string) {
      const data = nodeData[node]?.[itemId]
      return data !== undefined ? { version: 1, data } : null
    },
    getPages: () => pages,
    getPageImageBase64: () => "",
    getImageBase64: () => "",
    getPageImages: () => [],
    putNodeData: () => 1,
    clearExtractedData: () => {},
    putExtractedPage: () => {},
    appendLlmLog: () => {},
    close: () => {},
  }
}

function createWebAssets(webAssetsDir: string): void {
  fs.mkdirSync(webAssetsDir, { recursive: true })
  fs.writeFileSync(
    path.join(webAssetsDir, "base.js"),
    'window.__ADT_BUNDLE_TEST__ = "ok";\n',
  )
  fs.writeFileSync(path.join(webAssetsDir, "fonts.css"), "body { font-family: serif; }")
  fs.writeFileSync(
    path.join(webAssetsDir, "tailwind_css.css"),
    "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n",
  )
}

function createMinimalStorage(): Storage {
  return createMockStorage(
    [{ pageId: "pg001", pageNumber: 1, text: "Page one" }],
    {
      "web-rendering": {
        pg001: {
          sections: [
            { sectionIndex: 0, sectionType: "content", reasoning: "ok", html: "<div>Hello</div>" },
          ],
        },
      },
      "page-sectioning": {
        pg001: {
          reasoning: "ok",
          sections: [
            {
              sectionId: "pg001_sec001",
              sectionType: "content",
              parts: [],
              backgroundColor: "#fff",
              textColor: "#000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
      },
    },
  )
}

describe("renderPageHtml", () => {
  it("includes font preload links before stylesheet links", () => {
    const html = renderPageHtml({
      content: "<p>Hello</p>",
      language: "en",
      sectionId: "pg001",
      pageTitle: "Test",
      pageIndex: 1,
      hasMath: false,
      bundleVersion: "1",
    })

    expect(html).toContain(
      '<link rel="preload" href="./assets/fonts/Merriweather-VariableFont.woff2" as="font" type="font/woff2" crossorigin>',
    )
    expect(html).toContain(
      '<link rel="preload" href="./assets/fonts/Merriweather-Italic-VariableFont.woff2" as="font" type="font/woff2" crossorigin>',
    )

    // Preloads should appear before the fonts.css stylesheet
    const preloadPos = html.indexOf('rel="preload"')
    const stylesheetPos = html.indexOf('href="./assets/fonts.css"')
    expect(preloadPos).toBeLessThan(stylesheetPos)
  })

  it("uses offline/SCORM scripts instead of type=module in normal mode", () => {
    const html = renderPageHtml({
      content: "<p>Hello</p>",
      language: "en",
      sectionId: "pg001",
      pageTitle: "Test",
      pageIndex: 1,
      hasMath: false,
      bundleVersion: "1",
    })

    expect(html).toContain('src="./assets/offline-preloader.js"')
    expect(html).toContain('src="./assets/scorm.js"')
    expect(html).toContain('src="./assets/base.bundle.local.js"')
    expect(html).not.toContain('type="module"')
  })

  it("keeps type=module script in embed mode", () => {
    const html = renderPageHtml({
      content: "<p>Hello</p>",
      language: "en",
      sectionId: "pg001",
      pageTitle: "Test",
      pageIndex: 1,
      hasMath: false,
      bundleVersion: "1",
      embed: true,
    })

    expect(html).toContain('type="module"')
    expect(html).toContain("base.bundle.min.js")
    expect(html).not.toContain("offline-preloader.js")
    expect(html).not.toContain("scorm.js")
  })

  it("includes crossorigin on font preloads", () => {
    const html = renderPageHtml({
      content: "<p>Hello</p>",
      language: "en",
      sectionId: "pg001",
      pageTitle: "Test",
      pageIndex: 1,
      hasMath: false,
      bundleVersion: "1",
    })

    expect(html).toContain('as="font" type="font/woff2" crossorigin>')
  })
})

describe("packageAdtWeb", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "package-web-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("uses a safe default locale, avoids page-number carryover, and escapes inline answer JSON", async () => {
    const bookDir = path.join(tmpDir, "book")
    const webAssetsDir = path.join(tmpDir, "assets-web")
    fs.mkdirSync(bookDir, { recursive: true })
    createWebAssets(webAssetsDir)

    const pages: PageData[] = [
      { pageId: "pg001", pageNumber: 1, text: "Page one" },
      { pageId: "pg002", pageNumber: 2, text: "Page two" },
    ]

    const storage = createMockStorage(pages, {
      "web-rendering": {
        pg001: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "content",
              reasoning: "ok",
              html: "<div>First page</div>",
              activityAnswers: {
                q1: "</script><script>alert('x')</script>",
              },
            },
          ],
        },
        pg002: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "content",
              reasoning: "ok",
              html: "<div>Second page</div>",
            },
          ],
        },
      },
      "page-sectioning": {
        pg001: {
          reasoning: "ok",
          sections: [
            {
              sectionId: "pg001_sec001",
              sectionType: "content",
              parts: [],
              backgroundColor: "#fff",
              textColor: "#000",
              pageNumber: 10,
              isPruned: false,
            },
          ],
        },
        pg002: {
          reasoning: "ok",
          sections: [
            {
              sectionId: "pg002_sec001",
              sectionType: "content",
              parts: [],
              backgroundColor: "#fff",
              textColor: "#000",
              pageNumber: null,
              isPruned: false,
            },
          ],
        },
      },
      "text-catalog-translation": {
        fr: {
          entries: [{ id: "tx001", text: "Bonjour" }],
          generatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    })

    await packageAdtWeb(storage, {
      bookDir,
      label: "book",
      language: "en",
      outputLanguages: ["fr"],
      title: "Book Title",
      webAssetsDir,
    })

    const pagesJson = JSON.parse(
      fs.readFileSync(path.join(bookDir, "adt", "content", "pages.json"), "utf-8"),
    ) as Array<{ section_id: string; href: string; page_number?: number }>
    expect(pagesJson).toHaveLength(2)
    expect(pagesJson[0]).toEqual({ section_id: "pg001_sec001", href: "index.html", page_number: 10 })
    expect(pagesJson[1]).toEqual({ section_id: "pg002_sec001", href: "pg002_sec001.html" })

    const configJson = JSON.parse(
      fs.readFileSync(path.join(bookDir, "adt", "assets", "config.json"), "utf-8"),
    ) as { languages: { default: string; available: string[] } }
    expect(configJson.languages.available).toEqual(["fr"])
    expect(configJson.languages.default).toBe("fr")

    const pageHtml = fs.readFileSync(path.join(bookDir, "adt", "index.html"), "utf-8")
    expect(pageHtml).toContain("window.correctAnswers = JSON.parse(")
    expect(pageHtml).not.toContain("</script><script>alert('x')</script>")
    expect(pageHtml).toContain("\\u003c/script\\u003e\\u003cscript\\u003e")

    const bundlePath = path.join(bookDir, "adt", "assets", "base.bundle.min.js")
    expect(fs.existsSync(bundlePath)).toBe(true)
    expect(fs.readFileSync(bundlePath, "utf-8")).toContain("__ADT_BUNDLE_TEST__")
    expect(fs.existsSync(`${bundlePath}.map`)).toBe(true)

    // Offline preloader generated
    const preloaderPath = path.join(bookDir, "adt", "assets", "offline-preloader.js")
    expect(fs.existsSync(preloaderPath)).toBe(true)
    const preloader = fs.readFileSync(preloaderPath, "utf-8")
    expect(preloader).toContain("window.fetch")
    expect(preloader).toContain("INLINE")

    // Local bundle generated (no export statement)
    const localBundlePath = path.join(bookDir, "adt", "assets", "base.bundle.local.js")
    expect(fs.existsSync(localBundlePath)).toBe(true)

    // SCORM adapter generated
    const scormPath = path.join(bookDir, "adt", "assets", "scorm.js")
    expect(fs.existsSync(scormPath)).toBe(true)
    expect(fs.readFileSync(scormPath, "utf-8")).toContain("LMSInitialize")

    // SCORM manifest generated
    const manifestPath = path.join(bookDir, "adt", "imsmanifest.xml")
    expect(fs.existsSync(manifestPath)).toBe(true)
    const manifest = fs.readFileSync(manifestPath, "utf-8")
    expect(manifest).toContain("ADL SCORM")
    expect(manifest).toContain("index.html")
  })

  it("inserts quiz pages even when the anchor page has no rendered sections", async () => {
    const bookDir = path.join(tmpDir, "book")
    const webAssetsDir = path.join(tmpDir, "assets-web")
    fs.mkdirSync(bookDir, { recursive: true })
    createWebAssets(webAssetsDir)

    const pages: PageData[] = [
      { pageId: "pg001", pageNumber: 1, text: "Page one" },
      { pageId: "pg002", pageNumber: 2, text: "Page two" },
    ]

    const storage = createMockStorage(pages, {
      "web-rendering": {
        pg001: {
          sections: [],
        },
        pg002: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "content",
              reasoning: "ok",
              html: "<div>Second page</div>",
            },
          ],
        },
      },
      "page-sectioning": {
        pg001: {
          reasoning: "ok",
          sections: [
            {
              sectionId: "pg001_sec001",
              sectionType: "content",
              parts: [],
              backgroundColor: "#fff",
              textColor: "#000",
              pageNumber: 10,
              isPruned: false,
            },
          ],
        },
      },
      "quiz-generation": {
        book: {
          generatedAt: "2026-01-01T00:00:00.000Z",
          language: "en",
          pagesPerQuiz: 3,
          quizzes: [
            {
              quizIndex: 0,
              afterPageId: "pg001",
              pageIds: ["pg001"],
              question: "What is 2+2?",
              options: [
                { text: "3", explanation: "Nope" },
                { text: "4", explanation: "Yes" },
              ],
              answerIndex: 1,
              reasoning: "...",
            },
          ],
        },
      },
    })

    await packageAdtWeb(storage, {
      bookDir,
      label: "book",
      language: "en",
      outputLanguages: ["en"],
      title: "Book Title",
      webAssetsDir,
    })

    const pagesJson = JSON.parse(
      fs.readFileSync(path.join(bookDir, "adt", "content", "pages.json"), "utf-8"),
    ) as Array<{ section_id: string; href: string; page_number?: number }>

    expect(pagesJson).toEqual([
      { section_id: "qz001", href: "index.html" },
      { section_id: "pg002_sec001", href: "pg002_sec001.html" },
    ])
    expect(fs.existsSync(path.join(bookDir, "adt", "index.html"))).toBe(true)

    // SCORM adapter should include the quiz activity ID
    const scorm = fs.readFileSync(path.join(bookDir, "adt", "assets", "scorm.js"), "utf-8")
    expect(scorm).toContain('"qz001"')
  })

  it("sets activities true in config.json when a section has an activity type", async () => {
    const bookDir = path.join(tmpDir, "book")
    const webAssetsDir = path.join(tmpDir, "assets-web")
    fs.mkdirSync(bookDir, { recursive: true })
    createWebAssets(webAssetsDir)

    const pages: PageData[] = [
      { pageId: "pg001", pageNumber: 1, text: "Page one" },
    ]

    const storage = createMockStorage(pages, {
      "web-rendering": {
        pg001: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "activity_multiple_choice",
              reasoning: "ok",
              html: '<section role="activity"><div>Pick one</div></section>',
              activityAnswers: { "item-1": true },
            },
          ],
        },
      },
      "page-sectioning": {
        pg001: {
          reasoning: "ok",
          sections: [
            {
              sectionId: "pg001_sec001",
              sectionType: "activity_multiple_choice",
              parts: [],
              backgroundColor: "#fff",
              textColor: "#000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
      },
    })

    await packageAdtWeb(storage, {
      bookDir,
      label: "book",
      language: "en",
      outputLanguages: ["en"],
      title: "Book Title",
      webAssetsDir,
    })

    const configJson = JSON.parse(
      fs.readFileSync(path.join(bookDir, "adt", "assets", "config.json"), "utf-8"),
    ) as { features: { activities: boolean } }
    expect(configJson.features.activities).toBe(true)
  })

  it("sets activities true from rendered section type even without section metadata", async () => {
    const bookDir = path.join(tmpDir, "book")
    const webAssetsDir = path.join(tmpDir, "assets-web")
    fs.mkdirSync(bookDir, { recursive: true })
    createWebAssets(webAssetsDir)

    const pages: PageData[] = [
      { pageId: "pg001", pageNumber: 1, text: "Page one" },
    ]

    const storage = createMockStorage(pages, {
      "web-rendering": {
        pg001: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "activity_multiple_choice",
              reasoning: "ok",
              html: '<section role="activity"><div>Pick one</div></section>',
              activityAnswers: { "item-1": true },
            },
          ],
        },
      },
    })

    await packageAdtWeb(storage, {
      bookDir,
      label: "book",
      language: "en",
      outputLanguages: ["en"],
      title: "Book Title",
      webAssetsDir,
    })

    const configJson = JSON.parse(
      fs.readFileSync(path.join(bookDir, "adt", "assets", "config.json"), "utf-8"),
    ) as { features: { activities: boolean } }
    expect(configJson.features.activities).toBe(true)
  })

  it("converts LaTeX math to MathML in output HTML and does not include MathJax script", async () => {
    const bookDir = path.join(tmpDir, "book")
    const webAssetsDir = path.join(tmpDir, "assets-web")
    fs.mkdirSync(bookDir, { recursive: true })
    createWebAssets(webAssetsDir)

    const pages: PageData[] = [
      { pageId: "pg001", pageNumber: 1, text: "Page one" },
    ]

    const storage = createMockStorage(pages, {
      "web-rendering": {
        pg001: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "content",
              reasoning: "ok",
              html: '<div>The area is $\\pi r^2$ and the fraction is $$\\frac{1}{2}$$</div>',
            },
          ],
        },
      },
      "page-sectioning": {
        pg001: {
          reasoning: "ok",
          sections: [
            {
              sectionId: "pg001_sec001",
              sectionType: "content",
              parts: [],
              backgroundColor: "#fff",
              textColor: "#000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
      },
    })

    await packageAdtWeb(storage, {
      bookDir,
      label: "book",
      language: "en",
      outputLanguages: ["en"],
      title: "Math Book",
      webAssetsDir,
    })

    const pageHtml = fs.readFileSync(path.join(bookDir, "adt", "index.html"), "utf-8")
    // LaTeX should be replaced with MathML
    expect(pageHtml).toContain("<math")
    expect(pageHtml).not.toContain("$\\pi r^2$")
    expect(pageHtml).not.toContain("$$\\frac{1}{2}$$")
    // MathJax script should not be included (we use static MathML now)
    expect(pageHtml).not.toContain("mathjax")
  })

  it("orders rendered sections by sectionIndex before writing pages.json", async () => {
    const bookDir = path.join(tmpDir, "book")
    const webAssetsDir = path.join(tmpDir, "assets-web")
    fs.mkdirSync(bookDir, { recursive: true })
    createWebAssets(webAssetsDir)

    const pages: PageData[] = [
      { pageId: "pg001", pageNumber: 1, text: "Page one" },
    ]

    const storage = createMockStorage(pages, {
      "web-rendering": {
        pg001: {
          sections: [
            {
              sectionIndex: 1,
              sectionType: "content",
              reasoning: "ok",
              html: "<div>Second section</div>",
            },
            {
              sectionIndex: 0,
              sectionType: "content",
              reasoning: "ok",
              html: "<div>First section</div>",
            },
          ],
        },
      },
      "page-sectioning": {
        pg001: {
          reasoning: "ok",
          sections: [
            {
              sectionId: "pg001_sec001",
              sectionType: "content",
              parts: [],
              backgroundColor: "#fff",
              textColor: "#000",
              pageNumber: 1,
              isPruned: false,
            },
            {
              sectionId: "pg001_sec002",
              sectionType: "content",
              parts: [],
              backgroundColor: "#fff",
              textColor: "#000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
      },
    })

    await packageAdtWeb(storage, {
      bookDir,
      label: "book",
      language: "en",
      outputLanguages: ["en"],
      title: "Book Title",
      webAssetsDir,
    })

    const pagesJson = JSON.parse(
      fs.readFileSync(path.join(bookDir, "adt", "content", "pages.json"), "utf-8"),
    ) as Array<{ section_id: string; href: string; page_number?: number }>
    expect(pagesJson).toEqual([
      { section_id: "pg001_sec001", href: "index.html", page_number: 1 },
      { section_id: "pg001_sec002", href: "pg001_sec002.html", page_number: 1 },
    ])
  })

  it("builds IIFE bundle via esbuild when only pre-built ESM exists", async () => {
    const bookDir = path.join(tmpDir, "book")
    const webAssetsDir = path.join(tmpDir, "assets-web")
    fs.mkdirSync(bookDir, { recursive: true })
    createWebAssets(webAssetsDir)

    // Simulate partial pre-build: only ESM pre-built, no IIFE
    const preBuiltContent = '/* pre-built ESM marker */\nconsole.log("esm");'
    fs.writeFileSync(path.join(webAssetsDir, "base.bundle.min.js"), preBuiltContent)

    const storage = createMinimalStorage()
    await packageAdtWeb(storage, {
      bookDir,
      label: "book",
      language: "en",
      outputLanguages: ["en"],
      title: "Test",
      webAssetsDir,
    })

    const assetsDir = path.join(bookDir, "adt", "assets")

    // ESM was copied (matches pre-built content exactly)
    const esmOutput = fs.readFileSync(path.join(assetsDir, "base.bundle.min.js"), "utf-8")
    expect(esmOutput).toBe(preBuiltContent)

    // IIFE was built by esbuild (exists, has content from base.js)
    const iifePath = path.join(assetsDir, "base.bundle.local.js")
    expect(fs.existsSync(iifePath)).toBe(true)
    const iifeContent = fs.readFileSync(iifePath, "utf-8")
    expect(iifeContent.length).toBeGreaterThan(0)
    expect(iifeContent).toContain("__ADT_BUNDLE_TEST__")
    expect(iifeContent).not.toContain("pre-built ESM marker")
  })

  it("builds ESM bundle via esbuild when only pre-built IIFE exists", async () => {
    const bookDir = path.join(tmpDir, "book")
    const webAssetsDir = path.join(tmpDir, "assets-web")
    fs.mkdirSync(bookDir, { recursive: true })
    createWebAssets(webAssetsDir)

    // Simulate partial pre-build: only IIFE pre-built, no ESM
    const preBuiltContent = '/* pre-built IIFE marker */\nconsole.log("iife");'
    fs.writeFileSync(path.join(webAssetsDir, "base.bundle.local.js"), preBuiltContent)

    const storage = createMinimalStorage()
    await packageAdtWeb(storage, {
      bookDir,
      label: "book",
      language: "en",
      outputLanguages: ["en"],
      title: "Test",
      webAssetsDir,
    })

    const assetsDir = path.join(bookDir, "adt", "assets")

    // IIFE was copied (matches pre-built content exactly)
    const iifeOutput = fs.readFileSync(path.join(assetsDir, "base.bundle.local.js"), "utf-8")
    expect(iifeOutput).toBe(preBuiltContent)

    // ESM was built by esbuild (exists, has content from base.js, has sourcemap)
    const esmPath = path.join(assetsDir, "base.bundle.min.js")
    expect(fs.existsSync(esmPath)).toBe(true)
    const esmContent = fs.readFileSync(esmPath, "utf-8")
    expect(esmContent.length).toBeGreaterThan(0)
    expect(esmContent).toContain("__ADT_BUNDLE_TEST__")
    expect(fs.existsSync(`${esmPath}.map`)).toBe(true)
    expect(esmContent).not.toContain("pre-built IIFE marker")
  })

  it("copies both bundles without rebuilding when both pre-built files exist", async () => {
    const bookDir = path.join(tmpDir, "book")
    const webAssetsDir = path.join(tmpDir, "assets-web")
    fs.mkdirSync(bookDir, { recursive: true })
    createWebAssets(webAssetsDir)

    // Both pre-built
    const esmContent = '/* pre-built ESM */\nconsole.log("esm");'
    const iifeContent = '/* pre-built IIFE */\nconsole.log("iife");'
    fs.writeFileSync(path.join(webAssetsDir, "base.bundle.min.js"), esmContent)
    fs.writeFileSync(path.join(webAssetsDir, "base.bundle.local.js"), iifeContent)

    const storage = createMinimalStorage()
    await packageAdtWeb(storage, {
      bookDir,
      label: "book",
      language: "en",
      outputLanguages: ["en"],
      title: "Test",
      webAssetsDir,
    })

    const assetsDir = path.join(bookDir, "adt", "assets")

    // Both files are exact copies of pre-built content
    expect(fs.readFileSync(path.join(assetsDir, "base.bundle.min.js"), "utf-8")).toBe(esmContent)
    expect(fs.readFileSync(path.join(assetsDir, "base.bundle.local.js"), "utf-8")).toBe(iifeContent)

    // No sourcemap — esbuild was not invoked
    expect(fs.existsSync(path.join(assetsDir, "base.bundle.min.js.map"))).toBe(false)
  })
})

describe("rewriteImageUrls", () => {
  it("rewrites src URL from API path to local images/ path", () => {
    const html = `<img src="/api/books/mybook/images/abc123">`
    const imageMap = new Map([["abc123", "photo.jpg"]])
    const { html: out, referencedImages } = rewriteImageUrls(html, "mybook", imageMap)
    expect(out).toContain('src="images/photo.jpg"')
    // referencedImages contains image IDs (not filenames) — callers use IDs to look up files
    expect(referencedImages).toContain("abc123")
  })

  it("removes explicit width and height attributes", () => {
    const html = `<img src="/api/books/mybook/images/abc123" width="1200" height="900">`
    const imageMap = new Map([["abc123", "photo.jpg"]])
    const { html: out } = rewriteImageUrls(html, "mybook", imageMap)
    expect(out).not.toMatch(/width="/)
    expect(out).not.toMatch(/height="/)
  })

  it("adds max-width inline style to prevent overflow", () => {
    const html = `<img src="/api/books/mybook/images/abc123">`
    const imageMap = new Map([["abc123", "photo.jpg"]])
    const { html: out } = rewriteImageUrls(html, "mybook", imageMap)
    expect(out).toContain("max-width: 100%")
    expect(out).toContain("height: auto")
  })

  it("preserves existing inline styles when adding max-width", () => {
    const html = `<img src="/api/books/mybook/images/abc123" style="border: 1px solid red;">`
    const imageMap = new Map([["abc123", "photo.jpg"]])
    const { html: out } = rewriteImageUrls(html, "mybook", imageMap)
    expect(out).toContain("border: 1px solid red")
    expect(out).toContain("max-width: 100%")
  })

  it("does not duplicate max-width if style already contains it", () => {
    const html = `<img src="/api/books/mybook/images/abc123" style="max-width: 50%;">`
    const imageMap = new Map([["abc123", "photo.jpg"]])
    const { html: out } = rewriteImageUrls(html, "mybook", imageMap)
    const matches = (out.match(/max-width/g) ?? []).length
    expect(matches).toBe(1)
  })

  it("does not include unreferenced images in referencedImages", () => {
    const html = `<img src="/api/books/mybook/images/unknown">`
    const imageMap = new Map([["abc123", "photo.jpg"]])
    const { referencedImages } = rewriteImageUrls(html, "mybook", imageMap)
    expect(referencedImages).toHaveLength(0)
  })

  it("leaves non-API image srcs unchanged", () => {
    const html = `<img src="https://example.com/photo.jpg">`
    const imageMap = new Map<string, string>()
    const { html: out } = rewriteImageUrls(html, "mybook", imageMap)
    expect(out).toContain('src="https://example.com/photo.jpg"')
  })
})

describe("convertLatexToMathml", () => {
  it("converts inline $...$ LaTeX to MathML", () => {
    const result = convertLatexToMathml("<p>The equation $x^2$ is simple.</p>")
    expect(result).toContain("<math")
    expect(result).toContain("</math>")
    expect(result).not.toContain("$x^2$")
  })

  it("converts display $$...$$ LaTeX to MathML with display=block", () => {
    const result = convertLatexToMathml('<p>$$\\frac{1}{2}$$</p>')
    expect(result).toContain('display="block"')
    expect(result).toContain("<mfrac>")
  })

  it("converts \\(...\\) inline delimiters", () => {
    const result = convertLatexToMathml("<p>Inline \\(a + b\\) math</p>")
    expect(result).toContain("<math")
    expect(result).not.toContain("\\(a + b\\)")
  })

  it("converts \\[...\\] display delimiters", () => {
    const result = convertLatexToMathml("<p>\\[a + b = c\\]</p>")
    expect(result).toContain('display="block"')
  })

  it("leaves non-math content unchanged", () => {
    const html = "<p>No math here</p>"
    expect(convertLatexToMathml(html)).toBe(html)
  })

  it("leaves invalid LaTeX as-is on parse error", () => {
    const html = "<p>$\\invalid{$</p>"
    const result = convertLatexToMathml(html)
    // Should either convert or leave as-is, not throw
    expect(result).toContain("<p>")
  })

  it("handles multiple math expressions in one string", () => {
    const result = convertLatexToMathml("<p>$a$ and $b$</p>")
    const mathCount = (result.match(/<math/g) ?? []).length
    expect(mathCount).toBe(2)
  })

  it("converts undelimited LaTeX with \\text{} in text nodes", () => {
    const html = '<p data-id="tx001">V_{\\text{empilhamento I}} = 6\\ \\text{cubos}</p>'
    const result = convertLatexToMathml(html)
    expect(result).toContain("<math")
    expect(result).not.toContain("\\text{")
  })

  it("converts undelimited LaTeX with \\hat{} and ^\\circ", () => {
    const html = '<p data-id="tx001">m(A\\hat{O}B) + m(B\\hat{O}C) = 37^\\circ + 53^\\circ = 90^\\circ</p>'
    const result = convertLatexToMathml(html)
    expect(result).toContain("<math")
    expect(result).not.toContain("\\hat{")
  })

  it("does not modify text nodes without LaTeX", () => {
    const html = "<p>Just plain text here</p>"
    expect(convertLatexToMathml(html)).toBe(html)
  })
})

describe("convertLatexString", () => {
  it("converts undelimited LaTeX in plain text (text catalog entry)", () => {
    const text = "\\left(2\\frac{3}{4}x + 9\\right) + \\left(2\\frac{3}{4}x + 9\\right)"
    const result = convertLatexString(text)
    expect(result).toContain("<math")
    expect(result).not.toContain("\\frac")
    expect(result).not.toContain("\\left")
  })

  it("converts delimited LaTeX in plain text", () => {
    const result = convertLatexString("The area is $\\pi r^2$")
    expect(result).toContain("<math")
    expect(result).not.toContain("$\\pi")
  })

  it("leaves plain text without LaTeX unchanged", () => {
    const text = "Just a normal sentence."
    expect(convertLatexString(text)).toBe(text)
  })

  it("converts LaTeX with \\hat and ^\\circ", () => {
    const text = "m(A\\hat{O}B) = 37^\\circ"
    const result = convertLatexString(text)
    expect(result).toContain("<math")
    expect(result).not.toContain("\\hat{")
  })

  it("does not convert mixed prose with embedded math as a single expression", () => {
    const text = "the molecular structure space M = (X, V), where X ∈ ℝ^{N×3} denotes atomic coordinates"
    const result = convertLatexString(text)
    // Should NOT be wrapped in a single <math> tag — it's prose, not a formula
    expect(result).not.toMatch(/^<math/)
    // The original text should be largely preserved
    expect(result).toContain("molecular structure space")
  })
})

describe("convertLatexToMathml (HTML)", () => {
  it("does not convert mixed prose text nodes as math", () => {
    const html = '<p data-id="tx001">the retrieval-augmented diffusion process where X ∈ ℝ^{N×3} denotes atomic coordinates</p>'
    const result = convertLatexToMathml(html)
    // Should preserve the prose — not wrap in <math>
    expect(result).toContain("retrieval-augmented diffusion")
    expect(result).not.toMatch(/>.*<math.*retrieval/)
  })

  it("still converts pure math text nodes", () => {
    const html = '<p data-id="tx001">V_{\\text{empilhamento I}} = 6\\ \\text{cubos}</p>'
    const result = convertLatexToMathml(html)
    expect(result).toContain("<math")
  })
})

describe("packageWebpub", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "package-webpub-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  async function buildAdtFirst(
    bookDir: string,
    webAssetsDir: string,
    storage: Storage,
    title = "Test Book",
  ) {
    await packageAdtWeb(storage, {
      bookDir,
      label: "book",
      language: "en",
      outputLanguages: ["en"],
      title,
      webAssetsDir,
    })
  }

  function setupBook() {
    const bookDir = path.join(tmpDir, "book")
    const webAssetsDir = path.join(tmpDir, "assets-web")
    fs.mkdirSync(bookDir, { recursive: true })
    createWebAssets(webAssetsDir)

    const pages: PageData[] = [
      { pageId: "pg001", pageNumber: 1, text: "Page one" },
    ]

    const storage = createMockStorage(pages, {
      "web-rendering": {
        pg001: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "content",
              reasoning: "ok",
              html: "<div>First page</div>",
            },
          ],
        },
      },
      "page-sectioning": {
        pg001: {
          reasoning: "ok",
          sections: [
            {
              sectionId: "pg001_sec001",
              sectionType: "content",
              parts: [],
              backgroundColor: "#fff",
              textColor: "#000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
      },
      metadata: {
        book: {
          title: "Test Book",
          authors: ["Author"],
          publisher: "Publisher",
          language_code: "en",
        },
      },
    })

    return { bookDir, webAssetsDir, storage }
  }

  it("disables showNavigationControls and showTutorial in config", async () => {
    const { bookDir, webAssetsDir, storage } = setupBook()
    await buildAdtFirst(bookDir, webAssetsDir, storage)
    packageWebpub(storage, {
      bookDir,
      label: "book",
      language: "en",
      outputLanguages: ["en"],
      title: "Test Book",
      webAssetsDir,
    })

    const config = JSON.parse(
      fs.readFileSync(path.join(bookDir, "webpub", "assets", "config.json"), "utf-8"),
    )
    expect(config.features.showNavigationControls).toBe(false)
    expect(config.features.showTutorial).toBe(false)
  })

  it("injects CSS overrides into HTML pages", async () => {
    const { bookDir, webAssetsDir, storage } = setupBook()
    await buildAdtFirst(bookDir, webAssetsDir, storage)
    packageWebpub(storage, {
      bookDir,
      label: "book",
      language: "en",
      outputLanguages: ["en"],
      title: "Test Book",
      webAssetsDir,
    })

    const html = fs.readFileSync(path.join(bookDir, "webpub", "index.html"), "utf-8")
    expect(html).toContain("columns: auto !important")
    expect(html).toContain("flex-direction: column !important")
    expect(html).toContain("max-width: 100% !important")
  })

  it("writes a valid webpub manifest with scrolled presentation", async () => {
    const { bookDir, webAssetsDir, storage } = setupBook()
    await buildAdtFirst(bookDir, webAssetsDir, storage)
    packageWebpub(storage, {
      bookDir,
      label: "book",
      language: "en",
      outputLanguages: ["en"],
      title: "My Test Book",
      webAssetsDir,
    })

    const manifest = JSON.parse(
      fs.readFileSync(path.join(bookDir, "webpub", "manifest.json"), "utf-8"),
    )
    expect(manifest["@context"]).toBe("https://readium.org/webpub-manifest/context.jsonld")
    expect(manifest.metadata.title).toBe("My Test Book")
    expect(manifest.metadata.language).toBe("en")
    expect(manifest.metadata.presentation.overflow).toBe("scrolled")
    expect(manifest.metadata.presentation.spread).toBe("none")
    expect(manifest.metadata.author).toBe("Author")
    expect(manifest.metadata.publisher).toBe("Publisher")
    expect(manifest.readingOrder).toHaveLength(1)
    expect(manifest.readingOrder[0].type).toBe("text/html")
    expect(manifest.readingOrder[0].href).toBe("index.html")
    expect(manifest.links[0]).toEqual({
      rel: "self",
      href: "manifest.json",
      type: "application/webpub+json",
    })
    expect(manifest.resources.length).toBeGreaterThan(0)
  })

  it("throws when ADT package has not been built", () => {
    const bookDir = path.join(tmpDir, "book")
    fs.mkdirSync(bookDir, { recursive: true })
    const storage = createMockStorage([], {})

    expect(() =>
      packageWebpub(storage, {
        bookDir,
        label: "book",
        language: "en",
        outputLanguages: ["en"],
        title: "Test",
        webAssetsDir: tmpDir,
      })
    ).toThrow("ADT package not found")
  })
})
