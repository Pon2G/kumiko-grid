import type { CellPattern, SegmentInstanceRef } from '../../pattern/cellPattern'
import { deriveLogicalFragments, logicalFragmentKey, type LogicalFragment } from '../../pattern/designGeometry'
import { getIntersectionInteractionCandidates, intersectionCandidateKey, type IntersectionInteractionCandidate } from '../../pattern/splitCandidates'
import { expandPattern, instanceRefKey } from '../../pattern/symmetry'

export type LogicalTarget =
  | { kind: 'segment'; segment: SegmentInstanceRef }
  | { kind: 'intersection'; candidate: IntersectionInteractionCandidate }
  | { kind: 'fragment'; fragment: LogicalFragment }

/** 同じlogical identityだけを現在のPatternへ照合し、必要な派生値が変わらなければ参照を維持する。 */
export function reconcileLogicalTarget(pattern: CellPattern, target: LogicalTarget): LogicalTarget | null {
  if (target.kind === 'segment') return expandPattern(pattern)
    .some(({ instanceRef }) => instanceRefKey(instanceRef) === instanceRefKey(target.segment)) ? target : null
  if (target.kind === 'fragment') return deriveLogicalFragments(pattern)
    .some((fragment) => logicalFragmentKey(fragment) === logicalFragmentKey(target.fragment)) ? target : null
  const candidate = getIntersectionInteractionCandidates(pattern, target.candidate.target)
    .find((item) => intersectionCandidateKey(item) === intersectionCandidateKey(target.candidate))
  if (!candidate) return null
  return candidate.active === target.candidate.active ? target : { kind: 'intersection', candidate }
}
