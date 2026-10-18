import { pointsAreClose } from '../geometry/intersections'
import type { SegmentEndpointAnchor } from './anchor'
import type { CellPattern } from './cellPattern'
import type { Segment } from './segment'
import { dependencyOrder, expandPattern, resolveSourceDefinitions, segmentFamilyKey } from './sourceGeometry'
import { hasOverlap } from './segmentOverlap'

export const continueEndpointSources = (segments: readonly Segment[], symmetry: CellPattern['symmetry']): Segment[] =>
  resolveSourceDefinitions({ segments: [...segments], symmetry }, true).segments

export function validateEndpointSources(pattern: Pick<CellPattern, 'segments' | 'symmetry'>, rejectFamilies = true): string | null {
  dependencyOrder(pattern.segments)
  const instances = expandPattern(pattern)
  if (instances.some(s => pointsAreClose(s.start, s.end))) return '両端が同じ位置になる線分は作成できません'
  if (rejectFamilies) {
    const families = pattern.segments.map(s => segmentFamilyKey(pattern.symmetry, s, pattern.segments))
    if (new Set(families).size !== families.length) return '線分が重複するため変更できません'
  }
  return hasOverlap(instances) ? '線分が重なるため変更できません' : null
}

export const validEndpointAnchor = (anchor: SegmentEndpointAnchor): boolean => !!anchor && (anchor.kind === 'intersection'
  ? !!anchor.first?.sourceSegmentId && !!anchor.second?.sourceSegmentId && !!anchor.first.transform && !!anchor.second.transform
  : anchor.kind === 'vertex' ? ['A', 'B', 'C'].includes(anchor.vertex)
    : anchor.kind === 'edge-division' && ['AB', 'BC', 'CA'].includes(anchor.edge)
      && Number.isInteger(anchor.divisions) && Number.isInteger(anchor.index)
      && anchor.divisions >= 2 && anchor.index > 0 && anchor.index < anchor.divisions)
