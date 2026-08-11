import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SaveStatus } from '../../src/features/save/SaveStatus'

describe('save status', () => {
  it('announces recovery-safe save failures', () => {
    render(<SaveStatus state="failed" />)

    expect(screen.getByText('保存失败，草稿已保留')).toHaveAttribute('aria-live', 'polite')
  })

  it('announces restored drafts', () => {
    render(<SaveStatus state="recovered" />)

    expect(screen.getByText('已恢复草稿')).toBeInTheDocument()
  })
})
