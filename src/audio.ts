// Âm thanh tổng hợp bằng WebAudio: không cần file, không có độ trễ tải.
import type { Sfx } from './store'

let ctx: AudioContext | null = null
let noise: AudioBuffer | null = null

function ac(): AudioContext | null {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number) {
  const a = ac()
  if (!a || vol <= 0) return
  const t = a.currentTime
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.setValueAtTime(f0, t)
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur)
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(a.destination)
  o.start(t)
  o.stop(t + dur + 0.02)
}

function burst(dur: number, vol: number, cutoff: number) {
  const a = ac()
  if (!a || vol <= 0) return
  if (!noise) {
    noise = a.createBuffer(1, a.sampleRate * 0.3, a.sampleRate)
    const d = noise.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  const t = a.currentTime
  const src = a.createBufferSource()
  const f = a.createBiquadFilter()
  const g = a.createGain()
  src.buffer = noise
  f.type = 'lowpass'
  f.frequency.value = cutoff
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(a.destination)
  src.start(t)
  src.stop(t + dur + 0.02)
}

/** volume: 0..100 */
export function sfx(kind: Sfx, volume: number) {
  const v = volume / 100
  if (kind === 'tick') tone('square', 2200, 2200, 0.035, 0.08 * v)
  else if (kind === 'pop') tone('sine', 950, 280, 0.09, 0.45 * v)
  else if (kind === 'ding') tone('triangle', 1320, 1320, 0.25, 0.35 * v)
  else if (kind === 'thud') tone('sine', 160, 60, 0.13, 0.5 * v)
  else if (kind === 'click') tone('square', 420, 200, 0.03, 0.12 * v)
}

export function gunshot(kind: 'none' | 'click' | 'gun', volume: number) {
  const v = volume / 100
  if (kind === 'click') tone('square', 300, 120, 0.025, 0.07 * v)
  else if (kind === 'gun') burst(0.12, 0.35 * v, 2400)
}

/** Tiếng "bíp" khi mục tiêu xuất hiện, giúp bài phản xạ công bằng hơn. */
export const spawnBlip = (volume: number) => tone('sine', 700, 700, 0.05, 0.1 * (volume / 100))

/** Gọi trong một thao tác của người dùng để trình duyệt cho phép phát âm thanh. */
export const unlockAudio = () => void ac()
