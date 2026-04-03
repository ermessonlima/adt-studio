import { useCallback, useMemo, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import { Upload, Trash2, Video, AlertCircle, Loader2, ArrowUp, ArrowDown, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useBookRun } from "@/hooks/use-book-run"
import { usePages } from "@/hooks/use-pages"
import {
  useSignLanguageVideos,
  useUploadSignLanguageVideo,
  useAssignSignLanguageVideo,
  useDeleteSignLanguageVideo,
  useDeleteAllSignLanguageVideos,
} from "@/hooks/use-sign-language-videos"
import { getSignLanguageVideoUrl } from "@/api/client"
import type { SignLanguageVideo } from "@/api/client"

type SortField = "name" | "size" | "date"
type SortDir = "asc" | "desc"

export function SignLanguageView({ bookLabel }: { bookLabel: string }) {
  const { i18n, t } = useLingui()
  const { stageState } = useBookRun()
  const storyboardDone = stageState("storyboard") === "done"
  const { data: videosData, isLoading } = useSignLanguageVideos(bookLabel)
  const { data: pages } = usePages(bookLabel)
  const uploadMutation = useUploadSignLanguageVideo(bookLabel)
  const assignMutation = useAssignSignLanguageVideo(bookLabel)
  const deleteMutation = useDeleteSignLanguageVideo(bookLabel)
  const deleteAllMutation = useDeleteAllSignLanguageVideos(bookLabel)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [playingVideo, setPlayingVideo] = useState<SignLanguageVideo | null>(null)
  const [replaceConfirm, setReplaceConfirm] = useState<{ existing: SignLanguageVideo; file: File } | null>(null)

  const videos = videosData?.videos ?? []

  const sortedVideos = useMemo(() => {
    const sorted = [...videos]
    sorted.sort((a, b) => {
      let cmp = 0
      if (sortField === "name") cmp = a.originalName.localeCompare(b.originalName)
      else if (sortField === "size") cmp = a.sizeBytes - b.sizeBytes
      else if (sortField === "date") cmp = a.createdAt.localeCompare(b.createdAt)
      return sortDir === "asc" ? cmp : -cmp
    })
    return sorted
  }, [videos, sortField, sortDir])

  const toggleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortField(field)
      setSortDir("asc")
    }
  }, [sortField])

  if (!storyboardDone) {
    return (
      <div className="p-6 max-w-xl flex flex-col items-center gap-3 text-center">
        <AlertCircle className="w-8 h-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          <Trans>A storyboard must be built before adding sign language videos.</Trans>
        </p>
        <p className="text-sm text-muted-foreground">
          <Trans>Run the pipeline through at least the</Trans>{" "}
          <span className="font-medium text-foreground"><Trans>Storyboard</Trans></span>{" "}
          <Trans>stage first.</Trans>
        </p>
      </div>
    )
  }

  function handleUpload() {
    fileInputRef.current?.click()
  }

  function processUpload(file: File) {
    const existing = videos.find((v) => v.originalName === file.name)
    if (existing) {
      setReplaceConfirm({ existing, file })
    } else {
      uploadMutation.mutate(file)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return
    for (const file of Array.from(files)) {
      processUpload(file)
    }
    e.target.value = ""
  }

  function confirmReplace() {
    if (!replaceConfirm) return
    const { existing, file } = replaceConfirm
    deleteMutation.mutate(existing.videoId, {
      onSuccess: () => uploadMutation.mutate(file),
    })
    setReplaceConfirm(null)
  }

  function handleAssign(videoId: string, sectionId: string) {
    assignMutation.mutate({ videoId, sectionId: sectionId === "__unassigned__" ? null : sectionId })
  }

  // Build a flat list of assignable sections from all pages
  const sectionOptions = useMemo(() => {
    if (!pages) return []
    return pages.flatMap((page) => {
      const sections = page.sections ?? []
      if (sections.length <= 1) {
        // Single section — show as "Page X"
        const sectionId = sections[0]?.sectionId ?? page.pageId
        return [{ sectionId, label: i18n._(msg`Page ${page.pageNumber}`) + (page.textPreview ? ` — ${page.textPreview.slice(0, 30)}` : "") }]
      }
      // Multiple sections — show as "Page X — Section Y"
      return sections.map((sec, i) => ({
        sectionId: sec.sectionId,
        label: i18n._(msg`Page ${page.pageNumber} — Section ${i + 1}`),
      }))
    })
  }, [pages, i18n])

  function handleDelete(videoId: string) {
    setDeletingId(videoId)
    deleteMutation.mutate(videoId, {
      onSettled: () => setDeletingId(null),
    })
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return t`${bytes} B`
    if (bytes < 1024 * 1024) return t`${(bytes / 1024).toFixed(1)} KB`
    return t`${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const SortIcon = sortDir === "asc" ? ArrowUp : ArrowDown

  return (
    <div className="flex flex-col h-full">
      {/* Header actions */}
      <div className="shrink-0 px-4 py-3 border-b flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <Trans>Upload sign language videos and assign them to sections.</Trans>
        </p>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm,.mp4,.webm"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          {videos.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => deleteAllMutation.mutate()}
              disabled={deleteAllMutation.isPending}
            >
              {deleteAllMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-1.5" />
              )}
              <Trans>Remove All</Trans>
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleUpload}
            disabled={uploadMutation.isPending}
          >
            {uploadMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-1.5" />
            )}
            <Trans>Add Videos</Trans>
          </Button>
        </div>
      </div>

      {/* Video list */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-4">
            <Video className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              <Trans>No sign language videos uploaded yet.</Trans>
            </p>
            <p className="text-xs text-muted-foreground/70">
              <Trans>Click "Add Videos" to upload MP4 or WebM files.</Trans>
            </p>
          </div>
        ) : (
          <div>
            {/* Sort header */}
            <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/30 text-xs text-muted-foreground font-medium">
              <div className="shrink-0 w-32" />
              <button type="button" className="flex-1 min-w-0 flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => toggleSort("name")}>
                <Trans>Name</Trans>
                {sortField === "name" && <SortIcon className="w-3 h-3" />}
              </button>
              <button type="button" className="shrink-0 w-20 flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => toggleSort("size")}>
                <Trans>Size</Trans>
                {sortField === "size" && <SortIcon className="w-3 h-3" />}
              </button>
              <div className="shrink-0 w-48">
                <Trans>Section</Trans>
              </div>
              <div className="shrink-0 w-8" />
            </div>

            {/* Rows */}
            <div className="divide-y">
              {sortedVideos.map((video) => (
                <div
                  key={video.videoId}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  {/* Video preview — click to play */}
                  <button
                    type="button"
                    className="shrink-0 w-32 h-20 rounded overflow-hidden bg-black cursor-pointer ring-1 ring-border hover:ring-2 hover:ring-cyan-500 transition-shadow"
                    onClick={() => setPlayingVideo(video)}
                    title={i18n._(msg`Play video`)}
                  >
                    <video
                      src={getSignLanguageVideoUrl(bookLabel, video.videoId)}
                      className="w-full h-full object-contain pointer-events-none"
                      muted
                      preload="metadata"
                    />
                  </button>

                  {/* Name */}
                  <button
                    type="button"
                    className="flex-1 min-w-0 flex flex-col gap-1 text-left cursor-pointer hover:opacity-70 transition-opacity"
                    onClick={() => setPlayingVideo(video)}
                  >
                    <p className="text-sm font-medium truncate" title={video.originalName}>
                      {video.originalName}
                    </p>
                  </button>

                  {/* Size */}
                  <div className="shrink-0 w-20">
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(video.sizeBytes)}
                    </p>
                  </div>

                  {/* Section assignment */}
                  <div className="shrink-0 w-48">
                    <Select
                      value={video.sectionId ?? "__unassigned__"}
                      onValueChange={(val) => handleAssign(video.videoId, val)}
                      disabled={assignMutation.isPending}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder={i18n._(msg`Assign to section...`)} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__unassigned__">
                          {i18n._(msg`Unassigned`)}
                        </SelectItem>
                        {sectionOptions.map((opt) => (
                          <SelectItem key={opt.sectionId} value={opt.sectionId}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Delete */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(video.videoId)}
                    disabled={deletingId === video.videoId}
                    title={i18n._(msg`Delete video`)}
                  >
                    {deletingId === video.videoId ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Video player dialog */}
      <Dialog open={!!playingVideo} onOpenChange={(open) => { if (!open) setPlayingVideo(null) }}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="text-sm truncate">{playingVideo?.originalName}</DialogTitle>
          </DialogHeader>
          {playingVideo && (
            <div className="px-4 pb-4">
              <video
                src={getSignLanguageVideoUrl(bookLabel, playingVideo.videoId)}
                className="w-full rounded"
                controls
                autoPlay
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Replace confirmation dialog */}
      <Dialog open={!!replaceConfirm} onOpenChange={(open) => { if (!open) setReplaceConfirm(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle><Trans>Replace Video?</Trans></DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <Trans>A video named "{replaceConfirm?.file.name}" already exists. Do you want to replace it?</Trans>
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => setReplaceConfirm(null)}>
              <Trans>Cancel</Trans>
            </Button>
            <Button size="sm" onClick={confirmReplace}>
              <Trans>Replace</Trans>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
