import tseslint from "typescript-eslint"
import linguiPlugin from "eslint-plugin-lingui"

export default [
  { ignores: ["src/routeTree.gen.ts", "src/locales/**/*", "src/i18n/locales.ts", "dist/**", "src/**/*.test.*", "src/**/*.d.ts"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { lingui: linguiPlugin },
    rules: {
      "lingui/no-unlocalized-strings": [
        "error",
        {
          ignoreNames: [
            // --- HTML / JSX structural attributes ---
            "className",
            "style",
            "id",
            "type",
            "href",
            "src",
            "key",
            "name",
            "accept",
            "method",
            "action",
            "target",
            "rel",
            "pattern",
            "autoComplete",
            "encType",
            "sandbox",
            "scrolling",
            "charset",
            "role",
            "loading",
            "htmlFor",
            "data-testid",
            { regex: { pattern: "^data-" } },
            // Identifier-like prop/variable ending with "id" or "Id" (e.g. pageid, pageId, studentId)
            { regex: { pattern: "^[A-Za-z0-9_]*(id|Id)$" } },

            // --- SVG attributes ---
            "fill",
            "d",
            "viewBox",
            "strokeLinecap",
            "strokeDasharray",

            // --- Radix UI / shadcn layout props ---
            "variant",
            "size",
            "align",
            "side",
            // CSS position keys used as object keys mapping to class strings (e.g. sheetVariants)
            "top",
            "bottom",
            "left",
            "right",

            // --- Router / navigation props ---
            "to",
            "step",
            "tab",

            // --- Form / input props (non-visible values) ---
            "defaultValue",
            "value",

            // --- CSS class & color props (never user-visible) ---
            "rootMargin",
            "color",
            "hex",
            "textColor",
            "bgLight",
            "borderColor",
            "borderDark",
            "iconColor",
            "colorClass",

            // --- Data labels (technical CSS descriptions, pipeline labels — not user-facing prose) ---
            "label",

            // --- Pipeline / config identifiers ---
            "slug",
            "stageSlug",
            "promptName",
            "node",
            "mode",
            "direction",
            "fromStage",
            "toStage",

            // --- CSS utility class variable names (StageSidebar layout constants) ---
            "gap",
            "showLabel",
            "showFlex",
            "flex1",

            // --- iframe srcdoc / injected style strings (never user-visible) ---
            "srcdoc",
            "interactiveStyles",
            "textContent",

            // --- TanStack Query cache keys ---
            "queryKey",

            // --- File dialog / download props (Tauri + browser) ---
            "defaultPath",
            "download",
            "filters",
            "extensions",

            // --- React internals ---
            "displayName",

            // --- i18n locale metadata (intentionally not translated — must stay in native script) ---
            "LOCALE_LABEL_MESSAGES",
            "LOCALE_FLAGS",
          ],
          ignoreFunctions: [
            // --- Console / logging ---
            "console.*",
            "*.log",
            "*.warn",
            "*.error",
            "*.info",
            "*.debug",

            // --- Error constructors ---
            "Error",
            "TypeError",
            "RangeError",

            // --- Module system ---
            "require",

            // --- API / fetch calls (URL strings are never translatable) ---
            "request",
            "fetch",

            // --- DOM manipulation ---
            "document.createElement",
            "*.setAttribute",
            "*.removeAttribute",
            "*.getAttribute",
            "*.querySelector",
            "*.querySelectorAll",
            "*.closest",
            "*.append",
            "*.prepend",
            "*.setProperty",
            "*.open",
            "*.getContext",

            // --- DOM event types ---
            "*.addEventListener",
            "*.removeEventListener",
            "*.scrollIntoView",

            // --- String / array operations (used for internal comparisons) ---
            "*.replace",
            "*.startsWith",
            "*.endsWith",
            "*.includes",

            // --- URL / search params manipulation ---
            "*.set",
            "*.get",
            "*.delete",
            "new URL",

            // --- TanStack Router route definitions ---
            "createFileRoute",

            // --- CSS class composition utilities ---
            "cn",
            "cva",
            "clsx",

            // --- Math / formatting (unit suffixes in template literals) ---
            "*.toFixed",
          ],
          ignore: [
            // npm package names and module paths (e.g. "@tanstack/react-router")
            "^@?[a-zA-Z0-9_-]+(/[a-zA-Z0-9_.-]+)+",
            // TypeScript import() / type strings using path aliases (e.g. "@/api/client")
            "^@/[a-zA-Z0-9_.-]+(/[a-zA-Z0-9_.-]+)*$",
            // locale codes (e.g. "en", "pt-BR", "es")
            "^[a-z]{2}(-[A-Z]{2})?$",
            // absolute URLs
            "^https?://",
            // relative URL paths (e.g. "/api", "/books/${label}")
            "^/[a-zA-Z0-9_-]",
            // Tailwind CSS classes, internal identifiers, and status values
            // (all-lowercase-no-spaces: bg-gray-600, hover:bg-white, gap-2.5, "success", "error", "done")
            "^[a-z][a-z0-9._:-]*$",
            // Multi-class Tailwind strings (space-separated tokens, e.g. "bg-red-600 text-white hover:bg-red-700")
            "^[a-z][a-z0-9._:/-]*( [a-z!][a-z0-9._:/-]*)+$",
            // Hex color values (e.g. "#ffffff", "#2563eb")
            "^#[0-9a-fA-F]+$",
            // CSS dimension values (e.g. "10px", "1.5rem", "48px")
            "^[0-9]",
            // React Server Components directives (shadcn boilerplate)
            "^use (client|server)$",
            // Brand name (never translated)
            "^ADT Studio$",
            // Data URIs (e.g. "data:image/png;base64,...")
            "^data:",
            // HTML fragments used in innerHTML assignments (e.g. `<div id="content">`)
            "^<[a-z]",
            // Closing HTML tags used in string operations (e.g. "</section>")
            "^</[a-z]",
            // CSS selectors and rule blocks (e.g. `[data-id="..."]`, `body[data-editable=...] {...}`)
            "^[\\[.]?[a-z].*\\{",
            "^\\[data-",
            // Underscore-prefixed internal ID fragments (e.g. "_tx" in data-id template literals)
            "^_[a-z]",
          ],
        },
      ],
      "lingui/t-call-in-function": "error",
    },
  },
]
