// Cài đặt và dữ liệu người chơi, lưu trong localStorage của trình duyệt.
// Mọi lần đọc/ghi đều bọc try/catch: chế độ ẩn danh hoặc bộ nhớ đầy không được làm sập app.
import type { RunResult } from './game'
import type { FovType } from './sens'
import { cleanParams, type Playlist, type Task } from './tasks'

export type Sfx = 'none' | 'tick' | 'pop' | 'ding' | 'thud' | 'click'

export interface Settings {
  game: string
  sens: number
  dpi: number
  ySens: number
  invertY: boolean
  rawInput: boolean
  mouseScale: number
  fov: number
  fovType: FovType
  chStyle: 'cross' | 't' | 'dot' | 'circle'
  chColor: string
  chAlpha: number
  chLength: number
  chThick: number
  chGap: number
  chDot: boolean
  chDotSize: number
  chOutline: boolean
  chOutlineColor: string
  targetColor: string
  hoverColor: string
  decoyColor: string
  hpBars: boolean
  effects: boolean
  hitmarker: boolean
  volume: number
  hitSound: Sfx
  killSound: Sfx
  missSound: Sfx
  shootSound: 'none' | 'click' | 'gun'
  spawnSound: boolean
  trackSound: boolean
  theme: string
  wallColor: string
  gridColor: string
  floorColor: string
  renderScale: number
  antialias: boolean
  hud: boolean
  showFps: boolean
  fullscreen: boolean
  countdown: number
}

export const THEMES: { id: string; name: string; wall: string; grid: string; floor: string }[] = [
  { id: 'lab', name: 'Phòng tập (tối)', wall: '#2a2f38', grid: '#3b424e', floor: '#20242b' },
  { id: 'night', name: 'Đêm', wall: '#0e1117', grid: '#1d2433', floor: '#0a0c10' },
  { id: 'range', name: 'Trường bắn (be)', wall: '#b9b2a3', grid: '#a39b8b', floor: '#8c8576' },
  { id: 'light', name: 'Sáng', wall: '#d5dae2', grid: '#b7bfcb', floor: '#c3c9d2' },
  { id: 'contrast', name: 'Tương phản cao', wall: '#000000', grid: '#262626', floor: '#000000' },
]

export const DEFAULT_SETTINGS: Settings = {
  game: 'valorant',
  sens: 0.4,
  dpi: 800,
  ySens: 1,
  invertY: false,
  rawInput: true,
  mouseScale: 1,
  fov: 103,
  fovType: 'h169',
  chStyle: 'cross',
  chColor: '#00ff9c',
  chAlpha: 1,
  chLength: 6,
  chThick: 2,
  chGap: 3,
  chDot: false,
  chDotSize: 2,
  chOutline: true,
  chOutlineColor: '#000000',
  targetColor: '#26d9ff',
  hoverColor: '#ffe14d',
  decoyColor: '#ff4d5e',
  hpBars: true,
  effects: true,
  hitmarker: true,
  volume: 60,
  hitSound: 'tick',
  killSound: 'pop',
  missSound: 'none',
  shootSound: 'click',
  spawnSound: true,
  trackSound: true,
  theme: 'lab',
  wallColor: THEMES[0].wall,
  gridColor: THEMES[0].grid,
  floorColor: THEMES[0].floor,
  renderScale: 1,
  antialias: true,
  hud: true,
  showFps: false,
  fullscreen: true,
  countdown: 3,
}

const KEYS = {
  settings: 'tn.settings',
  runs: 'tn.runs',
  custom: 'tn.custom',
  playlists: 'tn.playlists',
  react: 'tn.react',
  cal: 'tn.cal',
} as const

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // hết chỗ hoặc bị chặn: chấp nhận mất lần lưu này
  }
}

/** Ghép giá trị đã lưu lên mặc định; trường nào sai kiểu thì lấy mặc định. */
export function merge<T extends object>(defaults: T, saved: unknown): T {
  const out = { ...defaults }
  if (saved && typeof saved === 'object')
    for (const k of Object.keys(defaults) as (keyof T)[]) {
      const v = (saved as Record<string, unknown>)[k as string]
      if (typeof v === typeof defaults[k] && (typeof v !== 'number' || Number.isFinite(v))) out[k] = v as T[keyof T]
    }
  return out
}

// Các trường chỉ nhận một số giá trị; giá trị lạ (ví dụ từ file sao lưu bị sửa) thì lấy mặc định.
const SFX: Sfx[] = ['none', 'tick', 'pop', 'ding', 'thud', 'click']
const CHOICES: Partial<Record<keyof Settings, readonly string[]>> = {
  fovType: ['v', 'h43', 'h169'],
  chStyle: ['cross', 't', 'dot', 'circle'],
  hitSound: SFX,
  killSound: SFX,
  missSound: SFX,
  shootSound: ['none', 'click', 'gun'],
  theme: THEMES.map((t) => t.id),
}
const COLOR = /^#[0-9a-f]{6}$/i

export function loadSettings(): Settings {
  const s = merge(DEFAULT_SETTINGS, load(KEYS.settings, {}))
  for (const k of Object.keys(s) as (keyof Settings)[]) {
    const v = s[k]
    const ok = CHOICES[k] ? CHOICES[k].includes(v as string) : typeof v !== 'string' || k === 'game' || COLOR.test(v)
    if (!ok) (s as unknown as Record<string, unknown>)[k] = DEFAULT_SETTINGS[k]
  }
  return s
}
export const saveSettings = (s: Settings) => save(KEYS.settings, s)

const RUN_NUMBERS = ['date', 'score', 'acc', 'kills', 'shots', 'hits', 'time', 'kps', 'ttk', 'rt', 'expired', 'decoys', 'cm360'] as const
const numOr = <T>(v: unknown, fallback: T) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

/** Lượt chơi đọc từ bộ nhớ hoặc file sao lưu: ép đúng kiểu số trước khi đem ra hiển thị. */
function cleanRun(r: Record<string, unknown>): RunResult {
  const out = { task: String(r.task) } as Record<string, unknown>
  for (const k of RUN_NUMBERS) out[k] = numOr(r[k], 0)
  out.gain = numOr(r.gain, null)
  out.err = numOr(r.err, null)
  out.regions = Array.from({ length: 9 }, (_, i) => numOr(Array.isArray(r.regions) ? r.regions[i] : null, null))
  out.timeline = Array.isArray(r.timeline) ? r.timeline.slice(0, 200).map((v) => numOr(v, 0)) : []
  return out as unknown as RunResult
}

export const loadRuns = (): RunResult[] => {
  const runs = load<unknown>(KEYS.runs, [])
  return Array.isArray(runs)
    ? runs.filter((r) => r && typeof r.task === 'string' && typeof r.score === 'number').map(cleanRun)
    : []
}
export function addRun(r: RunResult) {
  save(KEYS.runs, [...loadRuns(), r])
}

export const loadCustom = (): Task[] => {
  const list = load<unknown>(KEYS.custom, [])
  return (Array.isArray(list) ? list : [])
    .filter((t) => t && typeof t.id === 'string' && typeof t.name === 'string')
    .map((t) => ({
      id: t.id,
      name: t.name,
      desc: typeof t.desc === 'string' ? t.desc : '',
      skills: t.skills && typeof t.skills === 'object' ? t.skills : { flick: 1 },
      params: cleanParams(t.params),
      custom: true,
    }))
}
export const saveCustom = (list: Task[]) => save(KEYS.custom, list)

export const loadPlaylists = (): Playlist[] => load<Playlist[]>(KEYS.playlists, [])
export const savePlaylists = (list: Playlist[]) => save(KEYS.playlists, list)

/** Lịch sử bài test phản xạ: mỗi phần tử là thời gian phản xạ (ms) của một lượt 5 lần bấm. */
export const loadReact = (): { date: number; times: number[] }[] => load(KEYS.react, [])
export const addReact = (times: number[]) => save(KEYS.react, [...loadReact(), { date: Date.now(), times }])

export const loadCal = (): Record<string, number[]> => load(KEYS.cal, {})
export const saveCal = (cal: Record<string, number[]>) => save(KEYS.cal, cal)

const BACKUP_KEYS = ['settings', 'runs', 'custom', 'playlists', 'react'] as const

export function exportAll(): string {
  const data: Record<string, unknown> = { app: 'tam-ngam', version: 1 }
  for (const k of BACKUP_KEYS) data[k] = load(KEYS[k], null)
  return JSON.stringify(data)
}

/** Nạp lại bản sao lưu. Trả về false nếu file không phải bản sao lưu của app. */
export function importAll(json: string): boolean {
  let data: Record<string, unknown>
  try {
    data = JSON.parse(json)
  } catch {
    return false
  }
  if (!data || data.app !== 'tam-ngam') return false
  for (const k of BACKUP_KEYS) if (data[k] != null) save(KEYS[k], data[k])
  return true
}

export function resetAll() {
  try {
    for (const k of Object.values(KEYS)) localStorage.removeItem(k)
  } catch {
    // bỏ qua
  }
}
