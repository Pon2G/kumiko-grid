// @vitest-environment jsdom
import { useEffect, useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, vi } from 'vitest'
import { contractTest } from '../../test/contractTest'
import type { SegmentEndpointAnchor } from '../../pattern/anchor'
import type { CellPattern } from '../../pattern/cellPattern'
import { deriveLogicalFragments, splitRelationKey } from '../../pattern/designGeometry'
import { excludeMaterial, restoreMaterial } from '../../pattern/materialExclusion'
import { addSplitRelation, removeSegment, removeSplitRelation } from '../../pattern/patternOperations'
import type { Segment } from '../../pattern/segment'
import { CellEditor } from './CellEditor'
import { editorSelection, idleEditorInteraction, pendingEditorAnchor, reconcileEditorInteraction, type CanvasHitCandidate, type EditorInteraction } from './editorInteraction'

const target: Segment = { id: 'A', start: { kind: 'vertex', vertex: 'A' }, end: { kind: 'edge-division', edge: 'BC', divisions: 2, index: 1 } }
const cutter: Segment = { id: 'B', start: { kind: 'vertex', vertex: 'B' }, end: { kind: 'edge-division', edge: 'CA', divisions: 2, index: 1 } }
const colocatedCutter: Segment = { id: 'C', start: { kind: 'vertex', vertex: 'C' }, end: { kind: 'edge-division', edge: 'AB', divisions: 2, index: 1 } }
const relation = { targetSegmentId: 'A', cutterSegmentId: 'B', relativeTransform: { type: 'identity' } } as const
const basePattern = (): CellPattern => ({ segments: [target, cutter], symmetry: { type: 'none' }, splitRelations: [], materialExclusions: [] })

function Harness({ initial = basePattern() }: { initial?: CellPattern }) {
  const [pattern, setPattern] = useState(initial)
  const [interaction, setInteraction] = useState<EditorInteraction>(idleEditorInteraction)
  useEffect(() => {
    const next = reconcileEditorInteraction(pattern, interaction)
    if (next !== interaction) setInteraction(next)
  }, [pattern, interaction])
  const anchor = (next: SegmentEndpointAnchor) => setInteraction((current) => current.kind === 'creating-segment'
    ? idleEditorInteraction() : { kind: 'creating-segment', startAnchor: next })
  const choose = (candidates: CanvasHitCandidate[]) => {
    const candidate = candidates.length === 1 ? candidates[0] : null
    if (!candidate) setInteraction({ kind: 'choosing-target', candidates })
    else if (candidate.kind === 'anchor') anchor(candidate.anchor)
    else setInteraction({ kind: 'selected', selection: candidate.kind === 'segment' ? { kind: 'segment', segment: candidate.segment }
      : candidate.kind === 'intersection' ? { kind: 'intersection', candidate: candidate.candidate }
        : { kind: 'fragment', fragment: candidate.fragment } })
  }
  return <CellEditor divisions={4} pattern={pattern} pendingAnchor={pendingEditorAnchor(interaction)} selection={editorSelection(interaction)}
    choosingCandidates={interaction.kind === 'choosing-target' ? interaction.candidates : null} onHitCandidates={choose}
    onClearInteraction={() => setInteraction(idleEditorInteraction())}
    onDeleteSegment={(id) => setPattern((current) => removeSegment(current, id))}
    onToggleSplitRelation={(value) => setPattern((current) => current.splitRelations.some((item) => splitRelationKey(item) === splitRelationKey(value))
      ? removeSplitRelation(current, value) : addSplitRelation(current, value))}
    onExcludeMaterial={(fragment) => setPattern((current) => excludeMaterial(current, fragment))}
    onRestoreMaterial={(fragment) => setPattern((current) => restoreMaterial(current, fragment))} />
}

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('Cell Editor直接操作', () => {
  contractTest({ contract: 'SPEC-EDITOR-INTERSECTION-SELECTION' }, 'SegmentからIntersectionを選択しcutterを強調してInspectorからsplitを追加する', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByLabelText('線分 1'))
    await user.click(screen.getByLabelText('交点'))

    expect(screen.getByLabelText('線分 2').getAttribute('aria-current')).toBe('true')
    expect(screen.getByLabelText('Intersectionインスペクター').textContent).toContain('target: Segment 1 / 元の位置')
    expect(screen.getByLabelText('Intersectionインスペクター').textContent).toContain('cutter: Segment 2 / 元の位置')
    expect(screen.getByLabelText('Intersectionインスペクター').textContent).toContain('未分割')
    await user.click(screen.getByRole('button', { name: '分割を追加' }))
    expect(screen.getByLabelText('Intersectionインスペクター').textContent).toContain('分割済み')
  })

  contractTest({ contract: 'ARCH-EDITOR-HIT-TEST-PRIORITY', regression: 31 }, 'Anchorと同一点のIntersectionをInspectorで選び分ける', async () => {
    const edgeTarget: Segment = { id: 'edge', start: { kind: 'vertex', vertex: 'A' }, end: { kind: 'vertex', vertex: 'B' } }
    const touching: Segment = { id: 'touch', start: { kind: 'vertex', vertex: 'C' }, end: { kind: 'edge-division', edge: 'AB', divisions: 2, index: 1 } }
    const user = userEvent.setup()
    render(<Harness initial={{ ...basePattern(), segments: [edgeTarget, touching] }} />)
    await user.click(screen.getByLabelText('線分 1'))
    await user.click(screen.getByRole('button', { name: 'AB辺を4等分した2番目の点' }))
    expect(screen.getByLabelText('選択対象インスペクター')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Intersection:/ }))
    expect(screen.getByLabelText('Intersectionインスペクター')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'AB辺を4等分した2番目の点' }))
    await user.click(screen.getByRole('button', { name: /Anchor:/ }))
    expect(screen.getByText('終点を選択')).toBeTruthy()
  })

  contractTest({ contract: 'SPEC-EDITOR-INTERSECTION-SELECTION' }, '同一点のIntersection candidateをInspectorで個別に選択する', async () => {
    const user = userEvent.setup()
    render(<Harness initial={{ ...basePattern(), segments: [target, cutter, colocatedCutter] }} />)
    await user.click(screen.getByLabelText('線分 1'))
    await user.click(screen.getAllByLabelText('交点')[0])
    await user.click(screen.getByRole('button', { name: 'Intersection: Segment 2 / 元の位置' }))
    expect(screen.getByLabelText('線分 2').getAttribute('aria-current')).toBe('true')
    await user.click(screen.getAllByLabelText('交点')[0])
    await user.click(screen.getByRole('button', { name: 'Intersection: Segment 3 / 元の位置' }))
    expect(screen.getByLabelText('線分 3').getAttribute('aria-current')).toBe('true')
  })

  contractTest({ contract: 'SPEC-EDITOR-FRAGMENT-MATERIAL-SELECTION' }, 'SegmentからFragmentを選択しInspectorで材なしと材ありを切り替える', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByLabelText('線分 1'))
    await user.click(screen.getByLabelText('Fragment'))
    await user.click(screen.getByRole('button', { name: '材なしにする' }))
    const inspector = screen.getByLabelText('Fragmentインスペクター')
    expect(inspector.textContent).toContain('境界1: 始点')
    expect(inspector.textContent).toContain('境界2: 終点')
    expect(inspector.textContent).toContain('材なし')
    await user.click(screen.getByRole('button', { name: '材を戻す' }))
    expect(screen.getByLabelText('Fragmentインスペクター').textContent).toContain('材あり')
  })

  contractTest({ contract: 'SPEC-EDITOR-DIRECT-OBJECT-SELECTION' }, 'Anchor選択後にオブジェクトを選ぶと作成途中を解除し、背景とEscapeは双方の状態を解除する', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByLabelText('線分 1'))
    await user.click(screen.getByRole('button', { name: '頂点A' }))
    expect(screen.getByText('終点を選択')).toBeTruthy()
    expect(screen.getByText('Canvasからオブジェクトを選択してください')).toBeTruthy()

    await user.click(screen.getByLabelText('線分 1'))
    expect(screen.queryByText('終点を選択')).toBeNull()
    expect(screen.getByLabelText('Segmentインスペクター')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '頂点A' }))
    fireEvent.click(screen.getByLabelText('正三角形セルエディター'))
    expect(screen.queryByText('終点を選択')).toBeNull()
    expect(screen.getByText('Canvasからオブジェクトを選択してください')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '頂点A' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByText('終点を選択')).toBeNull()
    expect(screen.getByText('Canvasからオブジェクトを選択してください')).toBeTruthy()
  })

  contractTest({ contract: 'SPEC-EDITOR-DIRECT-OBJECT-SELECTION' }, '完全重複Segment instanceをInspectorで個別に選択しFragment操作を妨げない', async () => {
    const duplicate: Segment = { ...target, id: 'duplicate' }
    const user = userEvent.setup()
    render(<Harness initial={{ ...basePattern(), segments: [target, duplicate] }} />)
    const lines = screen.getAllByLabelText('線分 2')
    await user.click(lines[0])
    await user.click(screen.getByRole('button', { name: 'Segment 1 / 元の位置' }))
    expect(screen.getByLabelText('Segmentインスペクター').textContent).toContain('Segment 1')
    await user.click(screen.getByLabelText('Fragment'))
    expect(screen.getByLabelText('Fragmentインスペクター')).toBeTruthy()
    await user.click(lines[0])
    await user.click(screen.getByRole('button', { name: 'Segment 2 / 元の位置' }))
    expect(screen.getByLabelText('Segmentインスペクター').textContent).toContain('Segment 2')
  })

  contractTest({ contract: 'ARCH-EDITOR-SELECTION-STATE', regression: 31 }, '背景とEscapeで曖昧候補状態を解除する', async () => {
    const duplicate: Segment = { ...target, id: 'duplicate' }
    const user = userEvent.setup()
    render(<Harness initial={{ ...basePattern(), segments: [target, duplicate] }} />)
    await user.click(screen.getAllByLabelText('線分 2')[0])
    expect(screen.getByLabelText('選択対象インスペクター')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('正三角形セルエディター'))
    expect(screen.queryByLabelText('選択対象インスペクター')).toBeNull()
    await user.click(screen.getAllByLabelText('線分 2')[0])
    await user.keyboard('{Escape}')
    expect(screen.queryByLabelText('選択対象インスペクター')).toBeNull()
  })

  contractTest({ contract: 'SPEC-EDITOR-SELECTION-INSPECTOR', regression: 31 }, '依存exclusionがあるsplit解除だけ確認し、拒否時は状態を維持する', async () => {
    const split: CellPattern = { ...basePattern(), splitRelations: [relation] }
    const initial = excludeMaterial(split, deriveLogicalFragments(split)
      .find(({ segmentInstanceRef, boundaryA, boundaryB }) => segmentInstanceRef.sourceSegmentId === 'A'
        && (boundaryA.kind === 'intersection' || boundaryB.kind === 'intersection'))!)
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    render(<Harness initial={initial} />)
    await user.click(screen.getByLabelText('線分 1'))
    await user.click(screen.getByLabelText('交点'))
    expect(screen.getByLabelText('Intersectionインスペクター').textContent).toContain('解除すると依存する材なし区間1件も解除されます')
    await user.click(screen.getByRole('button', { name: '分割を解除' }))
    expect(confirm).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Intersectionインスペクター').textContent).toContain('分割済み')
    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: '分割を解除' }))
    expect(screen.getByLabelText('Intersectionインスペクター').textContent).toContain('未分割')
  })

  contractTest({ contract: 'SPEC-EDITOR-SELECTION-INSPECTOR' }, '依存exclusionがないsplit解除では確認を要求しない', async () => {
    const confirm = vi.spyOn(globalThis, 'confirm')
    const user = userEvent.setup()
    render(<Harness initial={{ ...basePattern(), splitRelations: [relation] }} />)
    await user.click(screen.getByLabelText('線分 1'))
    await user.click(screen.getByLabelText('交点'))
    await user.click(screen.getByRole('button', { name: '分割を解除' }))
    expect(confirm).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Intersectionインスペクター').textContent).toContain('未分割')
  })

  contractTest({ contract: 'ARCH-EDITOR-SELECTION-STATE', regression: 31 }, '選択したSegmentをInspectorから削除すると消滅したselectionも解除する', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByLabelText('線分 1'))
    await user.click(screen.getByRole('button', { name: 'Segmentを削除' }))
    expect(screen.getByText('Canvasからオブジェクトを選択してください')).toBeTruthy()
    expect(screen.queryByLabelText('Segmentインスペクター')).toBeNull()
  })

  contractTest({ contract: 'ARCH-EDITOR-SELECTION-STATE', regression: 31 }, 'Symmetry変更で消滅したgenerated instanceをGeometry一致するidentityへ付け替えない', () => {
    const rotational: CellPattern = { ...basePattern(), symmetry: { type: 'rotational' } }
    const interaction: EditorInteraction = { kind: 'selected', selection: { kind: 'segment', segment: { sourceSegmentId: 'A', transform: { type: 'rotation', steps: 1 } } } }
    expect(reconcileEditorInteraction(rotational, interaction)).toBe(interaction)
    expect(reconcileEditorInteraction({ ...rotational, symmetry: { type: 'none' } }, interaction).kind).toBe('idle')
  })

  contractTest({ contract: 'ARCH-EDITOR-SELECTION-STATE', regression: 31 }, '曖昧候補のidentityが消滅しても残った候補を自動選択しない', () => {
    const rotational: CellPattern = { ...basePattern(), symmetry: { type: 'rotational' } }
    const interaction: EditorInteraction = { kind: 'choosing-target', candidates: [
      { kind: 'segment', segment: { sourceSegmentId: 'A', transform: { type: 'identity' } } },
      { kind: 'segment', segment: { sourceSegmentId: 'A', transform: { type: 'rotation', steps: 1 } } },
    ] }
    const reconciled = reconcileEditorInteraction({ ...rotational, symmetry: { type: 'none' } }, interaction)
    expect(reconciled.kind).toBe('choosing-target')
    if (reconciled.kind === 'choosing-target') expect(reconciled.candidates).toEqual([interaction.candidates[0]])
  })
})
