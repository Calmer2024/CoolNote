import type { Editor } from '@tiptap/core'

type HeadingShortcutEvent = Pick<KeyboardEvent, 'altKey'|'ctrlKey'|'key'|'metaKey'|'preventDefault'|'target'>

export function applyHeadingShortcut(editor:Editor,event:HeadingShortcutEvent) {
  if (!(event.ctrlKey||event.metaKey)||event.altKey||!/^[1-6]$/.test(event.key)) return false
  if (event.target instanceof Element&&event.target.closest('input,textarea,select,[data-editor-shortcuts="ignore"]')) return false
  event.preventDefault()
  const level=Number(event.key)
  if(level<=5)editor.chain().focus().toggleHeading({level:level as 1|2|3|4|5}).run()
  else editor.chain().focus().setParagraph().run()
  return true
}
