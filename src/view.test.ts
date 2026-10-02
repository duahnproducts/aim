import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { Game, type TaskParams } from './game'
import { BUILTIN, cleanParams } from './tasks'
import { roomFor } from './view'

/** Chơi 40 giây (nhắm vào mục tiêu và bắn), trả về số mục tiêu lọt ra ngoài phòng. */
function outside(p: TaskParams, seed: number) {
  const room = roomFor(p)
  const g = new Game(p, seed)
  const aim = new Vector3(0, 0, -1)
  let bad = 0
  for (let i = 0; i < 60 * 40 && !g.done; i++) {
    g.update(1 / 60, aim)
    for (const o of g.targets) {
      const r = o.radius + o.half
      if (
        o.pos.y - r < room.floor ||
        o.pos.y + r > room.floor + room.h ||
        Math.abs(o.pos.x) + o.radius > room.w / 2 ||
        Math.abs(o.pos.z) + o.radius > room.d / 2
      )
        bad++
    }
    const o = g.targets.find((x) => !x.decoy)
    if (o && i % 30 === 0) {
      if (p.weapon === 'dodge') aim.set(0, 0, 1)
      else {
        aim.copy(o.pos).normalize()
        g.trigger(true, aim)
        g.trigger(false, aim)
      }
    }
  }
  return bad
}

describe('phòng tập', () => {
  it.each(BUILTIN.map((t) => [t.id, t.params] as const))('%s: mục tiêu không chìm vào sàn hay tường', (_, p) => {
    for (const seed of [1, 2, 3]) expect(outside(p, seed)).toBe(0)
  })

  it('bài tự tạo cực đoan vẫn nằm trong phòng', () => {
    const p = cleanParams({ distance: 100, distanceJitter: 50, spreadX: 180, spreadY: 85, motion: 'fly', speed: 20, radius: 3, height: 2 })
    expect(outside(p, 4)).toBe(0)
  })

  it('bài thường giữ nguyên phòng 70×30×70', () => {
    expect(roomFor(BUILTIN.find((t) => t.id === 'microshot')!.params)).toEqual({ w: 70, d: 70, h: 30, floor: -2 })
  })
})
