import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

// Source is a local install of @hugeicons/core-free-icons@4.3.5. Nothing is fetched
// at app startup or during normal builds; the generated SVGs are shipped locally.
const source = resolve(process.argv[2] ?? 'node_modules/@hugeicons/core-free-icons')
const require = createRequire(import.meta.url)
const metadata = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'))
if (metadata.name !== '@hugeicons/core-free-icons' || metadata.version !== '4.3.5') {
  throw new Error('Expected @hugeicons/core-free-icons@4.3.5')
}
const mapping = JSON.parse(readFileSync(new URL('./hugeicons-map.json', import.meta.url), 'utf8'))
const registry = readFileSync(new URL('../src/shared/components/iconRegistry.ts', import.meta.url), 'utf8').split('] as const')[0]
const names = [...registry.matchAll(/'([^']+)'/g)].map(match => match[1])
if (names.length !== Object.keys(mapping).length || names.some(name => !mapping[name])) throw new Error('Mapping must cover the icon registry exactly')
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
const attribute = name => name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
const bodies = new Map()
const inlineIcons = {}
for (const name of names) {
  const nodes = require(join(source, 'dist/cjs', `${mapping[name]}.js`))
  inlineIcons[name] = nodes.map(([tag, attrs]) => ({ tag, attrs: Object.fromEntries(Object.entries(attrs).filter(([key]) => key !== 'key')) }))
  bodies.set(name, nodes.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([key]) => key !== 'key').map(([key, value]) => `${attribute(key)}="${escape(value)}"`).join(' ')}/>`).join(''))
}
const symbols = names.map(name => `  <symbol id="${name}" viewBox="0 0 24 24" fill="none">${bodies.get(name)}</symbol>`)
const svg = `<svg xmlns="http://www.w3.org/2000/svg">\n  <!-- Hugeicons Stroke Rounded, @hugeicons/core-free-icons 4.3.5. See hugeicons-LICENSE.md. -->\n${symbols.join('\n')}\n</svg>\n`
writeFileSync(new URL('../public/assets/hugeicons.svg', import.meta.url), svg)
writeFileSync(new URL('../src/shared/components/hugeicons.generated.json', import.meta.url), JSON.stringify(inlineIcons) + '\n')
copyFileSync(join(source, 'LICENSE.md'), new URL('../public/assets/hugeicons-LICENSE.md', import.meta.url))
// These headings currently render through CSS masks rather than the Icon component.
const masks = []
for (const [file, name, selector] of [['hugeicons-jotting.svg', 'feather', '.jotting-tree-heading'], ['hugeicons-gallery.svg', 'image', '.gallery-list-heading']]) {
  const mask = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">${bodies.get(name).replaceAll('currentColor', '#000')}</svg>`
  writeFileSync(new URL(`../public/assets/${file}`, import.meta.url), mask + '\n')
  masks.push(`${selector}::before { mask-image:url("data:image/svg+xml,${encodeURIComponent(mask)}"); }`)
}
writeFileSync(new URL('../src/shared/components/hugeicons-headings.generated.css', import.meta.url), `/* Generated Hugeicons Stroke Rounded 4.3.5; see public/assets/hugeicons-LICENSE.md. */\n${masks.join('\n')}\n`)
console.log(`Generated ${names.length} Hugeicons symbols and two heading masks.`)
