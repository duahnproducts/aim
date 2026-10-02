// Mọi thứ suy ra từ lịch sử chơi: hạng, điểm kỹ năng, chuỗi ngày tập, lời khuyên, thử thách ngày.
import { thresholds } from './bot'
import { BUCKET, mean, median, type RunResult, type TaskParams } from './game'
import { loadCal, saveCal } from './store'
import { BUILTIN, SKILLS, type Skill, type Task } from './tasks'

export const RANKS = ['Sắt', 'Đồng', 'Bạc', 'Vàng', 'Bạch Kim', 'Kim Cương', 'Cao Thủ', 'Thách Đấu']
export const RANK_COLORS = ['#8d939e', '#c27c48', '#c3cbd6', '#f2c14e', '#3fd6c4', '#6fa3ff', '#c77dff', '#ff5d8f']
export const rankName = (i: number) => (i < 0 ? 'Tập sự' : RANKS[i])
export const rankColor = (i: number) => (i < 0 ? '#5d6470' : RANK_COLORS[i])

// Đổi khi sửa bot hoặc cách tính điểm, để bỏ các mốc cũ đã lưu.
const CAL_VERSION = 1
const memo = new Map<string, number[]>()

function hash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** Mốc điểm của 8 hạng cho một bài. Tính bằng bot một lần rồi nhớ trong localStorage. */
export function ranksFor(p: TaskParams): number[] {
  const key = `${CAL_VERSION}.${hash(JSON.stringify(p))}`
  let T = memo.get(key)
  if (T) return T
  const cal = loadCal()
  T = Array.isArray(cal[key]) && cal[key].length === RANKS.length ? cal[key] : thresholds(p)
  if (!cal[key]) saveCal({ ...cal, [key]: T })
  memo.set(key, T)
  return T
}

/** Điểm xếp hạng 0–900: mỗi hạng 100 điểm, dưới mốc Sắt là 0–100 (Tập sự). */
export function rating(score: number, T: number[]): number {
  if (score < T[0]) return Math.max(0, (100 * score) / T[0])
  for (let i = T.length - 1; i >= 0; i--)
    if (score >= T[i]) {
      const next = T[i + 1] ?? T[i] + (T[i] - (T[i - 1] ?? 0))
      return Math.min(900, 100 * (i + 1) + (100 * (score - T[i])) / (next - T[i]))
    }
  return 0
}

export const rankIndex = (r: number) => Math.min(RANKS.length - 1, Math.floor(r / 100) - 1)

export const runsOf = (runs: RunResult[], task: string) => runs.filter((r) => r.task === task)

export function best(runs: RunResult[], task: string): number | null {
  const own = runsOf(runs, task)
  return own.length ? Math.max(...own.map((r) => r.score)) : null
}

/** Điểm cao nhất trong n lượt gần nhất: hồ sơ kỹ năng phản ánh phong độ hiện tại. */
export function recentBest(runs: RunResult[], task: string, n = 10): number | null {
  const own = runsOf(runs, task).slice(-n)
  return own.length ? Math.max(...own.map((r) => r.score)) : null
}

export function profile(runs: RunResult[], tasks: Task[]): Record<Skill, number | null> {
  const sum: Partial<Record<Skill, [number, number]>> = {}
  for (const task of tasks) {
    const b = recentBest(runs, task.id)
    if (b == null) continue
    const r = rating(b, ranksFor(task.params))
    for (const [k, w] of Object.entries(task.skills) as [Skill, number][]) {
      if (!(k in SKILLS) || !(w > 0)) continue
      const s = (sum[k] ??= [0, 0])
      s[0] += r * w
      s[1] += w
    }
  }
  return Object.fromEntries(
    (Object.keys(SKILLS) as Skill[]).map((k) => [k, sum[k] ? sum[k][0] / sum[k][1] : null]),
  ) as Record<Skill, number | null>
}

export function overall(prof: Record<Skill, number | null>): number | null {
  const vals = Object.values(prof).filter((v): v is number => v != null)
  return vals.length ? mean(vals) : null
}

export function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Số giây đã tập theo từng ngày. */
export function trainingDays(runs: RunResult[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of runs) m.set(dayKey(r.date), (m.get(dayKey(r.date)) ?? 0) + r.time)
  return m
}

/** Số ngày tập liên tiếp tính tới hôm nay (hôm nay chưa tập thì tính tới hôm qua). */
export function streak(runs: RunResult[], now = Date.now()): number {
  const days = trainingDays(runs)
  const d = new Date(now)
  if (!days.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1)
  let n = 0
  while (days.has(dayKey(d.getTime()))) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

/** Bài thử thách của ngày: cố định trong một ngày, đổi sang ngày khác. */
export function dailyTask(now = Date.now()): Task {
  const pool = BUILTIN.filter((t) => !t.hidden)
  return pool[parseInt(hash(dayKey(now)), 36) % pool.length]
}

/** Mục tiêu thử thách: mốc hạng kế tiếp so với kỷ lục hiện tại. */
export function dailyGoal(task: Task, runs: RunResult[]): number {
  const T = ranksFor(task.params)
  const b = best(runs, task.id) ?? 0
  return T.find((x) => x > b) ?? Math.round(b * 1.03)
}

const REGION = ['trên-trái', 'trên', 'trên-phải', 'bên trái', 'giữa', 'bên phải', 'dưới-trái', 'dưới', 'dưới-phải']

/** Lời khuyên rút ra từ một lượt chơi, giống phần "aim analysis" của Aim Lab. */
export function tips(r: RunResult, p: TaskParams): string[] {
  const out: string[] = []
  const pct = (x: number) => `${Math.round(x * 100)}%`
  if (p.weapon === 'track') {
    if (r.acc < 0.55)
      out.push(`Mới bám được ${pct(r.acc)} thời gian. Nhìn vào mục tiêu chứ đừng nhìn tâm; dùng cả cánh tay cho đoạn dài, cổ tay cho chỉnh nhỏ.`)
    else if (r.acc < 0.75)
      out.push(`Bám được ${pct(r.acc)}. Hay mất mục tiêu lúc nó đổi hướng: thả lỏng tay để phản ứng nhanh hơn, đừng ghì chuột.`)
  } else if (p.weapon !== 'dodge') {
    if (r.shots >= 10 && r.acc < 0.75)
      out.push(`Độ chính xác ${pct(r.acc)} còn thấp. Chậm lại một nhịp: chỉ bấm khi tâm đã nằm trên mục tiêu.`)
    if (r.shots >= 20 && r.acc > 0.96)
      out.push(`Chính xác ${pct(r.acc)} — rất chắc tay. Thử đẩy tốc độ lên, chấp nhận trượt thêm chút để hạ nhanh hơn.`)
    if (r.gain != null && r.gain > 0.25)
      out.push('Bạn hay vượt quá mục tiêu (overshoot). Thử giảm sens khoảng 5% hoặc phanh tay sớm hơn.')
    if (r.gain != null && r.gain < -0.25)
      out.push('Bạn hay dừng trước mục tiêu (undershoot). Thử tăng sens khoảng 5% hoặc flick dứt khoát hơn.')
  }
  const cells = r.regions.flatMap((v, i) => (v == null ? [] : [[v, i] as const]))
  if (cells.length >= 4) {
    const m = median(cells.map((c) => c[0]))
    const [slow, i] = cells.reduce((a, b) => (b[0] > a[0] ? b : a))
    if (slow > m * 1.25)
      out.push(`Bạn chậm hơn hẳn ở vùng ${REGION[i]} (${slow} ms so với ${Math.round(m)} ms). Tập thêm flick về phía đó.`)
  }
  const full = r.timeline.slice(0, Math.floor(r.time / BUCKET + 1e-6))
  if (full.length >= 6) {
    const k = Math.floor(full.length / 3)
    if (mean(full.slice(-k)) < mean(full.slice(0, k)) * 0.85)
      out.push('Phong độ giảm về cuối bài. Giữ nhịp thở đều, thả lỏng vai và cổ tay.')
  }
  if (r.decoys > 0) out.push(`Bắn nhầm ${r.decoys} mục tiêu đồng đội. Nhìn màu trước khi bóp cò.`)
  const total = r.kills + r.expired
  if (total > 0 && r.expired / total > 0.25)
    out.push(
      p.weapon === 'dodge'
        ? `Bị flash ${r.expired}/${total} lần. Quay ngay khi thấy flash, đừng chờ nhìn rõ.`
        : `Để lỡ ${r.expired}/${total} mục tiêu. Phản ứng ngay khi thấy chuyển động ở rìa mắt.`,
    )
  if (!out.length) out.push('Lượt chơi đều tay, không có điểm yếu rõ rệt. Giữ phong độ hoặc thử bài khó hơn!')
  return out
}

/** Chọn hệ số sens tốt nhất từ các vòng thử: khớp parabol, lấy đỉnh nếu hợp lý, không thì lấy vòng cao nhất. */
export function bestMultiplier(rounds: { mul: number; score: number }[]): number {
  const top = rounds.reduce((a, b) => (b.score > a.score ? b : a)).mul
  const xs = rounds.map((r) => r.mul)
  const lo = Math.min(...xs)
  const hi = Math.max(...xs)
  // Bình phương tối thiểu cho y = a·x² + b·x + c.
  const S = (f: (x: number, y: number) => number) => rounds.reduce((s, r) => s + f(r.mul, r.score), 0)
  const m = [
    [S((x) => x ** 4), S((x) => x ** 3), S((x) => x ** 2)],
    [S((x) => x ** 3), S((x) => x ** 2), S((x) => x)],
    [S((x) => x ** 2), S((x) => x), rounds.length],
  ]
  const v = [S((x, y) => x * x * y), S((x, y) => x * y), S((_, y) => y)]
  const det = (a: number[][]) =>
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
    a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
    a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0])
  const D = det(m)
  if (rounds.length < 3 || Math.abs(D) < 1e-12) return top
  const col = (j: number) => m.map((row, i) => row.map((x, k) => (k === j ? v[i] : x)))
  const a = det(col(0)) / D
  const b = det(col(1)) / D
  if (a >= 0) return top
  return Math.min(hi, Math.max(lo, -b / (2 * a)))
}
