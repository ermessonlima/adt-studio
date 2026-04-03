import { useRef, useMemo, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from "react"
import DOMPurify from "dompurify"
import { BASE_URL } from "@/api/client"

// In Tauri, BASE_URL is "http://localhost:3001/api"; extract the origin so the iframe
// can resolve relative image URLs (stored in the DB) via a <base> tag (see Lesson #2).
// Use new URL().origin instead of string slicing — immune to path changes (Lesson #11).
const IFRAME_BASE = BASE_URL.startsWith("http") ? new URL(BASE_URL).origin : ""

/** Build the URL prefix for adt-preview asset routes for the given book. */
function previewAssetsUrl(bookLabel: string): string {
  return `${BASE_URL}/books/${bookLabel}/adt-preview`
}

function promoteFirstHeadingToH1(html: string): string {
  if (/<h1\b/i.test(html)) return html
  return html.replace(/<h([2-6])(\b[^>]*)>([\s\S]*?)<\/h\1>/i, '<h1$2>$3</h1>')
}

/** Fixed viewport width the iframe renders at — matches a typical desktop preview.
 *  The iframe is scaled down via CSS transform to fit the actual panel width. */
const RENDER_WIDTH = 1280

/**
 * Apply a text edit to the original (LaTeX) HTML by replacing the textContent
 * of the element matching the given data-id. Returns the reconstructed wrapper
 * HTML, or null if the element was not found.
 */
function reconstructHtmlWithEdit(originalHtml: string, dataId: string, newText: string): string | null {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(`<div id="__root">${originalHtml}</div>`, "text/html")
    const el = doc.querySelector(`[data-id="${CSS.escape(dataId)}"]`)
    if (!el) return null
    el.textContent = newText
    const wrapper = doc.getElementById("content") ?? doc.getElementById("__root")
    if (!wrapper) return null
    const cls = wrapper.getAttribute("class")?.trim()
    return cls ? wrapper.outerHTML : wrapper.innerHTML
  } catch {
    return null
  }
}

export interface BookPreviewFrameHandle {
  /** Get the iframe element's bounding rect in the viewport */
  getIframeRect: () => DOMRect | null
  /** Regenerate Tailwind CSS including the given extra HTML, then inject into iframe.
   *  Use after AI edits introduce new Tailwind classes not yet in the DB. */
  refreshCss: (extraHtml: string) => Promise<void>
  /** Read the Tailwind classes on an element by data-id */
  getElementClasses: (dataId: string) => string[]
  /** Set the full class list on an element by data-id. Returns updated full HTML, or null. */
  setElementClasses: (dataId: string, classes: string[]) => string | null
}

export interface BookPreviewFrameProps {
  html: string
  /** Book label — used to load the correct Tailwind CSS and font assets from the API */
  bookLabel: string
  className?: string
  /** Enable interactive mode — click/edit elements with data-id attributes */
  editable?: boolean
  /** data-id values of pruned elements — shown faded/greyed in the preview */
  prunedDataIds?: string[]
  /** Elements that have been edited — shows subtle indicator + original on hover */
  changedElements?: Array<{ dataId: string; originalText?: string }>
  /** Called when a data-id element is clicked (single click).
   *  tagName is provided for container elements (div, section, etc.) that don't have a pre-existing data-id. */
  onSelectElement?: (dataId: string, rect: DOMRect, tagName?: string) => void
  /** Called when a text element is edited (blur/Enter after contenteditable) */
  onTextChanged?: (dataId: string, newText: string, fullHtml: string) => void
  /** When true (default), applies data-background-color to the iframe body */
  applyBodyBackground?: boolean
}

/**
 * Renders section HTML in an iframe that matches the final book output structure.
 * Uses the same CSS, fonts, and body layout as the preview so rendering is pixel-identical.
 *
 * The iframe always renders at a fixed desktop-width viewport (RENDER_WIDTH) then
 * scales down via CSS transform to fit the available panel width. This ensures
 * responsive breakpoints, overlay positions, and image sizing match the preview.
 *
 * When `editable` is true, injects interactive scripts that allow clicking and
 * editing data-id elements, communicating changes back via postMessage.
 */
export const BookPreviewFrame = forwardRef<BookPreviewFrameHandle, BookPreviewFrameProps>(function BookPreviewFrame({
  html,
  bookLabel,
  className,
  editable = false,
  prunedDataIds,
  changedElements,
  onSelectElement,
  onTextChanged,
  applyBodyBackground,
}, ref) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const assetsPrefix = previewAssetsUrl(bookLabel)

  useImperativeHandle(ref, () => ({
    getIframeRect: () => iframeRef.current?.getBoundingClientRect() ?? null,
    refreshCss: async (extraHtml: string) => {
      const doc = iframeRef.current?.contentDocument
      if (!doc?.head) return
      const res = await fetch(`${assetsPrefix}/content/tailwind_output.css`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extraHtml }),
      })
      if (!res.ok) return
      const css = await res.text()
      const styleId = "adt-dynamic-css"
      let styleEl = doc.getElementById(styleId) as HTMLStyleElement | null
      if (!styleEl) {
        styleEl = doc.createElement("style")
        styleEl.id = styleId
        doc.head.appendChild(styleEl)
      }
      styleEl.textContent = css
      // Re-measure height since new styles may change layout
      requestAnimationFrame(() => {
        const h = doc.body?.scrollHeight
        if (h && h > 0) setContentHeight(h)
      })
    },
    getElementClasses: (dataId: string): string[] => {
      const doc = iframeRef.current?.contentDocument
      if (!doc) return []
      const el = doc.querySelector(`[data-id="${CSS.escape(dataId)}"]`) as HTMLElement | null
      if (!el) return []
      return Array.from(el.classList)
    },
    setElementClasses: (dataId: string, classes: string[]): string | null => {
      const doc = iframeRef.current?.contentDocument
      if (!doc) return null
      const el = doc.querySelector(`[data-id="${CSS.escape(dataId)}"]`) as HTMLElement | null
      if (!el) return null
      el.className = classes.join(" ")
      // Strip transient selection/editing attributes before extracting HTML
      const transientEls = doc.querySelectorAll("[data-adt-selected], [data-adt-editing]")
      transientEls.forEach((te) => {
        te.removeAttribute("data-adt-selected")
        te.removeAttribute("data-adt-editing")
      })
      // Also strip dynamically-assigned container data-ids (prefixed _el)
      doc.querySelectorAll('[data-id^="_el"]').forEach((te) => te.removeAttribute("data-id"))
      // Extract the full HTML to persist into rendering
      const wrapper = doc.getElementById("content")
      let html: string
      if (wrapper) {
        const cls = (wrapper.getAttribute("class") || "").trim()
        html = cls ? wrapper.outerHTML : wrapper.innerHTML
      } else {
        html = doc.body.innerHTML
      }
      // Restore the selected attribute on the current element
      el.setAttribute("data-adt-selected", "true")
      // Restore the dynamic data-id if it was stripped
      if (dataId.startsWith("_el")) el.setAttribute("data-id", dataId)
      return html
    },
  }))
  const [iframeReady, setIframeReady] = useState(false)
  const [scale, setScale] = useState(1)
  const [contentHeight, setContentHeight] = useState(800)
  const readyRef = useRef(false)
  const latestHtmlRef = useRef("")
  const sanitizedHtmlRef = useRef("")
  const originalTextsRef = useRef<Record<string, string>>({})
  const measureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sanitizedHtml = useMemo(() => DOMPurify.sanitize(html), [html])
  // Convert LaTeX to MathML for display via the API — the underlying data stays as LaTeX.
  // Start with sanitized HTML immediately, then update when the API responds.
  const [displayHtml, setDisplayHtml] = useState(sanitizedHtml)
  useEffect(() => {
    setDisplayHtml(sanitizedHtml)
    let cancelled = false
    fetch(`${assetsPrefix}/convert-math`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: sanitizedHtml }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { html: string } | null) => {
        if (!cancelled && data?.html && data.html !== sanitizedHtml) {
          setDisplayHtml(data.html)
        }
      })
      .catch(() => {}) // fallback: display without math conversion
    return () => { cancelled = true }
  }, [sanitizedHtml, assetsPrefix])
  latestHtmlRef.current = displayHtml
  sanitizedHtmlRef.current = sanitizedHtml

  // Build a map of data-id → original LaTeX innerHTML so the iframe can swap
  // MathML back to LaTeX when the user clicks to edit an element.
  useMemo(() => {
    const map: Record<string, string> = {}
    const parser = new DOMParser()
    const doc = parser.parseFromString(`<div>${sanitizedHtml}</div>`, "text/html")
    doc.querySelectorAll("[data-id]").forEach((el) => {
      const id = el.getAttribute("data-id")
      if (id) map[id] = el.innerHTML
    })
    originalTextsRef.current = map
  }, [sanitizedHtml])

  // Interactive script — always present in the iframe, gated by data-editable on <body>.
  // This avoids srcdoc changes (and thus iframe reloads) when the editable prop toggles.
  const interactiveScript = `<script>
(function() {
  var selected = null;
  var editing = null;
  var savedDisplayHtml = null;
  var savedOriginalText = null;
  var containerIdCounter = 0;

  function isEditable() { return document.body.dataset.editable === 'true'; }

  /** Structural tags eligible for container selection (when no data-id ancestor). */
  var CONTAINER_TAGS = { DIV:1, SECTION:1, ARTICLE:1, MAIN:1, NAV:1, ASIDE:1, HEADER:1, FOOTER:1,
    BUTTON:1, A:1, UL:1, OL:1, LI:1, FIGURE:1, FIGCAPTION:1, BLOCKQUOTE:1, TABLE:1,
    THEAD:1, TBODY:1, TR:1, TD:1, TH:1, FORM:1, FIELDSET:1, DETAILS:1, SUMMARY:1, SPAN:1,
    INPUT:1, SELECT:1, TEXTAREA:1, LABEL:1 };

  /** Walk up from target to find the nearest meaningful container element. */
  function findContainer(target) {
    var el = target;
    while (el && el !== document.body && el.id !== 'content') {
      if (el.nodeType === 1 && CONTAINER_TAGS[el.tagName]) return el;
      el = el.parentElement;
    }
    return null;
  }

  /** Ensure the element has a data-id; assign one if missing. */
  function ensureDataId(el) {
    var id = el.getAttribute('data-id');
    if (id) return id;
    id = '_el' + (++containerIdCounter);
    el.setAttribute('data-id', id);
    return id;
  }

  function getRect(el) {
    var r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, left: r.left, right: r.right, bottom: r.bottom };
  }

  function clearSelection() {
    if (selected) {
      selected.removeAttribute('data-adt-selected');
    }
    selected = null;
  }

  function selectElement(el) {
    clearSelection();
    selected = el;
    el.setAttribute('data-adt-selected', 'true');
    var isImg = el.tagName === 'IMG';
    parent.postMessage({
      type: isImg ? 'select-image' : 'select',
      dataId: el.getAttribute('data-id'),
      rect: getRect(el)
    }, '*');
  }

  function startEditing(el) {
    if (el.tagName === 'IMG') return;
    editing = el;
    // Save the current MathML display before swapping to LaTeX
    savedDisplayHtml = el.innerHTML;
    var dataId = el.getAttribute('data-id');
    if (window.__origTexts && window.__origTexts[dataId] != null) {
      el.innerHTML = window.__origTexts[dataId];
    }
    // Capture original text AFTER the LaTeX swap so the comparison
    // in finishEditing compares LaTeX-to-LaTeX, not MathML-to-LaTeX
    savedOriginalText = el.textContent || '';
    el.contentEditable = 'true';
    el.setAttribute('data-adt-editing', 'true');
    el.focus();
    parent.postMessage({ type: 'editing', dataId: dataId }, '*');
  }

  function finishEditing() {
    if (!editing) return;
    var el = editing;
    var restoreHtml = savedDisplayHtml;
    var origText = savedOriginalText;
    editing = null;
    savedDisplayHtml = null;
    savedOriginalText = null;
    el.contentEditable = 'false';
    el.removeAttribute('data-adt-editing');
    // Capture the edited text before restoring MathML display
    var newText = el.textContent || '';
    var dataId = el.getAttribute('data-id');
    // Restore MathML display immediately so the preview looks correct
    if (restoreHtml != null) {
      el.innerHTML = restoreHtml;
    }
    // Only notify parent if text actually changed
    if (newText === origText) return;
    var wrapper = document.getElementById('content');
    var fullHtml;
    if (wrapper) {
      var cls = (wrapper.getAttribute('class') || '').trim();
      fullHtml = cls ? wrapper.outerHTML : wrapper.innerHTML;
    } else {
      fullHtml = document.body.innerHTML;
    }
    parent.postMessage({
      type: 'text-changed',
      dataId: dataId,
      newText: newText,
      fullHtml: fullHtml
    }, '*');
  }

  document.addEventListener('click', function(e) {
    if (!isEditable()) return;
    var el = e.target.closest('[data-id]');
    if (!el) {
      // No data-id ancestor — try selecting a container element
      var container = findContainer(e.target);
      if (container) {
        // Prevent native focus/interaction on form elements so the click selects for editing
        var tag = container.tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') {
          e.preventDefault();
        }
        if (editing) finishEditing();
        var cId = ensureDataId(container);
        clearSelection();
        selected = container;
        container.setAttribute('data-adt-selected', 'true');
        parent.postMessage({
          type: 'select-container',
          dataId: cId,
          tagName: container.tagName.toLowerCase(),
          rect: getRect(container)
        }, '*');
        return;
      }
      if (editing) finishEditing();
      clearSelection();
      parent.postMessage({ type: 'deselect' }, '*');
      return;
    }
    if (editing && editing !== el) finishEditing();
    selectElement(el);
    if (el.tagName !== 'IMG') startEditing(el);
  });

  document.addEventListener('keydown', function(e) {
    if (!isEditable()) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        parent.dispatchEvent(new KeyboardEvent('keydown', { key: e.key }));
      }
      return;
    }
    if (editing) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        finishEditing();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        // Restore MathML display on cancel
        if (savedDisplayHtml != null) {
          editing.innerHTML = savedDisplayHtml;
          savedDisplayHtml = null;
        }
        editing.contentEditable = 'false';
        editing.removeAttribute('data-adt-editing');
        editing = null;
      }
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      parent.dispatchEvent(new KeyboardEvent('keydown', { key: e.key }));
    }
  });
})();
<\/script>`

  // Interactive hover styles — scoped to body[data-editable="true"] so they only
  // apply when editing is enabled, without needing to change the srcdoc.
  const interactiveStyles = `body[data-editable="true"] [data-id] { cursor: pointer; transition: outline 0.1s; }
    body[data-editable="true"] [data-id]:hover { outline: 2px solid rgba(59,130,246,0.3); outline-offset: 2px; }
    body[data-editable="true"] img[data-id] { position: relative; z-index: 1; }
    body[data-editable="true"] div:hover, body[data-editable="true"] section:hover,
    body[data-editable="true"] button:hover, body[data-editable="true"] nav:hover,
    body[data-editable="true"] article:hover, body[data-editable="true"] aside:hover,
    body[data-editable="true"] figure:hover, body[data-editable="true"] li:hover,
    body[data-editable="true"] input:hover, body[data-editable="true"] select:hover,
    body[data-editable="true"] textarea:hover, body[data-editable="true"] label:hover {
      outline: 1px dashed rgba(59,130,246,0.25); outline-offset: 1px;
    }
    [data-adt-selected] { outline: 2px solid rgba(59,130,246,0.8) !important; outline-offset: 2px !important; }
    [data-adt-editing] { outline: 2px solid rgba(59,130,246,1) !important; outline-offset: 2px !important; }`

  // Stable shell — loaded once, never changes.
  // Mirrors the preview's renderPageHtml output: same CSS, fonts, body classes.
  const srcdoc = useMemo(
    // eslint-disable-next-line lingui/no-unlocalized-strings
    () => `<!DOCTYPE html>
<html>
<head>
  ${IFRAME_BASE ? `<base href="${IFRAME_BASE}">` : ""}
  <meta charset="utf-8" />
  <meta content="width=device-width, initial-scale=1" name="viewport" />
  <link href="${assetsPrefix}/content/tailwind_output.css" rel="stylesheet">
  <link href="${assetsPrefix}/assets/fonts.css" rel="stylesheet">
  <link href="${assetsPrefix}/assets/libs/fontawesome/css/all.min.css" rel="stylesheet">
  <style>
    ${interactiveStyles}
  </style>
</head>
<body class="min-h-screen flex items-center justify-center">
${interactiveScript}
</body>
</html>`,
    [assetsPrefix]
  )

  // Listen for postMessage from iframe
  const callbacksRef = useRef({ onSelectElement, onTextChanged })
  callbacksRef.current = { onSelectElement, onTextChanged }

  const handleMessage = useCallback((e: MessageEvent) => {
    const iframe = iframeRef.current
    if (!iframe || e.source !== iframe.contentWindow) return
    const { type, dataId, rect, newText, fullHtml, tagName } = e.data ?? {}
    if (type === "select" || type === "select-image" || type === "select-container") {
      callbacksRef.current.onSelectElement?.(dataId, rect, tagName)
    } else if (type === "text-changed") {
      // Reconstruct fullHtml from original LaTeX HTML to prevent MathML
      // from leaking into the data model when saving edits
      const reconstructed = reconstructHtmlWithEdit(sanitizedHtmlRef.current, dataId, newText)
      callbacksRef.current.onTextChanged?.(dataId, newText, reconstructed ?? fullHtml)
    } else if (type === "deselect") {
      callbacksRef.current.onSelectElement?.("", {} as DOMRect)
    }
  }, [])

  useEffect(() => {
    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [handleMessage])

  /** Measure the intrinsic content height of the iframe document. */
  function measureHeight() {
    const doc = iframeRef.current?.contentDocument
    if (!doc?.body) return
    const h = doc.body.scrollHeight
    if (h > 0) setContentHeight(h)
  }

  /** Inject HTML into the iframe body (preserving the interactive script). */
  function injectContent(newHtml: string) {
    const iframe = iframeRef.current
    const doc = iframe?.contentDocument
    if (!doc?.body) return

    // Preserve the interactive script if present
    const scriptEl = doc.body.querySelector("script")
    const normalizedHtml = promoteFirstHeadingToH1(newHtml)
    // Mirror the packaged page shell closely: a page-level <main> containing
    // either the existing #content wrapper or a generated one.
    const hasOwnMain = /^\s*<main\b/.test(normalizedHtml)
    const hasOwnWrapper = /^\s*<div\b[^>]*\bid="content"/.test(normalizedHtml)
    const contentHtml = hasOwnWrapper ? normalizedHtml : `<div id="content">${normalizedHtml}</div>`
    doc.body.innerHTML = hasOwnMain ? normalizedHtml : `<main class="w-full">${contentHtml}</main>`
    if (scriptEl) {
      doc.body.appendChild(scriptEl)
    }

    // Inject original LaTeX texts so startEditing can swap MathML → LaTeX
    const textsEl = doc.createElement("script")
    textsEl.id = "adt-original-texts"
    textsEl.textContent = `window.__origTexts=${JSON.stringify(originalTextsRef.current)};`
    doc.body.appendChild(textsEl)

    // Apply data-background-color from content to iframe body
    if (applyBodyBackground !== false) {
      const bgEl = doc.querySelector("[data-background-color]")
      doc.body.style.backgroundColor = bgEl?.getAttribute("data-background-color") ?? ""
    } else {
      doc.body.style.backgroundColor = ""
    }

    // Force synchronous reflow so the browser repaints the scaled iframe
    // immediately after innerHTML changes (fixes delayed style rendering).
    void doc.body.offsetHeight

    // Measure after fonts + images settle
    requestAnimationFrame(() => {
      measureHeight()
      if (doc.fonts?.ready) {
        doc.fonts.ready.then(measureHeight)
      }
    })

    doc.querySelectorAll("img").forEach((img) => {
      if (!img.complete) {
        img.addEventListener("load", measureHeight, { once: true })
        img.addEventListener("error", measureHeight, { once: true })
      }
    })

    if (measureTimerRef.current) clearTimeout(measureTimerRef.current)
    measureTimerRef.current = setTimeout(measureHeight, 500)
  }

  // When html prop changes, reset height and update the body directly (no iframe reload)
  useEffect(() => {
    setContentHeight(800)
    if (readyRef.current) injectContent(displayHtml)
  }, [displayHtml, applyBodyBackground])

  // Toggle editability dynamically via data attribute (no iframe reload needed)
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument
    if (!doc?.body) return
    doc.body.dataset.editable = editable ? "true" : "false"
  }, [editable, iframeReady])

  // Inject/update pruned element styles into the iframe
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument
    if (!doc?.head) return
    const styleId = "adt-pruned-styles"
    let styleEl = doc.getElementById(styleId) as HTMLStyleElement | null
    if (!prunedDataIds?.length) {
      styleEl?.remove()
      return
    }
    if (!styleEl) {
      styleEl = doc.createElement("style")
      styleEl.id = styleId
      doc.head.appendChild(styleEl)
    }
    const selectors = prunedDataIds.map((id) => `[data-id="${id}"]`).join(",\n")
    // eslint-disable-next-line lingui/no-unlocalized-strings
    styleEl.textContent = `${selectors} { opacity: 0.3; filter: grayscale(1); transition: opacity 0.3s, filter 0.3s; }`
  }, [prunedDataIds, iframeReady])

  // Inject/update changed-element indicators + hover tooltips
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument
    if (!doc?.head) return
    const styleId = "adt-changed-styles"
    let styleEl = doc.getElementById(styleId) as HTMLStyleElement | null

    // Clean up previous title attributes
    doc.querySelectorAll("[data-adt-changed]").forEach((el) => {
      el.removeAttribute("title")
      el.removeAttribute("data-adt-changed")
    })

    if (!changedElements?.length) {
      styleEl?.remove()
      return
    }

    if (!styleEl) {
      styleEl = doc.createElement("style")
      styleEl.id = styleId
      doc.head.appendChild(styleEl)
    }

    const selectors = changedElements.map((c) => `[data-id="${c.dataId}"]`).join(",\n")
    // eslint-disable-next-line lingui/no-unlocalized-strings
    styleEl.textContent = `
${selectors} {
  position: relative;
  box-shadow: -3px 0 0 0 rgba(245, 158, 11, 0.6);
  transition: box-shadow 0.3s;
}
${selectors}:hover {
  box-shadow: -3px 0 0 0 rgba(245, 158, 11, 1);
}`

    // Set title attribute on changed elements for native hover tooltip
    for (const { dataId, originalText } of changedElements) {
      const el = doc.querySelector(`[data-id="${dataId}"]`)
      if (el && originalText) {
        el.setAttribute("data-adt-changed", "true")
        const preview = originalText.length > 120 ? originalText.slice(0, 120) + "…" : originalText
        el.setAttribute("title", `Original: ${preview}`)
      } else if (el) {
        el.setAttribute("data-adt-changed", "true")
      }
    }
  }, [changedElements, iframeReady])

  // Compute scale factor when wrapper resizes
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const availableWidth = entry.contentRect.width
      setScale(Math.min(1, availableWidth / RENDER_WIDTH))
    })
    ro.observe(wrapper)
    return () => ro.disconnect()
  }, [])

  // One-time iframe setup
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const onLoad = () => {
      const doc = iframe.contentDocument
      if (!doc) return

      const start = () => {
        readyRef.current = true
        setIframeReady(true)
        injectContent(latestHtmlRef.current)
      }

      if (doc.fonts?.ready) {
        doc.fonts.ready.then(start)
      } else {
        start()
      }
    }

    iframe.addEventListener("load", onLoad)
    return () => {
      iframe.removeEventListener("load", onLoad)
      if (measureTimerRef.current) clearTimeout(measureTimerRef.current)
      readyRef.current = false
      setIframeReady(false)
    }
  }, [])

  const scaledHeight = contentHeight * scale

  return (
    <div ref={wrapperRef} className={className} style={{ height: scaledHeight, overflow: "hidden" }}>
      <iframe
        ref={iframeRef}
        srcDoc={srcdoc}
        scrolling="no"
        style={{
          width: RENDER_WIDTH,
          height: contentHeight,
          border: "none",
          transformOrigin: "top left",
          transform: `scale(${scale})`,
        }}
      />
    </div>
  )
})
