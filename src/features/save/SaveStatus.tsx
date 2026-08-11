import type { SaveState } from './SaveCoordinator'

const labels: Partial<Record<SaveState, string>> = {
  saving: '正在保存…',
  saved: '已保存',
  failed: '保存失败，草稿已保留',
  recovered: '已恢复草稿',
}

export function SaveStatus({ state }: { state: SaveState }) {
  return (
    <span className="save-status" aria-live="polite">
      {labels[state] ?? ''}
    </span>
  )
}
