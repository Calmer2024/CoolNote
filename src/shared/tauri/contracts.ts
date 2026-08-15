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
  isArchived: boolean
  deletedAt: string | null
  mood: string | null
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
  isArchived: boolean
  deletedAt: string | null
  mood: string | null
  updatedAt: string
}

export type CategoryDto = {
  id: string
  parentId: string | null
  name: string
  iconName: string
  color: string
  sortOrder: number
  noteCount: number
}

export type JottingFolderDto = { id: string; parentId: string | null; name: string; sortOrder: number }
export type JottingDto = { id: string; folderId: string | null; name: string; content: string; cover: string | null; isFavorite: boolean; sortOrder: number; revision: number; createdAt: string; updatedAt: string }
export type JottingSnapshotDto = { folders: JottingFolderDto[]; jottings: JottingDto[] }

export type GallerySummaryDto = { id:string; name:string; introduction:string; cover:string|null; sortOrder:number; revision:number; itemCount:number; createdAt:string; updatedAt:string }
export type GalleryItemDto = { id:string; galleryId:string; assetId:string; originalFileName:string; mediaType:string; sizeBytes:number; width:number; height:number; sortOrder:number; thumbnailDataUrl:string|null; isAnimated:boolean; createdAt:string }
export type GalleryAssetDataDto = { fileName:string; mediaType:string; dataUrl:string }
export type GalleryImportResultDto = { status:'added'|'skipped'; item:GalleryItemDto|null; fileName:string; message:string }
export type GalleryTransferResultDto = { changed:number; skipped:number }

export type AttachmentDto = {
  id: string
  noteId: string
  fileName: string
  mediaType: string
  sizeBytes: number
  contentHash: string
  dataUrl: string
  createdAt: string
}
export type SystemCountsDto = { all:number; favorites:number; archived:number; trash:number; jottings:number; galleries:number }
export type WorkspaceSnapshotDto = { categories: CategoryDto[]; systemCounts:SystemCountsDto }
export type SearchResultDto = { id:string; kind:'note'|'jotting'|'gallery'; title:string; excerpt:string; updatedAt:string }
export type NoteView = 'all' | 'favorites' | 'archived' | 'trash'
export type NoteSort = 'updatedAt' | 'createdAt' | 'title'
export type NoteQuery = {
  view: NoteView
  categoryId?: string | null
  search?: string | null
  sortBy: NoteSort
  sortDirection: 'asc' | 'desc'
  offset: number
  limit: number
}
export type BatchAction = 'favorite' | 'unfavorite' | 'archive' | 'unarchive' | 'trash' | 'restore' | 'deletePermanently'

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
