import { useRef, useMemo, useEffect, useState } from "react"
import DOMPurify from "dompurify"

/**
 * Renders section HTML in an iframe that matches the final book output structure.
 * Uses the Tailwind CDN for full utility class support and wraps content in the
 * same containers as the packaged ADT output (body + #content div).
 */
export function BookPreviewFrame({ html, className }: { html: string; className?: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(300)

  const sanitizedHtml = useMemo(() => DOMPurify.sanitize(html), [html])

  const srcdoc = useMemo(
    () =>
      `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta content="width=device-width, initial-scale=1" name="viewport" />
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,300..800;1,300..800&display=swap");
    body, p, h1, h2, h3, h4, h5, h6, span, div, button, input, textarea, select {
      font-family: "Merriweather", serif;
    }
  </style>
</head>
<body class="min-h-screen flex items-center justify-center">
  <div id="content">
    ${sanitizedHtml}
  </div>
</body>
</html>`,
    [sanitizedHtml],
  )

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    let observer: ResizeObserver | null = null

    const onLoad = () => {
      const doc = iframe.contentDocument
      if (!doc) return

      const updateHeight = () => {
        const h = doc.documentElement.scrollHeight
        if (h > 0) setHeight(h)
      }

      updateHeight()
      observer = new ResizeObserver(updateHeight)
      observer.observe(doc.body)

      // Forward arrow key events to parent so navigation still works
      doc.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          window.dispatchEvent(new KeyboardEvent("keydown", { key: e.key }))
        }
      })
    }

    iframe.addEventListener("load", onLoad)
    return () => {
      iframe.removeEventListener("load", onLoad)
      observer?.disconnect()
    }
  }, [srcdoc])

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcdoc}
      className={className}
      style={{ width: "100%", height, border: "none" }}
    />
  )
}
