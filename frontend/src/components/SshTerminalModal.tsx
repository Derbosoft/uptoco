import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface Props {
  machineId: string
  machineName: string
  machineIp: string
  onClose: () => void
}

export default function SshTerminalModal({ machineId, machineName, machineIp, onClose }: Props) {
  const termRef  = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'connecting' | 'connected' | 'closed'>('connecting')

  useEffect(() => {
    const term = new Terminal({
      theme: { background: '#030712', foreground: '#f9fafb', cursor: '#60a5fa', selectionBackground: '#1e40af' },
      fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
      fontSize: 14,
      lineHeight: 1.3,
      cursorBlink: true,
      scrollback: 5000,
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    if (termRef.current) {
      term.open(termRef.current)
      // Fit after a short delay so the DOM is measured correctly
      requestAnimationFrame(() => fitAddon.fit())
    }

    const wsProto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${wsProto}://${location.host}/ws/ssh/${machineId}`)
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      setStatus('connected')
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
    }

    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(e.data))
      } else {
        term.write(e.data as string)
      }
    }

    ws.onclose = () => setStatus('closed')
    ws.onerror = () => setStatus('closed')

    term.onData(data => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(new TextEncoder().encode(data))
      }
    })

    const ro = new ResizeObserver(() => {
      fitAddon.fit()
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      }
    })
    if (termRef.current) ro.observe(termRef.current)

    return () => {
      ro.disconnect()
      ws.close()
      term.dispose()
    }
  }, [machineId])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm"
      onKeyDown={e => e.key === 'Escape' && onClose()}
      onClick={onClose}
    >
      <div
        className="flex flex-col rounded-xl overflow-hidden border border-gray-700 shadow-2xl"
        style={{ width: '55vw', height: '55vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Barre de titre */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-white font-mono">{machineName}</span>
            <span className="text-gray-500 text-xs font-mono">{machineIp}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              status === 'connected'  ? 'bg-green-900/60 text-green-300' :
              status === 'connecting' ? 'bg-yellow-900/60 text-yellow-300' :
                                        'bg-red-900/60 text-red-300'
            }`}>
              {status === 'connected' ? '● Connecté' : status === 'connecting' ? '○ Connexion…' : '● Fermé'}
            </span>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-xl leading-none transition-colors"
            >×</button>
          </div>
        </div>

        {/* Terminal */}
        <div ref={termRef} className="flex-1 bg-gray-950" style={{ minHeight: 0, padding: '4px 8px' }} />

        {/* Barre basse si fermé */}
        {status === 'closed' && (
          <div className="px-4 py-2 bg-gray-900 border-t border-gray-700 flex items-center justify-between flex-shrink-0">
            <span className="text-xs text-gray-400">Session terminée</span>
            <button onClick={onClose} className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded-lg">
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
