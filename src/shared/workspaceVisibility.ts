import { createContext, useContext } from 'react'

export const WorkspaceVisibility = createContext(true)
export const useWorkspaceVisibility = () => useContext(WorkspaceVisibility)
