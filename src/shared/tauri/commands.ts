import { invoke } from '@tauri-apps/api/core'
import * as web from './webStore'
import { parseMarkdownDocument } from '../../features/editor/markdown'

const native = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const call = <T>(command: string, args?: Record<string, unknown>, fallback?: () => T) => native ? invoke<T>(command, args) : Promise.resolve(fallback ? fallback() : (() => { throw new Error(`Web 版暂不支持命令：${command}`) })())

import type {
  LibraryDto,
  NoteDto,
  NoteSummaryDto,
  Page,
  RecoveryCandidateDto,
  RecoveryRecordDto,
  SaveNoteRequest,
  SaveNoteResult,
  UpdateLibrarySettingsRequest,
  WorkspaceSnapshotDto,
  NoteQuery,
  BatchAction,
  CategoryDto,
  AttachmentDto,
  SearchResultDto,
  JottingDto,
  JottingFolderDto,
  JottingSnapshotDto,
} from './contracts'

export const initializeLibrary = () => call<LibraryDto>('initialize_library', undefined, web.webInitialize)

export const updateLibrarySettings = (request: UpdateLibrarySettingsRequest) =>
  call<LibraryDto>('update_library_settings', { request }, () => {
    const library = web.webInitialize()
    return { ...library, settingsJson: request.settingsJson, settingsRevision: request.baseSettingsRevision + 1 }
  })

export const listNotes = (offset = 0, limit = 50) =>
  invoke<Page<NoteSummaryDto>>('list_notes', { offset, limit })

export const getNote = (noteId: string) => call<NoteDto>('get_note', { noteId }, () => web.webGet(noteId))

export const createNote = () => invoke<NoteDto>('create_note')

export const saveNote = (request: SaveNoteRequest) =>
  call<SaveNoteResult>('save_note', { request }, () => web.webSave(request))

export const listRecoveryCandidates = () =>
  call<RecoveryCandidateDto[]>('list_recovery_candidates', undefined, () => [])

export const resolveRecovery = (
  noteId: string,
  action: 'restoreDraft' | 'keepDatabaseVersion',
) => call<RecoveryRecordDto | null>('resolve_recovery', { noteId, action }, () => null)

export const getWorkspaceSnapshot = () => call<WorkspaceSnapshotDto>('get_workspace_snapshot', undefined, web.webSnapshot)
export const queryNotes = (query: NoteQuery) => call<Page<NoteSummaryDto>>('query_notes', { query }, () => web.webQuery(query))
export const createWorkspaceNote = (categoryId?: string | null) => call<NoteDto>('create_workspace_note', { request: { categoryId: categoryId ?? null } }, () => web.webCreate(categoryId))
export const getWorkspaceNote = (noteId: string) => call<NoteDto>('get_workspace_note', { noteId }, () => web.webGet(noteId))
export const batchNotes = (noteIds: string[], action: BatchAction) => call<number>('batch_notes', { noteIds, action }, () => web.webBatch(noteIds, action))
export const emptyTrash = () => call<number>('empty_trash', undefined, web.webEmptyTrash)
export const moveNotes = (noteIds: string[], categoryId: string) => call<number>('move_notes', { noteIds, categoryId }, () => web.webMove(noteIds, categoryId))
export const createCategory = (name: string, parentId?: string | null) => call<CategoryDto>('create_category', { name, parentId: parentId ?? null }, () => web.webCreateCategory(name, parentId))
export const renameCategory = (categoryId: string, name: string) => call<void>('rename_category', { categoryId, name }, () => web.webRenameCategory(categoryId, name))
export const deleteCategory = (categoryId: string) => call<void>('delete_category', { categoryId }, () => web.webDeleteCategory(categoryId))
export const setNoteMood = (noteId:string,mood:string|null) => call<void>('set_note_mood',{noteId,mood},()=>web.webSetMood(noteId,mood))
export const globalSearch = (query:string,limit=16) => call<SearchResultDto[]>('global_search',{query,limit},()=>web.webGlobalSearch(query,limit))
export const saveAttachment = (noteId: string, fileName: string, mediaType: string, dataBase64: string) => call<AttachmentDto>('save_attachment', { noteId, fileName, mediaType, dataBase64 }, () => web.webSaveAttachment(noteId,fileName,mediaType,dataBase64))
export const listAttachments = (noteId: string) => call<AttachmentDto[]>('list_attachments', { noteId }, () => web.webListAttachments(noteId))
export const deleteAttachment = (attachmentId: string) => call<void>('delete_attachment', { attachmentId }, () => web.webDeleteAttachment(attachmentId))
export const exportNotes = (noteIds: string[], format: 'markdown' | 'html' | 'json') => call<string>('export_notes', { noteIds, format }, () => web.webExport(noteIds, format))
export const importNotes = (content: string, format: 'markdown' | 'html' | 'json', categoryId?: string | null) => {
  const parsed = format === 'markdown' ? parseMarkdownDocument(content) : null
  return call<NoteDto[]>('import_notes', { content, format, categoryId: categoryId ?? null, title: parsed?.title ?? null, documentJson: parsed?.document ?? null }, () => web.webImport(content, format, categoryId, parsed ?? undefined))
}
export const updateCategoryAppearance = (categoryId:string,iconName:string,color:string) => call<void>('update_category_appearance',{categoryId,iconName,color},()=>web.webUpdateCategoryAppearance(categoryId,iconName,color))
export const getJottingSnapshot = () => call<JottingSnapshotDto>('get_jotting_snapshot',undefined,web.webJottingSnapshot)
export const createJottingFolder = (name:string,parentId?:string|null) => call<JottingFolderDto>('create_jotting_folder',{name,parentId:parentId??null},()=>web.webCreateJottingFolder(name,parentId))
export const createJotting = (name:string,folderId?:string|null) => call<JottingDto>('create_jotting',{name,folderId:folderId??null},()=>web.webCreateJotting(name,folderId))
export const updateJotting = (id:string,baseRevision:number,name:string,content:string,cover:string|null,isFavorite:boolean) => call<JottingDto>('update_jotting',{id,baseRevision,name,content,cover,isFavorite},()=>web.webUpdateJotting(id,baseRevision,name,content,cover,isFavorite))
export const moveJotting = (id:string,folderId?:string|null) => call<JottingDto>('move_jotting',{id,folderId:folderId??null},()=>web.webMoveJotting(id,folderId))
export const deleteJotting = (id:string) => call<void>('delete_jotting',{id},()=>web.webDeleteJotting(id))
export const deleteJottingFolder = (id:string) => call<void>('delete_jotting_folder',{id},()=>web.webDeleteJottingFolder(id))
