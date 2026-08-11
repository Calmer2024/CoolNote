import { afterEach, describe, expect, it, vi } from 'vitest'

import { SaveCoordinator } from '../../src/features/save/SaveCoordinator'
import type { SaveNoteResult } from '../../src/shared/tauri/contracts'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function result(revision: number): SaveNoteResult {
  return {
    noteId: '11111111-1111-4111-8111-111111111111',
    revision,
    updatedAt: '2026-08-11T10:00:00Z',
    contentHash: `hash-${revision}`,
  }
}

function change(title: string, baseRevision: number) {
  return {
    noteId: '11111111-1111-4111-8111-111111111111',
    baseRevision,
    title,
    documentJson: { schemaVersion: 1, type: 'doc' as const, content: [] },
  }
}

describe('SaveCoordinator', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps edits made during an in-flight save', async () => {
    vi.useFakeTimers()
    const first = deferred<SaveNoteResult>()
    const save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(result(3))
    const coordinator = new SaveCoordinator(save, { debounceMs: 300 })
    coordinator.enqueue(change('one', 1))
    await vi.advanceTimersByTimeAsync(300)
    coordinator.enqueue(change('two', 1))
    first.resolve(result(2))
    await coordinator.flush()
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1][0].baseRevision).toBe(2)
  })
})
