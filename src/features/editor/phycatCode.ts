import { mergeAttributes } from '@tiptap/core'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { all, createLowlight } from 'lowlight'

const lowlight=createLowlight(all)

const phycatFileIconLanguages=new Set([
  'actionscript','android','applescript','arduino','asciidoc','assembly','autohotkey','autoit','brainfuck','c','ceylon','clojure','cmake','coffee','console','cpp','crystal','csharp','css','cucumber','d','dart','database','diff','django','dockerfile','elixir','elm','erb','erlang','fortran','fsharp','glsl','go','gradle','graphql','groovy','haml','handlebars','haskell','haxe','html','http','ini','java','javascript','json','julia','kotlin','less','lisp','livescript','lua','makefile','markdown','matlab','moonscript','nginx','nim','nix','nodejs','objectivec','ocaml','perl','php','powershell','prolog','protobuf','puppet','python','q','r','ruby','rust','sas','scala','scheme','scss','search','sml','stylus','swift','tcl','tex','twig','typescript','vala','vb','verilog','vhdl','vim','webassembly','wolframlanguage','xml','xquery','yaml',
])

const phycatFileIconAliases:Record<string,string>={
  arcade:'python',armasm:'assembly',aspectj:'java',avrasm:'assembly',bash:'console',basic:'vb',capnproto:'protobuf',clean:'haskell','clojure-repl':'clojure',coffeescript:'coffee',crmsh:'console',delphi:'pascal',dos:'console',dust:'html','erlang-repl':'erlang',gherkin:'cucumber',hy:'python',irpf90:'fortran','jboss-cli':'console','julia-repl':'julia',latex:'tex',llvm:'assembly',mathematica:'wolframlanguage',maxima:'wolframlanguage',mipsasm:'assembly',mojolicious:'perl',n1ql:'database','node-repl':'nodejs',pgsql:'database','php-template':'php',purebasic:'vb','python-repl':'python',reasonml:'ocaml',routeros:'console',scilab:'matlab',shell:'console',smali:'android',sql:'database',thrift:'protobuf',vbnet:'vb',vbscript:'vb','vbscript-html':'html',wasm:'webassembly',x86asm:'assembly',zephir:'php',
}

const phycatFileIconLayers:Record<string,number>={ceylon:2,clojure:5,cmake:3,dart:4,dockerfile:4,elm:7,fsharp:3,haskell:3,haxe:13,julia:3,matlab:3,nix:2,protobuf:8,python:2,vhdl:2,wolframlanguage:3,xquery:2}

export type PhycatLanguageIcon={name:string;layers:number}

/** Resolve Lowlight names to the same colorful file-icon vocabulary bundled by Typora. */
export function phycatLanguageIcon(language:string):PhycatLanguageIcon|null{
  const normalized=language.toLowerCase()
  if(!normalized)return{name:'search',layers:0}
  const candidate=phycatFileIconLanguages.has(normalized)?normalized:phycatFileIconAliases[normalized]
  return candidate&&phycatFileIconLanguages.has(candidate)?{name:candidate,layers:phycatFileIconLayers[candidate]??0}:null
}

/** Highlighter languages with a real bundled logo, plus automatic detection. */
export const phycatCodeLanguages=['',...Object.keys(all).filter(language=>phycatLanguageIcon(language)!==null).sort((left,right)=>left.localeCompare(right))]

/**
 * Tiptap node view shaped like Phycat Forest's CodeMirror fence: a fixed gutter,
 * a syntax-highlighted content DOM, and the language mirrored onto the title bar.
 */
export const PhycatCodeBlock=CodeBlockLowlight.extend({
  renderHTML({node,HTMLAttributes}){
    return['pre',mergeAttributes(this.options.HTMLAttributes,HTMLAttributes,{'data-language':node.attrs.language||'',class:'phycat-code'}),['code',{class:node.attrs.language?`${this.options.languageClassPrefix}${node.attrs.language}`:null},0]]
  },
  addNodeView(){
    return({node})=>{
      const dom=document.createElement('pre')
      const gutter=document.createElement('div')
      const contentDOM=document.createElement('code')
      const lineMeasure=document.createElement('span')
      gutter.className='phycat-code-gutter'
      gutter.contentEditable='false'
      gutter.setAttribute('aria-hidden','true')
      lineMeasure.className='phycat-code-line-measure'
      lineMeasure.contentEditable='false'
      lineMeasure.setAttribute('aria-hidden','true')
      dom.append(gutter,contentDOM,lineMeasure)
      let renderedLines=0
      let logicalLines=['']
      let measureFrame=0
      const syncLogicalLineHeights=()=>{
        measureFrame=0
        if(!dom.isConnected||contentDOM.clientWidth<=0)return
        const style=getComputedStyle(contentDOM)
        const lineHeight=Number.parseFloat(style.lineHeight)||28.8
        const contentWidth=Math.max(1,contentDOM.clientWidth-Number.parseFloat(style.paddingLeft)-Number.parseFloat(style.paddingRight))
        if(contentWidth<32){Array.from(gutter.children).forEach(element=>{if(element instanceof HTMLElement)element.style.height=`${lineHeight}px`});return}
        lineMeasure.style.width=`${contentWidth}px`
        Array.from(gutter.children).forEach((element,index)=>{
          if(!(element instanceof HTMLElement))return
          lineMeasure.textContent=logicalLines[index]||'\u200b'
          const visualLines=Math.max(1,Math.round(lineMeasure.getBoundingClientRect().height/lineHeight))
          element.style.height=`${visualLines*lineHeight}px`
        })
        lineMeasure.textContent=''
      }
      const scheduleLineMeasure=()=>{if(measureFrame)cancelAnimationFrame(measureFrame);measureFrame=requestAnimationFrame(syncLogicalLineHeights)}
      const resizeObserver=new ResizeObserver(scheduleLineMeasure)
      resizeObserver.observe(contentDOM)
      const sync=(current:any)=>{
        dom.classList.add('phycat-code')
        const language=current.attrs.language||''
        dom.dataset.language=language
        if(current.attrs.blockId)dom.dataset.blockId=current.attrs.blockId
        else delete dom.dataset.blockId
        contentDOM.className=language?`language-${language}`:''
        logicalLines=String(current.textContent??'').split('\n')
        const lines=Math.max(1,logicalLines.length)
        if(lines!==renderedLines){
          renderedLines=lines
          gutter.replaceChildren(...Array.from({length:lines},(_,index)=>{
            const line=document.createElement('span')
            line.className='phycat-code-line-number'
            line.textContent=String(index+1)
            return line
          }))
        }
        scheduleLineMeasure()
      }
      sync(node)
      return{
        dom,
        contentDOM,
        update:next=>{
          if(next.type.name!=='codeBlock')return false
          sync(next)
          return true
        },
        ignoreMutation:mutation=>mutation.target===gutter||gutter.contains(mutation.target)||mutation.target===lineMeasure||lineMeasure.contains(mutation.target)||(mutation.type==='attributes'&&mutation.target===contentDOM&&mutation.attributeName==='class'),
        destroy:()=>{resizeObserver.disconnect();if(measureFrame)cancelAnimationFrame(measureFrame)},
      }
    }
  },
}).configure({lowlight,defaultLanguage:null})
