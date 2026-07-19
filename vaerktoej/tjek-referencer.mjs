// Finder identifiers der bruges uden at vaere importeret eller defineret.
//
// Denne fejlklasse (ReferenceError ved runtime) fanges IKKE af `vite build`,
// og den har ramt fire gange: Badge, useSmalSkaerm, useMemo, og en importeret
// men ikke-eksporteret komponent. Derfor denne kontrol.
//
// Den forrige udgave tjekkede kun navne med STORT begyndelsesbogstav og var
// dermed blind for alle hooks, hjaelpefunktioner og almindelige variabler.
// Den ser nu paa ALLE identifiers.
//
// Bevidst design: bindings samles FLADT pr. fil (alle scopes lagt sammen)
// i stedet for en fuld scope-kaede. Det betyder at kontrollen aldrig giver
// falske positiver paa lovlig kode — den melder kun navne der ikke findes
// NOGET sted i filen. Til gengaeld fanger den ikke et navn der er defineret
// i én funktion og brugt i en anden. Den afvejning er med vilje: en kontrol
// man kan stole paa slaar en der raaber ulv.
//
// Brug:  node vaerktoej/tjek-referencer.mjs
import { parse } from '@babel/parser'
import fs from 'fs'
import path from 'path'

const GLOBALS = new Set([
  // JS
  'globalThis', 'undefined', 'NaN', 'Infinity', 'Object', 'Array', 'String', 'Number',
  'Boolean', 'Symbol', 'BigInt', 'Math', 'JSON', 'Date', 'RegExp', 'Error', 'TypeError',
  'RangeError', 'SyntaxError', 'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Proxy',
  'Reflect', 'Intl', 'isNaN', 'isFinite', 'parseInt', 'parseFloat', 'encodeURIComponent',
  'decodeURIComponent', 'encodeURI', 'decodeURI', 'structuredClone', 'queueMicrotask',
  'Function', 'ArrayBuffer', 'Uint8Array', 'TextEncoder', 'TextDecoder',
  // Browser
  'window', 'document', 'console', 'navigator', 'location', 'history', 'screen',
  'localStorage', 'sessionStorage', 'fetch', 'Headers', 'Request', 'Response',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame',
  'cancelAnimationFrame', 'alert', 'confirm', 'prompt', 'crypto', 'AbortController',
  'URL', 'URLSearchParams', 'FormData', 'Blob', 'File', 'FileReader', 'Image',
  'Event', 'CustomEvent', 'MutationObserver', 'IntersectionObserver', 'ResizeObserver',
  'matchMedia', 'getComputedStyle', 'scrollTo', 'open', 'close', 'postMessage',
  // React/JSX
  'React', 'Fragment',
  // Node (til vaerktoejsfiler)
  'process', 'Buffer', '__dirname', '__filename', 'module', 'require', 'exports',
])

function walk(node, visit, parent = null) {
  if (!node || typeof node.type !== 'string') return
  visit(node, parent)
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end' || k.endsWith('Comments')) continue
    const v = node[k]
    if (Array.isArray(v)) {
      for (const c of v) if (c && typeof c.type === 'string') walk(c, visit, node)
    } else if (v && typeof v.type === 'string') walk(v, visit, node)
  }
}

// Navne bundet af et destrukturerings-/parametermoenster
function bindPattern(p, out) {
  if (!p) return
  switch (p.type) {
    case 'Identifier': out.add(p.name); break
    case 'ObjectPattern':
      for (const pr of p.properties) bindPattern(pr.type === 'RestElement' ? pr.argument : pr.value, out)
      break
    case 'ArrayPattern': for (const e of p.elements) bindPattern(e, out); break
    case 'AssignmentPattern': bindPattern(p.left, out); break
    case 'RestElement': bindPattern(p.argument, out); break
    default: break
  }
}

// Er denne Identifier en RIGTIG reference — eller blot et navn i en anden rolle?
function erReference(n, p) {
  if (!p) return false
  switch (p.type) {
    // obj.prop / obj?.prop — kun 'obj' er en reference
    case 'MemberExpression':
    case 'OptionalMemberExpression':
      return !(p.property === n && !p.computed)
    // { nøgle: værdi } — nøglen er ikke en reference. Ved shorthand ER værdien.
    case 'ObjectProperty':
      if (p.key === n && !p.computed) return p.shorthand === true && p.value === n
      return true
    case 'ObjectMethod':
    case 'ClassMethod':
    case 'ClassProperty':
    case 'ClassPrivateProperty':
      return !(p.key === n && !p.computed)
    // Deklarationer og moenstre binder — de refererer ikke
    case 'VariableDeclarator': return p.init === n
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ClassDeclaration':
    case 'ClassExpression':
    case 'ArrowFunctionExpression':
      return !(p.id === n) && !p.params?.includes(n)
    case 'ObjectPattern':
    case 'ArrayPattern':
    case 'AssignmentPattern':
    case 'RestElement':
    case 'CatchClause':
      return false
    // import/export-navne
    case 'ImportSpecifier':
    case 'ImportDefaultSpecifier':
    case 'ImportNamespaceSpecifier':
    case 'ExportSpecifier':
    case 'ExportDefaultSpecifier':
      return false
    // labels
    case 'LabeledStatement':
    case 'BreakStatement':
    case 'ContinueStatement':
      return p.label !== n
    // JSX-attributnavne (<div className=…>) er ikke referencer
    case 'JSXAttribute':
    case 'JSXNamespacedName':
      return false
    case 'JSXMemberExpression': return p.object === n
    default: return true
  }
}

const filer = []
;(function saml(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) saml(p)
    else if (/\.(jsx?|mjs)$/.test(e.name)) filer.push(p)
  }
})('src')

let problemer = 0
for (const f of filer.sort()) {
  let ast
  try {
    ast = parse(fs.readFileSync(f, 'utf8'), { sourceType: 'module', plugins: ['jsx'] })
  } catch (e) {
    console.log(`  ${f}: PARSE-FEJL ${e.message}`); problemer++; continue
  }

  const bundet = new Set()
  walk(ast, (n) => {
    switch (n.type) {
      case 'ImportSpecifier':
      case 'ImportDefaultSpecifier':
      case 'ImportNamespaceSpecifier': bundet.add(n.local.name); break
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ClassDeclaration':
      case 'ClassExpression': if (n.id) bundet.add(n.id.name); break
      case 'VariableDeclarator': bindPattern(n.id, bundet); break
      case 'CatchClause': bindPattern(n.param, bundet); break
      default: break
    }
    if (/Function(Declaration|Expression)$|ArrowFunctionExpression|ObjectMethod|ClassMethod/.test(n.type)) {
      for (const p of n.params || []) bindPattern(p, bundet)
    }
  })

  const brugt = new Map()
  walk(ast, (n, p) => {
    if (n.type === 'Identifier' && erReference(n, p)) {
      if (!brugt.has(n.name)) brugt.set(n.name, n.loc?.start.line ?? 0)
    }
    // JSX-komponenter: <Foo> og <Foo.Bar>
    if (n.type === 'JSXIdentifier' && p &&
        (p.type === 'JSXOpeningElement' || p.type === 'JSXClosingElement' ||
         (p.type === 'JSXMemberExpression' && p.object === n)) &&
        /^[A-Z]/.test(n.name)) {
      if (!brugt.has(n.name)) brugt.set(n.name, n.loc?.start.line ?? 0)
    }
  })

  for (const [navn, linje] of brugt) {
    if (bundet.has(navn) || GLOBALS.has(navn)) continue
    console.log(`  ${f}:${linje}  '${navn}' er hverken importeret eller defineret`)
    problemer++
  }
}

console.log(problemer === 0
  ? `\nOK — ${filer.length} filer, ingen udefinerede referencer.`
  : `\n${problemer} problem(er) i ${filer.length} filer.`)
process.exit(problemer === 0 ? 0 : 1)
