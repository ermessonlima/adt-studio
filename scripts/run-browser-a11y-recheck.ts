import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { createBookStorage } from '../packages/storage/dist/index.js'
import {
  loadBookConfig,
  normalizeLocale,
  packageAdtWeb,
  runAccessibilityAssessment,
  runBrowserAccessibilityAssessment,
} from '../packages/pipeline/dist/index.js'
import type {
  AccessibilityAssessmentOutput,
  BrowserAccessibilityAssessmentOutput,
} from '../packages/types/dist/index.js'

const DEFAULT_BOOKS_ROOT = path.resolve('books')
const DEFAULT_WEB_ASSETS_DIR = path.resolve('assets/adt')
const DEFAULT_CURATED_LIST = path.resolve('scripts/curated-a11y-books.txt')

type OutputFormat = 'markdown' | 'json'
type BookSummary = {
  label: string
  pageCount?: number
  baseIncompleteCount?: number
  basePagesWithIncomplete?: number
  browserRecheckedPages?: number
  browserRuleIds?: string[]
  confirmedIssuesFromIncomplete?: number
  resolvedIncompleteItems?: number
  residualManualReviewItems?: number
  browserViolationCount?: number
  browserIncompleteCount?: number
  contrastViolationCount?: number
  topBrowserViolations?: Array<[string, number]>
  topBrowserIncomplete?: Array<[string, number]>
  error?: string
}

type BrowserRecheckReport = {
  generatedAt: string
  booksRoot: string
  curatedListPath: string
  selectedLabels: string[]
  missingLabels: string[]
  fullPageRuleIds: string[]
  results: BookSummary[]
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
    'full-page-rule': { type: 'string', multiple: true },
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
const fullPageRuleIds = options.values['full-page-rule']?.length
  ? Array.from(new Set(options.values['full-page-rule']))
  : ['color-contrast']

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

function countFindingsById(
  pages: Array<{ violations: Array<{ id: string }>; incomplete: Array<{ id: string }> }>,
  key: 'violations' | 'incomplete',
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const page of pages) {
    for (const finding of page[key]) {
      counts.set(finding.id, (counts.get(finding.id) ?? 0) + 1)
    }
  }
  return counts
}

function getPageRulePairs(
  pages: Array<{ href: string; violations: Array<{ id: string }>; incomplete: Array<{ id: string }> }>,
  key: 'violations' | 'incomplete',
): string[] {
  const pairs: string[] = []
  for (const page of pages) {
    for (const finding of page[key]) {
      pairs.push(`${page.href}::${finding.id}`)
    }
  }
  return pairs
}

function summarizeBrowserRecheck(
  base: AccessibilityAssessmentOutput,
  browser: BrowserAccessibilityAssessmentOutput,
): Omit<BookSummary, 'label' | 'error'> {
  const baseIncompletePairs = getPageRulePairs(base.pages, 'incomplete')
  const browserViolationPairs = new Set(getPageRulePairs(browser.pages, 'violations'))
  const browserIncompletePairs = new Set(getPageRulePairs(browser.pages, 'incomplete'))
  const confirmedIssuesFromIncomplete = baseIncompletePairs.filter((pair) => browserViolationPairs.has(pair)).length
  const residualManualReviewItems = baseIncompletePairs.filter((pair) => browserIncompletePairs.has(pair)).length
  const resolvedIncompleteItems = Math.max(
    0,
    baseIncompletePairs.length - confirmedIssuesFromIncomplete - residualManualReviewItems,
  )
  const browserViolationCounts = countFindingsById(browser.pages, 'violations')
  const browserIncompleteCounts = countFindingsById(browser.pages, 'incomplete')

  return {
    pageCount: base.summary.pageCount,
    baseIncompleteCount: base.summary.incompleteCount,
    basePagesWithIncomplete: base.pages.filter((page) => page.incompleteCount > 0).length,
    browserRecheckedPages: browser.summary.recheckedPageCount,
    browserRuleIds: browser.ruleIds,
    confirmedIssuesFromIncomplete,
    resolvedIncompleteItems,
    residualManualReviewItems,
    browserViolationCount: browser.summary.violationCount,
    browserIncompleteCount: browser.summary.incompleteCount,
    contrastViolationCount: browserViolationCounts.get('color-contrast') ?? 0,
    topBrowserViolations: Array.from(browserViolationCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6),
    topBrowserIncomplete: Array.from(browserIncompleteCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6),
  }
}

async function assessBook(label: string): Promise<BookSummary> {
  const sourceBookDir = path.join(booksRoot, label)
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'adt-a11y-browser-'))
  try {
    const tempBookDir = path.join(tempRoot, label)
    fs.cpSync(sourceBookDir, tempBookDir, { recursive: true })

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
      const base = await runAccessibilityAssessment({ bookDir: tempBookDir })
      const browser = await runBrowserAccessibilityAssessment({
        bookDir: tempBookDir,
        baseAssessment: base,
        fullPageRuleIds,
      })

      return {
        label,
        ...summarizeBrowserRecheck(base, browser),
      }
    } catch (error) {
      return {
        label,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

function buildReport(selectedLabels: string[], missingLabels: string[], results: BookSummary[]): BrowserRecheckReport {
  return {
    generatedAt: new Date().toISOString(),
    booksRoot,
    curatedListPath,
    selectedLabels,
    missingLabels,
    fullPageRuleIds,
    results,
  }
}

function renderMarkdown(report: BrowserRecheckReport): string {
  const lines: string[] = []
  lines.push('# Browser Accessibility Recheck')
  lines.push('')
  lines.push(`- Generated: ${report.generatedAt}`)
  lines.push(`- Books root: ${report.booksRoot}`)
  lines.push(`- Curated list: ${report.curatedListPath}`)
  lines.push(`- Books assessed: ${report.selectedLabels.length}`)
  lines.push(`- Full-page browser rules: ${report.fullPageRuleIds.map((rule) => `\`${rule}\``).join(', ') || 'none'}`)
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
    if (result.error) {
      lines.push(`- Error: ${result.error}`)
      lines.push('')
      continue
    }
    lines.push(`- Pages packaged: ${result.pageCount ?? 'n/a'}`)
    lines.push(`- Base manual-review findings: ${result.baseIncompleteCount ?? 0} across ${result.basePagesWithIncomplete ?? 0} pages`)
    lines.push(`- Browser rechecked pages: ${result.browserRecheckedPages ?? 0}`)
    lines.push(`- Browser rules used: ${result.browserRuleIds?.map((rule) => `\`${rule}\``).join(', ') || 'none'}`)
    lines.push(`- Manual-review queue after browser pass: ${result.residualManualReviewItems ?? 0} remaining, ${result.resolvedIncompleteItems ?? 0} resolved, ${result.confirmedIssuesFromIncomplete ?? 0} confirmed issues`)
    lines.push(`- Browser violations: ${result.browserViolationCount ?? 0}`)
    lines.push(`- Browser incomplete: ${result.browserIncompleteCount ?? 0}`)
    lines.push(`- Browser color-contrast violations: ${result.contrastViolationCount ?? 0}`)
    const topViolations = result.topBrowserViolations?.map(([id, count]) => `\`${id}:${count}\``).join(', ') || 'none'
    const topIncomplete = result.topBrowserIncomplete?.map(([id, count]) => `\`${id}:${count}\``).join(', ') || 'none'
    lines.push(`- Top browser violations: ${topViolations}`)
    lines.push(`- Top browser manual-review items: ${topIncomplete}`)
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
