import { pointsAreClose } from '../geometry/intersections'
import type { CellPattern } from './cellPattern'
import type { SegmentEndpointAnchor } from './anchor'
import { createIntersectionAnchor, intersectionAnchorKey, type IntersectionAnchor } from './intersectionAnchor'
import { deriveEffectiveGeometry } from './materialExclusion'
import { expandPattern, resolvePair, transformEndpoint } from './sourceGeometry'
import { instanceRefKey } from './instanceKey'

/** Fragment端点も材あり集合へ含める。交点の存在自体はDesign全線分で判定する。 */
export function intersectionEndpointCandidates(pattern: CellPattern): IntersectionAnchor[] {
  const instances = expandPattern(pattern), effective = deriveEffectiveGeometry(pattern)
  const result: IntersectionAnchor[] = []
  for (let i = 0; i < instances.length; i++) for (let j = i + 1; j < instances.length; j++) {
    const anchor = createIntersectionAnchor(instances[i].instanceRef, instances[j].instanceRef)
    const hit = resolvePair(instances, anchor)
    if (!hit) continue
    const hasMaterial = (key: string) => effective.some(fragment => {
      if (instanceRefKey(fragment.instanceRef) !== key) return false
      const dx = fragment.end.x-fragment.start.x, dy = fragment.end.y-fragment.start.y
      const t = Math.max(0, Math.min(1, ((hit.point.x-fragment.start.x)*dx+(hit.point.y-fragment.start.y)*dy)/(dx*dx+dy*dy)))
      return pointsAreClose(hit.point, { x: fragment.start.x+t*dx, y: fragment.start.y+t*dy })
    })
    if (hasMaterial(instanceRefKey(anchor.first)) && hasMaterial(instanceRefKey(anchor.second))) result.push(anchor)
  }
  return result
}

export function selectableEndpoint(pattern: CellPattern, anchor: SegmentEndpointAnchor): boolean {
  if (anchor.kind !== 'intersection') return true
  const normalized = transformEndpoint(pattern.symmetry, anchor, { type: 'identity' }, pattern.segments)
  return normalized?.kind === 'intersection' && intersectionEndpointCandidates(pattern).some(item => intersectionAnchorKey(item) === intersectionAnchorKey(normalized))
}
