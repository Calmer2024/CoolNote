import { invoke } from '@tauri-apps/api/core'

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
} from './contracts'

export const initializeLibrary = () => invoke<LibraryDto>('initialize_library')

export const updateLibrarySettings = (request: UpdateLibrarySettingsRequest) =>
  invoke<LibraryDto>('update_library_settings', { request })

export const listNotes = (offset = 0, limit = 50) =>
  invoke<Page<NoteSummaryDto>>('list_notes', { offset, limit })

export const getNote = (noteId: string) => invoke<NoteDto>('get_note', { noteId })

export const createNote = () => invoke<NoteDto>('create_note')

export const saveNote = (request: SaveNoteRequest) =>
  invoke<SaveNoteResult>('save_note', { request })

export const listRecoveryCandidates = () =>
  invoke<RecoveryCandidateDto[]>('list_recovery_candidates')

export const resolveRecovery = (
  noteId: string,
  action: 'restoreDraft' | 'keepDatabaseVersion',
) => invoke<RecoveryRecordDto | null>('resolve_recovery', { noteId, action })
