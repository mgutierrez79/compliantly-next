#!/usr/bin/env node
// i18n-coverage — show which `t()` keys are still untranslated per
// language, sorted by how often they appear in the codebase.
//
// Pattern in use throughout the app:
//
//   t('English text', 'English text')
//
// where the first arg is the key (always English) and the second is
// the fallback. We scan all .tsx in src/views + src/components for
// these calls, dedupe + count occurrences, then check each
// non-English language block in src/lib/i18n.tsx for the matching
// key. Missing keys = work to do. Output is ranked: most-used keys
// first so each translation batch hits the highest-impact strings.
//
// Usage:
//   node scripts/i18n-coverage.mjs              # summary table + top
//                                                  20 missing per lang
//   node scripts/i18n-coverage.mjs --lang fr    # full list for FR
//   node scripts/i18n-coverage.mjs --lang fr --top 100
//   node scripts/i18n-coverage.mjs --json       # raw JSON, all langs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from '@babel/parser'
import traverseDefault from '@babel/traverse'
import { looksLikePlaceholderOrTechnical } from './i18n-extract.mjs'

const traverse = traverseDefault.default ?? traverseDefault

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

const NON_ENGLISH_LANGS = ['fr', 'es', 'de', 'lt']

// 1. Collect every t() call's first argument across src/views + src/components.
function collectTranslationKeys() {
  const counts = new Map() // key -> occurrence count
  const roots = [
    path.join(projectRoot, 'src', 'views'),
    path.join(projectRoot, 'src', 'components'),
  ]
  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    for (const file of fs.readdirSync(root)) {
      if (!file.endsWith('.tsx')) continue
      const filePath = path.join(root, file)
      const source = fs.readFileSync(filePath, 'utf8')
      let ast
      try {
        ast = parse(source, {
          sourceType: 'module',
          plugins: ['jsx', 'typescript'],
        })
      } catch {
        continue
      }
      traverse(ast, {
        CallExpression(p) {
          const callee = p.node.callee
          if (callee.type !== 'Identifier' || callee.name !== 't') return
          const first = p.node.arguments[0]
          if (!first || first.type !== 'StringLiteral') return
          const key = first.value
          counts.set(key, (counts.get(key) || 0) + 1)
        },
      })
    }
  }
  return counts
}

// 2. Parse src/lib/i18n.tsx and return Set<string> of declared keys per
// language. We use a regex pass through the file rather than full AST
// because the dictionaries are huge and the structure is consistent:
// each block opens with `<lang>: {`, each entry is `'Key': '...'` or
// `BareKey: '...'`, and the block closes with `},`.
function readDictionaryKeys() {
  const i18nPath = path.join(projectRoot, 'src', 'lib', 'i18n.tsx')
  const source = fs.readFileSync(i18nPath, 'utf8')
  const result = {}
  for (const lang of NON_ENGLISH_LANGS) {
    // Match the opening of the language block, then everything up to
    // the next top-level `},` matching the closure. Use a
    // non-greedy capture; the dictionary blocks are flat.
    const openRe = new RegExp(`^\\s+${lang}:\\s*\\{`, 'm')
    const open = openRe.exec(source)
    if (!open) {
      result[lang] = new Set()
      continue
    }
    // Find balanced closing brace from the opening position.
    let depth = 1
    let i = open.index + open[0].length
    while (i < source.length && depth > 0) {
      const c = source[i]
      if (c === '{') depth++
      else if (c === '}') depth--
      i++
    }
    const block = source.slice(open.index + open[0].length, i - 1)
    const keys = new Set()
    // Quoted-key entries: 'Key with space': 'value',
    const quotedKeyRe = /(?<![A-Za-z0-9_])'((?:[^'\\]|\\.)+)'\s*:/g
    for (const m of block.matchAll(quotedKeyRe)) {
      keys.add(m[1].replace(/\\'/g, "'"))
    }
    // Bare identifier entries: BareKey: 'value', — match identifier
    // at start of line (after whitespace), followed by colon.
    const bareKeyRe = /^[ \t]+([A-Za-z_][A-Za-z0-9_]*)\s*:/gm
    for (const m of block.matchAll(bareKeyRe)) {
      keys.add(m[1])
    }
    result[lang] = keys
  }
  return result
}

function main() {
  const argv = process.argv.slice(2)
  const jsonOut = argv.includes('--json')
  const langIdx = argv.indexOf('--lang')
  const focusLang = langIdx >= 0 ? argv[langIdx + 1] : null
  const topIdx = argv.indexOf('--top')
  const topN = topIdx >= 0 ? parseInt(argv[topIdx + 1], 10) : 20

  const usageCounts = collectTranslationKeys()
  const dictKeys = readDictionaryKeys()

  // Filter out the false-positive wraps (sample data, URLs, file
  // names, control IDs, etc.) so the coverage % reflects real
  // translatable UI strings, not codemod noise.
  const skipped = []
  for (const key of [...usageCounts.keys()]) {
    if (looksLikePlaceholderOrTechnical(key)) {
      skipped.push(key)
      usageCounts.delete(key)
    }
  }

  const totalKeys = usageCounts.size
  const report = {}
  for (const lang of NON_ENGLISH_LANGS) {
    const missing = []
    for (const [key, count] of usageCounts) {
      if (!dictKeys[lang].has(key)) missing.push({ key, count })
    }
    missing.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    report[lang] = missing
  }

  if (jsonOut) {
    console.log(JSON.stringify({ totalKeys, skippedCount: skipped.length, report }, null, 2))
    return
  }

  console.log(`i18n-coverage: ${totalKeys} translatable t() keys (${skipped.length} sample/technical keys excluded)\n`)
  if (focusLang) {
    if (!report[focusLang]) {
      console.error(`Unknown language: ${focusLang}`)
      process.exit(1)
    }
    console.log(`Missing in ${focusLang} (${report[focusLang].length} keys, top ${topN}):`)
    for (const { key, count } of report[focusLang].slice(0, topN)) {
      console.log(`  ${String(count).padStart(3)}× ${JSON.stringify(key)}`)
    }
    return
  }

  console.log('Summary:')
  for (const lang of NON_ENGLISH_LANGS) {
    const translated = totalKeys - report[lang].length
    const pct = totalKeys === 0 ? 0 : Math.round((translated / totalKeys) * 100)
    console.log(`  ${lang}: ${translated}/${totalKeys} translated (${pct}%)  -  ${report[lang].length} missing`)
  }
  console.log()
  console.log(`Top ${topN} missing strings (any language, sorted by usage):`)
  const allMissingKeys = new Set()
  for (const lang of NON_ENGLISH_LANGS) {
    for (const m of report[lang]) allMissingKeys.add(m.key)
  }
  const ranked = [...allMissingKeys]
    .map((k) => ({ key: k, count: usageCounts.get(k) || 0 }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, topN)
  for (const { key, count } of ranked) {
    console.log(`  ${String(count).padStart(3)}× ${JSON.stringify(key)}`)
  }
}

main()
