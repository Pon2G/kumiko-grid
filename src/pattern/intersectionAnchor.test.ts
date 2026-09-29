import { describe, expect } from 'vitest'
import { contractTest } from '../test/contractTest'
import type { CellPattern, SegmentInstanceRef } from './cellPattern'
import {
  createIntersectionAnchor,
  intersectionAnchorKey,
  resolveIntersectionAnchor,
} from './intersectionAnchor'
import type { Segment } from './segment'
import {
  changeSymmetry,
  deriveIntersectionAnchors,
  deriveLogicalFragments,
  derivePatternGeometry,
  removeSegment,
} from './splitting'

const ref = (sourceSegmentId: string): SegmentInstanceRef => ({ sourceSegmentId, transform: { type: 'identity' } })
const target: Segment = {
  id: 'A',
  start: { kind: 'vertex', vertex: 'A' },
  end: { kind: 'edge-division', edge: 'BC', divisions: 2, index: 1 },
}
const cutterB: Segment = {
  id: 'B',
  start: { kind: 'vertex', vertex: 'B' },
  end: { kind: 'edge-division', edge: 'CA', divisions: 2, index: 1 },
}
const cutterC: Segment = {
  id: 'C',
  start: { kind: 'vertex', vertex: 'C' },
  end: { kind: 'edge-division', edge: 'AB', divisions: 2, index: 1 },
}

const relation = (targetSegmentId: string, cutterSegmentId: string) => ({
  targetSegmentId,
  cutterSegmentId,
  relativeTransform: { type: 'identity' as const },
})

describe('IntersectionAnchorと論理Fragment', () => {
  contractTest({ contract: 'SPEC-ANCHOR-INTERSECTION-LOGICAL-POINT' }, 'instance pairの順序を逆にしても同じcanonical identityになる', () => {
    const forward = createIntersectionAnchor(ref('A'), ref('B'))
    const reverse = createIntersectionAnchor(ref('B'), ref('A'))

    expect(forward).toEqual(reverse)
    expect(intersectionAnchorKey(forward)).toBe(intersectionAnchorKey(reverse))
  })

  contractTest({ contract: 'ARCH-PATTERN-SEGMENT-IDENTITY' }, '端点定義や交点parameterをSegmentとIntersectionAnchorのidentityに含めない', () => {
    const anchor = createIntersectionAnchor(ref('A'), ref('B'))
    const editedTarget: Segment = { ...target, end: { kind: 'edge-division', edge: 'BC', divisions: 3, index: 1 } }

    expect(editedTarget.id).toBe(target.id)
    expect(intersectionAnchorKey(createIntersectionAnchor(
      { sourceSegmentId: editedTarget.id, transform: { type: 'identity' } },
      ref('B'),
    ))).toBe(intersectionAnchorKey(anchor))
  })

  contractTest({ contract: 'SPEC-PATTERN-INTERSECTION-ANCHOR-DERIVATION' }, '1つのrotational relation orbitから各concrete pairのAnchorを導出する', () => {
    const pattern: CellPattern = {
      segments: [target, cutterB],
      symmetry: { type: 'rotational' },
      splitRelations: [relation('A', 'B')],
    }

    expect(deriveIntersectionAnchors(pattern)).toHaveLength(3)
  })

  contractTest({ contract: 'SPEC-PATTERN-INTERSECTION-ANCHOR-DERIVATION' }, '逆向きrelationは同じconcrete pairのAnchorを共有する', () => {
    const pattern: CellPattern = {
      segments: [target, cutterB],
      symmetry: { type: 'none' },
      splitRelations: [relation('A', 'B'), relation('B', 'A')],
    }

    expect(deriveIntersectionAnchors(pattern)).toHaveLength(1)
  })

  contractTest({ contract: 'ARCH-DOMAIN-LOGICAL-IDENTITY-GEOMETRY-SEPARATION' }, '同一点の異なるinstance pairを別Anchorとして維持する', () => {
    const pattern: CellPattern = {
      segments: [target, cutterB, cutterC],
      symmetry: { type: 'none' },
      splitRelations: [relation('A', 'B'), relation('A', 'C')],
    }
    const anchors = deriveIntersectionAnchors(pattern)

    expect(anchors).toHaveLength(2)
    expect(resolveIntersectionAnchor(pattern, anchors[0])?.point).toEqual(resolveIntersectionAnchor(pattern, anchors[1])?.point)
    expect(intersectionAnchorKey(anchors[0])).not.toBe(intersectionAnchorKey(anchors[1]))
  })

  contractTest({ contract: 'SPEC-PATTERN-FRAGMENT-LOGICAL-BOUNDARIES' }, '同一点の論理境界とその間のゼロ長Logical Fragmentを失わない', () => {
    const pattern: CellPattern = {
      segments: [target, cutterB, cutterC],
      symmetry: { type: 'none' },
      splitRelations: [relation('A', 'B'), relation('A', 'C')],
    }
    const logical = deriveLogicalFragments(pattern).filter(({ segmentInstanceRef }) => segmentInstanceRef.sourceSegmentId === 'A')
    const geometry = derivePatternGeometry(pattern).filter(({ sourceId }) => sourceId === 'A')

    expect(logical).toHaveLength(3)
    expect(logical.filter(({ boundaryA, boundaryB }) => boundaryA.kind === 'intersection' && boundaryB.kind === 'intersection')).toHaveLength(1)
    expect(geometry).toHaveLength(2)
    expect(geometry.every(({ logicalFragment }) => logicalFragment.segmentInstanceRef.sourceSegmentId === 'A')).toBe(true)
    expect(geometry.every((fragment) => !('fragmentIndex' in fragment))).toBe(true)
  })

  contractTest({ contract: 'SPEC-PATTERN-LOGICAL-DEPENDENCY-CLEANUP' }, 'Segment削除で消えたinstanceを参照するAnchorとFragment境界を残さない', () => {
    const pattern: CellPattern = {
      segments: [target, cutterB],
      symmetry: { type: 'none' },
      splitRelations: [relation('A', 'B')],
    }
    const removed = removeSegment(pattern, 'B')

    expect(deriveIntersectionAnchors(removed)).toEqual([])
    expect(deriveLogicalFragments(removed).some(({ boundaryA, boundaryB }) => boundaryA.kind === 'intersection' || boundaryB.kind === 'intersection')).toBe(false)
  })

  contractTest({ contract: 'SPEC-PATTERN-LOGICAL-DEPENDENCY-CLEANUP' }, 'Symmetry変更で失われた旧instanceのAnchorをGeometry一致から復活させない', () => {
    const rotational: CellPattern = {
      segments: [target],
      symmetry: { type: 'rotational' },
      splitRelations: [{ targetSegmentId: 'A', cutterSegmentId: 'A', relativeTransform: { type: 'rotation', steps: 1 } }],
    }
    const oldKeys = deriveIntersectionAnchors(rotational).map(intersectionAnchorKey)
    const changed = changeSymmetry(rotational, { type: 'none' })

    expect(oldKeys).not.toHaveLength(0)
    expect(changed.splitRelations).toEqual([])
    expect(deriveIntersectionAnchors(changed)).toEqual([])
  })
})
