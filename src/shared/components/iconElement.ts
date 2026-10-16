import icons from './hugeicons.generated.json'
import { isIconName } from './iconRegistry'

/** SVG geometry shared with React icons, for Tiptap's DOM-based node views. */
export function createIconElement(name: string): SVGSVGElement {
  const resolved = isIconName(name) ? name : 'folder'
  const namespace = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(namespace, 'svg')
  svg.setAttribute('class', 'icon')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('data-icon', resolved)
  svg.setAttribute('fill', 'none')
  for (const { tag, attrs } of icons[resolved]) {
    const shape = document.createElementNS(namespace, tag)
    for (const [key, value] of Object.entries(attrs)) {
      shape.setAttribute(key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`), String(value))
    }
    svg.append(shape)
  }
  return svg
}
