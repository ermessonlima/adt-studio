import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { createBookStorage } from '../packages/storage/dist/index.js'
import { loadBookConfig, normalizeLocale, packageAdtWeb, runAccessibilityAssessment } from '../packages/pipeline/dist/index.js'

const DEFAULT_BOOKS_ROOT = path.resolve('books')
const DEFAULT_WEB_ASSETS_DIR = path.resolve('assets/adt')
const DEFAULT_CURATED_LIST = path.resolve('scripts/curated-a11y-books.txt')
const DEFAULT_TARGET_RULES = [
  'aria-allowed-role',
  'region',
  'landmark-one-main',
  'page-has-heading-one',
  'image-alt',
] as const

type AssessmentResult = Awaited<ReturnType<typeof runAccessibilityAssessment>>
type OutputFormat = 'markdown' | 'json'

type RuleCounts = { before: number | 'n/a'; after: number }
type BookSummary = {
  label: string
  pagesBefore?: number
  pagesAfter?: number
  beforeError?: string
  error?: string
  rules?: Record<string, RuleCounts>
  topAfter?: Array<[string, number]>
}

type RegressionReport = {
  generatedAt: string
  booksRoot: string
  curatedListPath: string
  selectedLabels: string[]
  missingLabels: string[]
  results: BookSummary[]
  targetRules: readonly string[]
}

const cliArgs = process.argv.slice(2).filter((arg) => arg !== "--")

const options = parseArgs({
  args: cliArgs,
  options: {
    'books-root': { type: 'string' },
    'web-assets-dir': { type: 'string' },
    'book-list': { type: 'string' },
    'book': { type: 'string', multiple: true },
    'format': { type: 'string' },
    'out': { type: 'string' },
    'build': { type: 'boolean', default: false },
    'quiet-build': { type: 'boolean', default: false },
  },
  allowPositionals: false,
})

const booksRoot = path.resolve(options.values['books-root'] ?? DEFAULT_BOOKS_ROOT)
const webAssetsDir = path.resolve(options.values['web-assets-dir'] ?? DEFAULT_WEB_ASSETS_DIR)
const curatedListPath = path.resolve(options.values['book-list'] ?? DEFAULT_CURATED_LIST)
const requestedLabels = options.values.book ?? []
const format = (options.values.format ?? 'markdown') as OutputFormat
const outPath = options.values.out ? path.resolve(options.values.out) : null
const shouldBuild = options.values.build
const quietBuild = options.values['quiet-build']

if (format !== 'markdown' && format !== 'json') {
  throw new Error(`Unsupported format: ${format}`)
}

function readCuratedBookLabels(): string[] {
  const raw = fs.readFileSync(curatedListPath, 'utf-8')
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
}

function countViolations(result: AssessmentResult): Map<string, number> {
  const counts = new Map<string, number>()
  for (const page of result.pages) {
    for (const violation of page.violations) {
      counts.set(violation.id, (counts.get(violation.id) ?? 0) + 1)
    }
  }
  return counts
}

async function assessBook(label: string): Promise<BookSummary> {
  const sourceBookDir = path.join(booksRoot, label)
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'adt-a11y-'))
  try {
    const tempBookDir = path.join(tempRoot, label)
    fs.cpSync(sourceBookDir, tempBookDir, { recursive: true })

    let before: AssessmentResult | null = null
    let beforeError: string | undefined

    try {
      before = await runAccessibilityAssessment({ bookDir: tempBookDir })
    } catch (error) {
      beforeError = error instanceof Error ? error.message : String(error)
    }

    const storage = createBookStorage(label, tempRoot)
    try {
      const config = loadBookConfig(label, tempRoot)
      const metadataRow = storage.getLatestNodeData('metadata', 'book')
      const metadata = metadataRow?.data as { title?: string | null; language_code?: string | null } | null
      const language = normalizeLocale(config.editing_language ?? metadata?.language_code ?? 'en')
      const outputLanguages = Array.from(
        new Set(
          (config.output_languages?.length ? config.output_languages : [language]).map((code) => normalizeLocale(code))
        )
      )
      const title = metadata?.title ?? label

      await packageAdtWeb(storage, {
        bookDir: tempBookDir,
        label,
        language,
        outputLanguages,
        title,
        webAssetsDir,
        applyBodyBackground: config.apply_body_background,
      })
    } finally {
      storage.close()
    }

    try {
      const after = await runAccessibilityAssessment({ bookDir: tempBookDir })
      const afterCounts = countViolations(after)
      const beforeCounts = before ? countViolations(before) : null

      return {
        label,
        pagesBefore: before?.summary.pageCount,
        pagesAfter: after.summary.pageCount,
        beforeError,
        rules: Object.fromEntries(
          DEFAULT_TARGET_RULES.map((rule) => [
            rule,
            {
              before: beforeCounts ? (beforeCounts.get(rule) ?? 0) : 'n/a',
              after: afterCounts.get(rule) ?? 0,
            },
          ])
        ),
        topAfter: Array.from(afterCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6),
      }
    } catch (error) {
      return {
        label,
        pagesBefore: before?.summary.pageCount,
        beforeError,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

function buildReport(selectedLabels: string[], missingLabels: string[], results: BookSummary[]): RegressionReport {
  return {
    generatedAt: new Date().toISOString(),
    booksRoot,
    curatedListPath,
    selectedLabels,
    missingLabels,
    results,
    targetRules: DEFAULT_TARGET_RULES,
  }
}

function renderMarkdown(report: RegressionReport): string {
  const lines: string[] = []
  lines.push('# Curated Accessibility Regression')
  lines.push('')
  lines.push(`- Generated: ${report.generatedAt}`)
  lines.push(`- Books root: ${report.booksRoot}`)
  lines.push(`- Curated list: ${report.curatedListPath}`)
  lines.push(`- Books assessed: ${report.selectedLabels.length}`)
  lines.push('')
  lines.push('## Selected Labels')
  lines.push('')
  for (const label of report.selectedLabels) {
    lines.push(`- \`${label}\``)
  }
  if (report.missingLabels.length > 0) {
    lines.push('')
    lines.push('## Missing Local Books')
    lines.push('')
    for (const label of report.missingLabels) {
      lines.push(`- \`${label}\``)
    }
  }
  lines.push('')
  lines.push('## Results')
  lines.push('')

  for (const result of report.results) {
    lines.push(`### \`${result.label}\``)
    if (result.beforeError) {
      lines.push(`- Before assessment: ${result.beforeError}`)
    }
    if (result.error) {
      lines.push(`- Error: ${result.error}`)
      lines.push('')
      continue
    }
    lines.push(`- Pages: ${result.pagesBefore ?? 'n/a'} -> ${result.pagesAfter ?? 'n/a'}`)
    for (const rule of DEFAULT_TARGET_RULES) {
      const counts = result.rules?.[rule]
      if (!counts) continue
      lines.push(`- ${rule}: ${counts.before} -> ${counts.after}`)
    }
    const topAfter = result.topAfter?.map(([id, count]) => `\`${id}:${count}\``).join(', ') ?? 'none'
    lines.push(`- Top after: ${topAfter || 'none'}`)
    lines.push('')
  }

  return `${lines.join('\n')}\n`
}

async function maybeBuild(): Promise<void> {
  if (!shouldBuild) return
  const { execFileSync } = await import('node:child_process')
  execFileSync('pnpm', ['build'], {
    stdio: quietBuild ? 'ignore' : 'inherit',
    cwd: process.cwd(),
  })
}

await maybeBuild()
const curatedLabels = requestedLabels.length > 0 ? requestedLabels : readCuratedBookLabels()
const selectedLabels = curatedLabels.filter((label) => fs.existsSync(path.join(booksRoot, label)))
const missingLabels = curatedLabels.filter((label) => !fs.existsSync(path.join(booksRoot, label)))
const results: BookSummary[] = []
for (const label of selectedLabels) {
  results.push(await assessBook(label))
}
const report = buildReport(selectedLabels, missingLabels, results)
const output = format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : renderMarkdown(report)

if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, output)
  console.log(`Saved ${format} report: ${outPath}`)
} else {
  process.stdout.write(output)
}
