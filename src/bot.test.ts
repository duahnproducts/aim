import { describe, expect, it } from 'vitest'
import { LEVELS, runBot, thresholds } from './bot'
import { BUILTIN } from './tasks'

describe('người chơi ảo', () => {
  it.each(BUILTIN.map((t) => [t.id, t] as const))('chơi trọn bài %s và ra kết quả hợp lệ', (_, task) => {
    const r = runBot(task.params, LEVELS[3])
    expect(r.score).toBeGreaterThan(0)
    expect(r.kills).toBeGreaterThan(0)
    for (const v of [r.score, r.acc, r.kps, r.ttk, r.time]) expect(Number.isFinite(v)).toBe(true)
    if (task.params.duration > 0) expect(r.time).toBeCloseTo(task.params.duration, 6)
  })

  it('trình độ cao hơn thì điểm cao hơn', () => {
    for (const id of ['gridshot', 'strafetrack', 'reflexshot', 'switchtrack']) {
      const p = BUILTIN.find((t) => t.id === id)!.params
      expect(runBot(p, LEVELS[7]).score).toBeGreaterThan(runBot(p, LEVELS[0]).score * 1.3)
    }
  })

  it('Gridshot: Sắt khoảng 50, Thách Đấu khoảng 150+ lần hạ mỗi phút', () => {
    const p = BUILTIN.find((t) => t.id === 'gridshot')!.params
    expect(runBot(p, LEVELS[0]).kills).toBeGreaterThan(40)
    expect(runBot(p, LEVELS[0]).kills).toBeLessThan(70)
    expect(runBot(p, LEVELS[7]).kills).toBeGreaterThan(140)
  })

  it('mốc hạng luôn tăng dần', () => {
    for (const task of BUILTIN) {
      const T = thresholds(task.params)
      expect(T).toHaveLength(8)
      for (let i = 1; i < T.length; i++) expect(T[i]).toBeGreaterThan(T[i - 1])
    }
  })
})
