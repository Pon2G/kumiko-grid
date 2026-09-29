import { canonicalTriangle } from '../geometry/triangle'
import type { EdgeName, Point, Triangle, VertexName } from '../geometry/types'
import type { IntersectionAnchor } from './intersectionAnchor'

export type VertexAnchor = { kind: 'vertex'; vertex: VertexName }
export type EdgeDivisionAnchor = { kind: 'edge-division'; edge: EdgeName; divisions: number; index: number }
export type SegmentEndpointAnchor = VertexAnchor | EdgeDivisionAnchor
export type AnchorRef = SegmentEndpointAnchor | IntersectionAnchor
export type AnchorPoint = SegmentEndpointAnchor

const edgeVertices: Record<EdgeName, [VertexName, VertexName]> = {
  AB: ['A', 'B'],
  BC: ['B', 'C'],
  CA: ['C', 'A'],
}

export const interpolate = (start: Point, end: Point, ratio: number): Point => ({
  x: start.x + (end.x - start.x) * ratio,
  y: start.y + (end.y - start.y) * ratio,
})

/** source Segmentの端点として現在許可されるAnchorだけを座標へ解決する。 */
export function resolveSegmentEndpoint(anchor: SegmentEndpointAnchor, triangle: Triangle = canonicalTriangle): Point {
  if (anchor.kind === 'vertex') return triangle[anchor.vertex]
  if (anchor.divisions < 2 || anchor.index <= 0 || anchor.index >= anchor.divisions) {
    throw new RangeError('辺の分割数は2以上とし、indexには端点を除く内分点を指定してください')
  }
  const [start, end] = edgeVertices[anchor.edge]
  return interpolate(triangle[start], triangle[end], anchor.index / anchor.divisions)
}

export const resolveAnchor = resolveSegmentEndpoint

export function createAnchors(divisions: number): SegmentEndpointAnchor[] {
  if (!Number.isInteger(divisions) || divisions < 2) throw new RangeError('分割数には2以上の整数を指定してください')
  const vertices: SegmentEndpointAnchor[] = (['A', 'B', 'C'] as const).map((vertex) => ({ kind: 'vertex', vertex }))
  const divisionsOnEdges: SegmentEndpointAnchor[] = (['AB', 'BC', 'CA'] as const).flatMap((edge) =>
    Array.from({ length: divisions - 1 }, (_, offset) => ({ kind: 'edge-division' as const, edge, divisions, index: offset + 1 })))
  return [...vertices, ...divisionsOnEdges]
}

export const anchorKey = (anchor: SegmentEndpointAnchor): string => anchor.kind === 'vertex'
  ? `vertex-${anchor.vertex}`
  : `edge-${anchor.edge}-${anchor.divisions}-${anchor.index}`
