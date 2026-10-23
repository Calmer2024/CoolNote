type Measurement = { prepare: () => (() => (() => (() => void))) | undefined }

// All code blocks share a frame: write probes, read layout, then apply gutters.
// Interleaving those phases for each line/block forces layout repeatedly.
const pending = new Set<Measurement>()
let frame = 0

export function scheduleCodeLineMeasurement(measurement: Measurement) {
  pending.add(measurement)
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    const jobs = [...pending]
    pending.clear()
    const probes = jobs.flatMap(job => {
      const probe = job.prepare()
      return probe ? [probe] : []
    })
    const reads = probes.map(probe => probe())
    const writes = reads.map(read => read())
    writes.forEach(write => write())
  })
}

export function cancelCodeLineMeasurement(measurement: Measurement) {
  pending.delete(measurement)
  if (!pending.size && frame) {
    cancelAnimationFrame(frame)
    frame = 0
  }
}
