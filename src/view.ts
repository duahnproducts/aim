// Vẽ phòng tập và mục tiêu bằng Three.js. Chỉ đọc trạng thái từ Game, không tự sinh logic.
import {
  BackSide,
  BoxGeometry,
  CanvasTexture,
  CapsuleGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three'
import type { Game, Target, TaskParams } from './game'
import { vFov } from './sens'
import type { Settings } from './store'

const D2R = Math.PI / 180
const CELL = 2

/** Phòng tối thiểu 70×30×70, sàn dưới mắt 2 m; nới ra đủ chứa mọi chỗ mục tiêu của bài có thể tới,
 *  để không quả nào chìm vào sàn hay tường (mục tiêu luôn nằm trong ±spreadY và xa tối đa distance + jitter). */
export function roomFor(p: TaskParams) {
  const reach = p.distance + p.distanceJitter
  const r = p.radius * (1 + p.sizeJitter) * (p.adaptive === 'size' ? 1.6 : 1) + p.height / 2
  const y = reach * Math.sin(Math.min(90, p.spreadY) * D2R) + r + 0.5
  const half = Math.max(35, reach + r + 1)
  const floor = Math.min(-2, -y)
  return { w: half * 2, d: half * 2, h: Math.max(30, y - floor), floor }
}

function gridTexture(wall: string, grid: string, rx: number, ry: number): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = wall
  g.fillRect(0, 0, 64, 64)
  g.strokeStyle = grid
  g.lineWidth = 3
  g.strokeRect(0, 0, 64, 64)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(rx, ry)
  t.anisotropy = 8
  return t
}

const targetMaterial = (color: string, opacity = 1) =>
  new MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.35,
    roughness: 0.35,
    metalness: 0.05,
    transparent: opacity < 1,
    opacity,
  })

interface Item {
  group: Group
  body: Mesh
  bar: Group
  fill: Mesh
  key: string
}

export class View {
  readonly renderer: WebGLRenderer
  readonly scene = new Scene()
  readonly camera = new PerspectiveCamera(70, 1, 0.05, 400)
  private sphere = new SphereGeometry(1, 40, 24)
  private capsules = new Map<string, CapsuleGeometry>()
  private barGeo = new PlaneGeometry(1, 1)
  private barBg = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthTest: false })
  private barFg = new MeshBasicMaterial({ color: 0x6dff8a, depthTest: false })
  private mats = {
    normal: targetMaterial('#26d9ff'),
    hover: targetMaterial('#ffe14d'),
    decoy: targetMaterial('#ff4d5e'),
    ghost: targetMaterial('#26d9ff', 0.28),
    flash: new MeshStandardMaterial({ color: '#ffffff', emissive: '#fff6c8', emissiveIntensity: 1.2 }),
  }
  private room: Mesh
  private items = new Map<number, Item>()
  private pops: { mesh: Mesh; t0: number; r: number }[] = []
  private settings: Settings | null = null

  constructor(
    readonly canvas: HTMLCanvasElement,
    antialias: boolean,
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias, powerPreference: 'high-performance' })
    this.camera.rotation.order = 'YXZ'
    this.scene.add(new HemisphereLight(0xffffff, 0x404040, 2.2))
    const sun = new DirectionalLight(0xffffff, 1.6)
    sun.position.set(5, 12, 6)
    this.scene.add(sun)
    this.room = new Mesh()
    this.scene.add(this.room)
  }

  setup(s: Settings, p: TaskParams) {
    this.settings = s
    this.mats.normal.color.set(s.targetColor)
    this.mats.normal.emissive.set(s.targetColor)
    this.mats.hover.color.set(s.hoverColor)
    this.mats.hover.emissive.set(s.hoverColor)
    this.mats.decoy.color.set(s.decoyColor)
    this.mats.decoy.emissive.set(s.decoyColor)
    this.mats.ghost.color.set(s.targetColor)
    this.mats.ghost.emissive.set(s.targetColor)
    const old = this.room.material
    for (const m of Array.isArray(old) ? old : [old]) {
      ;(m as MeshBasicMaterial).map?.dispose()
      m.dispose()
    }
    const { w, h, d, floor: y0 } = roomFor(p)
    const cell = CELL
    this.room.geometry.dispose()
    this.room.geometry = new BoxGeometry(w, h, d)
    this.room.position.y = y0 + h / 2
    const wall = (rx: number, ry: number) =>
      new MeshBasicMaterial({ map: gridTexture(s.wallColor, s.gridColor, rx / cell, ry / cell), side: BackSide })
    const floor = new MeshBasicMaterial({ map: gridTexture(s.floorColor, s.gridColor, w / cell, d / cell), side: BackSide })
    // thứ tự mặt của BoxGeometry: +x, -x, +y, -y, +z, -z
    this.room.material = [wall(d, h), wall(d, h), wall(w, d), floor, wall(w, h), wall(w, h)]
    this.renderer.setPixelRatio(Math.min(3, window.devicePixelRatio * s.renderScale))
    this.camera.fov = vFov(s.fov, s.fovType)
    this.resize()
  }

  resize() {
    const w = window.innerWidth
    const h = window.innerHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  /** Hiệu ứng vỡ khi hạ mục tiêu. */
  pop(o: Target, now: number) {
    if (!this.settings?.effects) return
    const mat = new MeshBasicMaterial({ color: this.settings.targetColor, transparent: true, opacity: 0.55, depthWrite: false })
    const mesh = new Mesh(this.sphere, mat)
    mesh.position.copy(o.pos)
    this.scene.add(mesh)
    this.pops.push({ mesh, t0: now, r: o.radius })
  }

  draw(game: Game, yaw: number, pitch: number, hover: Target | null, now: number) {
    const s = this.settings!
    this.camera.rotation.set(pitch * D2R, -yaw * D2R, 0)
    const alive = new Set<number>()
    const bars = s.hpBars && (game.p.hp > 1 || game.p.weapon === 'track')
    for (const o of game.targets) {
      alive.add(o.id)
      const it = this.item(o)
      it.group.position.copy(o.pos)
      it.body.material = o.decoy
        ? this.mats.decoy
        : game.p.weapon === 'dodge'
          ? this.mats.flash
          : game.p.ghost
          ? this.mats.ghost
          : o === hover
            ? this.mats.hover
            : this.mats.normal
      it.bar.visible = bars && !o.decoy
      if (it.bar.visible) {
        const width = Math.max(0.6, o.radius * 2)
        const frac = Math.max(0, o.hp / o.maxHp)
        it.bar.position.y = o.radius + o.half + 0.3
        it.bar.quaternion.copy(this.camera.quaternion)
        it.bar.scale.set(width, 0.12, 1)
        it.fill.scale.set(frac, 1, 1)
        it.fill.position.x = (frac - 1) / 2
      }
    }
    for (const [id, it] of this.items)
      if (!alive.has(id)) {
        this.scene.remove(it.group)
        this.items.delete(id)
      }
    this.pops = this.pops.filter((p) => {
      const k = (now - p.t0) / 180
      if (k >= 1) {
        this.scene.remove(p.mesh)
        ;(p.mesh.material as MeshBasicMaterial).dispose()
        return false
      }
      p.mesh.scale.setScalar(p.r * (1 + 0.9 * k))
      ;(p.mesh.material as MeshBasicMaterial).opacity = 0.55 * (1 - k)
      return true
    })
    this.renderer.render(this.scene, this.camera)
  }

  clear() {
    for (const it of this.items.values()) this.scene.remove(it.group)
    this.items.clear()
    for (const p of this.pops) this.scene.remove(p.mesh)
    this.pops = []
  }

  private item(o: Target): Item {
    const key = o.half > 0 ? `${o.radius.toFixed(3)}:${o.half.toFixed(3)}` : 's'
    let it = this.items.get(o.id)
    if (it && it.key === key) {
      if (key === 's') it.body.scale.setScalar(o.radius)
      return it
    }
    if (it) this.scene.remove(it.group)
    let geo = this.sphere as SphereGeometry | CapsuleGeometry
    if (o.half > 0) {
      geo = this.capsules.get(key) ?? new CapsuleGeometry(o.radius, o.half * 2, 8, 24)
      this.capsules.set(key, geo as CapsuleGeometry)
    }
    const body = new Mesh(geo, this.mats.normal)
    if (key === 's') body.scale.setScalar(o.radius)
    const bar = new Group()
    const bg = new Mesh(this.barGeo, this.barBg)
    const fill = new Mesh(this.barGeo, this.barFg)
    bg.renderOrder = 10
    fill.renderOrder = 11
    bar.add(bg, fill)
    const group = new Group()
    group.add(body, bar)
    this.scene.add(group)
    it = { group, body, bar, fill, key }
    this.items.set(o.id, it)
    return it
  }
}
