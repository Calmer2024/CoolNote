import { useEffect, useState } from 'react'

const PREFIX = 'coolnote.workspace.'

function matchesShape(value: unknown, fallback: unknown): boolean {
  if (fallback === null) return value === null || typeof value === 'string'
  if (Array.isArray(fallback)) return Array.isArray(value) && value.every(item => typeof item === 'string')
  if (typeof fallback === 'object') return !!value && typeof value === 'object' && Object.entries(fallback).every(([key, sample]) => matchesShape((value as Record<string, unknown>)[key], sample))
  return typeof value === typeof fallback
}

export function readWorkspaceMemory<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(PREFIX + key)
    const parsed: unknown = value === null ? fallback : JSON.parse(value)
    return matchesShape(parsed, fallback) ? parsed as T : fallback
  } catch { return fallback }
}

export function writeWorkspaceMemory(key: string, value: unknown) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)) } catch { /* Storage can be unavailable. */ }
}

export function useWorkspaceMemory<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => readWorkspaceMemory(key, fallback))
  useEffect(() => writeWorkspaceMemory(key, value), [key, value])
  return [value, setValue] as const
}
