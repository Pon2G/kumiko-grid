import { describe, expect } from 'vitest'
import { contractTest } from '../test/contractTest'
import type { Segment } from './segment'
import type { CellPattern } from './cellPattern'
import {
  addSplitRelation,
  derivePatternGeometry,
  expandSplitRelationOrbit,
  getSplitCandidates,
  removeSegment,
  removeSplitRelation,
} from './splitting'

const target: Segment = {
  id: 'A',
  start: { kind: 'vertex', vertex: 'A' },
  end: { kind: 'edge-division', edge: 'BC', divisions: 2, index: 1 },
}
const cutter: Segment = {
  id: 'B',
  start: { kind: 'vertex', vertex: 'B' },
  end: { kind: 'edge-division', edge: 'CA', divisions: 2, index: 1 },
}
const anotherCutter: Segment = {
  id: 'C',
  start: { kind: 'vertex', vertex: 'C' },
  end: { kind: 'edge-division', edge: 'AB', divisions: 2, index: 1 },
}
const pattern = (splitRelations: CellPattern['splitRelations'], symmetry: CellPattern['symmetry'] = { type: 'none' }): CellPattern => ({
  segments: [target, cutter], symmetry, splitRelations, materialExclusions: [],
})

describe('CellPatternのsplit派生', () => {
  contractTest({ contract: 'SPEC-PATTERN-SEGMENT-SPLIT' }, 'AからBへのrelationではAだけを分割し、逆向きrelationでBも分割する', () => {
    const oneWay = derivePatternGeometry(pattern([{ targetSegmentId: 'A', cutterSegmentId: 'B', relativeTransform: { type: 'identity' } }]))
    expect(oneWay.filter(({ sourceId }) => sourceId === 'A')).toHaveLength(2)
    expect(oneWay.filter(({ sourceId }) => sourceId === 'B')).toHaveLength(1)

    const bothWays = derivePatternGeometry(pattern([
      { targetSegmentId: 'A', cutterSegmentId: 'B', relativeTransform: { type: 'identity' } },
      { targetSegmentId: 'B', cutterSegmentId: 'A', relativeTransform: { type: 'identity' } },
    ]))
    expect(bothWays.filter(({ sourceId }) => sourceId === 'A')).toHaveLength(2)
    expect(bothWays.filter(({ sourceId }) => sourceId === 'B')).toHaveLength(2)
  })

  contractTest({ contract: 'ARCH-PATTERN-SPLIT-DERIVATION' }, 'AからAへのrelationで異なるSymmetry instance同士を分割する', () => {
    const original = [target]
    const rotational: CellPattern = {
      segments: original,
      materialExclusions: [],
      symmetry: { type: 'rotational' },
      splitRelations: [{ targetSegmentId: 'A', cutterSegmentId: 'A', relativeTransform: { type: 'rotation', steps: 1 } }],
    }
    expect(derivePatternGeometry(rotational)).toHaveLength(6)
    expect(rotational.segments).toBe(original)
    expect(rotational.segments).toEqual([target])
  })

  contractTest({ contract: 'ARCH-PATTERN-SPLIT-DERIVATION' }, 'rotation +1 relationを3つのconcrete pairへ展開してtargetを対称に分割する', () => {
    const crossTransformTarget: Segment = {
      id: 'orbit-target',
      start: { kind: 'vertex', vertex: 'A' },
      end: { kind: 'edge-division', edge: 'BC', divisions: 5, index: 1 },
    }
    const crossTransformCutter: Segment = {
      id: 'orbit-cutter',
      start: { kind: 'edge-division', edge: 'AB', divisions: 5, index: 1 },
      end: { kind: 'edge-division', edge: 'BC', divisions: 5, index: 1 },
    }
    const current: CellPattern = {
      segments: [crossTransformTarget, crossTransformCutter],
      materialExclusions: [],
      symmetry: { type: 'rotational' },
      splitRelations: [{
        targetSegmentId: crossTransformTarget.id,
        cutterSegmentId: crossTransformCutter.id,
        relativeTransform: { type: 'rotation', steps: 1 },
      }],
    }

    const relation = current.splitRelations[0]
    const orbit = expandSplitRelationOrbit(current.symmetry, relation)
    const pairTransforms = new Set(orbit?.map(({ target: orbitTarget, cutter: orbitCutter }) =>
      JSON.stringify([orbitTarget.transform, orbitCutter.transform])))

    expect(pairTransforms).toEqual(new Set([
      JSON.stringify([{ type: 'identity' }, { type: 'rotation', steps: 1 }]),
      JSON.stringify([{ type: 'rotation', steps: 1 }, { type: 'rotation', steps: 2 }]),
      JSON.stringify([{ type: 'rotation', steps: 2 }, { type: 'identity' }]),
    ]))
    expect(derivePatternGeometry(current).filter(({ sourceId }) => sourceId === crossTransformTarget.id)).toHaveLength(6)
  })

  contractTest({ contract: 'ARCH-PATTERN-SPLIT-DERIVATION' }, '同一点に複数のcutterが交差してもゼロ長Fragmentを生成しない', () => {
    const current: CellPattern = {
      segments: [target, cutter, anotherCutter],
      materialExclusions: [],
      symmetry: { type: 'none' },
      splitRelations: [
        { targetSegmentId: 'A', cutterSegmentId: 'B', relativeTransform: { type: 'identity' } },
        { targetSegmentId: 'A', cutterSegmentId: 'C', relativeTransform: { type: 'identity' } },
      ],
    }
    expect(derivePatternGeometry(current).filter(({ sourceId }) => sourceId === 'A')).toHaveLength(2)
  })

  contractTest({ contract: 'SPEC-PATTERN-SEGMENT-SPLIT' }, '同一点の複数cutterをsource pairごとの候補として導出する', () => {
    const current: CellPattern = {
      segments: [target, cutter, anotherCutter],
      materialExclusions: [],
      symmetry: { type: 'none' },
      splitRelations: [],
    }
    const candidates = getSplitCandidates(current, 'A')
    const byCutterId = new Map(candidates.map((candidate) => [candidate.cutterSegmentId, candidate]))
    const candidateB = byCutterId.get('B')
    const candidateC = byCutterId.get('C')

    expect(byCutterId.size).toBe(2)
    expect(candidateB).toBeDefined()
    expect(candidateC).toBeDefined()
    expect(candidateB?.points).toHaveLength(1)
    expect(candidateC?.points).toHaveLength(1)
    expect(candidateB?.points[0]).toEqual(candidateC?.points[0])
  })

  contractTest({ contract: 'SPEC-PATTERN-SEGMENT-SPLIT' }, '同じcanonical SplitRelationを重複追加しない', () => {
    const initial = pattern([{ targetSegmentId: 'A', cutterSegmentId: 'B', relativeTransform: { type: 'identity' } }])
    expect(addSplitRelation(initial, { targetSegmentId: 'A', cutterSegmentId: 'B', relativeTransform: { type: 'identity' } }).splitRelations).toHaveLength(1)
  })

  contractTest({ contract: 'SPEC-PATTERN-SEGMENT-SPLIT' }, '候補由来の付加情報をrelationへ保存しない', () => {
    const candidate = {
      targetSegmentId: 'A',
      cutterSegmentId: 'B',
      relativeTransform: { type: 'identity' } as const,
      points: [{ x: 0.5, y: 0.5 }],
      active: false,
    }
    expect(addSplitRelation(pattern([]), candidate).splitRelations).toEqual([
      { targetSegmentId: 'A', cutterSegmentId: 'B', relativeTransform: { type: 'identity' } },
    ])
  })

  contractTest({ contract: 'SPEC-PATTERN-SEGMENT-SPLIT' }, 'Segment削除時にtargetまたはcutterとして参照するrelationも削除する', () => {
    const current = pattern([
      { targetSegmentId: 'A', cutterSegmentId: 'B', relativeTransform: { type: 'identity' } },
      { targetSegmentId: 'B', cutterSegmentId: 'A', relativeTransform: { type: 'identity' } },
    ])
    expect(removeSegment(current, 'B')).toEqual({
      materialExclusions: [],
      segments: [target], symmetry: { type: 'none' }, splitRelations: [],
    })
  })
})
