import { describe, expect, it } from "vitest"
import {
  getStageClearNodes,
  getCacheResourcesForNode,
  getCacheResourcesForStageOutput,
  getCacheResourcesForStageClear,
} from "../pipeline-effects.js"

describe("pipeline effects", () => {
  it("includes transitive downstream nodes in clear set", () => {
    expect(getStageClearNodes("quizzes")).toEqual([
      "quiz-generation",
      "text-catalog",
      "catalog-translation",
      "text-catalog-translation",
      "tts",
      "package-web",
      "accessibility-assessment",
    ])
  })

  it("derives stage-clear cache resources from cleared nodes", () => {
    expect(getCacheResourcesForStageClear("quizzes")).toEqual([
      "quizzes",
      "text-catalog",
      "tts",
      "step-status",
      "debug",
    ])
  })

  it("derives stage-output cache resources from produced nodes", () => {
    expect(getCacheResourcesForStageOutput("translate")).toEqual([
      "text-catalog",
      "step-status",
    ])
    expect(getCacheResourcesForStageOutput("speech")).toEqual([
      "tts",
      "step-status",
    ])
  })

  it("maps metadata node to book/list resources", () => {
    expect(getCacheResourcesForNode("metadata")).toEqual(["books", "book"])
  })
})
