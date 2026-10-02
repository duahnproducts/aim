// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { RunResult } from './game'
import { bestMultiplier, dailyTask, profile, rankIndex, rating, streak, tips } from './stats'
import { BUILTIN } from './tasks'

const run = (p: Partial<RunResult>): RunResult => ({
  task: 'gridshot', date: Date.now(), score: 1000, acc: 0.9, kills: 50, shots: 55, hits: 50, time: 60, kps: 0.8,
  ttk: 500, rt: 480, expired: 0, decoys: 0, gain: 0, err: 0.5, regions: Array(9).fill(null), timeline: Array(12).fill(5),
  cm360: 40, ...p,
})
const params = (id: string) => BUILTIN.find((t) => t.id === id)!.params

beforeEach(() => localStorage.clear())

describe('hạng', () => {
  const T = [100, 200, 300, 400, 500, 600, 700, 800]

  it('điểm xếp hạng 0–900, mỗi hạng 100', () => {
    expect(rating(50, T)).toBe(50)
    expect(rating(100, T)).toBe(100)
    expect(rating(250, T)).toBe(250)
    expect(rating(800, T)).toBe(800)
    expect(rating(5000, T)).toBe(900)
  })

  it('đổi điểm xếp hạng ra bậc hạng', () => {
    expect(rankIndex(50)).toBe(-1)
    expect(rankIndex(100)).toBe(0)
    expect(rankIndex(450)).toBe(3)
    expect(rankIndex(900)).toBe(7)
  })
})

describe('hồ sơ kỹ năng', () => {
  it('chỉ chấm những kỹ năng có bài đã chơi', () => {
    const prof = profile([run({ task: 'gridshot', score: 15000 })], BUILTIN)
    expect(prof.flick).toBeGreaterThan(0)
    expect(prof.speed).toBe(prof.flick)
    expect(prof.track).toBeNull()
  })
})

describe('chuỗi ngày tập', () => {
  it('đếm số ngày liên tiếp tới hôm nay', () => {
    const now = new Date(2026, 9, 2, 12).getTime()
    const day = 86400000
    expect(streak([run({ date: now }), run({ date: now - day }), run({ date: now - 3 * day })], now)).toBe(2)
    expect(streak([run({ date: now - day }), run({ date: now - 2 * day })], now)).toBe(2) // hôm nay chưa tập vẫn giữ chuỗi
    expect(streak([run({ date: now - 3 * day })], now)).toBe(0)
  })

  it('thử thách ngày cố định trong một ngày', () => {
    const d = new Date(2026, 9, 2, 8).getTime()
    expect(dailyTask(d).id).toBe(dailyTask(d + 3600000).id)
    expect(dailyTask(d).hidden).toBeFalsy()
  })
})

describe('lời khuyên', () => {
  it('nhận ra overshoot, độ chính xác thấp và vùng chậm', () => {
    const regions = [400, 400, 400, 400, 400, 400, 400, 400, 900]
    const t = tips(run({ gain: 0.6, acc: 0.6, shots: 80, regions }), params('gridshot'))
    expect(t.join(' ')).toMatch(/overshoot/)
    expect(t.join(' ')).toMatch(/Độ chính xác 60%/)
    expect(t.join(' ')).toMatch(/dưới-phải/)
  })

  it('nhận ra tụt phong độ cuối bài', () => {
    const t = tips(run({ timeline: [10, 10, 10, 10, 8, 8, 8, 8, 5, 5, 5, 5] }), params('gridshot'))
    expect(t.join(' ')).toMatch(/cuối bài/)
  })

  it('lượt chơi tốt vẫn có một lời khen', () => {
    expect(tips(run({}), params('gridshot'))).toHaveLength(1)
  })

  it('bài tracking nói về tỉ lệ bám', () => {
    expect(tips(run({ acc: 0.4 }), params('strafetrack'))[0]).toMatch(/bám được 40%/i)
  })
})

describe('tìm sens', () => {
  it('lấy đỉnh parabol khi điểm cao nhất nằm giữa', () => {
    const rounds = [0.7, 0.85, 1, 1.15, 1.3].map((mul) => ({ mul, score: 100 - 200 * (mul - 1.1) ** 2 }))
    expect(bestMultiplier(rounds)).toBeCloseTo(1.1, 2)
  })

  it('điểm tăng đều thì chọn vòng cao nhất, không ngoại suy ra ngoài', () => {
    const rounds = [0.7, 0.85, 1, 1.15, 1.3].map((mul) => ({ mul, score: mul * 10 + mul ** 2 }))
    expect(bestMultiplier(rounds)).toBe(1.3)
  })
})
