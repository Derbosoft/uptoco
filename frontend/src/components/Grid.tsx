import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { PlacedMachine, PlanRect } from '../types'
import { MACHINE_ICONS } from '../types'

const BASE_CELL = 48

interface Props {
  onMachineClick: (pm: PlacedMachine, e: React.MouseEvent) => void
}

export default function Grid({ onMachineClick }: Props) {
  const {
    plan, tool, toolColor, zoom, paintCell, saveCells, pushHistory,
    placeMachine, addRect, statuses,
  } = useStore()

  const isPainting = useRef(false)
  const rectDraft = useRef<{ startRow: number; startCol: number; endRow: number; endCol: number; color: string } | null>(null)
  const addRectRef = useRef(addRect)
  useEffect(() => { addRectRef.current = addRect }, [addRect])

  const gridRef = useRef<HTMLDivElement>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [rectPreview, setRectPreview] = useState<PlanRect | null>(null)

  const cellSize = Math.round(BASE_CELL * zoom)

  useEffect(() => {
    const onUp = () => {
      isPainting.current = false
      if (rectDraft.current) {
        const d = rectDraft.current
        const r1 = Math.min(d.startRow, d.endRow)
        const c1 = Math.min(d.startCol, d.endCol)
        addRectRef.current({
          id: crypto.randomUUID(),
          row: r1, col: c1,
          width: Math.abs(d.endCol - d.startCol) + 1,
          height: Math.abs(d.endRow - d.startRow) + 1,
          color: d.color,
        })
        rectDraft.current = null
        setRectPreview(null)
      }
      saveCells()
    }
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  }, [saveCells])

  if (!plan) return null

  const { cells, placed_machines } = plan
  const borders = plan.borders ?? {}
  const rects = plan.rects ?? []

  const machineMap: Record<string, PlacedMachine> = {}
  for (const pm of placed_machines) machineMap[`${pm.row_pos},${pm.col_pos}`] = pm

  // Compute cell background colors from rects
  const cellRectColor: Record<string, string> = {}
  for (const r of rects) {
    for (let row = r.row; row < r.row + r.height; row++) {
      for (let col = r.col; col < r.col + r.width; col++) {
        cellRectColor[`${row},${col}`] = r.color
      }
    }
  }
  // Also apply preview rect to cell colors
  if (rectPreview) {
    for (let row = rectPreview.row; row < rectPreview.row + rectPreview.height; row++) {
      for (let col = rectPreview.col; col < rectPreview.col + rectPreview.width; col++) {
        cellRectColor[`${row},${col}`] = rectPreview.color
      }
    }
  }

  const handleGridMouseMove = (e: React.MouseEvent) => {
    if (tool !== 'rect' || !isPainting.current || !rectDraft.current) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const col = Math.max(0, Math.min(plan.width - 1, Math.floor((e.clientX - rect.left) / cellSize)))
    const row = Math.max(0, Math.min(plan.height - 1, Math.floor((e.clientY - rect.top) / cellSize)))
    const d = rectDraft.current
    if (row !== d.endRow || col !== d.endCol) {
      rectDraft.current = { ...d, endRow: row, endCol: col }
      const r1 = Math.min(d.startRow, row), c1 = Math.min(d.startCol, col)
      setRectPreview({
        id: 'preview', row: r1, col: c1,
        width: Math.abs(col - d.startCol) + 1,
        height: Math.abs(row - d.startRow) + 1,
        color: d.color,
      })
    }
  }

  const handleMouseDown = (row: number, col: number, e: React.MouseEvent) => {
    e.preventDefault()
    if (tool === 'select') return
    if (tool === 'rect') {
      pushHistory()
      rectDraft.current = { startRow: row, startCol: col, endRow: row, endCol: col, color: toolColor }
      setRectPreview({ id: 'preview', row, col, width: 1, height: 1, color: toolColor })
      isPainting.current = true
      return
    }
    // erase
    pushHistory()
    isPainting.current = true
    paintCell(row, col)
  }

  const handleMouseEnter = (row: number, col: number) => {
    if (!isPainting.current || tool !== 'erase') return
    paintCell(row, col)
  }

  const handleDragOver = (e: React.DragEvent, key: string) => { e.preventDefault(); setDragOver(key) }
  const handleDrop = (row: number, col: number, e: React.DragEvent) => {
    e.preventDefault(); setDragOver(null)
    const machineId = e.dataTransfer.getData('machine_id')
    if (machineId) placeMachine(machineId, row, col)
  }

  const renderBorderOverlay = (key: string) => {
    const [type, r, c] = key.split(':')
    const row = parseInt(r), col = parseInt(c)
    if (type === 'h') return (
      <div key={key} style={{
        position: 'absolute', top: row * cellSize - 2, left: col * cellSize,
        width: cellSize, height: 4, backgroundColor: '#1f2937',
        pointerEvents: 'none', zIndex: 5, borderRadius: 1,
      }} />
    )
    return (
      <div key={key} style={{
        position: 'absolute', top: row * cellSize, left: col * cellSize - 2,
        width: 4, height: cellSize, backgroundColor: '#1f2937',
        pointerEvents: 'none', zIndex: 5, borderRadius: 1,
      }} />
    )
  }

  return (
    <div
      id="floor-grid"
      ref={gridRef}
      style={{
        position: 'relative', display: 'inline-block', lineHeight: 0,
        cursor: tool === 'select' ? 'default' : tool === 'erase' ? 'cell' : 'crosshair',
      }}
      onMouseMove={handleGridMouseMove}
      onMouseLeave={() => { isPainting.current = false }}
    >
      {/* Cell grid */}
      {Array.from({ length: plan.height }, (_, row) => (
        <div key={row} style={{ display: 'flex' }}>
          {Array.from({ length: plan.width }, (_, col) => {
            const key = `${row},${col}`
            const pm = machineMap[key]
            const isDragTarget = dragOver === key
            const status = pm ? statuses[pm.machine_id] : undefined
            const dot = status === undefined ? '#9ca3af' : status ? '#22c55e' : '#ef4444'
            const bg = cellRectColor[key] ?? '#ffffff'

            return (
              <div
                key={col}
                draggable={pm !== undefined && tool === 'select'}
                style={{
                  width: cellSize, height: cellSize,
                  backgroundColor: bg,
                  border: '1px solid #d1d5db',
                  position: 'relative', flexShrink: 0, boxSizing: 'border-box',
                  zIndex: pm ? 3 : undefined,
                  outline: isDragTarget ? '2px solid #3b82f6' : undefined,
                  outlineOffset: '-2px',
                  cursor: pm && tool === 'select' ? 'grab' : undefined,
                }}
                onDragStart={pm && tool === 'select' ? (e) => {
                  e.dataTransfer.setData('machine_id', pm.machine_id)
                  e.dataTransfer.effectAllowed = 'move'
                } : undefined}
                onMouseDown={(e) => {
                  if (pm && tool === 'select') { onMachineClick(pm, e); return }
                  handleMouseDown(row, col, e)
                }}
                onMouseEnter={() => handleMouseEnter(row, col)}
                onDragOver={(e) => handleDragOver(e, key)}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => handleDrop(row, col, e)}
              >
                {pm && (
                  <div style={{
                    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', padding: 2,
                  }}>
                    <div style={{
                      position: 'absolute', top: 3, right: 3, width: 7, height: 7,
                      borderRadius: '50%', backgroundColor: dot, boxShadow: `0 0 4px ${dot}`,
                    }} />
                    <span style={{ fontSize: Math.max(10, cellSize * 0.35) }}>{MACHINE_ICONS[pm.type]}</span>
                    {cellSize >= 36 && (
                      <span style={{
                        fontSize: Math.max(7, cellSize * 0.16), fontWeight: 600,
                        color: isDarkColor(bg) ? '#f9fafb' : '#111827',
                        maxWidth: cellSize - 6, overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap', lineHeight: 1.2, textAlign: 'center',
                      }}>{pm.name}</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}

      {/* Border overlays (auto-generated from rects) */}
      {Object.entries(borders).map(([key, active]) => active ? renderBorderOverlay(key) : null)}
    </div>
  )
}

function isDarkColor(hex: string): boolean {
  const n = parseInt(hex.replace('#', ''), 16)
  if (isNaN(n)) return false
  const r = (n >> 16) & 0xff
  const g = (n >> 8) & 0xff
  const b = n & 0xff
  return (r * 299 + g * 587 + b * 114) / 1000 < 128
}
