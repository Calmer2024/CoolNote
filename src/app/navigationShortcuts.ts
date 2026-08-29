const sidebarOrder=['all','jottings','tasks','gallery','favorites','archived','trash'] as const

export type SidebarView=typeof sidebarOrder[number]

export const sidebarViewForShortcut=(event:Pick<KeyboardEvent,'ctrlKey'|'altKey'|'key'>):SidebarView|null=>{
  if(!event.ctrlKey||!event.altKey)return null
  const index=Number(event.key)-1
  return Number.isInteger(index)&&index>=0&&index<sidebarOrder.length?sidebarOrder[index]:null
}

export const captureSidebarShortcut=(event:Pick<KeyboardEvent,'ctrlKey'|'altKey'|'key'|'preventDefault'|'stopImmediatePropagation'>,navigate:(view:SidebarView)=>void)=>{
  const view=sidebarViewForShortcut(event)
  if(!view)return false
  event.preventDefault()
  event.stopImmediatePropagation()
  navigate(view)
  return true
}
