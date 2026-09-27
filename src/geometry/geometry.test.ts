import { describe, expect } from 'vitest'
import { contractTest } from '../test/contractTest'
import { resolveAnchor } from './anchorPoint'
import { fragmentSegment, GEOMETRY_EPSILON, intersectSegments } from './intersections'
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

  contractTest({ contract: 'ARCH-GEOMETRY-SEGMENT-INTERSECTION', regression: 3 }, 'Geometry解像度に対して十分な長さを持つ異なるスケールで交差分類を維持する', () => {
    const classify = (scale: number) => ({
      cross: intersectSegments(
        { start: { x: 0, y: 0 }, end: { x: scale, y: 0 } },
        { start: { x: scale / 2, y: -scale / 2 }, end: { x: scale / 2, y: scale / 2 } },
      ),
      none: intersectSegments(
        { start: { x: 0, y: 0 }, end: { x: scale, y: 0 } },
        { start: { x: 0, y: scale }, end: { x: scale, y: scale } },
      ),
      endpointTouch: intersectSegments(
        { start: { x: 0, y: 0 }, end: { x: scale, y: 0 } },
        { start: { x: scale, y: 0 }, end: { x: scale, y: scale } },
      ),
      collinearTouch: intersectSegments(
        { start: { x: 0, y: 0 }, end: { x: scale, y: 0 } },
        { start: { x: scale, y: 0 }, end: { x: scale * 2, y: 0 } },
      ),
      overlap: intersectSegments(
        { start: { x: 0, y: 0 }, end: { x: scale, y: 0 } },
        { start: { x: scale / 2, y: 0 }, end: { x: scale * 1.5, y: 0 } },
      ),
    })

    for (const results of [classify(1), classify(1e-5)]) {
      expect(Object.fromEntries(Object.entries(results).map(([name, result]) => [name, result.kind]))).toEqual({
        cross: 'cross',
        none: 'none',
        endpointTouch: 'touch',
        collinearTouch: 'touch',
        overlap: 'overlap',
      })
      expect(results.cross.kind).toBe('cross')
      if (results.cross.kind === 'cross') {
        expect(Number.isFinite(results.cross.firstT)).toBe(true)
        expect(Number.isFinite(results.cross.secondT)).toBe(true)
        expect(results.cross.firstT).toBeCloseTo(0.5)
        expect(results.cross.secondT).toBeCloseTo(0.5)
      }
    }
  })

  contractTest({ contract: 'ARCH-GEOMETRY-SEGMENT-INTERSECTION', regression: 3 }, '座標距離epsilon以内の共線端点間のずれをSegment長によらず接触として扱う', () => {
    for (const length of [1, 1e-5]) {
      const result = intersectSegments(
        { start: { x: 0, y: 0 }, end: { x: length, y: 0 } },
        {
          start: { x: length + GEOMETRY_EPSILON / 2, y: 0 },
          end: { x: length * 2 + GEOMETRY_EPSILON / 2, y: 0 },
        },
      )
      expect(result.kind).toBe('touch')
      if (result.kind === 'touch') {
        expect(Number.isFinite(result.firstT)).toBe(true)
        expect(Number.isFinite(result.secondT)).toBe(true)
      }
    }
  })
})

describe('SegmentのFragment生成', () => {
  contractTest({ contract: 'ARCH-GEOMETRY-SEGMENT-FRAGMENTATION', regression: 3 }, '有効なsplit境界がなければsource Segmentと同じGeometryを保持する', () => {
    const source = { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }
    expect(fragmentSegment(source, [])).toEqual([source])
    expect(fragmentSegment(source, [Number.NaN, Number.POSITIVE_INFINITY, 0, 1])).toEqual([source])
  })

  contractTest({ contract: 'ARCH-GEOMETRY-SEGMENT-FRAGMENTATION', regression: 3 }, 'epsilon以下の非退化source Segmentをsplit不能でも削除しない', () => {
    const source = {
      start: { x: 0, y: 0 },
      end: { x: GEOMETRY_EPSILON / 2, y: 0 },
    }
    expect(fragmentSegment(source, [])).toEqual([source])
    expect(fragmentSegment(source, [0.25, 0.5, 0.75])).toEqual([source])
  })

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

  contractTest({ contract: 'ARCH-GEOMETRY-SEGMENT-FRAGMENTATION', regression: 3 }, '座標距離epsilon以内の端点位置と重複位置をSegment長によらずFragment境界にしない', () => {
    for (const length of [1, 1e-5]) {
      const parameterOffset = GEOMETRY_EPSILON / (length * 2)
      const fragments = fragmentSegment(
        { start: { x: 0, y: 0 }, end: { x: length, y: 0 } },
        [parameterOffset, 0.5, 0.5 + parameterOffset, 1 - parameterOffset],
      )
      expect(fragments).toHaveLength(2)
      expect(fragments[0].end).toEqual(fragments[1].start)
    }
  })
})
