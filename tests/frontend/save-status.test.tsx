import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SaveStatus } from '../../src/features/save/SaveStatus'

describe('save status', () => {
  it('announces recovery-safe save failures', () => {
    render(<SaveStatus state="failed" recoverySafeFailure />)

    expect(screen.getByText('保存失败，草稿已保留')).toHaveAttribute('aria-live', 'polite')
  })

  it('leaves the save-status region empty for an unprotected failed save', () => {
    render(<SaveStatus state="failed" recoverySafeFailure={false} />)

    expect(screen.queryByText('保存失败')).not.toBeInTheDocument()
    expect(screen.queryByText('保存失败，草稿已保留')).not.toBeInTheDocument()
    expect(document.querySelector('.save-status')).toHaveTextContent('')
  })

  it('announces restored drafts', () => {
    render(<SaveStatus state="recovered" />)

    expect(screen.getByText('已恢复草稿')).toBeInTheDocument()
  })
})
