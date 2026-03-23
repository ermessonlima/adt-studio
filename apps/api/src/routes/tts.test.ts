import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createBookStorage } from "@adt/storage"
import { createTTSRoutes } from "./tts.js"

let tmpDir = ""
let configPath = ""

function writeConfig(defaultProvider = "gemini"): void {
  fs.writeFileSync(
    configPath,
    `text_types:
  section_text: Main body text
text_group_types:
  paragraph: Paragraph
speech:
  default_provider: ${defaultProvider}
  providers:
    ${defaultProvider}:
      languages:
        - en
`
  )
}

function seedBook(label: string): void {
  const storage = createBookStorage(label, tmpDir)
  try {
    storage.putNodeData("metadata", "book", {
      title: "Test Book",
      authors: ["Author"],
      publisher: null,
      language_code: "en",
      cover_page_number: 1,
      reasoning: "test",
    })
    storage.putNodeData("text-catalog", "book", {
      entries: [{ id: "pg001_t001", text: "Hello world" }],
      generatedAt: new Date().toISOString(),
    })
  } finally {
    storage.close()
  }
}

describe("POST /books/:label/tts/generate-one", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-tts-route-"))
    configPath = path.join(tmpDir, "config.yaml")
    writeConfig()
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    tmpDir = ""
    configPath = ""
  })

  it("generates a missing Gemini audio file and stores a new TTS version", async () => {
    const label = "gemini-audio"
    seedBook(label)

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      data: Buffer.from(new Uint8Array([1, 2, 3, 4])).toString(
                        "base64"
                      ),
                    },
                  },
                ],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    )

    const app = createTTSRoutes(tmpDir, configPath)
    const res = await app.request(`/books/${label}/tts/generate-one`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gemini-API-Key": "gm-test",
      },
      body: JSON.stringify({ textId: "pg001_t001", language: "en" }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.entry.textId).toBe("pg001_t001")
    expect(body.entry.fileName).toBe("pg001_t001.wav")
    expect(body.completed).toBe(true)
    expect(body.remainingItems).toBe(0)

    const storage = createBookStorage(label, tmpDir)
    try {
      const ttsRow = storage.getLatestNodeData("tts", "en")
      expect(ttsRow?.version).toBe(1)
      expect((ttsRow?.data as { entries: Array<{ textId: string }> }).entries).toHaveLength(1)
      expect(storage.getStepRuns().find((step) => step.step === "tts")?.status).toBe(
        "done"
      )
    } finally {
      storage.close()
    }

    expect(
      fs.existsSync(path.join(tmpDir, label, "audio", "en", "pg001_t001.wav"))
    ).toBe(true)
  })

  it("rejects single-item generation when the language is not routed to Gemini", async () => {
    writeConfig("openai")
    const label = "openai-audio"
    seedBook(label)

    const app = createTTSRoutes(tmpDir, configPath)
    const res = await app.request(`/books/${label}/tts/generate-one`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gemini-API-Key": "gm-test",
      },
      body: JSON.stringify({ textId: "pg001_t001", language: "en" }),
    })

    expect(res.status).toBe(400)
    await expect(res.text()).resolves.toContain(
      "Single-item audio generation is only available when Gemini is selected for that language."
    )
  })
})
