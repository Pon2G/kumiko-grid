import { describe, expect } from 'vitest'
import { contractTest } from '../test/contractTest'
import { canonicalTriangle } from '../geometry/triangle'
import type { Point } from '../geometry/types'
import type { CellPattern } from './cellPattern'
import {
  expandPattern,
  inverseRelativeTransform,
  instanceTransformKey,
  instanceTransforms,
  isSymmetryGeneratedSegment,
  mapSegmentInstance,
  supportedRelativeTransforms,
  symmetryTransformAlgebra,
  type RenderedSegment,
} from './symmetry'

const seed = { id: 'seed', start: { kind: 'vertex' as const, vertex: 'A' as const }, end: { kind: 'vertex' as const, vertex: 'B' as const } }

const pointsAreClose = (actual: Point, expected: Point) =>
  Math.abs(actual.x - expected.x) < 1e-10 && Math.abs(actual.y - expected.y) < 1e-10

const expectSegment = (segments: RenderedSegment[], start: Point, end: Point) => {
  expect(segments.some((segment) =>
    pointsAreClose(segment.start, start) && pointsAreClose(segment.end, end),
  )).toBe(true)
}

describe('CellPatternの対称展開', () => {
  contractTest({ contract: 'SPEC-SYMMETRY-EXPANSION' }, '各Symmetryを期待する本数のSVG描画用Segmentへ展開する', () => {
    const cases: Array<[CellPattern['symmetry'], number]> = [
      [{ type: 'none' }, 1],
      [{ type: 'mirror', axis: 'A' }, 2],
      [{ type: 'rotational' }, 3],
    ]
    for (const [symmetry, count] of cases) {
      const expanded = expandPattern({ segments: [seed], symmetry, splitRelations: [], materialExclusions: [] })
      expect(expanded).toHaveLength(count)
      expect(expanded.some(({ id }) => id === seed.id)).toBe(true)
    }
  })

  contractTest({ contract: 'ARCH-PATTERN-DERIVED-SEGMENTS' }, '基本Segmentを変更せず派生Segmentと区別できる', () => {
    const pattern: CellPattern = { segments: [seed], materialExclusions: [], symmetry: { type: 'rotational' }, splitRelations: [] }
    const expanded = expandPattern(pattern)
    expect(pattern.segments).toEqual([seed])
    expect(expanded.filter(isSymmetryGeneratedSegment)).toHaveLength(2)
    expect(expanded.filter((segment) => !isSymmetryGeneratedSegment(segment))).toHaveLength(1)
  })

  contractTest({ contract: 'SPEC-SYMMETRY-MIRROR' }, 'mirror Aは基本SegmentをAからCへのSegmentへ鏡映する', () => {
    const expanded = expandPattern({ segments: [seed], materialExclusions: [], symmetry: { type: 'mirror', axis: 'A' }, splitRelations: [] })
    expectSegment(expanded.filter(isSymmetryGeneratedSegment), canonicalTriangle.A, canonicalTriangle.C)
  })

  contractTest({ contract: 'SPEC-SYMMETRY-ROTATIONAL' }, 'rotationalは基本Segmentを120°と240°回転した位置へ配置する', () => {
    const expanded = expandPattern({ segments: [seed], materialExclusions: [], symmetry: { type: 'rotational' }, splitRelations: [] })
    const derived = expanded.filter(isSymmetryGeneratedSegment)
    expectSegment(derived, canonicalTriangle.C, canonicalTriangle.A)
    expectSegment(derived, canonicalTriangle.B, canonicalTriangle.C)
  })
})

describe('Symmetry transform algebra', () => {
  contractTest({ contract: 'ARCH-PATTERN-SYMMETRY-TRANSFORM-ALGEBRA' }, '各Symmetryの有効transform集合が共通のalgebra lawを満たす', () => {
    const point = canonicalTriangle.A
    const symmetries: CellPattern['symmetry'][] = [
      { type: 'none' },
      { type: 'mirror', axis: 'B' },
      { type: 'rotational' },
    ]
    for (const symmetry of symmetries) {
      const algebra = symmetryTransformAlgebra(symmetry)
      expect(algebra.isValid(algebra.identity)).toBe(true)
      for (const transform of algebra.transforms) {
        const inverse = algebra.inverse(transform)
        expect(inverse).not.toBeNull()
        expect(algebra.isValid(inverse!)).toBe(true)
        expect(algebra.key(algebra.compose(transform, inverse!)!)).toBe(algebra.key(algebra.identity))

        const relative = algebra.toRelative(transform)
        expect(relative).not.toBeNull()
        expect(algebra.key(algebra.fromRelative(relative!)!)).toBe(algebra.key(transform))
        expect(inverseRelativeTransform(symmetry, relative!))
          .toEqual(algebra.toRelative(inverse!))

        for (const second of algebra.transforms) {
          const composed = algebra.compose(transform, second)
          expect(composed).not.toBeNull()
          expect(algebra.isValid(composed!)).toBe(true)
          const composedPoint = algebra.applyToPoint(composed!, point)!
          const sequentialPoint = algebra.applyToPoint(second, algebra.applyToPoint(transform, point)!)!
          expect(pointsAreClose(composedPoint, sequentialPoint)).toBe(true)
        }
      }
    }
  })

  contractTest({ contract: 'ARCH-PATTERN-SYMMETRY-TRANSFORM-ALGEBRA' }, '現在のSymmetryで無効なabsolute・relative transformを受理しない', () => {
    const algebra = symmetryTransformAlgebra({ type: 'mirror', axis: 'B' })
    expect(algebra.isValid({ type: 'mirror', axis: 'A' })).toBe(false)
    expect(algebra.compose(algebra.identity, { type: 'mirror', axis: 'A' })).toBeNull()
    expect(algebra.fromRelative({ type: 'rotation', steps: 1 })).toBeNull()
  })

  contractTest({ contract: 'ARCH-PATTERN-SYMMETRY-TRANSFORM-ALGEBRA' }, '返却値への変更操作が他のinstanceや後続の計算を破壊しない', () => {
    const symmetry = { type: 'rotational' } as const
    const algebra = symmetryTransformAlgebra(symmetry)
    const listed = instanceTransforms(symmetry)
    const firstExpansion = expandPattern({ segments: [seed], symmetry, splitRelations: [], materialExclusions: [] })
    const rotation1 = algebra.transforms.find((transform) => instanceTransformKey(transform) === 'rotation:1')!
    const identityInstance = firstExpansion.find(({ instanceRef }) => instanceTransformKey(instanceRef.transform) === 'identity')!
    const composed = algebra.compose(algebra.identity, rotation1)!
    const inverse = algebra.inverse({ type: 'rotation', steps: 2 })!
    const restored = algebra.fromRelative({ type: 'rotation', steps: 1 })!
    const mapped = mapSegmentInstance(symmetry, {
      fromSourceSegmentId: 'old', toSourceSegmentId: 'new', toTransform: algebra.identity, direction: 'preserve',
    }, { sourceSegmentId: 'old', transform: rotation1 })!
    const relative = algebra.toRelative(rotation1)!
    const relatives = supportedRelativeTransforms(symmetry)

    Reflect.set(algebra.identity, 'type', 'rotation')
    Reflect.set(rotation1, 'steps', 2)
    Reflect.set(composed, 'steps', 2)
    Reflect.set(inverse, 'steps', 2)
    Reflect.set(restored, 'steps', 2)
    Reflect.set(mapped.transform, 'steps', 2)
    Reflect.set(relative, 'steps', 2)
    Reflect.set(relatives, 0, { type: 'rotation', steps: 2 })
    Reflect.set(listed, 0, { type: 'rotation', steps: 2 })
    Reflect.set(algebra, 'compose', () => null)
    Reflect.set(identityInstance.instanceRef.transform, 'type', 'rotation')

    expect(instanceTransformKey(algebra.identity)).toBe('identity')
    expect(algebra.compose({ type: 'rotation', steps: 1 }, { type: 'rotation', steps: 1 }))
      .toEqual({ type: 'rotation', steps: 2 })
    const expectedKeys = new Set(['identity', 'rotation:1', 'rotation:2'])
    expect(new Set(instanceTransforms(symmetry).map(instanceTransformKey))).toEqual(expectedKeys)
    expect(relatives).toContainEqual({ type: 'rotation', steps: 1 })
    expect(supportedRelativeTransforms(symmetry)).toContainEqual({ type: 'rotation', steps: 1 })
    expect(new Set(firstExpansion.map(({ instanceRef }) => instanceTransformKey(instanceRef.transform)))).toEqual(expectedKeys)
    expect(new Set(expandPattern({ segments: [seed], symmetry, splitRelations: [], materialExclusions: [] })
      .map(({ instanceRef }) => instanceTransformKey(instanceRef.transform)))).toEqual(expectedKeys)
  })

  contractTest({ contract: 'ARCH-PATTERN-SEGMENT-INSTANCE-MAPPING' }, 'basis mappingを任意instanceへ同じalgebraの合成順で適用する', () => {
    const mapped = mapSegmentInstance({ type: 'rotational' }, {
      fromSourceSegmentId: 'old',
      toSourceSegmentId: 'canonical',
      toTransform: { type: 'rotation', steps: 1 },
      direction: 'reverse',
    }, {
      sourceSegmentId: 'old',
      transform: { type: 'rotation', steps: 2 },
    })

    expect(mapped).toEqual({ sourceSegmentId: 'canonical', transform: { type: 'identity' } })
  })
})
