import fs from "node:fs"
import path from "node:path"
import { JSDOM } from "jsdom"
import { z } from "zod"
import {
  AccessibilityAssessmentConfig,
  AccessibilityAssessmentOutput,
  type AccessibilityAssessmentOutput as AccessibilityAssessmentOutputType,
  type AccessibilityFinding,
  type AccessibilityNodeResult,
  type AccessibilityPageResult,
} from "@adt/types"
import type { Progress } from "./progress.js"
import { nullProgress } from "./progress.js"

export interface RunAccessibilityAssessmentOptions {
  bookDir: string
  config?: AccessibilityAssessmentConfig
}

const STEP = "accessibility-assessment" as const

const DEFAULT_AXE_RUN_ONLY_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "best-practice",
  "cat.semantics",
  "cat.tables",
  "cat.keyboard",
  "cat.forms",
  "cat.text-alternatives",
  "cat.time-and-media",
  "cat.name-role-value",
  "cat.structure",
  "cat.parsing",
  "cat.language",
  "cat.sensory-and-visual-cues",
  "cat.color",
  "experimental",
] as const

const DEFAULT_DISABLED_AXE_RULES = ["color-contrast"] as const

const PackagedPageManifestEntry = z.object({
  section_id: z.string(),
  href: z.string().min(1),
  page_number: z.number().int().optional(),
})

type PackagedPageManifestEntry = z.infer<typeof PackagedPageManifestEntry>

function derivePageId(sectionId: string): string | null {
  const match = /^(.*)_sec\d+$/.exec(sectionId)
  return match?.[1] ?? null
}

function getPackagedPageEntries(bookDir: string): PackagedPageManifestEntry[] {
  const pagesPath = path.join(bookDir, "adt", "content", "pages.json")
  if (!fs.existsSync(pagesPath)) {
    throw new Error("Packaged ADT pages manifest not found")
  }

  const parsed = JSON.parse(fs.readFileSync(pagesPath, "utf-8")) as unknown
  return z.array(PackagedPageManifestEntry).parse(parsed)
}

function getAxeSource(mod: unknown): string {
  if (typeof mod === "object" && mod !== null && "source" in mod) {
    const source = (mod as { source?: unknown }).source
    if (typeof source === "string") return source
  }
  if (typeof mod === "object" && mod !== null && "default" in mod) {
    const def = (mod as { default?: { source?: unknown } }).default
    if (typeof def?.source === "string") return def.source
  }
  throw new Error("Unable to load axe-core source")
}

function normalizeNode(node: unknown): AccessibilityNodeResult {
  if (typeof node !== "object" || node === null) {
    return { target: [] }
  }

  const target = Array.isArray((node as { target?: unknown }).target)
    ? (node as { target: unknown[] }).target.filter((item): item is string => typeof item === "string")
    : []

  const html = typeof (node as { html?: unknown }).html === "string"
    ? (node as { html: string }).html
    : undefined

  const failureSummaryValue = (node as { failureSummary?: unknown }).failureSummary
  const failureSummary = typeof failureSummaryValue === "string"
    ? failureSummaryValue
    : failureSummaryValue === null
      ? null
      : undefined

  return {
    target,
    ...(html ? { html } : {}),
    ...(failureSummary !== undefined ? { failureSummary } : {}),
  }
}

function normalizeFinding(finding: unknown): AccessibilityFinding {
  if (typeof finding !== "object" || finding === null) {
    return {
      id: "unknown",
      impact: null,
      description: "",
      help: "",
      helpUrl: "",
      tags: [],
      nodes: [],
    }
  }

  const rawNodes = Array.isArray((finding as { nodes?: unknown }).nodes)
    ? (finding as { nodes: unknown[] }).nodes
    : []

  return {
    id: typeof (finding as { id?: unknown }).id === "string"
      ? (finding as { id: string }).id
      : "unknown",
    impact: typeof (finding as { impact?: unknown }).impact === "string"
      ? (finding as { impact: string }).impact
      : (finding as { impact?: unknown }).impact === null
        ? null
        : null,
    description: typeof (finding as { description?: unknown }).description === "string"
      ? (finding as { description: string }).description
      : "",
    help: typeof (finding as { help?: unknown }).help === "string"
      ? (finding as { help: string }).help
      : "",
    helpUrl: typeof (finding as { helpUrl?: unknown }).helpUrl === "string"
      ? (finding as { helpUrl: string }).helpUrl
      : "",
    tags: Array.isArray((finding as { tags?: unknown }).tags)
      ? (finding as { tags: unknown[] }).tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    nodes: rawNodes.map(normalizeNode),
  }
}

async function auditPackagedPage(
  adtDir: string,
  entry: PackagedPageManifestEntry,
  axeSource: string,
  config: { runOnlyTags: string[]; disabledRules: string[] },
): Promise<AccessibilityPageResult> {
  const filePath = path.resolve(adtDir, entry.href)
  const resolvedAdtDir = path.resolve(adtDir)
  if (!filePath.startsWith(resolvedAdtDir + path.sep) && filePath !== resolvedAdtDir) {
    return {
      pageId: derivePageId(entry.section_id),
      sectionId: entry.section_id,
      href: entry.href,
      pageNumber: entry.page_number ?? null,
      title: null,
      error: "Packaged page path resolves outside the ADT directory",
      violationCount: 0,
      incompleteCount: 0,
      passCount: 0,
      inapplicableCount: 0,
      violations: [],
      incomplete: [],
    }
  }

  if (!fs.existsSync(filePath)) {
    return {
      pageId: derivePageId(entry.section_id),
      sectionId: entry.section_id,
      href: entry.href,
      pageNumber: entry.page_number ?? null,
      title: null,
      error: `Packaged page not found: ${entry.href}`,
      violationCount: 0,
      incompleteCount: 0,
      passCount: 0,
      inapplicableCount: 0,
      violations: [],
      incomplete: [],
    }
  }

  const html = fs.readFileSync(filePath, "utf-8")
  const dom = new JSDOM(html, {
    url: `file://${filePath}`,
    pretendToBeVisual: true,
    runScripts: "outside-only",
  })

  try {
    dom.window.eval(axeSource)
    const axe = (dom.window as typeof dom.window & {
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

    const result = await axe.run(dom.window.document, {
      runOnly: {
        type: "tag",
        values: config.runOnlyTags,
      },
      rules: Object.fromEntries(
        config.disabledRules.map((ruleId) => [ruleId, { enabled: false }])
      ),
    })

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
      pageId: derivePageId(entry.section_id),
      sectionId: entry.section_id,
      href: entry.href,
      pageNumber: entry.page_number ?? null,
      title: dom.window.document.title || null,
      violationCount: violations.length,
      incompleteCount: incomplete.length,
      passCount,
      inapplicableCount,
      violations,
      incomplete,
    }
  } catch (error) {
    return {
      pageId: derivePageId(entry.section_id),
      sectionId: entry.section_id,
      href: entry.href,
      pageNumber: entry.page_number ?? null,
      title: dom.window.document.title || null,
      error: error instanceof Error ? error.message : String(error),
      violationCount: 0,
      incompleteCount: 0,
      passCount: 0,
      inapplicableCount: 0,
      violations: [],
      incomplete: [],
    }
  } finally {
    dom.window.close()
  }
}

export async function runAccessibilityAssessment(
  options: RunAccessibilityAssessmentOptions,
  progress: Progress = nullProgress,
): Promise<AccessibilityAssessmentOutputType> {
  progress.emit({ type: "step-start", step: STEP })
  progress.emit({ type: "step-progress", step: STEP, message: "Loading packaged pages..." })

  const bookDir = path.resolve(options.bookDir)
  const runOnlyTags = options.config?.run_only_tags?.length
    ? [...options.config.run_only_tags]
    : [...DEFAULT_AXE_RUN_ONLY_TAGS]
  const disabledRules = options.config?.disabled_rules
    ? [...options.config.disabled_rules]
    : [...DEFAULT_DISABLED_AXE_RULES]
  const adtDir = path.join(bookDir, "adt")
  const pageEntries = getPackagedPageEntries(bookDir)
  const uniqueEntries = Array.from(
    new Map(pageEntries.map((entry) => [entry.href, entry])).values()
  )

  const axeSource = getAxeSource(await import("axe-core"))
  const pages: AccessibilityPageResult[] = []

  for (let index = 0; index < uniqueEntries.length; index++) {
    const entry = uniqueEntries[index]
    progress.emit({
      type: "step-progress",
      step: STEP,
      message: `${index + 1}/${uniqueEntries.length}`,
      page: index + 1,
      totalPages: uniqueEntries.length,
    })
    pages.push(await auditPackagedPage(adtDir, entry, axeSource, { runOnlyTags, disabledRules }))
  }

  const output: AccessibilityAssessmentOutputType = {
    generatedAt: new Date().toISOString(),
    tool: "axe-core",
    runOnlyTags,
    disabledRules,
    pages,
    summary: {
      pageCount: pages.length,
      pagesWithViolations: pages.filter((page) => page.violationCount > 0).length,
      pagesWithErrors: pages.filter((page) => Boolean(page.error)).length,
      violationCount: pages.reduce((sum, page) => sum + page.violationCount, 0),
      incompleteCount: pages.reduce((sum, page) => sum + page.incompleteCount, 0),
    },
  }

  progress.emit({ type: "step-complete", step: STEP })
  return AccessibilityAssessmentOutput.parse(output)
}
