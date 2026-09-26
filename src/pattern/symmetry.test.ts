import { describe, expect, it } from 'vitest'
import type { CellPattern } from './cellPattern'
import { expandPattern } from './symmetry'

const seed = { id: 'seed', start: { kind: 'vertex' as const, vertex: 'A' as const }, end: { kind: 'vertex' as const, vertex: 'B' as const } }

describe('CellPatternの対称展開', () => {
  it.each([
    [{ type: 'none' } as const, 1],
    [{ type: 'mirror', axis: 'A' } as const, 2],
    [{ type: 'rotational' } as const, 3],
  ])('%oを期待する本数のSVG描画用Segmentへ展開する', (symmetry, count) => {
    const pattern: CellPattern = { segments: [seed], symmetry }
    const expanded = expandPattern(pattern)
    expect(expanded).toHaveLength(count)
    expect(expanded[0]).toMatchObject({ id: 'seed', generated: false, start: { x: 0.5, y: 0 } })
  })

  it('回転対称で追加されたすべてのコピーを自動生成として識別する', () => {
    const expanded = expandPattern({ segments: [seed], symmetry: { type: 'rotational' } })
    expect(expanded.map(({ generated }) => generated)).toEqual([false, true, true])
  })
})
