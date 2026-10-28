import { pinyin } from 'pinyin-pro'

const keysCache=new Map<string,{full:string[][];initials:string[][]}>()
const compact=(text:string)=>text.toLowerCase().replace(/ü/g,'v').replace(/[\s'’-]/g,'')

/** Keep literal search; also accept untoned full pinyin and initials for names. */
export function matchesSearch(text:string,query:string):boolean {
  const needle=query.trim().toLowerCase()
  if(!needle)return true
  if(text.toLowerCase().includes(needle))return true
  const normalized=compact(needle)
  if(!/^[a-z0-9]+$/.test(normalized)||!/[\p{Script=Han}]/u.test(text))return false
  let keys=keysCache.get(text)
  if(!keys){
    const chars=Array.from(text)
    const full=chars.map(char=>pinyin(char,{toneType:'none',v:true,type:'array',multiple:true,nonZh:'consecutive'}).map(compact))
    keys={full,initials:full.map((values,index)=>/\p{Script=Han}/u.test(chars[index])?values.map(value=>value[0]):values)}
    if(keysCache.size>=512)keysCache.delete(keysCache.keys().next().value!)
    keysCache.set(text,keys)
  }
  return matchesVariants(keys.full,normalized)||matchesVariants(keys.initials,normalized)
}

// Track matching prefixes across pronunciation choices without expanding their
// Cartesian product. State count is bounded by the query length.
function matchesVariants(tokens:string[][],query:string){
  let states=new Set([0])
  for(const variants of tokens){
    const next=new Set<number>()
    for(const variant of variants){
      let current=states
      for(const char of variant){
        const advanced=new Set([0])
        for(const index of current)if(query[index]===char){
          if(index+1===query.length)return true
          advanced.add(index+1)
        }
        current=advanced
      }
      for(const index of current)next.add(index)
    }
    states=next
  }
  return false
}
