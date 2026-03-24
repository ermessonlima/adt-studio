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

  it("finds Gemini audio when a text part appears before the audio part", async () => {
    const pcmBytes = new Uint8Array([5, 6, 7, 8])
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { text: "Audio generated successfully." },
                  {
                    inlineData: {
                      mimeType: "audio/L16;rate=24000",
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
      input: "Hello again",
      responseFormat: "wav",
    })

    expect(Buffer.from(result.subarray(0, 4)).toString("ascii")).toBe("RIFF")
    expect(result.byteLength).toBe(44 + pcmBytes.byteLength)
  })

  it("retries very short Gemini text with terminal punctuation when the first response has no audio", async () => {
    const pcmBytes = new Uint8Array([9, 10, 11, 12])
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    { text: "No audio returned for this request." },
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
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      inlineData: {
                        mimeType: "audio/L16;rate=24000",
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
      input: "یونیسف",
      responseFormat: "wav",
    })

    expect(Buffer.from(result.subarray(0, 4)).toString("ascii")).toBe("RIFF")
    expect(result.byteLength).toBe(44 + pcmBytes.byteLength)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      contents: [{ parts: [{ text: "یونیسف۔" }] }],
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

  it("surfaces a useful summary when Gemini returns text but no audio", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: "The selected voice is unavailable for this request.",
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

    await expect(
      synth.synthesize({
        model: "gemini-2.5-pro-preview-tts",
        voice: "Kore",
        input: "Hello world",
        responseFormat: "wav",
      })
    ).rejects.toThrow(
      /response did not include audio data\. Response summary: text="The selected voice is unavailable for this request\."/
    )
  })
})
