import { useEffect, useState } from 'react'
import { segmentEndpointAnchorKey } from '../pattern/anchor'
import type { SegmentEndpointAnchor } from '../pattern/anchor'
import type { Segment } from '../pattern/segment'
import type { CellPattern, SplitRelation } from '../pattern/cellPattern'
import { addSplitRelation, changeSymmetry, removeSegment, removeSplitRelation, splitRelationKey } from '../pattern/splitting'
import { excludeMaterial, restoreMaterial } from '../pattern/materialExclusion'
import { CellEditor } from '../components/CellEditor/CellEditor'
import {
  editorSelection,
  idleEditorInteraction,
  pendingEditorAnchor,
  reconcileEditorInteraction,
  type EditorInteraction,
} from '../components/CellEditor/editorInteraction'
import { PatternPreview } from '../components/PatternPreview/PatternPreview'
import { Settings } from '../components/Settings/Settings'

export default function App() {
  const [divisions, setDivisions] = useState(4)
  const [pattern, setPattern] = useState<CellPattern>({
    segments: [],
    symmetry: { type: 'rotational' },
    splitRelations: [],
    materialExclusions: [],
  })
  const [interaction, setInteraction] = useState<EditorInteraction>(idleEditorInteraction)

  useEffect(() => {
    setInteraction(idleEditorInteraction())
  }, [divisions])

  const addAnchor = (anchor: SegmentEndpointAnchor) => {
    if (interaction.kind !== 'creating-segment') {
      setInteraction({ kind: 'creating-segment', startAnchor: anchor })
      return
    }
    if (segmentEndpointAnchorKey(anchor) !== segmentEndpointAnchorKey(interaction.startAnchor)) {
      const segment: Segment = { id: globalThis.crypto.randomUUID(), start: interaction.startAnchor, end: anchor }
      setPattern((current) => ({ ...current, segments: [...current.segments, segment] }))
    }
    setInteraction(idleEditorInteraction())
  }

  const deleteSegment = (id: string) => {
    setPattern((current) => removeSegment(current, id))
    setInteraction(idleEditorInteraction())
  }

  const toggleSplitRelation = (relation: SplitRelation) => {
    setPattern((current) => current.splitRelations.some((item) => splitRelationKey(item) === splitRelationKey(relation))
      ? removeSplitRelation(current, relation) : addSplitRelation(current, relation))
  }

  useEffect(() => {
    const next = reconcileEditorInteraction(pattern, interaction)
    if (next !== interaction) setInteraction(next)
  }, [pattern, interaction])

  return (
    <>
      <header className="site-header">
        <div className="brand-mark" aria-hidden="true">組</div>
        <div><h1>Kumiko Grid</h1><p>幾何学文様スタジオ</p></div>
        <div className="header-rule" />
        <span className="version">MVP · 01</span>
      </header>
      <main>
        <Settings
          divisions={divisions}
          divisionsDisabled={pattern.segments.length > 0}
          symmetry={pattern.symmetry}
          onDivisionsChange={setDivisions}
          onSymmetryChange={(symmetry) => setPattern((current) => changeSymmetry(current, symmetry))}
        />
        <div className="workspace">
          <CellEditor
            divisions={divisions}
            pattern={pattern}
            pendingAnchor={pendingEditorAnchor(interaction)}
            onAnchorClick={addAnchor}
            onDeleteSegment={deleteSegment}
            onToggleSplitRelation={toggleSplitRelation}
            selection={editorSelection(interaction)}
            onSelectionChange={(selection) => setInteraction(selection ? { kind: 'selected', selection } : idleEditorInteraction())}
            onClearInteraction={() => setInteraction(idleEditorInteraction())}
            onExcludeMaterial={(fragment) => setPattern((current) => excludeMaterial(current, fragment))}
            onRestoreMaterial={(fragment) => setPattern((current) => restoreMaterial(current, fragment))}
          />
          <PatternPreview pattern={pattern} />
        </div>
      </main>
      <footer><span>正規化座標による幾何学設計</span><span>△ ▽ △ ▽ △</span></footer>
    </>
  )
}
