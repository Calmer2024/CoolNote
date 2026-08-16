import { Extension, InputRule } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'

type InlineOperation = { kind:'bold'|'math'; from:number; to:number; value:string }

export const MarkdownSyntaxNormalizer=Extension.create({
  name:'markdownSyntaxNormalizer',
  priority:1200,
  addInputRules(){return[
    new InputRule({find:/^\$\$([^$\n]+)\$\$$/,handler:({state,range,match})=>{const $from=state.doc.resolve(range.from);state.tr.replaceWith($from.before(),$from.after(),state.schema.nodes.blockMath.create({latex:match[1].trim()}))}}),
    new InputRule({find:/(?<!\$)\$([^$\n]+)\$$/,handler:({state,range,match})=>{state.tr.replaceWith(range.from,range.to,state.schema.nodes.inlineMath.create({latex:match[1].trim()}))}}),
  ]},
  addProseMirrorPlugins(){return[new Plugin({appendTransaction:(transactions,_oldState,state)=>{
    if(!transactions.some(transaction=>transaction.docChanged))return null
    const blocks:Array<{from:number;to:number;latex:string}>=[]
    const inline:InlineOperation[]=[]
    state.doc.descendants((node,pos,parent)=>{
      if(node.type.name==='codeBlock')return false
      if(!node.isTextblock||node.content.content.some(child=>!child.isText))return
      const text=node.textContent
      const block=node.type.name==='paragraph'&&parent===state.doc?text.match(/^\s*\$\$([\s\S]+?)\$\$\s*$/):null
      if(block){blocks.push({from:pos,to:pos+node.nodeSize,latex:block[1].trim()});return false}
      const base=pos+1
      for(const match of text.matchAll(/\*\*([^*\n]+)\*\*/g))inline.push({kind:'bold',from:base+(match.index??0),to:base+(match.index??0)+match[0].length,value:match[1]})
      for(const match of text.matchAll(/(?<!\$)\$([^$\n]+)\$(?!\$)/g))inline.push({kind:'math',from:base+(match.index??0),to:base+(match.index??0)+match[0].length,value:match[1].trim()})
    })
    if(!blocks.length&&!inline.length)return null
    let transaction=state.tr
    for(const operation of [...blocks].sort((a,b)=>b.from-a.from))transaction=transaction.replaceWith(operation.from,operation.to,state.schema.nodes.blockMath.create({latex:operation.latex}))
    for(const operation of [...inline].sort((a,b)=>b.from-a.from)){
      if(operation.kind==='math')transaction=transaction.replaceWith(operation.from,operation.to,state.schema.nodes.inlineMath.create({latex:operation.value}))
      else{transaction=transaction.delete(operation.to-2,operation.to).delete(operation.from,operation.from+2).addMark(operation.from,operation.to-4,state.schema.marks.bold.create())}
    }
    return transaction
  }})]}
})
