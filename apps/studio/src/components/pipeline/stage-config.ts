import {
  BookMarked,
  FileText,
  LayoutGrid,
  HelpCircle,
  Image,
  BookOpen,
  List,
  Languages,
  AudioLines,
  Eye,
  ShieldCheck,
  FileDown,
  Hand,
  type LucideIcon,
} from "lucide-react"

export const STAGES = [
  { slug: "book", label: "Book", runningLabel: "Loading Book", icon: BookMarked, color: "bg-gray-600", hex: "#4b5563", textColor: "text-gray-600", bgLight: "bg-gray-50", borderColor: "border-gray-200", borderDark: "border-gray-600" },
  { slug: "extract", label: "Extract", runningLabel: "Extracting", icon: FileText, color: "bg-blue-600", hex: "#2563eb", textColor: "text-blue-600", bgLight: "bg-blue-50", borderColor: "border-blue-200", borderDark: "border-blue-600" },
  { slug: "storyboard", label: "Storyboard", runningLabel: "Building Storyboard", icon: LayoutGrid, color: "bg-violet-600", hex: "#7c3aed", textColor: "text-violet-600", bgLight: "bg-violet-50", borderColor: "border-violet-200", borderDark: "border-violet-600" },
  { slug: "quizzes", label: "Quizzes", runningLabel: "Generating Quizzes", icon: HelpCircle, color: "bg-orange-600", hex: "#ea580c", textColor: "text-orange-600", bgLight: "bg-orange-50", borderColor: "border-orange-200", borderDark: "border-orange-600" },
  { slug: "captions", label: "Image Captions", runningLabel: "Captioning Images", icon: Image, color: "bg-teal-600", hex: "#0d9488", textColor: "text-teal-600", bgLight: "bg-teal-50", borderColor: "border-teal-200", borderDark: "border-teal-600" },
  { slug: "glossary", label: "Glossary", runningLabel: "Generating Glossary", icon: BookOpen, color: "bg-lime-600", hex: "#65a30d", textColor: "text-lime-600", bgLight: "bg-lime-50", borderColor: "border-lime-200", borderDark: "border-lime-600" },
  { slug: "toc", label: "Table of Contents", runningLabel: "Generating TOC", icon: List, color: "bg-amber-600", hex: "#d97706", textColor: "text-amber-600", bgLight: "bg-amber-50", borderColor: "border-amber-200", borderDark: "border-amber-600" },
  { slug: "translate", label: "Language", runningLabel: "Translating", icon: Languages, color: "bg-pink-600", hex: "#db2777", textColor: "text-pink-600", bgLight: "bg-pink-50", borderColor: "border-pink-200", borderDark: "border-pink-600" },
  { slug: "speech", label: "Speech", runningLabel: "Generating Speech", icon: AudioLines, color: "bg-rose-600", hex: "#e11d48", textColor: "text-rose-600", bgLight: "bg-rose-50", borderColor: "border-rose-200", borderDark: "border-rose-600" },
  { slug: "sign-language", label: "Sign Language", runningLabel: "Sign Language", icon: Hand, color: "bg-cyan-600", hex: "#0891b2", textColor: "text-cyan-600", bgLight: "bg-cyan-50", borderColor: "border-cyan-200", borderDark: "border-cyan-600" },
  { slug: "validation", label: "Validation", runningLabel: "Running Validation", icon: ShieldCheck, color: "bg-emerald-600", hex: "#059669", textColor: "text-emerald-600", bgLight: "bg-emerald-50", borderColor: "border-emerald-200", borderDark: "border-emerald-600" },
  { slug: "preview", label: "Preview", runningLabel: "Building Preview", icon: Eye, color: "bg-gray-600", hex: "#4b5563", textColor: "text-gray-600", bgLight: "bg-gray-50", borderColor: "border-gray-200", borderDark: "border-gray-600" },
  { slug: "export", label: "Export", runningLabel: "Exporting", icon: FileDown, color: "bg-indigo-700", hex: "#4338ca", textColor: "text-indigo-700", bgLight: "bg-indigo-50", borderColor: "border-indigo-200", borderDark: "border-indigo-700" },
] as const satisfies ReadonlyArray<{
  slug: string
  label: string
  runningLabel: string
  icon: LucideIcon
  color: string
  hex: string
  textColor: string
  bgLight: string
  borderColor: string
  borderDark: string
}>

export type StageSlug = (typeof STAGES)[number]["slug"]
export type NonBookStageSlug = Exclude<StageSlug, "book">
export type PipelineStageSlug = Exclude<StageSlug, "book" | "sign-language" | "validation" | "export">
export type StageDefinition = (typeof STAGES)[number]
export type NonBookStageDefinition = Extract<StageDefinition, { slug: NonBookStageSlug }>
export type PipelineStageDefinition = Extract<StageDefinition, { slug: PipelineStageSlug }>

export const STAGE_DESCRIPTIONS: Record<NonBookStageSlug, string> = {
  extract: "Extract text and images from each page of the PDF using AI-powered analysis.",
  storyboard: "Arrange extracted content into a structured storyboard with pages, sections, and layouts.",
  quizzes: "Generate comprehension quizzes and activities based on the book content.",
  captions: "Create descriptive captions for images to improve accessibility.",
  glossary: "Build a glossary of key terms and definitions found in the text.",
  toc: "Generate and customize the table of contents for the book navigation.",
  translate: "Translate the book content to output languages.",
  speech: "Generate audio narration for the book content.",
  "sign-language": "Upload and assign sign language videos to book pages.",
  validation: "Run whole-book validation checks and configure accessibility assessment settings.",
  preview: "Package and preview the final ADT web application.",
  export: "Export packaged ADTs and related artifacts for delivery.",
}

/** Stages that have a per-page navigation panel. */
export const STAGES_WITH_PAGES = new Set<StageSlug>([
  "storyboard",
  "quizzes",
  "captions",
  "translate",
  "speech",
])

const STAGE_SLUG_SET = new Set<StageSlug>(STAGES.map((stage) => stage.slug))

export function isStageSlug(slug: string): slug is StageSlug {
  return STAGE_SLUG_SET.has(slug as StageSlug)
}

export function hasStagePages(slug: string): boolean {
  return isStageSlug(slug) && STAGES_WITH_PAGES.has(slug)
}

export function isBookOverviewStage(stage: StageDefinition): stage is NonBookStageDefinition {
  return stage.slug !== "book"
}

export function isPipelineStage(stage: StageDefinition): stage is PipelineStageDefinition {
  return stage.slug !== "book" && stage.slug !== "sign-language" && stage.slug !== "validation" && stage.slug !== "export"
}

export function getBookOverviewStages(): NonBookStageDefinition[] {
  return STAGES.filter(isBookOverviewStage)
}

export function getPipelineStages(): PipelineStageDefinition[] {
  return STAGES.filter(isPipelineStage)
}

export function toCamelLabel(label: string): string {
  return label
    .split(/[-_]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("")
}

export function isStageCompleted(slug: string, completedStages: Record<string, boolean>): boolean {
  return !!completedStages[slug]
}
