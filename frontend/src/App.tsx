import { useEffect } from 'react'
import { useStore } from './store'
import InventoryView from './views/InventoryView'
import PlansView from './views/PlansView'
import TopNav from './components/TopNav'

export default function App() {
  const { loadAll, updateStatuses, view } = useStore()

  useEffect(() => {
    loadAll().catch(console.error)
  }, [])

  useEffect(() => {
    const wsProto = location.protocol === 'https:' ? 'wss' : 'ws'
    let ws: WebSocket
    let closed = false
    const connect = () => {
      ws = new WebSocket(`${wsProto}://${location.host}/ws`)
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        if (msg.type === 'status') updateStatuses(msg.data)
      }
      ws.onclose = () => { if (!closed) setTimeout(connect, 3000) }
    }
    connect()
    return () => { closed = true; ws?.close() }
  }, [])

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden" style={{ userSelect: 'none' }}>
      <TopNav />
      <div className="flex-1 overflow-hidden">
        {view === 'inventory' ? <InventoryView /> : <PlansView />}
      </div>
    </div>
  )
}
