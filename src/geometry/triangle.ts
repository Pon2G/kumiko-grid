import type { Point, Triangle, VertexName } from './types'

export const TRIANGLE_HEIGHT = Math.sqrt(3) / 2

export const canonicalTriangle: Triangle = {
  A: { x: 0.5, y: 0 },
  B: { x: 0, y: TRIANGLE_HEIGHT },
  C: { x: 1, y: TRIANGLE_HEIGHT },
}

export const triangleCentroid = (triangle: Triangle = canonicalTriangle): Point => ({
  x: (triangle.A.x + triangle.B.x + triangle.C.x) / 3,
  y: (triangle.A.y + triangle.B.y + triangle.C.y) / 3,
})

export const trianglePoints = (triangle: Triangle = canonicalTriangle): Point[] =>
  (['A', 'B', 'C'] satisfies VertexName[]).map((name) => triangle[name])
