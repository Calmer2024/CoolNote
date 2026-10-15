// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { readWorkspaceMemory, useWorkspaceMemory } from './workspaceMemory'

beforeEach(() => localStorage.clear())
it('restores the last page on a fresh mount', () => {
  const first = renderHook(() => useWorkspaceMemory('page', 'all'))
  act(() => first.result.current[1]('jottings'))
  first.unmount()
  const second = renderHook(() => useWorkspaceMemory('page', 'all'))
  expect(second.result.current[0]).toBe('jottings')
  second.unmount()
})
it('ignores malformed or incorrectly shaped saved state', () => {
  const fallback = { view:'all', categoryId:null }
  for (const value of ['broken', 'null', '{}', '{"view":42,"categoryId":[]}']) {
    localStorage.setItem('coolnote.workspace.notes', value)
    expect(readWorkspaceMemory('notes', fallback)).toEqual(fallback)
  }
})
