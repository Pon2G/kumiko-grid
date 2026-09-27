import { describe, expect } from 'vitest'
import { contractTest } from '../test/contractTest'
import type { Segment } from '../geometry/segment'
import type { CellPattern } from './cellPattern'
import { addSplitRelation, derivePatternGeometry, removeSegment } from './splitting'

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
  segments: [target, cutter], symmetry, splitRelations,
})

describe('CellPatternのsplit派生', () => {
  contractTest({ contract: 'SPEC-PATTERN-SEGMENT-SPLIT' }, 'AからBへのrelationではAだけを分割し、逆向きrelationでBも分割する', () => {
    const oneWay = derivePatternGeometry(pattern([{ targetSegmentId: 'A', cutterSegmentId: 'B' }]))
    expect(oneWay.filter(({ sourceId }) => sourceId === 'A')).toHaveLength(2)
    expect(oneWay.filter(({ sourceId }) => sourceId === 'B')).toHaveLength(1)

    const bothWays = derivePatternGeometry(pattern([
      { targetSegmentId: 'A', cutterSegmentId: 'B' },
      { targetSegmentId: 'B', cutterSegmentId: 'A' },
    ]))
    expect(bothWays.filter(({ sourceId }) => sourceId === 'A')).toHaveLength(2)
    expect(bothWays.filter(({ sourceId }) => sourceId === 'B')).toHaveLength(2)
  })

  contractTest({ contract: 'ARCH-PATTERN-SPLIT-DERIVATION' }, '基本Segmentを変更せずSymmetry展開後の同一source instance間にもrelationを適用する', () => {
    const original = [target]
    const rotational: CellPattern = {
      segments: original,
      symmetry: { type: 'rotational' },
      splitRelations: [{ targetSegmentId: 'A', cutterSegmentId: 'A' }],
    }
    expect(derivePatternGeometry(rotational)).toHaveLength(6)
    expect(rotational.segments).toBe(original)
    expect(rotational.segments).toEqual([target])
  })

  contractTest({ contract: 'ARCH-PATTERN-SPLIT-DERIVATION' }, '同一点に複数のcutterが交差してもゼロ長Fragmentを生成しない', () => {
    const current: CellPattern = {
      segments: [target, cutter, anotherCutter],
      symmetry: { type: 'none' },
      splitRelations: [
        { targetSegmentId: 'A', cutterSegmentId: 'B' },
        { targetSegmentId: 'A', cutterSegmentId: 'C' },
      ],
    }
    expect(derivePatternGeometry(current).filter(({ sourceId }) => sourceId === 'A')).toHaveLength(2)
  })

  contractTest({ contract: 'SPEC-PATTERN-SEGMENT-SPLIT' }, '同じordered pairを重複追加しない', () => {
    const initial = pattern([{ targetSegmentId: 'A', cutterSegmentId: 'B' }])
    expect(addSplitRelation(initial, { targetSegmentId: 'A', cutterSegmentId: 'B' }).splitRelations).toHaveLength(1)
  })

  contractTest({ contract: 'SPEC-PATTERN-SEGMENT-SPLIT' }, 'Segment削除時にtargetまたはcutterとして参照するrelationも削除する', () => {
    const current = pattern([
      { targetSegmentId: 'A', cutterSegmentId: 'B' },
      { targetSegmentId: 'B', cutterSegmentId: 'A' },
    ])
    expect(removeSegment(current, 'B')).toEqual({
      segments: [target], symmetry: { type: 'none' }, splitRelations: [],
    })
  })
})
