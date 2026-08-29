type WebCardNode = {
  attrs?: Record<string, unknown>
  type?: { name?: string }
}

type TraversableDocument = WebCardNode & {
  nodeAt?: (position: number) => WebCardNode | null
  descendants: (visitor: (node: WebCardNode, position: number) => void) => void
}

const isMatchingWebCard = (node: WebCardNode | null, source: string) =>
  node?.type?.name === 'media' && node.attrs?.mediaType === 'text/uri-list' && node.attrs?.src === source

export const findWebCardPosition = (document: TraversableDocument, source: string, preferredPosition: number) => {
  if (document.nodeAt && isMatchingWebCard(document.nodeAt(preferredPosition), source)) return preferredPosition
  let nearest: number | null = null
  let distance = Number.POSITIVE_INFINITY
  document.descendants((node, position) => {
    if (!isMatchingWebCard(node, source)) return
    const nextDistance = Math.abs(position - preferredPosition)
    if (nextDistance < distance) {
      nearest = position
      distance = nextDistance
    }
  })
  return nearest
}
