// Các màn hình menu: thư viện bài, kết quả, lộ trình, thống kê, công cụ, tạo bài, cài đặt.
// Mỗi màn là một hàm dựng HTML rồi gắn sự kiện; điều hướng bằng #hash để nút Back hoạt động.
import { gunshot, sfx } from './audio'
import { bars, calendar, gauge, heat, line, radar, scatter } from './charts'
import { DEFAULT_PARAMS, mean, type RunResult, type Shot, type TaskParams } from './game'
import { drawCrosshair, escapeHtml as esc, play, stop } from './play'
import { FOV_PRESETS, GAMES, cmPer360, convert360, gameById, hFov, vFov } from './sens'
import {
  RANKS,
  bestMultiplier,
  best,
  dailyGoal,
  dailyTask,
  dayKey,
  overall,
  profile,
  rankColor,
  rankIndex,
  rankName,
  ranksFor,
  rating,
  runsOf,
  streak,
  tips,
  trainingDays,
} from './stats'
import {
  DEFAULT_SETTINGS,
  THEMES,
  addReact,
  addRun,
  exportAll,
  importAll,
  loadCustom,
  loadPlaylists,
  loadReact,
  loadRuns,
  loadSettings,
  resetAll,
  saveCustom,
  savePlaylists,
  saveSettings,
  type Settings,
  type Sfx,
} from './store'
import { BUILTIN, BUILTIN_PLAYLISTS, SKILLS, cleanParams, summary, type Playlist, type Skill, type Task } from './tasks'

interface Last {
  r: RunResult
  task: Task
  shots: Shot[]
  prevBest: number | null
  prevAvg: number | null
}

interface Run {
  list: Playlist
  i: number
  results: RunResult[]
  muls?: number[]
  base?: number // sens lúc bắt đầu tìm sens
}

let app: HTMLElement
let settings: Settings = loadSettings()
let filter = 'all'
let query = ''
let last: Last | null = null
let run: Run | null = null

const fmt = new Intl.NumberFormat('vi-VN')
const pctFmt = new Intl.NumberFormat('vi-VN', { style: 'percent', maximumFractionDigits: 1 })
const pct = (x: number) => pctFmt.format(x)
const num = (x: number, d = 1) => x.toLocaleString('vi-VN', { maximumFractionDigits: d })
const when = (ts: number) => new Date(ts).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = app) => root.querySelector(sel) as T

function go(hash: string) {
  if (location.hash === hash) route()
  else location.hash = hash
}

const allTasks = (): Task[] => [...BUILTIN, ...loadCustom()]
const visibleTasks = () => allTasks().filter((t) => !t.hidden)
const findTask = (id: string) => allTasks().find((t) => t.id === id)
const primary = (t: Task) => (Object.keys(t.skills)[0] ?? 'flick') as Skill
const cm360 = () => cmPer360(gameById(settings.game), settings.sens, settings.dpi) / settings.mouseScale

function rankBadge(r: number, big = false) {
  const i = rankIndex(r)
  return `<span class="rank${big ? ' big' : ''}" style="--rc:${rankColor(i)}">${rankName(i)}</span>`
}
const scoreBadge = (score: number, t: Task) => rankBadge(rating(score, ranksFor(t.params)))

// ---------------------------------------------------------------------------
// Khung trang

const NAV: [string, string][] = [
  ['home', 'Bài tập'],
  ['playlists', 'Lộ trình'],
  ['stats', 'Thống kê'],
  ['tools', 'Công cụ'],
  ['create', 'Tạo bài'],
  ['settings', 'Cài đặt'],
]

const sensLine = () => `${esc(gameById(settings.game).name)} ${settings.sens} · ${settings.dpi} DPI · ${num(cm360())} cm/360`

function shell(active: string, body: string) {
  app.innerHTML = `<header class="top">
    <a class="logo" href="#home"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="11"/><circle cx="16" cy="16" r="2.5" class="fill"/></svg>Tâm Ngắm</a>
    <nav>${NAV.map(([id, label]) => `<a href="#${id}"${id === active ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
    <a class="sensinfo" href="#settings" title="Độ nhạy đang dùng">${sensLine()}</a>
  </header><main class="page">${body}</main>`
  window.scrollTo?.(0, 0)
}

function route() {
  stop() // đổi trang giữa lượt chơi (nút Back) thì dừng lượt đó
  app.hidden = false
  const [page, arg = ''] = location.hash.slice(1).split('/')
  const id = decodeURIComponent(arg)
  if (page === 'task') taskPage(id)
  else if (page === 'result') resultPage()
  else if (page === 'playlists') playlistsPage()
  else if (page === 'playlist') playlistEdit(id)
  else if (page === 'summary') summaryPage()
  else if (page === 'stats') statsPage()
  else if (page === 'tools') toolsPage()
  else if (page === 'create') createPage(id)
  else if (page === 'settings') settingsPage(id)
  else homePage()
}

// ---------------------------------------------------------------------------
// Chơi và ghi kết quả

function playTask(task: Task, extra: { sensMul?: number; label?: string } = {}) {
  app.hidden = true
  play({
    task,
    settings,
    ...extra,
    onEnd: (r, g) => {
      app.hidden = false
      if (!r) {
        run = null
        return
      }
      recordRun(task, r, g.shots)
    },
  })
}

/** Lưu một lượt vừa chơi và chuyển sang màn kết quả (hoặc vòng kế tiếp của lộ trình). */
export function recordRun(task: Task, r: RunResult, shots: Shot[]): void {
  const prev = runsOf(loadRuns(), task.id)
  last = {
    r,
    task,
    shots,
    prevBest: prev.length ? Math.max(...prev.map((x) => x.score)) : null,
    prevAvg: prev.length ? mean(prev.slice(-5).map((x) => x.score)) : null,
  }
  addRun(r)
  if (run) {
    run.results.push(r)
    run.i++
    if (run.muls) {
      // tìm sens: không xem kết quả từng vòng, để người chơi không biết vòng nào sens nào
      if (run.i < run.list.items.length) return playIndex()
      return go('#summary')
    }
  }
  go('#result')
}

function startRun(list: Playlist, muls?: number[]) {
  run = { list, i: 0, results: [], muls, base: settings.sens }
  playIndex()
}

function playIndex(): void {
  if (!run) return
  const { list, i } = run
  const task = findTask(list.items[i])
  if (!task) {
    run.i++
    return run.i < list.items.length ? playIndex() : go('#summary')
  }
  playTask(task, { sensMul: run.muls?.[i], label: `${esc(list.name)} · bài ${i + 1}/${list.items.length}` })
}

// ---------------------------------------------------------------------------
// Thư viện bài

function card(t: Task, runs: RunResult[]) {
  const b = best(runs, t.id)
  return `<article class="card task">
    <a href="#task/${esc(t.id)}" class="stretch"><h3>${esc(t.name)}</h3></a>
    <div class="tags"><span class="tag">${SKILLS[primary(t)] ?? ''}</span>${t.custom ? '<span class="tag mine">Của tôi</span>' : ''}</div>
    <p>${esc(t.desc)}</p>
    <p class="muted small">${esc(summary(t.params))}</p>
    <div class="task-foot">${b == null ? '<span class="muted">Chưa chơi</span>' : `<span>Kỷ lục <b>${fmt.format(b)}</b></span>${scoreBadge(b, t)}`}
      <button data-play="${esc(t.id)}">Chơi</button></div>
  </article>`
}

function homePage() {
  const runs = loadRuns()
  const tasks = visibleTasks()
  const ov = overall(profile(runs, tasks))
  const daily = dailyTask()
  const goal = dailyGoal(daily, runs)
  const today = dayKey(Date.now())
  const doneToday = runs.some((r) => r.task === daily.id && dayKey(r.date) === today && r.score >= goal)
  const minutes = Math.round(runs.reduce((s, r) => s + r.time, 0) / 60)
  const chips: [string, string][] = [['all', 'Tất cả'], ...(Object.entries(SKILLS) as [string, string][]), ['mine', 'Bài của tôi']]
  const shown = () =>
    tasks.filter(
      (t) =>
        (filter === 'all' || (filter === 'mine' ? t.custom : (t.skills[filter as Skill] ?? 0) >= 0.5)) &&
        t.name.toLowerCase().includes(query.trim().toLowerCase()),
    )
  const grid = () => shown().map((t) => card(t, runs)).join('') || '<p class="muted">Không có bài nào khớp.</p>'
  shell(
    'home',
    `<section class="hero">
      <a class="card stat" href="#stats"><span class="muted">Hạng tổng</span>${
        ov == null ? '<b>Chưa xếp hạng</b><small>Chơi vài bài để có hạng</small>' : `${rankBadge(ov, true)}<small>${Math.round(ov)}/900 điểm kỹ năng</small>`
      }</a>
      <div class="card stat"><span class="muted">Chuỗi ngày tập</span><b>${streak(runs)} ngày</b><small>${runs.length} lượt · ${minutes} phút</small></div>
      <div class="card stat daily"><span class="muted">Thử thách hôm nay</span><b>${esc(daily.name)}</b>
        <small>Đạt ${fmt.format(goal)} điểm${doneToday ? ' · <span class="ok">đã hoàn thành</span>' : ''}</small>
        <button data-play="${daily.id}">Chơi</button></div>
    </section>
    <div class="filters">${chips
      .map(([id, label]) => `<button class="chip${filter === id ? ' on' : ''}" data-filter="${id}">${label}</button>`)
      .join('')}
      <input type="search" placeholder="Tìm bài…" value="${esc(query)}" aria-label="Tìm bài">
    </div>
    <div class="grid" id="grid">${grid()}</div>`,
  )
  app.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((b) =>
    b.addEventListener('click', () => {
      filter = b.dataset.filter!
      homePage()
    }),
  )
  $<HTMLInputElement>('input[type=search]').addEventListener('input', (e) => {
    query = (e.target as HTMLInputElement).value
    $('#grid').innerHTML = grid()
  })
}

function taskPage(id: string) {
  const t = findTask(id)
  if (!t) return go('#home')
  const runs = runsOf(loadRuns(), t.id)
  const T = ranksFor(t.params)
  const b = runs.length ? Math.max(...runs.map((r) => r.score)) : null
  const ri = b == null ? -1 : rankIndex(rating(b, T))
  const nextI = b == null ? 0 : T.findIndex((x) => x > b)
  const from = ri >= 0 ? T[ri] : 0
  const progress =
    nextI < 0
      ? '<p class="ok">Đã đạt hạng cao nhất của bài này!</p>'
      : `<div class="progress"><i style="width:${Math.round((100 * ((b ?? 0) - from)) / (T[nextI] - from))}%;background:${rankColor(nextI)}"></i></div>
         <p class="muted small">Còn ${fmt.format(T[nextI] - (b ?? 0))} điểm nữa lên <b style="color:${rankColor(nextI)}">${RANKS[nextI]}</b></p>`
  const recent = runs.slice(-5)
  const minutes = Math.round(runs.reduce((s, r) => s + r.time, 0) / 60)
  shell(
    'home',
    `<a class="back" href="#home">← Thư viện bài</a>
    <div class="task-head">
      <div><h1>${esc(t.name)}</h1>
        <div class="tags">${Object.keys(t.skills).map((k) => `<span class="tag">${SKILLS[k as Skill] ?? esc(k)}</span>`).join('')}${t.custom ? '<span class="tag mine">Của tôi</span>' : ''}</div>
        <p>${esc(t.desc)}</p><p class="muted">${esc(summary(t.params))}</p></div>
      <div class="actions"><button class="big" data-play="${esc(t.id)}">▶ Chơi</button>
        <a class="btn ghost" href="#create/${esc(t.id)}">${t.custom ? 'Sửa bài' : 'Nhân bản & tuỳ chỉnh'}</a>
        ${t.custom ? '<button class="ghost danger" data-del>Xoá bài</button>' : ''}</div>
    </div>
    <section class="cols">
      <div class="card"><h2>Kỷ lục</h2>
        ${b == null ? '<p class="muted">Chưa có lượt nào.</p>' : `<p class="big-num">${fmt.format(b)}</p>${scoreBadge(b, t)}`}
        ${progress}
        <h3>Thang hạng <span class="muted small">(ước lượng bằng người chơi ảo)</span></h3>
        <ol class="ladder">${T.map(
          (x, k) => `<li class="${b != null && b >= x ? 'got' : ''}" style="--rc:${rankColor(k)}"><span>${RANKS[k]}</span><b>${fmt.format(x)}</b></li>`,
        ).join('')}</ol>
      </div>
      <div class="card wide"><h2>Tiến bộ</h2>
        ${line(runs.slice(-40).map((r) => r.score), { marks: T.map((v, k) => ({ v, color: rankColor(k) })), fmt: (v) => fmt.format(Math.round(v)) })}
        <p class="kv">Số lượt <b>${runs.length}</b> · TB 5 lượt gần nhất <b>${recent.length ? fmt.format(Math.round(mean(recent.map((r) => r.score)))) : '—'}</b> · Tổng <b>${minutes} phút</b></p>
        ${
          runs.length
            ? `<table><thead><tr><th>Lúc</th><th>Điểm</th><th>${t.params.weapon === 'track' ? 'Bám' : 'Chính xác'}</th><th>Hạ/giây</th><th>TTK</th></tr></thead><tbody>${runs
                .slice(-10)
                .reverse()
                .map((r) => `<tr><td>${when(r.date)}</td><td>${fmt.format(r.score)}</td><td>${pct(r.acc)}</td><td>${num(r.kps, 2)}</td><td>${r.ttk} ms</td></tr>`)
                .join('')}</tbody></table>`
            : ''
        }
      </div>
    </section>`,
  )
  $('[data-del]')?.addEventListener('click', () => {
    if (!confirm(`Xoá bài "${t.name}"? Lịch sử chơi của bài vẫn giữ lại.`)) return
    saveCustom(loadCustom().filter((x) => x.id !== t.id))
    go('#home')
  })
}

// ---------------------------------------------------------------------------
// Kết quả

function resultPage() {
  if (!last) return go('#home')
  const { r, task, shots, prevBest, prevAvg } = last
  const T = ranksFor(task.params)
  const rt = rating(r.score, T)
  const track = task.params.weapon === 'track'
  const dodge = task.params.weapon === 'dodge'
  const delta = prevAvg ? (r.score - prevAvg) / prevAvg : null
  const stats: [string, string][] = [
    ['Hạ', String(r.kills)],
    [track ? 'Bám trúng' : dodge ? 'Né thành công' : 'Chính xác', pct(r.acc)],
    ['Hạ mỗi giây', num(r.kps, 2)],
  ]
  if (!track) stats.push(['Thời gian hạ TB', `${r.ttk} ms`], ['Trung vị', `${r.rt} ms`])
  if (!track && !dodge) stats.push(['Phát trúng', `${r.hits}/${r.shots}`])
  if (r.err != null && !track && !dodge) stats.push(['Lệch trung bình', `${num(r.err, 2)} × bán kính`])
  if (r.expired) stats.push([dodge ? 'Bị flash' : 'Bỏ lỡ', String(r.expired)])
  if (r.decoys) stats.push(['Bắn nhầm', String(r.decoys)])
  stats.push(['Độ nhạy', `${num(r.cm360)} cm/360`])
  const next = run && run.i < run.list.items.length ? findTask(run.list.items[run.i]) : null
  const gainText =
    r.gain == null ? '' : r.gain > 0.15 ? 'Hay vượt quá mục tiêu.' : r.gain < -0.15 ? 'Hay dừng trước mục tiêu.' : 'Điểm dừng cân bằng — tốt.'
  shell(
    'home',
    `<div class="result-head">
      <div><span class="muted">${run ? `${esc(run.list.name)} · ` : ''}Kết quả</span><h1>${esc(task.name)}</h1></div>
      <div class="actions">
        ${run ? (next ? `<button class="big" data-next>Tiếp: ${esc(next.name)} (${run.i + 1}/${run.list.items.length})</button>` : '<button class="big" data-summary>Xem tổng kết</button>') : ''}
        <button class="${run ? 'ghost' : 'big'}" data-replay>Chơi lại (R)</button>
        <a class="btn ghost" href="#task/${esc(task.id)}">Chi tiết bài</a>
        ${run ? '<button class="ghost" data-stoprun>Dừng lộ trình</button>' : ''}
      </div>
    </div>
    <section class="score-row">
      <div class="card score-card"><span class="muted">Điểm</span><p class="score">${fmt.format(r.score)}</p>
        ${prevBest == null || r.score > prevBest ? '<span class="pb">Kỷ lục mới!</span>' : `<span class="muted">Kỷ lục ${fmt.format(prevBest)}</span>`}
        ${delta != null ? `<span class="${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${pct(Math.abs(delta))} so với TB 5 lượt trước</span>` : ''}
      </div>
      <div class="card score-card"><span class="muted">Hạng của lượt này</span><div>${rankBadge(rt, true)}</div>
        <div class="progress"><i style="width:${Math.round(rt % 100)}%;background:${rankColor(rankIndex(rt))}"></i></div><small class="muted">${Math.round(rt)}/900</small></div>
      <div class="card stats-grid">${stats.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
    </section>
    <section class="cols">
      <div class="card"><h2>Phân tích & lời khuyên</h2><ul class="tips">${tips(r, task.params).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
      ${!track && !dodge && shots.length ? `<div class="card"><h2>Phân bố phát bắn</h2>${scatter(shots)}<p class="muted small">Vòng tròn là mục tiêu. Xanh: trúng · đỏ: trượt.</p></div>` : ''}
      ${r.gain != null ? `<div class="card"><h2>Vượt quá / chưa tới</h2>${gauge(r.gain)}<p class="muted small">${gainText} Tính trên phát bắn đầu tiên sau mỗi cú flick.</p></div>` : ''}
      ${!track && r.regions.filter((v) => v != null).length > 1 ? `<div class="card"><h2>Tốc độ theo vùng</h2>${heat(r.regions)}<p class="muted small">Thời gian hạ trung bình theo vị trí mục tiêu.</p></div>` : ''}
      <div class="card"><h2>${track ? 'Tỉ lệ bám' : 'Số lần hạ'} mỗi 5 giây</h2>${bars(r.timeline, (v) => (track ? pct(v) : String(v)))}</div>
      <div class="card wide"><h2>Lịch sử bài này</h2>${line(runsOf(loadRuns(), task.id).slice(-40).map((x) => x.score), {
        marks: T.map((v, k) => ({ v, color: rankColor(k) })),
        fmt: (v) => fmt.format(Math.round(v)),
      })}</div>
    </section>`,
  )
  $('[data-replay]').addEventListener('click', () => playTask(task))
  $('[data-next]')?.addEventListener('click', playIndex)
  $('[data-summary]')?.addEventListener('click', () => go('#summary'))
  $('[data-stoprun]')?.addEventListener('click', () => {
    run = null
    resultPage()
  })
}

// ---------------------------------------------------------------------------
// Lộ trình

const allPlaylists = () => [...BUILTIN_PLAYLISTS, ...loadPlaylists()]

function playlistsPage() {
  shell(
    'playlists',
    `<div class="page-head"><h1>Lộ trình luyện tập</h1><a class="btn" href="#playlist/new">+ Tạo lộ trình</a></div>
    <p class="muted">Chơi liền một chuỗi bài rồi xem tổng kết — như playlist của Aim Lab.</p>
    <div class="grid">${allPlaylists()
      .map((pl) => {
        const tasks = pl.items.map(findTask).filter((t): t is Task => !!t)
        const secs = tasks.reduce((s, t) => s + (t.params.duration || 40), 0)
        return `<article class="card"><h3>${esc(pl.name)}</h3>
          <ol class="pl-items">${tasks.map((t) => `<li>${esc(t.name)}</li>`).join('')}</ol>
          <p class="muted small">${tasks.length} bài · khoảng ${Math.ceil(secs / 60)} phút</p>
          <div class="row"><button data-run="${esc(pl.id)}">▶ Chơi</button>${
            pl.builtin
              ? `<button class="ghost" data-copy="${esc(pl.id)}">Nhân bản</button>`
              : `<a class="btn ghost" href="#playlist/${esc(pl.id)}">Sửa</a><button class="ghost danger" data-delpl="${esc(pl.id)}">Xoá</button>`
          }</div></article>`
      })
      .join('')}</div>`,
  )
  const byId = (id?: string) => allPlaylists().find((p) => p.id === id)
  app.querySelectorAll<HTMLButtonElement>('[data-run]').forEach((b) =>
    b.addEventListener('click', () => {
      const pl = byId(b.dataset.run)
      if (pl?.items.length) startRun(pl)
    }),
  )
  app.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((b) =>
    b.addEventListener('click', () => {
      const pl = byId(b.dataset.copy)!
      const copy = { id: `p-${Date.now().toString(36)}`, name: `${pl.name} (bản của tôi)`, items: [...pl.items] }
      savePlaylists([...loadPlaylists(), copy])
      go(`#playlist/${copy.id}`)
    }),
  )
  app.querySelectorAll<HTMLButtonElement>('[data-delpl]').forEach((b) =>
    b.addEventListener('click', () => {
      if (!confirm('Xoá lộ trình này?')) return
      savePlaylists(loadPlaylists().filter((p) => p.id !== b.dataset.delpl))
      playlistsPage()
    }),
  )
}

function playlistEdit(id: string) {
  const existing = loadPlaylists().find((p) => p.id === id)
  const draft: Playlist = existing
    ? { ...existing, items: [...existing.items] }
    : { id: `p-${Date.now().toString(36)}`, name: 'Lộ trình của tôi', items: [] }
  const render = () => {
    shell(
      'playlists',
      `<a class="back" href="#playlists">← Lộ trình</a><h1>${existing ? 'Sửa lộ trình' : 'Tạo lộ trình'}</h1>
      <div class="card form narrow">
        <label class="field"><span>Tên lộ trình</span><input id="pl-name" value="${esc(draft.name)}" maxlength="60"></label>
        <ol class="pl-edit">${
          draft.items
            .map(
              (tid, i) => `<li><span>${esc(findTask(tid)?.name ?? tid)}</span>
                <button class="icon" data-up="${i}" aria-label="Lên trên">↑</button>
                <button class="icon" data-down="${i}" aria-label="Xuống dưới">↓</button>
                <button class="icon" data-rm="${i}" aria-label="Bỏ bài">✕</button></li>`,
            )
            .join('') || '<li class="muted">Chưa có bài nào.</li>'
        }</ol>
        <div class="row"><select id="pl-add" aria-label="Chọn bài">${visibleTasks()
          .map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`)
          .join('')}</select><button class="ghost" data-add>+ Thêm bài</button></div>
        <div class="row"><button class="big" data-save>Lưu</button><a class="btn ghost" href="#playlists">Huỷ</a></div>
      </div>`,
    )
    $<HTMLInputElement>('#pl-name').addEventListener('input', (e) => (draft.name = (e.target as HTMLInputElement).value))
    $('[data-add]').addEventListener('click', () => {
      draft.items.push($<HTMLSelectElement>('#pl-add').value)
      render()
    })
    app.querySelectorAll<HTMLButtonElement>('[data-up],[data-down],[data-rm]').forEach((b) =>
      b.addEventListener('click', () => {
        const i = Number(b.dataset.up ?? b.dataset.down ?? b.dataset.rm)
        const j = b.dataset.up != null ? i - 1 : i + 1
        if (b.dataset.rm != null) draft.items.splice(i, 1)
        else if (j >= 0 && j < draft.items.length) [draft.items[i], draft.items[j]] = [draft.items[j], draft.items[i]]
        render()
      }),
    )
    $('[data-save]').addEventListener('click', () => {
      draft.name = draft.name.trim() || 'Lộ trình của tôi'
      const others = loadPlaylists().filter((p) => p.id !== draft.id)
      savePlaylists([...others, draft])
      go('#playlists')
    })
  }
  render()
}

function summaryPage() {
  if (!run || !run.results.length) return go('#playlists')
  if (run.muls) return finderSummary(run)
  const done = run
  const rows = done.results.map((r) => {
    const t = findTask(r.task)
    return `<tr><td>${esc(t?.name ?? r.task)}</td><td>${fmt.format(r.score)}</td><td>${t ? scoreBadge(r.score, t) : ''}</td><td>${pct(r.acc)}</td></tr>`
  })
  const minutes = Math.round(done.results.reduce((s, r) => s + r.time, 0) / 60)
  shell(
    'playlists',
    `<h1>Tổng kết: ${esc(done.list.name)}</h1>
    <div class="card"><table><thead><tr><th>Bài</th><th>Điểm</th><th>Hạng</th><th>Chính xác / bám</th></tr></thead><tbody>${rows.join('')}</tbody></table>
    <p class="kv">Xong ${done.results.length}/${done.list.items.length} bài · ${minutes} phút</p></div>
    <div class="row"><button class="big" data-again>Chơi lại lộ trình</button><a class="btn ghost" href="#stats">Xem hồ sơ kỹ năng</a><a class="btn ghost" href="#home">Về thư viện</a></div>`,
  )
  run = null
  $('[data-again]').addEventListener('click', () => startRun(done.list))
}

// ---------------------------------------------------------------------------
// Tìm độ nhạy

const FINDER_MULS = [0.7, 0.85, 1, 1.15, 1.3]

function startFinder() {
  const muls = [...FINDER_MULS].sort(() => Math.random() - 0.5)
  const items: string[] = []
  const perRound: number[] = []
  for (const m of muls) {
    items.push('finder-flick', 'finder-track')
    perRound.push(m, m)
  }
  startRun({ id: 'finder', name: 'Tìm độ nhạy', items }, perRound)
}

function finderSummary(done: Run) {
  const base = done.base ?? settings.sens
  const totals = new Map<number, number>()
  done.results.forEach((r, k) => {
    const t = findTask(r.task)!
    const m = done.muls![k]
    totals.set(m, (totals.get(m) ?? 0) + rating(r.score, ranksFor(t.params)))
  })
  const rounds = [...totals].map(([mul, score]) => ({ mul, score })).sort((a, b) => a.mul - b.mul)
  const bestMul = bestMultiplier(rounds)
  const rec = Math.round(base * bestMul * 1000) / 1000
  const g = gameById(settings.game)
  shell(
    'tools',
    `<h1>Kết quả tìm độ nhạy</h1>
    <div class="card"><table><thead><tr><th>Sens (${esc(g.name)})</th><th>cm/360</th><th>Điểm flick + tracking</th></tr></thead><tbody>${rounds
      .map(
        (x) => `<tr${x.mul === rounds.reduce((a, b) => (b.score > a.score ? b : a)).mul ? ' class="hl"' : ''}><td>${num(base * x.mul, 3)}</td>
          <td>${num(cmPer360(g, base * x.mul, settings.dpi) / settings.mouseScale)}</td><td>${Math.round(x.score)}</td></tr>`,
      )
      .join('')}</tbody></table>
    <p class="big-num">Gợi ý: ${num(rec, 3)} <span class="muted small">(${num(cmPer360(g, rec, settings.dpi) / settings.mouseScale)} cm/360)</span></p>
    <p class="muted">Điểm mỗi mức là tổng điểm xếp hạng (0–900) của phần flick và phần tracking; gợi ý lấy đỉnh của đường cong khớp qua 5 mức. Một lần đo còn nhiễu — làm lại vài hôm rồi chọn mức hay xuất hiện nhất.</p>
    <div class="row"><button class="big" data-apply>Áp dụng ${num(rec, 3)}</button><a class="btn ghost" href="#tools">Bỏ qua</a></div></div>`,
  )
  run = null
  $('[data-apply]').addEventListener('click', () => {
    settings.sens = rec
    saveSettings(settings)
    go('#settings/sens')
  })
}

// ---------------------------------------------------------------------------
// Thống kê

function statsPage() {
  const runs = loadRuns()
  const tasks = visibleTasks()
  const prof = profile(runs, tasks)
  const ov = overall(prof)
  const keys = Object.keys(SKILLS) as Skill[]
  const days = trainingDays(runs)
  const minutes = Math.round(runs.reduce((s, r) => s + r.time, 0) / 60)
  const reacts = loadReact().slice(-10)
  const rows = tasks
    .map((t) => {
      const own = runsOf(runs, t.id)
      if (!own.length) return ''
      const b = Math.max(...own.map((r) => r.score))
      const a5 = mean(own.slice(-5).map((r) => r.score))
      const p5 = own.length > 5 ? mean(own.slice(-10, -5).map((r) => r.score)) : null
      const trend = p5 ? (a5 - p5) / p5 : null
      return `<tr><td><a href="#task/${esc(t.id)}">${esc(t.name)}</a></td><td>${own.length}</td><td>${fmt.format(b)}</td>
        <td>${fmt.format(Math.round(a5))}</td><td>${trend == null ? '—' : `<span class="${trend >= 0 ? 'up' : 'down'}">${trend >= 0 ? '▲' : '▼'} ${pct(Math.abs(trend))}</span>`}</td>
        <td>${scoreBadge(b, t)}</td></tr>`
    })
    .join('')
  shell(
    'stats',
    `<h1>Thống kê & hồ sơ kỹ năng</h1>
    <section class="cols">
      <div class="card"><h2>Hồ sơ kỹ năng</h2>${radar(keys.map((k) => SKILLS[k]), keys.map((k) => prof[k]))}</div>
      <div class="card"><h2>Hạng tổng</h2>${ov == null ? '<p class="muted">Chưa có — chơi vài bài trước đã.</p>' : `${rankBadge(ov, true)} <span class="muted">${Math.round(ov)}/900</span>`}
        <ul class="skills">${keys
          .map((k) => {
            const v = prof[k]
            return `<li><span>${SKILLS[k]}</span>${
              v == null
                ? '<span class="muted small">chưa chơi</span>'
                : `<div class="progress"><i style="width:${Math.round(v / 9)}%;background:${rankColor(rankIndex(v))}"></i></div><b>${rankName(rankIndex(v))}</b>`
            }</li>`
          })
          .join('')}</ul>
        <p class="muted small">Mỗi kỹ năng lấy kết quả tốt nhất trong 10 lượt gần nhất của các bài thuộc kỹ năng đó. Chơi lộ trình "Đánh giá kỹ năng" để có đủ 6 mục.</p></div>
      <div class="card wide"><h2>Hoạt động</h2>
        <p class="kv">Chuỗi <b>${streak(runs)} ngày</b> · <b>${runs.length}</b> lượt · <b>${minutes}</b> phút · <b>${days.size}</b> ngày có tập</p>
        ${calendar(days, dayKey)}
        ${reacts.length ? `<p class="kv">Phản xạ (đo ở Công cụ): trung bình ${Math.round(mean(reacts.at(-1)!.times))} ms lần gần nhất · nhanh nhất ${Math.min(...reacts.flatMap((x) => x.times))} ms</p>` : ''}
      </div>
    </section>
    <div class="card"><h2>Theo từng bài</h2>${
      rows
        ? `<table><thead><tr><th>Bài</th><th>Lượt</th><th>Kỷ lục</th><th>TB 5 gần nhất</th><th>Xu hướng</th><th>Hạng</th></tr></thead><tbody>${rows}</tbody></table>`
        : '<p class="muted">Chưa chơi bài nào.</p>'
    }</div>
    <div class="card"><h2>Dữ liệu</h2><p class="muted">Mọi thứ chỉ lưu trong trình duyệt này. Xuất ra file để sao lưu hoặc chuyển sang máy khác.</p>
      <div class="row"><button data-export>Xuất dữ liệu</button>
        <label class="btn ghost">Nhập dữ liệu<input type="file" accept=".json,application/json" hidden data-import></label>
        <button class="ghost danger" data-reset>Xoá toàn bộ dữ liệu</button></div></div>`,
  )
  $('[data-export]').addEventListener('click', () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([exportAll()], { type: 'application/json' }))
    a.download = `tam-ngam-${dayKey(Date.now())}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  })
  $<HTMLInputElement>('[data-import]').addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    if (!importAll(await file.text())) return alert('File này không phải bản sao lưu của Tâm Ngắm.')
    settings = loadSettings()
    statsPage()
  })
  $('[data-reset]').addEventListener('click', () => {
    if (!confirm('Xoá toàn bộ lịch sử, bài tự tạo, lộ trình và cài đặt? Không hoàn tác được.')) return
    resetAll()
    settings = loadSettings()
    statsPage()
  })
}

// ---------------------------------------------------------------------------
// Công cụ

function toolsPage() {
  shell(
    'tools',
    `<h1>Công cụ</h1>
    <section class="cols">
      <div class="card wide"><h2>Đổi độ nhạy giữa các game</h2>
        <div class="row wrap">
          <label class="field"><span>Game gốc</span><select id="cv-game">${GAMES.map((g) => `<option value="${g.id}"${g.id === settings.game ? ' selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>
          <label class="field"><span>Sens</span><input id="cv-sens" type="number" step="0.001" min="0.001" value="${settings.sens}"></label>
          <label class="field"><span>DPI</span><input id="cv-dpi" type="number" step="50" min="50" value="${settings.dpi}"></label>
          <label class="field"><span>DPI mới (tuỳ chọn)</span><input id="cv-dpi2" type="number" step="50" min="50" placeholder="giữ nguyên"></label>
        </div>
        <div id="cv-out"></div>
        <button class="ghost" data-cv-apply>Dùng làm độ nhạy luyện tập</button>
      </div>
      <div class="card"><h2>Đo phản xạ</h2><p class="muted">5 lần. Đợi ô chuyển xanh rồi bấm thật nhanh.</p>
        <div class="react idle" tabindex="0" role="button">Bấm để bắt đầu</div><div id="react-out"></div></div>
      <div class="card"><h2>Tìm độ nhạy</h2>
        <p>Chơi 10 vòng ngắn (flick và tracking, mỗi vòng 20 giây) ở 5 mức sens quanh mức hiện tại. Thứ tự bị xáo và giấu số, app chọn mức bạn chơi tốt nhất.</p>
        <p class="muted small">Khoảng 4 phút · đang dùng ${sensLine()}</p>
        <button class="big" data-finder>Bắt đầu tìm sens</button></div>
    </section>`,
  )
  const out = $('#cv-out')
  const read = () => {
    const from = gameById($<HTMLSelectElement>('#cv-game').value)
    const sens = parseFloat($<HTMLInputElement>('#cv-sens').value)
    const dpi = parseFloat($<HTMLInputElement>('#cv-dpi').value)
    const dpi2 = parseFloat($<HTMLInputElement>('#cv-dpi2').value) || dpi
    return { from, sens, dpi, dpi2 }
  }
  const update = () => {
    const { from, sens, dpi, dpi2 } = read()
    if (!(sens > 0 && dpi > 0)) return (out.innerHTML = '<p class="muted">Nhập sens và DPI.</p>')
    out.innerHTML = `<p class="kv"><b>${num(cmPer360(from, sens, dpi))} cm/360</b> · eDPI ${num(sens * dpi, 1)} · ${num(from.yaw * sens, 4)}°/count</p>
      <table><thead><tr><th>Game</th><th>Sens tương đương${dpi2 !== dpi ? ` ở ${dpi2} DPI` : ''}</th></tr></thead><tbody>${GAMES.map(
        (g) => `<tr${g.id === from.id ? ' class="hl"' : ''}><td>${esc(g.name)}</td><td>${num(convert360(from, sens, g, dpi, dpi2), 4)}</td></tr>`,
      ).join('')}</tbody></table>
      <p class="muted small">Khớp theo quãng kéo chuột cho một vòng 360°. FOV khác nhau vẫn làm cảm giác gần tâm hơi khác.</p>`
  }
  app.querySelectorAll('#cv-game,#cv-sens,#cv-dpi,#cv-dpi2').forEach((el) => el.addEventListener('input', update))
  update()
  $('[data-cv-apply]').addEventListener('click', () => {
    const { from, sens, dpi } = read()
    if (!(sens > 0 && dpi > 0)) return
    Object.assign(settings, { game: from.id, sens, dpi })
    saveSettings(settings)
    $('.sensinfo').innerHTML = sensLine()
  })
  reactionTest($('.react'), $('#react-out'))
  $('[data-finder]').addEventListener('click', startFinder)
}

function reactionTest(box: HTMLElement, out: HTMLElement) {
  let state: 'idle' | 'wait' | 'go' = 'idle'
  let times: number[] = []
  let timer = 0
  let goAt = 0
  const set = (cls: string, text: string) => {
    box.className = `react ${cls}`
    box.textContent = text
  }
  const show = () =>
    (out.innerHTML = times.length
      ? `<p class="kv">${times.map((t) => `<b>${t}</b>`).join(' · ')} ms${times.length >= 5 ? ` — trung bình <b>${Math.round(mean(times))} ms</b>` : ''}</p>`
      : '')
  box.addEventListener('pointerdown', (e) => {
    if (state === 'idle') {
      if (times.length >= 5) times = []
      state = 'wait'
      set('wait', 'Đợi màu xanh…')
      show()
      timer = window.setTimeout(() => {
        state = 'go'
        set('go', 'BẤM!')
        requestAnimationFrame(() => (goAt = performance.now()))
      }, 1200 + Math.random() * 2500)
    } else if (state === 'wait') {
      clearTimeout(timer)
      state = 'idle'
      set('early', 'Sớm quá! Bấm để thử lại')
    } else {
      times.push(Math.max(0, Math.round(e.timeStamp - goAt)))
      state = 'idle'
      if (times.length >= 5) {
        addReact(times)
        set('idle', `Trung bình ${Math.round(mean(times))} ms — bấm để đo lại`)
      } else set('idle', `${times.at(-1)} ms — bấm để tiếp (${times.length}/5)`)
      show()
    }
  })
}

// ---------------------------------------------------------------------------
// Form dùng chung cho Cài đặt và Tạo bài

interface Field {
  key: string
  label: string
  type: 'num' | 'range' | 'select' | 'color' | 'check' | 'text' | 'area'
  min?: number
  max?: number
  step?: number
  options?: [string, string][]
  hint?: string
}

function fieldsHTML(fields: Field[], v: Record<string, unknown>): string {
  return fields
    .map((f) => {
      const val = esc(String(v[f.key]))
      const hint = f.hint ? `<small>${f.hint}</small>` : ''
      const attrs = `data-key="${f.key}" id="f-${f.key}"`
      const lim = `min="${f.min ?? ''}" max="${f.max ?? ''}" step="${f.step ?? 'any'}"`
      if (f.type === 'check')
        return `<label class="field check"><input type="checkbox" ${attrs}${v[f.key] ? ' checked' : ''}><span>${f.label}</span>${hint}</label>`
      const input =
        f.type === 'num'
          ? `<input type="number" ${attrs} value="${val}" ${lim}>`
          : f.type === 'range'
            ? `<div class="range"><input type="range" ${attrs} value="${val}" ${lim}><output>${val}</output></div>`
            : f.type === 'select'
              ? `<select ${attrs}>${f.options!.map(([o, l]) => `<option value="${o}"${o === String(v[f.key]) ? ' selected' : ''}>${l}</option>`).join('')}</select>`
              : f.type === 'color'
                ? `<input type="color" ${attrs} value="${val}">`
                : f.type === 'area'
                  ? `<textarea ${attrs} rows="3" maxlength="400">${val}</textarea>`
                  : `<input type="text" ${attrs} value="${val}" maxlength="60">`
      return `<label class="field" for="f-${f.key}"><span>${f.label}</span>${input}${hint}</label>`
    })
    .join('')
}

function bindFields(root: HTMLElement, fields: Field[], v: Record<string, unknown>, onChange: (key: string) => void) {
  const handler = (e: Event) => {
    const el = e.target as HTMLInputElement
    const f = fields.find((x) => x.key === el.dataset.key)
    if (!f) return
    let val: unknown = el.value
    if (f.type === 'check') val = el.checked
    else if (f.type === 'num' || f.type === 'range') {
      const n = parseFloat(el.value)
      if (!Number.isFinite(n)) return
      val = Math.min(f.max ?? Infinity, Math.max(f.min ?? -Infinity, n))
    }
    if (v[f.key] === val) return
    v[f.key] = val
    const o = el.nextElementSibling
    if (o?.tagName === 'OUTPUT') o.textContent = String(val)
    onChange(f.key)
  }
  root.addEventListener('input', handler)
  root.addEventListener('change', handler)
}

// ---------------------------------------------------------------------------
// Cài đặt

const SOUNDS: [Sfx, string][] = [
  ['none', 'Tắt'],
  ['tick', 'Tích'],
  ['pop', 'Bụp'],
  ['ding', 'Ding'],
  ['thud', 'Thịch'],
  ['click', 'Click'],
]

const SETTINGS_TABS: { id: string; name: string; fields: Field[] }[] = [
  {
    id: 'sens',
    name: 'Độ nhạy & FOV',
    fields: [
      { key: 'game', label: 'Thang độ nhạy theo game', type: 'select', options: GAMES.map((g) => [g.id, g.name]) },
      { key: 'sens', label: 'Độ nhạy (sens trong game)', type: 'num', min: 0.001, max: 1000, step: 0.001 },
      { key: 'dpi', label: 'DPI chuột', type: 'num', min: 50, max: 32000, step: 50 },
      { key: 'ySens', label: 'Hệ số độ nhạy dọc', type: 'range', min: 0.5, max: 2, step: 0.05 },
      { key: 'invertY', label: 'Đảo trục dọc', type: 'check' },
      { key: 'rawInput', label: 'Đọc chuyển động thô (khuyên dùng)', type: 'check', hint: 'Bỏ qua gia tốc chuột của Windows, giống "Raw Input" trong game. Cần Chrome hoặc Edge.' },
      { key: 'mouseScale', label: 'Hệ số hiệu chỉnh chuột', type: 'num', min: 0.1, max: 10, step: 0.01, hint: 'Để 1. Chỉ đổi nếu xoay 360° trong app không khớp với trong game.' },
      { key: 'fov', label: 'FOV', type: 'num', min: 30, max: 150, step: 0.5 },
      {
        key: 'fovType',
        label: 'Kiểu FOV',
        type: 'select',
        options: [
          ['h169', 'Ngang 16:9 (Valorant, Overwatch)'],
          ['h43', 'Ngang 4:3 (CS2, Apex)'],
          ['v', 'Dọc'],
        ],
      },
    ],
  },
  {
    id: 'crosshair',
    name: 'Tâm ngắm',
    fields: [
      {
        key: 'chStyle',
        label: 'Kiểu',
        type: 'select',
        options: [
          ['cross', 'Chữ thập'],
          ['t', 'Chữ T'],
          ['dot', 'Chấm'],
          ['circle', 'Vòng tròn'],
        ],
      },
      { key: 'chColor', label: 'Màu', type: 'color' },
      { key: 'chAlpha', label: 'Độ đậm', type: 'range', min: 0.1, max: 1, step: 0.05 },
      { key: 'chLength', label: 'Độ dài vạch', type: 'range', min: 0, max: 30, step: 1 },
      { key: 'chThick', label: 'Độ dày', type: 'range', min: 1, max: 10, step: 1 },
      { key: 'chGap', label: 'Khoảng hở giữa', type: 'range', min: 0, max: 30, step: 1 },
      { key: 'chDot', label: 'Chấm giữa', type: 'check' },
      { key: 'chDotSize', label: 'Cỡ chấm giữa', type: 'range', min: 1, max: 10, step: 1 },
      { key: 'chOutline', label: 'Viền', type: 'check' },
      { key: 'chOutlineColor', label: 'Màu viền', type: 'color' },
    ],
  },
  {
    id: 'targets',
    name: 'Mục tiêu',
    fields: [
      { key: 'targetColor', label: 'Màu mục tiêu', type: 'color' },
      { key: 'hoverColor', label: 'Màu khi đang bám trúng (bài tracking)', type: 'color', hint: 'Đặt trùng màu mục tiêu nếu không muốn có gợi ý này.' },
      { key: 'decoyColor', label: 'Màu mục tiêu đồng đội (không được bắn)', type: 'color' },
      { key: 'hpBars', label: 'Thanh máu trên mục tiêu nhiều máu', type: 'check' },
      { key: 'effects', label: 'Hiệu ứng vỡ khi hạ', type: 'check' },
      { key: 'hitmarker', label: 'Dấu trúng (hitmarker) ở tâm', type: 'check' },
    ],
  },
  {
    id: 'audio',
    name: 'Âm thanh',
    fields: [
      { key: 'volume', label: 'Âm lượng', type: 'range', min: 0, max: 100, step: 1 },
      { key: 'hitSound', label: 'Tiếng trúng', type: 'select', options: SOUNDS },
      { key: 'killSound', label: 'Tiếng hạ mục tiêu', type: 'select', options: SOUNDS },
      { key: 'missSound', label: 'Tiếng trượt', type: 'select', options: SOUNDS },
      {
        key: 'shootSound',
        label: 'Tiếng súng',
        type: 'select',
        options: [
          ['none', 'Tắt'],
          ['click', 'Click nhẹ'],
          ['gun', 'Tiếng nổ'],
        ],
      },
      { key: 'spawnSound', label: 'Bíp khi mục tiêu xuất hiện (bài phản xạ)', type: 'check' },
      { key: 'trackSound', label: 'Tiếng tích khi đang bám trúng', type: 'check' },
    ],
  },
  {
    id: 'visual',
    name: 'Hình ảnh',
    fields: [
      { key: 'theme', label: 'Phòng tập', type: 'select', options: THEMES.map((t) => [t.id, t.name]) },
      { key: 'wallColor', label: 'Màu tường', type: 'color' },
      { key: 'gridColor', label: 'Màu lưới', type: 'color' },
      { key: 'floorColor', label: 'Màu sàn', type: 'color' },
      { key: 'renderScale', label: 'Độ phân giải render', type: 'range', min: 0.5, max: 2, step: 0.25, hint: 'Giảm nếu máy yếu, FPS thấp.' },
      { key: 'antialias', label: 'Khử răng cưa', type: 'check' },
    ],
  },
  {
    id: 'game',
    name: 'Chơi',
    fields: [
      { key: 'countdown', label: 'Đếm ngược trước khi bắt đầu (giây)', type: 'range', min: 0, max: 5, step: 1 },
      { key: 'fullscreen', label: 'Toàn màn hình khi chơi', type: 'check' },
      { key: 'hud', label: 'Hiện thời gian, điểm, độ chính xác khi chơi', type: 'check' },
      { key: 'showFps', label: 'Hiện FPS', type: 'check' },
    ],
  },
]

const CROSSHAIRS: { name: string; v: Partial<Settings> }[] = [
  { name: 'Mặc định', v: { chStyle: 'cross', chLength: 6, chThick: 2, chGap: 3, chDot: false, chOutline: true } },
  { name: 'Chấm nhỏ', v: { chStyle: 'dot', chDotSize: 4, chThick: 2, chOutline: true } },
  { name: 'Valorant cổ điển', v: { chStyle: 'cross', chLength: 4, chThick: 2, chGap: 2, chDot: true, chDotSize: 2, chColor: '#00ff00' } },
  { name: 'CS2 nhỏ', v: { chStyle: 'cross', chLength: 3, chThick: 1, chGap: 1, chDot: false, chOutline: true, chColor: '#4dff4d' } },
  { name: 'Vòng tròn', v: { chStyle: 'circle', chLength: 8, chThick: 2, chGap: 6, chDot: true, chDotSize: 2 } },
]

function settingsSide(tab: string): string {
  const g = gameById(settings.game)
  if (tab === 'sens') {
    const v = vFov(settings.fov, settings.fovType)
    const aspect = window.innerWidth / Math.max(1, window.innerHeight)
    return `<h2>Thông số</h2>
      <p class="big-num">${num(cm360())} <span class="muted small">cm/360</span></p>
      <p class="kv">eDPI ${num(settings.sens * settings.dpi, 1)} · ${num(g.yaw * settings.sens, 4)}°/count</p>
      <p class="kv">FOV dọc ${num(v)}° · FOV ngang ${num(hFov(v, aspect))}° trên màn này</p>
      <h3>FOV có sẵn</h3><div class="row wrap">${FOV_PRESETS.map((p, i) => `<button class="chip" data-fov="${i}">${p.name}</button>`).join('')}</div>`
  }
  if (tab === 'crosshair')
    return `<h2>Xem trước</h2><canvas class="xh-preview" width="240" height="160"></canvas>
      <h3>Mẫu có sẵn</h3><div class="row wrap">${CROSSHAIRS.map((c, i) => `<button class="chip" data-ch="${i}">${c.name}</button>`).join('')}</div>`
  if (tab === 'audio') return `<h2>Nghe thử</h2><p class="muted">Đổi một tiếng là nghe luôn tiếng đó.</p>`
  return `<h2>Gợi ý</h2><p class="muted">Thay đổi được lưu ngay và áp dụng từ lượt chơi kế tiếp.</p>`
}

function settingsPage(tab: string) {
  const t = SETTINGS_TABS.find((x) => x.id === tab) ?? SETTINGS_TABS[0]
  shell(
    'settings',
    `<h1>Cài đặt</h1>
    <div class="tabs">${SETTINGS_TABS.map((x) => `<a href="#settings/${x.id}" class="tab${x.id === t.id ? ' on' : ''}">${x.name}</a>`).join('')}</div>
    <div class="settings-body"><form class="card form" onsubmit="return false">${fieldsHTML(t.fields, settings as unknown as Record<string, unknown>)}</form>
      <aside class="card side" id="side"></aside></div>
    <button class="ghost danger" data-reset-settings>Khôi phục cài đặt mặc định</button>`,
  )
  const side = $('#side')
  const renderSide = () => {
    side.innerHTML = settingsSide(t.id)
    const c = side.querySelector<HTMLCanvasElement>('.xh-preview')
    if (c) drawCrosshair(c, settings)
    side.querySelectorAll<HTMLButtonElement>('[data-fov]').forEach((b) =>
      b.addEventListener('click', () => {
        const p = FOV_PRESETS[Number(b.dataset.fov)]
        Object.assign(settings, { fov: p.fov, fovType: p.type })
        saveSettings(settings)
        settingsPage(t.id)
      }),
    )
    side.querySelectorAll<HTMLButtonElement>('[data-ch]').forEach((b) =>
      b.addEventListener('click', () => {
        Object.assign(settings, CROSSHAIRS[Number(b.dataset.ch)].v)
        saveSettings(settings)
        settingsPage(t.id)
      }),
    )
  }
  renderSide()
  bindFields($('form'), t.fields, settings as unknown as Record<string, unknown>, (key) => {
    if (key === 'theme') {
      const th = THEMES.find((x) => x.id === settings.theme)!
      Object.assign(settings, { wallColor: th.wall, gridColor: th.grid, floorColor: th.floor })
      saveSettings(settings)
      return settingsPage(t.id)
    }
    saveSettings(settings)
    if (key === 'hitSound' || key === 'killSound' || key === 'missSound') sfx(settings[key], settings.volume)
    if (key === 'shootSound') gunshot(settings.shootSound, settings.volume)
    $('.sensinfo').innerHTML = sensLine()
    renderSide()
  })
  $('[data-reset-settings]').addEventListener('click', () => {
    if (!confirm('Đưa mọi cài đặt về mặc định?')) return
    settings = { ...DEFAULT_SETTINGS }
    saveSettings(settings)
    settingsPage(t.id)
  })
}

// ---------------------------------------------------------------------------
// Tạo bài (Creator)

const PARAM_GROUPS: { name: string; fields: Field[] }[] = [
  {
    name: 'Thời lượng & số mục tiêu',
    fields: [
      { key: 'duration', label: 'Thời lượng (giây)', type: 'num', min: 0, max: 600, step: 1, hint: '0 = chơi tới khi hết số mục tiêu bên dưới.' },
      { key: 'targetLimit', label: 'Tổng số mục tiêu', type: 'num', min: 0, max: 500, step: 1, hint: '0 = không giới hạn.' },
      { key: 'count', label: 'Số mục tiêu cùng lúc', type: 'range', min: 1, max: 20, step: 1 },
      { key: 'waves', label: 'Theo đợt: hạ hết đợt này mới ra đợt sau', type: 'check' },
    ],
  },
  {
    name: 'Kích thước & vị trí',
    fields: [
      { key: 'radius', label: 'Bán kính mục tiêu (m)', type: 'num', min: 0.05, max: 5, step: 0.01 },
      { key: 'height', label: 'Chiều cao thân (m)', type: 'num', min: 0, max: 5, step: 0.05, hint: '> 0 thì mục tiêu là viên thuốc (dáng người).' },
      { key: 'sizeJitter', label: 'Dao động kích thước', type: 'range', min: 0, max: 0.9, step: 0.05 },
      { key: 'distance', label: 'Khoảng cách (m)', type: 'num', min: 2, max: 100, step: 0.5 },
      { key: 'distanceJitter', label: 'Dao động khoảng cách (± m)', type: 'num', min: 0, max: 50, step: 0.5 },
      {
        key: 'spawn',
        label: 'Cách xuất hiện',
        type: 'select',
        options: [
          ['random', 'Ngẫu nhiên trong vùng'],
          ['grid', 'Theo lưới (kiểu Gridshot)'],
          ['spider', 'Luân phiên giữa – ngoài (kiểu Spidershot)'],
        ],
      },
      { key: 'cols', label: 'Số cột lưới', type: 'num', min: 1, max: 10, step: 1 },
      { key: 'rows', label: 'Số hàng lưới', type: 'num', min: 1, max: 10, step: 1 },
      { key: 'spreadX', label: 'Nửa bề ngang vùng xuất hiện (độ)', type: 'num', min: 0, max: 180, step: 0.5, hint: '180 = quanh người.' },
      { key: 'spreadY', label: 'Nửa bề dọc vùng xuất hiện (độ)', type: 'num', min: 0, max: 85, step: 0.5 },
      { key: 'minGap', label: 'Cách tâm ngắm tối thiểu (độ)', type: 'num', min: 0, max: 170, step: 0.5 },
    ],
  },
  {
    name: 'Vũ khí & máu',
    fields: [
      {
        key: 'weapon',
        label: 'Cách bắn',
        type: 'select',
        options: [
          ['click', 'Bấm từng phát'],
          ['auto', 'Giữ chuột xả đạn'],
          ['track', 'Bám mục tiêu (không cần bấm)'],
          ['dodge', 'Né: quay lưng lại mục tiêu'],
        ],
      },
      { key: 'hp', label: 'Máu', type: 'num', min: 0.1, max: 100, step: 0.1, hint: 'Bắn: số phát. Bám: số giây giữ tâm.' },
      { key: 'fireRate', label: 'Tốc độ bắn khi giữ chuột (phát/giây)', type: 'num', min: 1, max: 30, step: 1 },
      { key: 'holdToTrack', label: 'Bám: phải giữ chuột mới tính', type: 'check' },
      { key: 'regen', label: 'Hồi máu mỗi giây khi thôi bị bắn', type: 'num', min: 0, max: 100, step: 0.5 },
    ],
  },
  {
    name: 'Chuyển động',
    fields: [
      {
        key: 'motion',
        label: 'Kiểu di chuyển',
        type: 'select',
        options: [
          ['static', 'Đứng yên'],
          ['strafe', 'Lướt ngang qua lại'],
          ['fly', 'Bay lượn mượt'],
          ['erratic', 'Giật hướng bất chợt'],
          ['circle', 'Chạy vòng tròn'],
        ],
      },
      { key: 'speed', label: 'Tốc độ (m/s)', type: 'num', min: 0, max: 60, step: 0.5 },
      { key: 'turnMin', label: 'Đổi hướng sau ít nhất (giây)', type: 'num', min: 0.05, max: 10, step: 0.05 },
      { key: 'turnMax', label: 'Đổi hướng sau nhiều nhất (giây)', type: 'num', min: 0.05, max: 10, step: 0.05 },
      { key: 'orbit', label: 'Bán kính vòng tròn (độ)', type: 'num', min: 0.5, max: 60, step: 0.5 },
    ],
  },
  {
    name: 'Luật đặc biệt & tính điểm',
    fields: [
      { key: 'lifetime', label: 'Mục tiêu tự biến mất sau (ms)', type: 'num', min: 0, max: 10000, step: 50, hint: '0 = không biến mất.' },
      { key: 'spawnDelay', label: 'Chờ trước khi hiện mục tiêu mới (ms)', type: 'num', min: 0, max: 10000, step: 50 },
      {
        key: 'adaptive',
        label: 'Độ khó tự điều chỉnh',
        type: 'select',
        options: [
          ['none', 'Tắt'],
          ['size', 'Theo kích thước (trúng thì nhỏ lại)'],
          ['time', 'Theo thời gian hiện (trúng thì nhanh biến mất hơn)'],
        ],
      },
      { key: 'decoys', label: 'Tỉ lệ mục tiêu đồng đội (đừng bắn)', type: 'range', min: 0, max: 0.9, step: 0.05 },
      { key: 'ghost', label: 'Mục tiêu mờ, khó thấy', type: 'check' },
      { key: 'refTime', label: 'Mốc thưởng tốc độ (ms)', type: 'num', min: 100, max: 5000, step: 50, hint: 'Hạ nhanh hơn mốc này được thêm tới 100% điểm.' },
      { key: 'accWeight', label: 'Sức nặng của độ chính xác trong điểm', type: 'range', min: 0, max: 4, step: 0.25 },
    ],
  },
]

const toCode = (o: unknown) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o))))
const fromCode = (c: string) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(c.trim()), (ch) => ch.charCodeAt(0))))

function createPage(id: string) {
  const src = id ? findTask(id) : undefined
  const editing = src?.custom ? src : undefined
  const meta: Record<string, unknown> = {
    name: editing?.name ?? (src ? `${src.name} (tuỳ chỉnh)` : 'Bài mới của tôi'),
    desc: editing?.desc ?? src?.desc ?? '',
    skill: src ? primary(src) : 'flick',
  }
  const params: TaskParams = { ...(src?.params ?? DEFAULT_PARAMS) }
  const META: Field[] = [
    { key: 'name', label: 'Tên bài', type: 'text' },
    { key: 'desc', label: 'Mô tả', type: 'area' },
    { key: 'skill', label: 'Kỹ năng chính', type: 'select', options: Object.entries(SKILLS) as [string, string][] },
  ]
  const p = params as unknown as Record<string, unknown>
  shell(
    'create',
    `<h1>${editing ? 'Sửa bài' : src ? `Tuỳ chỉnh từ ${esc(src.name)}` : 'Tạo bài mới'}</h1>
    <p class="muted">Mọi bài dựng sẵn cũng chỉ là một bộ thông số như dưới đây. Đổi thoải mái rồi lưu thành bài của bạn.</p>
    <div class="creator">
      <form class="card form" id="meta" onsubmit="return false">${fieldsHTML(META, meta)}</form>
      ${PARAM_GROUPS.map((g) => `<form class="card form" onsubmit="return false"><h2>${g.name}</h2>${fieldsHTML(g.fields, p)}</form>`).join('')}
      <div class="card form"><h2>Chia sẻ</h2>
        <label class="field"><span>Mã bài</span><textarea id="code" rows="3" placeholder="Dán mã bài vào đây rồi bấm Nhập mã"></textarea></label>
        <div class="row"><button class="ghost" data-export-code>Tạo mã từ bài này</button><button class="ghost" data-import-code>Nhập mã</button></div></div>
    </div>
    <div class="row sticky-actions"><button class="big" data-save-play>Lưu & chơi</button><button data-save>Lưu</button>
      <a class="btn ghost" href="${src ? `#task/${esc(src.id)}` : '#home'}">Huỷ</a></div>`,
  )
  bindFields($('#meta'), META, meta, () => {})
  app.querySelectorAll<HTMLFormElement>('form:not(#meta)').forEach((f, i) => bindFields(f, PARAM_GROUPS[i].fields, p, () => {}))
  const save = (): Task => {
    const task: Task = {
      id: editing?.id ?? `c-${Date.now().toString(36)}`,
      name: String(meta.name).trim() || 'Bài của tôi',
      desc: String(meta.desc),
      skills: { [meta.skill as Skill]: 1 },
      params: cleanParams(params),
      custom: true,
    }
    saveCustom([...loadCustom().filter((x) => x.id !== task.id), task])
    return task
  }
  $('[data-save]').addEventListener('click', () => go(`#task/${save().id}`))
  $('[data-save-play]').addEventListener('click', () => {
    const t = save()
    history.replaceState(null, '', `#task/${t.id}`)
    taskPage(t.id)
    playTask(t)
  })
  $('[data-export-code]').addEventListener('click', () => {
    const code = toCode({ name: meta.name, desc: meta.desc, skill: meta.skill, params: cleanParams(params) })
    $<HTMLTextAreaElement>('#code').value = code
    navigator.clipboard?.writeText(code).catch(() => {})
  })
  $('[data-import-code]').addEventListener('click', () => {
    try {
      const o = fromCode($<HTMLTextAreaElement>('#code').value)
      const task: Task = {
        id: `c-${Date.now().toString(36)}`,
        name: typeof o.name === 'string' && o.name.trim() ? o.name.slice(0, 60) : 'Bài được chia sẻ',
        desc: typeof o.desc === 'string' ? o.desc.slice(0, 400) : '',
        skills: { [o.skill in SKILLS ? (o.skill as Skill) : 'flick']: 1 },
        params: cleanParams(o.params),
        custom: true,
      }
      saveCustom([...loadCustom(), task])
      go(`#create/${task.id}`)
    } catch {
      alert('Mã bài không hợp lệ.')
    }
  })
}

// ---------------------------------------------------------------------------

function onKey(e: KeyboardEvent) {
  if (app.hidden || (e.target as HTMLElement).closest?.('input,textarea,select')) return
  if (location.hash === '#result' && last) {
    if (e.code === 'KeyR') playTask(last.task)
    else if ((e.code === 'Space' || e.code === 'Enter') && run && run.i < run.list.items.length) {
      e.preventDefault()
      playIndex()
    }
  }
}

export function start(root: HTMLElement) {
  app = root
  settings = loadSettings()
  window.addEventListener('hashchange', route)
  document.addEventListener('keydown', onKey)
  // Nút "Chơi" ở mọi màn đều dùng data-play, gắn một lần ở đây.
  app.addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-play]')?.dataset.play
    const t = id ? findTask(id) : undefined
    if (t) playTask(t)
  })
  route()
}
