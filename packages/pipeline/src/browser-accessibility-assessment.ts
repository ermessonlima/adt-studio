import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import {
  BrowserAccessibilityAssessmentOutput,
  type AccessibilityAssessmentOutput as AccessibilityAssessmentOutputType,
  type BrowserAccessibilityAssessmentOutput as BrowserAccessibilityAssessmentOutputType,
  type BrowserAccessibilityPageResult,
} from "@adt/types"
import type { Progress } from "./progress.js"
import { nullProgress } from "./progress.js"
import { runAccessibilityAssessment } from "./accessibility-assessment.js"
import {
  derivePageId,
  getAxeSource,
  getUniquePackagedPageEntries,
  normalizeFinding,
  resolvePackagedPageFilePath,
  type PackagedPageManifestEntry,
} from "./accessibility-assessment-shared.js"

export interface BrowserAccessibilityRecheckTarget {
  pageId: string | null
  sectionId: string
  href: string
  pageNumber: number | null
  ruleIds: string[]
}

export interface BuildBrowserAccessibilityRecheckPlanOptions {
  includeIncompleteRules?: boolean
  fullPageRuleIds?: string[]
}

export interface RunBrowserAccessibilityAssessmentOptions extends BuildBrowserAccessibilityRecheckPlanOptions {
  bookDir: string
  baseAssessment?: AccessibilityAssessmentOutputType
}

const STEP = "accessibility-assessment" as const
const DEFAULT_FULL_PAGE_RULE_IDS = ["color-contrast"] as const

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)))
}

export function buildBrowserAccessibilityRecheckPlan(
  entries: PackagedPageManifestEntry[],
  baseAssessment: AccessibilityAssessmentOutputType,
  options: BuildBrowserAccessibilityRecheckPlanOptions = {},
): BrowserAccessibilityRecheckTarget[] {
  const includeIncompleteRules = options.includeIncompleteRules ?? true
  const fullPageRuleIds = uniqueStrings(options.fullPageRuleIds ?? [...DEFAULT_FULL_PAGE_RULE_IDS])
  const basePagesByHref = new Map(baseAssessment.pages.map((page) => [page.href, page]))
  const uniqueEntries = Array.from(new Map(entries.map((entry) => [entry.href, entry])).values())

  return uniqueEntries
    .map((entry) => {
      const ruleIds: string[] = []
      const basePage = basePagesByHref.get(entry.href)
      if (includeIncompleteRules && basePage) {
        for (const finding of basePage.incomplete) {
          ruleIds.push(finding.id)
        }
      }
      ruleIds.push(...fullPageRuleIds)
      const uniqueRuleIds = uniqueStrings(ruleIds)
      if (uniqueRuleIds.length === 0) return null
      return {
        pageId: derivePageId(entry.section_id),
        sectionId: entry.section_id,
        href: entry.href,
        pageNumber: entry.page_number ?? null,
        ruleIds: uniqueRuleIds,
      } satisfies BrowserAccessibilityRecheckTarget
    })
    .filter((entry): entry is BrowserAccessibilityRecheckTarget => entry !== null)
}

async function auditBrowserPage(
  browser: PlaywrightBrowser,
  adtDir: string,
  target: BrowserAccessibilityRecheckTarget,
  axeSource: string,
): Promise<BrowserAccessibilityPageResult> {
  const resolvedPath = resolvePackagedPageFilePath(adtDir, target.href)
  if (resolvedPath.error || !resolvedPath.filePath) {
    return {
      pageId: target.pageId,
      sectionId: target.sectionId,
      href: target.href,
      pageNumber: target.pageNumber,
      title: null,
      error: resolvedPath.error ?? "Packaged page path could not be resolved",
      recheckedRuleIds: target.ruleIds,
      violationCount: 0,
      incompleteCount: 0,
      passCount: 0,
      inapplicableCount: 0,
      violations: [],
      incomplete: [],
    }
  }

  const filePath = resolvedPath.filePath
  if (!fs.existsSync(filePath)) {
    return {
      pageId: target.pageId,
      sectionId: target.sectionId,
      href: target.href,
      pageNumber: target.pageNumber,
      title: null,
      error: `Packaged page not found: ${target.href}`,
      recheckedRuleIds: target.ruleIds,
      violationCount: 0,
      incompleteCount: 0,
      passCount: 0,
      inapplicableCount: 0,
      violations: [],
      incomplete: [],
    }
  }

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  try {
    const page = await context.newPage()
    await page.goto(pathToFileURL(filePath).href, { waitUntil: "load" })
    await page.evaluate(async () => {
      const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts
      if (fonts?.ready) {
        await fonts.ready
      }
    })
    // Force #content to full opacity before axe-core runs.  The page ships
    // with opacity-0 and its own JS adds transition-opacity + removes the
    // class on load — if that transition is in-flight when axe reads
    // computed styles, intermediate opacity values cause spurious
    // color-contrast violations.  Inline styles + transition:none
    // guarantee the element is fully opaque regardless of timing.
    await page.evaluate(() => {
      const el = document.getElementById("content")
      if (el) {
        el.classList.remove("opacity-0")
        el.style.opacity = "1"
        el.style.transition = "none"
        void el.offsetHeight
      }
    })
    await page.addScriptTag({ content: axeSource })
    const title = (await page.title()) || null
    const result = await page.evaluate(async (ruleIds) => {
      const axe = (window as typeof window & {
        axe?: {
          run: (context: unknown, options: unknown) => Promise<{
            violations?: unknown[]
            incomplete?: unknown[]
            passes?: unknown[]
            inapplicable?: unknown[]
          }>
        }
      }).axe

      if (!axe) {
        throw new Error("axe was not initialized in the page context")
      }

      return await axe.run(document, {
        runOnly: {
          type: "rule",
          values: ruleIds,
        },
      })
    }, target.ruleIds)

    const violations = Array.isArray(result.violations)
      ? result.violations.map(normalizeFinding)
      : []
    const incomplete = Array.isArray(result.incomplete)
      ? result.incomplete.map(normalizeFinding)
      : []
    const passCount = Array.isArray(result.passes) ? result.passes.length : 0
    const inapplicableCount = Array.isArray(result.inapplicable)
      ? result.inapplicable.length
      : 0

    return {
      pageId: target.pageId,
      sectionId: target.sectionId,
      href: target.href,
      pageNumber: target.pageNumber,
      title,
      recheckedRuleIds: target.ruleIds,
      violationCount: violations.length,
      incompleteCount: incomplete.length,
      passCount,
      inapplicableCount,
      violations,
      incomplete,
    }
  } catch (error) {
    return {
      pageId: target.pageId,
      sectionId: target.sectionId,
      href: target.href,
      pageNumber: target.pageNumber,
      title: null,
      error: error instanceof Error ? error.message : String(error),
      recheckedRuleIds: target.ruleIds,
      violationCount: 0,
      incompleteCount: 0,
      passCount: 0,
      inapplicableCount: 0,
      violations: [],
      incomplete: [],
    }
  } finally {
    await context.close()
  }
}

export async function runBrowserAccessibilityAssessment(
  options: RunBrowserAccessibilityAssessmentOptions,
  progress: Progress = nullProgress,
): Promise<BrowserAccessibilityAssessmentOutputType> {
  progress.emit({ type: "step-start", step: STEP })
  progress.emit({ type: "step-progress", step: STEP, message: "Loading packaged pages..." })

  const bookDir = path.resolve(options.bookDir)
  const baseAssessment = options.baseAssessment ?? await runAccessibilityAssessment({ bookDir })
  const pageEntries = getUniquePackagedPageEntries(bookDir)
  const targets = buildBrowserAccessibilityRecheckPlan(pageEntries, baseAssessment, {
    includeIncompleteRules: options.includeIncompleteRules,
    fullPageRuleIds: options.fullPageRuleIds,
  })
  const allRuleIds = uniqueStrings(targets.flatMap((target) => target.ruleIds))

  const axeSource = getAxeSource(await import("axe-core"))
  const pw = await import("playwright" as string) as {
    chromium: {
      launch(opts: { headless: boolean }): Promise<PlaywrightBrowser>
    }
  }
  const browser = await pw.chromium.launch({ headless: true })
  const adtDir = path.join(bookDir, "adt")
  const pages: BrowserAccessibilityPageResult[] = []

  try {
    for (let index = 0; index < targets.length; index++) {
      const target = targets[index]
      progress.emit({
        type: "step-progress",
        step: STEP,
        message: `${index + 1}/${targets.length}`,
        page: index + 1,
        totalPages: targets.length,
      })
      pages.push(await auditBrowserPage(browser, adtDir, target, axeSource))
    }
  } finally {
    await browser.close()
  }

  const output: BrowserAccessibilityAssessmentOutputType = {
    generatedAt: new Date().toISOString(),
    tool: "axe-core-playwright",
    baseGeneratedAt: baseAssessment.generatedAt,
    ruleIds: allRuleIds,
    pages,
    summary: {
      pageCount: pages.length,
      recheckedPageCount: pages.length,
      pagesWithViolations: pages.filter((page) => page.violationCount > 0).length,
      pagesWithErrors: pages.filter((page) => Boolean(page.error)).length,
      violationCount: pages.reduce((sum, page) => sum + page.violationCount, 0),
      incompleteCount: pages.reduce((sum, page) => sum + page.incompleteCount, 0),
    },
  }

  progress.emit({ type: "step-complete", step: STEP })
  return BrowserAccessibilityAssessmentOutput.parse(output)
}

interface PlaywrightBrowser {
  newContext(opts: { viewport: { width: number; height: number } }): Promise<PlaywrightContext>
  close(): Promise<void>
}

interface PlaywrightContext {
  newPage(): Promise<PlaywrightPage>
  close(): Promise<void>
}

interface PlaywrightPage {
  goto(url: string, opts?: { waitUntil?: string }): Promise<unknown>
  title(): Promise<string>
  addScriptTag(opts: { content: string }): Promise<unknown>
  evaluate<Result>(pageFunction: ((arg: string[]) => Result | Promise<Result>) | (() => Result | Promise<Result>), arg?: string[]): Promise<Result>
}
