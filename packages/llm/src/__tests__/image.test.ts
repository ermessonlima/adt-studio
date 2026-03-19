import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const {
  experimentalGenerateImage,
  openaiImage,
  createOpenAI,
} = vi.hoisted(() => {
  const experimentalGenerateImage = vi.fn()
  const openaiImage = vi.fn((modelId: string) => ({ modelId }))
  const createOpenAI = vi.fn(() => ({ image: openaiImage }))
  return {
    experimentalGenerateImage,
    openaiImage,
    createOpenAI,
  }
})

vi.mock("ai", () => ({
  experimental_generateImage: experimentalGenerateImage,
}))

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI,
}))

import { generateImageWithCache } from "../image.js"

describe("generateImageWithCache", () => {
  let cacheDir: string
  const fetchMock = vi.fn()

  beforeEach(() => {
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-image-cache-"))
    experimentalGenerateImage.mockReset()
    openaiImage.mockClear()
    createOpenAI.mockClear()
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    fs.rmSync(cacheDir, { recursive: true, force: true })
    vi.unstubAllGlobals()
  })

  it("caches generation results for identical prompts", async () => {
    experimentalGenerateImage.mockResolvedValue({
      image: {
        base64: Buffer.from("generated").toString("base64"),
        mimeType: "image/png",
      },
    })

    const first = await generateImageWithCache({
      apiKey: "sk-test",
      modelId: "openai:gpt-image-1.5",
      prompt: "a bright diagram",
      size: "1024x1024",
      cacheDir,
    })

    const second = await generateImageWithCache({
      apiKey: "sk-test",
      modelId: "openai:gpt-image-1.5",
      prompt: "a bright diagram",
      size: "1024x1024",
      cacheDir,
    })

    expect(first.cached).toBe(false)
    expect(second.cached).toBe(true)
    expect(second.base64).toBe(first.base64)
    expect(experimentalGenerateImage).toHaveBeenCalledTimes(1)
    expect(openaiImage).toHaveBeenCalledWith("gpt-image-1.5")
  })

  it("uses the image edits endpoint when reference images are provided", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ b64_json: Buffer.from("edited").toString("base64") }],
        }),
        { status: 200 }
      )
    )

    const result = await generateImageWithCache({
      apiKey: "sk-test",
      modelId: "openai:gpt-image-1.5",
      prompt: "make it cleaner",
      size: "1024x1024",
      referenceImages: [
        {
          data: Buffer.from("reference-image"),
          name: "reference.png",
        },
      ],
    })

    expect(result.mimeType).toBe("image/png")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/images/edits")
    expect(experimentalGenerateImage).not.toHaveBeenCalled()
  })
})
