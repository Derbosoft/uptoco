export type MachineType = 'pc' | 'server' | 'laptop' | 'printer' | 'switch' | 'router' | 'other'

export interface Machine {
  id: string
  name: string
  type: MachineType
  ip: string
  ssh_user: string
  ssh_port: number
  ssh_auth_type: 'password' | 'key'
  ssh_key_path: string
  ssh_password: string
  notes: string
  color: string
}

export interface Floor {
  id: string
  name: string
  position: number
}

export interface PlacedMachine {
  id: string
  machine_id: string
  floor_id: string
  x: number   // 0.0 – 1.0, relative to image width
  y: number   // 0.0 – 1.0, relative to image height
  scale: number  // 0.5 – 3.0, default 1.0
  name: string
  type: MachineType
  ip: string
  color: string
}

export interface FloorPlan {
  floor_id: string
  image_url: string | null
  placed_machines: PlacedMachine[]
}

export const MACHINE_ICONS: Record<MachineType, string> = {
  pc: '🖥',
  server: '🗄',
  laptop: '💻',
  printer: '🖨',
  switch: '🔀',
  router: '📡',
  other: '⬛',
}

export const MACHINE_TYPES: { value: MachineType; label: string }[] = [
  { value: 'pc', label: 'PC' },
  { value: 'server', label: 'Serveur' },
  { value: 'laptop', label: 'Laptop' },
  { value: 'printer', label: 'Imprimante' },
  { value: 'switch', label: 'Switch' },
  { value: 'router', label: 'Routeur' },
  { value: 'other', label: 'Autre' },
]
