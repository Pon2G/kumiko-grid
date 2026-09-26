import { useEffect, useState } from 'react'
import { anchorKey } from '../geometry/anchorPoint'
import type { AnchorPoint } from '../geometry/anchorPoint'
import type { Segment } from '../geometry/segment'
import type { Symmetry } from '../pattern/cellPattern'
import { CellEditor } from '../components/CellEditor/CellEditor'
import { PatternPreview } from '../components/PatternPreview/PatternPreview'
import { Settings } from '../components/Settings/Settings'

export default function App() {
  const [divisions, setDivisions] = useState(4)
  const [segments, setSegments] = useState<Segment[]>([])
  const [symmetry, setSymmetry] = useState<Symmetry>({ type: 'rotational' })
  const [pendingAnchor, setPendingAnchor] = useState<AnchorPoint | null>(null)

  useEffect(() => {
    setPendingAnchor(null)
    setSegments([])
  }, [divisions])

  const addAnchor = (anchor: AnchorPoint) => {
    if (!pendingAnchor) {
      setPendingAnchor(anchor)
      return
    }
    if (anchorKey(anchor) !== anchorKey(pendingAnchor)) {
      setSegments((current) => [...current, {
        id: globalThis.crypto.randomUUID(),
        start: pendingAnchor,
        end: anchor,
      }])
    }
    setPendingAnchor(null)
  }

  const pattern = { segments, symmetry }

  return (
    <>
      <header className="site-header">
        <div className="brand-mark" aria-hidden="true">組</div>
        <div><h1>Kumiko Grid</h1><p>Geometric pattern studio</p></div>
        <div className="header-rule" />
        <span className="version">MVP · 01</span>
      </header>
      <main>
        <Settings divisions={divisions} symmetry={symmetry} onDivisionsChange={setDivisions} onSymmetryChange={setSymmetry} />
        <div className="workspace">
          <CellEditor
            divisions={divisions}
            pattern={pattern}
            pendingAnchor={pendingAnchor}
            onAnchorClick={addAnchor}
            onDeleteSegment={(id) => setSegments((current) => current.filter((segment) => segment.id !== id))}
          />
          <PatternPreview pattern={pattern} />
        </div>
      </main>
      <footer><span>Normalized geometric construction</span><span>△ ▽ △ ▽ △</span></footer>
    </>
  )
}
