import { describe, expect, it } from "vitest"
import type { ReviewerPageValidationRecordEntry } from "@/api/client"
import { findResumeReviewerPage } from "./reviewer-validation-progress"

function makeEntry(
  pageId: string,
  pageNumber: number,
  statuses: Array<"pass" | "needs-changes" | "not-applicable" | "not-reviewed">,
  counts?: { reviewed?: number; total?: number },
): ReviewerPageValidationRecordEntry {
  return {
    version: 1,
    record: {
      session_id: "session-1",
      page_id: pageId,
      page_number: pageNumber,
      href: `content/${pageId}.html`,
      results: statuses.map((status, index) => ({
        criterion_id: `criterion-${index + 1}`,
        status,
      })),
      reviewed_count: counts?.reviewed,
      criteria_count: counts?.total,
    },
  }
}

describe("findResumeReviewerPage", () => {
  it("returns the latest partially reviewed page", () => {
    const records = [
      makeEntry("pg001", 1, ["pass", "pass"]),
      makeEntry("pg005", 5, ["pass", "not-reviewed", "not-reviewed"]),
      makeEntry("pg004", 4, ["pass", "pass", "pass"], { reviewed: 39, total: 39 }),
    ]

    expect(findResumeReviewerPage(records)).toEqual({
      pageId: "pg005",
      pageNumber: 5,
      href: "content/pg005.html",
    })
  })

  it("prefers saved completion snapshots when present", () => {
    const records = [
      makeEntry("pg005", 5, ["pass", "needs-changes"], { reviewed: 39, total: 39 }),
      makeEntry("pg004", 4, ["pass", "pass", "pass"], { reviewed: 39, total: 39 }),
    ]

    expect(findResumeReviewerPage(records, 4)).toBeNull()
  })

  it("treats omitted untouched criteria as incomplete when total criteria are known", () => {
    const records = [
      makeEntry("pg005", 5, ["pass", "needs-changes"]),
      makeEntry("pg004", 4, ["pass", "pass", "pass"]),
    ]

    expect(findResumeReviewerPage(records, 4)).toEqual({
      pageId: "pg005",
      pageNumber: 5,
      href: "content/pg005.html",
    })
  })

  it("returns null when there is no partially reviewed page", () => {
    const records = [
      makeEntry("pg001", 1, ["pass", "pass"]),
      makeEntry("pg002", 2, ["not-reviewed", "not-reviewed"]),
    ]

    expect(findResumeReviewerPage(records)).toBeNull()
  })
})
