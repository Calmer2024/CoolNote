import { describe,expect,it } from 'vitest'

import { linkActivationFromPointerEvent, shouldAutoLink } from './linkPolicy'

describe('shouldAutoLink',()=>{
  it('does not treat local file names as web addresses',()=>{
    expect(shouldAutoLink('SKILL.md')).toBe(false)
    expect(shouldAutoLink('start_server.sh')).toBe(false)
    expect(shouldAutoLink('archive.zip')).toBe(false)
  })

  it('recognizes only web addresses with an explicit protocol or www prefix',()=>{
    expect(shouldAutoLink('https://coolnote.example/docs')).toBe(true)
    expect(shouldAutoLink('www.coolnote.example')).toBe(true)
    expect(shouldAutoLink('http://127.0.0.1:4173')).toBe(true)
  })

  it('keeps domain-like prose, bare domains, and email addresses as plain text',()=>{
    expect(shouldAutoLink('1.AI')).toBe(false)
    expect(shouldAutoLink('coolnote.example')).toBe(false)
    expect(shouldAutoLink('hello@coolnote.example')).toBe(false)
  })
})

describe('linkActivationFromPointerEvent',()=>{
  it('opens only an explicit HTTP(S) link on a modified primary click',()=>{
    expect(linkActivationFromPointerEvent({ href:'https://coolnote.example/docs?q=hello%20world', button:0, ctrlKey:true, metaKey:false })).toEqual({ url:'https://coolnote.example/docs?q=hello%20world' })
    expect(linkActivationFromPointerEvent({ href:'http://127.0.0.1:4173/#guide', button:0, ctrlKey:false, metaKey:true })).toEqual({ url:'http://127.0.0.1:4173/#guide' })
  })

  it('leaves an ordinary click to the editor so the caret can move',()=>{
    expect(linkActivationFromPointerEvent({ href:'https://coolnote.example', button:0, ctrlKey:false, metaKey:false })).toBeNull()
  })

  it('rejects non-primary clicks and values that could resolve to local resources',()=>{
    const modifiedClick={ button:0, ctrlKey:true, metaKey:false }
    expect(linkActivationFromPointerEvent({ href:'https://coolnote.example', ...modifiedClick, button:1 })).toBeNull()
    expect(linkActivationFromPointerEvent({ href:'', ...modifiedClick })).toBeNull()
    expect(linkActivationFromPointerEvent({ href:'/docs', ...modifiedClick })).toBeNull()
    expect(linkActivationFromPointerEvent({ href:'SKILL.md', ...modifiedClick })).toBeNull()
    expect(linkActivationFromPointerEvent({ href:'file:///C:/Users/example/Documents/file.md', ...modifiedClick })).toBeNull()
    expect(linkActivationFromPointerEvent({ href:'coolnote-attachment:abc', ...modifiedClick })).toBeNull()
  })
})
