import type { RecoveryCandidateDto } from '../../shared/tauri/contracts'

type RecoveryDialogProps = {
  candidate: RecoveryCandidateDto
  busy: boolean
  onRestore: () => void
  onKeepDatabaseVersion: () => void
}

export function RecoveryDialog({
  candidate,
  busy,
  onRestore,
  onKeepDatabaseVersion,
}: RecoveryDialogProps) {
  const conflict = candidate.decision === 'conflict'
  const title = conflict ? '发现恢复草稿冲突' : '发现未保存草稿'

  return (
    <div className="recovery-backdrop">
      <section className="recovery-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <p>
          {conflict
            ? `数据库版本已更新到修订 ${candidate.databaseRevision}，不会自动覆盖。`
            : '检测到上次未完成保存的本机草稿。'}
        </p>
        <div className="recovery-actions">
          <button type="button" className="tool-action" disabled={busy} onClick={onKeepDatabaseVersion}>
            保留数据库版本
          </button>
          <button type="button" className="retry-button" disabled={busy} onClick={onRestore}>
            {busy ? '处理中…' : '恢复草稿'}
          </button>
        </div>
      </section>
    </div>
  )
}
