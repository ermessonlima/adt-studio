import { useState, useRef, useEffect, useCallback } from "react"
import { Loader2 } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"

interface Point {
  x: number
  y: number
}

interface ImageCropDialogProps {
  /** Image URL to crop */
  imageSrc: string
  /** Called with the cropped image blob */
  onApply: (blob: Blob) => Promise<void>
  /** Called when user cancels */
  onClose: () => void
}

const VERTEX_RADIUS = 6
const MIDPOINT_RADIUS = 4
const MIN_POINTS = 3

type DragMode =
  | { type: "vertex"; index: number; startX: number; startY: number; origPoints: Point[] }
  | { type: "edge"; index: number; startX: number; startY: number; origPoints: Point[] }

/**
 * Full-screen dialog for cropping images with a draggable polygon.
 * Starts as a rectangle (4 corners). Users can drag vertices to reshape,
 * click midpoints on edges to add new vertices, or right-click vertices to remove them.
 * The output is a rectangular PNG cropped to the polygon's bounding box,
 * with transparent pixels outside the polygon.
 */
export function ImageCropDialog({ imageSrc, onApply, onClose }: ImageCropDialogProps) {
  const { t } = useLingui()
  const [points, setPoints] = useState<Point[]>([])
  const [imageNatural, setImageNatural] = useState<{ w: number; h: number } | null>(null)
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number } | null>(null)
  const [applying, setApplying] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragMode | null>(null)
  const imageRef = useRef<HTMLDivElement>(null)
  const loadedImageRef = useRef<HTMLImageElement | null>(null)
  const scaleRef = useRef(1)

  // Load image once with crossOrigin for canvas compatibility
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      loadedImageRef.current = img
      const nat = { w: img.naturalWidth, h: img.naturalHeight }
      setImageNatural(nat)
      // Initialize with rectangle covering full image
      setPoints([
        { x: 0, y: 0 },
        { x: nat.w, y: 0 },
        { x: nat.w, y: nat.h },
        { x: 0, y: nat.h },
      ])
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
  scaleRef.current = scale

  // Compute midpoints between consecutive vertices (for "add point" handles)
  const midpoints = points.length >= MIN_POINTS
    ? points.map((p, i) => {
        const next = points[(i + 1) % points.length]
        return { x: (p.x + next.x) / 2, y: (p.y + next.y) / 2 }
      })
    : []

  const handleVertexMouseDown = useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = {
      type: "vertex",
      index,
      startX: e.clientX,
      startY: e.clientY,
      origPoints: points.map((p) => ({ ...p })),
    }
  }, [points])

  const handleVertexRightClick = useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault()
    e.stopPropagation()
    if (points.length <= MIN_POINTS) return
    setPoints((prev) => prev.filter((_, i) => i !== index))
  }, [points.length])

  const handleEdgeMouseDown = useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = {
      type: "edge",
      index,
      startX: e.clientX,
      startY: e.clientY,
      origPoints: points.map((p) => ({ ...p })),
    }
  }, [points])

  const handleMidpointClick = useCallback((e: React.MouseEvent, afterIndex: number) => {
    e.preventDefault()
    e.stopPropagation()
    const mid = midpoints[afterIndex]
    if (!mid) return
    setPoints((prev) => {
      const next = [...prev]
      next.splice(afterIndex + 1, 0, { x: Math.round(mid.x), y: Math.round(mid.y) })
      return next
    })
  }, [midpoints])

  // Global mouse move/up for vertex dragging
  useEffect(() => {
    if (!imageNatural) return
    const iw = imageNatural.w
    const ih = imageNatural.h

    const handleMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const s = scaleRef.current
      const dx = (e.clientX - drag.startX) / s
      const dy = (e.clientY - drag.startY) / s

      if (drag.type === "vertex") {
        const orig = drag.origPoints[drag.index]
        const newX = Math.max(0, Math.min(iw, Math.round(orig.x + dx)))
        const newY = Math.max(0, Math.min(ih, Math.round(orig.y + dy)))
        setPoints((prev) => {
          const next = [...prev]
          next[drag.index] = { x: newX, y: newY }
          return next
        })
      } else {
        // Edge drag: move both endpoints of the edge together
        const i1 = drag.index
        const i2 = (drag.index + 1) % drag.origPoints.length
        const orig1 = drag.origPoints[i1]
        const orig2 = drag.origPoints[i2]
        setPoints((prev) => {
          const next = [...prev]
          next[i1] = {
            x: Math.max(0, Math.min(iw, Math.round(orig1.x + dx))),
            y: Math.max(0, Math.min(ih, Math.round(orig1.y + dy))),
          }
          next[i2] = {
            x: Math.max(0, Math.min(iw, Math.round(orig2.x + dx))),
            y: Math.max(0, Math.min(ih, Math.round(orig2.y + dy))),
          }
          return next
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
    if (points.length < MIN_POINTS || !loadedImageRef.current) return
    setApplying(true)
    try {
      const blob = await getCroppedImagePolygon(loadedImageRef.current, points)
      await onApply(blob)
    } catch {
      setApplying(false)
    }
  }

  const hasValidRegion = points.length >= MIN_POINTS

  // Build SVG polygon string for display coordinates
  const svgPolygon = points.map((p) => `${p.x * scale},${p.y * scale}`).join(" ")

  // Compute bounding box dimensions for info display
  const bbox = hasValidRegion ? getBoundingBox(points) : null

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

      {/* Image + polygon overlay */}
      <div ref={containerRef} className="flex-1 flex items-center justify-center overflow-hidden">
        {displaySize && (
          <div
            ref={imageRef}
            className="relative select-none"
            style={{ width: displaySize.w, height: displaySize.h }}
          >
            <img
              src={imageSrc}
              crossOrigin="anonymous"
              alt={t`Crop preview`}
              className="w-full h-full block pointer-events-none"
              draggable={false}
            />

            {/* Dimmed overlay outside polygon */}
            {hasValidRegion && (
              <div
                className="absolute inset-0 bg-black/50 pointer-events-none"
                style={{
                  clipPath: (() => {
                    // Inner polygon must be CCW (reversed) to create a cutout
                    // with the CW outer rectangle under nonzero fill rule
                    const reversed = [...points].reverse()
                    return `polygon(
                      0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
                      ${reversed.map((p) => `${p.x * scale}px ${p.y * scale}px`).join(", ")},
                      ${reversed[0].x * scale}px ${reversed[0].y * scale}px,
                      0% 0%
                    )`
                  })(),
                }}
              />
            )}

            {/* SVG overlay for polygon edges, vertices, and midpoints */}
            {hasValidRegion && (
              <svg
                className="absolute inset-0"
                width={displaySize.w}
                height={displaySize.h}
                style={{ overflow: "visible" }}
              >
                {/* Polygon outline */}
                <polygon
                  points={svgPolygon}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth={2}
                />

                {/* Invisible wider edge hit areas for dragging */}
                {points.map((p, i) => {
                  const next = points[(i + 1) % points.length]
                  return (
                    <line
                      key={`edge-${i}`}
                      x1={p.x * scale}
                      y1={p.y * scale}
                      x2={next.x * scale}
                      y2={next.y * scale}
                      stroke="transparent"
                      strokeWidth={12}
                      style={{ cursor: "move" }}
                      onMouseDown={(e) => handleEdgeMouseDown(e, i)}
                    />
                  )
                })}

                {/* Midpoint handles (add point) */}
                {midpoints.map((mp, i) => (
                  <circle
                    key={`mid-${i}`}
                    cx={mp.x * scale}
                    cy={mp.y * scale}
                    r={MIDPOINT_RADIUS}
                    fill="#3b82f6"
                    fillOpacity={0.4}
                    stroke="#3b82f6"
                    strokeWidth={1}
                    style={{ cursor: "copy" }}
                    onMouseDown={(e) => handleMidpointClick(e, i)}
                  />
                ))}

                {/* Vertex handles */}
                {points.map((p, i) => (
                  <circle
                    key={`v-${i}`}
                    cx={p.x * scale}
                    cy={p.y * scale}
                    r={VERTEX_RADIUS}
                    fill="#3b82f6"
                    stroke="white"
                    strokeWidth={1.5}
                    style={{ cursor: "grab" }}
                    onMouseDown={(e) => handleVertexMouseDown(e, i)}
                    onContextMenu={(e) => handleVertexRightClick(e, i)}
                  />
                ))}
              </svg>
            )}
          </div>
        )}
      </div>

      {/* Info bar */}
      <div className="bg-background border-t shrink-0 px-4 py-2 flex items-center gap-4 text-[10px] text-muted-foreground">
        <span>
          <Trans>Drag vertices to reshape. Click midpoints (+) to add points. Right-click a vertex to remove it.</Trans>
        </span>
        {bbox && (
          <span className="ml-auto font-mono">
            {t`${bbox.w} × ${bbox.h}px · ${points.length} points`}
          </span>
        )}
      </div>
    </div>
  )
}

function getBoundingBox(points: Point[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return {
    left: Math.max(0, minX),
    top: Math.max(0, minY),
    right: maxX,
    bottom: maxY,
    w: maxX - Math.max(0, minX),
    h: maxY - Math.max(0, minY),
  }
}

/**
 * Crop an image to a polygon region using canvas clipping.
 * Output is the bounding box of the polygon, with transparent pixels outside.
 * Scaled to the original image's full width to preserve display size in layouts.
 */
function getCroppedImagePolygon(image: HTMLImageElement, points: Point[]): Promise<Blob> {
  const iw = image.naturalWidth
  const ih = image.naturalHeight

  // Clamp points to image bounds
  const clamped = points.map((p) => ({
    x: Math.max(0, Math.min(iw, p.x)),
    y: Math.max(0, Math.min(ih, p.y)),
  }))

  // Compute bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of clamped) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }

  const cropW = maxX - minX
  const cropH = maxY - minY
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

  // Draw clipping polygon (translated to canvas coordinates)
  ctx.beginPath()
  for (let i = 0; i < clamped.length; i++) {
    const px = (clamped[i].x - minX) * scaleUp
    const py = (clamped[i].y - minY) * scaleUp
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.clip()

  // Draw the image cropped to the bounding box
  ctx.drawImage(
    image,
    minX, minY, cropW, cropH,
    0, 0, outputWidth, outputHeight,
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error("Canvas toBlob failed"))
      },
      "image/png",
    )
  })
}
