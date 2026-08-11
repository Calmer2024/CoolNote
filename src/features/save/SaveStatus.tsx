import type { SaveState } from './SaveCoordinator'

const labels: Partial<Record<SaveState, string>> = {
  saving: '正在保存…',
  saved: '已保存',
  recovered: '已恢复草稿',
}

export function SaveStatus({
  state,
  recoverySafeFailure = false,
}: {
  state: SaveState
  recoverySafeFailure?: boolean
}) {
  const label = state === 'failed'
    ? recoverySafeFailure
      ? '保存失败，草稿已保留'
      : ''
    : labels[state] ?? ''

  return (
    <span className="save-status" aria-live="polite">
      {label}
    </span>
  )
}
