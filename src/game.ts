// Lõi một lượt chơi: sinh mục tiêu, cho chúng di chuyển, xử lý phát bắn và tính điểm.
// Không đụng tới DOM hay WebGL, nên chạy được trong test và cho người chơi ảo (bot.ts).
//
// Người chơi đứng ở gốc toạ độ, nhìn về -Z. Vị trí mục tiêu lưu bằng góc (yaw sang phải,
// pitch lên trên, đơn vị độ) cộng khoảng cách (m): giữ kích thước góc ổn định dù ở đâu.
import { Vector3 } from 'three'

export type Weapon = 'click' | 'auto' | 'track' | 'dodge'
export type Spawn = 'grid' | 'random' | 'spider'
export type Motion = 'static' | 'strafe' | 'fly' | 'erratic' | 'circle'
export type Adaptive = 'none' | 'size' | 'time'

export interface TaskParams {
  duration: number // giây; 0 = chơi tới khi đủ targetLimit
  targetLimit: number // số mục tiêu của cả bài; 0 = không giới hạn
  count: number // số mục tiêu cùng lúc
  waves: boolean // hạ hết cả đợt mới ra đợt mới
  radius: number // m
  height: number // m, phần thân của viên thuốc (0 = quả cầu)
  sizeJitter: number // 0..1, dao động kích thước
  distance: number // m
  distanceJitter: number // ± m
  spawn: Spawn
  cols: number
  rows: number
  spreadX: number // nửa góc ngang của vùng xuất hiện (độ); 180 = quanh người
  spreadY: number // nửa góc dọc (độ)
  minGap: number // độ; mục tiêu mới cách tâm ngắm ít nhất bấy nhiêu
  weapon: Weapon
  hp: number // click/auto: số phát; track: số giây ngắm trúng
  fireRate: number // phát/giây khi giữ chuột (auto)
  holdToTrack: boolean // track: phải giữ chuột mới gây sát thương
  regen: number // máu hồi mỗi giây khi thôi bị bắn
  motion: Motion
  speed: number // m/s
  turnMin: number // giây giữa hai lần đổi hướng
  turnMax: number
  orbit: number // độ, bán kính vòng tròn (motion = circle)
  lifetime: number // ms mục tiêu tồn tại; 0 = mãi mãi
  spawnDelay: number // ms chờ trước khi mục tiêu mới hiện
  adaptive: Adaptive
  decoys: number // 0..1, tỉ lệ mục tiêu "đồng đội" không được bắn
  ghost: boolean // mục tiêu mờ, khó thấy
  refTime: number // ms; hạ nhanh hơn mốc này thì được thưởng điểm
  accWeight: number // điểm cuối = điểm gốc × độ chính xác ^ accWeight
}

export const DEFAULT_PARAMS: TaskParams = {
  duration: 60,
  targetLimit: 0,
  count: 1,
  waves: false,
  radius: 0.45,
  height: 0,
  sizeJitter: 0,
  distance: 10,
  distanceJitter: 0,
  spawn: 'random',
  cols: 4,
  rows: 4,
  spreadX: 15,
  spreadY: 10,
  minGap: 0,
  weapon: 'click',
  hp: 1,
  fireRate: 10,
  holdToTrack: false,
  regen: 0,
  motion: 'static',
  speed: 0,
  turnMin: 0.4,
  turnMax: 1.2,
  orbit: 6,
  lifetime: 0,
  spawnDelay: 0,
  adaptive: 'none',
  decoys: 0,
  ghost: false,
  refTime: 600,
  accWeight: 1,
}

export interface Target {
  id: number
  yaw: number
  pitch: number
  dist: number
  pos: Vector3
  radius: number
  half: number // nửa chiều dài thân viên thuốc
  hp: number
  maxHp: number
  born: number
  expires: number
  decoy: boolean
  heading: number // hướng đi trên mặt phẳng góc: 0 = sang phải, 90 = lên
  w: number // tốc độ góc, độ/giây
  turnRate: number // độ heading/giây (fly, circle)
  turnAt: number
  cell: number
  lastHit: number
}

/** dx, dy: độ lệch phát bắn so với tâm mục tiêu, tính bằng bán kính mục tiêu (x phải, y lên).
 *  along: lệch dọc theo hướng vừa flick — dương là vượt quá, âm là chưa tới. */
export interface Shot {
  t: number
  hit: boolean
  dx: number
  dy: number
  along: number
}

export interface Kill {
  t: number
  ttk: number // giây, từ lúc mục tiêu sẵn sàng tới lúc hạ
  yaw: number
  pitch: number
  points: number
}

export interface GameEvent {
  kind: 'spawn' | 'hit' | 'kill' | 'miss' | 'expire' | 'decoy'
  target?: Target
}

export interface RunResult {
  task: string
  date: number
  score: number
  acc: number // 0..1; bài tracking là tỉ lệ thời gian bám trúng
  kills: number
  shots: number
  hits: number
  time: number // giây đã chơi
  kps: number
  ttk: number // ms trung bình mỗi lần hạ
  rt: number // ms trung vị mỗi lần hạ
  expired: number
  decoys: number
  gain: number | null // > 0: hay vượt quá, < 0: hay chưa tới
  err: number | null // độ lệch trung bình của phát bắn, đơn vị bán kính
  regions: (number | null)[] // 3×3 ô, ms trung bình mỗi lần hạ (hàng trên trước)
  timeline: number[] // mỗi 5 giây: số lần hạ, hoặc % bám trúng với bài tracking
  cm360: number
}

const D2R = Math.PI / 180
const UP = new Vector3(0, 1, 0)
const FORWARD = new Vector3(0, 0, -1)
export const BUCKET = 5

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
export const wrap180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

export function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function dir(yaw: number, pitch: number, out = new Vector3()): Vector3 {
  const cp = Math.cos(pitch * D2R)
  return out.set(Math.sin(yaw * D2R) * cp, Math.sin(pitch * D2R), -Math.cos(yaw * D2R) * cp)
}

export const angles = (v: Vector3): [number, number] => [
  Math.atan2(v.x, -v.z) / D2R,
  Math.atan2(v.y, Math.hypot(v.x, v.z)) / D2R,
]

export const angleBetween = (a: Vector3, b: Vector3) =>
  Math.acos(clamp(a.dot(b) / (a.length() * b.length() || 1), -1, 1)) / D2R

/** Bán kính góc (độ) của mục tiêu. */
export const angRadius = (o: Target) => Math.asin(Math.min(1, o.radius / o.dist)) / D2R

export function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const _a = new Vector3()
const _p = new Vector3()

/** Khoảng cách ngắn nhất từ tia (gốc 0, hướng d đơn vị) tới đoạn thẳng đứng tâm c, nửa dài h.
 *  Trả về [khoảng cách, vị trí dọc theo tia]. h = 0 thì là quả cầu. */
export function rayDist(d: Vector3, c: Vector3, h: number): [number, number] {
  _a.set(c.x, c.y - h, c.z)
  const B = d.y * 2 * h // d·e, với e = (0, 2h, 0)
  const C = 4 * h * h // e·e
  const D = d.dot(_a)
  const E = 2 * h * _a.y // e·a
  let u = C > 0 ? clamp((D * B - E) / (C - B * B || 1e-9), 0, 1) : 0
  const s = Math.max(0, D + u * B)
  if (C > 0) u = clamp((s * B - E) / C, 0, 1)
  _p.copy(d).multiplyScalar(s).sub(_a)
  _p.y -= u * 2 * h
  return [_p.length(), s]
}

export class Game {
  t = 0
  targets: Target[] = []
  shots: Shot[] = []
  kills: Kill[] = []
  events: GameEvent[] = []
  hits = 0
  expired = 0
  decoyHits = 0
  onTime = 0 // giây ngắm trúng (tracking)
  activeTime = 0 // giây có mục tiêu để bám (tracking)
  onTarget = false
  firing = false
  done = false
  lifetime: number
  sizeScale = 1
  readonly aim = new Vector3(0, 0, -1)
  readonly tl = { kills: [] as number[], on: [] as number[], active: [] as number[] }
  private base = 0
  private nextId = 1
  private spawned = 0
  private pending: number[] = []
  private lastKill = 0
  private lastCell = -1
  private nextShot = 0
  private outer = true
  private flickFrom: Vector3 | null = FORWARD.clone()
  private rnd: () => number

  constructor(
    readonly p: TaskParams,
    seed = 1,
  ) {
    this.rnd = mulberry32(seed)
    this.lifetime = p.lifetime
    this.refill()
  }

  get accuracy(): number {
    const w = this.p.weapon
    if (w === 'track') return this.activeTime > 0 ? this.onTime / this.activeTime : 0
    if (w === 'dodge') {
      const n = this.kills.length + this.expired
      return n ? this.kills.length / n : 0
    }
    return this.shots.length ? this.hits / this.shots.length : 0
  }

  get score(): number {
    const w = this.p.weapon
    const started = w === 'track' ? this.activeTime > 0 : w === 'dodge' || this.shots.length > 0
    const acc = started ? this.accuracy : 1
    return Math.max(0, Math.round(this.base * Math.pow(acc, this.p.accWeight)))
  }

  /** Mục tiêu nằm dưới tâm ngắm (gần nhất theo chiều sâu), nếu có. */
  pick(aim: Vector3): Target | null {
    let best: Target | null = null
    let bestS = Infinity
    for (const o of this.targets) {
      const [d, s] = rayDist(aim, o.pos, o.half)
      if (d <= o.radius && s < bestS) {
        best = o
        bestS = s
      }
    }
    return best
  }

  update(dt: number, aim: Vector3) {
    if (this.done) return
    const p = this.p
    if (p.duration > 0) dt = Math.min(dt, p.duration - this.t)
    dt = Math.max(0, dt)
    this.aim.copy(aim)
    this.t += dt
    const due = this.pending.filter((at) => at <= this.t)
    this.pending = this.pending.filter((at) => at > this.t)
    due.forEach(() => this.spawn())
    for (const o of [...this.targets]) {
      this.move(o, dt)
      if (p.regen > 0 && o.hp < o.maxHp && this.t - o.lastHit > 0.4) o.hp = Math.min(o.maxHp, o.hp + p.regen * dt)
      if (this.t >= o.expires) this.expire(o)
    }
    this.onTarget = false
    if (p.weapon === 'track') this.track(dt, aim)
    else if (p.weapon === 'dodge') {
      for (const o of [...this.targets]) if (!o.decoy && angleBetween(aim, o.pos) > 90) this.kill(o)
    } else if (p.weapon === 'auto' && this.firing) {
      while (this.nextShot <= this.t + 1e-9 && !this.done) {
        this.nextShot += 1 / p.fireRate
        this.fire(aim)
      }
    }
    if (p.duration > 0 && this.t >= p.duration - 1e-9) this.done = true
    if (p.targetLimit > 0 && this.kills.length + this.expired >= p.targetLimit) this.done = true
  }

  /** Nhấn (down = true) hoặc nhả chuột trái. */
  trigger(down: boolean, aim: Vector3) {
    this.firing = down
    if (!down || this.done) return
    this.aim.copy(aim)
    if (this.p.weapon === 'click') this.fire(aim)
    else if (this.p.weapon === 'auto' && this.nextShot <= this.t) {
      this.nextShot = this.t + 1 / this.p.fireRate
      this.fire(aim)
    }
  }

  result(task: string, cm360: number): RunResult {
    const k = this.kills
    const ttks = k.map((x) => x.ttk * 1000)
    const along = this.shots.map((s) => s.along).filter(Number.isFinite)
    const err = this.shots.map((s) => Math.hypot(s.dx, s.dy)).filter(Number.isFinite)
    const X = Math.max(1, Math.min(this.p.spreadX, 180)) / 3
    const Y = Math.max(1, this.p.spreadY) / 3
    const cells: number[][] = Array.from({ length: 9 }, () => [])
    for (const x of k) {
      const col = x.yaw < -X ? 0 : x.yaw > X ? 2 : 1
      const row = x.pitch > Y ? 0 : x.pitch < -Y ? 2 : 1
      cells[row * 3 + col].push(x.ttk * 1000)
    }
    const n = Math.max(1, Math.ceil(this.t / BUCKET))
    const track = this.p.weapon === 'track'
    const timeline = Array.from({ length: n }, (_, i) =>
      track ? (this.tl.active[i] ? (this.tl.on[i] ?? 0) / this.tl.active[i] : 0) : (this.tl.kills[i] ?? 0),
    )
    return {
      task,
      date: Date.now(),
      score: this.score,
      acc: this.accuracy,
      kills: k.length,
      shots: this.shots.length,
      hits: this.hits,
      time: this.t,
      kps: this.t > 0 ? k.length / this.t : 0,
      ttk: Math.round(mean(ttks)),
      rt: Math.round(median(ttks)),
      expired: this.expired,
      decoys: this.decoyHits,
      gain: along.length >= 3 ? mean(along) : null,
      err: err.length ? mean(err) : null,
      regions: cells.map((c) => (c.length ? Math.round(mean(c)) : null)),
      timeline,
      cm360,
    }
  }

  // ---------------------------------------------------------------------------

  private get bucket() {
    return Math.min(Math.floor(this.t / BUCKET), 999)
  }

  /** Bù cho đủ số mục tiêu (hoặc hẹn giờ cho chúng xuất hiện). */
  private refill() {
    const p = this.p
    if (this.done) return
    if (p.waves && (this.targets.some((o) => !o.decoy) || this.pending.length)) return
    const live = this.targets.length + this.pending.length
    const delay = (p.spawnDelay / 1000) * (0.5 + this.rnd())
    for (let i = live; i < p.count; i++) {
      if (p.targetLimit > 0 && this.spawned + this.pending.length >= p.targetLimit) return
      if (p.spawnDelay > 0) this.pending.push(this.t + (p.waves ? delay : (p.spawnDelay / 1000) * (0.5 + this.rnd())))
      else this.spawn()
    }
  }

  private spawn() {
    const p = this.p
    const r = this.rnd
    const decoy = p.decoys > 0 && r() < p.decoys
    const radius = p.radius * this.sizeScale * (1 + p.sizeJitter * (r() * 2 - 1))
    const dist = Math.max(2, p.distance + p.distanceJitter * (r() * 2 - 1))
    const o: Target = {
      id: this.nextId++,
      yaw: 0,
      pitch: 0,
      dist,
      pos: new Vector3(),
      radius,
      half: p.height / 2,
      hp: p.hp,
      maxHp: p.hp,
      born: this.t,
      expires: this.lifetime > 0 ? this.t + this.lifetime / 1000 : decoy ? this.t + 1.5 : Infinity,
      decoy,
      heading: r() < 0.5 ? 0 : 180,
      w: p.speed / dist / D2R,
      turnRate: 0,
      turnAt: 0,
      cell: -1,
      lastHit: -1,
    }
    this.place(o)
    if (p.motion === 'fly' || p.motion === 'erratic') o.heading = r() * 360
    if (p.motion === 'circle') o.turnRate = ((r() < 0.5 ? 1 : -1) * o.w) / Math.max(0.5, p.orbit) / D2R
    o.turnAt = this.t + this.turnDelay()
    if (!decoy) this.spawned++
    this.targets.push(o)
    if (!decoy && this.targets.filter((x) => !x.decoy).length === 1) this.flickFrom = this.aim.clone()
    this.events.push({ kind: 'spawn', target: o })
  }

  private place(o: Target) {
    const p = this.p
    const r = this.rnd
    if (p.spawn === 'grid') {
      const used = new Set(this.targets.map((x) => x.cell))
      const free: number[] = []
      for (let i = 0; i < p.cols * p.rows; i++) if (!used.has(i) && i !== this.lastCell) free.push(i)
      const cell = free.length ? free[Math.floor(r() * free.length)] : Math.floor(r() * p.cols * p.rows)
      o.cell = cell
      o.yaw = p.cols > 1 ? -p.spreadX + (2 * p.spreadX * (cell % p.cols)) / (p.cols - 1) : 0
      o.pitch = p.rows > 1 ? p.spreadY - (2 * p.spreadY * Math.floor(cell / p.cols)) / (p.rows - 1) : 0
    } else {
      const spider = p.spawn === 'spider'
      if (spider) this.outer = !this.outer
      // Né flash: tính quanh hướng đang nhìn, vì người chơi vừa quay lưng lại lượt trước.
      const [baseYaw] = p.weapon === 'dodge' ? angles(this.aim) : [0]
      const ang = Math.asin(Math.min(1, o.radius / o.dist)) / D2R
      if (spider && !this.outer) {
        o.yaw = 0
        o.pitch = 0
      } else
        for (let i = 0; i < 40; i++) {
          o.yaw = wrap180(baseYaw + p.spreadX * (r() * 2 - 1))
          o.pitch = p.spreadY * (r() * 2 - 1)
          dir(o.yaw, o.pitch, o.pos)
          if (angleBetween(o.pos, spider ? FORWARD : this.aim) < p.minGap) continue
          if (this.targets.some((x) => angleBetween(o.pos, x.pos) < (ang + angRadius(x)) * 1.3)) continue
          break
        }
    }
    dir(o.yaw, o.pitch, o.pos).multiplyScalar(o.dist)
  }

  private turnDelay() {
    return this.p.turnMin + (this.p.turnMax - this.p.turnMin) * this.rnd()
  }

  private move(o: Target, dt: number) {
    const p = this.p
    if (p.motion === 'static' || o.w <= 0) return
    if (this.t >= o.turnAt) {
      this.turn(o)
      o.turnAt = this.t + this.turnDelay()
    }
    o.heading += o.turnRate * dt
    const h = o.heading * D2R
    o.yaw += (Math.cos(h) * o.w * dt) / Math.max(0.3, Math.cos(o.pitch * D2R))
    o.pitch += Math.sin(h) * o.w * dt
    if (p.spreadX >= 180) o.yaw = wrap180(o.yaw)
    else if (Math.abs(o.yaw) > p.spreadX) {
      o.yaw = Math.sign(o.yaw) * p.spreadX
      o.heading = 180 - o.heading
    }
    if (Math.abs(o.pitch) > p.spreadY) {
      o.pitch = Math.sign(o.pitch) * p.spreadY
      o.heading = -o.heading
    }
    dir(o.yaw, o.pitch, o.pos).multiplyScalar(o.dist)
  }

  private turn(o: Target) {
    const p = this.p
    const r = this.rnd
    const base = p.speed / o.dist / D2R
    if (p.motion === 'strafe') {
      if (r() < 0.75) o.heading = 180 - o.heading
      o.w = base * (0.6 + 0.4 * r())
    } else if (p.motion === 'erratic') {
      o.heading = r() * 360
      o.w = base * (0.5 + 0.7 * r())
    } else if (p.motion === 'fly') o.turnRate = (r() * 2 - 1) * 120
    else if (p.motion === 'circle' && r() < 0.5) o.turnRate = -o.turnRate
  }

  private track(dt: number, aim: Vector3) {
    if (!this.targets.some((o) => !o.decoy)) return
    if (this.p.holdToTrack && !this.firing) return
    const b = this.bucket
    this.activeTime += dt
    this.tl.active[b] = (this.tl.active[b] ?? 0) + dt
    const o = this.pick(aim)
    if (!o) return
    if (o.decoy) {
      this.base = Math.max(0, this.base - 100 * dt)
      return
    }
    this.onTarget = true
    this.onTime += dt
    this.tl.on[b] = (this.tl.on[b] ?? 0) + dt
    this.base += 100 * dt
    o.hp -= dt
    o.lastHit = this.t
    if (o.hp <= 0) this.kill(o)
  }

  private fire(aim: Vector3) {
    const o = this.pick(aim)
    const near = o && !o.decoy ? o : this.nearest(aim)
    const shot: Shot = { t: this.t, hit: !!o && !o.decoy, dx: NaN, dy: NaN, along: NaN }
    if (near) Object.assign(shot, this.offsets(aim, near))
    this.flickFrom = null
    this.shots.push(shot)
    if (!o) {
      if (this.p.adaptive === 'size') this.sizeScale = Math.min(1.6, this.sizeScale * 1.06)
      this.events.push({ kind: 'miss' })
      return
    }
    if (o.decoy) {
      this.decoyHits++
      this.base = Math.max(0, this.base - 150)
      this.remove(o)
      this.events.push({ kind: 'decoy', target: o })
      this.refill()
      return
    }
    this.hits++
    o.hp -= 1
    o.lastHit = this.t
    this.events.push({ kind: 'hit', target: o })
    if (o.hp <= 1e-9) this.kill(o)
  }

  private nearest(aim: Vector3): Target | null {
    let best: Target | null = null
    let bestA = Infinity
    for (const o of this.targets) {
      const a = angleBetween(aim, o.pos)
      if (!o.decoy && a < bestA) {
        best = o
        bestA = a
      }
    }
    return best
  }

  private offsets(aim: Vector3, o: Target) {
    const T = o.pos.clone().normalize()
    const right = new Vector3().crossVectors(T, UP)
    if (right.lengthSq() < 1e-9) right.set(1, 0, 0)
    right.normalize()
    const up = new Vector3().crossVectors(right, T)
    const ang = angRadius(o) * D2R
    const proj = (v: Vector3) => [Math.atan2(v.dot(right), v.dot(T)) / ang, Math.atan2(v.dot(up), v.dot(T)) / ang]
    const [dx, dy] = proj(aim)
    let along = NaN
    if (this.flickFrom) {
      const [fx, fy] = proj(this.flickFrom)
      const len = Math.hypot(fx, fy)
      if (len > 2) along = -(dx * fx + dy * fy) / len
    }
    return { dx, dy, along }
  }

  private kill(o: Target) {
    this.remove(o)
    const ttk = this.t - Math.max(o.born, this.lastKill)
    const pts =
      this.p.weapon === 'track' ? 50 : Math.round(100 * (1 + clamp(1 - (ttk * 1000) / this.p.refTime, 0, 1)))
    this.base += pts
    this.kills.push({ t: this.t, ttk, yaw: o.yaw, pitch: o.pitch, points: pts })
    const b = this.bucket
    this.tl.kills[b] = (this.tl.kills[b] ?? 0) + 1
    this.lastKill = this.t
    this.lastCell = o.cell
    this.flickFrom = this.aim.clone()
    if (this.p.adaptive === 'time') this.lifetime = Math.max(300, this.lifetime * 0.95)
    if (this.p.adaptive === 'size') this.sizeScale = Math.max(0.35, this.sizeScale * 0.97)
    this.events.push({ kind: 'kill', target: o })
    if (this.p.targetLimit > 0 && this.kills.length + this.expired >= this.p.targetLimit) this.done = true
    this.refill()
  }

  private expire(o: Target) {
    this.remove(o)
    if (!o.decoy) {
      this.expired++
      if (this.p.adaptive === 'time') this.lifetime = Math.min(2500, this.lifetime * 1.12)
    }
    this.events.push({ kind: 'expire', target: o })
    if (this.p.targetLimit > 0 && this.kills.length + this.expired >= this.p.targetLimit) this.done = true
    this.refill()
  }

  private remove(o: Target) {
    const i = this.targets.indexOf(o)
    if (i >= 0) this.targets.splice(i, 1)
  }
}
