export type ImageLayoutCandidate = {
  type: string
  galleryGroup?: string | null
}

export type ImageDropPlacement = 'left' | 'right' | 'merge' | 'detach' | null

export function imageDropIntent({
  sourceTop,
  targetTop,
  targetSide,
}: {
  sourceTop: number
  targetTop: number | null
  targetSide: 'left' | 'right' | null
}): ImageDropPlacement {
  if (targetTop == null) return 'detach'
  if (sourceTop > targetTop + 8) return 'merge'
  return targetSide
}

export function galleryGroupForDrop(
  sourceGroup: string | null | undefined,
  targetGroup: string | null | undefined,
  side: ImageDropPlacement,
  createGroup: () => string,
) {
  if (side === 'detach') return createGroup()
  if (side !== 'right' && side !== 'merge') return sourceGroup ?? null
  return targetGroup ?? createGroup()
}

export function imageLayoutRuns(nodes: ImageLayoutCandidate[]) {
  const runs: number[][] = []
  let current: number[] = []
  const flush = () => {
    if (current.length) runs.push(current)
    current = []
  }
  nodes.forEach((node, index) => {
    if (node.type !== 'image') {
      flush()
      return
    }
    const previous = current.length ? nodes[current[current.length - 1]] : null
    if (
      previous?.type === 'image' &&
      previous.galleryGroup !== node.galleryGroup &&
      (previous.galleryGroup != null || node.galleryGroup != null)
    ) flush()
    current.push(index)
  })
  flush()
  return runs
}
