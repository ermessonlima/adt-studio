import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { TextCatalogEntry } from "@/api/client"
import { useActiveConfig } from "@/hooks/use-debug"
import { useStepHeader } from "../StepViewRouter"
import { cn } from "@/lib/utils"

export function TranslationsView({ bookLabel }: { bookLabel: string }) {
  const { setExtra } = useStepHeader()
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const { data: catalog, isLoading } = useQuery({
    queryKey: ["books", bookLabel, "text-catalog"],
    queryFn: () => api.getTextCatalog(bookLabel),
    enabled: !!bookLabel,
  })

  const merged = activeConfigData?.merged as Record<string, unknown> | undefined
  const outputLanguages = (merged?.output_languages as string[] | undefined) ?? []
  const editingLanguage = (merged?.editing_language as string | undefined) ?? "English"

  const [selectedLang, setSelectedLang] = useState<string | null>(null)

  // Default to first output language when available
  useEffect(() => {
    if (outputLanguages.length > 0 && !selectedLang) {
      setSelectedLang(outputLanguages[0])
    }
  }, [outputLanguages.length])

  const entries = catalog?.entries ?? []
  const hasTranslations = outputLanguages.length > 0

  // Get translated entries for selected language
  const translatedEntries = selectedLang ? catalog?.translations?.[selectedLang]?.entries ?? [] : []
  const translatedMap = new Map(translatedEntries.map((e) => [e.id, e.text]))

  useEffect(() => {
    if (!catalog) return
    setExtra(
      <div className="flex items-center gap-1.5 ml-auto">
        <span className="text-[10px] bg-white/20 rounded-full px-2 py-0.5">{entries.length} texts</span>
        {hasTranslations && (
          <span className="text-[10px] bg-white/20 rounded-full px-2 py-0.5">{outputLanguages.length} languages</span>
        )}
      </div>
    )
    return () => setExtra(null)
  }, [catalog, entries.length, outputLanguages.length, hasTranslations])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span className="text-sm">Loading text catalog...</span>
      </div>
    )
  }

  if (!catalog || entries.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-muted-foreground">No text catalog generated yet.</p>
        <p className="text-xs text-muted-foreground mt-1">Run the master pipeline to build the text catalog.</p>
      </div>
    )
  }

  // No output languages — just show source entries
  if (!hasTranslations) {
    return (
      <div className="space-y-1">
        {entries.map((entry) => (
          <EntryRow key={entry.id} entry={entry} />
        ))}
      </div>
    )
  }

  // With output languages — language tabs + side-by-side
  return (
    <div className="space-y-3">
      {/* Language tabs */}
      <div className="flex gap-1.5">
        {outputLanguages.map((lang) => {
          const translated = catalog.translations?.[lang]?.entries ?? []
          const progress = entries.length > 0 ? Math.round((translated.length / entries.length) * 100) : 0
          return (
            <button
              key={lang}
              type="button"
              onClick={() => setSelectedLang(lang)}
              className={cn(
                "text-xs h-7 px-3 rounded-md font-medium transition-colors cursor-pointer",
                selectedLang === lang
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              )}
            >
              {lang}
              <span className={cn(
                "ml-1.5 text-[10px]",
                selectedLang === lang ? "opacity-60" : "opacity-50"
              )}>
                {progress}%
              </span>
            </button>
          )
        })}
      </div>

      {/* Side-by-side */}
      <div className="space-y-1">
        <div className="grid grid-cols-2 gap-3 px-3 py-1.5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{editingLanguage}</span>
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{selectedLang}</span>
        </div>
        {entries.map((entry) => {
          const translated = translatedMap.get(entry.id)
          return (
            <div key={entry.id} className="grid grid-cols-2 gap-3 px-3 py-2.5 rounded-md border bg-card">
              <div>
                <span className="text-[10px] text-muted-foreground">{entry.id}</span>
                <p className="text-sm leading-relaxed mt-0.5">{entry.text}</p>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground">&nbsp;</span>
                <p className={cn("text-sm leading-relaxed mt-0.5", !translated && "text-muted-foreground italic")}>
                  {translated || "Pending..."}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EntryRow({ entry }: { entry: TextCatalogEntry }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-md border bg-card">
      <span className="shrink-0 text-[10px] font-medium text-muted-foreground w-32 truncate pt-0.5" title={entry.id}>
        {entry.id}
      </span>
      <p className="text-sm leading-relaxed flex-1 min-w-0">{entry.text}</p>
    </div>
  )
}
