import { useEffect, useState } from 'react'
import { anchorKey } from '../geometry/anchorPoint'
import type { AnchorPoint } from '../geometry/anchorPoint'
import type { Segment } from '../geometry/segment'
import type { CellPattern, SplitRelation } from '../pattern/cellPattern'
import { addSplitRelation, changeSymmetry, removeSegment, removeSplitRelation, splitRelationKey } from '../pattern/splitting'
import { CellEditor } from '../components/CellEditor/CellEditor'
import { PatternPreview } from '../components/PatternPreview/PatternPreview'
import { Settings } from '../components/Settings/Settings'

export default function App() {
  const [divisions, setDivisions] = useState(4)
  const [pattern, setPattern] = useState<CellPattern>({
    segments: [],
    symmetry: { type: 'rotational' },
    splitRelations: [],
  })
  const [pendingAnchor, setPendingAnchor] = useState<AnchorPoint | null>(null)
  const [splitTargetId, setSplitTargetId] = useState<string | null>(null)

  useEffect(() => {
    setPendingAnchor(null)
  }, [divisions])

  const addAnchor = (anchor: AnchorPoint) => {
    if (!pendingAnchor) {
      setPendingAnchor(anchor)
      return
    }
    if (anchorKey(anchor) !== anchorKey(pendingAnchor)) {
      const segment: Segment = { id: globalThis.crypto.randomUUID(), start: pendingAnchor, end: anchor }
      setPattern((current) => ({ ...current, segments: [...current.segments, segment] }))
    }
    setPendingAnchor(null)
  }

  const deleteSegment = (id: string) => {
    setPattern((current) => removeSegment(current, id))
    setSplitTargetId((current) => current === id ? null : current)
  }

  const toggleSplitRelation = (relation: SplitRelation) => {
    setPattern((current) => current.splitRelations.some((item) => splitRelationKey(item) === splitRelationKey(relation))
      ? removeSplitRelation(current, relation) : addSplitRelation(current, relation))
  }

  const selectSplitTarget = (id: string | null) => {
    setPendingAnchor(null)
    setSplitTargetId(id)
  }

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
            pendingAnchor={pendingAnchor}
            splitTargetId={splitTargetId}
            onAnchorClick={addAnchor}
            onDeleteSegment={deleteSegment}
            onSelectSplitTarget={selectSplitTarget}
            onToggleSplitRelation={toggleSplitRelation}
          />
          <PatternPreview pattern={pattern} />
        </div>
      </main>
      <footer><span>正規化座標による幾何学設計</span><span>△ ▽ △ ▽ △</span></footer>
    </>
  )
}
