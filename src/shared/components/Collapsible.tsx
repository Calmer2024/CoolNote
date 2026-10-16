import { useState, type ReactNode } from 'react'

/** Keep content mounted so closing can animate and draft inputs retain state. */
export function Collapsible({ open, children }: { open: boolean; children: ReactNode }) {
  const [visited, setVisited] = useState(open)
  if (open && !visited) setVisited(true)
  return <div className="collapsible" data-open={open} aria-hidden={!open} inert={!open}>
    <div className="collapsible-content">{visited ? children : null}</div>
  </div>
}
