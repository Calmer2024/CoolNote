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
  settingsRevision: number
}

export type UpdateLibrarySettingsRequest = {
  baseSettingsRevision: number
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
  isFavorite: boolean
  isPinned: boolean
  isArchived: boolean
  deletedAt: string | null
  tags: TagDto[]
  createdAt: string
  updatedAt: string
}

export type NoteSummaryDto = {
  id: string
  title: string
  excerpt: string
  revision: number
  categoryId: string
  isFavorite: boolean
  isPinned: boolean
  isArchived: boolean
  deletedAt: string | null
  tags: TagDto[]
  updatedAt: string
}

export type CategoryDto = {
  id: string
  parentId: string | null
  name: string
  iconName: string
  color: string
  sortOrder: number
  isPinned: boolean
  noteCount: number
}

export type JottingFolderDto = { id: string; parentId: string | null; name: string; sortOrder: number }
export type JottingDto = { id: string; folderId: string | null; name: string; content: string; cover: string | null; isFavorite: boolean; sortOrder: number; revision: number; createdAt: string; updatedAt: string }
export type JottingSnapshotDto = { folders: JottingFolderDto[]; jottings: JottingDto[] }

export type TagDto = { id: string; name: string; color: string }
export type AttachmentDto = {
  id: string
  noteId: string
  fileName: string
  mediaType: string
  sizeBytes: number
  dataUrl: string
  createdAt: string
}
export type SystemCountsDto = { all:number; favorites:number; pinned:number; archived:number; trash:number; jottings:number }
export type WorkspaceSnapshotDto = { categories: CategoryDto[]; tags: TagDto[]; systemCounts:SystemCountsDto }
export type NoteView = 'all' | 'favorites' | 'pinned' | 'archived' | 'trash'
export type NoteSort = 'updatedAt' | 'createdAt' | 'title'
export type NoteQuery = {
  view: NoteView
  categoryId?: string | null
  tagId?: string | null
  search?: string | null
  sortBy: NoteSort
  sortDirection: 'asc' | 'desc'
  offset: number
  limit: number
}
export type BatchAction = 'favorite' | 'unfavorite' | 'pin' | 'unpin' | 'archive' | 'unarchive' | 'trash' | 'restore' | 'deletePermanently'

export type Page<T> = { items: T[]; total: number }

export type SaveNoteRequest = {
  noteId: string
  baseRevision: number
  clientTransactionId: string
  title: string
  documentJson: unknown
  markdownSnapshot: string
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
  markdownSnapshot: string
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
  recoverySafe: boolean
}
