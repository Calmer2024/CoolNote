import { afterEach, describe, expect, it, vi } from 'vitest'

import { SaveCoordinator } from '../../src/features/save/SaveCoordinator'
import type { SaveNoteResult } from '../../src/shared/tauri/contracts'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
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

  it('retains a failed snapshot until an explicitly safe retry commits it', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce({ code: 'recovery_write_failed', recoverySafe: false })
      .mockResolvedValueOnce(result(2))
    const coordinator = new SaveCoordinator(save, { debounceMs: 300 })

    coordinator.enqueue(change('will retry', 1))

    expect(await coordinator.flush()).toBe('blocked')
    expect(coordinator.retryMetadata).toEqual({ attempts: 1 })
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'will retry',
        clientTransactionId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        ),
      }),
    )

    expect(await coordinator.flush()).toBe('committed')
    expect(save).toHaveBeenCalledTimes(2)
    expect(coordinator.retryMetadata).toEqual({ attempts: 0 })
  })

  it('allows leaving only after a backend-confirmed recovery-safe failure', async () => {
    const save = vi.fn().mockRejectedValue({ code: 'injected_failure', recoverySafe: true })
    const coordinator = new SaveCoordinator(save, { debounceMs: 300 })

    coordinator.enqueue(change('recoverable', 1))

    expect(await coordinator.flush()).toBe('recoverySafeFailure')
  })
})
