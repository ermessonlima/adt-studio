import { FileDown, Loader2, BookOpen, AlertCircle, GraduationCap } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { Button } from "@/components/ui/button"
import { useBookRun } from "@/hooks/use-book-run"
import { useExportWatcher } from "@/hooks/use-export-watcher"

export function ExportView({ bookLabel }: { bookLabel: string }) {
  const { startExport, isPreparing, preparingFormat, error } = useExportWatcher()
  const { stageState } = useBookRun()
  const storyboardDone = stageState("storyboard") === "done"

  const adtError = error?.format === "book" ? error.message : null
  const scormError = error?.format === "scorm" ? error.message : null
  const webpubError = error?.format === "webpub" ? error.message : null

  if (!storyboardDone) {
    return (
      <div className="p-6 max-w-xl flex flex-col items-center gap-3 text-center">
        <AlertCircle className="w-8 h-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          <Trans>A storyboard must be built before exporting.</Trans>
        </p>
        <p className="text-sm text-muted-foreground">
          <Trans>Run the pipeline through at least the</Trans>{" "}
          <span className="font-medium text-foreground"><Trans>Storyboard</Trans></span>{" "}
          <Trans>stage first.</Trans>
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-xl flex flex-col gap-6">
      {/* ADT Export */}
      <section className="rounded-lg border p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <FileDown className="w-5 h-5 text-emerald-600" />
          <h3 className="text-sm font-semibold"><Trans>ADT Export</Trans></h3>
        </div>
        <p className="text-sm text-muted-foreground">
          <Trans>Export the complete Accessible Digital Textbook as a ZIP archive. Includes all HTML pages, images, audio files, quizzes, and the compiled web application — ready to upload to a distribution platform or open locally.</Trans>
        </p>
        <div className="flex flex-col gap-1">
          <Button
            variant="outline"
            size="sm"
            className={
              adtError
                ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100 w-fit"
                : "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100 w-fit"
            }
            onClick={() => startExport("book")}
            disabled={isPreparing}
          >
            {preparingFormat === "book" ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileDown className="mr-1.5 h-3.5 w-3.5" />
            )}
            {adtError ? <Trans>Retry Export</Trans> : <Trans>Export ADT</Trans>}
          </Button>
          {adtError && (
            <p className="text-[11px] leading-tight text-red-500">
              {adtError}
            </p>
          )}
        </div>
      </section>

      {/* SCORM Export */}
      <section className="rounded-lg border p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-amber-600" />
          <h3 className="text-sm font-semibold"><Trans>SCORM Export</Trans></h3>
        </div>
        <p className="text-sm text-muted-foreground">
          <Trans>Export as a SCORM 1.2 package for upload to a Learning Management System (LMS). Includes activity completion tracking and offline support.</Trans>
        </p>
        <div className="flex flex-col gap-1">
          <Button
            variant="outline"
            size="sm"
            className={
              scormError
                ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100 w-fit"
                : "bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100 w-fit"
            }
            onClick={() => startExport("scorm")}
            disabled={isPreparing}
          >
            {preparingFormat === "scorm" ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <GraduationCap className="mr-1.5 h-3.5 w-3.5" />
            )}
            {scormError ? <Trans>Retry Export</Trans> : <Trans>Export SCORM</Trans>}
          </Button>
          {scormError && (
            <p className="text-[11px] leading-tight text-red-500">
              {scormError}
            </p>
          )}
        </div>
      </section>

      {/* WebPub Export */}
      <section className="rounded-lg border p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-600" />
          <h3 className="text-sm font-semibold"><Trans>WebPub Export</Trans></h3>
          <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 leading-none">
            <Trans>Beta</Trans>
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          <Trans>Export the book as a Readium WebPub package — a standards-based format for distributing digital publications on the web. Suitable for reading systems that support the Readium Web Publication Manifest specification.</Trans>
        </p>
        <div className="flex flex-col gap-1">
          <Button
            variant="outline"
            size="sm"
            className={
              webpubError
                ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100 w-fit"
                : "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100 w-fit"
            }
            onClick={() => startExport("webpub")}
            disabled={isPreparing}
          >
            {preparingFormat === "webpub" ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <BookOpen className="mr-1.5 h-3.5 w-3.5" />
            )}
            {webpubError ? <Trans>Retry Export</Trans> : <Trans>Export WebPub</Trans>}
          </Button>
          {webpubError && (
            <p className="text-[11px] leading-tight text-red-500">
              {webpubError}
            </p>
          )}
        </div>
      </section>

    </div>
  )
}
