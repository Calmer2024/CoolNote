type GalleryCardDropEvent = {
  dataTransfer: Pick<DataTransfer, 'getData'>
  preventDefault: () => void
  stopPropagation: () => void
}

export function handleGalleryCardDrop(
  event: GalleryCardDropEvent,
  targetItemId: string,
  reorder: (sourceItemId: string, targetItemId: string) => void,
) {
  const sourceItemId = event.dataTransfer.getData('text/coolnote-gallery-item')
  if (!sourceItemId) return false
  event.preventDefault()
  event.stopPropagation()
  if (sourceItemId !== targetItemId) reorder(sourceItemId, targetItemId)
  return true
}
