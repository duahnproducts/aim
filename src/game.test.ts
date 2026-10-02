import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { DEFAULT_PARAMS, Game, angleBetween, dir, rayDist, type TaskParams } from './game'
import { BUILTIN } from './tasks'

const params = (p: Partial<TaskParams>): TaskParams => ({ ...DEFAULT_PARAMS, ...p })
const task = (id: string) => BUILTIN.find((t) => t.id === id)!.params
const aimAt = (v: Vector3) => v.clone().normalize()
const FORWARD = new Vector3(0, 0, -1)

describe('hình học', () => {
  it('dir() quay đúng chiều: yaw dương sang phải, pitch dương lên trên', () => {
    expect(dir(0, 0).distanceTo(FORWARD)).toBeLessThan(1e-9)
    expect(dir(90, 0).x).toBeCloseTo(1, 9)
    expect(dir(0, 90).y).toBeCloseTo(1, 9)
  })

  it('rayDist đo khoảng cách từ tâm ngắm tới quả cầu và viên thuốc', () => {
    expect(rayDist(FORWARD, new Vector3(0, 0, -10), 0)[0]).toBeCloseTo(0, 9)
    expect(rayDist(FORWARD, new Vector3(0.5, 0, -10), 0)[0]).toBeCloseTo(0.5, 6)
    // viên thuốc cao: ngắm lệch lên 0.6 m vẫn nằm trên thân (nửa dài 0.8)
    expect(rayDist(FORWARD, new Vector3(0, -0.6, -10), 0.8)[0]).toBeCloseTo(0, 6)
    expect(rayDist(FORWARD, new Vector3(0, -1.2, -10), 0.8)[0]).toBeCloseTo(0.4, 6)
    // mục tiêu sau lưng không bao giờ bị trúng
    expect(rayDist(FORWARD, new Vector3(0, 0, 10), 0)[0]).toBeGreaterThan(5)
  })
})

describe('Gridshot', () => {
  it('luôn có 3 mục tiêu, mỗi quả một ô, quả mới không hiện lại đúng ô vừa bắn', () => {
    const g = new Game(task('gridshot'), 3)
    for (let i = 0; i < 50; i++) {
      expect(g.targets).toHaveLength(3)
      expect(new Set(g.targets.map((o) => o.cell)).size).toBe(3)
      const o = g.targets[0]
      g.trigger(true, aimAt(o.pos))
      g.trigger(false, aimAt(o.pos))
      expect(g.targets.find((x) => x.cell === o.cell)).toBeUndefined()
      g.update(0.1, aimAt(o.pos))
    }
    expect(g.kills).toHaveLength(50)
    expect(g.accuracy).toBe(1)
  })

  it('bắn trượt làm giảm độ chính xác và điểm', () => {
    const g = new Game(task('gridshot'), 3)
    const o = g.targets[0]
    g.trigger(true, aimAt(o.pos))
    const full = g.score
    g.trigger(true, dir(0, 80))
    expect(g.shots.map((s) => s.hit)).toEqual([true, false])
    expect(g.accuracy).toBe(0.5)
    expect(g.score).toBeLessThan(full)
  })
})

describe('tính điểm', () => {
  it('hạ ngay được 200 điểm, chậm hơn mốc refTime chỉ còn 100', () => {
    const fast = new Game(params({ refTime: 600, accWeight: 1 }), 1)
    fast.trigger(true, aimAt(fast.targets[0].pos))
    expect(fast.kills[0].points).toBe(200)

    const slow = new Game(params({ refTime: 600, accWeight: 1 }), 1)
    slow.update(0.9, dir(0, 80))
    slow.trigger(true, aimAt(slow.targets[0].pos))
    expect(slow.kills[0].points).toBe(100)
  })

  it('hết giờ thì dừng đúng mốc thời gian', () => {
    const g = new Game(params({ duration: 2 }), 1)
    for (let i = 0; i < 10; i++) g.update(0.3, FORWARD)
    expect(g.done).toBe(true)
    expect(g.t).toBeCloseTo(2, 9)
  })
})

describe('Reflexshot: mục tiêu có hạn sống', () => {
  it('để lỡ thì tính là expired và lần sau sống lâu hơn; hạ được thì lần sau ngắn hơn', () => {
    const g = new Game(task('reflexshot'), 5)
    const away = dir(0, 80)
    while (!g.targets.length) g.update(0.05, away)
    const life = g.lifetime
    while (g.targets.length) g.update(0.05, away)
    expect(g.expired).toBe(1)
    expect(g.lifetime).toBeGreaterThan(life)
    while (!g.targets.length) g.update(0.05, away)
    const longer = g.lifetime
    g.trigger(true, aimAt(g.targets[0].pos))
    expect(g.kills).toHaveLength(1)
    expect(g.lifetime).toBeLessThan(longer)
  })

  it('kết thúc sau đúng 30 mục tiêu', () => {
    const g = new Game(task('reflexshot'), 5)
    for (let i = 0; i < 5000 && !g.done; i++) g.update(0.05, dir(0, 80))
    expect(g.done).toBe(true)
    expect(g.kills.length + g.expired).toBe(30)
  })
})

describe('tracking', () => {
  it('giữ tâm trên mục tiêu thì tích thời gian, đủ máu thì hạ', () => {
    const g = new Game(params({ weapon: 'track', hp: 1, duration: 10 }), 2)
    const first = g.targets[0]
    for (let i = 0; i < 8 && g.targets.includes(first); i++) g.update(0.25, aimAt(first.pos))
    expect(g.kills).toHaveLength(1)
    expect(g.onTime).toBeCloseTo(1, 6)
    expect(g.accuracy).toBeCloseTo(1, 6)
    g.update(1, dir(0, 80))
    expect(g.accuracy).toBeCloseTo(0.5, 6)
  })

  it('holdToTrack: không giữ chuột thì không tính gì', () => {
    const g = new Game(params({ weapon: 'track', holdToTrack: true }), 2)
    g.update(0.5, aimAt(g.targets[0].pos))
    expect(g.activeTime).toBe(0)
    g.trigger(true, aimAt(g.targets[0].pos))
    g.update(0.5, aimAt(g.targets[0].pos))
    expect(g.onTime).toBeCloseTo(0.5, 6)
  })
})

describe('các luật đặc biệt', () => {
  it('bắn nhầm đồng đội bị trừ điểm và không tính trúng', () => {
    let seed = 1
    const mixed = () => new Game(params({ decoys: 0.5, count: 4, accWeight: 0 }), seed)
    while (!(mixed().targets.some((o) => o.decoy) && mixed().targets.some((o) => !o.decoy))) seed++
    const g = mixed()
    g.trigger(true, aimAt(g.targets.find((o) => !o.decoy)!.pos))
    const before = g.score
    expect(before).toBe(200)
    const decoy = g.targets.find((o) => o.decoy)!
    g.trigger(true, aimAt(decoy.pos))
    expect(g.decoyHits).toBe(1)
    expect(g.shots.at(-1)!.hit).toBe(false)
    expect(g.score).toBeLessThan(before)
  })

  it('né flash: quay lưng quá 90° là thoát', () => {
    const g = new Game(task('flash-dodge'), 6)
    while (!g.targets.length) g.update(0.05, FORWARD)
    const o = g.targets[0]
    expect(angleBetween(FORWARD, o.pos)).toBeLessThan(90)
    g.update(0.05, aimAt(o.pos).negate())
    expect(g.kills).toHaveLength(1)
  })

  it('Spidershot luân phiên giữa tâm và vòng ngoài', () => {
    const g = new Game(task('spidershot'), 8)
    const where: boolean[] = []
    for (let i = 0; i < 6; i++) {
      const o = g.targets[0]
      where.push(o.yaw === 0 && o.pitch === 0)
      g.trigger(true, aimAt(o.pos))
    }
    expect(where).toEqual([true, false, true, false, true, false])
  })

  it('Multishot: dọn sạch đợt cũ mới ra đợt mới', () => {
    const g = new Game(task('multishot'), 9)
    expect(g.targets).toHaveLength(5)
    for (let i = 0; i < 4; i++) g.trigger(true, aimAt(g.targets[0].pos))
    expect(g.targets).toHaveLength(1)
    g.trigger(true, aimAt(g.targets[0].pos))
    expect(g.targets).toHaveLength(5)
  })

  it('súng tự động bắn đúng tốc độ khi giữ chuột', () => {
    const g = new Game(params({ weapon: 'auto', fireRate: 10, hp: 1000 }), 1)
    const at = aimAt(g.targets[0].pos)
    g.trigger(true, at)
    for (let i = 0; i < 10; i++) g.update(0.1, at)
    expect(g.shots).toHaveLength(11) // phát đầu lúc nhấn + 10 phát trong 1 giây
    g.trigger(false, at)
    g.update(1, at)
    expect(g.shots).toHaveLength(11)
  })

  it('mục tiêu hồi máu khi thôi bị bắn', () => {
    const g = new Game(params({ hp: 4, regen: 2 }), 1)
    const o = g.targets[0]
    g.trigger(true, aimAt(o.pos))
    g.trigger(true, aimAt(o.pos))
    expect(o.hp).toBe(2)
    g.update(2, dir(0, 80))
    expect(o.hp).toBe(4)
  })

  it('mục tiêu di chuyển không ra khỏi vùng xuất hiện', () => {
    const g = new Game(task('motionshot'), 10)
    for (let i = 0; i < 600; i++) {
      g.update(1 / 60, dir(0, 80))
      for (const o of g.targets) {
        expect(Math.abs(o.yaw)).toBeLessThanOrEqual(g.p.spreadX + 1e-9)
        expect(Math.abs(o.pitch)).toBeLessThanOrEqual(g.p.spreadY + 1e-9)
      }
    }
  })
})

describe('phân tích phát bắn', () => {
  it('bắn vượt qua mục tiêu theo hướng flick thì along > 0 (overshoot)', () => {
    const g = new Game(params({ spreadX: 20, spreadY: 0, minGap: 10 }), 3)
    const o = g.targets[0]
    // từ tâm (0,0) flick sang mục tiêu, dừng lố thêm 1.5 bán kính theo cùng hướng
    const over = dir(o.yaw + Math.sign(o.yaw) * 1.5 * (Math.atan(o.radius / o.dist) * 180) / Math.PI, 0)
    g.trigger(true, over)
    expect(g.shots[0].along).toBeGreaterThan(1)
    expect(g.shots[0].hit).toBe(false)
  })

  it('result() đủ các trường và không có NaN', () => {
    const g = new Game(task('gridshot'), 3)
    for (let i = 0; i < 20; i++) {
      g.trigger(true, aimAt(g.targets[0].pos))
      g.update(0.25, aimAt(g.targets[0].pos))
    }
    const r = g.result('gridshot', 40)
    expect(r.kills).toBe(20)
    expect(r.regions).toHaveLength(9)
    expect(r.timeline.length).toBe(1)
    for (const v of [r.score, r.acc, r.kps, r.ttk, r.rt]) expect(Number.isFinite(v)).toBe(true)
  })
})
