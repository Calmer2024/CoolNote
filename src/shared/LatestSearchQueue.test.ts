import { expect, it, vi } from 'vitest'
import { LatestSearchQueue } from './LatestSearchQueue'

it('runs only the latest pending search after an in-flight request', async () => {
  let finish!:(value:string[])=>void
  const search=vi.fn().mockImplementationOnce(()=>new Promise<string[]>(resolve=>{finish=resolve})).mockResolvedValue(['latest'])
  const queue=new LatestSearchQueue<string[]>(search)
  const first=queue.request('a'), obsolete=queue.request('ab'), latest=queue.request('abc')
  expect(await obsolete).toBeNull()
  expect(search).toHaveBeenCalledTimes(1)
  finish(['a'])
  expect(await first).toEqual(['a'])
  expect(await latest).toEqual(['latest'])
  expect(search.mock.calls.map(call=>call[0])).toEqual(['a','abc'])
})

it('clears queued work and continues after a failed request', async () => {
  let fail!:(error:Error)=>void
  const search=vi.fn().mockImplementationOnce(()=>new Promise<string[]>((_,reject)=>{fail=reject})).mockResolvedValue(['ok'])
  const queue=new LatestSearchQueue<string[]>(search)
  const first=queue.request('a'); const rejected=expect(first).rejects.toThrow('failed')
  const cancelled=queue.request('ab');queue.clear()
  expect(await cancelled).toBeNull()
  fail(new Error('failed'));await rejected
  expect(await queue.request('abc')).toEqual(['ok'])
  expect(search.mock.calls.map(call=>call[0])).toEqual(['a','abc'])
})
