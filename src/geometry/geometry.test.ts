import { describe, expect } from 'vitest'
import { contractTest } from '../test/contractTest'
import { resolveAnchor } from './anchorPoint'
import { fragmentSegment, intersectSegments } from './intersections'
import { canonicalTriangle, triangleCentroid, TRIANGLE_HEIGHT } from './triangle'
import { reflectPoint, rotatePoint } from './transform'

const expectPoint = (actual: { x: number; y: number }, expected: { x: number; y: number }) => {
  expect(actual.x).toBeCloseTo(expected.x)
  expect(actual.y).toBeCloseTo(expected.y)
}

describe('正三角形のgeometry', () => {
  contractTest({ contract: 'SPEC-ANCHOR-EDGE-DIVISION-COORDINATE' }, 'BC辺を5等分した2番目の点を正しい座標へ解決する', () => {
    expectPoint(resolveAnchor({ kind: 'edge-division', edge: 'BC', divisions: 5, index: 2 }), {
      x: 0.4,
      y: TRIANGLE_HEIGHT,
    })
  })

  contractTest({ contract: 'ARCH-GEOMETRY-MIRROR-MEDIAN' }, '頂点と対辺中点を結ぶ軸に対してPointを鏡映する', () => {
    const midpoint = { x: 0.5, y: TRIANGLE_HEIGHT }
    expectPoint(reflectPoint(canonicalTriangle.B, canonicalTriangle.A, midpoint), canonicalTriangle.C)
  })

  contractTest({ contract: 'ARCH-GEOMETRY-ROTATION-CENTROID' }, '正三角形の重心を中心に頂点を120°と240°回転する', () => {
    expectPoint(rotatePoint(canonicalTriangle.A, triangleCentroid(), 120), canonicalTriangle.C)
    expectPoint(rotatePoint(canonicalTriangle.A, triangleCentroid(), 240), canonicalTriangle.B)
  })
})

describe('Segmentの交差判定', () => {
  contractTest({ contract: 'ARCH-GEOMETRY-SEGMENT-INTERSECTION' }, '内部同士の交差では交点と双方のparameterを返す', () => {
    const result = intersectSegments(
      { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
      { start: { x: 0, y: 1 }, end: { x: 1, y: 0 } },
    )
    expect(result).toEqual({ kind: 'cross', point: { x: 0.5, y: 0.5 }, firstT: 0.5, secondT: 0.5 })
  })

  contractTest({ contract: 'ARCH-GEOMETRY-SEGMENT-INTERSECTION' }, '離れた線分を交差なしと判定する', () => {
    expect(intersectSegments(
      { start: { x: 0, y: 0 }, end: { x: 0.4, y: 0 } },
      { start: { x: 0.6, y: 0 }, end: { x: 1, y: 0 } },
    )).toEqual({ kind: 'none' })
  })

  contractTest({ contract: 'ARCH-GEOMETRY-SEGMENT-INTERSECTION' }, '双方または片方の端点での接触を判定する', () => {
    expect(intersectSegments(
      { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
      { start: { x: 1, y: 0 }, end: { x: 1, y: 1 } },
    ).kind).toBe('touch')
    expect(intersectSegments(
      { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
      { start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } },
    ).kind).toBe('touch')
  })

  contractTest({ contract: 'ARCH-GEOMETRY-SEGMENT-INTERSECTION' }, '同一直線上の有限長の共有区間だけをoverlapと判定する', () => {
    expect(intersectSegments(
      { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
      { start: { x: 0.25, y: 0 }, end: { x: 0.75, y: 0 } },
    )).toEqual({ kind: 'overlap' })
    expect(intersectSegments(
      { start: { x: 0, y: 0 }, end: { x: 0.5, y: 0 } },
      { start: { x: 0.5, y: 0 }, end: { x: 1, y: 0 } },
    ).kind).toBe('touch')
  })

  contractTest({ contract: 'ARCH-GEOMETRY-SEGMENT-INTERSECTION' }, 'epsilon内の端点差を完全一致に依存せず接触として扱う', () => {
    const result = intersectSegments(
      { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
      { start: { x: 1 + 1e-10, y: -1 }, end: { x: 1 + 1e-10, y: 1 } },
    )
    expect(result.kind).toBe('touch')
  })

  contractTest({ contract: 'ARCH-GEOMETRY-SEGMENT-INTERSECTION', regression: 3 }, '短い非退化Segmentでも内部交差の分類とparameterはスケールに依存しない', () => {
    const cases = [1, 1e-5].map((scale) => intersectSegments(
      { start: { x: 0, y: 0 }, end: { x: scale, y: 0 } },
      { start: { x: scale / 2, y: -scale / 2 }, end: { x: scale / 2, y: scale / 2 } },
    ))

    for (const result of cases) {
      expect(result.kind).toBe('cross')
      if (result.kind !== 'cross') continue
      expect(Number.isFinite(result.firstT)).toBe(true)
      expect(Number.isFinite(result.secondT)).toBe(true)
      expect(result.firstT).toBeCloseTo(0.5)
      expect(result.secondT).toBeCloseTo(0.5)
    }
  })

  contractTest({ contract: 'ARCH-GEOMETRY-SEGMENT-INTERSECTION', regression: 3 }, '短い平行かつ非共線のSegmentを交差なしと判定する', () => {
    expect(intersectSegments(
      { start: { x: 0, y: 0 }, end: { x: 1e-5, y: 0 } },
      { start: { x: 0, y: 1e-5 }, end: { x: 1e-5, y: 1e-5 } },
    )).toEqual({ kind: 'none' })
  })

  contractTest({ contract: 'ARCH-GEOMETRY-SEGMENT-INTERSECTION', regression: 3 }, '短い共線Segmentの1点共有と有限長共有を区別する', () => {
    const source = { start: { x: 0, y: 0 }, end: { x: 1e-5, y: 0 } }
    const touch = intersectSegments(source, {
      start: { x: 1e-5, y: 0 }, end: { x: 2e-5, y: 0 },
    })
    expect(touch.kind).toBe('touch')
    if (touch.kind === 'touch') {
      expect(Number.isFinite(touch.firstT)).toBe(true)
      expect(Number.isFinite(touch.secondT)).toBe(true)
    }
    expect(intersectSegments(source, {
      start: { x: 0.5e-5, y: 0 }, end: { x: 1.5e-5, y: 0 },
    })).toEqual({ kind: 'overlap' })
  })
})

describe('SegmentのFragment生成', () => {
  contractTest({ contract: 'ARCH-GEOMETRY-SEGMENT-FRAGMENTATION' }, '複数の位置をSegment上の順序でFragment化する', () => {
    const source = { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }
    expect(fragmentSegment(source, [0.75, 0.25])).toEqual([
      { start: { x: 0, y: 0 }, end: { x: 0.25, y: 0 } },
      { start: { x: 0.25, y: 0 }, end: { x: 0.75, y: 0 } },
      { start: { x: 0.75, y: 0 }, end: { x: 1, y: 0 } },
    ])
    expect(source).toEqual({ start: { x: 0, y: 0 }, end: { x: 1, y: 0 } })
  })

  contractTest({ contract: 'ARCH-GEOMETRY-SEGMENT-FRAGMENTATION' }, '端点とepsilon内の重複位置でゼロ長Fragmentを作らない', () => {
    const fragments = fragmentSegment(
      { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
      [0, 1, 0.5, 0.5 + 1e-10],
    )
    expect(fragments).toHaveLength(2)
    expect(fragments[0].end).toEqual(fragments[1].start)
  })
})
