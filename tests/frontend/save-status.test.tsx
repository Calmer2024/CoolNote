import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SaveStatus } from '../../src/features/save/SaveStatus'

describe('save status', () => {
  it('announces recovery-safe save failures', () => {
    render(<SaveStatus state="failed" recoverySafeFailure />)

    expect(screen.getByText('保存失败，草稿已保留')).toHaveAttribute('aria-live', 'polite')
  })

  it('does not claim an unprotected failed save retained a draft', () => {
    render(<SaveStatus state="failed" recoverySafeFailure={false} />)

    expect(screen.getByText('保存失败')).toBeInTheDocument()
    expect(screen.queryByText('保存失败，草稿已保留')).not.toBeInTheDocument()
  })

  it('announces restored drafts', () => {
    render(<SaveStatus state="recovered" />)

    expect(screen.getByText('已恢复草稿')).toBeInTheDocument()
  })
})
