import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { PlacedMachine } from '../types'
import { MACHINE_ICONS } from '../types'
import MachinePopup from './MachinePopup'

interface Props {
  showNotif: (msg: string, ok?: boolean) => void
}

export default function FloorCanvas({ showNotif }: Props) {
  const { plan, statuses, zoom, setZoom, placeMachine, moveMachine, saveMachinePosition, scaleMachine, saveMachineScale, uploadImage } = useStore()

  const outerRef     = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Zoom ref — évite de re-enregistrer le wheel listener à chaque changement de zoom
  const zoomRef = useRef(zoom)
  useEffect(() => { zoomRef.current = zoom }, [zoom])

  // Pan
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const panRef  = useRef({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panDraft = useRef<{
    startMouseX: number; startMouseY: number
    startPanX: number; startPanY: number
    hasPanned: boolean
  } | null>(null)
  const justPanned = useRef(false)

  // Réinitialise le pan quand on change d'étage
  const floorId = plan?.floor_id
  useEffect(() => {
    const zero = { x: 0, y: 0 }
    panRef.current = zero
    setPan(zero)
  }, [floorId])

  // Move drag state
  const moveDraft = useRef<{
    machineId: string
    origX: number; origY: number
    startMouseX: number; startMouseY: number
    lastClientX: number; lastClientY: number
    hasMoved: boolean
  } | null>(null)

  // Resize drag state
  const resizeDraft = useRef<{
    machineId: string
    origScale: number
    startMouseY: number
  } | null>(null)

  const planRef = useRef(plan)
  useEffect(() => { planRef.current = plan }, [plan])

  const [isDragOver, setIsDragOver] = useState(false)
  const [selected, setSelected] = useState<{ pm: PlacedMachine; x: number; y: number } | null>(null)
  const [outerSize, setOuterSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = outerRef.current
    if (!el) return
    const measure = () => setOuterSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Zoom molette centré sur le curseur
  useEffect(() => {
    const el = outerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!planRef.current?.image_url) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left - rect.width  / 2
      const my = e.clientY - rect.top  - rect.height / 2
      const oldZoom = zoomRef.current
      const newZoom = Math.max(0.3, Math.min(4, oldZoom + (e.deltaY < 0 ? 0.1 : -0.1)))
      const r = newZoom / oldZoom
      const newPan = {
        x: mx - (mx - panRef.current.x) * r,
        y: my - (my - panRef.current.y) * r,
      }
      panRef.current = newPan
      setPan(newPan)
      setZoom(newZoom)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [setZoom])

  // Drag global (pan + déplacement machine + resize)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      // Pan
      if (panDraft.current) {
        const dx = e.clientX - panDraft.current.startMouseX
        const dy = e.clientY - panDraft.current.startMouseY
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) panDraft.current.hasPanned = true
        const newPan = { x: panDraft.current.startPanX + dx, y: panDraft.current.startPanY + dy }
        panRef.current = newPan
        setPan(newPan)
        return
      }
      // Resize
      if (resizeDraft.current) {
        const dy = e.clientY - resizeDraft.current.startMouseY
        scaleMachine(resizeDraft.current.machineId, resizeDraft.current.origScale + dy / 60)
        return
      }
      // Déplacement machine
      if (!moveDraft.current || !containerRef.current) return
      moveDraft.current.lastClientX = e.clientX
      moveDraft.current.lastClientY = e.clientY
      const moved =
        Math.abs(e.clientX - moveDraft.current.startMouseX) > 4 ||
        Math.abs(e.clientY - moveDraft.current.startMouseY) > 4
      if (!moved) return
      moveDraft.current.hasMoved = true
      const rect = containerRef.current.getBoundingClientRect()
      moveMachine(
        moveDraft.current.machineId,
        Math.max(0, Math.min(1, moveDraft.current.origX + (e.clientX - moveDraft.current.startMouseX) / rect.width)),
        Math.max(0, Math.min(1, moveDraft.current.origY + (e.clientY - moveDraft.current.startMouseY) / rect.height)),
      )
    }
    const onUp = () => {
      // Fin pan
      if (panDraft.current) {
        if (panDraft.current.hasPanned) justPanned.current = true
        setIsPanning(false)
        panDraft.current = null
        return
      }
      // Fin resize
      if (resizeDraft.current) {
        saveMachineScale(resizeDraft.current.machineId)
        resizeDraft.current = null
        return
      }
      // Fin déplacement machine
      if (!moveDraft.current) return
      if (moveDraft.current.hasMoved) {
        saveMachinePosition(moveDraft.current.machineId)
      } else {
        const pm = planRef.current?.placed_machines.find(p => p.machine_id === moveDraft.current!.machineId)
        if (pm) setSelected({ pm, x: moveDraft.current.lastClientX, y: moveDraft.current.lastClientY })
      }
      moveDraft.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [moveMachine, saveMachinePosition, scaleMachine, saveMachineScale])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const machineId = e.dataTransfer.getData('machine_id')
    if (machineId && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      placeMachine(
        machineId,
        rect.width  > 0 ? Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))  : 0.5,
        rect.height > 0 ? Math.max(0, Math.min(1, (e.clientY - rect.top)  / rect.height)) : 0.5,
      )
      return
    }
    const file = e.dataTransfer.files[0]
    if (file?.type.startsWith('image/')) uploadImage(file)
  }

  const pad = 20
  const baseW = outerSize.w > 0 ? outerSize.w - pad * 2 : 800
  const baseH = outerSize.h > 0 ? outerSize.h - pad * 2 : 600
  const imgMaxW = `${Math.round(baseW * zoom)}px`
  const imgMaxH = `${Math.round(baseH * zoom)}px`

  if (!plan) return null

  return (
    <div
      ref={outerRef}
      className="flex-1 relative bg-gray-950 overflow-hidden"
      style={{ cursor: isPanning ? 'grabbing' : plan.image_url ? 'grab' : 'default' }}
      onMouseDown={e => {
        if (e.button !== 0 || !plan.image_url) return
        panDraft.current = {
          startMouseX: e.clientX,
          startMouseY: e.clientY,
          startPanX: panRef.current.x,
          startPanY: panRef.current.y,
          hasPanned: false,
        }
        setIsPanning(true)
      }}
      onClick={() => {
        if (justPanned.current) { justPanned.current = false; return }
        setSelected(null)
      }}
      onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false) }}
      onDrop={handleDrop}
    >
      {/* Zone upload (pas d'image) */}
      {!plan.image_url && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '100%', maxWidth: 450, padding: 20,
        }}>
          <div
            className={`flex flex-col items-center justify-center gap-4 w-full h-64 rounded-2xl border-2 border-dashed transition-colors
              ${isDragOver ? 'border-blue-400 bg-blue-950/30' : 'border-gray-600'}`}
          >
            <span className="text-5xl">🗺</span>
            <div className="text-center">
              <p className="text-gray-300 font-medium">Glisser une image ici</p>
              <p className="text-gray-500 text-sm mt-1">ou utilisez ✎ sur l'étage pour en ajouter une</p>
              <p className="text-gray-600 text-xs mt-2">PNG, JPG, SVG…</p>
            </div>
          </div>
        </div>
      )}

      {/* Plan avec image — centré + décalé par le pan */}
      {plan.image_url && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))`,
        }}>
          {/* Container calé sur l'image */}
          <div
            ref={containerRef}
            style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}
            onClick={e => e.stopPropagation()}
          >
            <img
              src={plan.image_url}
              draggable={false}
              style={{
                display: 'block',
                maxWidth: imgMaxW,
                maxHeight: imgMaxH,
                userSelect: 'none',
                borderRadius: 6,
                boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
                outline: isDragOver ? '3px solid #3b82f6' : undefined,
                outlineOffset: 2,
              }}
            />

            {/* Machines */}
            {plan.placed_machines.map(pm => {
              const status = statuses[pm.machine_id]
              const dot = status === undefined ? '#9ca3af' : status ? '#22c55e' : '#ef4444'
              const s = pm.scale ?? 1
              const baseEmoji = 24 * s
              const baseName  = 10 * s
              const minW      = 50 * s

              const cardColor = pm.color || '#6b7280'
              const dark = isDark(cardColor)
              const textColor = dark ? '#f9fafb' : '#1f2937'
              const borderColor = shadeColor(cardColor, -35)
              const dotBorder = dark ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.8)'

              return (
                <div
                  key={pm.id}
                  style={{
                    position: 'absolute',
                    left: `${pm.x * 100}%`,
                    top: `${pm.y * 100}%`,
                    transform: 'translate(-50%, -50%)',
                    cursor: 'grab',
                    userSelect: 'none',
                    zIndex: 10,
                  }}
                  onMouseDown={e => {
                    e.stopPropagation()
                    if (e.button !== 0) return
                    moveDraft.current = {
                      machineId: pm.machine_id,
                      origX: pm.x, origY: pm.y,
                      startMouseX: e.clientX, startMouseY: e.clientY,
                      lastClientX: e.clientX, lastClientY: e.clientY,
                      hasMoved: false,
                    }
                  }}
                >
                  <div style={{
                    position: 'relative',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    background: cardColor,
                    borderRadius: 8,
                    overflow: 'hidden',
                    boxShadow: '0 2px 14px rgba(0,0,0,0.45)',
                    border: `2px solid ${borderColor}`,
                    minWidth: minW,
                    padding: `${4 * s}px ${8 * s}px ${5 * s}px`,
                  }}>
                    {/* Status dot */}
                    <div style={{
                      position: 'absolute', top: 3 * s, right: 3 * s,
                      width: Math.max(6, 8 * s), height: Math.max(6, 8 * s),
                      borderRadius: '50%', backgroundColor: dot,
                      boxShadow: `0 0 ${4 * s}px ${dot}`,
                      border: `1.5px solid ${dotBorder}`,
                    }} />
                    <span style={{ fontSize: baseEmoji, lineHeight: 1 }}>{MACHINE_ICONS[pm.type]}</span>
                    <span style={{
                      fontSize: baseName, fontWeight: 700, color: textColor,
                      maxWidth: Math.max(60, 80 * s), textAlign: 'center', lineHeight: 1.3,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      marginTop: 2 * s,
                    }}>{pm.name}</span>

                    {/* Poignée de resize */}
                    <div
                      title="Redimensionner (glisser vers le haut)"
                      style={{
                        position: 'absolute', bottom: 1, right: 1,
                        width: Math.max(8, 10 * s), height: Math.max(8, 10 * s),
                        cursor: 'nwse-resize',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: 0.6,
                      }}
                      onMouseDown={e => {
                        e.stopPropagation()
                        resizeDraft.current = {
                          machineId: pm.machine_id,
                          origScale: pm.scale ?? 1,
                          startMouseY: e.clientY,
                        }
                      }}
                    >
                      <svg width={Math.max(6, 8 * s)} height={Math.max(6, 8 * s)} viewBox="0 0 8 8" fill="none">
                        <path d="M1 7L7 1M4 7L7 4" stroke={textColor} strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {selected && (
        <MachinePopup
          placed={selected.pm}
          position={{ x: selected.x, y: selected.y }}
          onClose={() => setSelected(null)}
          showNotif={showNotif}
        />
      )}
    </div>
  )
}

function isDark(hex: string): boolean {
  const n = parseInt(hex.replace('#', ''), 16)
  if (isNaN(n)) return false
  const r = (n >> 16) & 0xff
  const g = (n >> 8) & 0xff
  const b = n & 0xff
  return (r * 299 + g * 587 + b * 114) / 1000 < 140
}

function shadeColor(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  if (isNaN(n)) return hex
  const r = Math.max(0, Math.min(255, ((n >> 16) & 0xff) + amount))
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amount))
  const b = Math.max(0, Math.min(255, (n & 0xff) + amount))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}
