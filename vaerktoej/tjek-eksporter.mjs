// Krydstjek: eksporterer kildemodulet faktisk hvert navn vi importerer?
//
//   import { Foo } from './bar.jsx'   hvor bar.jsx ikke eksporterer Foo
//
// giver `undefined` ved runtime — ikke en byggefejl. Reference-kontrollen
// fanger det heller ikke, for navnet ER jo importeret.
//
// Brug:  node vaerktoej/tjek-eksporter.mjs
import { parse } from '@babel/parser'
import fs from 'fs'
import path from 'path'

const filer = []
;(function saml(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) saml(p)
    else if (/\.(jsx?|mjs)$/.test(e.name)) filer.push(p)
  }
})('src')

const cache = new Map()
function eksporterAf(fil) {
  if (cache.has(fil)) return cache.get(fil)
  const ud = new Set()
  let ast
  try { ast = parse(fs.readFileSync(fil, 'utf8'), { sourceType: 'module', plugins: ['jsx'] }) }
  catch { cache.set(fil, ud); return ud }
  for (const n of ast.program.body) {
    if (n.type === 'ExportDefaultDeclaration') ud.add('default')
    else if (n.type === 'ExportNamedDeclaration') {
      if (n.declaration) {
        const d = n.declaration
        if (d.id) ud.add(d.id.name)
        if (d.declarations) for (const v of d.declarations) if (v.id.type === 'Identifier') ud.add(v.id.name)
      }
      for (const sp of n.specifiers) ud.add(sp.exported.name)
    } else if (n.type === 'ExportAllDeclaration') ud.add('*')
  }
  cache.set(fil, ud); return ud
}

let problemer = 0
for (const f of filer.sort()) {
  let ast
  try { ast = parse(fs.readFileSync(f, 'utf8'), { sourceType: 'module', plugins: ['jsx'] }) } catch { continue }
  for (const n of ast.program.body) {
    if (n.type !== 'ImportDeclaration') continue
    const kilde = n.source.value
    if (!kilde.startsWith('.')) continue
    let maal = path.resolve(path.dirname(f), kilde)
    if (!fs.existsSync(maal)) {
      for (const e of ['.js', '.jsx', '/index.js', '/index.jsx']) {
        if (fs.existsSync(maal + e)) { maal = maal + e; break }
      }
    }
    if (!fs.existsSync(maal) || fs.statSync(maal).isDirectory()) {
      console.log(`  ${f}:${n.loc.start.line}  kan ikke finde modulet '${kilde}'`); problemer++; continue
    }
    const har = eksporterAf(maal)
    if (har.has('*')) continue
    for (const sp of n.specifiers) {
      const navn = sp.type === 'ImportDefaultSpecifier' ? 'default'
        : sp.type === 'ImportNamespaceSpecifier' ? null : sp.imported.name
      if (navn && !har.has(navn)) {
        console.log(`  ${f}:${n.loc.start.line}  importerer '${navn}' fra '${kilde}', men modulet eksporterer den ikke`)
        problemer++
      }
    }
  }
}

console.log(problemer === 0
  ? `\nOK — ${filer.length} filer, alle imports findes i deres kildemodul.`
  : `\n${problemer} problem(er).`)
process.exit(problemer === 0 ? 0 : 1)
