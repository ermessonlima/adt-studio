import { useState, useRef, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"

interface CropRegion {
  cropLeft: number
  cropTop: number
  cropRight: number
  cropBottom: number
}

interface ImageCropDialogProps {
  /** Image URL to crop */
  imageSrc: string
  /** Called with the cropped image blob */
  onApply: (blob: Blob) => Promise<void>
  /** Called when user cancels */
  onClose: () => void
}

const EDGE_SIZE = 8

type DragMode =
  | { type: "move"; startX: number; startY: number; origRegion: CropRegion }
  | { type: "resize"; edge: string; startX: number; startY: number; origRegion: CropRegion }
  | { type: "draw"; startX: number; startY: number }

/**
 * Full-screen dialog for cropping images with a draggable/resizable bounding box.
 * Draw a new box by clicking the image background, or adjust the existing box
 * by dragging to move or dragging edges/corners to resize.
 */
export function ImageCropDialog({ imageSrc, onApply, onClose }: ImageCropDialogProps) {
  const { t } = useLingui()
  const [region, setRegion] = useState<CropRegion | null>(null)
  const [imageNatural, setImageNatural] = useState<{ w: number; h: number } | null>(null)
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number } | null>(null)
  const [applying, setApplying] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragMode | null>(null)
  const imageRef = useRef<HTMLDivElement>(null)
  // Single image element shared by display and canvas crop — avoids double-load mismatches
  const loadedImageRef = useRef<HTMLImageElement | null>(null)
  // Ref to always have the latest scale available in event handlers
  const scaleRef = useRef(1)

  // Load image once with crossOrigin for canvas compatibility, reuse for everything
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      loadedImageRef.current = img
      const nat = { w: img.naturalWidth, h: img.naturalHeight }
      setImageNatural(nat)
      setRegion({
        cropLeft: 0,
        cropTop: 0,
        cropRight: nat.w,
        cropBottom: nat.h,
      })
    }
    img.src = imageSrc
  }, [imageSrc])

  // Compute display size to fit image in container
  useEffect(() => {
    if (!imageNatural) return
    const update = () => {
      const container = containerRef.current
      if (!container) return
      const maxW = container.clientWidth - 48
      const maxH = container.clientHeight - 48
      if (maxW <= 0 || maxH <= 0) return
      const s = Math.min(maxW / imageNatural.w, maxH / imageNatural.h, 1)
      setDisplaySize({ w: imageNatural.w * s, h: imageNatural.h * s })
    }
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [imageNatural])

  const scale = displaySize && imageNatural ? displaySize.w / imageNatural.w : 1
  // Keep ref in sync so mouse handlers always see the latest value
  scaleRef.current = scale

  const getEdge = (e: React.MouseEvent, rect: DOMRect): string => {
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const w = rect.width
    const h = rect.height
    const top = y < EDGE_SIZE
    const bottom = y > h - EDGE_SIZE
    const left = x < EDGE_SIZE
    const right = x > w - EDGE_SIZE
    if (top && left) return "nw"
    if (top && right) return "ne"
    if (bottom && left) return "sw"
    if (bottom && right) return "se"
    if (top) return "n"
    if (bottom) return "s"
    if (left) return "w"
    if (right) return "e"
    return "move"
  }

  const getCursor = (edge: string) => {
    const map: Record<string, string> = {
      nw: "nwse-resize",
      se: "nwse-resize",
      ne: "nesw-resize",
      sw: "nesw-resize",
      n: "ns-resize",
      s: "ns-resize",
      e: "ew-resize",
      w: "ew-resize",
      move: "grab",
    }
    return map[edge] ?? "default"
  }

  const handleBoxMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!region) return

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const edge = getEdge(e, rect)

    if (edge === "move") {
      dragRef.current = { type: "move", startX: e.clientX, startY: e.clientY, origRegion: { ...region } }
    } else {
      dragRef.current = { type: "resize", edge, startX: e.clientX, startY: e.clientY, origRegion: { ...region } }
    }
  }

  // Click on image background to start drawing a new box
  const handleImageMouseDown = (e: React.MouseEvent) => {
    if (!imageNatural || !imageRef.current) return
    e.preventDefault()
    const s = scaleRef.current
    dragRef.current = { type: "draw", startX: e.clientX, startY: e.clientY }
    const imgRect = imageRef.current.getBoundingClientRect()
    const px = Math.round((e.clientX - imgRect.left) / s)
    const py = Math.round((e.clientY - imgRect.top) / s)
    const clampedX = Math.max(0, Math.min(imageNatural.w, px))
    const clampedY = Math.max(0, Math.min(imageNatural.h, py))
    setRegion({ cropLeft: clampedX, cropTop: clampedY, cropRight: clampedX, cropBottom: clampedY })
  }

  // Global mouse move/up for drag
  useEffect(() => {
    if (!imageNatural) return
    const iw = imageNatural.w
    const ih = imageNatural.h

    const handleMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const s = scaleRef.current

      if (drag.type === "draw") {
        const imgEl = imageRef.current
        if (!imgEl) return
        const imgRect = imgEl.getBoundingClientRect()
        const startPx = Math.max(0, Math.min(iw, Math.round((drag.startX - imgRect.left) / s)))
        const startPy = Math.max(0, Math.min(ih, Math.round((drag.startY - imgRect.top) / s)))
        const curPx = Math.max(0, Math.min(iw, Math.round((e.clientX - imgRect.left) / s)))
        const curPy = Math.max(0, Math.min(ih, Math.round((e.clientY - imgRect.top) / s)))
        setRegion({
          cropLeft: Math.min(startPx, curPx),
          cropTop: Math.min(startPy, curPy),
          cropRight: Math.max(startPx, curPx),
          cropBottom: Math.max(startPy, curPy),
        })
        return
      }

      const dx = (e.clientX - drag.startX) / s
      const dy = (e.clientY - drag.startY) / s
      const orig = drag.origRegion

      if (drag.type === "move") {
        const w = orig.cropRight - orig.cropLeft
        const h = orig.cropBottom - orig.cropTop
        let newLeft = orig.cropLeft + dx
        let newTop = orig.cropTop + dy
        newLeft = Math.max(0, Math.min(iw - w, newLeft))
        newTop = Math.max(0, Math.min(ih - h, newTop))
        setRegion({
          cropLeft: Math.round(newLeft),
          cropTop: Math.round(newTop),
          cropRight: Math.min(iw, Math.round(newLeft + w)),
          cropBottom: Math.min(ih, Math.round(newTop + h)),
        })
      } else {
        const edge = drag.edge
        let { cropLeft, cropTop, cropRight, cropBottom } = orig
        if (edge.includes("w")) cropLeft = Math.max(0, Math.min(cropRight - 10, orig.cropLeft + dx))
        if (edge.includes("e")) cropRight = Math.min(iw, Math.max(cropLeft + 10, orig.cropRight + dx))
        if (edge.includes("n")) cropTop = Math.max(0, Math.min(cropBottom - 10, orig.cropTop + dy))
        if (edge.includes("s")) cropBottom = Math.min(ih, Math.max(cropTop + 10, orig.cropBottom + dy))
        setRegion({
          cropLeft: Math.round(cropLeft),
          cropTop: Math.round(cropTop),
          cropRight: Math.min(iw, Math.round(cropRight)),
          cropBottom: Math.min(ih, Math.round(cropBottom)),
        })
      }
    }

    const handleMouseUp = () => {
      dragRef.current = null
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [imageNatural])

  const handleApply = async () => {
    if (!region || !loadedImageRef.current) return
    const cropW = region.cropRight - region.cropLeft
    const cropH = region.cropBottom - region.cropTop
    if (cropW < 1 || cropH < 1) return
    setApplying(true)
    try {
      const blob = await getCroppedImage(loadedImageRef.current, region)
      await onApply(blob)
      // Don't setApplying(false) here — onApply closes the dialog (unmounts this component).
      // Calling setState on an unmounting component causes React DOM reconciliation errors.
    } catch {
      // On error the dialog stays open — reset so user can retry
      setApplying(false)
    }
  }

  const hasValidRegion = region && (region.cropRight - region.cropLeft) > 0 && (region.cropBottom - region.cropTop) > 0

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-background border-b shrink-0">
        <h2 className="text-sm font-medium">{t`Crop Image`}</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            className="text-xs font-medium rounded px-3 py-1.5 bg-muted hover:bg-accent transition-colors cursor-pointer disabled:opacity-50"
          >
            <Trans>Cancel</Trans>
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={applying || !hasValidRegion}
            className="flex items-center gap-1 text-xs font-medium rounded px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white cursor-pointer transition-colors disabled:opacity-50"
          >
            {applying && <Loader2 className="h-3 w-3 animate-spin" />}
            <Trans>Apply</Trans>
          </button>
        </div>
      </div>

      {/* Image + bounding box */}
      <div ref={containerRef} className="flex-1 flex items-center justify-center overflow-hidden">
        {displaySize && (
          <div
            ref={imageRef}
            className="relative select-none"
            style={{ width: displaySize.w, height: displaySize.h, cursor: "crosshair" }}
            onMouseDown={handleImageMouseDown}
          >
            <img
              src={imageSrc}
              crossOrigin="anonymous"
              alt={t`Crop preview`}
              className="w-full h-full block pointer-events-none"
              draggable={false}
            />
            {/* Dimmed overlay outside crop region */}
            {region && hasValidRegion && (
              <>
                <div
                  className="absolute inset-0 bg-black/50 pointer-events-none"
                  style={{
                    clipPath: `polygon(
                      0% 0%, 100% 0%, 100% 100%, 0% 100%,
                      0% 0%,
                      ${region.cropLeft * scale}px ${region.cropTop * scale}px,
                      ${region.cropLeft * scale}px ${region.cropBottom * scale}px,
                      ${region.cropRight * scale}px ${region.cropBottom * scale}px,
                      ${region.cropRight * scale}px ${region.cropTop * scale}px,
                      ${region.cropLeft * scale}px ${region.cropTop * scale}px,
                      0% 0%
                    )`,
                  }}
                />
                {/* Crop box */}
                <div
                  className="absolute"
                  style={{
                    left: region.cropLeft * scale,
                    top: region.cropTop * scale,
                    width: (region.cropRight - region.cropLeft) * scale,
                    height: (region.cropBottom - region.cropTop) * scale,
                    border: "2px solid #3b82f6",
                    boxSizing: "border-box",
                    cursor: dragRef.current?.type === "move" ? "grabbing" : "grab",
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={handleBoxMouseDown}
                  onMouseMove={(e) => {
                    if (dragRef.current) return
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                    const edge = getEdge(e, rect)
                    ;(e.currentTarget as HTMLElement).style.cursor = getCursor(edge)
                  }}
                >
                  {/* Resize handles at corners */}
                  <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-blue-500 border border-white rounded-sm cursor-nwse-resize" />
                  <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 border border-white rounded-sm cursor-nesw-resize" />
                  <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 bg-blue-500 border border-white rounded-sm cursor-nesw-resize" />
                  <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-blue-500 border border-white rounded-sm cursor-nwse-resize" />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Info bar */}
      <div className="bg-background border-t shrink-0 px-4 py-2 flex items-center gap-4 text-[10px] text-muted-foreground">
        <span>
          <Trans>Drag to move the crop box, drag edges/corners to resize. Click and drag on the image to draw a new box.</Trans>
        </span>
        {region && hasValidRegion && (
          <span className="ml-auto font-mono">
            {region.cropRight - region.cropLeft} × {region.cropBottom - region.cropTop}px
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Crop an image using canvas and return as a Blob.
 * Uses the same Image element that was loaded for dimension detection,
 * guaranteeing coordinate consistency.
 * Output is scaled to the original image's full width so that
 * the cropped image maintains the same display size in the layout.
 */
function getCroppedImage(image: HTMLImageElement, crop: CropRegion): Promise<Blob> {
  const iw = image.naturalWidth
  const ih = image.naturalHeight

  // Clamp coordinates to actual image bounds (defensive against rounding overshoot)
  const left = Math.max(0, Math.min(iw, crop.cropLeft))
  const top = Math.max(0, Math.min(ih, crop.cropTop))
  const right = Math.max(left, Math.min(iw, crop.cropRight))
  const bottom = Math.max(top, Math.min(ih, crop.cropBottom))

  const cropW = right - left
  const cropH = bottom - top
  if (cropW <= 0 || cropH <= 0) {
    return Promise.reject(new Error("Crop region is empty"))
  }

  // Scale output to original image width so display size is preserved in layouts
  const scaleUp = iw / cropW
  const outputWidth = iw
  const outputHeight = Math.round(cropH * scaleUp)

  const canvas = document.createElement("canvas")
  canvas.width = outputWidth
  canvas.height = outputHeight
  const ctx = canvas.getContext("2d")!

  ctx.drawImage(
    image,
    left, top, cropW, cropH,
    0, 0, outputWidth, outputHeight
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error("Canvas toBlob failed"))
      },
      "image/png"
    )
  })
}
