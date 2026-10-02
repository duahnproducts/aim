// Người chơi ảo. Ngắm theo định luật Fitts (xa hơn, nhỏ hơn thì lâu hơn), có thời gian
// phản xạ, sai số tay và độ trễ khi bám. Bot chơi đúng bằng game.ts như người thật,
// nên điểm của nó ở 8 trình độ trở thành mốc hạng cho MỌI bài, kể cả bài tự tạo.
import { Vector3 } from 'three'
import { Game, angRadius, dir, mulberry32, wrap180, type RunResult, type Target, type TaskParams } from './game'

export interface Level {
  react: number // giây phản xạ khi mục tiêu mới hiện
  a: number // Fitts: MT = a + b·log2(D/W + 1)
  b: number
  noise: number // độ lệch chuẩn điểm dừng, theo bán kính mục tiêu
  lag: number // giây trễ khi bám: bot thấy vị trí và vận tốc mục tiêu của bấy nhiêu giây trước
  click: number // giây tối thiểu giữa hai phát bấm
}

// Sắt → Thách Đấu. Chỉnh sao cho Gridshot ra khoảng 55 → 150 lần hạ/phút.
export const LEVELS: Level[] = [
  { react: 0.34, a: 0.3, b: 0.23, noise: 0.66, lag: 0.26, click: 0.2 },
  { react: 0.31, a: 0.26, b: 0.2, noise: 0.6, lag: 0.22, click: 0.18 },
  { react: 0.28, a: 0.22, b: 0.175, noise: 0.55, lag: 0.185, click: 0.16 },
  { react: 0.255, a: 0.19, b: 0.155, noise: 0.5, lag: 0.155, click: 0.145 },
  { react: 0.235, a: 0.165, b: 0.135, noise: 0.46, lag: 0.13, click: 0.13 },
  { react: 0.215, a: 0.14, b: 0.12, noise: 0.43, lag: 0.105, click: 0.115 },
  { react: 0.195, a: 0.12, b: 0.105, noise: 0.4, lag: 0.085, click: 0.1 },
  { react: 0.18, a: 0.1, b: 0.09, noise: 0.37, lag: 0.065, click: 0.09 },
]

const DT = 1 / 60

interface Plan {
  at: number
  y0: number
  p0: number
  mt: number
  ey: number
  ep: number
}

export function runBot(p: TaskParams, lv: Level, seed = 7): RunResult {
  const g = new Game(p, seed)
  const r = mulberry32(seed * 7919 + 13)
  const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r())
  const aim = new Vector3()
  let yaw = 0
  let pitch = 0
  let tgt: Target | null = null
  let plan: Plan | null = null
  let tracking = false
  let ready = 0
  let ny = 0
  let np = 0
  let hist: [number, number][] = [] // vị trí mục tiêu đang nhắm, mỗi khung hình một mẫu
  const hold = p.weapon === 'auto' || (p.weapon === 'track' && p.holdToTrack)

  // Điểm cần ngắm tới: tâm mục tiêu, hoặc hướng ngược lại nếu là bài né flash.
  const goal = (o: Target): [number, number] => (p.weapon === 'dodge' ? [wrap180(o.yaw + 180), 0] : [o.yaw, o.pitch])

  // Một cú flick: bắt đầu sau `delay`, kéo dài theo Fitts, dừng lệch một chút do sai số tay.
  const makePlan = (o: Target, delay: number): Plan => {
    const [ty, tp] = goal(o)
    const W = p.weapon === 'dodge' ? 90 : 2 * angRadius(o)
    const D = Math.hypot(wrap180(ty - yaw), tp - pitch)
    const e = p.weapon === 'dodge' ? 0 : (lv.noise * W) / 2
    return { at: g.t + delay, y0: yaw, p0: pitch, mt: lv.a + lv.b * Math.log2(D / W + 1), ey: gauss() * e, ep: gauss() * e }
  }

  while (!g.done && g.t < 300) {
    if (!tgt || !g.targets.includes(tgt)) {
      if (g.firing) g.trigger(false, aim)
      tgt = null
      let best = Infinity
      for (const o of g.targets) {
        const d = Math.hypot(wrap180(o.yaw - yaw), o.pitch - pitch)
        if (!o.decoy && d < best) {
          best = d
          tgt = o
        }
      }
      plan = null
      tracking = false
      hist = []
      if (tgt) plan = makePlan(tgt, Math.max(lv.react - (g.t - tgt.born), 0.06))
    }
    if (tgt) {
      const [ty, tp] = goal(tgt)
      const W = 2 * angRadius(tgt)
      hist.push([ty, tp])
      if (tracking && hist.length > 2) {
        // Nhìn thấy mục tiêu trễ `lag` giây, đoán vị trí hiện tại theo vận tốc (và độ cong
        // quỹ đạo nếu chuyển động mượt) lúc đó; tay đi theo vận tốc ấy và kéo dần về điểm đoán.
        const i = Math.max(2, hist.length - 1 - Math.round(lv.lag / DT))
        const [py, pp] = hist[i]
        let vy = wrap180(py - hist[i - 1][0]) / DT
        let vp = (pp - hist[i - 1][1]) / DT
        const ay = (vy - wrap180(hist[i - 1][0] - hist[i - 2][0]) / DT) / DT
        const ap = (vp - (hist[i - 1][1] - hist[i - 2][1]) / DT) / DT
        const ahead = (hist.length - 1 - i) * DT
        if (Math.hypot(ay, ap) < 1000) {
          vy += (ay * ahead) / 2
          vp += (ap * ahead) / 2
        }
        const k = 1 - Math.exp(-DT / 0.08)
        ny += (gauss() * lv.noise * W * 0.35 - ny) * 0.1
        np += (gauss() * lv.noise * W * 0.35 - np) * 0.1
        yaw = wrap180(yaw + vy * DT + wrap180(py + vy * ahead + ny - yaw) * k)
        pitch += vp * DT + (pp + vp * ahead + np - pitch) * k
        if (hold && !g.firing) g.trigger(true, dir(yaw, pitch, aim))
        if (Math.hypot(wrap180(ty - yaw), tp - pitch) > 3 * W) {
          tracking = false
          plan = makePlan(tgt, 0.1)
        }
      } else if (!plan) plan = makePlan(tgt, lv.click)
      else if (g.t >= plan.at) {
        const tau = Math.min(1, (g.t - plan.at) / plan.mt)
        const s = tau * tau * tau * (10 - 15 * tau + 6 * tau * tau)
        yaw = wrap180(plan.y0 + wrap180(ty + plan.ey - plan.y0) * s)
        pitch = plan.p0 + (tp + plan.ep - plan.p0) * s
        if (tau >= 1) {
          if (p.weapon === 'click' && g.t >= ready) {
            g.trigger(true, dir(yaw, pitch, aim))
            g.trigger(false, aim)
            ready = g.t + lv.click
            plan = null
          } else if (p.weapon === 'track' || p.weapon === 'auto') {
            plan = null
            tracking = true
          }
        }
      }
    }
    g.update(DT, dir(yaw, pitch, aim))
  }
  return g.result('bot', 0)
}

/** Điểm của bot ở từng trình độ = mốc điểm của từng hạng. Luôn tăng dần. */
export function thresholds(p: TaskParams): number[] {
  const scores = LEVELS.map((lv) => (runBot(p, lv, 7).score + runBot(p, lv, 11).score) / 2)
  for (let i = 1; i < scores.length; i++) scores[i] = Math.max(scores[i], scores[i - 1] * 1.03 + 1)
  return scores.map(Math.round)
}
