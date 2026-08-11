import { describe, expect, it } from 'vitest'

import {
  UUID_PATTERN,
  normalizeDocument,
} from '../../src/features/editor/document'

describe('document normalization', () => {
  it('preserves existing block IDs and adds UUIDs only when missing', () => {
    const existing = crypto.randomUUID()
    const result = normalizeDocument({
      schemaVersion: 1,
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { blockId: existing }, content: [] },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: '标题' }],
        },
      ],
    })

    expect(result.content[0].attrs?.blockId).toBe(existing)
    expect(result.content[1].attrs?.blockId).toMatch(UUID_PATTERN)
  })

  it('rejects unsupported top-level nodes instead of silently rewriting them', () => {
    expect(() =>
      normalizeDocument({
        schemaVersion: 1,
        type: 'doc',
        content: [{ type: 'image', attrs: { src: 'file:///private.png' } }],
      }),
    ).toThrow('不支持的文档节点：image')
  })

  it('rejects unsupported nested nodes before the editor can drop them', () => {
    expect(() =>
      normalizeDocument({
        schemaVersion: 1,
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { blockId: crypto.randomUUID() },
            content: [{ type: 'futureInlineWidget' }],
          },
        ],
      }),
    ).toThrow('不支持的文档节点：futureInlineWidget')
  })

  it('rejects headings outside the approved h1 to h3 levels', () => {
    expect(() =>
      normalizeDocument({
        schemaVersion: 1,
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { blockId: crypto.randomUUID(), level: 4 },
            content: [{ type: 'text', text: '不受支持的标题' }],
          },
        ],
      }),
    ).toThrow('标题级别必须为 1、2 或 3')
  })

  it('rejects supported nodes placed in an invalid parent', () => {
    expect(() =>
      normalizeDocument({
        schemaVersion: 1,
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { blockId: crypto.randomUUID() },
            content: [{ type: 'taskItem', attrs: { checked: false } }],
          },
        ],
      }),
    ).toThrow('节点 paragraph 不能包含 taskItem')
  })
})
