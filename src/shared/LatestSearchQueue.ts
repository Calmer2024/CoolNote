// One request in flight, one latest pending request. Superseded requests resolve to
// null instead of piling up work behind the desktop database connection.
export class LatestSearchQueue<T> {
  private running = false
  private pending: { query:string; resolve:(value:T|null)=>void; reject:(error:unknown)=>void } | null = null
  constructor(private readonly search:(query:string)=>Promise<T>) {}
  request(query:string):Promise<T|null> {
    this.pending?.resolve(null)
    const result = new Promise<T|null>((resolve,reject) => { this.pending={query,resolve,reject} })
    void this.drain()
    return result
  }
  clear() { this.pending?.resolve(null); this.pending=null }
  private async drain() {
    if (this.running) return
    this.running=true
    try {
      while (this.pending) {
        const current=this.pending
        this.pending=null
        try { current.resolve(await this.search(current.query)) }
        catch (error) { current.reject(error) }
      }
    } finally { this.running=false }
  }
}
