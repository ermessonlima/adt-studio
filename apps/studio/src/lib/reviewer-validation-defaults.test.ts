import { describe, expect, it, vi } from "vitest"

vi.mock("@lingui/core/macro", () => ({
  msg(strings: TemplateStringsArray, ...values: unknown[]) {
    let text = ""
    for (let index = 0; index < strings.length; index += 1) {
      text += strings[index]
      if (index < values.length) {
        text += String(values[index])
      }
    }
    return { id: text }
  },
}))

const { createReviewerValidationDefaultReason, getReviewerValidationDefaultReasonMessage } = await import("./reviewer-validation-defaults")

describe("reviewer-validation-defaults", () => {
  it("returns structured reasons for non-language-specific defaults", () => {
    expect(createReviewerValidationDefaultReason("page-has-no-images")).toEqual({ kind: "page-has-no-images", language: null })
    expect(createReviewerValidationDefaultReason("sign-language-unavailable")).toEqual({ kind: "sign-language-unavailable", language: null })
  })

  it("returns message descriptors for default reasons", () => {
    expect(getReviewerValidationDefaultReasonMessage(createReviewerValidationDefaultReason("page-has-no-images"))).toEqual({
      id: "Defaulted to N/A because this page does not contain any images.",
    })
    expect(getReviewerValidationDefaultReasonMessage(createReviewerValidationDefaultReason("glossary-unavailable"))).toEqual({
      id: "Defaulted to N/A because Glossary has not been generated for this book yet.",
    })
  })

  it("supports language-aware default reasons", () => {
    expect(
      getReviewerValidationDefaultReasonMessage(
        createReviewerValidationDefaultReason("text-and-speech-language-unavailable", { language: "sw" }),
      ),
    ).toEqual({ id: "Defaulted to N/A because no Text & Speech audio is available for sw." })
    expect(
      getReviewerValidationDefaultReasonMessage(
        createReviewerValidationDefaultReason("translation-language-unavailable", { language: "fr" }),
      ),
    ).toEqual({ id: "Defaulted to N/A because no translation output is available for fr." })
  })
})
