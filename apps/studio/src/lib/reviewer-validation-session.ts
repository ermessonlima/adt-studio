export const REVIEWER_SESSION_STORAGE_PREFIX = "adt-preview-review-session"

export function getReviewerSessionStorageKey(label: string) {
  return `${REVIEWER_SESSION_STORAGE_PREFIX}:${label}`
}
