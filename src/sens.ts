// Độ nhạy chuột và FOV. Mọi game quy về cùng một đại lượng: số độ quay cho mỗi
// "count" chuột. Hệ số yaw = số độ quay mỗi count khi sens = 1.

export interface Game {
  id: string
  name: string
  yaw: number
}

// Nguồn: các bảng quy đổi công khai (mouse-sensitivity.com, senslab.pro, sensconverter…).
export const GAMES: Game[] = [
  { id: 'valorant', name: 'Valorant', yaw: 0.07 },
  { id: 'cs2', name: 'Counter-Strike 2 / Aim Lab', yaw: 0.022 },
  { id: 'apex', name: 'Apex Legends', yaw: 0.022 },
  { id: 'ow2', name: 'Overwatch 2', yaw: 0.0066 },
  { id: 'cod', name: 'Call of Duty (MW / Warzone / BO6)', yaw: 0.0066 },
  { id: 'fortnite', name: 'Fortnite (độ nhạy %)', yaw: 0.005555 },
  { id: 'r6', name: 'Rainbow Six Siege', yaw: 0.00572957795 },
  { id: 'rivals', name: 'Marvel Rivals', yaw: 0.0175 },
  { id: 'destiny2', name: 'Destiny 2', yaw: 0.0066 },
  { id: 'tf2', name: 'Team Fortress 2 / Source', yaw: 0.022 },
]

export const gameById = (id: string): Game => GAMES.find((g) => g.id === id) ?? GAMES[0]

export const degPerCount = (game: Game, sens: number) => game.yaw * sens

/** Số cm phải kéo chuột để xoay đủ một vòng 360°. */
export const cmPer360 = (game: Game, sens: number, dpi: number) => (360 / (game.yaw * sens * dpi)) * 2.54

/** Đổi sens giữa hai game sao cho kéo cùng một quãng thì xoay cùng một góc (khớp 360°). */
export const convert360 = (from: Game, sens: number, to: Game, dpiFrom = 1, dpiTo = dpiFrom) =>
  (sens * from.yaw * dpiFrom) / (to.yaw * dpiTo)

// FOV: 'v' = dọc, 'h43' = ngang tính trên khung 4:3 (CS2, Apex), 'h169' = ngang trên 16:9
// (Valorant, Overwatch). Màn rộng hơn thì giữ nguyên FOV dọc (Hor+).
export type FovType = 'v' | 'h43' | 'h169'
const BASE: Record<FovType, number> = { v: 1, h43: 4 / 3, h169: 16 / 9 }
const R = Math.PI / 180

export const vFov = (fov: number, type: FovType) => (2 * Math.atan(Math.tan((fov * R) / 2) / BASE[type])) / R
export const hFov = (vfov: number, aspect: number) => (2 * Math.atan(Math.tan((vfov * R) / 2) * aspect)) / R

/** Hệ số "monitor distance 0%": giữ cảm giác quanh tâm ngắm khi đổi FOV (cùng một kiểu FOV). */
export const focalScale = (fromVfov: number, toVfov: number) => Math.tan((toVfov * R) / 2) / Math.tan((fromVfov * R) / 2)

export const FOV_PRESETS: { name: string; fov: number; type: FovType }[] = [
  { name: 'Valorant 103', fov: 103, type: 'h169' },
  { name: 'CS2 90 (4:3)', fov: 90, type: 'h43' },
  { name: 'Overwatch 103', fov: 103, type: 'h169' },
  { name: 'Apex 90 (4:3)', fov: 90, type: 'h43' },
  { name: 'Apex 104 (4:3)', fov: 104, type: 'h43' },
  { name: 'Apex 110 (4:3)', fov: 110, type: 'h43' },
]
