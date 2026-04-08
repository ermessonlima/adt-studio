import { z } from "zod"

export const TTSProviderConfig = z.object({
  model: z.string().optional(),
  languages: z.array(z.string()).optional(),
})
export type TTSProviderConfig = z.infer<typeof TTSProviderConfig>

export const SpeechConfig = z.object({
  model: z.string().optional(),
  format: z.string().optional(),
  voice: z.string().optional(),
  voices_config: z.string().optional(),
  instructions_config: z.string().optional(),
  default_provider: z.string().optional(),
  providers: z.record(z.string(), TTSProviderConfig).optional(),
  bit_rate: z.string().optional(),
  sample_rate: z.number().optional(),
})
export type SpeechConfig = z.infer<typeof SpeechConfig>

export const SpeechFileEntry = z.object({
  textId: z.string(),
  language: z.string(),
  fileName: z.string(),
  voice: z.string(),
  model: z.string(),
  cached: z.boolean(),
  provider: z.string().optional(),
})
export type SpeechFileEntry = z.infer<typeof SpeechFileEntry>

export const TTSOutput = z.object({
  entries: z.array(SpeechFileEntry),
  generatedAt: z.string(),
})
export type TTSOutput = z.infer<typeof TTSOutput>

export const WordTimestamp = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
})
export type WordTimestamp = z.infer<typeof WordTimestamp>

export const WordTimestampEntry = z.object({
  textId: z.string(),
  language: z.string(),
  words: z.array(WordTimestamp),
  duration: z.number(),
})
export type WordTimestampEntry = z.infer<typeof WordTimestampEntry>

export const WordTimestampOutput = z.object({
  entries: z.record(z.string(), WordTimestampEntry),
  generatedAt: z.string(),
})
export type WordTimestampOutput = z.infer<typeof WordTimestampOutput>
