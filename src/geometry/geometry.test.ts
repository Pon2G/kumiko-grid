import { describe, expect, it } from 'vitest'
import { resolveAnchor } from './anchorPoint'
import { canonicalTriangle, triangleCentroid, TRIANGLE_HEIGHT } from './triangle'
import { reflectPoint, rotatePoint } from './transform'

const expectPoint = (actual: { x: number; y: number }, expected: { x: number; y: number }) => {
  expect(actual.x).toBeCloseTo(expected.x)
  expect(actual.y).toBeCloseTo(expected.y)
}

describe('正三角形のgeometry', () => {
  it('BC辺を5等分した2番目の点を正しい座標へ解決する', () => {
    expectPoint(resolveAnchor({ kind: 'edge-division', edge: 'BC', divisions: 5, index: 2 }), {
      x: 0.4,
      y: TRIANGLE_HEIGHT,
    })
  })

  it('頂点と対辺中点を結ぶ軸に対してPointを鏡映する', () => {
    const midpoint = { x: 0.5, y: TRIANGLE_HEIGHT }
    expectPoint(reflectPoint(canonicalTriangle.B, canonicalTriangle.A, midpoint), canonicalTriangle.C)
  })

  it('正三角形の重心を中心に頂点を120°回転する', () => {
    expectPoint(rotatePoint(canonicalTriangle.A, triangleCentroid(), 120), canonicalTriangle.C)
  })
})
