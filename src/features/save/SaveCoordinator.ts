import type { SaveNoteRequest, SaveNoteResult } from '../../shared/tauri/contracts'

export type SaveState = 'idle' | 'saving' | 'saved' | 'failed' | 'recovered'

export type SaveChange = Omit<SaveNoteRequest, 'clientTransactionId'>

export type SaveFunction = (request: SaveNoteRequest) => Promise<SaveNoteResult>

export type FlushResult = 'committed' | 'recoverySafeFailure' | 'blocked'

export type SaveRetryMetadata = {
  attempts: number
}

type SaveCoordinatorOptions = {
  debounceMs: number
}

function createTransactionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16)
    const value = character === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

function isRecoverySafeSaveError(cause: unknown) {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'recoverySafe' in cause &&
    cause.recoverySafe === true
  )
}

export class SaveCoordinator {
  private readonly listeners = new Set<(state: SaveState) => void>()
  private pending: SaveChange | null = null
  private inFlight: Promise<void> | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private state: SaveState = 'idle'
  private lastFlushResult: FlushResult = 'committed'
  private readonly revisions = new Map<string, number>()
  private retryCount = 0
  private recoverySafeFailure = false
  private disposed = false

  constructor(
    private readonly save: SaveFunction,
    private readonly options: SaveCoordinatorOptions,
  ) {}

  enqueue(change: SaveChange) {
    if (this.disposed) return
    this.pending = change
    this.lastFlushResult = 'committed'
    this.recoverySafeFailure = false
    this.schedule()
  }

  markRecovered() {
    if (this.disposed) return
    this.setState('recovered')
  }

  subscribe(listener: (state: SaveState) => void) {
    this.listeners.add(listener)
    listener(this.state)
    return () => {
      this.listeners.delete(listener)
    }
  }

  get retryMetadata(): SaveRetryMetadata {
    return { attempts: this.retryCount }
  }

  get isRecoverySafeFailure() {
    return this.recoverySafeFailure
  }

  async flush(): Promise<FlushResult> {
    this.clearTimer()
    this.lastFlushResult = 'committed'

    while (this.inFlight || this.pending) {
      if (!this.inFlight && this.pending) this.startSave()
      if (this.inFlight) await this.inFlight
      if (this.lastFlushResult !== 'committed') return this.lastFlushResult
    }

    return this.lastFlushResult
  }

  dispose() {
    this.disposed = true
    this.clearTimer()
    this.listeners.clear()
  }

  private schedule() {
    this.clearTimer()
    if (this.inFlight || !this.pending) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.startSave()
    }, this.options.debounceMs)
  }

  private startSave() {
    if (this.disposed || this.inFlight || !this.pending) return
    const pending = this.pending
    this.pending = null
    const batch = {
      ...pending,
      baseRevision: this.revisions.get(pending.noteId) ?? pending.baseRevision,
    }
    this.setState('saving')

    this.inFlight = this.save({
      ...batch,
      clientTransactionId: createTransactionId(),
    })
      .then((saved) => {
        this.retryCount = 0
        this.recoverySafeFailure = false
        this.revisions.set(saved.noteId, saved.revision)
        if (this.pending?.noteId === saved.noteId) {
          this.pending = { ...this.pending, baseRevision: saved.revision }
        }
        this.setState('saved')
      })
      .catch((cause) => {
        const hasNewerPending = this.pending !== null
        if (!this.pending) this.pending = batch
        this.retryCount += 1
        this.recoverySafeFailure = isRecoverySafeSaveError(cause)
        this.lastFlushResult = hasNewerPending
          ? 'committed'
          : this.recoverySafeFailure
            ? 'recoverySafeFailure'
            : 'blocked'
        this.setState('failed')
      })
      .finally(() => {
        this.inFlight = null
        if (this.pending && this.lastFlushResult === 'committed') this.schedule()
      })
  }

  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
  }

  private setState(state: SaveState) {
    this.state = state
    for (const listener of this.listeners) listener(state)
  }
}
