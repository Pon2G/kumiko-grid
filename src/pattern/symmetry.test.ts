import { describe, expect } from 'vitest'
import { contractTest } from '../test/contractTest'
import type { CellPattern } from './cellPattern'
import { expandPattern } from './symmetry'

const seed = { id: 'seed', start: { kind: 'vertex' as const, vertex: 'A' as const }, end: { kind: 'vertex' as const, vertex: 'B' as const } }

describe('CellPatternの対称展開', () => {
  contractTest({ contract: 'SPEC-SYMMETRY-EXPANSION' }, '各Symmetryを期待する本数のSVG描画用Segmentへ展開する', () => {
    const cases: Array<[CellPattern['symmetry'], number]> = [
      [{ type: 'none' }, 1],
      [{ type: 'mirror', axis: 'A' }, 2],
      [{ type: 'rotational' }, 3],
    ]
    for (const [symmetry, count] of cases) {
      const expanded = expandPattern({ segments: [seed], symmetry })
      expect(expanded).toHaveLength(count)
      expect(expanded[0]).toMatchObject({ id: 'seed', generated: false, start: { x: 0.5, y: 0 } })
    }
  })

  contractTest({ contract: 'ARCH-PATTERN-DERIVED-SEGMENTS' }, '回転対称で追加されたすべてのコピーを自動生成として識別する', () => {
    const expanded = expandPattern({ segments: [seed], symmetry: { type: 'rotational' } })
    expect(expanded.map(({ generated }) => generated)).toEqual([false, true, true])
  })
})
