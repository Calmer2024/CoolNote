import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Icon } from './Icon'
import { ICON_NAMES } from './iconRegistry'

describe('icons render without external SVG loading', () => {
  it('includes visible geometry on first render for every registered icon', () => {
    for (const name of ICON_NAMES) {
      const markup = renderToStaticMarkup(<Icon name={name} />)
      expect(markup, name).toMatch(/<(path|circle|rect|line|polyline|polygon|ellipse)\b/)
      expect(markup, name).not.toContain('<use')
      expect(markup, name).not.toContain('href=')
    }
  })

  it('renders the fallback immediately with its caller-provided sizing class', () => {
    const markup = renderToStaticMarkup(<Icon name="old-unknown-icon" className="empty-state-icon" />)
    expect(markup).toContain('class="empty-state-icon"')
    expect(markup).toContain('data-icon="folder"')
    expect(markup).toContain('data-invalid-icon="old-unknown-icon"')
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).toContain('<path')
  })
})
