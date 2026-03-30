import type { ReviewerPageValidationRecordEntry } from "@/api/client"

export type ReviewerResumeTarget = {
  pageId: string
  pageNumber: number | null
  href: string
}

export function findResumeReviewerPage(
  records: ReviewerPageValidationRecordEntry[],
  expectedCriteriaCount?: number,
): ReviewerResumeTarget | null {
  const partial = records
    .filter((entry) => {
      const statuses = entry.record.results.map((result) => result.status)
      const reviewedCount = entry.record.reviewed_count ?? statuses.filter((status) => status !== "not-reviewed").length
      const totalCriteria = entry.record.criteria_count ?? Math.max(expectedCriteriaCount ?? 0, statuses.length)

      return reviewedCount > 0 && reviewedCount < totalCriteria
    })
    .sort((left, right) => {
      const leftNumber = left.record.page_number ?? -1
      const rightNumber = right.record.page_number ?? -1
      if (leftNumber !== rightNumber) {
        return rightNumber - leftNumber
      }
      return right.record.page_id.localeCompare(left.record.page_id)
    })

  const target = partial[0]
  if (!target) {
    return null
  }

  return {
    pageId: target.record.page_id,
    pageNumber: target.record.page_number ?? null,
    href: target.record.href,
  }
}
