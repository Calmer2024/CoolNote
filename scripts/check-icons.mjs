import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root=new URL('../',import.meta.url)
const svg=readFileSync(new URL('../public/assets/lucide-icons.svg',import.meta.url),'utf8')
const sprite=[...svg.matchAll(/<symbol\s+id="([^"]+)"/g)].map(match=>match[1]).sort()
const registrySource=readFileSync(new URL('../src/shared/components/iconRegistry.ts',import.meta.url),'utf8')
const registry=[...new Set([...registrySource.matchAll(/'([a-z0-9-]+)'/g)].map(match=>match[1]))].sort()

function walk(path){return readdirSync(path).flatMap(name=>{const target=join(path,name);return statSync(target).isDirectory()?walk(target):target})}
const sourceRoot=new URL('../src/',import.meta.url).pathname.replace(/^\/(.:)/,'$1')
const used=walk(sourceRoot).filter(path=>/\.tsx?$/.test(path)).flatMap(path=>{
  const source=readFileSync(path,'utf8')
  return [...source.matchAll(/<Icon\s+[^>]*name=["']([^"']+)["']/g)].map(match=>({name:match[1],path}))
})

const missingFromRegistry=sprite.filter(name=>!registry.includes(name))
const missingFromSprite=registry.filter(name=>!sprite.includes(name))
const invalidUses=used.filter(item=>!registry.includes(item.name))
const actionMappings=[...registrySource.matchAll(/\b(?:confirm|delete|cancel|create|move|archive|favorite|pin|more|sortAscending|sortDescending):\s*'([^']+)'/g)].map(match=>match[1])
const semanticFailures=actionMappings.filter(name=>!registry.includes(name)).map(name=>({path:'src/shared/components/iconRegistry.ts',name}))
if(missingFromRegistry.length||missingFromSprite.length||invalidUses.length||semanticFailures.length){
  console.error('Icon contract failed.')
  if(missingFromRegistry.length)console.error('Sprite symbols absent from registry:',missingFromRegistry.join(', '))
  if(missingFromSprite.length)console.error('Registry names absent from sprite:',missingFromSprite.join(', '))
  for(const item of invalidUses)console.error(`Unknown icon "${item.name}" in ${item.path}`)
  for(const item of semanticFailures)console.error(`Semantic action icon "${item.name}" is not registered in ${item.path}`)
  process.exit(1)
}
console.log(`Icon contract passed: ${registry.length} registered symbols, ${used.length} static usages.`)
