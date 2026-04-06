import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import {
  ChevronDown,
  Crop,
  Eye,
  EyeOff,
  ImagePlus,
  Pencil,
  Plus,
  Scissors,
  Sparkles,
  Trash2,
  Type,
  Upload,
  X,
  Search,
} from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Trans } from "@lingui/react/macro"
import { useLingui } from "@lingui/react/macro"

// ---------------------------------------------------------------------------
// Tailwind class registry: class → human label, organized by category
// ---------------------------------------------------------------------------

interface TwEntry { cls: string; label: string }

const TAILWIND_CATEGORIES: { name: string; entries: TwEntry[] }[] = [
  {
    name: "Text Size",
    entries: [
      { cls: "text-xs", label: "Extra Small (12px)" },
      { cls: "text-sm", label: "Small (14px)" },
      { cls: "text-base", label: "Base (16px)" },
      { cls: "text-lg", label: "Large (18px)" },
      { cls: "text-xl", label: "XL (20px)" },
      { cls: "text-2xl", label: "2XL (24px)" },
      { cls: "text-3xl", label: "3XL (30px)" },
      { cls: "text-4xl", label: "4XL (36px)" },
      { cls: "text-5xl", label: "5XL (48px)" },
      { cls: "text-6xl", label: "6XL (60px)" },
      { cls: "text-7xl", label: "7XL (72px)" },
      { cls: "text-8xl", label: "8XL (96px)" },
      { cls: "text-9xl", label: "9XL (128px)" },
    ],
  },
  {
    name: "Font Weight",
    entries: [
      { cls: "font-thin", label: "Thin (100)" },
      { cls: "font-extralight", label: "Extra Light (200)" },
      { cls: "font-light", label: "Light (300)" },
      { cls: "font-normal", label: "Normal (400)" },
      { cls: "font-medium", label: "Medium (500)" },
      { cls: "font-semibold", label: "Semi Bold (600)" },
      { cls: "font-bold", label: "Bold (700)" },
      { cls: "font-extrabold", label: "Extra Bold (800)" },
      { cls: "font-black", label: "Black (900)" },
    ],
  },
  {
    name: "Font Style",
    entries: [
      { cls: "italic", label: "Italic" },
      { cls: "not-italic", label: "Not Italic" },
      { cls: "underline", label: "Underline" },
      { cls: "no-underline", label: "No Underline" },
      { cls: "line-through", label: "Strikethrough" },
      { cls: "uppercase", label: "UPPERCASE" },
      { cls: "lowercase", label: "lowercase" },
      { cls: "capitalize", label: "Capitalize" },
      { cls: "normal-case", label: "Normal Case" },
    ],
  },
  {
    name: "Text Align",
    entries: [
      { cls: "text-left", label: "Left" },
      { cls: "text-center", label: "Center" },
      { cls: "text-right", label: "Right" },
      { cls: "text-justify", label: "Justify" },
    ],
  },
  {
    name: "Line Height",
    entries: [
      { cls: "leading-none", label: "None (1)" },
      { cls: "leading-tight", label: "Tight (1.25)" },
      { cls: "leading-snug", label: "Snug (1.375)" },
      { cls: "leading-normal", label: "Normal (1.5)" },
      { cls: "leading-relaxed", label: "Relaxed (1.625)" },
      { cls: "leading-loose", label: "Loose (2)" },
    ],
  },
  {
    name: "Letter Spacing",
    entries: [
      { cls: "tracking-tighter", label: "Tighter (-0.05em)" },
      { cls: "tracking-tight", label: "Tight (-0.025em)" },
      { cls: "tracking-normal", label: "Normal (0)" },
      { cls: "tracking-wide", label: "Wide (0.025em)" },
      { cls: "tracking-wider", label: "Wider (0.05em)" },
      { cls: "tracking-widest", label: "Widest (0.1em)" },
    ],
  },
  {
    name: "Spacing",
    entries: [
      { cls: "p-0", label: "Padding 0" },
      { cls: "p-1", label: "Padding 4px" },
      { cls: "p-2", label: "Padding 8px" },
      { cls: "p-3", label: "Padding 12px" },
      { cls: "p-4", label: "Padding 16px" },
      { cls: "p-6", label: "Padding 24px" },
      { cls: "p-8", label: "Padding 32px" },
      { cls: "px-1", label: "Horizontal Padding 4px" },
      { cls: "px-2", label: "Horizontal Padding 8px" },
      { cls: "px-4", label: "Horizontal Padding 16px" },
      { cls: "px-6", label: "Horizontal Padding 24px" },
      { cls: "py-1", label: "Vertical Padding 4px" },
      { cls: "py-2", label: "Vertical Padding 8px" },
      { cls: "py-4", label: "Vertical Padding 16px" },
      { cls: "py-6", label: "Vertical Padding 24px" },
      { cls: "m-0", label: "Margin 0" },
      { cls: "m-1", label: "Margin 4px" },
      { cls: "m-2", label: "Margin 8px" },
      { cls: "m-4", label: "Margin 16px" },
      { cls: "m-auto", label: "Margin Auto" },
      { cls: "mx-auto", label: "Horizontal Margin Auto" },
      { cls: "my-2", label: "Vertical Margin 8px" },
      { cls: "my-4", label: "Vertical Margin 16px" },
    ],
  },
  {
    name: "Layout",
    entries: [
      { cls: "block", label: "Block" },
      { cls: "inline-block", label: "Inline Block" },
      { cls: "inline", label: "Inline" },
      { cls: "flex", label: "Flexbox" },
      { cls: "grid", label: "Grid" },
      { cls: "hidden", label: "Hidden" },
      { cls: "w-full", label: "Width 100%" },
      { cls: "w-auto", label: "Width Auto" },
      { cls: "w-1/2", label: "Width 50%" },
      { cls: "w-1/3", label: "Width 33%" },
      { cls: "w-2/3", label: "Width 67%" },
      { cls: "h-auto", label: "Height Auto" },
      { cls: "max-w-sm", label: "Max Width 384px" },
      { cls: "max-w-md", label: "Max Width 448px" },
      { cls: "max-w-lg", label: "Max Width 512px" },
      { cls: "max-w-xl", label: "Max Width 576px" },
      { cls: "max-w-full", label: "Max Width 100%" },
    ],
  },
  {
    name: "Border & Rounded",
    entries: [
      { cls: "border", label: "Border 1px" },
      { cls: "border-0", label: "No Border" },
      { cls: "border-2", label: "Border 2px" },
      { cls: "rounded", label: "Rounded 4px" },
      { cls: "rounded-md", label: "Rounded 6px" },
      { cls: "rounded-lg", label: "Rounded 8px" },
      { cls: "rounded-xl", label: "Rounded 12px" },
      { cls: "rounded-full", label: "Fully Rounded" },
      { cls: "rounded-none", label: "No Rounding" },
    ],
  },
  {
    name: "Effects",
    entries: [
      { cls: "shadow-sm", label: "Small Shadow" },
      { cls: "shadow", label: "Shadow" },
      { cls: "shadow-md", label: "Medium Shadow" },
      { cls: "shadow-lg", label: "Large Shadow" },
      { cls: "opacity-50", label: "50% Opacity" },
      { cls: "opacity-75", label: "75% Opacity" },
      { cls: "opacity-100", label: "Full Opacity" },
    ],
  },
  {
    name: "Image",
    entries: [
      { cls: "object-cover", label: "Cover (crop to fill)" },
      { cls: "object-contain", label: "Contain (fit inside)" },
      { cls: "object-fill", label: "Fill (stretch)" },
      { cls: "object-none", label: "None (original size)" },
      { cls: "object-center", label: "Position Center" },
      { cls: "object-top", label: "Position Top" },
      { cls: "object-bottom", label: "Position Bottom" },
    ],
  },
]

// ---------------------------------------------------------------------------
// Tailwind variant prefixes (responsive, state, etc.)
// ---------------------------------------------------------------------------

const TW_VARIANTS = [
  "sm", "md", "lg", "xl", "2xl",
  "hover", "focus", "active", "focus-within", "focus-visible",
  "first", "last", "odd", "even",
  "dark",
  "print",
  "group-hover",
  "peer-checked",
] as const

/** Parse a Tailwind class into optional variant prefix + base class.
 *  e.g. "md:text-lg" → { variant: "md:", base: "text-lg" }
 *       "text-lg"    → { variant: "",    base: "text-lg" }
 */
function parseClass(cls: string): { variant: string; base: string } {
  const colonIdx = cls.indexOf(":")
  if (colonIdx === -1) return { variant: "", base: cls }
  return { variant: cls.slice(0, colonIdx + 1), base: cls.slice(colonIdx + 1) }
}

// ---------------------------------------------------------------------------
// Full Tailwind color palette
// ---------------------------------------------------------------------------

const TW_COLOR_NAMES = [
  "slate", "gray", "zinc", "neutral", "stone",
  "red", "orange", "amber", "yellow", "lime",
  "green", "emerald", "teal", "cyan", "sky",
  "blue", "indigo", "violet", "purple", "fuchsia",
  "pink", "rose",
] as const

const TW_SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"] as const

const TW_HEX: Record<string, Record<string, string>> = {
  slate:   { "50":"#f8fafc","100":"#f1f5f9","200":"#e2e8f0","300":"#cbd5e1","400":"#94a3b8","500":"#64748b","600":"#475569","700":"#334155","800":"#1e293b","900":"#0f172a","950":"#020617" },
  gray:    { "50":"#f9fafb","100":"#f3f4f6","200":"#e5e7eb","300":"#d1d5db","400":"#9ca3af","500":"#6b7280","600":"#4b5563","700":"#374151","800":"#1f2937","900":"#111827","950":"#030712" },
  zinc:    { "50":"#fafafa","100":"#f4f4f5","200":"#e4e4e7","300":"#d4d4d8","400":"#a1a1aa","500":"#71717a","600":"#52525b","700":"#3f3f46","800":"#27272a","900":"#18181b","950":"#09090b" },
  neutral: { "50":"#fafafa","100":"#f5f5f5","200":"#e5e5e5","300":"#d4d4d4","400":"#a3a3a3","500":"#737373","600":"#525252","700":"#404040","800":"#262626","900":"#171717","950":"#0a0a0a" },
  stone:   { "50":"#fafaf9","100":"#f5f5f4","200":"#e7e5e4","300":"#d6d3d1","400":"#a8a29e","500":"#78716c","600":"#57534e","700":"#44403c","800":"#292524","900":"#1c1917","950":"#0c0a09" },
  red:     { "50":"#fef2f2","100":"#fee2e2","200":"#fecaca","300":"#fca5a5","400":"#f87171","500":"#ef4444","600":"#dc2626","700":"#b91c1c","800":"#991b1b","900":"#7f1d1d","950":"#450a0a" },
  orange:  { "50":"#fff7ed","100":"#ffedd5","200":"#fed7aa","300":"#fdba74","400":"#fb923c","500":"#f97316","600":"#ea580c","700":"#c2410c","800":"#9a3412","900":"#7c2d12","950":"#431407" },
  amber:   { "50":"#fffbeb","100":"#fef3c7","200":"#fde68a","300":"#fcd34d","400":"#fbbf24","500":"#f59e0b","600":"#d97706","700":"#b45309","800":"#92400e","900":"#78350f","950":"#451a03" },
  yellow:  { "50":"#fefce8","100":"#fef9c3","200":"#fef08a","300":"#fde047","400":"#facc15","500":"#eab308","600":"#ca8a04","700":"#a16207","800":"#854d0e","900":"#713f12","950":"#422006" },
  lime:    { "50":"#f7fee7","100":"#ecfccb","200":"#d9f99d","300":"#bef264","400":"#a3e635","500":"#84cc16","600":"#65a30d","700":"#4d7c0f","800":"#3f6212","900":"#365314","950":"#1a2e05" },
  green:   { "50":"#f0fdf4","100":"#dcfce7","200":"#bbf7d0","300":"#86efac","400":"#4ade80","500":"#22c55e","600":"#16a34a","700":"#15803d","800":"#166534","900":"#14532d","950":"#052e16" },
  emerald: { "50":"#ecfdf5","100":"#d1fae5","200":"#a7f3d0","300":"#6ee7b7","400":"#34d399","500":"#10b981","600":"#059669","700":"#047857","800":"#065f46","900":"#064e3b","950":"#022c22" },
  teal:    { "50":"#f0fdfa","100":"#ccfbf1","200":"#99f6e4","300":"#5eead4","400":"#2dd4bf","500":"#14b8a6","600":"#0d9488","700":"#0f766e","800":"#115e59","900":"#134e4a","950":"#042f2e" },
  cyan:    { "50":"#ecfeff","100":"#cffafe","200":"#a5f3fc","300":"#67e8f9","400":"#22d3ee","500":"#06b6d4","600":"#0891b2","700":"#0e7490","800":"#155e75","900":"#164e63","950":"#083344" },
  sky:     { "50":"#f0f9ff","100":"#e0f2fe","200":"#bae6fd","300":"#7dd3fc","400":"#38bdf8","500":"#0ea5e9","600":"#0284c7","700":"#0369a1","800":"#075985","900":"#0c4a6e","950":"#082f49" },
  blue:    { "50":"#eff6ff","100":"#dbeafe","200":"#bfdbfe","300":"#93c5fd","400":"#60a5fa","500":"#3b82f6","600":"#2563eb","700":"#1d4ed8","800":"#1e40af","900":"#1e3a8a","950":"#172554" },
  indigo:  { "50":"#eef2ff","100":"#e0e7ff","200":"#c7d2fe","300":"#a5b4fc","400":"#818cf8","500":"#6366f1","600":"#4f46e5","700":"#4338ca","800":"#3730a3","900":"#312e81","950":"#1e1b4b" },
  violet:  { "50":"#f5f3ff","100":"#ede9fe","200":"#ddd6fe","300":"#c4b5fd","400":"#a78bfa","500":"#8b5cf6","600":"#7c3aed","700":"#6d28d9","800":"#5b21b6","900":"#4c1d95","950":"#2e1065" },
  purple:  { "50":"#faf5ff","100":"#f3e8ff","200":"#e9d5ff","300":"#d8b4fe","400":"#c084fc","500":"#a855f7","600":"#9333ea","700":"#7e22ce","800":"#6b21a8","900":"#581c87","950":"#3b0764" },
  fuchsia: { "50":"#fdf4ff","100":"#fae8ff","200":"#f5d0fe","300":"#f0abfc","400":"#e879f9","500":"#d946ef","600":"#c026d3","700":"#a21caf","800":"#86198f","900":"#701a75","950":"#4a044e" },
  pink:    { "50":"#fdf2f8","100":"#fce7f3","200":"#fbcfe8","300":"#f9a8d4","400":"#f472b6","500":"#ec4899","600":"#db2777","700":"#be185d","800":"#9d174d","900":"#831843","950":"#500724" },
  rose:    { "50":"#fff1f2","100":"#ffe4e6","200":"#fecdd3","300":"#fda4af","400":"#fb7185","500":"#f43f5e","600":"#e11d48","700":"#be123c","800":"#9f1239","900":"#881337","950":"#4c0519" },
}

function buildColorEntries(prefix: "text" | "bg" | "border"): TwEntry[] {
  /* eslint-disable lingui/no-unlocalized-strings -- color labels are technical identifiers */
  const specials: TwEntry[] = [
    { cls: `${prefix}-black`, label: "Black" },
    { cls: `${prefix}-white`, label: "White" },
  ]
  if (prefix === "bg") specials.push({ cls: "bg-transparent", label: "Transparent" })
  /* eslint-enable lingui/no-unlocalized-strings */
  const palette: TwEntry[] = []
  for (const color of TW_COLOR_NAMES) {
    for (const shade of TW_SHADES) {
      const name = color.charAt(0).toUpperCase() + color.slice(1)
      palette.push({ cls: `${prefix}-${color}-${shade}`, label: `${name} ${shade}` })
    }
  }
  return [...specials, ...palette]
}

const TEXT_COLOR_ENTRIES = buildColorEntries("text")
const BG_COLOR_ENTRIES = buildColorEntries("bg")
const BORDER_COLOR_ENTRIES = buildColorEntries("border")

const COLOR_CATEGORIES: { name: string; entries: TwEntry[] }[] = [
  { name: "Text Color", entries: TEXT_COLOR_ENTRIES },
  { name: "Background", entries: BG_COLOR_ENTRIES },
  { name: "Border Color", entries: BORDER_COLOR_ENTRIES },
]

const ALL_CATEGORIES = [...TAILWIND_CATEGORIES, ...COLOR_CATEGORIES]

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

const CLASS_LABEL_MAP = new Map<string, string>()
const CLASS_CATEGORY_MAP = new Map<string, string>()
const CATEGORY_ENTRIES_MAP = new Map<string, TwEntry[]>()

for (const cat of ALL_CATEGORIES) {
  CATEGORY_ENTRIES_MAP.set(cat.name, cat.entries)
  for (const e of cat.entries) {
    CLASS_LABEL_MAP.set(e.cls, e.label)
    CLASS_CATEGORY_MAP.set(e.cls, cat.name)
  }
}

const SEARCHABLE_ENTRIES: TwEntry[] = TAILWIND_CATEGORIES.flatMap((c) => c.entries)

function getLabel(cls: string): string {
  return CLASS_LABEL_MAP.get(cls) ?? cls
}

/** Look up category and label using the base class (stripping variant prefix) */
function lookupBase(fullCls: string): { variant: string; base: string; label: string; category: string | undefined; entries: TwEntry[] | undefined; isColor: boolean } {
  const { variant, base } = parseClass(fullCls)
  const label = getLabel(base)
  const category = CLASS_CATEGORY_MAP.get(base)
  const entries = category ? CATEGORY_ENTRIES_MAP.get(category) : undefined
  const isColor = colorHexFromBase(base) !== null
  return { variant, base, label, category, entries, isColor }
}

// ---------------------------------------------------------------------------
// Color utilities
// ---------------------------------------------------------------------------

/** Get hex for a base class (no variant prefix) */
function colorHexFromBase(base: string): string | null {
  const arb = base.match(/^(?:text|bg|border)-\[(#[0-9a-fA-F]{3,8})\]$/)
  if (arb) return arb[1]
  if (base.endsWith("-black")) return "#000000"
  if (base.endsWith("-white")) return "#ffffff"
  if (base === "bg-transparent") return "transparent"
  const m = base.match(/^(?:text|bg|border)-(\w+)-(\d+)$/)
  if (m) return TW_HEX[m[1]]?.[m[2]] ?? null
  return null
}

/** Get hex preview for any class, including prefixed ones */
function colorHexFromClass(cls: string): string | null {
  return colorHexFromBase(parseClass(cls).base)
}

/** Detect the color prefix type from a base class */
function colorPrefixFromBase(base: string): "text" | "bg" | "border" | null {
  if (base.startsWith("bg-")) return "bg"
  if (base.startsWith("border-")) return "border"
  if (base.startsWith("text-") && colorHexFromBase(base) !== null) return "text"
  return null
}

// ---------------------------------------------------------------------------
// Color swatch component
// ---------------------------------------------------------------------------

function ColorSwatch({ hex, size = "sm" }: { hex: string; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "w-2.5 h-2.5" : "w-3.5 h-3.5"
  if (hex === "transparent") {
    return (
      <span
        className={`${dim} rounded-sm border border-border/50 shrink-0`}
        style={{ background: "repeating-conic-gradient(#d4d4d4 0% 25%, white 0% 50%) 50% / 6px 6px" }}
      />
    )
  }
  return (
    <span
      className={`${dim} rounded-sm border border-border/50 shrink-0`}
      style={{ backgroundColor: hex }}
    />
  )
}

// ---------------------------------------------------------------------------
// Tooltip component — always visible on hover (not native title)
// ---------------------------------------------------------------------------

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  if (!text || (typeof children === "string" && text === children)) return <>{children}</>
  return (
    <span className="relative group/tip inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 text-[9px] font-sans text-popover-foreground bg-popover border rounded shadow-md whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity z-[70]">
        {text}
      </span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Color picker panel (full palette grid + custom hex input)
// ---------------------------------------------------------------------------

function ColorPalettePanel({
  prefix,
  currentClass,
  onSelect,
}: {
  prefix: "text" | "bg" | "border"
  currentClass: string | null
  onSelect: (cls: string) => void
}) {
  const { t } = useLingui()
  const [customHex, setCustomHex] = useState("")

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 px-1">
        {/* eslint-disable-next-line lingui/no-unlocalized-strings -- Tailwind class names */}
        {[`${prefix}-black`, `${prefix}-white`, ...(prefix === "bg" ? ["bg-transparent"] : [])].map((cls) => {
          const hex = colorHexFromBase(cls)!
          const active = cls === currentClass
          return (
            <button
              key={cls}
              type="button"
              title={getLabel(cls)}
              onClick={() => onSelect(cls)}
              className={`p-0.5 rounded cursor-pointer transition-all ${active ? "ring-2 ring-blue-500 ring-offset-1" : "hover:scale-110"}`}
            >
              <ColorSwatch hex={hex} size="md" />
            </button>
          )
        })}
      </div>
      <div className="grid gap-px" style={{ gridTemplateColumns: `repeat(${TW_SHADES.length}, 1fr)` }}>
        {TW_COLOR_NAMES.map((color) =>
          TW_SHADES.map((shade) => {
            const cls = `${prefix}-${color}-${shade}`
            const hex = TW_HEX[color]?.[shade]
            if (!hex) return <span key={cls} />
            const active = cls === currentClass
            return (
              <button
                key={cls}
                type="button"
                title={`${color}-${shade}`}
                onClick={() => onSelect(cls)}
                className={`w-full aspect-square rounded-[2px] cursor-pointer transition-all ${active ? "ring-2 ring-blue-500 ring-offset-1 z-10" : "hover:scale-125 hover:z-10"}`}
                style={{ backgroundColor: hex }}
              />
            )
          })
        )}
      </div>
      <div className="flex items-center gap-1.5 px-1 pt-1 border-t">
        <span className="text-[10px] text-muted-foreground"><Trans>Custom:</Trans></span>
        <div className="flex items-center gap-1 flex-1">
          <input
            type="color"
            value={customHex || "#000000"}
            onChange={(e) => {
              setCustomHex(e.target.value)
              onSelect(`${prefix}-[${e.target.value}]`)
            }}
            className="w-5 h-5 p-0 border-0 rounded cursor-pointer"
          />
          <input
            type="text"
            value={customHex}
            onChange={(e) => setCustomHex(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && /^#[0-9a-fA-F]{3,8}$/.test(customHex.trim())) {
                onSelect(`${prefix}-[${customHex.trim()}]`)
              }
            }}
            placeholder="#hex" // eslint-disable-line lingui/no-unlocalized-strings -- format hint
            className="text-[10px] font-mono bg-muted/50 rounded px-1.5 py-0.5 w-[70px] outline-none placeholder:text-muted-foreground"
            title={t`Enter hex color and press Enter`}
          />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Category swap dropdown — shown when clicking an existing chip
// ---------------------------------------------------------------------------

function CategorySwapDropdown({
  currentBase,
  variant,
  categoryName,
  entries,
  onSelect,
  onClose,
}: {
  currentBase: string
  variant: string
  categoryName: string
  entries: TwEntry[]
  onSelect: (fullCls: string) => void
  onClose: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const isColor = COLOR_CATEGORIES.some((c) => c.name === categoryName)
  const colorPrefix = colorPrefixFromBase(currentBase)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onCloseRef.current()
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const handleSelect = useCallback((baseCls: string) => {
    onSelect(variant + baseCls)
  }, [variant, onSelect])

  return (
    <div
      ref={containerRef}
      className="absolute top-full left-0 mt-1 bg-popover border rounded-lg shadow-lg z-[60] overflow-hidden"
      style={{ minWidth: isColor ? 220 : 200 }}
    >
      <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 border-b flex items-center gap-1">
        {variant && <span className="text-blue-500">{variant}</span>}
        {categoryName}
      </div>
      {isColor && colorPrefix ? (
        <div className="p-2">
          <ColorPalettePanel prefix={colorPrefix} currentClass={currentBase} onSelect={(cls) => { handleSelect(cls); onClose() }} />
        </div>
      ) : (
        <div className="max-h-[200px] overflow-y-auto py-1">
          {entries.map((e) => {
            const active = e.cls === currentBase
            const hex = colorHexFromBase(e.cls)
            return (
              <button
                key={e.cls}
                type="button"
                onClick={() => { handleSelect(e.cls); onClose() }}
                className={`w-full text-left flex items-center gap-2 px-2 py-1 text-[11px] cursor-pointer transition-colors ${active ? "bg-accent font-medium" : "hover:bg-accent/50"}`}
              >
                {hex && <ColorSwatch hex={hex} />}
                <span className="font-mono text-[10px] shrink-0">{variant}{e.cls}</span>
                <span className="text-muted-foreground truncate">{e.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Class chip — clickable to swap within category, double-click to edit raw
// ---------------------------------------------------------------------------

function ClassChip({
  cls,
  onRemove,
  onSwap,
}: {
  cls: string
  onRemove: () => void
  onSwap: (newCls: string) => void
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(cls)
  const inputRef = useRef<HTMLInputElement>(null)

  const { variant, base, label, category, entries, isColor } = lookupBase(cls)
  const hex = colorHexFromBase(base)
  const isSwappable = (!!entries && entries.length > 1) || isColor
  const tooltipText = variant ? `${variant} ${label}` : label

  useEffect(() => {
    if (editing) {
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }, [editing])

  const commitEdit = () => {
    setEditing(false)
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== cls) {
      onSwap(trimmed)
    } else {
      setEditValue(cls)
    }
  }

  if (editing) {
    return (
      <span className="inline-flex items-center text-[10px] font-mono bg-blue-50 rounded px-0.5 py-0.5 ring-1 ring-blue-300">
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit()
            if (e.key === "Escape") { setEditing(false); setEditValue(cls) }
          }}
          onBlur={commitEdit}
          className="bg-transparent outline-none text-[10px] font-mono w-[120px]"
        />
      </span>
    )
  }

  return (
    <Tooltip text={tooltipText}>
      <span className="relative inline-flex items-center gap-0.5 text-[10px] font-mono bg-muted rounded pl-1 pr-0.5 py-0.5 group">
        {hex && <ColorSwatch hex={hex} />}
        {variant && <span className="text-blue-500">{variant}</span>}
        {isSwappable ? (
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            onDoubleClick={(e) => { e.stopPropagation(); setDropdownOpen(false); setEditing(true) }}
            className="flex items-center gap-0.5 cursor-pointer hover:text-blue-600 transition-colors"
          >
            {base}
            <ChevronDown className="h-2 w-2 opacity-50 group-hover:opacity-100" />
          </button>
        ) : (
          <button
            type="button"
            onDoubleClick={() => setEditing(true)}
            className="cursor-default"
          >
            {base}
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="p-0 ml-0.5 rounded hover:bg-destructive/20 transition-colors cursor-pointer opacity-50 group-hover:opacity-100"
        >
          <X className="h-2.5 w-2.5" />
        </button>
        {dropdownOpen && (
          isColor && !category ? (
            // Color class not in a known category (e.g. arbitrary value) — detect prefix and show palette
            (() => {
              const cp = colorPrefixFromBase(base) ?? "text"
              // eslint-disable-next-line lingui/no-unlocalized-strings
              const catName = cp === "bg" ? "Background" : cp === "border" ? "Border Color" : "Text Color"
              const catEntries = CATEGORY_ENTRIES_MAP.get(catName) ?? []
              return (
                <CategorySwapDropdown
                  currentBase={base}
                  variant={variant}
                  categoryName={catName}
                  entries={catEntries}
                  onSelect={onSwap}
                  onClose={() => setDropdownOpen(false)}
                />
              )
            })()
          ) : entries && category ? (
            <CategorySwapDropdown
              currentBase={base}
              variant={variant}
              categoryName={category}
              entries={entries}
              onSelect={onSwap}
              onClose={() => setDropdownOpen(false)}
            />
          ) : null
        )}
      </span>
    </Tooltip>
  )
}

// ---------------------------------------------------------------------------
// Add-class picker with variant prefix support
// ---------------------------------------------------------------------------

function ClassPicker({
  currentClasses,
  onAdd,
}: {
  currentClasses: string[]
  onAdd: (cls: string) => void
}) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState("")
  const [selectedVariant, setSelectedVariant] = useState("")
  const [showVariants, setShowVariants] = useState(false)
  const [expandedColorCat, setExpandedColorCat] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus())
    else { setFilter(""); setSelectedVariant(""); setShowVariants(false); setExpandedColorCat(null) }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const lowerFilter = filter.toLowerCase()

  const filtered = useMemo(() => {
    if (!lowerFilter) return null
    const seen = new Set<string>()
    const results: TwEntry[] = []
    for (const e of SEARCHABLE_ENTRIES) {
      if (!seen.has(e.cls) && !currentClasses.includes(selectedVariant + e.cls) && (e.cls.includes(lowerFilter) || e.label.toLowerCase().includes(lowerFilter))) {
        seen.add(e.cls)
        results.push(e)
      }
    }
    for (const cat of COLOR_CATEGORIES) {
      for (const e of cat.entries) {
        if (!seen.has(e.cls) && !currentClasses.includes(selectedVariant + e.cls) && e.cls.includes(lowerFilter)) {
          seen.add(e.cls)
          results.push(e)
        }
      }
    }
    return results
  }, [lowerFilter, currentClasses, selectedVariant])

  const addWithVariant = useCallback((cls: string) => {
    onAdd(selectedVariant + cls)
  }, [selectedVariant, onAdd])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-0.5 text-[10px] font-medium text-blue-600 hover:text-blue-800 px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors cursor-pointer"
        title={t`Add class`}
      >
        <Plus className="h-3 w-3" />
        <Trans>Add class</Trans>
      </button>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="flex items-center gap-0.5 text-[10px] font-medium text-blue-600 px-1.5 py-0.5 rounded bg-blue-50 cursor-pointer"
      >
        <Plus className="h-3 w-3" />
        <Trans>Add class</Trans>
      </button>
      <div className="absolute top-full left-0 mt-1 w-[300px] bg-popover border rounded-lg shadow-lg z-[60] overflow-hidden">
        {/* Variant prefix selector — collapsed by default */}
        <div className="px-1.5 pt-1.5 pb-0.5">
          <button
            type="button"
            onClick={() => setShowVariants(!showVariants)}
            className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
          >
            <ChevronDown className={`h-2.5 w-2.5 transition-transform ${showVariants ? "rotate-0" : "-rotate-90"}`} />
            {selectedVariant ? (
              <span><Trans>Variant:</Trans> <span className="font-mono text-blue-600">{selectedVariant}</span></span>
            ) : (
              <Trans>Responsive / State variants</Trans>
            )}
          </button>
          {showVariants && (
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              <button
                type="button"
                onClick={() => setSelectedVariant("")}
                className={`text-[9px] px-1.5 py-0.5 rounded cursor-pointer transition-colors ${!selectedVariant ? "bg-blue-100 text-blue-700 font-medium" : "bg-muted hover:bg-accent"}`}
              >
                <Trans>base</Trans>
              </button>
              {TW_VARIANTS.map((v) => {
                const prefix = `${v}:`
                const active = selectedVariant === prefix
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setSelectedVariant(active ? "" : prefix)}
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded cursor-pointer transition-colors ${active ? "bg-blue-100 text-blue-700 font-medium" : "bg-muted hover:bg-accent"}`}
                  >
                    {v}:
                  </button>
                )
              })}
            </div>
          )}
        </div>
        {/* Search input */}
        <div className="px-1.5 pb-1.5 pt-0.5 border-b">
          <div className="flex items-center gap-1.5 bg-muted/50 rounded px-2 py-1">
            {selectedVariant && <span className="text-[10px] font-mono text-blue-500 shrink-0">{selectedVariant}</span>}
            <Search className="h-3 w-3 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false)
                if (e.key === "Enter" && filter.trim()) {
                  let target = filtered?.[0]?.cls ?? filter.trim()
                  // Avoid double variant: if user typed "hover:text-lg" and variant is "hover:", strip it
                  if (selectedVariant && target.startsWith(selectedVariant)) {
                    target = target.slice(selectedVariant.length)
                  }
                  const full = selectedVariant + target
                  if (!currentClasses.includes(full)) {
                    onAdd(full)
                    setFilter("")
                  }
                }
              }}
              placeholder={t`Type class name or search...`}
              className="bg-transparent text-xs outline-none w-full placeholder:text-muted-foreground"
            />
          </div>
        </div>
        <div className="max-h-[280px] overflow-y-auto p-1">
          {filtered !== null ? (
            filtered.length === 0 ? (
              <div className="text-[10px] text-muted-foreground px-2 py-3 text-center">
                {filter.trim() ? (
                  <span>
                    <Trans>Press Enter to add</Trans>{" "}
                    <code className="bg-muted px-1 rounded">{selectedVariant}{filter.trim()}</code>
                  </span>
                ) : (
                  <Trans>No matches</Trans>
                )}
              </div>
            ) : (
              <div className="py-0.5">
                {filtered.slice(0, 50).map((e) => {
                  const hex = colorHexFromBase(e.cls)
                  return (
                    <button
                      key={e.cls}
                      type="button"
                      onClick={() => { addWithVariant(e.cls); setFilter("") }}
                      className="w-full text-left flex items-center gap-2 px-2 py-1 text-[11px] rounded cursor-pointer hover:bg-accent transition-colors"
                    >
                      {hex && <ColorSwatch hex={hex} />}
                      <span className="font-mono text-[10px] shrink-0">{selectedVariant}{e.cls}</span>
                      <span className="text-muted-foreground truncate">{e.label}</span>
                    </button>
                  )
                })}
              </div>
            )
          ) : (
            <>
              {TAILWIND_CATEGORIES.map((cat) => {
                const available = cat.entries.filter((e) => !currentClasses.includes(selectedVariant + e.cls))
                if (available.length === 0) return null
                return (
                  <div key={cat.name} className="mb-2 last:mb-0">
                    <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider px-1.5 py-0.5">
                      {cat.name}
                    </div>
                    {available.map((e) => {
                      const hex = colorHexFromBase(e.cls)
                      return (
                        <button
                          key={e.cls}
                          type="button"
                          onClick={() => addWithVariant(e.cls)}
                          className="w-full text-left flex items-center gap-2 px-2 py-0.5 text-[11px] rounded cursor-pointer hover:bg-accent transition-colors"
                        >
                          {hex && <ColorSwatch hex={hex} />}
                          <span className="font-mono text-[10px] shrink-0">{selectedVariant}{e.cls}</span>
                          <span className="text-muted-foreground truncate">{e.label}</span>
                        </button>
                      )
                    })}
                  </div>
                )
              })}
              {COLOR_CATEGORIES.map((cat) => {
                const prefix = cat.name === "Background" ? "bg" as const
                  : cat.name === "Border Color" ? "border" as const
                  : "text" as const
                const isExpanded = expandedColorCat === cat.name
                return (
                  <div key={cat.name} className="mb-2 last:mb-0">
                    <button
                      type="button"
                      onClick={() => setExpandedColorCat(isExpanded ? null : cat.name)}
                      className="w-full flex items-center gap-1 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider px-1.5 py-0.5 hover:text-foreground cursor-pointer transition-colors"
                    >
                      <ChevronDown className={`h-2.5 w-2.5 transition-transform ${isExpanded ? "rotate-0" : "-rotate-90"}`} />
                      {cat.name}
                    </button>
                    {isExpanded && (
                      <div className="px-1.5 pt-1">
                        <ColorPalettePanel prefix={prefix} currentClass={null} onSelect={addWithVariant} />
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ClassChips container
// ---------------------------------------------------------------------------

function ClassChips({
  classes,
  onRemove,
  onAdd,
  onSwap,
}: {
  classes: string[]
  onRemove: (cls: string) => void
  onAdd: (cls: string) => void
  onSwap: (oldCls: string, newCls: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {classes.map((cls) => (
        <ClassChip
          key={cls}
          cls={cls}
          onRemove={() => onRemove(cls)}
          onSwap={(newCls) => onSwap(cls, newCls)}
        />
      ))}
      <ClassPicker currentClasses={classes} onAdd={onAdd} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main toolbar
// ---------------------------------------------------------------------------

export interface SectionEditToolbarProps {
  dataId: string
  rect: DOMRect
  containerOffset: { top: number; left: number }
  isImage: boolean
  /** True for container elements (div, section, button, etc.) — shows class editing only */
  isContainer?: boolean
  /** HTML tag name of the container element (e.g. "div", "section") */
  containerTagName?: string
  textType?: string
  isPruned?: boolean
  textTypes?: Record<string, string>
  imageSrc?: string
  elementClasses?: string[]
  onChangeTextType?: (dataId: string, newType: string) => void
  onTogglePrune?: (dataId: string) => void
  onCrop?: (dataId: string) => void
  onRecropFromPage?: (dataId: string) => void
  onReplace?: (dataId: string) => void
  onReplaceFromBook?: (dataId: string) => void
  onAiImage?: (dataId: string) => void
  onSegment?: (dataId: string) => void
  segmenting?: boolean
  onDelete?: (dataId: string) => void
  onClassesChange?: (dataId: string, classes: string[]) => void
}

export function SectionEditToolbar({
  dataId,
  rect,
  containerOffset,
  isImage,
  isContainer,
  containerTagName,
  textType,
  isPruned,
  textTypes,
  imageSrc,
  elementClasses,
  onChangeTextType,
  onTogglePrune,
  onCrop,
  onRecropFromPage,
  onReplace,
  onReplaceFromBook,
  onAiImage,
  onSegment,
  segmenting,
  onDelete,
  onClassesChange,
}: SectionEditToolbarProps) {
  const { t } = useLingui()
  const [cropMenuOpen, setCropMenuOpen] = useState(false)
  const [replaceMenuOpen, setReplaceMenuOpen] = useState(false)
  const cropMenuRef = useRef<HTMLDivElement>(null)
  const replaceMenuRef = useRef<HTMLDivElement>(null)

  // Close crop dropdown on outside click
  useEffect(() => {
    if (!cropMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (cropMenuRef.current && !cropMenuRef.current.contains(e.target as Node)) {
        setCropMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [cropMenuOpen])

  // Close replace dropdown on outside click
  useEffect(() => {
    if (!replaceMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (replaceMenuRef.current && !replaceMenuRef.current.contains(e.target as Node)) {
        setReplaceMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [replaceMenuOpen])

  if (!dataId) return null

  const handleRemoveClass = (cls: string) => {
    if (!elementClasses || !onClassesChange) return
    onClassesChange(dataId, elementClasses.filter((c) => c !== cls))
  }

  const handleAddClass = (cls: string) => {
    if (!onClassesChange) return
    const current = elementClasses ?? []
    if (current.includes(cls)) return
    onClassesChange(dataId, [...current, cls])
  }

  const handleSwapClass = (oldCls: string, newCls: string) => {
    if (!elementClasses || !onClassesChange) return
    if (oldCls === newCls) return
    onClassesChange(dataId, elementClasses.map((c) => (c === oldCls ? newCls : c)))
  }

  // Container element toolbar — class editing only
  if (isContainer) {
    const CONTAINER_POPOVER_H = 80
    const top = containerOffset.top + rect.top - CONTAINER_POPOVER_H
    const left = containerOffset.left + rect.left

    return (
      <div
        className="fixed z-50 bg-popover border rounded-md shadow-md px-2 py-1.5 space-y-1 max-w-[420px]"
        style={{
          top: Math.max(4, top),
          left: Math.max(4, Math.min(left, window.innerWidth - 430)),
        }}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5">
            &lt;{containerTagName ?? "div"}&gt;
          </span>
        </div>
        {elementClasses && onClassesChange && (
          <div className="border-t pt-1">
            <ClassChips classes={elementClasses} onRemove={handleRemoveClass} onAdd={handleAddClass} onSwap={handleSwapClass} />
          </div>
        )}
      </div>
    )
  }

  if (isImage) {
    const IMAGE_POPOVER_H = elementClasses && onClassesChange ? 160 : 110
    const top = containerOffset.top + rect.top - IMAGE_POPOVER_H
    const left = containerOffset.left + rect.left

    return (
      <div
        className="fixed z-50 bg-popover border rounded-lg shadow-lg w-[320px]"
        style={{
          top: Math.max(4, top),
          left: Math.max(4, Math.min(left, window.innerWidth - 330)),
        }}
      >
        <div className="p-2.5 space-y-2">
          <div className="flex items-start gap-2">
            {imageSrc && (
              <img src={imageSrc} alt={dataId} className="w-16 h-12 object-cover rounded border shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <span className="text-[10px] text-muted-foreground font-mono block truncate">{dataId}</span>
            </div>
          </div>
          {elementClasses && onClassesChange && (
            <div className="border-t pt-2">
              <ClassChips classes={elementClasses} onRemove={handleRemoveClass} onAdd={handleAddClass} onSwap={handleSwapClass} />
            </div>
          )}
          <div className="flex items-center gap-1 border-t pt-2 flex-wrap">
            {onCrop && (
              <div className="relative inline-flex" ref={cropMenuRef}>
                <button type="button" onClick={() => onCrop(dataId)} className={`flex items-center gap-1 text-[10px] font-medium px-2 py-1 bg-muted hover:bg-accent transition-colors cursor-pointer ${onRecropFromPage ? "rounded-l" : "rounded"}`}>
                  <Crop className="h-3 w-3" /><Trans>Crop</Trans>
                </button>
                {onRecropFromPage && (
                  <>
                    <button
                      type="button"
                      onClick={() => setCropMenuOpen(!cropMenuOpen)}
                      className="flex items-center text-[10px] font-medium rounded-r px-1 py-1 bg-muted hover:bg-accent transition-colors cursor-pointer border-l border-border"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                    {cropMenuOpen && (
                      <div className="absolute top-full left-0 mt-1 z-50 bg-popover border rounded shadow-md py-1 min-w-[150px]">
                        <button
                          type="button"
                          onClick={() => { setCropMenuOpen(false); onRecropFromPage(dataId) }}
                          className="w-full text-left px-3 py-1.5 text-[10px] hover:bg-accent transition-colors cursor-pointer"
                        >
                          <Trans>Recrop from Page</Trans>
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {onReplace && (
              <div className="relative inline-flex" ref={replaceMenuRef}>
                <button type="button" onClick={() => onReplace(dataId)} className={`flex items-center gap-1 text-[10px] font-medium px-2 py-1 bg-muted hover:bg-accent transition-colors cursor-pointer ${onReplaceFromBook ? "rounded-l" : "rounded"}`}>
                  <Upload className="h-3 w-3" /><Trans>Replace</Trans>
                </button>
                {onReplaceFromBook && (
                  <>
                    <button
                      type="button"
                      onClick={() => setReplaceMenuOpen(!replaceMenuOpen)}
                      className="flex items-center text-[10px] font-medium rounded-r px-1 py-1 bg-muted hover:bg-accent transition-colors cursor-pointer border-l border-border"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                    {replaceMenuOpen && (
                      <div className="absolute top-full left-0 mt-1 z-50 bg-popover border rounded shadow-md py-1 min-w-[150px]">
                        <button
                          type="button"
                          onClick={() => { setReplaceMenuOpen(false); onReplace(dataId) }}
                          className="w-full text-left px-3 py-1.5 text-[10px] hover:bg-accent transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          <Upload className="h-3 w-3" />
                          <Trans>Upload from Disk</Trans>
                        </button>
                        <button
                          type="button"
                          onClick={() => { setReplaceMenuOpen(false); onReplaceFromBook(dataId) }}
                          className="w-full text-left px-3 py-1.5 text-[10px] hover:bg-accent transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          <ImagePlus className="h-3 w-3" />
                          <Trans>Pick from Book</Trans>
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {onAiImage && (
              <button type="button" onClick={() => onAiImage(dataId)} className="flex items-center gap-1 text-[10px] font-medium rounded px-2 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 transition-colors cursor-pointer">
                <Sparkles className="h-3 w-3" /><Trans>AI</Trans>
              </button>
            )}
            {onSegment && (
              <button type="button" onClick={() => onSegment(dataId)} disabled={segmenting} className="flex items-center gap-1 text-[10px] font-medium rounded px-2 py-1 bg-orange-100 hover:bg-orange-200 text-orange-700 transition-colors cursor-pointer disabled:opacity-50">
                <Scissors className="h-3 w-3" />
                {segmenting ? <Trans>Segmenting...</Trans> : <Trans>Segment</Trans>}
              </button>
            )}
            {onDelete && (
              <button type="button" onClick={() => onDelete(dataId)} className="flex items-center gap-1 text-[10px] font-medium rounded px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 transition-colors cursor-pointer" title={t`Remove this block`}>
                <Trash2 className="h-3 w-3" /><Trans>Delete</Trans>
              </button>
            )}
            {onTogglePrune && (
              <button type="button" onClick={() => onTogglePrune(dataId)} className="flex items-center gap-1 text-[10px] font-medium rounded px-2 py-1 hover:bg-accent transition-colors cursor-pointer ml-auto" title={isPruned ? t`Restore element` : t`Prune element`}>
                {isPruned ? (
                  <><EyeOff className="h-3 w-3 text-destructive" /><span className="text-destructive"><Trans>Pruned</Trans></span></>
                ) : (
                  <><Eye className="h-3 w-3 text-muted-foreground" /><span><Trans>Prune</Trans></span></>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Text toolbar
  const TOOLBAR_H = 62
  const topBelow = containerOffset.top + rect.bottom + 4
  const topAbove = containerOffset.top + rect.top - TOOLBAR_H - 4
  const top = window.innerHeight - topBelow >= TOOLBAR_H + 8 ? topBelow : Math.max(4, topAbove)
  const left = containerOffset.left + rect.left

  return (
    <div
      className="fixed z-50 bg-popover border rounded-md shadow-md px-2 py-1.5 space-y-1 max-w-[420px]"
      style={{
        top: Math.max(4, top),
        left: Math.max(4, Math.min(left, window.innerWidth - 430)),
      }}
    >
      <div className="flex items-center gap-1.5">
        <Type className="h-3 w-3 text-muted-foreground shrink-0" />
        {textTypes && onChangeTextType ? (
          <Select value={textType ?? ""} onValueChange={(val) => onChangeTextType(dataId, val)}>
            <SelectTrigger className="h-6 text-[10px] px-1.5 py-0 min-w-[80px] border-0 bg-muted/50">
              <SelectValue>{textType ?? ""}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(textTypes).map(([key, desc]) => (
                <SelectItem key={key} value={key} className="text-xs">
                  {key}<span className="ml-1 text-muted-foreground text-[10px]">{desc}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          textType && <span className="text-[10px] font-medium text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5">{textType}</span>
        )}
        <span className="flex items-center gap-0.5 text-[10px] text-blue-500">
          <Pencil className="h-2.5 w-2.5" /><Trans>Editing</Trans>
        </span>
        {onDelete && (
          <button type="button" onClick={() => onDelete(dataId)} className="p-0.5 rounded hover:bg-red-100 transition-colors cursor-pointer" title={t`Remove this block`}>
            <Trash2 className="h-3 w-3 text-red-600" />
          </button>
        )}
        {onTogglePrune && (
          <button type="button" onClick={() => onTogglePrune(dataId)} className="p-0.5 rounded hover:bg-accent transition-colors cursor-pointer" title={isPruned ? t`Restore element` : t`Prune element`}>
            {isPruned ? <EyeOff className="h-3 w-3 text-destructive" /> : <Eye className="h-3 w-3 text-muted-foreground" />}
          </button>
        )}
      </div>
      {elementClasses && onClassesChange && (
        <div className="border-t pt-1">
          <ClassChips classes={elementClasses} onRemove={handleRemoveClass} onAdd={handleAddClass} onSwap={handleSwapClass} />
        </div>
      )}
    </div>
  )
}
