export type DocumentNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: DocumentNode[]
  text?: string
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
}

export type VersionedDocument = {
  schemaVersion: number
  type: 'doc'
  content: DocumentNode[]
}

export type LibraryDto = {
  id: string
  name: string
  rootPath: string
  formatVersion: number
  createdAt: string
  lastOpenedAt: string
  lastCleanShutdownAt: string | null
  settingsJson: string
}

export type NoteDto = {
  id: string
  categoryId: string
  title: string
  document: VersionedDocument
  plainText: string
  contentHash: string
  revision: number
  createdAt: string
  updatedAt: string
}

export type NoteSummaryDto = {
  id: string
  title: string
  excerpt: string
  revision: number
  updatedAt: string
}

export type Page<T> = { items: T[]; total: number }

export type SaveNoteRequest = {
  noteId: string
  baseRevision: number
  clientTransactionId: string
  title: string
  documentJson: unknown
}

export type SaveNoteResult = {
  noteId: string
  revision: number
  updatedAt: string
  contentHash: string
}

export type RecoveryDecision = 'offerDraft' | 'conflict'

export type RecoveryRecordDto = {
  libraryId: string
  noteId: string
  baseRevision: number
  clientTransactionId: string
  title: string
  documentJson: unknown
  contentHash: string
  createdAt: string
}

export type RecoveryCandidateDto = {
  decision: RecoveryDecision
  databaseRevision: number
  draft: RecoveryRecordDto
}

export type CommandError = {
  code: string
  message: string
  retryable: boolean
}
