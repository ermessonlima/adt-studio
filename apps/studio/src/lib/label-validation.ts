const LABEL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/

export function isLabelFormatValid(label: string): boolean {
  return !!label && LABEL_PATTERN.test(label)
}

export function isLabelDuplicate(
  label: string,
  existingLabels: string[] | undefined
): boolean {
  if (!existingLabels) return false
  return existingLabels.includes(label)
}

export function deduplicateLabel(
  label: string,
  existingLabels: string[] | undefined
): string {
  if (!existingLabels || !existingLabels.includes(label)) return label
  let suffix = 2
  while (existingLabels.includes(`${label}-${suffix}`)) {
    suffix++
  }
  return `${label}-${suffix}`
}
