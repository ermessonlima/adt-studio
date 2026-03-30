import { describe, expect, it } from "vitest"
import {
  hasLanguageEntries,
  resolveReviewerValidationCriterionStatus,
} from "./reviewer-validation-applicability"

describe("hasLanguageEntries", () => {
  it("matches language keys case-insensitively", () => {
    expect(
      hasLanguageEntries(
        {
          EN: { entries: [{ id: 1 }] },
          sw: { entries: [] },
        },
        "en",
      ),
    ).toBe(true)
  })
})

describe("resolveReviewerValidationCriterionStatus", () => {
  it("returns explicit reviewer statuses unchanged", () => {
    expect(
      resolveReviewerValidationCriterionStatus({
        sectionId: "glossary",
        explicitStatus: "pass",
        glossaryAvailable: false,
        glossaryPending: false,
        textAndSpeechStageDone: false,
        ttsAvailable: false,
        ttsPending: false,
        sessionLanguage: null,
        translationAvailable: false,
        translationPending: false,
        easyReadAvailable: false,
        signLanguageEnabled: false,
        pageHasImages: false,
        pageHasActivity: false,
      }),
    ).toEqual({ status: "pass", isDerived: false, reason: null })
  })

  it("defaults image review to N/A when a page has no images", () => {
    expect(
      resolveReviewerValidationCriterionStatus({
        sectionId: "visual-media-image-description",
        glossaryAvailable: true,
        glossaryPending: false,
        textAndSpeechStageDone: true,
        ttsAvailable: true,
        ttsPending: false,
        sessionLanguage: "en",
        translationAvailable: true,
        translationPending: false,
        easyReadAvailable: true,
        signLanguageEnabled: true,
        pageHasImages: false,
        pageHasActivity: false,
      }),
    ).toEqual({
      status: "not-applicable",
      isDerived: true,
      reason: { kind: "page-has-no-images", language: null },
    })
  })

  it("defaults interactivity review to N/A when a page has no activities", () => {
    expect(
      resolveReviewerValidationCriterionStatus({
        sectionId: "interactivity",
        glossaryAvailable: true,
        glossaryPending: false,
        textAndSpeechStageDone: true,
        ttsAvailable: true,
        ttsPending: false,
        sessionLanguage: "en",
        translationAvailable: true,
        translationPending: false,
        easyReadAvailable: true,
        signLanguageEnabled: true,
        pageHasImages: true,
        pageHasActivity: false,
      }),
    ).toEqual({
      status: "not-applicable",
      isDerived: true,
      reason: { kind: "page-has-no-activity", language: null },
    })
  })

  it("defaults sign-language review to N/A when sign language is not enabled", () => {
    expect(
      resolveReviewerValidationCriterionStatus({
        sectionId: "sign-language",
        glossaryAvailable: true,
        glossaryPending: false,
        textAndSpeechStageDone: true,
        ttsAvailable: true,
        ttsPending: false,
        sessionLanguage: "en",
        translationAvailable: true,
        translationPending: false,
        easyReadAvailable: true,
        signLanguageEnabled: false,
        pageHasImages: true,
        pageHasActivity: true,
      }),
    ).toEqual({
      status: "not-applicable",
      isDerived: true,
      reason: { kind: "sign-language-unavailable", language: null },
    })
  })

  it("defaults translation review to N/A when the reviewer session has no language", () => {
    expect(
      resolveReviewerValidationCriterionStatus({
        sectionId: "translation",
        glossaryAvailable: true,
        glossaryPending: false,
        textAndSpeechStageDone: true,
        ttsAvailable: true,
        ttsPending: false,
        sessionLanguage: null,
        translationAvailable: false,
        translationPending: false,
        easyReadAvailable: true,
        signLanguageEnabled: true,
        pageHasImages: true,
        pageHasActivity: true,
      }),
    ).toEqual({
      status: "not-applicable",
      isDerived: true,
      reason: { kind: "translation-language-required", language: null },
    })
  })
})
