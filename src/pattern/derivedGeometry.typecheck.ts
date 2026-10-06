import type { CellPattern, SplitRelation } from './cellPattern'
import {
  deriveDesignGeometrySnapshot,
  type DesignGeometrySnapshot,
  validateSplitRelationOrbitFromSnapshot,
} from './designGeometry'
import {
  createEffectiveGeometryQuery,
  type EffectiveGeometryQuery,
} from './materialExclusion'

/** runtimeの振る舞いではなく、共有派生値の公開型境界をtscで継続検証する。 */
function verifyDerivedGeometryTypes(patternA: CellPattern, patternB: CellPattern, relation: SplitRelation): void {
  const snapshot = deriveDesignGeometrySnapshot(patternA)
  const query = createEffectiveGeometryQuery(patternA)
  const orbit = validateSplitRelationOrbitFromSnapshot(snapshot, relation)
  query.validateSplitRelationOrbit(relation)

  // @ts-expect-error factoryを経ないobject literalは正規snapshotにならない
  const literalSnapshot: DesignGeometrySnapshot = {
    logicalFragments: [],
    geometry: [],
    copyGeometry: () => [],
    validateSplitRelationOrbit: () => null,
  }
  // @ts-expect-error spread後に派生値を差し替えた値は正規snapshotにならない
  const mixedSnapshot: DesignGeometrySnapshot = { ...snapshot, pattern: patternB, geometry: [] }
  // @ts-expect-error factoryを経ないobject literalは正規queryにならない
  const literalQuery: EffectiveGeometryQuery = {
    geometry: [],
    copyGeometry: () => [],
    canSplit: () => true,
    validateSplitRelationOrbit: () => null,
  }
  // @ts-expect-error spread後にGeometryと問い合わせを差し替えた値は正規queryにならない
  const mixedQuery: EffectiveGeometryQuery = { ...query, geometry: [], canSplit: () => true }

  const resolved = snapshot.logicalFragments[0]
  if (resolved) {
    // @ts-expect-error snapshotが共有する座標は読み取り専用
    resolved.start.x = 0
    // @ts-expect-error snapshotが共有する論理境界は読み取り専用
    resolved.logicalFragment.boundaryA = { kind: 'segment-endpoint', endpoint: 'start' }
  }
  const effective = query.geometry[0]
  if (effective) {
    // @ts-expect-error queryが共有する座標は読み取り専用
    effective.end.y = 0
    // @ts-expect-error queryが共有する論理境界の参照先も読み取り専用
    effective.logicalFragment.segmentInstanceRef.transform = { type: 'identity' }
  }
  if (orbit) {
    const target = orbit.pairs[0][0]
    const cutter = orbit.pairs[0][1]
    void target
    void cutter
    // @ts-expect-error pairはtarget / cutterの2要素タプル
    orbit.pairs[0][2]
    // @ts-expect-error orbit pairが参照するSegment座標は読み取り専用
    orbit.pairs[0][0].start.x = 0
    // @ts-expect-error orbit intersectionの座標は読み取り専用
    orbit.intersections[0].point.y = 0
  }

  void literalSnapshot
  void mixedSnapshot
  void literalQuery
  void mixedQuery
}

void verifyDerivedGeometryTypes
