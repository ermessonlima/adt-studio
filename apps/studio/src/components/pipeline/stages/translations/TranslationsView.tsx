import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { Link } from "@tanstack/react-router"
import { Check, ChevronDown, ChevronRight, ChevronUp, Languages, Loader2, Play, Pause, Plus, RotateCcw, Save, Settings, Trash2, Type, WandSparkles, X } from "lucide-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, getAudioUrl, BASE_URL } from "@/api/client"
import type { TextCatalogEntry, VersionEntry, WordTimestamp, WordTimestampEntry } from "@/api/client"
import { useActiveConfig } from "@/hooks/use-debug"
import { useBook } from "@/hooks/use-books"
import { useStepHeader } from "../../components/StepViewRouter"
import { useBookRun } from "@/hooks/use-book-run"
import { useBookTasks } from "@/hooks/use-book-tasks"
import { useApiKey } from "@/hooks/use-api-key"
import { StageRunCard } from "../../components/StageRunCard"
import { useVirtualizer } from "@tanstack/react-virtual"
import { cn } from "@/lib/utils"
import { normalizeLocale } from "@/lib/languages"
import { languageUsesSpeechProvider, resolveSpeechProviderForLanguage } from "@/lib/speech-routing"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { resolveTranslationLanguageState } from "./lib/translations-view-state"
import { msg } from "@lingui/core/macro"
import { useLingui } from "@lingui/react/macro"

const IMAGE_ID_RE = /_im\d{3}/
function isImageEntry(id: string): boolean {
  return IMAGE_ID_RE.test(id)
}

const ANSWER_ID_RE = /_ans_/
function isAnswerEntry(id: string): boolean {
  return ANSWER_ID_RE.test(id)
}

const GLOSSARY_ID_RE = /^gl\d{3}/
function isGlossaryEntry(id: string): boolean {
  return GLOSSARY_ID_RE.test(id)
}

type CatalogCategory = "all" | "text" | "captions" | "answers" | "glossary"

function getEntryCategory(id: string): CatalogCategory {
  if (isImageEntry(id)) return "captions"
  if (isAnswerEntry(id)) return "answers"
  if (isGlossaryEntry(id)) return "glossary"
  return "text"
}

const langNames = new Intl.DisplayNames(["en"], { type: "language" })
function displayLang(code: string): string {
  try { return langNames.of(code) ?? code } catch { return code }
}

function VersionPicker({
  currentVersion,
  saving,
  dirty,
  bookLabel,
  language,
  onPreview,
  onSave,
  onDiscard,
}: {
  currentVersion: number | null
  saving: boolean
  dirty: boolean
  bookLabel: string
  language: string
  onPreview: (data: unknown) => void
  onSave: () => void
  onDiscard: () => void
}) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<VersionEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const handleOpen = async () => {
    if (saving || currentVersion == null) return
    setOpen(true)
    setLoading(true)
    const res = await api.getVersionHistory(bookLabel, "text-catalog-translation", language, true)
    setVersions(res.versions)
    setLoading(false)
  }

  const handlePick = (v: VersionEntry) => {
    if (v.version === currentVersion && !dirty) {
      setOpen(false)
      return
    }
    setOpen(false)
    onPreview(v.data)
  }

  if (saving) {
    return <Loader2 className="h-3 w-3 animate-spin" />
  }

  if (currentVersion == null) return null

  if (dirty) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onDiscard}
          className="text-[10px] font-medium rounded px-2 py-0.5 bg-black/15 text-black hover:bg-black/25 cursor-pointer transition-colors"
        >
          {t`Discard`}
        </button>
        <button
          type="button"
          onClick={onSave}
          className="flex items-center gap-1 text-[10px] font-medium rounded px-2 py-0.5 bg-white text-green-800 hover:bg-white/80 cursor-pointer transition-colors"
        >
          <Check className="h-3 w-3" />
          {t`Save`}
        </button>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center gap-0.5 text-[10px] font-normal normal-case tracking-normal bg-white/20 text-white hover:bg-white/30 rounded px-1.5 py-0.5 transition-colors"
      >
        v{currentVersion}
        <ChevronDown className="h-2.5 w-2.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-popover border rounded shadow-md min-w-[80px] py-1">
          {loading ? (
            <div className="flex items-center justify-center py-2 px-3">
              <Loader2 className="h-3 w-3 animate-spin" />
            </div>
          ) : versions && versions.length > 0 ? (
            versions.map((v) => (
              <button
                key={v.version}
                type="button"
                onClick={() => handlePick(v)}
                className={`w-full text-left px-3 py-1 text-xs hover:bg-accent transition-colors ${
                  v.version === currentVersion ? "font-semibold text-foreground" : "text-muted-foreground"
                }`}
              >
                v{v.version}
              </button>
            ))
          ) : (
            <div className="px-3 py-1 text-xs text-muted-foreground">{t`No versions`}</div>
          )}
        </div>
      )}
    </div>
  )
}

export function TranslationsView({ bookLabel, stageSlug = "translate", selectedPageId, onSelectPage }: { bookLabel: string; stageSlug?: string; selectedPageId?: string; onSelectPage?: (pageId: string | null) => void }) {
  const isSpeechStage = stageSlug === "speech"
  const { t, i18n } = useLingui()
  const { setExtra } = useStepHeader()
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const { data: book, isLoading: isBookLoading } = useBook(bookLabel)
  const queryClient = useQueryClient()
  const { stageState, queueRun, error: runError } = useBookRun()
  const { isTaskRunning } = useBookTasks(bookLabel)
  const { apiKey, hasApiKey, azureKey, azureRegion, geminiKey } = useApiKey()
  const translateState = stageState("translate")
  const speechState = stageState("speech")
  const activeState = isSpeechStage ? speechState : translateState
  const stageDone = activeState === "done"
  const hasStageError = activeState === "error"
  const isRunning = activeState === "running" || activeState === "queued"

  const handleRun = useCallback(() => {
    if (!hasApiKey || isRunning) return
    queueRun({
      fromStage: stageSlug as "translate" | "speech",
      toStage: stageSlug as "translate" | "speech",
      apiKey,
    })
  }, [hasApiKey, isRunning, apiKey, queueRun, stageSlug])

  const handleDeleteTTS = useCallback(async () => {
    await api.deleteTTS(bookLabel)
    await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "tts"] })
    await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "step-status"] })
  }, [bookLabel, queryClient])

  const { data: catalog, isLoading } = useQuery({
    queryKey: ["books", bookLabel, "text-catalog"],
    queryFn: () => api.getTextCatalog(bookLabel),
    enabled: !!bookLabel,
  })

  const { data: ttsData } = useQuery({
    queryKey: ["books", bookLabel, "tts"],
    queryFn: () => api.getTTS(bookLabel),
    enabled: !!bookLabel,
  })

  const merged = activeConfigData?.merged as Record<string, unknown> | undefined
  const speechConfig = merged?.speech
  const outputLanguages = Array.from(
    new Set(((merged?.output_languages as string[] | undefined) ?? []).map((code) => normalizeLocale(code)))
  )
  const bookLanguage = book?.languageCode ?? book?.metadata?.language_code ?? null
  const configuredEditingLanguage = merged?.editing_language as string | undefined

  const hasExplicitOutputLanguages = outputLanguages.length > 0

  const [selectedLang, setSelectedLang] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<CatalogCategory>("all")

  // Default to first output language when available
  useEffect(() => {
    if (hasExplicitOutputLanguages && outputLanguages.length > 0 && !selectedLang) {
      setSelectedLang(outputLanguages[0])
    }
  }, [outputLanguages.length, hasExplicitOutputLanguages])

  const entries = catalog?.entries ?? []
  const pageFilteredEntries = selectedPageId
    ? entries.filter((e) => e.id.startsWith(selectedPageId + "_"))
    : entries
  const displayEntries = categoryFilter === "all"
    ? pageFilteredEntries
    : pageFilteredEntries.filter((e) => getEntryCategory(e.id) === categoryFilter)

  // When no output languages are configured, we're always viewing the source language.
  // When explicit output languages exist, check if the selected one matches the editing language.
  const { editingLanguage, isSourceLang: isSelectedSourceLang, isSourceLanguagePending } = resolveTranslationLanguageState({
    selectedLang,
    configuredEditingLanguage,
    bookLanguage,
    isBookLoading,
  })
  const isSourceLang = !hasExplicitOutputLanguages || isSelectedSourceLang
  const audioLang = selectedLang ??
    (hasExplicitOutputLanguages ? (outputLanguages[0] ?? editingLanguage) : editingLanguage)
  const currentLanguageUsesGemini =
    !!audioLang && languageUsesSpeechProvider(audioLang, "gemini", speechConfig)
  const geminiRoutedLanguages = (
    outputLanguages.length > 0
      ? outputLanguages
      : editingLanguage
        ? [editingLanguage]
        : []
  ).filter((language, index, array) =>
    languageUsesSpeechProvider(language, "gemini", speechConfig) &&
    array.indexOf(language) === index
  )
  const allowGeminiPartialView =
    isSpeechStage &&
    hasStageError &&
    geminiRoutedLanguages.length > 0
  const showRunCard = (!stageDone || isRunning) && !allowGeminiPartialView

  // Fetch word timestamps for the active language on the speech page
  const { data: timestampData } = useQuery({
    queryKey: ["books", bookLabel, "tts-timestamps", audioLang],
    queryFn: () => api.getWordTimestamps(bookLabel, audioLang!),
    enabled: isSpeechStage && !!bookLabel && !!audioLang,
  })
  const timestampMap = timestampData?.entries ?? {}

  // Pending state for edits (keyed by language)
  const [pendingEntries, setPendingEntries] = useState<TextCatalogEntry[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [generateErrorById, setGenerateErrorById] = useState<Record<string, string>>({})

  // Get translated entries for selected language
  const translationData = selectedLang ? catalog?.translations?.[selectedLang] : undefined
  const translatedEntries = isSourceLang ? entries : (translationData?.entries ?? [])
  const translationVersion = isSourceLang ? (catalog?.version ?? null) : (translationData?.version ?? null)

  // Reset pending when version or language changes
  useEffect(() => {
    setPendingEntries(null)
  }, [translationVersion, selectedLang])

  // Effective translated entries (pending overrides fetched data)
  const effectiveEntries = pendingEntries ?? translatedEntries
  const translatedMap = new Map(effectiveEntries.map((e) => [e.id, e.text]))
  const dirty = pendingEntries != null

  const saveTranslation = useCallback(async () => {
    if (!pendingEntries || !selectedLang) return
    setSaving(true)
    const minDelay = new Promise((r) => setTimeout(r, 400))
    await api.updateTranslation(bookLabel, selectedLang, { entries: pendingEntries })
    setPendingEntries(null)
    await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "text-catalog"] })
    await minDelay
    setSaving(false)
  }, [pendingEntries, selectedLang, bookLabel, queryClient])

  const saveRef = useRef(saveTranslation)
  saveRef.current = saveTranslation

  const updateEntry = (entryId: string, newText: string) => {
    const base = pendingEntries ?? translatedEntries
    // If no existing entry for this id, add one
    const exists = base.some((e) => e.id === entryId)
    if (exists) {
      setPendingEntries(
        base.map((e) => (e.id === entryId ? { ...e, text: newText } : e))
      )
    } else {
      setPendingEntries([...base, { id: entryId, text: newText }])
    }
  }

  // Build audio lookup — use selected language, or editing language when no output languages
  const audioMap = new Map<string, { fileName: string; voice: string }>()
  if (ttsData && audioLang && ttsData.languages[audioLang]) {
    for (const e of ttsData.languages[audioLang].entries) {
      audioMap.set(e.textId, { fileName: e.fileName, voice: e.voice })
    }
  }
  // Separate base-language audio map for the source column in translation view
  const baseAudioMap = new Map<string, { fileName: string; voice: string }>()
  if (ttsData && editingLanguage && ttsData.languages[editingLanguage] && audioLang !== editingLanguage) {
    for (const e of ttsData.languages[editingLanguage].entries) {
      baseAudioMap.set(e.textId, { fileName: e.fileName, voice: e.voice })
    }
  }
  // Build per-language model/voice summary from TTS data
  const langTtsSummary = useMemo(() => {
    const map = new Map<string, { provider: string; model: string; voice: string }>()
    if (!ttsData) return map
    for (const [lang, data] of Object.entries(ttsData.languages)) {
      const first = data.entries[0]
      if (first) {
        map.set(lang, { provider: first.provider ?? "", model: first.model, voice: first.voice })
      }
    }
    return map
  }, [ttsData])

  const totalAudioFiles = ttsData
    ? Object.values(ttsData.languages).reduce((sum, lang) => sum + lang.entries.length, 0)
    : 0
  const generatedAudioCount = displayEntries.filter((entry) => audioMap.has(entry.id)).length
  const missingAudioCount = Math.max(displayEntries.length - generatedAudioCount, 0)

  // Track playback state for the currently-playing entry (only one plays at a time)
  const [playingEntryId, setPlayingEntryId] = useState<string | null>(null)
  const [playbackTime, setPlaybackTime] = useState(0)

  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: displayEntries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 60,
    overscan: 5,
  })

  const generateAudioMutation = useMutation({
    mutationFn: async (variables: { textId: string; language: string }) => {
      if (!geminiKey) {
        throw new Error(i18n._(msg`Gemini API key is required to generate audio.`))
      }
      return api.generateGeminiTTSForItem(
        bookLabel,
        variables.textId,
        variables.language,
        {
          geminiApiKey: geminiKey,
          openaiApiKey: apiKey || undefined,
          azure: azureKey && azureRegion
            ? { key: azureKey, region: azureRegion }
            : undefined,
        }
      )
    },
    onMutate: (variables) => {
      setGenerateErrorById((prev) => {
        if (!(variables.textId in prev)) return prev
        const next = { ...prev }
        delete next[variables.textId]
        return next
      })
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "tts"] }),
        queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "step-status"] }),
      ])
    },
    onError: (error, variables) => {
      setGenerateErrorById((prev) => ({
        ...prev,
        [variables.textId]:
          error instanceof Error ? error.message : String(error),
      }))
      queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "step-status"] })
    },
  })

  const handleGenerateAudio = useCallback(
    (textId: string) => {
      if (!audioLang || !currentLanguageUsesGemini) return
      generateAudioMutation.mutate({ textId, language: audioLang })
    },
    [audioLang, currentLanguageUsesGemini, generateAudioMutation]
  )

  const transcribeMutation = useMutation({
    mutationFn: async (variables: { textId: string; language: string }) => {
      if (!apiKey) throw new Error("OpenAI API key required for transcription")
      return api.transcribeOne(bookLabel, variables.textId, variables.language, apiKey)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "tts-timestamps", audioLang] })
    },
  })

  const transcribeAllMutation = useMutation({
    mutationFn: async (language: string) => {
      if (!apiKey) throw new Error("OpenAI API key required for transcription")
      return api.transcribeAll(bookLabel, language, apiKey)
    },
  })

  const saveTimestampsMutation = useMutation({
    mutationFn: async (variables: { textId: string; language: string; words: WordTimestamp[]; duration: number }) => {
      return api.saveWordTimestamps(bookLabel, variables.language, variables.textId, {
        words: variables.words,
        duration: variables.duration,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "tts-timestamps", audioLang] })
    },
  })

  const handleSaveTimestamps = useCallback(
    (textId: string, words: WordTimestamp[], duration: number) => {
      if (!audioLang) return
      saveTimestampsMutation.mutate({ textId, language: audioLang, words, duration })
    },
    [audioLang, saveTimestampsMutation]
  )

  const handleTranscribe = useCallback(
    (textId: string) => {
      if (!audioLang || !apiKey) return
      transcribeMutation.mutate({ textId, language: audioLang })
    },
    [audioLang, apiKey, transcribeMutation]
  )

  useEffect(() => {
    if (!catalog) return
    setExtra(
      <div className="flex items-center gap-1.5 ml-auto">
        <span className="text-[10px] bg-white/20 rounded-full px-2 py-0.5">{t`${String(displayEntries.length)} texts`}</span>
        {outputLanguages.length > 1 && (
          <span className="text-[10px] bg-white/20 rounded-full px-2 py-0.5">{t`${String(outputLanguages.length)} languages`}</span>
        )}
        {currentLanguageUsesGemini ? (
          <span className="text-[10px] bg-white/20 rounded-full px-2 py-0.5">
            {t`${String(generatedAudioCount)}/${String(displayEntries.length)} audio`}
          </span>
        ) : totalAudioFiles > 0 && (
          <span className="text-[10px] bg-white/20 rounded-full px-2 py-0.5">{t`${String(totalAudioFiles)} audio`}</span>
        )}
        {currentLanguageUsesGemini && missingAudioCount > 0 && (
          <span className="text-[10px] bg-amber-100 text-amber-900 rounded-full px-2 py-0.5">
            {t`${missingAudioCount} missing`}
          </span>
        )}
        {selectedLang && translationVersion != null && !isSourceLang && !isSpeechStage && (
          <VersionPicker
            currentVersion={translationVersion}
            saving={saving}
            dirty={dirty}
            bookLabel={bookLabel}
            language={selectedLang}
            onPreview={(d) => {
              const data = d as { entries?: TextCatalogEntry[] }
              setPendingEntries(data?.entries ?? [])
            }}
            onSave={() => saveRef.current()}
            onDiscard={() => setPendingEntries(null)}
          />
        )}
        <div className="w-px h-4 bg-white/20" />
        <button
          type="button"
          onClick={() => {
            if (!hasApiKey || isRunning) return
            queueRun({ fromStage: stageSlug as "translate" | "speech", toStage: stageSlug as "translate" | "speech", apiKey })
          }}
          disabled={!hasApiKey || isRunning}
          title={isSpeechStage ? t`Re-run speech` : t`Re-run translation`}
          className="text-white/60 hover:text-white transition-colors disabled:opacity-30 cursor-pointer disabled:cursor-default"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        {isSpeechStage && (
          <>
            <button
              type="button"
              onClick={() => {
                if (!audioLang) return
                const langDisplay = langNames.of(audioLang) ?? audioLang
                if (!window.confirm(t`Are you sure you want to generate word-level timestamps for ${langDisplay}?`)) return
                transcribeAllMutation.mutate(audioLang)
              }}
              disabled={!apiKey || totalAudioFiles === 0 || transcribeAllMutation.isPending || isTaskRunning("transcribe-timestamps")}
              title={apiKey ? t`Calculate word timestamps for all entries` : t`OpenAI key required`}
              className="text-white/60 hover:text-white transition-colors disabled:opacity-30 cursor-pointer disabled:cursor-default"
            >
              <Type className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (!window.confirm(t`Are you sure you want to delete generated speech?`)) return
                handleDeleteTTS()
              }}
              disabled={totalAudioFiles === 0}
              title={t`Delete all speech`}
              className="text-white/60 hover:text-white transition-colors disabled:opacity-30 cursor-pointer disabled:cursor-default"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
        <Link
          to="/books/$label/$step/settings"
          params={{ label: bookLabel, step: stageSlug }}
          search={{ tab: "general" }}
          className="text-white/60 hover:text-white transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
        </Link>
      </div>
    )
    return () => setExtra(null)
  }, [catalog, t, displayEntries.length, outputLanguages.length, selectedLang, translationVersion, saving, dirty, bookLabel, isSourceLang, totalAudioFiles, selectedPageId, currentLanguageUsesGemini, generatedAudioCount, missingAudioCount, hasApiKey, isRunning, apiKey, queueRun, stageSlug, isSpeechStage, handleDeleteTTS, audioLang, transcribeAllMutation, isTaskRunning])

  if (!showRunCard && isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span className="text-sm">{t`Loading text catalog...`}</span>
      </div>
    )
  }

  // Resolve speech config summary for display
  const speechSummary = useMemo(() => {
    if (!speechConfig || typeof speechConfig !== "object") {
      return { provider: "openai", voice: "alloy", model: "gpt-4o-mini-tts" }
    }
    const sc = speechConfig as Record<string, unknown>
    const provider = (sc.default_provider as string) ?? "openai"
    const voice = (sc.voice as string) ?? "alloy"
    const model = (sc.model as string) ?? undefined
    const providers = sc.providers as Record<string, Record<string, unknown>> | undefined
    const providerModel = providers?.[provider]?.model as string | undefined
    return { provider, voice, model: providerModel ?? model ?? "gpt-4o-mini-tts" }
  }, [speechConfig])

  if (showRunCard || !catalog || entries.length === 0) {
    return (
      <div className="p-4">
        <StageRunCard
          stageSlug={stageSlug}
          isRunning={isRunning}
          completed={stageDone}
          onRun={handleRun}
          disabled={!hasApiKey || isRunning}
        >
          {!isSpeechStage ? (
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t`Book Language`}</p>
                <p className="text-sm mt-0.5">
                  {bookLanguage ? (
                    <>{displayLang(bookLanguage)} <span className="text-muted-foreground">({bookLanguage})</span></>
                  ) : (
                    <span className="text-muted-foreground italic">{t`Not detected`}</span>
                  )}
                </p>
              </div>
              {outputLanguages.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t`Output Languages`}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {outputLanguages.map((lang) => (
                      <span key={lang} className="inline-flex items-center text-xs bg-muted rounded-md px-2 py-0.5">
                        {displayLang(lang)} <span className="text-muted-foreground ml-1">({lang})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <Link
                to="/books/$label/$step/settings"
                params={{ label: bookLabel, step: "translate" }}
                search={{ tab: "general" }}
                className="inline-flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700 transition-colors"
              >
                <Settings className="w-3 h-3" />
                {t`Add Translations`}
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t`Voice`}</p>
                <p className="text-sm mt-0.5">
                  <span className="capitalize">{speechSummary.provider}</span>
                  {" · "}
                  {speechSummary.voice}
                  {" · "}
                  <span className="text-muted-foreground">{speechSummary.model}</span>
                </p>
              </div>
              <Link
                to="/books/$label/$step/settings"
                params={{ label: bookLabel, step: "speech" }}
                search={{ tab: "general" }}
                className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-700 transition-colors"
              >
                <Settings className="w-3 h-3" />
                {t`Choose Provider`}
              </Link>
            </div>
          )}
        </StageRunCard>
      </div>
    )
  }

  const showAllButton = selectedPageId ? (
    <div className="flex justify-center pt-2 pb-4">
      <button
        type="button"
        onClick={() => onSelectPage?.(null)}
        className="text-xs font-medium text-pink-600 hover:text-pink-700 hover:underline transition-colors"
      >
        {t`Show all translations`}
      </button>
    </div>
  ) : null

  // Language tabs + entries
  return (
    <div className="flex flex-col h-full">
      {/* Fixed header: alerts, language tabs, column headers */}
      <div className="shrink-0 px-4 pt-4 space-y-3">
        {allowGeminiPartialView && runError && (
          <Alert variant="destructive" className="rounded-md">
            <AlertDescription className="text-xs whitespace-pre-wrap break-words">
              {runError}
            </AlertDescription>
          </Alert>
        )}

        {/* Language filter pills — always shown, base language first */}
        {editingLanguage && (
        <div className="flex gap-1.5 items-center flex-wrap">
          {[editingLanguage, ...outputLanguages.filter((l) => l !== editingLanguage)].map((lang) => {
            const isBase = lang === editingLanguage
            const isActive = hasExplicitOutputLanguages ? selectedLang === lang : isBase
            const ttsSummary = isSpeechStage ? langTtsSummary.get(lang) : undefined
            return (
              <button
                key={lang}
                type="button"
                onClick={() => setSelectedLang(lang)}
                className={cn(
                  "text-xs px-3 rounded-md font-medium transition-colors cursor-pointer text-left",
                  isSpeechStage && ttsSummary ? "h-auto py-1.5" : "h-7",
                  isActive
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                )}
              >
                <span>
                  {displayLang(lang)}
                  <span className={cn(
                    "ml-1 text-[10px]",
                    isActive ? "opacity-60" : "opacity-50"
                  )}>
                    {isBase ? t`(base)` : `(${lang})`}
                  </span>
                </span>
                {isSpeechStage && ttsSummary && (
                  <span className={cn(
                    "block text-[10px] leading-tight mt-0.5",
                    isActive ? "opacity-50" : "opacity-40"
                  )}>
                    {ttsSummary.model} · {ttsSummary.voice}
                  </span>
                )}
              </button>
            )
          })}
          {!isSpeechStage && (
            <Link
              to="/books/$label/$step/settings"
              params={{ label: bookLabel, step: "translate" }}
              search={{ tab: "general" }}
              className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground bg-muted hover:bg-accent hover:text-accent-foreground transition-colors"
              title={t`Add language`}
            >
              <Plus className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
        )}

        {/* Category filter pills */}
        {pageFilteredEntries.length > 0 && (
        <div className="flex gap-1.5">
          {([
            ["all", t`All`],
            ["text", t`Text`],
            ["captions", t`Captions`],
            ["answers", t`Answers`],
            ["glossary", t`Glossary`],
          ] as const).map(([key, label]) => {
            const count = key === "all"
              ? pageFilteredEntries.length
              : pageFilteredEntries.filter((e) => getEntryCategory(e.id) === key).length
            if (key !== "all" && count === 0) return null
            return (
              <button
                key={key}
                type="button"
                onClick={() => setCategoryFilter(key)}
                className={cn(
                  "text-xs h-7 px-3 rounded-md font-medium transition-colors cursor-pointer",
                  categoryFilter === key
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                )}
              >
                {label}
                <span className={cn(
                  "ml-1 text-[10px] tabular-nums",
                  categoryFilter === key ? "opacity-60" : "opacity-50"
                )}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
        )}

        {!isSourceLang && !isSourceLanguagePending && displayEntries.length > 0 && (
          <div className="grid grid-cols-2 gap-3 px-3 py-1.5">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {displayLang(editingLanguage)}
            </span>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{selectedLang ? displayLang(selectedLang) : selectedLang}</span>
          </div>
        )}
      </div>

      {/* Entries */}
      {isSourceLanguagePending ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          <span className="text-sm">{t`Resolving source language...`}</span>
        </div>
      ) : selectedPageId && displayEntries.length === 0 && entries.length > 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <div className="w-12 h-12 rounded-full bg-pink-50 flex items-center justify-center mb-3">
            <Languages className="w-6 h-6 text-pink-300" />
          </div>
          <p className="text-sm font-medium">{t`No translations for this page`}</p>
          <p className="text-xs mt-1">{t`This page has no translatable text entries`}</p>
        </div>
      ) : (
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
        <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const entry = displayEntries[virtualRow.index]
            const translated = translatedMap.get(entry.id)
            const audio = audioMap.get(entry.id)
            const baseAudio = baseAudioMap.get(entry.id)
            const isImg = isImageEntry(entry.id)
            const isAnswer = isAnswerEntry(entry.id)

            return (
              <div
                key={entry.id}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="pb-1">
                  {isSourceLang ? (
                    <div className={cn("px-3 py-2.5 rounded-md border", isAnswer ? "bg-amber-50/60" : "bg-card")}>
                      <div className="flex items-start gap-3">
                        {isImg && (
                          <img
                            src={`${BASE_URL}/books/${bookLabel}/images/${entry.id}`}
                            alt=""
                            className="shrink-0 w-16 h-12 rounded object-cover ring-1 ring-border"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] text-muted-foreground">
                            {entry.id}
                            {isAnswer && <span className="ml-1.5 text-[9px] font-medium text-amber-700 bg-amber-100 rounded px-1 py-0.5">{t`Answer`}</span>}
                            {isSpeechStage && audio && <span className="ml-1.5 text-[9px] text-muted-foreground/60">{audio.fileName}</span>}
                          </span>
                          <HighlightedText
                            text={entry.text}
                            timestamps={isSpeechStage ? timestampMap[entry.id] : undefined}
                            currentTime={playingEntryId === entry.id ? playbackTime : 0}
                            isPlaying={playingEntryId === entry.id}
                          />
                        </div>
                      </div>
                      {isSpeechStage && !isAnswer && <AudioAction
                        audio={audio}
                        audioLang={audioLang}
                        bookLabel={bookLabel}
                        textId={entry.id}
                        canGenerate={currentLanguageUsesGemini}
                        hasGeminiKey={geminiKey.length > 0}
                        onGenerate={handleGenerateAudio}
                        isGenerating={
                          generateAudioMutation.isPending &&
                          generateAudioMutation.variables?.textId === entry.id &&
                          generateAudioMutation.variables?.language === audioLang
                        }
                        errorMessage={generateErrorById[entry.id]}
                        timestamps={timestampMap[entry.id]}
                        onTranscribe={handleTranscribe}
                        isTranscribing={
                          transcribeMutation.isPending &&
                          transcribeMutation.variables?.textId === entry.id
                        }
                        hasOpenaiKey={!!apiKey}
                        onTimeUpdate={(time) => { setPlaybackTime(time); setPlayingEntryId(entry.id) }}
                        onPlayingChange={(p) => { if (!p) setPlayingEntryId(null) ; else setPlayingEntryId(entry.id) }}
                        onSaveTimestamps={(words, dur) => handleSaveTimestamps(entry.id, words, dur)}
                        isSavingTimestamps={
                          saveTimestampsMutation.isPending &&
                          saveTimestampsMutation.variables?.textId === entry.id
                        }
                        timestampColumns={4}
                      />}
                    </div>
                  ) : (
                    <div className={cn("px-3 py-2.5 rounded-md border", isAnswer ? "bg-amber-50/60" : "bg-card")}>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="flex items-start gap-3">
                            {isImg && (
                              <img
                                src={`${BASE_URL}/books/${bookLabel}/images/${entry.id}`}
                                alt=""
                                className="shrink-0 w-16 h-12 rounded object-cover ring-1 ring-border"
                              />
                            )}
                            <div className="min-w-0">
                              <span className="text-[10px] text-muted-foreground">
                                {entry.id}
                                {isAnswer && <span className="ml-1.5 text-[9px] font-medium text-amber-700 bg-amber-100 rounded px-1 py-0.5">{t`Answer`}</span>}
                                {isSpeechStage && baseAudio && <span className="ml-1.5 text-[9px] text-muted-foreground/60">{baseAudio.fileName}</span>}
                              </span>
                              <p className="text-sm leading-relaxed mt-0.5">{entry.text}</p>
                            </div>
                          </div>
                          {isSpeechStage && !isAnswer && baseAudio && editingLanguage && (
                            <WaveformPlayer
                              key={`base-${editingLanguage}`}
                              audioUrl={getAudioUrl(bookLabel, editingLanguage, baseAudio.fileName)}
                            />
                          )}
                        </div>
                        <div>
                          <div className="min-w-0">
                            <span className="text-[10px] text-muted-foreground">
                              &nbsp;
                              {isSpeechStage && audio && <span className="text-[9px] text-muted-foreground/60">{audio.fileName}</span>}
                            </span>
                            {isSpeechStage ? (
                              <HighlightedText
                                text={translated || ""}
                                timestamps={timestampMap[entry.id]}
                                currentTime={playingEntryId === entry.id ? playbackTime : 0}
                                isPlaying={playingEntryId === entry.id}
                              />
                            ) : (
                              <textarea
                                value={translated ?? ""}
                                onChange={(e) => updateEntry(entry.id, e.target.value)}
                                placeholder={t`Pending...`}
                                className="w-full text-sm leading-relaxed mt-0.5 resize-none rounded border border-transparent bg-transparent p-1.5 -ml-1.5 hover:border-border hover:bg-muted/30 focus:border-ring focus:bg-white focus:outline-none focus:ring-1 focus:ring-ring transition-colors placeholder:text-muted-foreground placeholder:italic"
                                style={{ fieldSizing: "content" } as React.CSSProperties}
                                rows={1}
                              />
                            )}
                          </div>
                          {isSpeechStage && !isAnswer && <AudioAction
                            audio={audio}
                            audioLang={audioLang}
                            bookLabel={bookLabel}
                            textId={entry.id}
                            canGenerate={currentLanguageUsesGemini}
                            hasGeminiKey={geminiKey.length > 0}
                            onGenerate={handleGenerateAudio}
                            isGenerating={
                              generateAudioMutation.isPending &&
                              generateAudioMutation.variables?.textId === entry.id &&
                              generateAudioMutation.variables?.language === audioLang
                            }
                            errorMessage={generateErrorById[entry.id]}
                            timestamps={timestampMap[entry.id]}
                            onTranscribe={handleTranscribe}
                            isTranscribing={
                              transcribeMutation.isPending &&
                              transcribeMutation.variables?.textId === entry.id
                            }
                            hasOpenaiKey={!!apiKey}
                            onTimeUpdate={(time) => { setPlaybackTime(time); setPlayingEntryId(entry.id) }}
                            onPlayingChange={(p) => { if (!p) setPlayingEntryId(null); else setPlayingEntryId(entry.id) }}
                            onSaveTimestamps={(words, dur) => handleSaveTimestamps(entry.id, words, dur)}
                            isSavingTimestamps={
                              saveTimestampsMutation.isPending &&
                              saveTimestampsMutation.variables?.textId === entry.id
                            }
                          />}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        {showAllButton}
      </div>
      )}
    </div>
  )
}

/** Number of bars in the waveform visualisation */
const WAVEFORM_BARS = 120

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, "0")}`
}

/**
 * Decode audio data into an array of normalised amplitudes (0-1) for waveform rendering.
 * Falls back to a flat line on error so the player still works.
 */
async function decodeWaveform(url: string, bars: number): Promise<number[]> {
  try {
    const res = await fetch(url)
    const buf = await res.arrayBuffer()
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const decoded = await ctx.decodeAudioData(buf)
    const raw = decoded.getChannelData(0)
    const step = Math.floor(raw.length / bars)
    const amps: number[] = []
    for (let i = 0; i < bars; i++) {
      let sum = 0
      for (let j = 0; j < step; j++) {
        const v = raw[i * step + j]
        sum += v * v
      }
      amps.push(Math.sqrt(sum / step))
    }
    const max = Math.max(...amps, 0.001)
    await ctx.close()
    return amps.map((a) => a / max)
  } catch {
    return Array(bars).fill(0.3) as number[]
  }
}

/** Global stop handle — only one waveform plays at a time */
let activePlayerStop: (() => void) | null = null

function WaveformPlayer({ audioUrl, onTimeUpdate, onPlayingChange }: { audioUrl: string; onTimeUpdate?: (time: number) => void; onPlayingChange?: (playing: boolean) => void }) {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [waveform, setWaveform] = useState<number[] | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const rafRef = useRef<number>(0)
  const waveContainerRef = useRef<HTMLDivElement>(null)
  const onTimeUpdateRef = useRef(onTimeUpdate)
  onTimeUpdateRef.current = onTimeUpdate
  const onPlayingChangeRef = useRef(onPlayingChange)
  onPlayingChangeRef.current = onPlayingChange

  // Decode waveform on mount
  useEffect(() => {
    let cancelled = false
    decodeWaveform(audioUrl, WAVEFORM_BARS).then((w) => {
      if (!cancelled) setWaveform(w)
    })
    return () => { cancelled = true }
  }, [audioUrl])

  // Time update loop
  const tick = useCallback(() => {
    const el = audioRef.current
    if (el && !el.paused) {
      setProgress(el.currentTime)
      onTimeUpdateRef.current?.(el.currentTime)
      rafRef.current = requestAnimationFrame(tick)
    }
  }, [])

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      const el = new Audio(audioUrl)
      el.addEventListener("loadedmetadata", () => setDuration(el.duration))
      el.addEventListener("ended", () => {
        setPlaying(false)
        setProgress(0)
        onPlayingChangeRef.current?.(false)
        onTimeUpdateRef.current?.(0)
        cancelAnimationFrame(rafRef.current)
      })
      audioRef.current = el
    }
    return audioRef.current
  }, [audioUrl])

  const stopThis = useCallback(() => {
    const el = audioRef.current
    if (el) {
      el.pause()
      el.currentTime = 0
    }
    cancelAnimationFrame(rafRef.current)
    setPlaying(false)
    setProgress(0)
    onPlayingChangeRef.current?.(false)
    onTimeUpdateRef.current?.(0)
    if (activePlayerStop === stopThisRef.current) activePlayerStop = null
  }, [])
  const stopThisRef = useRef(stopThis)
  stopThisRef.current = stopThis

  const startPlaying = useCallback((el: HTMLAudioElement) => {
    // Stop any other playing instance first
    if (activePlayerStop && activePlayerStop !== stopThisRef.current) activePlayerStop()
    activePlayerStop = stopThisRef.current
    el.play()
    setPlaying(true)
    onPlayingChangeRef.current?.(true)
    rafRef.current = requestAnimationFrame(tick)
  }, [tick])

  const toggle = useCallback(() => {
    const el = ensureAudio()
    if (playing) {
      el.pause()
      cancelAnimationFrame(rafRef.current)
      setPlaying(false)
      onPlayingChangeRef.current?.(false)
      if (activePlayerStop === stopThisRef.current) activePlayerStop = null
    } else {
      startPlaying(el)
    }
  }, [playing, ensureAudio, startPlaying])

  const seek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ensureAudio()
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    el.currentTime = ratio * (el.duration || 0)
    setProgress(el.currentTime)
    if (!playing) {
      startPlaying(el)
    }
  }, [ensureAudio, playing, startPlaying])

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current)
      if (activePlayerStop === stopThisRef.current) activePlayerStop = null
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const progressRatio = duration > 0 ? progress / duration : 0

  return (
    <div className="flex items-center gap-2 mt-1.5 w-full">
      {/* Play / Pause */}
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "shrink-0 flex items-center justify-center w-6 h-6 rounded-full transition-all cursor-pointer",
          playing
            ? "bg-pink-500 text-white hover:bg-pink-600 scale-110"
            : "bg-muted text-muted-foreground hover:bg-pink-100 hover:text-pink-600 hover:scale-110"
        )}
      >
        {playing ? <Pause className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5 ml-0.5" />}
      </button>

      {/* Waveform */}
      <div
        ref={waveContainerRef}
        onClick={seek}
        className="flex-1 flex items-center h-8 cursor-pointer"
      >
        {(waveform ?? Array(WAVEFORM_BARS).fill(0.1) as number[]).map((amp, i) => {
          const barRatio = (i + 0.5) / WAVEFORM_BARS
          const isPast = barRatio <= progressRatio
          const minH = 1
          const maxH = 28
          const h = Math.max(minH, amp * maxH)
          return (
            <div
              key={i}
              className={cn(
                "flex-1 rounded-full transition-colors",
                isPast ? "bg-pink-400" : "bg-gray-300"
              )}
              style={{ height: `${h}px`, minWidth: "1px" }}
            />
          )
        })}
      </div>

      {/* Time */}
      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground w-8 text-right">
        {duration > 0 ? formatTime(playing ? progress : duration) : ""}
      </span>
    </div>
  )
}

/** Render the entry text with word-by-word highlighting synced to audio playback. */
function HighlightedText({ text, timestamps, currentTime, isPlaying }: {
  text: string
  timestamps?: WordTimestampEntry
  currentTime: number
  isPlaying: boolean
}) {
  if (!timestamps || !isPlaying) {
    return <p className="text-sm leading-relaxed mt-0.5">{text}</p>
  }
  return (
    <p className="text-sm leading-relaxed mt-0.5">
      {timestamps.words.map((w, i) => {
        const active = currentTime >= w.start && currentTime < w.end
        const past = currentTime >= w.end
        return (
          <span
            key={i}
            className={cn(
              "rounded-sm px-0.5 transition-all duration-100 inline",
              active
                ? "bg-pink-500 text-white"
                : past
                  ? "text-foreground"
                  : "text-muted-foreground/50"
            )}
          >
            {w.word}{" "}
          </span>
        )
      })}
    </p>
  )
}

/** Editable timecode field with visible up/down clicker arrows, increments by 0.1. */
function TimecodeInput({ value, onChange, title, className }: {
  value: number
  onChange: (v: number) => void
  title?: string
  className?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const display = draft ?? value.toFixed(3)

  const nudge = (direction: 1 | -1) => {
    const next = Math.max(0, Math.round((value + direction * 0.1) * 1000) / 1000)
    onChange(next)
    setDraft(null)
  }

  return (
    <span className="inline-flex items-center">
      <input
        type="text"
        inputMode="decimal"
        value={display}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft != null) {
            const v = parseFloat(draft)
            if (!isNaN(v) && v !== value) onChange(v)
            setDraft(null)
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur()
          } else if (e.key === "ArrowUp") {
            e.preventDefault()
            nudge(1)
          } else if (e.key === "ArrowDown") {
            e.preventDefault()
            nudge(-1)
          }
        }}
        title={title}
        className={className}
      />
      <span className="inline-flex flex-col -ml-0.5 shrink-0">
        <button
          type="button"
          tabIndex={-1}
          onClick={() => nudge(1)}
          className="flex items-center justify-center w-3 h-2.5 text-muted-foreground/40 hover:text-foreground transition-colors cursor-pointer"
        >
          <ChevronUp className="w-2.5 h-2.5" />
        </button>
        <button
          type="button"
          tabIndex={-1}
          onClick={() => nudge(-1)}
          className="flex items-center justify-center w-3 h-2.5 text-muted-foreground/40 hover:text-foreground transition-colors cursor-pointer"
        >
          <ChevronDown className="w-2.5 h-2.5" />
        </button>
      </span>
    </span>
  )
}

/** Collapsible timestamp detail view — collapsed by default, expandable multi-column table. */
function WordTimestampViewer({ timestamps, onSave, isSaving, columns = 2 }: {
  timestamps: WordTimestampEntry
  onSave?: (words: WordTimestamp[], duration: number) => void
  isSaving?: boolean
  columns?: number
}) {
  const { t } = useLingui()
  const [expanded, setExpanded] = useState(false)
  const [editWords, setEditWords] = useState<WordTimestamp[] | null>(null)

  const words = editWords ?? timestamps.words
  const dirty = editWords != null

  const handleExpand = () => {
    setExpanded(!expanded)
    setEditWords(null)
  }

  const updateWord = (index: number, field: "start" | "end", value: number) => {
    const base = editWords ?? [...timestamps.words]
    const updated = base.map((w, i) => i === index ? { ...w, [field]: value } : w)
    setEditWords(updated)
  }

  const handleSave = () => {
    if (!editWords || !onSave) return
    const maxEnd = editWords.reduce((max, w) => Math.max(max, w.end), 0)
    onSave(editWords, maxEnd)
    setEditWords(null)
  }

  // Split words into column chunks for multi-column layout
  const rowCount = Math.ceil(words.length / columns)
  const columnChunks: WordTimestamp[][] = []
  for (let c = 0; c < columns; c++) {
    columnChunks.push(words.slice(c * rowCount, (c + 1) * rowCount))
  }

  const inputClass = "w-14 tabular-nums text-[10px] text-muted-foreground bg-transparent border-b border-transparent hover:border-muted-foreground/30 focus:border-pink-500 focus:outline-none transition-colors text-right appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"

  return (
    <div className="mt-1.5">
      {/* Collapsed summary row */}
      <button
        type="button"
        onClick={handleExpand}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Type className="h-3 w-3" />
        <span>{timestamps.words.length} {t`words`} · {timestamps.duration.toFixed(1)}s</span>
      </button>

      {/* Expanded multi-column table */}
      {expanded && (
        <div className="mt-1.5 border rounded-md overflow-hidden">
          <div className="max-h-56 overflow-y-auto">
            <div className={cn("grid gap-x-3", columns === 1 && "grid-cols-1", columns === 2 && "grid-cols-2", columns === 3 && "grid-cols-3", columns >= 4 && "grid-cols-4")}>
              {columnChunks.map((chunk, colIdx) => (
                <div key={colIdx} className={cn(colIdx > 0 && "border-l")}>
                  {chunk.map((w, rowIdx) => {
                    const globalIdx = colIdx * rowCount + rowIdx
                    return (
                      <div key={globalIdx} className={cn("flex items-center gap-1 px-1.5 py-0.5 text-xs", rowIdx > 0 && "border-t")}>
                        <span className="flex-1 min-w-0 truncate">{w.word}</span>
                        <TimecodeInput value={w.start} onChange={(v) => updateWord(globalIdx, "start", v)} title={t`Start`} className={inputClass} />
                        <TimecodeInput value={w.end} onChange={(v) => updateWord(globalIdx, "end", v)} title={t`End`} className={inputClass} />
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
          {/* Save/discard bar */}
          {dirty && onSave && (
            <div className="flex items-center justify-end gap-1.5 px-2 py-1.5 border-t bg-muted/30">
              <button
                type="button"
                onClick={() => setEditWords(null)}
                className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="h-3 w-3" />
                {t`Discard`}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-1 text-[10px] font-medium text-pink-600 hover:text-pink-700 transition-colors cursor-pointer disabled:opacity-40"
              >
                {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                {t`Save`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AudioAction({
  audio,
  audioLang,
  bookLabel,
  textId,
  canGenerate,
  hasGeminiKey,
  onGenerate,
  isGenerating,
  errorMessage,
  timestamps,
  onTranscribe,
  isTranscribing,
  hasOpenaiKey,
  onTimeUpdate,
  onPlayingChange,
  onSaveTimestamps,
  isSavingTimestamps,
  timestampColumns = 2,
}: {
  audio?: { fileName: string; voice: string }
  audioLang: string | null
  bookLabel: string
  textId: string
  canGenerate: boolean
  hasGeminiKey: boolean
  onGenerate: (textId: string) => void
  isGenerating: boolean
  errorMessage?: string
  timestamps?: WordTimestampEntry
  onTranscribe?: (textId: string) => void
  isTranscribing?: boolean
  hasOpenaiKey?: boolean
  onTimeUpdate?: (time: number) => void
  onPlayingChange?: (playing: boolean) => void
  onSaveTimestamps?: (words: WordTimestamp[], duration: number) => void
  isSavingTimestamps?: boolean
  timestampColumns?: number
}) {
  const { t } = useLingui()

  if (audio && audioLang) {
    return (
      <div>
        <WaveformPlayer
          key={audioLang}
          audioUrl={getAudioUrl(bookLabel, audioLang, audio.fileName)}
          onTimeUpdate={onTimeUpdate}
          onPlayingChange={onPlayingChange}
        />
        {timestamps ? (
          <WordTimestampViewer
            timestamps={timestamps}
            onSave={onSaveTimestamps ? (words, duration) => onSaveTimestamps(words, duration) : undefined}
            isSaving={isSavingTimestamps}
            columns={timestampColumns}
          />
        ) : onTranscribe && (
          <button
            type="button"
            onClick={() => onTranscribe(textId)}
            disabled={isTranscribing || !hasOpenaiKey}
            className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-default"
            title={hasOpenaiKey ? t`Generate word timestamps` : t`OpenAI key required`}
          >
            {isTranscribing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Type className="h-3 w-3" />
            )}
            {t`Timestamps`}
          </button>
        )}
      </div>
    )
  }

  if (!canGenerate) {
    return null
  }

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 px-2 text-[10px]"
        disabled={isGenerating || !hasGeminiKey}
        onClick={() => onGenerate(textId)}
        title={
          hasGeminiKey
            ? t`Generate missing Gemini audio`
            : t`Set a Gemini API key to generate audio`
        }
      >
        {isGenerating ? (
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        ) : (
          <WandSparkles className="mr-1 h-3 w-3" />
        )}
        {t`Generate`}
      </Button>
      {errorMessage && (
        <p className="max-w-44 text-[10px] leading-tight text-red-500 text-right">
          {errorMessage}
        </p>
      )}
    </div>
  )
}
