export const ICON_NAMES = [
  'align-left','arrow-down','arrow-down-narrow-wide','arrow-up','book-open','book-open-text',
  'briefcase-business','calendar-days','camera','check-square','chevron-down','chevron-right',
  'code','code-xml','columns-2','copy','download','ellipsis','feather','file','file-plus',
  'file-text','flask-conical','folder','folder-open','folder-plus','gem','graduation-cap',
  'grip-vertical','highlighter','history','image','image-up','lightbulb','link','list',
  'list-ordered','list-tree','message-square','monitor','moon','music','notebook-tabs',
  'palette','panel-left-close','panel-left-open','panel-right-close','panel-right-open',
  'panels-top-left','paperclip','pencil','pin','plus','quote','rotate-ccw','search',
  'share-2','sort-asc','sort-desc','star','sun','table','tag','tags','trash-2','upload','x',
] as const

export type IconName = typeof ICON_NAMES[number]

/** Product-wide semantic action mapping: UI actions must use these meanings. */
export const ACTION_ICONS = {
  confirm: 'check-square',
  delete: 'trash-2',
  cancel: 'x',
  create: 'plus',
  move: 'folder',
  archive: 'book-open',
  favorite: 'star',
  pin: 'pin',
  more: 'ellipsis',
  sortAscending: 'sort-asc',
  sortDescending: 'sort-desc',
} as const satisfies Record<string, IconName>

const ICON_NAME_SET = new Set<string>(ICON_NAMES)

export function isIconName(value: string): value is IconName {
  return ICON_NAME_SET.has(value)
}
