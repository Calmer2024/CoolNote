// @vitest-environment jsdom

import { createElement, useRef } from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { fitTextareaHeight, useTextareaAutoHeight } from './editorSizing'

describe('fitTextareaHeight', () => {
  it('uses measured scroll height instead of relying on field-sizing support', () => {
    const textarea = document.createElement('textarea')
    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 126 })
    fitTextareaHeight(textarea)
    expect(textarea.style.height).toBe('128px')
    expect(textarea.style.overflowY).toBe('hidden')
  })

  it('measures again when the editor becomes ready and mounts the title', () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'scrollHeight')
    Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', { configurable: true, get: () => 62 })
    function Harness({ ready }: { ready: boolean }) {
      const ref = useRef<HTMLTextAreaElement>(null)
      useTextareaAutoHeight(ref, 'Typography gypsy quality', 'note-a', ready)
      return ready ? createElement('textarea', { ref, defaultValue: 'Typography gypsy quality' }) : null
    }
    const view = render(createElement(Harness, { ready: false }))
    view.rerender(createElement(Harness, { ready: true }))
    expect(view.container.querySelector('textarea')?.style.height).toBe('64px')
    view.unmount()
    if (descriptor) Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', descriptor)
  })
})
