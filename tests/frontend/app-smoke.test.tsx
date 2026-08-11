import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { App } from '../../src/app/App'

describe('CoolNote application shell', () => {
  it('renders without demo notes or the removed Canvas entry', () => {
    render(<App />)

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(
      screen.getByRole('complementary', { name: '主导航' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('MiraAgent')).not.toBeInTheDocument()
    expect(screen.queryByText('画板')).not.toBeInTheDocument()
  })
})
