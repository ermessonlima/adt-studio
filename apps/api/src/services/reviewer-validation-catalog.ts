import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import yaml from "js-yaml"
import {
  ReviewerValidationCatalogSnapshot,
  ReviewerValidationConfig,
  type ReviewerValidationConfig as ReviewerValidationConfigType,
} from "@adt/types"

const DEFAULT_REVIEWER_VALIDATION_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../config/reviewer_validation.yaml",
)

function loadDefaultReviewerValidationConfig(
  defaultsPath = DEFAULT_REVIEWER_VALIDATION_PATH,
): ReviewerValidationConfigType {
  const content = fs.readFileSync(defaultsPath, "utf-8")
  const parsed = yaml.load(content)
  return ReviewerValidationConfig.parse(parsed ?? {})
}

export function isReviewerValidationEnabled(config?: ReviewerValidationConfigType | null): boolean {
  const overrides = ReviewerValidationConfig.parse(config ?? {})
  return overrides.enabled ?? false
}

export function getReviewerValidationCatalog(
  config?: ReviewerValidationConfigType | null,
  defaultsPath?: string,
) {
  const defaults = loadDefaultReviewerValidationConfig(defaultsPath)
  const overrides = ReviewerValidationConfig.parse(config ?? {})

  return ReviewerValidationCatalogSnapshot.parse({
    identificationFields: overrides.identification_fields ?? defaults.identification_fields ?? [],
    instructions: overrides.instructions ?? defaults.instructions ?? [],
    pageSections: overrides.sections ?? defaults.sections ?? [],
  })
}
