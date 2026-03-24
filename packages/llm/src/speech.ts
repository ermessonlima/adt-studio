export interface SynthesizeSpeechOptions {
  model: string
  voice: string
  input: string
  responseFormat: string
  instructions?: string
}

export interface TTSSynthesizer {
  synthesize(options: SynthesizeSpeechOptions): Promise<Uint8Array>
}

/**
 * Create a minimal TTS client using OpenAI's speech endpoint.
 * API key defaults to OPENAI_API_KEY if omitted.
 */
export interface AzureTTSConfig {
  subscriptionKey: string
  region: string
}

export interface AzureAudioOptions {
  sampleRate?: number
  bitRate?: string
}

export interface GeminiTTSConfig {
  apiKey?: string
}

const GEMINI_PCM_SAMPLE_RATE = 24_000
const GEMINI_PCM_CHANNELS = 1
const GEMINI_PCM_BITS_PER_SAMPLE = 16

function buildAzureOutputFormat(
  format: string,
  sampleRate?: number,
  bitRate?: string
): string {
  const srKhz = Math.round((sampleRate ?? 24000) / 1000)
  const br = bitRate ?? "48kbitrate"
  if (format.toLowerCase() === "opus") {
    return `ogg-${srKhz}khz-16bit-mono-opus`
  }
  return `audio-${srKhz}khz-${br}-mono-mp3`
}

function buildSSML(voice: string, text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${voice}'>${escaped}</voice></speak>`
}

function wrapPcmAsWave(
  pcmBytes: Uint8Array,
  sampleRate = GEMINI_PCM_SAMPLE_RATE,
  channels = GEMINI_PCM_CHANNELS,
  bitsPerSample = GEMINI_PCM_BITS_PER_SAMPLE
): Uint8Array {
  const header = Buffer.alloc(44)
  const byteRate = sampleRate * channels * (bitsPerSample / 8)
  const blockAlign = channels * (bitsPerSample / 8)
  const dataSize = pcmBytes.byteLength

  header.write("RIFF", 0)
  header.writeUInt32LE(36 + dataSize, 4)
  header.write("WAVE", 8)
  header.write("fmt ", 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write("data", 36)
  header.writeUInt32LE(dataSize, 40)

  return new Uint8Array(Buffer.concat([header, Buffer.from(pcmBytes)]))
}

/**
 * Create a TTS client using Azure Speech Services REST API.
 */
export function createAzureTTSSynthesizer(
  config: AzureTTSConfig,
  audioOptions?: AzureAudioOptions
): TTSSynthesizer {
  return {
    async synthesize(options: SynthesizeSpeechOptions): Promise<Uint8Array> {
      const outputFormat = buildAzureOutputFormat(
        options.responseFormat,
        audioOptions?.sampleRate,
        audioOptions?.bitRate
      )
      const ssml = buildSSML(options.voice, options.input)
      const url = `https://${config.region}.tts.speech.microsoft.com/cognitiveservices/v1`

      console.log(`[azure-tts] POST ${url} voice=${options.voice} format=${outputFormat} text=${options.input.slice(0, 60)}...`)

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": config.subscriptionKey,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": outputFormat,
        },
        body: ssml,
      })
      if (!response.ok) {
        const message = await response.text()
        const errorMsg = `Azure TTS request failed (${response.status}): ${message || response.statusText}`
        console.error(`[azure-tts] ${errorMsg}`)
        throw new Error(errorMsg)
      }

      const arrayBuffer = await response.arrayBuffer()
      console.log(`[azure-tts] OK ${arrayBuffer.byteLength} bytes`)
      return new Uint8Array(arrayBuffer)
    },
  }
}

/**
 * Create a minimal TTS client using OpenAI's speech endpoint.
 * API key defaults to OPENAI_API_KEY if omitted.
 */
export function createTTSSynthesizer(apiKey?: string): TTSSynthesizer {
  return {
    async synthesize(options: SynthesizeSpeechOptions): Promise<Uint8Array> {
      const resolvedApiKey = apiKey ?? process.env.OPENAI_API_KEY
      if (!resolvedApiKey) {
        throw new Error("OPENAI_API_KEY is required for TTS synthesis")
      }

      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resolvedApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: options.model,
          voice: options.voice,
          input: options.input,
          response_format: options.responseFormat,
          instructions: options.instructions,
        }),
      })
      if (!response.ok) {
        const message = await response.text()
        throw new Error(
          `TTS request failed (${response.status}): ${message || response.statusText}`
        )
      }

      const arrayBuffer = await response.arrayBuffer()
      return new Uint8Array(arrayBuffer)
    },
  }
}

/**
 * Create a Gemini TTS client using the Gemini generateContent endpoint.
 * API key defaults to GEMINI_API_KEY if omitted.
 */
export function createGeminiTTSSynthesizer(
  config?: GeminiTTSConfig
): TTSSynthesizer {
  return {
    async synthesize(options: SynthesizeSpeechOptions): Promise<Uint8Array> {
      const resolvedApiKey = config?.apiKey ?? process.env.GEMINI_API_KEY
      if (!resolvedApiKey) {
        throw new Error("GEMINI_API_KEY is required for Gemini TTS synthesis")
      }

      const outputFormat = options.responseFormat.toLowerCase()
      if (outputFormat !== "wav" && outputFormat !== "pcm") {
        throw new Error(
          `Gemini TTS only supports wav output in this integration. Received: ${options.responseFormat}`
        )
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:generateContent`
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": resolvedApiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: options.input,
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: options.voice,
                },
              },
            },
          },
        }),
      })

      const responseText = await response.text()
      const payload = (() => {
        try {
          return JSON.parse(responseText)
        } catch {
          return { error: responseText || response.statusText }
        }
      })() as {
        error?: { message?: string } | string
        candidates?: Array<{
          content?: {
            parts?: Array<{
              inlineData?: {
                data?: string
              }
            }>
          }
        }>
      }

      if (!response.ok) {
        const message =
          typeof payload.error === "string" ? payload.error
            : payload.error?.message ?? response.statusText
        throw new Error(
          `Gemini TTS request failed (${response.status}): ${message || response.statusText}`
        )
      }

      const audioData = payload.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data
      if (!audioData) {
        throw new Error("Gemini TTS response did not include audio data")
      }

      const pcmBytes = new Uint8Array(Buffer.from(audioData, "base64"))
      return outputFormat === "pcm" ? pcmBytes : wrapPcmAsWave(pcmBytes)
    },
  }
}
