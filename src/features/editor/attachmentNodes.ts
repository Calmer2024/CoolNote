import { Node as TiptapNode, mergeAttributes } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import { NodeSelection } from '@tiptap/pm/state'

import { openAttachment, openExternalResource, revealAttachment } from '../../shared/tauri/commands'
import { loadWhenNear, resolveAttachmentSource } from './attachmentResources'

const actionButton = (icon: string, label: string, action: () => void) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'editor-media-action'
  button.setAttribute('aria-label', label)
  button.innerHTML = `<svg class="icon" aria-hidden="true"><use href="./assets/lucide-icons.svg#${icon}"></use></svg>`
  button.onclick = action
  return button
}

const animateImageLayout = (dom: HTMLElement, before?: DOMRect) => {
  if (typeof dom.animate !== 'function' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  window.requestAnimationFrame(() => {
    const after = dom.getBoundingClientRect()
    if (before?.width && after.width) {
      const dx = before.left - after.left
      const dy = before.top - after.top
      const scaleX = before.width / after.width
      const scaleY = before.height / after.height
      if (Math.abs(dx) + Math.abs(dy) + Math.abs(1 - scaleX) + Math.abs(1 - scaleY) > 0.01) dom.animate([
        { transform: `translate(${dx}px,${dy}px) scale(${scaleX},${scaleY})`, transformOrigin: 'top left' },
        { transform: 'none', transformOrigin: 'top left' },
      ], { duration: 240, easing: 'cubic-bezier(.2,.75,.25,1)' })
    } else dom.animate([
      { opacity: 0.35, transform: 'scale(.97)' },
      { opacity: 1, transform: 'none' },
    ], { duration: 200, easing: 'ease-out' })
  })
}

const downloadResource = async (src: string, attachmentId: string | null, fileName: string) => {
  const resolved = await resolveAttachmentSource(src, attachmentId)
  const link = document.createElement('a')
  link.href = resolved
  link.download = fileName
  link.click()
}

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      attachmentId: { default: null, parseHTML: element => element.getAttribute('data-attachment-id'), renderHTML: attrs => attrs.attachmentId ? { 'data-attachment-id': attrs.attachmentId } : {} },
      galleryGroup: { default: null, parseHTML: element => element.getAttribute('data-gallery-group'), renderHTML: attrs => attrs.galleryGroup ? { 'data-gallery-group': attrs.galleryGroup } : {} },
      width: { default: null, parseHTML: element => element.getAttribute('width'), renderHTML: attrs => attrs.width ? { width: attrs.width } : {} },
      layout: { default: 'single', parseHTML: element => element.getAttribute('data-layout') ?? 'single', renderHTML: attrs => ({ 'data-layout': attrs.layout ?? 'single' }) },
      galleryIndex: { default: 0, parseHTML: element => Number(element.getAttribute('data-gallery-index') ?? 0), renderHTML: attrs => ({ 'data-gallery-index': attrs.galleryIndex ?? 0 }) },
      gallerySize: { default: 1, parseHTML: element => Number(element.getAttribute('data-gallery-size') ?? 1), renderHTML: attrs => ({ 'data-gallery-size': attrs.gallerySize ?? 1 }) },
    }
  },
  addKeyboardShortcuts() {
    const remove = () => {
      const selection = this.editor.state.selection
      if (!(selection instanceof NodeSelection) || selection.node.type.name !== this.name) return false
      return this.editor.commands.deleteSelection()
    }
    return { Backspace: remove, Delete: remove }
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('figure')
      dom.className = 'editor-image'
      dom.contentEditable = 'false'
      dom.draggable = true
      dom.tabIndex = 0
      dom.setAttribute('data-drag-handle', '')
      dom.setAttribute('aria-selected', 'false')
      const image = document.createElement('img')
      image.draggable = false
      image.loading = 'lazy'
      image.decoding = 'async'
      const actions = document.createElement('span')
      actions.className = 'editor-image-actions'
      const handle = document.createElement('span')
      handle.className = 'editor-image-resize'
      handle.setAttribute('data-tooltip', '拖动缩放')
      dom.append(image, actions, handle)

      let current = node
      let loadVersion = 0
      let stopLoading: () => void = () => undefined
      const position = () => typeof getPos === 'function' ? getPos() : null
      const render = (value: typeof node) => {
        const version = ++loadVersion
        stopLoading()
        image.removeAttribute('src')
        image.alt = value.attrs.alt ?? ''
        image.removeAttribute('title')
        const description = String(value.attrs.title ?? value.attrs.alt ?? '').trim()
        if (description) dom.setAttribute('data-tooltip', description)
        else dom.removeAttribute('data-tooltip')
        image.style.width = value.attrs.width ? `${value.attrs.width}px` : ''
        dom.dataset.layout = value.attrs.layout ?? 'single'
        dom.dataset.galleryIndex = String(value.attrs.galleryIndex ?? 0)
        dom.dataset.gallerySize = String(value.attrs.gallerySize ?? 1)
        actions.replaceChildren()
        if (value.attrs.attachmentId) actions.append(actionButton('folder-open', '在资源管理器中显示', () => { void revealAttachment(String(value.attrs.attachmentId)) }))
        dom.setAttribute('aria-label', value.attrs.layout === 'gallery' ? `并排图片 ${Number(value.attrs.galleryIndex) + 1}/${value.attrs.gallerySize}` : '图片')
        stopLoading = loadWhenNear(dom, () => {
          void resolveAttachmentSource(String(value.attrs.src ?? ''), value.attrs.attachmentId).then(src => {
            if (version !== loadVersion) return
            dom.classList.remove('is-resource-error')
            if (description) dom.setAttribute('data-tooltip', description)
            image.src = src
          }).catch(() => {
            if (version !== loadVersion) return
            dom.classList.add('is-resource-error')
            dom.setAttribute('data-tooltip', '图片资源暂时无法读取')
          })
        })
      }
      const selectImage = () => {
        const pos = position()
        if (typeof pos === 'number') {
          editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)))
          editor.commands.focus()
        }
      }
      render(current)
      animateImageLayout(dom)
      dom.addEventListener('click', event => {
        if (event.target !== handle && !actions.contains(event.target as globalThis.Node)) selectImage()
      })
      dom.addEventListener('dragstart', event => {
        const pos = position()
        if (typeof pos === 'number' && event.dataTransfer) {
          event.dataTransfer.setData('application/x-coolnote-image-pos', String(pos))
          event.dataTransfer.effectAllowed = 'move'
          dom.classList.add('is-dragging')
        }
      })
      dom.addEventListener('dragend', () => {
        dom.classList.remove('is-dragging')
        document.querySelectorAll<HTMLElement>('.editor-image[data-drop-side]').forEach(element => {
          delete element.dataset.dropSide
          delete element.dataset.nodePos
        })
      })
      dom.addEventListener('dragover', event => {
        const box = dom.getBoundingClientRect()
        const pos = position()
        dom.dataset.dropSide = event.clientX >= box.left + box.width / 2 ? 'right' : 'left'
        if (typeof pos === 'number') dom.dataset.nodePos = String(pos)
      })
      dom.addEventListener('dragleave', event => {
        if (!dom.contains(event.relatedTarget as globalThis.Node)) {
          delete dom.dataset.dropSide
          delete dom.dataset.nodePos
        }
      })
      dom.addEventListener('drop', () => window.setTimeout(() => {
        delete dom.dataset.dropSide
        delete dom.dataset.nodePos
      }, 0))
      handle.onpointerdown = event => {
        event.preventDefault()
        const startX = event.clientX
        const start = image.getBoundingClientRect().width
        const move = (pointer: PointerEvent) => { image.style.width = `${Math.max(120, Math.round(start + pointer.clientX - startX))}px` }
        const end = () => {
          window.removeEventListener('pointermove', move)
          const pos = position()
          if (typeof pos === 'number') editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, width: Math.round(image.getBoundingClientRect().width) }))
          window.removeEventListener('pointerup', end)
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', end)
      }
      return {
        dom,
        selectNode: () => { dom.classList.add('is-selected'); dom.setAttribute('aria-selected', 'true') },
        deselectNode: () => { dom.classList.remove('is-selected'); dom.setAttribute('aria-selected', 'false') },
        stopEvent: event => event.target === handle || actions.contains(event.target as globalThis.Node),
        update: next => {
          if (next.type.name !== 'image') return false
          const before = dom.getBoundingClientRect()
          current = next
          render(current)
          animateImageLayout(dom, before)
          return true
        },
        destroy: () => { loadVersion += 1; stopLoading() },
      }
    }
  },
})

export const MediaNode = TiptapNode.create({
  name: 'media',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() { return { src: { default: '' }, mediaType: { default: 'application/octet-stream' }, fileName: { default: '附件' }, attachmentId: { default: null }, webTitle:{default:null}, webDescription:{default:null}, webImageUrl:{default:null}, webIconUrl:{default:null}, webSiteName:{default:null}, webType:{default:null} } },
  parseHTML() { return [{ tag: 'div[data-type="media"]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'media' })] },
  addKeyboardShortcuts() {
    const remove = () => {
      const selection = this.editor.state.selection
      if (!(selection instanceof NodeSelection) || selection.node.type.name !== this.name) return false
      return this.editor.commands.deleteSelection()
    }
    return { Backspace: remove, Delete: remove }
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div')
      dom.className = 'editor-media'
      dom.contentEditable = 'false'
      dom.tabIndex = 0
      dom.setAttribute('aria-selected', 'false')
      let current = node
      let loadVersion = 0
      let stopLoading: () => void = () => undefined
      const select = () => {
        const pos = typeof getPos === 'function' ? getPos() : null
        if (typeof pos === 'number') {
          editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)))
          editor.commands.focus()
        }
      }
      const render = (value: typeof node) => {
        const version = ++loadVersion
        stopLoading()
        dom.replaceChildren()
        const type = String(value.attrs.mediaType)
        const source = String(value.attrs.src)
        const attachmentId = value.attrs.attachmentId ? String(value.attrs.attachmentId) : null
        const fileName = String(value.attrs.fileName)
        const isHtml = type === 'text/html' || /\.html?$/i.test(fileName)
        const isWeb = type === 'text/uri-list'
        const isAudio = type.startsWith('audio/')
        const isVideo = type.startsWith('video/')
        dom.classList.toggle('is-audio', isAudio)
        dom.classList.toggle('is-video', isVideo)
        dom.classList.toggle('is-html', isHtml || isWeb)
        const player = isAudio ? document.createElement('audio') : isVideo ? document.createElement('video') : null
        const frame = isHtml ? document.createElement('iframe') : null
        if (player) {
          player.controls = true
          player.preload = 'metadata'
          if (isAudio) {
            const playerSurface = document.createElement('div')
            playerSurface.className = 'editor-audio-player'
            playerSurface.append(player)
            dom.append(playerSurface)
          } else dom.append(player)
        }
        if (frame) {
          frame.className = 'editor-resource-preview'
          frame.setAttribute('title', `${fileName} 预览`)
          frame.loading = 'lazy'
          frame.setAttribute('sandbox', 'allow-forms allow-modals allow-popups allow-scripts allow-same-origin')
          dom.append(frame)
        }
        if(isWeb){
          const card=document.createElement('div');card.className='editor-web-card';card.tabIndex=0;card.setAttribute('role','link');card.setAttribute('aria-label',`打开 ${String(value.attrs.webTitle??fileName)}`)
          const preview=document.createElement('div');preview.className='editor-web-preview';const imageUrl=String(value.attrs.webImageUrl??'');if(imageUrl){const image=document.createElement('img');image.src=imageUrl;image.alt='';image.loading='lazy';preview.append(image)}else{preview.innerHTML='<svg class="icon" aria-hidden="true"><use href="./assets/lucide-icons.svg#monitor"></use></svg>'}card.append(preview)
          const copy=document.createElement('div');copy.className='editor-web-copy';const siteRow=document.createElement('div');siteRow.className='editor-web-site';const iconUrl=String(value.attrs.webIconUrl??'');if(iconUrl){const logo=document.createElement('img');logo.src=iconUrl;logo.alt='';logo.loading='lazy';siteRow.append(logo)}const site=document.createElement('small');site.textContent=String(value.attrs.webSiteName??new URL(source).hostname);siteRow.append(site);const pageType=String(value.attrs.webType??'');if(pageType){const typeLabel=document.createElement('span');typeLabel.textContent=pageType;siteRow.append(typeLabel)}const title=document.createElement('strong');title.textContent=String(value.attrs.webTitle??fileName);const description=document.createElement('p');description.textContent=String(value.attrs.webDescription??'该网页没有提供摘要，点击卡片可在浏览器中查看。');copy.append(siteRow,title,description);card.append(copy)
          const open=()=>{void openExternalResource(source)};card.addEventListener('click',event=>{event.stopPropagation();open()});card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();open()}});dom.append(card)
        }
        if (player || frame) stopLoading = loadWhenNear(dom, () => {
          void resolveAttachmentSource(source, attachmentId).then(src => {
            if (version !== loadVersion) return
            dom.classList.remove('is-resource-error')
            dom.removeAttribute('data-tooltip')
            if (player) player.src = src
            if (frame) frame.src = src
          }).catch(() => {
            if (version !== loadVersion) return
            dom.classList.add('is-resource-error')
            dom.setAttribute('data-tooltip', '附件资源暂时无法读取')
          })
        })
        const meta = document.createElement('div')
        meta.className = 'editor-media-meta'
        const label = document.createElement('span')
        label.className = 'editor-media-name'
        label.innerHTML = `<svg class="icon" aria-hidden="true"><use href="./assets/lucide-icons.svg#${isHtml || isWeb ? 'monitor' : type.startsWith('audio/') ? 'music' : type.startsWith('video/') ? 'video' : 'paperclip'}"></use></svg><span>${fileName.replace(/[<>&]/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[character]!))}</span>`
        const actions = document.createElement('span')
        actions.className = 'editor-media-actions'
        if (isHtml && attachmentId) actions.append(actionButton('share-2', '打开资源', () => { void openAttachment(attachmentId) }))
        if (attachmentId) actions.append(actionButton('folder-open', '在资源管理器中显示', () => { void revealAttachment(attachmentId) }))
        if(!isWeb)actions.append(actionButton('download', '另存为', () => { void downloadResource(source, attachmentId, fileName) }))
        meta.append(label, actions)
        dom.append(meta)
      }
      render(current)
      dom.addEventListener('click', event => {
        const target = event.target
        if (!(target instanceof Element) || !target.closest('button,audio,video,iframe')) select()
      })
      return {
        dom,
        selectNode: () => { dom.classList.add('is-selected'); dom.setAttribute('aria-selected', 'true') },
        deselectNode: () => { dom.classList.remove('is-selected'); dom.setAttribute('aria-selected', 'false') },
        stopEvent: event => event.target instanceof Element && !!event.target.closest('button,audio,video,iframe,.editor-web-card'),
        update: next => {
          if (next.type.name !== 'media') return false
          current = next
          render(current)
          return true
        },
        destroy: () => { loadVersion += 1; stopLoading() },
      }
    }
  },
})
