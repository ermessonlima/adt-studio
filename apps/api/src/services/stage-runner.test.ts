import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { AppConfig, ProgressEvent } from "@adt/types"
import { createBookStorage } from "@adt/storage"
import {
  buildStageRunnerImageClassifyConfig,
  createStageRunner,
} from "./stage-runner.js"

const {
  capturedCaptionInputs,
  captionPageImagesMock,
  generateSpeechFileMock,
  renderPageMock,
  sectionPageMock,
} = vi.hoisted(() => {
  const capturedCaptionInputs: unknown[] = []
  return {
    capturedCaptionInputs,
    captionPageImagesMock: vi.fn(async (input: unknown) => {
      capturedCaptionInputs.push(input)
      return { captions: [] }
    }),
    generateSpeechFileMock: vi.fn(),
    renderPageMock: vi.fn(async () => ({ sections: [] })),
    sectionPageMock: vi.fn(async () => ({ reasoning: "", sections: [] })),
  }
})

vi.mock("@adt/pipeline", async () => {
  const actual = await vi.importActual<typeof import("@adt/pipeline")>(
    "@adt/pipeline"
  )
  return {
    ...actual,
    captionPageImages: captionPageImagesMock,
    generateSpeechFile: generateSpeechFileMock,
    renderPage: renderPageMock,
    sectionPage: sectionPageMock,
  }
})

function writeBaseConfig(configPath: string): void {
  fs.writeFileSync(
    configPath,
    `text_types:
  section_text: Main body text
text_group_types:
  paragraph: Paragraph
`
  )
}

function seedCaptionBook(
  booksDir: string,
  label: string,
  bookSummary?: string
): void {
  const storage = createBookStorage(label, booksDir)
  try {
    storage.putExtractedPage({
      pageId: "pg001",
      pageNumber: 1,
      text: "Page text",
      pageImage: {
        imageId: "pg001_page",
        buffer: Buffer.from("fake-page-image"),
        format: "png",
        hash: "hash-page",
        width: 800,
        height: 600,
      },
      images: [
        {
          imageId: "pg001_im001",
          buffer: Buffer.from("fake-image"),
          format: "png",
          hash: "hash-image",
          width: 400,
          height: 300,
        },
      ],
    })

    storage.putNodeData("web-rendering", "pg001", {
      sections: [
        {
          sectionIndex: 0,
          sectionType: "content",
          reasoning: "",
          html: '<section><img data-id="pg001_im001" src="x" /></section>',
        },
      ],
    })

    if (bookSummary) {
      storage.putNodeData("book-summary", "book", { summary: bookSummary })
    }
  } finally {
    storage.close()
  }
}

function seedStoryboardBook(booksDir: string, label: string): void {
  const storage = createBookStorage(label, booksDir)
  try {
    storage.putExtractedPage({
      pageId: "pg001",
      pageNumber: 1,
      text: "Page text",
      pageImage: {
        imageId: "pg001_page",
        buffer: Buffer.from("fake-page-image"),
        format: "png",
        hash: "hash-page",
        width: 800,
        height: 600,
      },
      images: [
        {
          imageId: "pg001_im001",
          buffer: Buffer.from("fake-image"),
          format: "png",
          hash: "hash-image",
          width: 400,
          height: 300,
        },
      ],
    })

    storage.putNodeData("page-sectioning", "pg001", {
      reasoning: "existing sectioning",
      sections: [
        {
          sectionId: "pg001_sec001",
          sectionType: "content",
          parts: [],
          backgroundColor: "#ffffff",
          textColor: "#000000",
          pageNumber: 1,
          isPruned: false,
        },
      ],
    })
  } finally {
    storage.close()
  }
}

function seedTextAndSpeechBook(booksDir: string, label: string): void {
  const storage = createBookStorage(label, booksDir)
  try {
    storage.putExtractedPage({
      pageId: "pg001",
      pageNumber: 1,
      text: "Page text",
      pageImage: {
        imageId: "pg001_page",
        buffer: Buffer.from("fake-page-image"),
        format: "png",
        hash: "hash-page",
        width: 800,
        height: 600,
      },
      images: [],
    })

    storage.putNodeData("web-rendering", "pg001", {
      sections: [
        {
          sectionIndex: 0,
          sectionType: "content",
          reasoning: "",
          html: '<p data-id="pg001_t001">Hello world</p>',
        },
      ],
    })
  } finally {
    storage.close()
  }
}

describe("buildStageRunnerImageClassifyConfig", () => {
  it("injects getImageBytes so min_stddev filtering can decode image bytes", () => {
    const config: AppConfig = {
      text_types: { section_text: "Main body text" },
      text_group_types: { paragraph: "Paragraph" },
      image_filters: {
        min_side: 100,
        min_stddev: 2,
        meaningfulness: true,
      },
    }
    const expectedBytes = Buffer.from("fake-image-bytes")
    const storage = {
      getImageBase64: (_imageId: string) => expectedBytes.toString("base64"),
    }

    const imageConfig = buildStageRunnerImageClassifyConfig(config, storage)

    expect(imageConfig.filters).toEqual({
      min_side: 100,
      min_stddev: 2,
      meaningfulness: true,
    })
    expect(imageConfig.getImageBytes).toBeTypeOf("function")
    expect(imageConfig.getImageBytes?.("pg001_im001")).toEqual(expectedBytes)
  })
})

describe("createStageRunner captions step", () => {
  let tmpDir = ""

  beforeEach(() => {
    capturedCaptionInputs.length = 0
    captionPageImagesMock.mockClear()
    generateSpeechFileMock.mockReset()
    generateSpeechFileMock.mockResolvedValue(undefined)
    renderPageMock.mockClear()
    sectionPageMock.mockClear()
  })

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      tmpDir = ""
    }
  })

  it("passes book summary to captionPageImages when summary exists", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-captions-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    writeBaseConfig(configPath)

    seedCaptionBook(
      booksDir,
      "with-summary",
      "A grade 3 science textbook about the water cycle."
    )

    const runner = createStageRunner()
    await runner.run(
      "with-summary",
      {
        booksDir,
        apiKey: "sk-test",
        promptsDir,
        configPath,
        fromStage: "captions",
        toStage: "captions",
      },
      { emit: () => {} }
    )

    expect(captionPageImagesMock).toHaveBeenCalledTimes(1)
    const firstInput = capturedCaptionInputs[0] as { bookSummary?: string }
    expect(firstInput.bookSummary).toBe(
      "A grade 3 science textbook about the water cycle."
    )
  })

  it("omits book summary when summary node is missing", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-captions-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    writeBaseConfig(configPath)

    seedCaptionBook(booksDir, "without-summary")

    const runner = createStageRunner()
    await runner.run(
      "without-summary",
      {
        booksDir,
        apiKey: "sk-test",
        promptsDir,
        configPath,
        fromStage: "captions",
        toStage: "captions",
      },
      { emit: () => {} }
    )

    expect(captionPageImagesMock).toHaveBeenCalledTimes(1)
    const firstInput = capturedCaptionInputs[0] as { bookSummary?: string }
    expect(firstInput.bookSummary).toBeUndefined()
  })
})

describe("createStageRunner storyboard render-only", () => {
  let tmpDir = ""

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      tmpDir = ""
    }
  })

  it("skips page sectioning and re-renders from existing section data", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-storyboard-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    writeBaseConfig(configPath)
    seedStoryboardBook(booksDir, "render-only")

    const events: ProgressEvent[] = []
    const runner = createStageRunner()
    await runner.run(
      "render-only",
      {
        booksDir,
        apiKey: "sk-test",
        promptsDir,
        configPath,
        fromStage: "storyboard",
        toStage: "storyboard",
        renderOnly: true,
      },
      { emit: (event) => events.push(event) }
    )

    expect(sectionPageMock).not.toHaveBeenCalled()
    expect(renderPageMock).toHaveBeenCalledTimes(1)
    expect(
      events.some(
        (event) => event.type === "step-skip" && event.step === "page-sectioning"
      )
    ).toBe(true)
    expect(
      events.some(
        (event) =>
          event.type === "step-complete" && event.step === "web-rendering"
      )
    ).toBe(true)
    expect(
      events.some(
        (event) =>
          event.type === "step-complete" && event.step === "page-sectioning"
      )
    ).toBe(false)
  })
})

describe("createStageRunner text-and-speech Gemini partial failures", () => {
  let tmpDir = ""

  beforeEach(() => {
    generateSpeechFileMock.mockReset()
    generateSpeechFileMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      tmpDir = ""
    }
  })

  it("keeps Gemini TTS in error state when some audio items fail", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-runner-tts-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    fs.writeFileSync(
      configPath,
      `text_types:
  section_text: Main body text
text_group_types:
  paragraph: Paragraph
speech:
  default_provider: gemini
  providers:
    gemini:
      languages:
        - en
`
    )
    seedTextAndSpeechBook(booksDir, "gemini-tts-failure")

    generateSpeechFileMock.mockRejectedValueOnce(
      new Error("Gemini TTS request failed (429): Quota exceeded")
    )

    const events: ProgressEvent[] = []
    const runner = createStageRunner()
    await runner.run(
      "gemini-tts-failure",
      {
        booksDir,
        apiKey: "sk-test",
        geminiApiKey: "gm-test",
        promptsDir,
        configPath,
        fromStage: "text-and-speech",
        toStage: "text-and-speech",
      },
      { emit: (event) => events.push(event) }
    )

    expect(
      events.some(
        (event) =>
          event.type === "step-error" &&
          event.step === "tts" &&
          event.error.includes("Missing Gemini audio can be generated one by one")
      )
    ).toBe(true)
    expect(
      events.some(
        (event) => event.type === "step-complete" && event.step === "tts"
      )
    ).toBe(false)

    const storage = createBookStorage("gemini-tts-failure", booksDir)
    try {
      const ttsStep = storage.getStepRuns().find((step) => step.step === "tts")
      expect(ttsStep?.status).toBe("error")
      expect(ttsStep?.error).toContain("Missing Gemini audio can be generated one by one")
    } finally {
      storage.close()
    }
  })
})
