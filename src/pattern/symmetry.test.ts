import { describe, expect } from 'vitest'
import { contractTest } from '../test/contractTest'
import type { CellPattern } from './cellPattern'
import { expandPattern, isDerivedSegment } from './symmetry'

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
      expect(expanded.some(({ id }) => id === seed.id)).toBe(true)
    }
  })

  contractTest({ contract: 'ARCH-PATTERN-DERIVED-SEGMENTS' }, '基本Segmentを変更せず派生Segmentと区別できる', () => {
    const pattern: CellPattern = { segments: [seed], symmetry: { type: 'rotational' } }
    const expanded = expandPattern(pattern)
    expect(pattern.segments).toEqual([seed])
    expect(expanded.filter(isDerivedSegment)).toHaveLength(2)
    expect(expanded.filter((segment) => !isDerivedSegment(segment))).toHaveLength(1)
  })
})
