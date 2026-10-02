// Màn chơi: khoá chuột, đọc chuyển động thô, chạy vòng lặp Game + View, HUD và tâm ngắm.
import { Vector3 } from 'three'
import { gunshot, sfx, spawnBlip, unlockAudio } from './audio'
import { Game, dir, type RunResult, type Target } from './game'
import { cmPer360, degPerCount, gameById } from './sens'
import type { Settings } from './store'
import { summary, type Task } from './tasks'
import { View } from './view'

export interface PlayOptions {
  task: Task
  settings: Settings
  sensMul?: number // tìm sens: nhân sens hiện tại với hệ số này
  label?: string
  onEnd: (r: RunResult | null, g: Game) => void
}

type State = 'ready' | 'countdown' | 'run' | 'paused' | 'done'

interface Session {
  opts: PlayOptions
  game: Game
  state: State
  yaw: number
  pitch: number
  last: number
  countEnd: number
  lockAt: number
  tick: number
  k: number // độ quay mỗi count chuột
}

let stage: HTMLDivElement | null = null
let gl: HTMLCanvasElement
let xh: HTMLCanvasElement
let hud: HTMLDivElement
let ov: HTMLDivElement
let hit: HTMLDivElement
let flash: HTMLDivElement
let fpsEl: HTMLDivElement
let view: View | null = null
let viewAA = true
let cur: Session | null = null
let raf = 0
let frames = 0
let fpsAt = 0
const aimVec = new Vector3()

const fmt = new Intl.NumberFormat('vi-VN')
const aim = (s: Session) => dir(s.yaw, s.pitch, aimVec)
const locked = () => document.pointerLockElement === gl

/** Vẽ tâm ngắm vào canvas (dùng cho cả màn chơi lẫn ô xem trước trong Cài đặt). */
export function drawCrosshair(c: HTMLCanvasElement, s: Settings) {
  const ctx = c.getContext('2d')
  if (!ctx) return
  const k = Math.max(1, Math.round(window.devicePixelRatio || 1)) // bội số nguyên để nét luôn sắc
  c.width = c.clientWidth * k
  c.height = c.clientHeight * k
  const cx = Math.floor(c.width / 2)
  const cy = Math.floor(c.height / 2)
  const L = s.chLength * k
  const T = Math.max(1, s.chThick * k)
  const G = s.chGap * k
  const h = Math.floor(T / 2)
  const rects: [number, number, number, number][] = []
  if (s.chStyle === 'cross' || s.chStyle === 't') {
    rects.push([cx - G - L, cy - h, L, T], [cx + G, cy - h, L, T], [cx - h, cy + G, T, L])
    if (s.chStyle === 'cross') rects.push([cx - h, cy - G - L, T, L])
  }
  if (s.chStyle === 'dot' || s.chDot) {
    const d = Math.max(1, (s.chStyle === 'dot' ? Math.max(s.chDotSize, s.chThick) : s.chDotSize) * k)
    rects.push([cx - Math.floor(d / 2), cy - Math.floor(d / 2), d, d])
  }
  ctx.clearRect(0, 0, c.width, c.height)
  ctx.globalAlpha = s.chAlpha
  if (s.chStyle === 'circle') {
    const r = G + L / 2
    if (s.chOutline) {
      ctx.strokeStyle = s.chOutlineColor
      ctx.lineWidth = T + 2 * k
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.strokeStyle = s.chColor
    ctx.lineWidth = T
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  if (s.chOutline) {
    ctx.fillStyle = s.chOutlineColor
    for (const [x, y, w, hh] of rects) ctx.fillRect(x - k, y - k, w + 2 * k, hh + 2 * k)
  }
  ctx.fillStyle = s.chColor
  for (const [x, y, w, hh] of rects) ctx.fillRect(x, y, w, hh)
}

function build() {
  stage = document.createElement('div')
  stage.id = 'stage'
  stage.hidden = true
  stage.innerHTML = `
    <canvas id="gl"></canvas>
    <canvas id="xh"></canvas>
    <div id="hitmark"></div>
    <div id="flash"></div>
    <div id="hud"></div>
    <div id="fps"></div>
    <div id="ov"></div>`
  document.body.append(stage)
  gl = stage.querySelector('#gl')!
  xh = stage.querySelector('#xh')!
  hud = stage.querySelector('#hud')!
  ov = stage.querySelector('#ov')!
  hit = stage.querySelector('#hitmark')!
  flash = stage.querySelector('#flash')!
  fpsEl = stage.querySelector('#fps')!

  ov.addEventListener('click', (e) => {
    const s = cur
    if (!s) return
    const act = (e.target as HTMLElement).closest('button')?.dataset.act
    if (act === 'quit') return end(null)
    if (act === 'restart') restart()
    if (s.state === 'ready' || s.state === 'paused' || act === 'restart') lock()
  })
  document.addEventListener('pointerlockchange', () => {
    const s = cur
    if (!s) return
    if (locked()) {
      s.lockAt = performance.now()
      if (s.state === 'ready') countdown(s)
      else if (s.state === 'paused') {
        s.state = 'run'
        s.last = performance.now()
        overlay()
      }
    } else if (s.state === 'run' || s.state === 'countdown') {
      s.state = 'paused'
      overlay()
    }
  })
  document.addEventListener('pointerlockerror', () => {
    if (cur) overlay('Trình duyệt chưa cho khoá chuột. Đợi một giây rồi bấm lại.')
  })
  document.addEventListener('mousemove', (e) => {
    const s = cur
    if (!s || !locked() || (s.state !== 'run' && s.state !== 'countdown')) return
    // Chrome đôi khi gửi một cú nhảy lớn ngay lúc vừa khoá chuột.
    if (performance.now() - s.lockAt < 50) return
    const st = s.opts.settings
    s.yaw += e.movementX * s.k
    if (s.yaw > 180) s.yaw -= 360
    else if (s.yaw < -180) s.yaw += 360
    s.pitch = Math.max(-89, Math.min(89, s.pitch - e.movementY * s.k * st.ySens * (st.invertY ? -1 : 1)))
  })
  document.addEventListener('mousedown', (e) => {
    const s = cur
    if (!s || !locked() || s.state !== 'run' || e.button !== 0) return
    step(s, Math.max(s.last, e.timeStamp))
    s.game.trigger(true, aim(s))
    if (s.game.p.weapon === 'click' || s.game.p.weapon === 'auto') gunshot(s.opts.settings.shootSound, s.opts.settings.volume)
    drain(s, performance.now())
  })
  document.addEventListener('mouseup', (e) => {
    if (cur && e.button === 0) cur.game.trigger(false, aim(cur))
  })
  document.addEventListener('keydown', (e) => {
    if (!cur || cur.state === 'done') return
    if (e.code === 'KeyR') {
      restart()
      if (locked()) countdown(cur)
    }
  })
  window.addEventListener('resize', () => {
    if (!cur) return
    view?.resize()
    drawCrosshair(xh, cur.opts.settings)
  })
}

function overlay(msg = '') {
  const s = cur
  if (!s) return
  const t = s.opts.task
  ov.hidden = s.state === 'run' || s.state === 'done'
  if (s.state === 'ready')
    ov.innerHTML = `<div class="ov-box">
      ${s.opts.label ? `<div class="ov-label">${s.opts.label}</div>` : ''}
      <h2>${escapeHtml(t.name)}</h2><p>${escapeHtml(summary(t.params))}</p>
      <p class="ov-cta">Nhấn chuột để bắt đầu</p>
      <p class="ov-keys">Esc: tạm dừng · R: chơi lại</p>
      ${msg ? `<p class="ov-warn">${msg}</p>` : ''}
      <button data-act="quit" class="ghost">Thoát</button></div>`
  else if (s.state === 'paused')
    ov.innerHTML = `<div class="ov-box"><h2>Tạm dừng</h2>
      ${msg ? `<p class="ov-warn">${msg}</p>` : ''}
      <div class="row"><button data-act="resume">Tiếp tục</button><button data-act="restart" class="ghost">Chơi lại (R)</button><button data-act="quit" class="ghost">Thoát</button></div></div>`
  else if (s.state === 'countdown') ov.innerHTML = `<div class="ov-count"></div>`
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function lock() {
  unlockAudio()
  const st = cur?.opts.settings
  if (st?.fullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {})
  // unadjustedMovement: đọc chuyển động thô, bỏ qua gia tốc chuột của Windows.
  const req = (opts?: { unadjustedMovement: boolean }) =>
    (gl.requestPointerLock as (o?: object) => Promise<void> | void).call(gl, opts)
  try {
    const p = st?.rawInput ? req({ unadjustedMovement: true }) : req()
    if (p && typeof p.catch === 'function')
      p.catch(async (err: DOMException) => {
        try {
          // Máy không hỗ trợ đọc thô thì khoá chuột kiểu thường.
          if (err?.name === 'NotSupportedError') return await req()
        } catch {
          // rơi xuống thông báo bên dưới
        }
        overlay('Trình duyệt chưa cho khoá chuột. Đợi một giây rồi bấm lại.')
      })
  } catch {
    req()
  }
}

function countdown(s: Session) {
  const n = s.opts.settings.countdown
  s.state = n > 0 ? 'countdown' : 'run'
  s.countEnd = performance.now() + n * 1000
  s.last = performance.now()
  overlay()
}

function newGame(task: Task) {
  return new Game(task.params, (Math.random() * 2 ** 31) | 0)
}

function restart() {
  const s = cur
  if (!s) return
  s.game = newGame(s.opts.task)
  s.yaw = 0
  s.pitch = 0
  view?.clear()
  s.state = 'ready'
  overlay()
}

function step(s: Session, now: number) {
  const dt = Math.min(0.1, Math.max(0, (now - s.last) / 1000))
  s.last = now
  s.game.update(dt, aim(s))
}

function drain(s: Session, now: number) {
  const st = s.opts.settings
  for (const ev of s.game.events.splice(0)) {
    if (ev.kind === 'spawn' && st.spawnSound && s.game.p.spawnDelay > 0) spawnBlip(st.volume)
    else if (ev.kind === 'hit' && ev.target!.hp > 1e-9) {
      sfx(st.hitSound, st.volume)
      marker('hit')
    } else if (ev.kind === 'kill') {
      sfx(st.killSound, st.volume)
      view?.pop(ev.target as Target, now)
      if (s.game.p.weapon !== 'track') marker('kill')
    } else if (ev.kind === 'miss') sfx(st.missSound, st.volume)
    else if (ev.kind === 'decoy') {
      sfx('thud', st.volume)
      marker('bad')
    } else if (ev.kind === 'expire' && s.game.p.weapon === 'dodge' && !ev.target?.decoy) {
      flash.classList.remove('on')
      void flash.offsetWidth
      flash.classList.add('on')
    }
  }
  if (s.game.onTarget && st.trackSound && now - s.tick > 90) {
    s.tick = now
    sfx('tick', st.volume * 0.6)
  }
}

function marker(kind: 'hit' | 'kill' | 'bad') {
  if (!cur?.opts.settings.hitmarker) return
  hit.className = ''
  void hit.offsetWidth
  hit.className = `on ${kind}`
}

// Chỉ đổi chữ khi số thay đổi: dựng lại HTML mỗi khung hình làm khung hình giật.
function renderHud(s: Session) {
  const g = s.game
  const p = g.p
  const vals = [
    p.duration > 0 ? `${Math.max(0, p.duration - g.t).toFixed(1)}s` : String(Math.max(0, p.targetLimit - g.kills.length - g.expired)),
    fmt.format(g.score),
    `${(g.accuracy * 100).toFixed(1)}%`,
    String(g.kills.length),
  ]
  hud.querySelectorAll('b').forEach((b, i) => {
    if (b.textContent !== vals[i]) b.textContent = vals[i]
  })
}

function frame(now: number) {
  const s = cur
  if (!s || !view) return
  raf = requestAnimationFrame(frame)
  if (s.state === 'countdown') {
    const left = Math.ceil((s.countEnd - now) / 1000)
    const box = ov.querySelector('.ov-count')
    if (box) box.textContent = String(Math.max(1, left))
    if (now >= s.countEnd) {
      s.state = 'run'
      s.last = now
      overlay()
    }
  }
  if (s.state === 'run') step(s, now)
  drain(s, now)
  // Đổi màu khi tâm nằm trên mục tiêu chỉ ở bài bám/xả đạn. Ở bài bấm bắn, gợi ý này
  // dễ tập ra thói quen chờ đổi màu rồi mới bắn.
  const w = s.game.p.weapon
  const hover = (w === 'track' || w === 'auto') && (s.state === 'run' || s.state === 'countdown') ? s.game.pick(aim(s)) : null
  view.draw(s.game, s.yaw, s.pitch, hover, now)
  renderHud(s)
  frames++
  if (now - fpsAt > 500) {
    fpsEl.textContent = `${Math.round((frames * 1000) / (now - fpsAt))} FPS`
    frames = 0
    fpsAt = now
  }
  if (s.game.done && s.state === 'run') end(s.game)
}

function end(game: Game | null) {
  const s = cur
  if (!s) return
  s.state = 'done'
  cancelAnimationFrame(raf)
  cur = null
  if (locked()) document.exitPointerLock()
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  view?.clear()
  stage!.hidden = true
  const st = s.opts.settings
  const cm = cmPer360(gameById(st.game), st.sens * (s.opts.sensMul ?? 1), st.dpi) / st.mouseScale
  s.opts.onEnd(game ? game.result(s.opts.task.id, Math.round(cm * 10) / 10) : null, s.game)
}

export function play(opts: PlayOptions) {
  if (!stage) build()
  const st = opts.settings
  if (!view || viewAA !== st.antialias) {
    // Bật/tắt khử răng cưa cần tạo lại WebGL context.
    view?.renderer.dispose()
    if (view) {
      const fresh = gl.cloneNode() as HTMLCanvasElement
      gl.replaceWith(fresh)
      gl = fresh
    }
    view = new View(gl, st.antialias)
    viewAA = st.antialias
  }
  stage!.hidden = false
  hud.hidden = !st.hud
  fpsEl.hidden = !st.showFps
  const w = opts.task.params.weapon
  hud.innerHTML = [
    opts.task.params.duration > 0 ? 'Còn lại' : 'Mục tiêu còn',
    'Điểm',
    w === 'track' ? 'Bám trúng' : w === 'dodge' ? 'Né được' : 'Chính xác',
    'Hạ',
  ]
    .map((label) => `<div><b></b><span>${label}</span></div>`)
    .join('')
  view.setup(st)
  drawCrosshair(xh, st)
  hit.className = ''
  flash.className = ''
  cur = {
    opts,
    game: newGame(opts.task),
    state: 'ready',
    yaw: 0,
    pitch: 0,
    last: performance.now(),
    countEnd: 0,
    lockAt: 0,
    tick: 0,
    k: degPerCount(gameById(st.game), st.sens * (opts.sensMul ?? 1)) * st.mouseScale,
  }
  overlay()
  fpsAt = performance.now()
  raf = requestAnimationFrame(frame)
}

/** Dừng lượt đang chơi (ví dụ khi người dùng bấm Back của trình duyệt). */
export function stop() {
  if (cur) end(null)
}

export const playing = () => cur !== null

// Chỉ ở bản dev: cho phép điều khiển lượt chơi từ console khi không khoá được chuột
// (trình duyệt nhúng để kiểm thử). Bản build loại bỏ đoạn này.
if (import.meta.env.DEV)
  Object.assign(window, {
    __tn: {
      get session() {
        return cur
      },
      start: () => cur && countdown(cur),
    },
  })
