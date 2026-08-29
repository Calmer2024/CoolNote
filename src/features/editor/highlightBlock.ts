import { Node, mergeAttributes } from '@tiptap/core'

const EMOJIS = ['💡','✨','📌','✅','⚠️','❗','❓','🔎','📣','🎯','🚀','🌱','🧠','💬','📝','📚','🔗','🛠️','❤️','⭐','🔥','🎉','👀','🤝']

export const HighlightBlock = Node.create({
  name: 'highlightBlock',
  group: 'block',
  content: 'block+',
  defining: true,
  draggable: true,
  addAttributes() {
    return {
      emoji: {
        default: '💡',
        parseHTML: element => element.getAttribute('data-emoji') ?? '💡',
        renderHTML: attrs => ({ 'data-emoji': attrs.emoji ?? '💡' }),
      },
    }
  },
  parseHTML() { return [{ tag: 'aside[data-type="highlight-block"]' }] },
  renderHTML({ HTMLAttributes }) {
    return ['aside', mergeAttributes(HTMLAttributes, { 'data-type': 'highlight-block', class: 'editor-highlight-block' }), 0]
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      let current = node
      const dom = document.createElement('aside')
      dom.className = 'editor-highlight-block'
      dom.dataset.type = 'highlight-block'
      const emoji = document.createElement('button')
      emoji.type = 'button'
      emoji.className = 'editor-highlight-emoji'
      emoji.setAttribute('aria-label', '选择高亮块图标')
      emoji.setAttribute('aria-haspopup', 'listbox')
      emoji.setAttribute('aria-expanded', 'false')
      emoji.contentEditable = 'false'
      const picker = document.createElement('div')
      picker.className = 'editor-highlight-picker product-layer'
      picker.hidden = true
      picker.setAttribute('role', 'listbox')
      picker.setAttribute('aria-label', '高亮块图标')
      picker.contentEditable = 'false'
      const contentDOM = document.createElement('div')
      contentDOM.className = 'editor-highlight-content'
      let sizeFrame = 0
      const syncEmojiSize = () => {
        const firstLine = contentDOM.firstElementChild
        if (!firstLine) return
        dom.style.setProperty('--highlight-first-line-size', getComputedStyle(firstLine).fontSize)
      }
      const scheduleSizeSync = () => {
        if (sizeFrame) cancelAnimationFrame(sizeFrame)
        sizeFrame = requestAnimationFrame(() => {
          sizeFrame = 0
          syncEmojiSize()
        })
      }
      const positionPicker = () => {
        const anchor = emoji.getBoundingClientRect()
        const card = picker.getBoundingClientRect()
        const gap = 8
        const margin = 8
        const left = Math.min(Math.max(margin, anchor.left), Math.max(margin, window.innerWidth - card.width - margin))
        const below = anchor.bottom + gap
        const top = below + card.height <= window.innerHeight - margin
          ? below
          : Math.max(margin, anchor.top - card.height - gap)
        picker.style.left = `${Math.round(left)}px`
        picker.style.top = `${Math.round(top)}px`
      }
      const close = (event?: Event) => {
        const target = event?.target as globalThis.Node | undefined
        if (target && (dom.contains(target) || picker.contains(target))) return
        picker.hidden = true
        emoji.setAttribute('aria-expanded', 'false')
        document.removeEventListener('pointerdown', close, true)
        window.removeEventListener('resize', positionPicker)
        window.removeEventListener('scroll', positionPicker, true)
      }
      const open = () => {
        picker.hidden = false
        emoji.setAttribute('aria-expanded', 'true')
        positionPicker()
        document.addEventListener('pointerdown', close, true)
        window.addEventListener('resize', positionPicker)
        window.addEventListener('scroll', positionPicker, true)
      }
      const render = (value: typeof node) => {
        const selected = String(value.attrs.emoji || '💡')
        emoji.textContent = selected
        dom.dataset.emoji = selected
        picker.querySelectorAll<HTMLElement>('[role="option"]').forEach(option => {
          option.setAttribute('aria-selected', String(option.textContent === selected))
        })
        scheduleSizeSync()
      }
      for (const value of EMOJIS) {
        const option = document.createElement('button')
        option.type = 'button'
        option.className = 'editor-highlight-emoji-option'
        option.textContent = value
        option.setAttribute('role', 'option')
        option.setAttribute('aria-selected', 'false')
        const choose = (event: Event) => {
          event.preventDefault()
          event.stopPropagation()
          const position = typeof getPos === 'function' ? getPos() : null
          if (typeof position === 'number') editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, { ...current.attrs, emoji: value }))
          close()
        }
        option.onpointerdown = choose
        option.onkeydown = event => {
          if (event.key === 'Enter' || event.key === ' ') choose(event)
          if (event.key === 'Escape') { event.preventDefault(); close(); emoji.focus() }
        }
        picker.append(option)
      }
      emoji.onclick = event => {
        event.preventDefault()
        event.stopPropagation()
        if (picker.hidden) open()
        else close()
      }
      render(node)
      dom.append(emoji, contentDOM)
      document.body.append(picker)
      scheduleSizeSync()
      return {
        dom,
        contentDOM,
        update: next => {
          if (next.type.name !== 'highlightBlock') return false
          current = next
          render(next)
          return true
        },
        stopEvent: event => emoji.contains(event.target as globalThis.Node),
        ignoreMutation: mutation => {
          if (mutation.type === 'selection') return false
          return !contentDOM.contains(mutation.target)
        },
        destroy: () => {
          document.removeEventListener('pointerdown', close, true)
          window.removeEventListener('resize', positionPicker)
          window.removeEventListener('scroll', positionPicker, true)
          picker.remove()
          if (sizeFrame) cancelAnimationFrame(sizeFrame)
        },
      }
    }
  },
})
