// @vitest-environment jsdom
import { useEffect, useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, vi } from 'vitest'
import { contractTest } from '../../test/contractTest'
import type { SegmentEndpointAnchor } from '../../pattern/anchor'
import type { CellPattern } from '../../pattern/cellPattern'
import { deriveLogicalFragments } from '../../pattern/designGeometry'
import { excludeMaterial, restoreMaterial } from '../../pattern/materialExclusion'
import { addSplitRelation, removeSegment, removeSplitRelation } from '../../pattern/patternOperations'
import type { Segment } from '../../pattern/segment'
import { CellEditor } from './CellEditor'
import { reconcileEditorSelection, type EditorSelection } from './editorSelection'

const target: Segment = { id: 'A', start: { kind: 'vertex', vertex: 'A' }, end: { kind: 'edge-division', edge: 'BC', divisions: 2, index: 1 } }
const cutter: Segment = { id: 'B', start: { kind: 'vertex', vertex: 'B' }, end: { kind: 'edge-division', edge: 'CA', divisions: 2, index: 1 } }
const colocatedCutter: Segment = { id: 'C', start: { kind: 'vertex', vertex: 'C' }, end: { kind: 'edge-division', edge: 'AB', divisions: 2, index: 1 } }
const relation = { targetSegmentId: 'A', cutterSegmentId: 'B', relativeTransform: { type: 'identity' } } as const
const basePattern = (): CellPattern => ({ segments: [target, cutter], symmetry: { type: 'none' }, splitRelations: [], materialExclusions: [] })

function Harness({ initial = basePattern() }: { initial?: CellPattern }) {
  const [pattern, setPattern] = useState(initial)
  const [selection, setSelection] = useState<EditorSelection>(null)
  const [pendingAnchor, setPendingAnchor] = useState<SegmentEndpointAnchor | null>(null)
  useEffect(() => {
    const next = reconcileEditorSelection(pattern, selection)
    if (next !== selection) setSelection(next)
  }, [pattern, selection])
  const anchor = (next: SegmentEndpointAnchor) => { setSelection(null); setPendingAnchor((current) => current ? null : next) }
  return <CellEditor divisions={4} pattern={pattern} pendingAnchor={pendingAnchor} selection={selection}
    onAnchorClick={anchor} onSelectionChange={setSelection}
    onDeleteSegment={(id) => setPattern((current) => removeSegment(current, id))}
    onToggleSplitRelation={(value) => setPattern((current) => current.splitRelations.length
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
    expect(screen.getByLabelText('Intersectionインスペクター').textContent).toContain('未分割')
    await user.click(screen.getByRole('button', { name: '分割を追加' }))
    expect(screen.getByLabelText('Intersectionインスペクター').textContent).toContain('分割済み')
  })

  contractTest({ contract: 'SPEC-EDITOR-INTERSECTION-SELECTION' }, '同一点のIntersection candidateを統合せずクリックの繰り返しでcutterとともに巡回する', async () => {
    const user = userEvent.setup()
    render(<Harness initial={{ ...basePattern(), segments: [target, cutter, colocatedCutter] }} />)
    await user.click(screen.getByLabelText('線分 1'))
    const marker = screen.getAllByLabelText('交点')[0]
    await user.click(marker)
    expect(screen.getByLabelText('線分 2').getAttribute('aria-current')).toBe('true')
    await user.click(marker)
    expect(screen.getByLabelText('線分 3').getAttribute('aria-current')).toBe('true')
  })

  contractTest({ contract: 'SPEC-EDITOR-FRAGMENT-MATERIAL-SELECTION' }, 'SegmentからFragmentを選択しInspectorで材なしと材ありを切り替える', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByLabelText('線分 1'))
    await user.click(screen.getByLabelText('Fragment'))
    await user.click(screen.getByRole('button', { name: '材なしにする' }))
    expect(screen.getByLabelText('Fragmentインスペクター').textContent).toContain('材なし')
    await user.click(screen.getByRole('button', { name: '材を戻す' }))
    expect(screen.getByLabelText('Fragmentインスペクター').textContent).toContain('材あり')
  })

  contractTest({ contract: 'SPEC-EDITOR-DIRECT-OBJECT-SELECTION' }, 'オブジェクト選択中もAnchorを優先し、背景とEscapeで選択解除する', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByLabelText('線分 1'))
    await user.click(screen.getByRole('button', { name: '頂点A' }))
    expect(screen.getByText('終点を選択')).toBeTruthy()
    expect(screen.getByText('Canvasからオブジェクトを選択してください')).toBeTruthy()

    await user.click(screen.getByLabelText('線分 1'))
    fireEvent.click(screen.getByLabelText('正三角形セルエディター'))
    expect(screen.getByText('Canvasからオブジェクトを選択してください')).toBeTruthy()
    await user.click(screen.getByLabelText('線分 1'))
    await user.keyboard('{Escape}')
    expect(screen.getByText('Canvasからオブジェクトを選択してください')).toBeTruthy()
  })

  contractTest({ contract: 'SPEC-EDITOR-DIRECT-OBJECT-SELECTION' }, '同じGeometryのSegment instanceをクリックの繰り返しで巡回する', async () => {
    const duplicate: Segment = { ...target, id: 'duplicate' }
    const user = userEvent.setup()
    render(<Harness initial={{ ...basePattern(), segments: [target, duplicate] }} />)
    const lines = screen.getAllByLabelText('線分 2')
    await user.click(lines[0])
    expect(screen.getByLabelText('Segmentインスペクター').textContent).toContain('Segment 1')
    await user.click(lines[0])
    expect(screen.getByLabelText('Segmentインスペクター').textContent).toContain('Segment 2')
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
    const selection: EditorSelection = { kind: 'segment', segment: { sourceSegmentId: 'A', transform: { type: 'rotation', steps: 1 } } }
    expect(reconcileEditorSelection(rotational, selection)).toBe(selection)
    expect(reconcileEditorSelection({ ...rotational, symmetry: { type: 'none' } }, selection)).toBeNull()
  })
})
