import { describe, expect, it } from "vitest"
import type { AccessibilityAssessmentOutput } from "@adt/types"
import { buildBrowserAccessibilityRecheckPlan } from "../browser-accessibility-assessment.js"

const baseAssessment: AccessibilityAssessmentOutput = {
  generatedAt: "2026-03-31T00:00:00.000Z",
  tool: "axe-core",
  runOnlyTags: ["wcag2a"],
  disabledRules: ["color-contrast"],
  pages: [
    {
      pageId: "pg001",
      sectionId: "pg001_sec001",
      href: "page-1.html",
      pageNumber: 1,
      title: "Page 1",
      violationCount: 0,
      incompleteCount: 2,
      passCount: 0,
      inapplicableCount: 0,
      violations: [],
      incomplete: [
        {
          id: "landmark-unique",
          impact: "moderate",
          description: "desc",
          help: "help",
          helpUrl: "https://example.com",
          tags: ["cat.semantics"],
          nodes: [],
        },
        {
          id: "focus-order-semantics",
          impact: "serious",
          description: "desc",
          help: "help",
          helpUrl: "https://example.com",
          tags: ["cat.keyboard"],
          nodes: [],
        },
      ],
    },
    {
      pageId: "pg002",
      sectionId: "pg002_sec001",
      href: "page-2.html",
      pageNumber: 2,
      title: "Page 2",
      violationCount: 0,
      incompleteCount: 0,
      passCount: 0,
      inapplicableCount: 0,
      violations: [],
      incomplete: [],
    },
  ],
  summary: {
    pageCount: 2,
    pagesWithViolations: 0,
    pagesWithErrors: 0,
    violationCount: 0,
    incompleteCount: 2,
  },
}

describe("buildBrowserAccessibilityRecheckPlan", () => {
  it("rechecks incomplete rules and color contrast across packaged pages", () => {
    const plan = buildBrowserAccessibilityRecheckPlan(
      [
        { section_id: "pg001_sec001", href: "page-1.html", page_number: 1 },
        { section_id: "pg002_sec001", href: "page-2.html", page_number: 2 },
      ],
      baseAssessment,
    )

    expect(plan).toEqual([
      {
        pageId: "pg001",
        sectionId: "pg001_sec001",
        href: "page-1.html",
        pageNumber: 1,
        ruleIds: ["landmark-unique", "focus-order-semantics", "color-contrast"],
      },
      {
        pageId: "pg002",
        sectionId: "pg002_sec001",
        href: "page-2.html",
        pageNumber: 2,
        ruleIds: ["color-contrast"],
      },
    ])
  })

  it("can limit rechecks to incomplete pages and rules only", () => {
    const plan = buildBrowserAccessibilityRecheckPlan(
      [
        { section_id: "pg001_sec001", href: "page-1.html", page_number: 1 },
        { section_id: "pg002_sec001", href: "page-2.html", page_number: 2 },
      ],
      baseAssessment,
      { fullPageRuleIds: [] },
    )

    expect(plan).toEqual([
      {
        pageId: "pg001",
        sectionId: "pg001_sec001",
        href: "page-1.html",
        pageNumber: 1,
        ruleIds: ["landmark-unique", "focus-order-semantics"],
      },
    ])
  })
})
