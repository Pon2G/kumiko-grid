import { describe, expect, it } from 'vitest'
import type { CellPattern } from './cellPattern'
import { expandPattern } from './symmetry'

const seed = { id: 'seed', start: { kind: 'vertex' as const, vertex: 'A' as const }, end: { kind: 'vertex' as const, vertex: 'B' as const } }

describe('pattern symmetry', () => {
  it.each([
    [{ type: 'none' } as const, 1],
    [{ type: 'mirror', axis: 'A' } as const, 2],
    [{ type: 'rotational' } as const, 3],
  ])('expands %o to the expected render-ready SVG coordinates', (symmetry, count) => {
    const pattern: CellPattern = { segments: [seed], symmetry }
    const expanded = expandPattern(pattern)
    expect(expanded).toHaveLength(count)
    expect(expanded[0]).toMatchObject({ id: 'seed', generated: false, start: { x: 0.5, y: 0 } })
  })

  it('marks every symmetric copy as generated', () => {
    const expanded = expandPattern({ segments: [seed], symmetry: { type: 'rotational' } })
    expect(expanded.map(({ generated }) => generated)).toEqual([false, true, true])
  })
})
