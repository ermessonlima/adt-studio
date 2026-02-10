import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

interface ImagePruningEditorProps {
  images: Array<{
    imageId: string
    isPruned: boolean
    reason?: string
  }>
  onChange: (images: ImagePruningEditorProps["images"]) => void
}

export function ImagePruningEditor({ images, onChange }: ImagePruningEditorProps) {
  if (images.length === 0) {
    return <p className="text-sm text-muted-foreground">No images on this page.</p>
  }

  const togglePruned = (index: number) => {
    const newImages = images.map((img, i) => {
      if (i !== index) return img
      return { ...img, isPruned: !img.isPruned }
    })
    onChange(newImages)
  }

  return (
    <div className="space-y-2">
      {images.map((img, i) => (
        <div
          key={img.imageId}
          className={`flex items-center justify-between rounded border p-2 ${img.isPruned ? "opacity-60" : ""}`}
        >
          <div>
            <span className={`text-sm ${img.isPruned ? "line-through" : ""}`}>{img.imageId}</span>
            {img.reason && (
              <p className="text-xs text-muted-foreground">{img.reason}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor={`img-prune-${i}`} className="text-xs">Pruned</Label>
            <Switch
              id={`img-prune-${i}`}
              checked={img.isPruned}
              onCheckedChange={() => togglePruned(i)}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
