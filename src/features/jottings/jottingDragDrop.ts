type DropEvent={
  dataTransfer:Pick<DataTransfer,'getData'>
  preventDefault:()=>void
  stopPropagation:()=>void
}

export const JOTTING_FILE_MIME='text/coolnote-jotting'
export const JOTTING_FOLDER_MIME='text/coolnote-jotting-folder'

export function handleJottingTreeDrop(
  event:DropEvent,
  targetFolderId:string|null,
  beforeFolderId:string|null,
  moveFile:(id:string,folderId:string|null)=>void,
  reorderFolder:(id:string,beforeId:string|null)=>void,
){
  const fileId=event.dataTransfer.getData(JOTTING_FILE_MIME)
  const folderId=event.dataTransfer.getData(JOTTING_FOLDER_MIME)
  if(!fileId&&!folderId)return false
  event.preventDefault();event.stopPropagation()
  if(fileId)moveFile(fileId,targetFolderId)
  else if(folderId!==beforeFolderId)reorderFolder(folderId,beforeFolderId)
  return true
}

export function moveJottingInTree<T extends {id:string;folderId:string|null}>(items:T[],id:string,folderId:string|null){
  return items.map(item=>item.id===id?{...item,folderId}:item)
}

export function reorderJottingFolders<T extends {id:string;sortOrder:number}>(folders:T[],id:string,beforeId:string|null){
  const next=[...folders];const source=next.findIndex(folder=>folder.id===id)
  if(source<0)return next
  const [moving]=next.splice(source,1);const target=beforeId?next.findIndex(folder=>folder.id===beforeId):-1
  next.splice(target<0?next.length:target,0,moving)
  return next.map((folder,index)=>({...folder,sortOrder:index}))
}
