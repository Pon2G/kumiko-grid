import { selectableEndpoint } from '../pattern/endpointCandidates'
import type { EndpointEditImpact } from '../pattern/endpointEdit'
import { segmentEndpointAnchorKey } from '../pattern/anchor'
import { sourceEndpointDestination, endpointSelectionAfterEdit, endpointImpactNeedsConfirmation } from '../pattern/endpointEdit'
import { useEffect, useMemo, useRef, useState, type SetStateAction } from 'react'
import type { Segment } from '../pattern/segment'
import type { CellPattern, SplitRelation, Symmetry } from '../pattern/cellPattern'
import { splitRelationKey } from '../pattern/designGeometry'
import { changeSegmentEndpoint, addSegment, addSplitRelation, evaluateSymmetryChange, evaluateRemoveSegment, removeSplitRelation } from '../pattern/patternOperations'
import { excludeMaterial, restoreMaterial } from '../pattern/materialExclusion'
import { CellEditor } from '../components/CellEditor/CellEditor'
import {
  idleEditorInteraction,
  cancelEndpoint, endpointPreviewAnchor,
  reconcileEditorInteraction,
  transitionEditorInteraction,
  type EditorInteraction,
  type EditorInteractionEvent,
} from '../components/CellEditor/editorInteraction'
import { PatternPreview } from '../components/PatternPreview/PatternPreview'
import { Settings } from '../components/Settings/Settings'

export default function App() {
  const [divisions, setDivisions] = useState(4)
  const [pattern, rawSetPattern] = useState<CellPattern>({
    segments: [],
    symmetry: { type: 'rotational' },
    splitRelations: [],
    materialExclusions: [],
  })
  type PendingOperation = { base: CellPattern; request: { kind: 'remove'; id: string } | { kind: 'symmetry'; symmetry: Symmetry }; impact: EndpointEditImpact }
  const [pendingOperation, setPendingOperation] = useState<PendingOperation | null>(null)
  const [segmentNotice, setSegmentNotice] = useState<string>()
  const [symmetryNotice, setSymmetryNotice] = useState<string>()
  const [interaction, rawSetInteraction] = useState<EditorInteraction>(idleEditorInteraction)

  const patternRef = useRef(pattern)
  const interactionRef = useRef(interaction)
  const setPattern = (value: SetStateAction<CellPattern>) => {
    const next = typeof value === 'function' ? value(patternRef.current) : value
    patternRef.current = next
    rawSetPattern(next)
  }
  const setInteraction = (value: EditorInteraction) => { interactionRef.current = value; rawSetInteraction(value) }
  const editing = interaction.kind === 'editing-endpoint' && interaction.context.base === pattern && interaction.context.divisions === divisions ? interaction : null
  const previewAnchor = editing && endpointPreviewAnchor(editing)
  const previewAnchorKey = previewAnchor ? segmentEndpointAnchorKey(previewAnchor) : null
  const endpointEvaluation = useMemo(() => {
    if (!editing || !previewAnchor) return null
    const anchor = sourceEndpointDestination(editing.context.base, editing.context.instance, previewAnchor)
    return anchor ? changeSegmentEndpoint(editing.context.base, editing.context.instance.sourceSegmentId, editing.context.endpoint, anchor) : null
  }, [editing?.context, previewAnchorKey])
  const previewPattern = endpointEvaluation?.kind === 'changed' ? endpointEvaluation.pattern : null

  useEffect(() => {
    const current = interactionRef.current
    setInteraction(current.kind === 'editing-endpoint' ? cancelEndpoint(patternRef.current, current) : idleEditorInteraction())
  }, [divisions])

  const handleInteraction = (event: EditorInteractionEvent) => {
    setSegmentNotice(undefined)
    if (event.kind === 'clear') setPendingOperation(null)
    const transition = transitionEditorInteraction(interactionRef.current, event, { pattern: patternRef.current, divisions })
    setInteraction(transition.interaction)
    if (transition.command?.kind === 'edit-endpoint') {
      const { context, anchor: destination, approved } = transition.command
      const current = patternRef.current
      if (context.base !== current || context.divisions !== divisions) {
        if (transition.interaction.kind === 'editing-endpoint') setInteraction(cancelEndpoint(current, transition.interaction))
        return
      }
      const anchor = sourceEndpointDestination(current, context.instance, destination)
      const result = anchor ? changeSegmentEndpoint(current, context.instance.sourceSegmentId, context.endpoint, anchor) : { kind: 'rejected' as const, reason: '端点の指定が無効です' }
      if (result.kind === 'changed' && endpointImpactNeedsConfirmation(result.impact) && !approved && transition.interaction.kind === 'editing-endpoint') {
        setInteraction({ ...transition.interaction, phase: 'confirming', pointer: undefined, position: undefined })
        return
      }
      if (result.kind === 'changed') {
        const mapping = endpointSelectionAfterEdit(result.pattern, context.instance, context.endpoint)
        setPattern(result.pattern)
        setInteraction(mapping ? { kind: 'selected', selection: { kind: 'segment', segment: mapping.instance } } : idleEditorInteraction())
      } else {
        setSegmentNotice(result.kind === 'rejected' ? result.reason : undefined)
        if (transition.interaction.kind === 'editing-endpoint') setInteraction(cancelEndpoint(current, transition.interaction))
      }
    }
    if (transition.command?.kind === 'create-segment') {
      const segment: Segment = {
        id: globalThis.crypto.randomUUID(),
        start: transition.command.startAnchor,
        end: transition.command.endAnchor,
      }
      const current = patternRef.current
      const next = addSegment(current, segment)
      setSegmentNotice(next === current ? '端点参照が無効か線分が重複するため追加できません' : undefined)
      if (next === current && selectableEndpoint(current, segment.start)) setInteraction({ kind: 'creating-segment', startAnchor: segment.start })
      setPattern(next)
    }
  }

  const updateSymmetry = (symmetry: Symmetry) => {
    setSymmetryNotice(undefined)
    if (pattern.symmetry.type === symmetry.type
      && (pattern.symmetry.type !== 'mirror' || symmetry.type !== 'mirror' || pattern.symmetry.axis === symmetry.axis)) return
    requestOperation({ kind: 'symmetry', symmetry })
  }

  const evaluateOperation = (base: CellPattern, request: PendingOperation['request']) => request.kind === 'remove'
    ? evaluateRemoveSegment(base, request.id) : evaluateSymmetryChange(base, request.symmetry)
  const requestOperation = (request: PendingOperation['request']) => {
    const base = patternRef.current
    const result = evaluateOperation(base, request)
    if (result.kind === 'rejected') {
      if (request.kind === 'symmetry') setSymmetryNotice(result.reason === '線分が重なるため変更できません'
        ? '線分が重なるため対称変換を変更できません' : result.reason)
      else setSegmentNotice(result.reason)
      return
    }
    if (result.kind !== 'changed') return
    if (result.impact.lostSourceIds?.length) { setPendingOperation({ base, request, impact: result.impact }); return }
    setPattern(result.pattern)
    setInteraction(idleEditorInteraction())
  }
  const approveOperation = () => {
    if (!pendingOperation) return
    setPendingOperation(null)
    if (patternRef.current !== pendingOperation.base) return
    const result = evaluateOperation(patternRef.current, pendingOperation.request)
    if (result.kind === 'changed') { setPattern(result.pattern); setInteraction(idleEditorInteraction()) }
  }
  const deleteSegment = (id: string) => requestOperation({ kind: 'remove', id })

  const toggleSplitRelation = (relation: SplitRelation) => {
    setPattern((current) => current.splitRelations.some((item) => splitRelationKey(item) === splitRelationKey(relation))
      ? removeSplitRelation(current, relation) : addSplitRelation(current, relation))
  }

  useEffect(() => {
    if (pendingOperation && pendingOperation.base !== pattern) setPendingOperation(null)
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
          onSymmetryChange={updateSymmetry}
          notice={symmetryNotice}
        />
        <div className="workspace">
          <CellEditor
            dependencyConfirmation={pendingOperation?.base === pattern ? pendingOperation.impact : null}
            onApproveDependency={approveOperation}
            onCancelDependency={() => setPendingOperation(null)}
            endpointEvaluation={endpointEvaluation}
            previewPattern={previewPattern}
            notice={segmentNotice}
            divisions={divisions}
            pattern={pattern}
            interaction={interaction}
            onDeleteSegment={deleteSegment}
            onToggleSplitRelation={toggleSplitRelation}
            onInteraction={handleInteraction}
            onExcludeMaterial={(fragment) => setPattern((current) => excludeMaterial(current, fragment))}
            onRestoreMaterial={(fragment) => setPattern((current) => restoreMaterial(current, fragment))}
          />
          <PatternPreview pattern={previewPattern ?? pattern} endpointPreview={previewPattern !== null} />
        </div>
      </main>
      <footer><span>正規化座標による幾何学設計</span><span>△ ▽ △ ▽ △</span></footer>
    </>
  )
}
