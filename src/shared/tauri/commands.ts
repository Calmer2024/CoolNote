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
  GallerySummaryDto,
  GalleryItemDto,
  GalleryAssetDataDto,
  GalleryImportResultDto,
  GalleryTransferResultDto,
  TaskSnapshotDto,
  TaskListDto,
  TaskItemDto,
  TaskSubtaskDto,
  TaskDatePrecision,
  TaskImportance,
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
export const revealAttachment = (attachmentId: string) => call<boolean>('reveal_attachment', { attachmentId }, () => false)
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
export const listGalleries = () => call<GallerySummaryDto[]>('list_galleries',undefined,web.webListGalleries)
export const createGallery = (name:string) => call<GallerySummaryDto>('create_gallery',{name},()=>web.webCreateGallery(name))
export const updateGallery = (id:string,baseRevision:number,name:string,introduction:string,cover:string|null) => call<GallerySummaryDto>('update_gallery',{id,baseRevision,name,introduction,cover},()=>web.webUpdateGallery(id,baseRevision,name,introduction,cover))
export const reorderGallery = (id:string,beforeId?:string|null) => call<void>('reorder_gallery',{id,beforeId:beforeId??null},()=>web.webReorderGallery(id,beforeId))
export const listGalleryItems = (galleryId:string,offset=0,limit=60) => call<Page<GalleryItemDto>>('list_gallery_items',{galleryId,offset,limit},()=>web.webListGalleryItems(galleryId,offset,limit))
export const importGalleryPath = (galleryId:string,path:string) => call<GalleryImportResultDto>('import_gallery_path',{galleryId,path})
export const importGalleryData = (galleryId:string,fileName:string,dataUrl:string) => call<GalleryImportResultDto>('import_gallery_data',{galleryId,fileName,dataUrl})
export const reorderGalleryItem = (galleryId:string,itemId:string,beforeId?:string|null) => call<void>('reorder_gallery_item',{galleryId,itemId,beforeId:beforeId??null},()=>web.webReorderGalleryItem(galleryId,itemId,beforeId))
export const deleteGallery = (id:string) => call<string>('delete_gallery',{id},()=>web.webDeleteGallery(id))
export const deleteGalleryItems = (itemIds:string[]) => call<string>('delete_gallery_items',{itemIds},()=>web.webDeleteGalleryItems(itemIds))
export const undoGalleryDelete = (token:string) => call<boolean>('undo_gallery_delete',{token},()=>web.webUndoGalleryDelete(token))
export const transferGalleryItems = (itemIds:string[],targetGalleryId:string,moveItems:boolean) => call<GalleryTransferResultDto>('transfer_gallery_items',{itemIds,targetGalleryId,moveItems},()=>web.webTransferGalleryItems(itemIds,targetGalleryId,moveItems))
export const getGalleryAssetData = (itemId:string) => call<GalleryAssetDataDto>('get_gallery_asset_data',{itemId},()=>web.webGetGalleryAssetData(itemId))
export const getTaskSnapshot=()=>call<TaskSnapshotDto>('get_task_snapshot',undefined,web.webTaskSnapshot)
export const createTaskList=(name:string,iconName='list-todo')=>call<TaskListDto>('create_task_list',{name,iconName},()=>web.webCreateTaskList(name,iconName))
export const updateTaskList=(id:string,baseRevision:number,name:string,iconName:string,notes:string)=>call<TaskListDto>('update_task_list',{id,baseRevision,name,iconName,notes},()=>web.webUpdateTaskList(id,baseRevision,name,iconName,notes))
export const reorderTaskList=(id:string,beforeId?:string|null)=>call<void>('reorder_task_list',{id,beforeId:beforeId??null},()=>web.webReorderTaskList(id,beforeId))
export const createTaskItem=(title:string,taskListId?:string|null)=>call<TaskItemDto>('create_task_item',{title,taskListId:taskListId??null},()=>web.webCreateTaskItem(title,taskListId))
export const updateTaskItem=(item:TaskItemDto)=>call<TaskItemDto>('update_task_item',{id:item.id,baseRevision:item.revision,title:item.title,notes:item.notes,startValue:item.startValue,startPrecision:item.startPrecision,dueValue:item.dueValue,duePrecision:item.duePrecision,importance:item.importance,taskListId:item.taskListId},()=>web.webUpdateTaskItem(item))
export const setTaskCompleted=(id:string,completed:boolean)=>call<TaskItemDto>('set_task_completed',{id,completed},()=>web.webSetTaskCompleted(id,completed))
export const reorderTaskItem=(id:string,beforeId?:string|null)=>call<void>('reorder_task_item',{id,beforeId:beforeId??null},()=>web.webReorderTaskItem(id,beforeId))
export const createTaskSubtask=(taskId:string,title:string)=>call<TaskSubtaskDto>('create_task_subtask',{taskId,title},()=>web.webCreateTaskSubtask(taskId,title))
export const updateTaskSubtask=(id:string,baseRevision:number,title:string)=>call<TaskSubtaskDto>('update_task_subtask',{id,baseRevision,title},()=>web.webUpdateTaskSubtask(id,baseRevision,title))
export const setTaskSubtaskCompleted=(id:string,completed:boolean)=>call<TaskSubtaskDto>('set_task_subtask_completed',{id,completed},()=>web.webSetTaskSubtaskCompleted(id,completed))
export const reorderTaskSubtask=(taskId:string,id:string,beforeId?:string|null)=>call<void>('reorder_task_subtask',{taskId,id,beforeId:beforeId??null},()=>web.webReorderTaskSubtask(taskId,id,beforeId))
export const deleteTaskItem=(id:string)=>call<string>('delete_task_item',{id},()=>web.webDeleteTaskItem(id))
export const deleteTaskSubtask=(id:string)=>call<string>('delete_task_subtask',{id},()=>web.webDeleteTaskSubtask(id))
export const deleteTaskList=(id:string)=>call<string>('delete_task_list',{id},()=>web.webDeleteTaskList(id))
export const undoTaskDelete=(token:string)=>call<boolean>('undo_task_delete',{token},()=>web.webUndoTaskDelete(token))
export type {TaskDatePrecision,TaskImportance}
