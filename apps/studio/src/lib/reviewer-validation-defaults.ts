import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import type { I18n } from "@lingui/core"

export type ReviewerValidationDefaultReasonKind =
  | "page-has-no-images"
  | "page-has-no-activity"
  | "easy-read-unavailable"
  | "sign-language-unavailable"
  | "glossary-unavailable"
  | "text-and-speech-unavailable"
  | "text-and-speech-language-unavailable"
  | "translation-unavailable"
  | "translation-language-required"
  | "translation-language-unavailable"

export interface ReviewerValidationDefaultReason {
  kind: ReviewerValidationDefaultReasonKind
  language?: string | null
}

export function createReviewerValidationDefaultReason(
  kind: ReviewerValidationDefaultReasonKind,
  options?: { language?: string | null },
): ReviewerValidationDefaultReason {
  return {
    kind,
    language: options?.language ?? null,
  }
}

export function getReviewerValidationDefaultReasonMessage(
  reason: ReviewerValidationDefaultReason,
): MessageDescriptor {
  switch (reason.kind) {
    case "page-has-no-images":
      return msg`Defaulted to N/A because this page does not contain any images.`
    case "page-has-no-activity":
      return msg`Defaulted to N/A because this page does not contain an interactive activity or exercise.`
    case "easy-read-unavailable":
      return msg`Defaulted to N/A because Easy Read output is not currently available for this book.`
    case "sign-language-unavailable":
      return msg`Defaulted to N/A because sign language is not enabled for this book.`
    case "glossary-unavailable":
      return msg`Defaulted to N/A because Glossary has not been generated for this book yet.`
    case "text-and-speech-unavailable":
      return msg`Defaulted to N/A because Text & Speech audio has not been generated yet.`
    case "text-and-speech-language-unavailable":
      return reason.language
        ? msg`Defaulted to N/A because no Text & Speech audio is available for ${reason.language}.`
        : msg`Defaulted to N/A because no Text & Speech audio is available yet.`
    case "translation-unavailable":
      return msg`Defaulted to N/A because Translation has not been generated yet.`
    case "translation-language-required":
      return msg`Defaulted to N/A until this reviewer session has a language selected.`
    case "translation-language-unavailable":
      return reason.language
        ? msg`Defaulted to N/A because no translation output is available for ${reason.language}.`
        : msg`Defaulted to N/A because no translation output is available yet.`
  }
}

export function formatReviewerValidationDefaultReason(i18n: I18n, reason: ReviewerValidationDefaultReason): string {
  return i18n._(getReviewerValidationDefaultReasonMessage(reason))
}
