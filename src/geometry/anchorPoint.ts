import { canonicalTriangle } from './triangle'
import type { EdgeName, Point, Triangle, VertexName } from './types'

export type AnchorPoint =
  | { kind: 'vertex'; vertex: VertexName }
  | { kind: 'edge-division'; edge: EdgeName; divisions: number; index: number }

const edgeVertices: Record<EdgeName, [VertexName, VertexName]> = {
  AB: ['A', 'B'],
  BC: ['B', 'C'],
  CA: ['C', 'A'],
}

export const interpolate = (start: Point, end: Point, ratio: number): Point => ({
  x: start.x + (end.x - start.x) * ratio,
  y: start.y + (end.y - start.y) * ratio,
})

export function resolveAnchor(anchor: AnchorPoint, triangle: Triangle = canonicalTriangle): Point {
  if (anchor.kind === 'vertex') return triangle[anchor.vertex]
  if (anchor.divisions < 2 || anchor.index <= 0 || anchor.index >= anchor.divisions) {
    throw new RangeError('Edge division index must be inside an edge with at least two divisions')
  }
  const [start, end] = edgeVertices[anchor.edge]
  return interpolate(triangle[start], triangle[end], anchor.index / anchor.divisions)
}

export function createAnchors(divisions: number): AnchorPoint[] {
  if (!Number.isInteger(divisions) || divisions < 2) {
    throw new RangeError('Divisions must be an integer of at least two')
  }
  const vertices: AnchorPoint[] = (['A', 'B', 'C'] as const).map((vertex) => ({ kind: 'vertex', vertex }))
  const divisionsOnEdges: AnchorPoint[] = (['AB', 'BC', 'CA'] as const).flatMap((edge) =>
    Array.from({ length: divisions - 1 }, (_, offset) => ({
      kind: 'edge-division' as const,
      edge,
      divisions,
      index: offset + 1,
    })),
  )
  return [...vertices, ...divisionsOnEdges]
}

export const anchorKey = (anchor: AnchorPoint): string =>
  anchor.kind === 'vertex'
    ? `vertex-${anchor.vertex}`
    : `edge-${anchor.edge}-${anchor.divisions}-${anchor.index}`
