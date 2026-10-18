import { intersectSegments, pointsAreClose } from '../geometry/intersections'
import { expect } from 'vitest'
import { contractTest } from '../test/contractTest'
import type { CellPattern, SegmentInstanceRef } from './cellPattern'
import type { Segment } from './segment'
import { addSegment, removeSegment, addSplitRelation, removeSplitRelation, changeSymmetry, evaluateRemoveSegment, evaluateSymmetryChange } from './patternOperations'
import { changeSegmentEndpoint, sourceEndpointDestination } from './endpointEdit'
import { createIntersectionAnchor, intersectionAnchorKey } from './intersectionAnchor'
import { expandPattern, resolveEndpoint } from './sourceGeometry'
import { createEndpointGeometryQuery, intersectionEndpointCandidates } from './endpointCandidates'
import { deriveLogicalFragments } from './designGeometry'
import { excludeMaterial, restoreMaterial } from './materialExclusion'

const vertex = (vertex: 'A' | 'B' | 'C') => ({ kind: 'vertex' as const, vertex })
const edge = (edge: 'AB' | 'BC' | 'CA', index = 1, divisions = 2) => ({ kind: 'edge-division' as const, edge, index, divisions })
const ref = (sourceSegmentId: string): SegmentInstanceRef => ({ sourceSegmentId, transform: { type: 'identity' } })
const intersection = (a: string, b: string) => createIntersectionAnchor(ref(a), ref(b))
const a: Segment = { id: 'a', start: vertex('A'), end: edge('BC') }
const b: Segment = { id: 'b', start: vertex('B'), end: edge('CA') }
const base = (): CellPattern => ({ segments: [a, b], symmetry: { type: 'none' }, splitRelations: [], materialExclusions: [] })
const dependent: Segment = { id: 'd', start: intersection('a', 'b'), end: edge('AB', 1, 4) }
const connected = () => addSegment(base(), dependent)

contractTest({ contract: 'SPEC-ANCHOR-INTERSECTION-ENDPOINT' }, '未split交点を始終点として保存しpair順序は同値で暗黙splitを作らない', () => {
  const pattern = connected()
  expect(pattern.segments).toHaveLength(3)
  expect(pattern.segments.find(s => s.id === 'd')?.start).toEqual(dependent.start)
  expect(pattern.splitRelations).toEqual([])
  const reversed = createIntersectionAnchor(ref('b'), ref('a'))
  expect(intersectionAnchorKey(reversed)).toBe(intersectionAnchorKey(dependent.start as ReturnType<typeof intersection>))
  expect(addSegment(base(), { ...dependent, start: dependent.end, end: reversed }).segments).toHaveLength(3)
  const touch = addSegment({ ...base(), segments: [a, { ...b, start: vertex('A') }] }, { id: 'touch', start: intersection('a', 'b'), end: vertex('B') })
  expect(touch.segments).toHaveLength(3)
})

contractTest({ contract: 'SPEC-ANCHOR-INTERSECTION-ENDPOINT-MATERIAL' }, '新規参照は材を必要とし使用後の参照は材除外と復元に影響されない', () => {
  const original = connected()
  const fragment = deriveLogicalFragments(original).find(f => f.segmentInstanceRef.sourceSegmentId === 'a')!
  const excluded = excludeMaterial(original, fragment)
  expect(resolveEndpoint(excluded, dependent.start)).toEqual(resolveEndpoint(original, dependent.start))
  expect(addSegment(excluded, { ...dependent, id: 'new', end: vertex('C') })).toBe(excluded)
  expect(changeSegmentEndpoint(excluded, 'd', 'start', dependent.start)).toEqual({ kind: 'unchanged' })
  expect(intersectionEndpointCandidates(excluded)).not.toContainEqual(dependent.start)
  const removed = removeSegment(excluded, 'd')
  const restored = restoreMaterial(removed, deriveLogicalFragments(removed).find(f => f.segmentInstanceRef.sourceSegmentId === 'a')!)
  expect(restored.segments.some(s => s.id === 'd')).toBe(false)
  expect(intersectionEndpointCandidates(restored)).toContainEqual(dependent.start)
})

contractTest({ contract: 'ARCH-PATTERN-ENDPOINT-DEPENDENCY-DAG' }, '配列順に依存せず多段解決し自己参照と間接循環をatomicに拒否する', () => {
  const first = connected()
  const second = addSegment(first, { id: 'e', start: intersection('a', 'd'), end: edge('BC', 3, 4) })
  expect(second.segments).toHaveLength(4)
  const bySource = (pattern: CellPattern) => expandPattern(pattern).sort((left, right) => left.sourceId.localeCompare(right.sourceId))
  expect(bySource({ ...second, segments: [...second.segments].reverse() })).toEqual(bySource(second))
  expect(changeSegmentEndpoint(second, 'a', 'start', intersection('b', 'e')).kind).toBe('rejected')
  expect(addSegment(base(), { ...dependent, id: 'self', start: intersection('self', 'a') })).toEqual(base())
  expect(second.segments.find(s => s.id === 'a')).toEqual(a)
})

contractTest({ contract: 'SPEC-PATTERN-ENDPOINT-DEPENDENCY-LIFECYCLE' }, '移動に追従しsplit解除では存続し参照source削除では下位まで削除する', () => {
  const first = connected()
  const second = addSegment(first, { id: 'e', start: intersection('a', 'd'), end: edge('BC', 3, 4) })
  const changed = changeSegmentEndpoint(second, 'a', 'end', edge('BC', 1, 4))
  expect(changed.kind).toBe('changed')
  if (changed.kind !== 'changed') return
  expect(resolveEndpoint(changed.pattern, dependent.start)).not.toEqual(resolveEndpoint(second, dependent.start))
  const relation = { targetSegmentId: 'a', cutterSegmentId: 'b', relativeTransform: { type: 'identity' as const } }
  const split = addSplitRelation(second, relation)
  const unsplit = removeSplitRelation(split, relation)
  expect(unsplit.segments).toHaveLength(4)
  const removed = removeSegment(unsplit, 'b')
  expect(removed.segments.map(s => s.id)).toEqual(['a'])
  expect(addSegment(removed, b).segments.map(s => s.id)).toEqual(['a', 'b'])
})

contractTest({ contract: 'ARCH-PATTERN-ENDPOINT-DEPENDENCY-ATOMICITY' }, '同座標別identityの退化と依存sourceだけのoverlapを全体拒否する', () => {
  const pattern = base()
  const c = { id: 'c', start: vertex('C'), end: edge('AB') }
  const three = addSegment(pattern, c)
  expect(addSegment(three, { id: 'zero', start: intersection('a', 'b'), end: intersection('a', 'c') })).toBe(three)
  const connectedPattern = connected()
  const changed = changeSegmentEndpoint(connectedPattern, 'b', 'start', edge('AB', 1, 4))
  expect(changed.kind).toBe('rejected')
  expect(connectedPattern.segments.find(s => s.id === 'b')).toEqual(b)
})

contractTest({ contract: 'ARCH-PATTERN-INTERSECTION-ENDPOINT-MAPPING' }, '同sourceの異なる鏡映instanceを参照し逆変換と非対応member喪失を扱う', () => {
  const mirror: CellPattern = { ...base(), segments: [{ ...a, end: edge('BC', 1, 4) }], symmetry: { type: 'mirror', axis: 'A' } }
  const anchor = createIntersectionAnchor(ref('a'), { sourceSegmentId: 'a', transform: { type: 'mirror', axis: 'A' } })
  const pattern = addSegment(mirror, { id: 'd', start: anchor, end: edge('BC') })
  expect(pattern.segments).toHaveLength(2)
  expect(sourceEndpointDestination(pattern, ref('d'), anchor)).toEqual(anchor)
  const result = evaluateSymmetryChange(pattern, { type: 'none' })
  expect(result.kind).toBe('changed')
  if (result.kind === 'changed') {
    expect(result.impact.lostSourceIds).toEqual(['d'])
    expect(result.pattern.segments).toHaveLength(1)
  }
  const moved = evaluateSymmetryChange(pattern, { type: 'mirror', axis: 'B' })
  expect(moved.kind).toBe('changed')
  if (moved.kind === 'changed') {
    expect(moved.pattern.segments.find(s => s.id === 'd')?.start).toEqual(createIntersectionAnchor(ref('a'), { sourceSegmentId: 'a', transform: { type: 'mirror', axis: 'B' } }))
    expect(moved.impact.lostSourceIds).toEqual([])
  }
})

contractTest({ contract: 'SPEC-EDITOR-ENDPOINT-DEPENDENCY-CONFIRMATION' }, 'source削除評価は要求したsourceと追加の連鎖喪失を区別し入力を維持する', () => {
  const pattern = connected()
  const result = evaluateRemoveSegment(pattern, 'a')
  expect(result.kind).toBe('changed')
  if (result.kind === 'changed') expect(result.impact.lostSourceIds).toEqual(['d'])
  expect(pattern.segments).toHaveLength(3)
})

contractTest({ contract: 'ARCH-PATTERN-INTERSECTION-ENDPOINT-MAPPING' }, '依存先のFamily統合を二階層へ伝播し全旧sourceの材指定をunionする', () => {
  let pattern: CellPattern = { ...base(), segments: [] }
  const sources: Segment[] = [
    { id: 'left', start: vertex('A'), end: vertex('B') },
    { id: 'right', start: vertex('A'), end: vertex('C') },
    { id: 'bottom', start: vertex('B'), end: vertex('C') },
    { id: 'd', start: intersection('left', 'bottom'), end: edge('CA') },
    { id: 'e', start: intersection('right', 'bottom'), end: edge('AB') },
    { id: 'f', start: intersection('d', 'bottom'), end: edge('CA', 1, 4) },
    { id: 'g', start: intersection('e', 'bottom'), end: edge('AB', 3, 4) },
  ]
  for (const source of sources) pattern = addSegment(pattern, source)
  expect(pattern.segments).toHaveLength(7)
  for (const id of ['e', 'g']) pattern = excludeMaterial(pattern, deriveLogicalFragments(pattern).find(f => f.segmentInstanceRef.sourceSegmentId === id)!)
  const result = evaluateSymmetryChange(pattern, { type: 'mirror', axis: 'A' })
  expect(result.kind).toBe('changed')
  if (result.kind !== 'changed') return
  expect(result.pattern.segments).toHaveLength(4)
  expect(result.impact.lostSourceIds).toEqual([])
  expect(result.impact.lostExclusions).toBe(0)
  expect(result.pattern.materialExclusions).toHaveLength(2)
  const reordered = changeSymmetry({ ...pattern, segments: [...pattern.segments].reverse() }, { type: 'mirror', axis: 'A' })
  expect([...reordered.segments].sort((a,b) => a.id.localeCompare(b.id))).toEqual([...result.pattern.segments].sort((a,b) => a.id.localeCompare(b.id)))
})

contractTest({ contract: 'SPEC-ANCHOR-INTERSECTION-ENDPOINT-MATERIAL' }, '材ありFragmentの端点touchを新規端点に利用できる', () => {
  const relation = { targetSegmentId: 'a', cutterSegmentId: 'b', relativeTransform: { type: 'identity' as const } }
  const split = addSplitRelation(base(), relation)
  const fragment = deriveLogicalFragments(split).find(f => f.segmentInstanceRef.sourceSegmentId === 'a')!
  const excluded = excludeMaterial(split, fragment)
  expect(intersectionEndpointCandidates(excluded)).toContainEqual(dependent.start)
  expect(addSegment(excluded, dependent).segments).toHaveLength(3)
})

contractTest({ contract: 'ARCH-PATTERN-ENDPOINT-DEPENDENCY-ATOMICITY' }, '連鎖喪失候補と生存sourceのoverlapが同時に発生しても全状態を拒否時に維持する', () => {
  const pattern = addSegment(connected(), { id: 'edge', start: vertex('B'), end: edge('AB', 1, 8) })
  expect(pattern.segments).toHaveLength(4)
  const before = structuredClone(pattern)
  const result = changeSegmentEndpoint(pattern, 'b', 'end', edge('AB', 1, 4))
  expect(result.kind).toBe('rejected')
  expect(pattern).toEqual(before)
  expect(pattern.segments.some(s => s.id === 'd')).toBe(true)
})

contractTest({ contract: 'ARCH-PATTERN-INTERSECTION-ENDPOINT-MAPPING' }, '参照先stabilizerの解除と再成立で保存refを継続し生成instanceの交点を逆変換する', () => {
  const initial: CellPattern = { ...base(), symmetry: { type: 'mirror', axis: 'A' } }
  const pattern = addSegment(initial, dependent)
  expect(pattern.segments).toHaveLength(3)
  const generated: SegmentInstanceRef = { sourceSegmentId: 'd', transform: { type: 'mirror', axis: 'A' } }
  const destination = createIntersectionAnchor(ref('a'), { sourceSegmentId: 'b', transform: { type: 'mirror', axis: 'A' } })
  expect(sourceEndpointDestination(pattern, generated, destination)).toEqual(dependent.start)
  const changed = changeSegmentEndpoint(pattern, 'a', 'end', edge('BC', 1, 4))
  expect(changed.kind).toBe('changed')
  if (changed.kind !== 'changed') return
  expect(changed.pattern.segments.find(s => s.id === 'd')?.start).toEqual(dependent.start)
  expect(expandPattern(changed.pattern).filter(s => s.sourceId === 'a')).toHaveLength(2)
  expect(resolveEndpoint(changed.pattern, dependent.start)).not.toEqual(resolveEndpoint(pattern, dependent.start))
  const restored = changeSegmentEndpoint(changed.pattern, 'a', 'end', edge('BC'))
  expect(restored.kind).toBe('changed')
  if (restored.kind === 'changed') {
    expect(expandPattern(restored.pattern).filter(s => s.sourceId === 'a')).toHaveLength(1)
    expect(restored.pattern.segments.find(s => s.id === 'd')?.start).toEqual(dependent.start)
  }
})

contractTest({ contract: 'ARCH-PATTERN-INTERSECTION-ENDPOINT-MAPPING' }, '回転生成instanceの交点端点をlogicalに逆変換し非対応memberをidentityへ潰さない', () => {
  const rotation = (steps: 1 | 2): SegmentInstanceRef => ({ sourceSegmentId: 'a', transform: { type: 'rotation', steps } })
  const initial: CellPattern = { ...base(), segments: [{ ...a, end: edge('BC', 1, 4) }], symmetry: { type: 'rotational' } }
  const original = createIntersectionAnchor(ref('a'), rotation(1))
  const pattern = addSegment(initial, { id: 'd', start: original, end: vertex('B') })
  expect(pattern.segments).toHaveLength(2)
  expect(expandPattern(pattern).filter(s => s.sourceId === 'd')).toHaveLength(3)
  const displayed = createIntersectionAnchor(rotation(1), rotation(2))
  expect(sourceEndpointDestination(pattern, { sourceSegmentId: 'd', transform: { type: 'rotation', steps: 1 } }, displayed)).toEqual(original)
  const result = evaluateSymmetryChange(pattern, { type: 'none' })
  expect(result.kind).toBe('changed')
  if (result.kind === 'changed') expect(result.impact.lostSourceIds).toEqual(['d'])
})

contractTest({ contract: 'SPEC-ANCHOR-INTERSECTION-ENDPOINT', regression: 72 }, '12分割の回転対称11 sourceで全pairの候補と解決点を保持し同座標pairを統合しない', () => {
  let pattern: CellPattern = { segments: [], symmetry: { type: 'rotational' }, splitRelations: [], materialExclusions: [] }
  for (let i = 1; i < 12; i++) pattern = addSegment(pattern, { id: `s${i}`, start: edge('AB', i, 12), end: edge('CA', i, 12) })
  expect(pattern.segments).toHaveLength(11)
  const instances = expandPattern(pattern)
  const expected = new Map<string, { x: number; y: number }>()
  for (let i = 0; i < instances.length; i++) for (let j = i + 1; j < instances.length; j++) {
    const hit = intersectSegments(instances[i], instances[j])
    if (hit.kind === 'cross' || hit.kind === 'touch') expected.set(intersectionAnchorKey(createIntersectionAnchor(instances[i].instanceRef, instances[j].instanceRef)), hit.point)
  }
  const query = createEndpointGeometryQuery(pattern)
  expect(new Set(query.candidates.map(intersectionAnchorKey))).toEqual(new Set(expected.keys()))
  const positions = query.candidates.map(anchor => {
    const point = query.resolve(anchor)!
    expect(query.selectable(anchor)).toBe(true)
    expect(pointsAreClose(point, expected.get(intersectionAnchorKey(anchor))!)).toBe(true)
    return point
  })
  expect(positions.some((point, i) => positions.some((other, j) => i !== j && pointsAreClose(point, other)))).toBe(true)
})
