import { AccessibilityConfigTab } from "@/components/validation/AccessibilityValidationTabs"
import { ReviewerChecklistSettingsTab } from "@/components/validation/ReviewerChecklistSettingsTab"

export function ValidationSettings({
  bookLabel,
  tab,
}: {
  bookLabel: string
  headerTarget?: HTMLDivElement | null
  tab?: string
}) {
  if (tab === "reviewer-checklist") {
    return <ReviewerChecklistSettingsTab label={bookLabel} />
  }

  return <AccessibilityConfigTab label={bookLabel} />
}
