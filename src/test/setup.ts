import '@testing-library/jest-dom/vitest'

const emptyRect = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  toJSON: () => ({}),
}

document.elementFromPoint ??= () => document.body
Range.prototype.getBoundingClientRect ??= () => emptyRect
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList
