#!/usr/bin/env node
// i18n-extract — codemod that wraps user-visible JSX strings in t() calls.
//
// What it does
//   1. Parses each .tsx file under src/views/ + src/components/ as a
//      TypeScript JSX module via @babel/parser.
//   2. Walks the AST looking for two cases:
//        - JSXText nodes whose content is "user-visible" (heuristic
//          described in isUserVisibleString below).
//        - JSXAttribute nodes whose name is in VISIBLE_ATTRS and whose
//          value is a string literal — title=, label=, description=,
//          placeholder=, aria-label=, hint=, sub=, subtitle=, header=.
//   3. Replaces each match with t('English text', 'English text').
//      Using the English string as both the key AND the fallback is
//      the simplest scheme: no separate JSON to maintain, the page
//      stays readable, and translators just add entries to the FR/
//      ES/DE/LT dictionaries with the English string as the key.
//   4. Ensures every modified file imports `useI18n` from '../lib/i18n'
//      and calls `const { t } = useI18n()` once at the top of every
//      function component that contains a wrapped string.
//   5. Dumps a JSON of all extracted strings to
//      `scripts/i18n-extracted.json` so the translation team can see
//      the full list without diffing 60 files.
//
// What it does NOT do
//   - It does NOT touch strings that look like code values: single-word
//     identifiers (kebab, camel, CONSTANT), CSS units, hex colors,
//     URLs, numeric literals.
//   - It does NOT rewrite JSXExpressionContainers — `{`Hello ${name}`}`
//     stays as-is. Handling templates correctly requires choosing
//     whether the variable should be a placeholder, which is a
//     translator decision, not an automated one.
//   - It is IDEMPOTENT: a string already wrapped in t(...) is detected
//     by inspecting the parent expression and left alone, so the
//     script can be safely re-run after manual fixes.
//
// Usage
//   node scripts/i18n-extract.mjs              # rewrite files in place
//   node scripts/i18n-extract.mjs --dry-run    # show what would change
//   node scripts/i18n-extract.mjs --files src/views/AttestivLoginPage.tsx
//
// Review the diff before committing. False positives can happen —
// strings that look like sentences but are actually data values
// (e.g. a hardcoded sample error message) — and the right fix is to
// revert that single line.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import recastDefault from 'recast'
import recastBabelParser from 'recast/parsers/babel-ts.js'
import traverseDefault from '@babel/traverse'
import * as t from '@babel/types'

const recast = recastDefault.default ?? recastDefault
const traverse = traverseDefault.default ?? traverseDefault
// recast.parse preserves source-text formatting for any nodes we
// don't touch, so the produced diff is minimal. We pass the babel-ts
// parser so TypeScript + JSX both work.
const parse = (source) => recast.parse(source, { parser: recastBabelParser })
const print = (ast) => recast.print(ast, { quote: 'single' }).code

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

const VISIBLE_ATTRS = new Set([
  'title', 'label', 'description', 'placeholder',
  'aria-label', 'sub', 'hint', 'subtitle', 'header',
])

// Skip these attribute values even if the attribute name is visible —
// the actual prop is technical even when the name overlaps with a
// real label. (e.g. <Button type="submit"> — type is not a label.)
// These are full attribute names that should NEVER be translated.
const NEVER_VISIBLE_ATTRS = new Set([
  'className', 'style', 'id', 'key', 'name', 'value', 'type',
  'role', 'href', 'to', 'src', 'tone', 'variant', 'color',
  'bgcolor', 'background', 'tabIndex', 'autoComplete', 'autoFocus',
  'method', 'action', 'target', 'rel', 'data-testid',
])

// Tighter false-positive rejection. These regex tests catch strings
// that pass the "looks like English" heuristic but are actually
// placeholder/technical data we never want a translator to touch —
// emails, file names, tokens, JSON literals, control IDs, etc.
// Applied to BOTH the extractor (so future runs won't wrap them) and
// the coverage report (so honest % numbers exclude them).
function looksLikePlaceholderOrTechnical(s) {
  const t = s.trim()
  // Email-like placeholders: foo@bar.tld
  if (/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(t)) return true
  // Filenames with a known extension
  if (/^[\w./-]+\.(crt|csr|key|pem|json|jsonl|yaml|yml|md|txt|sh|ts|tsx|js|mjs|zip|csv|pdf|png|jpg|svg|html|env|toml|conf|xml)$/i.test(t)) return true
  // Paths or URL fragments starting with / or ?
  if (/^[/?][\w./?=&%:#-]+$/.test(t)) return true
  if (t.includes('://')) return true
  // Looks like a JSON literal
  if (/^[{[].*[}\]]$/.test(t)) return true
  // Common API token/secret prefixes
  if (/^(ghp_|gho_|github_pat_|glpat-|AKIA|ASIA|sk_|pk_|xoxb-|xoxp-)/.test(t)) return true
  // Control-ID-like patterns: A.5.8 / A.9.2.5 / Article 21(2)
  if (/^[A-Z]\.\d+(\.\d+)*(,? Article \d+(\(\d+\))?)?$/.test(t)) return true
  // Comma-separated technical tag examples: cmdb_ci, cmdb_ci_server, ...
  if (/^[a-z_]+(_[a-z_]+)*(,\s*[a-z_]+(_[a-z_]+)*)+$/.test(t)) return true
  // Looks like a hostname/identifier (no spaces, mostly lowercase + dots/hyphens)
  if (/^[a-z][a-z0-9.-]+(\.[a-z]{2,})+$/.test(t)) return true
  // Sample personal/company names from the seeded demo data
  if (/^(Acme [A-Z][a-z]+|Marina Singh|alice@example\.com)$/.test(t)) return true
  // The brand name itself never translates
  if (t === 'Attestiv') return true
  // Hex / digits / colour swatch with leading "#"
  if (/^#[0-9a-f]{3,8}$/i.test(t)) return true
  // sk-/AKIA-style + ellipsis sample tokens
  if (/^[A-Za-z0-9_-]+\.\.\.$/.test(t)) return true
  return false
}

function isUserVisibleString(s) {
  const trimmed = s.trim()
  if (trimmed.length < 2) return false
  if (!/[a-zA-Z]/.test(trimmed)) return false                 // no letters
  if (trimmed.startsWith('http')) return false                // URLs
  if (trimmed.includes('://')) return false
  if (/^#[0-9a-f]+$/i.test(trimmed)) return false             // hex colors
  if (/^[\d.]+(px|em|rem|%|vh|vw|fr)?$/.test(trimmed)) return false  // CSS values
  if (/^[\d:.,/-]+$/.test(trimmed)) return false              // pure punctuation+digits
  if (/^[a-z][a-z0-9_-]*$/.test(trimmed) && !trimmed.includes(' ')) return false
  if (/^[a-z][a-zA-Z0-9]*$/.test(trimmed) && !trimmed.includes(' ')) return false
  if (/^[A-Z_][A-Z0-9_]*$/.test(trimmed)) return false        // CONSTANTS
  if (/^ti-[a-z0-9-]+$/.test(trimmed)) return false           // tabler icon names
  if (/^[a-z]+\.(crt|key|pem|json|yaml|yml|md|sh|ts|tsx|js|mjs)$/i.test(trimmed)) return false
  if (/^[\w-]+\/[\w/-]+$/.test(trimmed)) return false         // paths
  if (trimmed.startsWith('var(')) return false                // CSS vars
  // Stricter pass: reject sample / technical strings explicitly.
  if (looksLikePlaceholderOrTechnical(trimmed)) return false

  // Accept: has space, OR has sentence punctuation, OR is title-cased.
  if (trimmed.includes(' ')) return true
  if (/[.?!:;,]/.test(trimmed)) return true
  if (/^[A-Z][a-z]/.test(trimmed)) return true                // Title-cased word

  return false
}

export { looksLikePlaceholderOrTechnical }

// Wrap a string literal in t('value', 'value'), creating a JSX
// expression container suitable for embedding back where the original
// string lived.
function wrappedTCall(value) {
  return t.callExpression(t.identifier('t'), [
    t.stringLiteral(value),
    t.stringLiteral(value),
  ])
}

// True when an expression is already a call to t(...) so we don't
// double-wrap on a re-run.
function isAlreadyTCall(node) {
  return (
    node &&
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 't'
  )
}

function hasUseI18nImport(ast) {
  let found = false
  traverse(ast, {
    ImportDeclaration(p) {
      if (p.node.source.value === '../lib/i18n' || p.node.source.value === '@/lib/i18n') {
        for (const spec of p.node.specifiers) {
          if (spec.type === 'ImportSpecifier' && spec.imported.name === 'useI18n') {
            found = true
          }
        }
      }
    },
  })
  return found
}

function addUseI18nImport(ast) {
  const decl = t.importDeclaration(
    [t.importSpecifier(t.identifier('useI18n'), t.identifier('useI18n'))],
    t.stringLiteral('../lib/i18n'),
  )
  let lastImportIdx = -1
  ast.program.body.forEach((node, idx) => {
    if (node.type === 'ImportDeclaration') lastImportIdx = idx
  })
  ast.program.body.splice(lastImportIdx + 1, 0, decl)
}

// Make sure `t` is destructured from useI18n() at the top of each
// function that wraps any string.
//
// Three cases:
//   - No useI18n() call yet → prepend `const { t } = useI18n()`.
//   - Existing `const { x, y } = useI18n()` without `t` → extend the
//     destructure pattern to include `t`. We don't introduce a second
//     hook call; that would call the hook twice per render and trip
//     React's exhaustive-deps lint downstream.
//   - Existing `const { t, ... } = useI18n()` → leave alone.
function injectTHookCalls(ast, modifiedFunctions) {
  for (const fnPath of modifiedFunctions) {
    // Concise-body arrow functions look like `({x}) => (<JSX/>)`. We
    // can't insert a hook statement there, so convert to block-body:
    //   ({x}) => { return <JSX/> }
    // before continuing. The arrow now hosts statements and we can
    // unshift the hook call at the top.
    if (
      fnPath.node.type === 'ArrowFunctionExpression' &&
      fnPath.node.body.type !== 'BlockStatement'
    ) {
      const originalExpr = fnPath.node.body
      fnPath.node.body = t.blockStatement([t.returnStatement(originalExpr)])
    }
    const body = fnPath.node.body
    if (!body || body.type !== 'BlockStatement') continue

    let existingDestructure = null
    let hasT = false
    for (const stmt of body.body) {
      if (stmt.type !== 'VariableDeclaration') continue
      for (const decl of stmt.declarations) {
        if (
          decl.init &&
          decl.init.type === 'CallExpression' &&
          decl.init.callee.type === 'Identifier' &&
          decl.init.callee.name === 'useI18n' &&
          decl.id.type === 'ObjectPattern'
        ) {
          existingDestructure = decl.id
          for (const prop of decl.id.properties) {
            if (
              prop.type === 'ObjectProperty' &&
              prop.key.type === 'Identifier' &&
              prop.key.name === 't'
            ) {
              hasT = true
            }
          }
        }
      }
    }

    if (hasT) continue

    // Skip if `t` is in scope by virtue of a parameter on THIS function
    // or any enclosing function — applies to helper functions like
    // translateChildren(children, t) and any arrow callback inside them.
    const fnsToCheck = [fnPath.node]
    let walker = fnPath.parentPath
    while (walker && walker.node && walker.node.type !== 'Program') {
      const n = walker.node
      if (
        n.type === 'FunctionDeclaration' ||
        n.type === 'FunctionExpression' ||
        n.type === 'ArrowFunctionExpression'
      ) {
        fnsToCheck.push(n)
      }
      walker = walker.parentPath
    }
    let paramHasT = false
    for (const fn of fnsToCheck) {
      const params = fn.params || []
      for (const param of params) {
        if (param.type === 'Identifier' && param.name === 't') {
          paramHasT = true
          break
        }
        if (param.type === 'ObjectPattern') {
          for (const prop of param.properties) {
            if (
              prop.type === 'ObjectProperty' &&
              prop.key.type === 'Identifier' &&
              prop.key.name === 't'
            ) {
              paramHasT = true
              break
            }
          }
          if (paramHasT) break
        }
      }
      if (paramHasT) break
    }
    if (paramHasT) continue

    if (existingDestructure) {
      existingDestructure.properties.push(
        t.objectProperty(t.identifier('t'), t.identifier('t'), false, true),
      )
      continue
    }

    const hookCall = t.variableDeclaration('const', [
      t.variableDeclarator(
        t.objectPattern([
          t.objectProperty(t.identifier('t'), t.identifier('t'), false, true),
        ]),
        t.callExpression(t.identifier('useI18n'), []),
      ),
    ])
    body.body.unshift(hookCall)
  }
}

// Find the enclosing function (declaration, expression, or arrow) for
// a given path. We attach the t() hook there.
function findEnclosingFunction(p) {
  return p.findParent(
    (parent) =>
      parent.isFunctionDeclaration() ||
      parent.isFunctionExpression() ||
      parent.isArrowFunctionExpression(),
  )
}

function transformFile(filePath, options) {
  const source = fs.readFileSync(filePath, 'utf8')
  let ast
  try {
    ast = parse(source)
  } catch (err) {
    console.warn(`[skip] ${filePath}: parse error: ${err.message}`)
    return { changed: false, extracted: [] }
  }

  const extracted = []
  const modifiedFunctions = new Set()
  let changed = false

  // Returns true if `t` is bound as a parameter inside any function
  // between the path and the program root. Wrapping a string in t()
  // would call that local binding (often a callback param like
  // `tenants.map(t => ...)`) instead of the i18n hook, so we skip.
  const isTShadowedAt = (path) => {
    let current = path
    while (current && current.node && current.node.type !== 'Program') {
      const node = current.node
      const params =
        node.type === 'FunctionDeclaration' ||
        node.type === 'FunctionExpression' ||
        node.type === 'ArrowFunctionExpression'
          ? node.params || []
          : null
      if (params) {
        for (const param of params) {
          if (param.type === 'Identifier' && param.name === 't') return true
          if (param.type === 'ObjectPattern') {
            for (const prop of param.properties) {
              if (
                prop.type === 'ObjectProperty' &&
                prop.key.type === 'Identifier' &&
                prop.key.name === 't'
              ) {
                return true
              }
            }
          }
        }
      }
      current = current.parentPath
    }
    return false
  }

  traverse(ast, {
    JSXText(p) {
      const value = p.node.value
      const trimmed = value.trim()
      if (!isUserVisibleString(trimmed)) return
      if (isTShadowedAt(p)) return

      // Reconstruct whitespace around the replacement by splitting the
      // raw text into leading-whitespace, content, trailing-whitespace
      // and replacing only the content.
      const lead = value.match(/^\s*/)[0]
      const trail = value.match(/\s*$/)[0]

      const replacement = []
      if (lead) replacement.push(t.jsxText(lead))
      replacement.push(t.jsxExpressionContainer(wrappedTCall(trimmed)))
      if (trail) replacement.push(t.jsxText(trail))
      p.replaceWithMultiple(replacement)

      extracted.push(trimmed)
      const fn = findEnclosingFunction(p)
      if (fn) modifiedFunctions.add(fn)
      changed = true
    },
    JSXAttribute(p) {
      const name = p.node.name
      if (name.type !== 'JSXIdentifier') return
      if (NEVER_VISIBLE_ATTRS.has(name.name)) return
      if (!VISIBLE_ATTRS.has(name.name)) return

      const value = p.node.value
      if (!value) return
      if (value.type !== 'StringLiteral') return
      if (!isUserVisibleString(value.value)) return
      if (isTShadowedAt(p)) return

      // Already wrapped? (e.g. title={t('Foo','Foo')})
      // StringLiteral attrs can't be t() calls — but a previous run
      // produced JSXExpressionContainer holding a t() call. Skip
      // those by checking the value type above.

      const literal = value.value
      p.node.value = t.jsxExpressionContainer(wrappedTCall(literal))

      extracted.push(literal)
      const fn = findEnclosingFunction(p)
      if (fn) modifiedFunctions.add(fn)
      changed = true
    },
    JSXExpressionContainer(p) {
      // Idempotency: if a previous run already wrapped a string with
      // t('foo','foo') we leave it alone. The traversal above only
      // touches JSXText and StringLiteral attribute values, so the
      // already-wrapped case is naturally skipped — but we keep this
      // visitor as a safety net to make the intent explicit.
      if (isAlreadyTCall(p.node.expression)) return
    },
  })

  // Second pass: find every existing `t(...)` call (from this run or
  // a previous run) and remember its enclosing function. Hook
  // injection runs against that combined set so we never leave a `t`
  // reference unresolved.
  traverse(ast, {
    CallExpression(p) {
      if (!isAlreadyTCall(p.node)) return
      const fn = findEnclosingFunction(p)
      if (fn) modifiedFunctions.add(fn)
    },
  })

  const needsHookWork = modifiedFunctions.size > 0
  if (!changed && !needsHookWork) return { changed: false, extracted: [] }

  if (needsHookWork && !hasUseI18nImport(ast)) {
    addUseI18nImport(ast)
  }
  injectTHookCalls(ast, modifiedFunctions)

  const output = print(ast)

  if (options.dryRun) {
    return { changed: true, extracted, preview: output.slice(0, 600) }
  }

  fs.writeFileSync(filePath, output)
  return { changed: true, extracted }
}

function listSourceFiles(args) {
  const explicit = args.filter((a) => a !== '--dry-run' && !a.startsWith('--'))
  if (explicit.length > 0) {
    return explicit.map((rel) => path.resolve(projectRoot, rel))
  }
  const roots = ['src/views', 'src/components']
  const out = []
  for (const root of roots) {
    const absRoot = path.resolve(projectRoot, root)
    if (!fs.existsSync(absRoot)) continue
    for (const entry of fs.readdirSync(absRoot)) {
      if (!entry.endsWith('.tsx')) continue
      out.push(path.join(absRoot, entry))
    }
  }
  return out
}

async function main() {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  const filesIdx = argv.indexOf('--files')
  const explicitFiles = filesIdx >= 0 ? argv.slice(filesIdx + 1) : argv.filter((a) => !a.startsWith('--'))

  const files = listSourceFiles(explicitFiles)
  console.log(`i18n-extract: ${files.length} file(s) to process${dryRun ? ' (dry-run)' : ''}`)

  const allExtracted = new Set()
  let touched = 0
  for (const file of files) {
    const rel = path.relative(projectRoot, file)
    const result = transformFile(file, { dryRun })
    if (result.changed) {
      touched++
      for (const s of result.extracted) allExtracted.add(s)
      console.log(`  ${dryRun ? '~' : '✓'} ${rel}  (${result.extracted.length} strings)`)
    }
  }

  console.log(`\ni18n-extract: ${touched}/${files.length} file(s) modified; ${allExtracted.size} unique strings extracted.`)

  // Write the unique extracted strings to scripts/i18n-extracted.json
  // so it's easy to feed into a translation tool without re-running.
  const extractedPath = path.resolve(__dirname, 'i18n-extracted.json')
  const sorted = [...allExtracted].sort()
  if (!dryRun) {
    fs.writeFileSync(extractedPath, JSON.stringify(sorted, null, 2))
    console.log(`Wrote ${sorted.length} strings to ${path.relative(projectRoot, extractedPath)}`)
  } else {
    console.log(`(dry-run) Would write ${sorted.length} strings to scripts/i18n-extracted.json`)
  }
}

// Only run main() when this file is executed directly (e.g.
// `node scripts/i18n-extract.mjs`). When imported as a module by
// the coverage script for shared filter logic, do nothing.
const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/') ?? '')
if (invokedDirectly) main().catch((err) => {
  console.error(err)
  process.exit(1)
})
