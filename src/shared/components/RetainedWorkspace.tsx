import { memo, type ReactNode, useState } from 'react'
import { WorkspaceVisibility } from '../workspaceVisibility'

// Freeze parent props while hidden, but let local edits finish saving normally.
const WorkspaceContent = memo(function WorkspaceContent({ children }: { active: boolean; children: ReactNode }) {
  return <>{children}</>
}, (_, next) => !next.active)

/** Mount on first visit; retain editor DOM, selection and scroll on later visits. */
export function RetainedWorkspace({ active, children }: { active: boolean; children: ReactNode }) {
  const [visited, setVisited] = useState(active)
  if (active && !visited) setVisited(true)
  if (!active && !visited) return null
  return <WorkspaceVisibility.Provider value={active}>
    <div className="retained-workspace" hidden={!active} inert={!active} style={{ display: active ? 'contents' : 'none' }}>
      <WorkspaceContent active={active}>{children}</WorkspaceContent>
    </div>
  </WorkspaceVisibility.Provider>
}
