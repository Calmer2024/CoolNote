// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { Mathematics } from '@tiptap/extension-mathematics'
import StarterKit from '@tiptap/starter-kit'
import { describe,expect,it } from 'vitest'

import { MarkdownSyntaxNormalizer } from './markdownShortcuts'

const makeEditor=(text:string)=>{const editor=new Editor({extensions:[StarterKit,Mathematics,MarkdownSyntaxNormalizer],content:'<p></p>'});editor.commands.insertContent(text);return editor}

describe('MarkdownSyntaxNormalizer',()=>{
  it('converts pasted or IME-committed bold delimiters',()=>{const editor=makeEditor('**加粗内容**');expect(editor.getJSON().content?.[0].content?.[0].marks?.[0].type).toBe('bold');expect(editor.getText()).toBe('加粗内容');editor.destroy()})
  it('converts a complete block math paragraph',()=>{const editor=makeEditor('$$x^2+y^2$$');expect(editor.getJSON().content?.[0]).toMatchObject({type:'blockMath',attrs:{latex:'x^2+y^2'}});editor.destroy()})
  it('converts inline math without requiring a trailing space',()=>{const editor=makeEditor('结果为 $x+1$。');expect(editor.getJSON().content?.[0].content?.some(node=>node.type==='inlineMath'&&(node as any).attrs?.latex==='x+1')).toBe(true);editor.destroy()})
})
