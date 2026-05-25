export type MachineType = 'pc' | 'server' | 'laptop' | 'printer' | 'switch' | 'router' | 'other'
export type Tool = 'select' | 'rect' | 'erase'

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
}

export interface Floor {
  id: string
  name: string
  position: number
}

export interface Cell {
  type: 'wall' | 'corridor' | 'room'
  color?: string
}

export interface Label {
  id: string
  row: number
  col: number
  text: string
  color: string
}

export interface PlanRect {
  id: string
  row: number
  col: number
  width: number
  height: number
  color: string
}

export interface PlacedMachine {
  id: string
  machine_id: string
  floor_id: string
  row_pos: number
  col_pos: number
  name: string
  type: MachineType
  ip: string
}

export interface FloorPlan {
  floor_id: string
  width: number
  height: number
  cells: Record<string, Cell>
  labels: Label[]
  borders: Record<string, boolean>
  rects: PlanRect[]
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
