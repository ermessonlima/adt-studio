import { z } from "zod"
import {
  ReviewerValidationCatalogSnapshot,
  ReviewerValidationIdentificationField,
  ReviewerValidationInstruction,
  ReviewerValidationSection,
} from "./reviewer-validation.js"

export const ReviewerValidationConfig = z.object({
  enabled: z.boolean().optional(),
  identification_fields: z.array(ReviewerValidationIdentificationField).optional(),
  instructions: z.array(ReviewerValidationInstruction).optional(),
  sections: z.array(ReviewerValidationSection).optional(),
})
export type ReviewerValidationConfig = z.infer<typeof ReviewerValidationConfig>
export type ReviewerValidationCatalog = z.infer<typeof ReviewerValidationCatalogSnapshot>
