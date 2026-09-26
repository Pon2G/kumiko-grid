import { describe, expect, it } from 'vitest'
import { resolveAnchor } from './anchorPoint'
import { canonicalTriangle, triangleCentroid, TRIANGLE_HEIGHT } from './triangle'
import { reflectPoint, rotatePoint } from './transform'

const expectPoint = (actual: { x: number; y: number }, expected: { x: number; y: number }) => {
  expect(actual.x).toBeCloseTo(expected.x)
  expect(actual.y).toBeCloseTo(expected.y)
}

describe('triangle geometry', () => {
  it('resolves an n-division anchor from its relative edge representation', () => {
    expectPoint(resolveAnchor({ kind: 'edge-division', edge: 'BC', divisions: 5, index: 2 }), {
      x: 0.4,
      y: TRIANGLE_HEIGHT,
    })
  })

  it('reflects a point across a vertex-to-opposite-edge axis', () => {
    const midpoint = { x: 0.5, y: TRIANGLE_HEIGHT }
    expectPoint(reflectPoint(canonicalTriangle.B, canonicalTriangle.A, midpoint), canonicalTriangle.C)
  })

  it('rotates a vertex 120 degrees around the triangle centroid', () => {
    expectPoint(rotatePoint(canonicalTriangle.A, triangleCentroid(), 120), canonicalTriangle.C)
  })
})
