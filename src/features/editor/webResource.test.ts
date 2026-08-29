import { describe, expect, it } from 'vitest'

import { findWebCardPosition } from './webResource'

const card = (src:string) => ({ type:{ name:'media' }, attrs:{ src, mediaType:'text/uri-list' } })

describe('findWebCardPosition', () => {
  it('uses the exact insertion position when it still points to the card', () => {
    const node = card('https://coolnote.example')
    const document = { nodeAt:(position:number)=>position===12?node:null, descendants:()=>undefined }
    expect(findWebCardPosition(document, 'https://coolnote.example', 12)).toBe(12)
  })

  it('finds the nearest matching card after surrounding document changes', () => {
    const document = {
      nodeAt:()=>null,
      descendants:(visitor:(node:ReturnType<typeof card>,position:number)=>void)=>{
        visitor(card('https://coolnote.example'), 38)
        visitor(card('https://coolnote.example'), 82)
      },
    }
    expect(findWebCardPosition(document, 'https://coolnote.example', 44)).toBe(38)
  })
})
