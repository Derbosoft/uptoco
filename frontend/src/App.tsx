import { useEffect } from 'react'
import { useStore } from './store'
import InventoryView from './views/InventoryView'
import PlansView from './views/PlansView'
import TopNav from './components/TopNav'

export default function App() {
  const { loadAll, updateStatuses, undo, redo, view } = useStore()

  useEffect(() => {
    loadAll().catch(console.error)
  }, [])

  useEffect(() => {
    const wsProto = location.protocol === 'https:' ? 'wss' : 'ws'
    let ws: WebSocket
    const connect = () => {
      ws = new WebSocket(`${wsProto}://${location.host}/ws`)
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        if (msg.type === 'status') updateStatuses(msg.data)
      }
      ws.onclose = () => setTimeout(connect, 3000)
    }
    connect()
    return () => ws?.close()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden" style={{ userSelect: 'none' }}>
      <TopNav />
      <div className="flex-1 overflow-hidden">
        {view === 'inventory' ? <InventoryView /> : <PlansView />}
      </div>
    </div>
  )
}
