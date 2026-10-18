import type { BoundaryAnchor } from '../pattern/anchor'
import type { CellPattern } from '../pattern/cellPattern'
import { evaluateAddSegment } from '../pattern/patternOperations'

export interface CellPatternGenerationRecipe {
  id: 'structured-lines'
  algorithmVersion: 1
  seed: string
}
export interface GeneratedCellPattern {
  cellPattern: CellPattern
  generator: CellPatternGenerationRecipe
  editorDefaults: { divisions: number }
}
export type GenerationResult =
  | { kind: 'generated'; value: GeneratedCellPattern }
  | { kind: 'rejected'; reason: string }

const reject = (reason: string): GenerationResult => ({ kind: 'rejected', reason })

export function generateCellPatternFromText(text: string): GenerationResult {
  const normalized = text.replace(/\r\n?/g, '\n').normalize('NFC')
  if (!normalized.trim()) return reject('文字を入力してください')
  if (normalized.length > 1024) return reject('入力は1,024文字以内にしてください')
  // for-ofは正しいsurrogate pairを一つのcode pointとして扱う。
  for (const character of normalized) {
    const code = character.codePointAt(0)!
    if (code >= 0xd800 && code <= 0xdfff) return reject('入力に扱えない文字が含まれています')
  }
  let hash = 2166136261
  for (const byte of new TextEncoder().encode(normalized)) hash = Math.imul(hash ^ byte, 16777619) >>> 0
  return generateCellPattern({ id: 'structured-lines', algorithmVersion: 1, seed: hash.toString(16).padStart(8, '0') })
}

/** 未対応版を最新へ読み替えず、再現条件の境界で拒否する。 */
export function generateCellPattern(recipe: CellPatternGenerationRecipe): GenerationResult {
  if (!recipe || recipe.id !== 'structured-lines' || recipe.algorithmVersion !== 1) return reject('対応していない生成方式またはバージョンです')
  if (typeof recipe.seed !== 'string' || !/^[0-9a-f]{8}$/.test(recipe.seed)) return reject('生成seedが無効です')
  return structuredLinesV1(recipe.seed)
}

function structuredLinesV1(seed: string): GenerationResult {
  let state = Number.parseInt(seed, 16) || 0x6d2b79f5
  const draw = () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state
  }
  // 消費順もv1の再現契約。向きを使わない構成でも4回消費する。
  const [r0, r1, r2, r3] = [draw(), draw(), draw(), draw()]
  const form = r0 % 3
  const n = [6, 8, 10, 12][r1 % 4]
  const lo = Math.ceil(n / 5)
  const k = lo + r2 % (Math.floor(2 * n / 5) - lo + 1)
  const edge = (edge: 'AB' | 'BC' | 'CA', index: number): BoundaryAnchor => ({ kind: 'edge-division', edge, divisions: n, index })
  const contour = (j: number): [BoundaryAnchor, BoundaryAnchor] => [edge('AB', j), edge('CA', n - j)]
  const a: BoundaryAnchor = { kind: 'vertex', vertex: 'A' }
  const sources: [BoundaryAnchor, BoundaryAnchor][] = form === 0 ? [contour(k), contour(n / 2)]
    : form === 1 ? [[a, edge('BC', n / 2)], contour(k)] : [[a, edge('BC', r3 % 2 === 0 ? k : n - k)]]
  let pattern: CellPattern = { segments: [], symmetry: { type: 'rotational' }, splitRelations: [], materialExclusions: [] }
  for (const [index, [start, end]] of sources.entries()) {
    const result = evaluateAddSegment(pattern, { id: `structured-lines-v1-${index + 1}`, start, end })
    if (result.kind === 'rejected') return reject(`文様を生成できませんでした：${result.reason}`)
    pattern = result.pattern
  }
  return { kind: 'generated', value: { cellPattern: pattern, generator: { id: 'structured-lines', algorithmVersion: 1, seed }, editorDefaults: { divisions: n } } }
}
