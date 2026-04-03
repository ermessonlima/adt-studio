import { describe, expect, it } from "vitest"
import {
  isLabelFormatValid,
  isLabelDuplicate,
  deduplicateLabel,
} from "./label-validation"

describe("isLabelFormatValid", () => {
  it("accepts valid labels", () => {
    expect(isLabelFormatValid("my-book")).toBe(true)
    expect(isLabelFormatValid("book.v2")).toBe(true)
    expect(isLabelFormatValid("Grade5_Math")).toBe(true)
    expect(isLabelFormatValid("a")).toBe(true)
    expect(isLabelFormatValid("1st-edition")).toBe(true)
  })

  it("rejects empty string", () => {
    expect(isLabelFormatValid("")).toBe(false)
  })

  it("rejects labels starting with non-alphanumeric", () => {
    expect(isLabelFormatValid("-starts-with-dash")).toBe(false)
    expect(isLabelFormatValid(".starts-with-dot")).toBe(false)
    expect(isLabelFormatValid("_starts-with-underscore")).toBe(false)
  })

  it("rejects labels with spaces or special characters", () => {
    expect(isLabelFormatValid("has space")).toBe(false)
    expect(isLabelFormatValid("has@symbol")).toBe(false)
    expect(isLabelFormatValid("path/sep")).toBe(false)
  })
})

describe("isLabelDuplicate", () => {
  const existing = ["math-grade5", "science-101", "history.v2"]

  it("returns true for exact match", () => {
    expect(isLabelDuplicate("math-grade5", existing)).toBe(true)
  })

  it("returns false for non-matching label", () => {
    expect(isLabelDuplicate("new-book", existing)).toBe(false)
  })

  it("is case-sensitive", () => {
    expect(isLabelDuplicate("Math-Grade5", existing)).toBe(false)
  })

  it("returns false when existing labels is undefined", () => {
    expect(isLabelDuplicate("anything", undefined)).toBe(false)
  })

  it("returns false for empty existing list", () => {
    expect(isLabelDuplicate("anything", [])).toBe(false)
  })
})

describe("deduplicateLabel", () => {
  it("returns original label when no duplicates", () => {
    expect(deduplicateLabel("my-book", ["other-book"])).toBe("my-book")
  })

  it("returns original label when existing is undefined", () => {
    expect(deduplicateLabel("my-book", undefined)).toBe("my-book")
  })

  it("appends -2 for first duplicate", () => {
    expect(deduplicateLabel("my-book", ["my-book"])).toBe("my-book-2")
  })

  it("increments suffix when earlier suffixes are taken", () => {
    expect(
      deduplicateLabel("my-book", ["my-book", "my-book-2", "my-book-3"])
    ).toBe("my-book-4")
  })

  it("finds first available gap", () => {
    expect(deduplicateLabel("my-book", ["my-book", "my-book-2"])).toBe(
      "my-book-3"
    )
  })
})
