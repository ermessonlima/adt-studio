import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createGeminiTTSSynthesizer } from "../speech.js"

describe("createGeminiTTSSynthesizer", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("calls Gemini generateContent and wraps PCM output as wav", async () => {
    const pcmBytes = new Uint8Array([1, 2, 3, 4])
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      data: Buffer.from(pcmBytes).toString("base64"),
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

    const synth = createGeminiTTSSynthesizer({ apiKey: "gm-test" })
    const result = await synth.synthesize({
      model: "gemini-2.5-pro-preview-tts",
      voice: "Kore",
      input: "Hello world",
      responseFormat: "wav",
    })

    expect(Buffer.from(result.subarray(0, 4)).toString("ascii")).toBe("RIFF")
    expect(result.byteLength).toBe(44 + pcmBytes.byteLength)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-tts:generateContent"
    )
    expect(init?.headers).toMatchObject({
      "Content-Type": "application/json",
      "x-goog-api-key": "gm-test",
    })
    expect(JSON.parse(String(init?.body))).toMatchObject({
      contents: [{ parts: [{ text: "Hello world" }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: "Kore",
            },
          },
        },
      },
    })
  })

  it("rejects non-wav Gemini output requests", async () => {
    const synth = createGeminiTTSSynthesizer({ apiKey: "gm-test" })

    await expect(
      synth.synthesize({
        model: "gemini-2.5-pro-preview-tts",
        voice: "Kore",
        input: "Hello world",
        responseFormat: "mp3",
      })
    ).rejects.toThrow(/only supports wav output/i)

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
