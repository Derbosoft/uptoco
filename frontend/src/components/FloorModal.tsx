import { useRef, useState } from 'react'
import { useStore } from '../store'

interface Props {
  id?: string
  initialName?: string
  onClose: () => void
  onSaved: (msg: string) => void
}

export default function FloorModal({ id, initialName, onClose, onSaved }: Props) {
  const { createFloor, updateFloor, floors, uploadImage, loadFloorPlan, plan } = useStore()
  const [name, setName] = useState(initialName ?? '')
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const isEdit = Boolean(id)

  const currentImage = isEdit && plan?.floor_id === id ? plan?.image_url : null

  const submit = async () => {
    if (!name.trim()) { setError('Le nom est requis'); return }
    if (isEdit && id) {
      const floor = floors.find(f => f.id === id)
      await updateFloor(id, name.trim(), floor?.position ?? 0)
      onSaved('Étage renommé')
    } else {
      await createFloor(name.trim())
      onSaved('Étage créé')
    }
  }

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !id) return
    e.target.value = ''
    setUploading(true)
    await uploadImage(file, id)
    await loadFloorPlan(id)
    setUploading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl shadow-2xl p-6 w-80 border border-gray-600"
        onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">{isEdit ? 'Modifier l\'étage' : 'Nouvel étage'}</h2>

        <label className="text-xs text-gray-400 block mb-1">Nom</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="RDC, 1er étage, Sous-sol..."
          autoFocus
          onKeyDown={e => e.key === 'Enter' && submit()}
          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 mb-4" />

        {isEdit && (
          <div className="mb-4">
            <label className="text-xs text-gray-400 block mb-1">Image du plan</label>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full flex items-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 text-sm rounded-lg py-2 px-3 border border-dashed border-gray-500 transition-colors"
            >
              <span>{uploading ? '⏳' : '🖼'}</span>
              <span className="truncate">
                {uploading ? 'Envoi en cours…' : currentImage ? 'Changer l\'image du plan' : 'Ajouter une image de plan'}
              </span>
            </button>
            {currentImage && !uploading && (
              <img src={currentImage} alt="plan" className="mt-2 rounded w-full object-contain max-h-24 border border-gray-600" />
            )}
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} />
          </div>
        )}

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
        <div className="flex gap-2">
          <button onClick={submit}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2 text-sm font-medium">
            {isEdit ? 'Renommer' : 'Créer'}
          </button>
          <button onClick={onClose}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2 text-sm">Annuler</button>
        </div>
      </div>
    </div>
  )
}
