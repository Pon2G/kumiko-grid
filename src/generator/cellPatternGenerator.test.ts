import { expect } from 'vitest'
import { contractTest } from '../test/contractTest'
import { generateCellPattern, generateCellPatternFromText, type CellPatternGenerationRecipe, type GenerationResult } from './cellPatternGenerator'
import { expandPattern } from '../pattern/sourceGeometry'
import { intersectSegments, pointsAreClose } from '../geometry/intersections'

const value = (result: GenerationResult) => {
  if (result.kind !== 'generated') throw new Error(result.reason)
  return result.value
}
const recipe = (seed: string): CellPatternGenerationRecipe => ({ id: 'structured-lines', algorithmVersion: 1, seed })
const e = (edge: string, divisions: number, index: number) => ({ kind: 'edge-division', edge, divisions, index })
const a = { kind: 'vertex', vertex: 'A' }
const c = (n: number, j: number) => [e('AB', n, j), e('CA', n, n - j)]

contractTest({ contract: 'SPEC-GENERATOR-TEXT-INPUT' }, '正規化・空白・UTF-16上限・孤立surrogateをAPIで扱う', () => {
  for (const text of ['', ' \t\r\n', 'x'.repeat(1025), '\ud800', '\udc00', 'a\ud800b']) expect(generateCellPatternFromText(text).kind).toBe('rejected')
  for (const text of ['x'.repeat(1024), '😀'.repeat(512), 'e\u0301'.repeat(1024)]) expect(generateCellPatternFromText(text).kind).toBe('generated')
  expect(generateCellPatternFromText('e\u0301')).toEqual(generateCellPatternFromText('é'))
  expect(generateCellPatternFromText('a\r\nb\rc')).toEqual(generateCellPatternFromText('a\nb\nc'))
  const seeds = ['a', ' a', 'a ', 'a\n'].map(text => value(generateCellPatternFromText(text)).generator.seed)
  expect(new Set(seeds).size).toBe(4)
})
contractTest({ contract: 'SPEC-GENERATOR-REPRODUCIBILITY' }, '文字列と返却recipeから同じ論理Patternと編集初期値を再現する', () => {
  for (const text of ['組子', 'a', 'sample-002']) {
    const first = value(generateCellPatternFromText(text))
    expect(value(generateCellPattern(first.generator))).toEqual(first)
    expect(value(generateCellPatternFromText(text))).toEqual(first)
  }
})
contractTest({ contract: 'ARCH-GENERATOR-V1-ALGORITHM' }, '独立した固定ベクトルのseedと論理source定義を維持する', () => {
  const vectors = [
    { text: '組子', seed: '81e3f063', n: 6, pairs: [c(6, 2), c(6, 3)] },
    { text: 'a', seed: 'e40c292c', n: 10, pairs: [[a, e('BC', 10, 8)]] },
    { text: 'é', seed: '1e9de8c1', n: 10, pairs: [c(10, 4), c(10, 5)] },
    { text: 'sample-000', seed: '1729425a', n: 12, pairs: [c(12, 4), c(12, 6)] },
    { text: 'sample-001', seed: '182943ed', n: 6, pairs: [[a, e('BC', 6, 2)]] },
    { text: 'sample-002', seed: '15293f34', n: 8, pairs: [[a, e('BC', 8, 4)], c(8, 3)] },
  ]
  for (const v of vectors) {
    expect(value(generateCellPatternFromText(v.text))).toEqual({
      generator: recipe(v.seed), editorDefaults: { divisions: v.n },
      cellPattern: { symmetry: { type: 'rotational' }, splitRelations: [], materialExclusions: [], segments: v.pairs.map(([start, end], i) => ({ id: `structured-lines-v1-${i + 1}`, start, end })) },
    })
  }
  // 0 seedもmetadataは0のまま、内部状態だけ指定値へ写す。
  const zero = value(generateCellPattern(recipe('00000000')))
  expect(zero.generator.seed).toBe('00000000')
  expect(zero.cellPattern).toEqual(value(generateCellPattern(recipe('6d2b79f5'))).cellPattern)
})
contractTest({ contract: 'ARCH-GENERATOR-OUTPUT' }, '未対応recipeを拒否し入力や別生成結果とmutableな値を共有しない', () => {
  for (const input of [null, {}, { ...recipe('12345678'), id: 'other' }, { ...recipe('12345678'), algorithmVersion: 2 }, ...['ABCDEF01', '123', ' 12345678', 'gggggggg', 12345678].map(seed => ({ ...recipe('12345678'), seed }))]) {
    expect(generateCellPattern(input as CellPatternGenerationRecipe).kind).toBe('rejected')
  }
  const input = Object.freeze(recipe('81e3f063'))
  const first = value(generateCellPattern(input))
  const second = value(generateCellPattern(input))
  first.cellPattern.segments[0].start = a as typeof first.cellPattern.segments[0]['start']
  first.cellPattern.segments.pop()
  first.generator.seed = '00000000'
  first.editorDefaults.divisions = 2
  expect(value(generateCellPattern(input))).toEqual(second)
  expect(input.seed).toBe('81e3f063')
})

contractTest({ contract: 'SPEC-PATTERN-SEGMENT-OVERLAP' }, '全48パラメーター組合せの生成が非退化で重複やoverlapなく有限に成功する', () => {
  // seed候補の探索はテストだけ。期待するパラメーター集合はv1の有限空間から独立に列挙する。
  const remaining = new Set<string>()
  for (let form = 0; form < 3; form++) for (const n of [6, 8, 10, 12]) for (let k = Math.ceil(n / 5); k <= Math.floor(2 * n / 5); k++) for (let direction = 0; direction < 2; direction++) remaining.add(`${form}/${n}/${k}/${direction}`)
  expect(remaining.size).toBe(48)
  for (let seed = 1; seed < 10000 && remaining.size; seed++) {
    let x = seed
    const draw = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return x >>>= 0 }
    const form = draw() % 3, n = [6, 8, 10, 12][draw() % 4], lo = Math.ceil(n / 5)
    const k = lo + draw() % (Math.floor(2 * n / 5) - lo + 1), direction = draw() % 2
    if (!remaining.delete(`${form}/${n}/${k}/${direction}`)) continue
    const pattern = value(generateCellPattern(recipe(seed.toString(16).padStart(8, '0')))).cellPattern
    expect(pattern.segments).toHaveLength(form === 2 ? 1 : 2)
    const instances = expandPattern(pattern)
    expect(instances).toHaveLength(form === 2 ? 3 : 6)
    for (const [i, segment] of instances.entries()) {
      expect(pointsAreClose(segment.start, segment.end)).toBe(false)
      for (const other of instances.slice(i + 1)) expect(intersectSegments(segment, other).kind).not.toBe('overlap')
    }
  }
  expect([...remaining]).toEqual([])
})
