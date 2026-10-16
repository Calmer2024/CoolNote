import { describe, expect, it } from 'vitest'
import { SaveCoordinator, type SaveChange } from './SaveCoordinator'

const draft: SaveChange = { noteId: 'note', baseRevision: 1, title: '草稿', documentJson: {}, markdownSnapshot: '草稿' }

describe('external note updates and autosave', () => {
  it('uses a newly loaded revision instead of an older cached local save', async () => {
    const revisions: number[] = []
    const coordinator = new SaveCoordinator(async request => {
      revisions.push(request.baseRevision)
      return { noteId: request.noteId, revision: request.baseRevision + 1, updatedAt: '', contentHash: '' }
    }, { debounceMs: 100_000 })
    coordinator.enqueue(draft)
    await coordinator.flush()
    coordinator.enqueue({ ...draft, baseRevision: 7 })
    await coordinator.flush()
    expect(revisions).toEqual([1, 7])
    coordinator.dispose()
  })

  it('keeps a conflicting draft and blocks navigation until it is preserved', async () => {
    const coordinator = new SaveCoordinator(async () => { throw { code: 'revision_conflict', recoverySafe: false } }, { debounceMs: 100_000 })
    coordinator.enqueue(draft)
    expect(await coordinator.flush()).toBe('blocked')
    expect(coordinator.hasUnsavedChanges).toBe(true)
    expect(coordinator.getDraft('note')).toEqual(draft)
    coordinator.discardDraft('note')
    expect(coordinator.hasUnsavedChanges).toBe(false)
    expect(await coordinator.flush()).toBe('committed')
    coordinator.dispose()
  })

  it('does not discard an in-flight save', async () => {
    let finish!: () => void
    const gate = new Promise<void>(resolve => { finish = resolve })
    const coordinator = new SaveCoordinator(async request => {
      await gate
      return { noteId: request.noteId, revision: 2, updatedAt: '', contentHash: '' }
    }, { debounceMs: 100_000 })
    coordinator.enqueue(draft)
    const pending = coordinator.flush()
    expect(() => coordinator.discardDraft('note')).toThrow()
    expect(coordinator.getDraft('note')).toEqual(draft)
    finish()
    await pending
    expect(coordinator.hasUnsavedChanges).toBe(false)
    coordinator.dispose()
  })
})
