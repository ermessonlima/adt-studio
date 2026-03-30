// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"

const navigateMock = vi.fn()
const invalidateQueriesMock = vi.fn(() => Promise.resolve())
const packageAdtMock = vi.fn(() => Promise.resolve())
const useSearchMock = vi.fn(() => ({ tab: "accessibility-summary" }))
const reviewerCatalogMock = vi.fn(() => ({ data: { enabled: false }, isLoading: false, error: null }))

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query")
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
  }
})

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  useSearch: () => useSearchMock(),
}))

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t(strings: TemplateStringsArray, ...values: unknown[]) {
      let text = ""
      for (let index = 0; index < strings.length; index += 1) {
        text += strings[index]
        if (index < values.length) text += String(values[index])
      }
      return text
    },
  }),
}))

vi.mock("@/api/client", () => ({
  api: {
    packageAdt: (...args: unknown[]) => packageAdtMock(...args),
  },
}))

vi.mock("@/hooks/use-book-run", () => ({
  useBookRun: () => ({ stageState: (slug: string) => (slug === "storyboard" ? "done" : "idle") }),
}))

vi.mock("@/hooks/use-reviewer-validation", () => ({
  useReviewerValidationCatalog: (...args: unknown[]) => reviewerCatalogMock(...args),
}))

vi.mock("@/components/validation/AccessibilityValidationTabs", () => ({
  AccessibilityOverviewTab: ({ label }: { label: string }) => <div>accessibility-summary:{label}</div>,
}))

vi.mock("@/components/validation/ReviewerValidationSummaryTab", () => ({
  ReviewerValidationSummaryTab: ({ label }: { label: string }) => <div>reviewer-validation:{label}</div>,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("ValidationView", () => {
  it("hides the Reviewer Validation tab when reviewer validation is disabled", async () => {
    const { ValidationView } = await import("./ValidationView")
    render(<ValidationView bookLabel="demo-book" />)

    await waitFor(() => expect(packageAdtMock).toHaveBeenCalledWith("demo-book"))

    expect(screen.getByText("Accessibility Summary")).toBeTruthy()
    expect(screen.queryByText("Reviewer Validation")).toBeNull()
  })

  it("shows the Reviewer Validation tab when reviewer validation is enabled", async () => {
    reviewerCatalogMock.mockReturnValue({ data: { enabled: true }, isLoading: false, error: null })
    useSearchMock.mockReturnValue({ tab: "reviewer-validation" })

    const { ValidationView } = await import("./ValidationView")
    render(<ValidationView bookLabel="demo-book" />)

    await waitFor(() => expect(packageAdtMock).toHaveBeenCalledWith("demo-book"))

    expect(screen.getByText("Reviewer Validation")).toBeTruthy()
  })
})
