import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Check, ImagePlus, X, Search, Loader2 } from "lucide-react"
import { api, BASE_URL } from "@/api/client"
import { useLingui } from "@lingui/react/macro"

interface ReplaceFromBookDialogProps {
  bookLabel: string
  currentImageId: string
  onSelect: (imageId: string) => void
  onClose: () => void
}

/**
 * Dialog for picking an existing book image to replace the current one.
 * Single-select variant of the image picker from AddImageDialog.
 */
export function ReplaceFromBookDialog({
  bookLabel,
  currentImageId,
  onSelect,
  onClose,
}: ReplaceFromBookDialogProps) {
  const { t } = useLingui()
  const [filter, setFilter] = useState("")
  const [selected, setSelected] = useState<string | null>(null)

  const imagesQuery = useQuery({
    queryKey: ["books", bookLabel, "images"],
    queryFn: () => api.listBookImages(bookLabel),
    staleTime: 30_000,
  })

  const selectableImages = imagesQuery.data?.images
    .filter((img) => img.source !== "page")
    .filter((img) => img.imageId !== currentImageId)
    .filter((img) => !filter || img.imageId.toLowerCase().includes(filter.toLowerCase()))

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-8">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0">
          <div className="flex items-center gap-2">
            <ImagePlus className="h-4 w-4 text-blue-500" />
            <h2 className="text-sm font-semibold">{t`Replace from Book`}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-accent transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t`Filter by image ID...`}
              className="w-full text-sm border rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              autoFocus
            />
          </div>

          {imagesQuery.isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {selectableImages && selectableImages.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">
              {filter ? t`No images match your filter` : t`No other images in this book`}
            </p>
          )}

          {selectableImages && selectableImages.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {selectableImages.map((img) => {
                const isSelected = selected === img.imageId
                return (
                  <button
                    key={img.imageId}
                    type="button"
                    onClick={() => setSelected(isSelected ? null : img.imageId)}
                    className={`group relative rounded border overflow-hidden bg-card flex flex-col items-center min-h-[60px] transition-all cursor-pointer ${
                      isSelected
                        ? "ring-2 ring-blue-500 border-blue-500"
                        : "hover:ring-2 hover:ring-blue-500/50"
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute top-1 right-1 z-10 h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    )}
                    <img
                      src={`${BASE_URL}/books/${bookLabel}/images/${img.imageId}`}
                      alt={img.imageId}
                      className="max-w-full h-auto block"
                      loading="lazy"
                    />
                    <div className="px-1.5 py-0.5 border-t bg-muted/30 w-full mt-auto">
                      <span className="text-[9px] text-muted-foreground truncate block">
                        {img.imageId}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t shrink-0">
          <p className="text-[10px] text-muted-foreground">
            {selected ? t`1 image selected` : t`Click an image to select`}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-medium rounded px-3 py-1.5 bg-muted hover:bg-accent transition-colors cursor-pointer"
            >
              {t`Cancel`}
            </button>
            <button
              type="button"
              onClick={() => selected && onSelect(selected)}
              disabled={!selected}
              className="flex items-center gap-1 text-xs font-medium rounded px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white cursor-pointer transition-colors disabled:opacity-50"
            >
              <ImagePlus className="h-3 w-3" />
              {t`Replace`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
