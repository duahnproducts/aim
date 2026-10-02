// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Game } from './game'
import { loadCustom, loadPlaylists, loadRuns, loadSettings } from './store'
import { BUILTIN } from './tasks'
import { recordRun, start } from './ui'

const app = document.createElement('div')
const tick = () => new Promise((r) => setTimeout(r, 0))
const goto = async (hash: string) => {
  location.hash = hash
  await tick()
}
const text = () => app.textContent ?? ''
const input = (sel: string, value: string) => {
  const el = app.querySelector<HTMLInputElement>(sel)!
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeAll(() => {
  window.scrollTo = () => {}
  document.body.append(app)
  start(app)
})

beforeEach(async () => {
  localStorage.clear()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  await goto('#home')
})

describe('thư viện bài', () => {
  it('hiện mọi bài dựng sẵn trừ bài ẩn', async () => {
    await goto('#stats')
    await goto('#home')
    const cards = app.querySelectorAll('.task')
    expect(cards).toHaveLength(BUILTIN.filter((t) => !t.hidden).length)
    expect(text()).toContain('Gridshot')
    expect(text()).not.toContain('Tìm sens · Flick')
  })

  it('lọc theo kỹ năng và tìm theo tên', async () => {
    app.querySelector<HTMLButtonElement>('[data-filter="track"]')!.click()
    const names = [...app.querySelectorAll('.task h3')].map((h) => h.textContent)
    expect(names).toContain('Strafetrack')
    expect(names).not.toContain('Gridshot')
    input('input[type=search]', 'circle')
    expect([...app.querySelectorAll('.task h3')].map((h) => h.textContent)).toEqual(['Circletrack'])
    input('input[type=search]', '')
    app.querySelector<HTMLButtonElement>('[data-filter="all"]')!.click()
  })

  it('trang bài có thang 8 hạng', async () => {
    await goto('#task/gridshot')
    expect(app.querySelectorAll('.ladder li')).toHaveLength(8)
    expect(text()).toContain('Thách Đấu')
  })
})

describe('kết quả', () => {
  it('lưu lượt chơi và hiện điểm, kỷ lục, lời khuyên', async () => {
    const task = BUILTIN.find((t) => t.id === 'gridshot')!
    const g = new Game(task.params, 1)
    for (let i = 0; i < 30; i++) {
      g.update(0.4, g.targets[0].pos.clone().normalize())
      g.trigger(true, g.targets[0].pos.clone().normalize())
    }
    recordRun(task, g.result(task.id, 40.8), g.shots)
    await tick()
    expect(location.hash).toBe('#result')
    expect(loadRuns()).toHaveLength(1)
    expect(text()).toContain('Kỷ lục mới!')
    expect(app.querySelector('.score')!.textContent).toBe(new Intl.NumberFormat('vi-VN').format(g.score))
    expect(app.querySelectorAll('.tips li').length).toBeGreaterThan(0)
    expect(app.querySelector('.scatter')).not.toBeNull()
  })
})

describe('cài đặt', () => {
  it('đổi sens thì lưu ngay và cập nhật cm/360', async () => {
    await goto('#settings/sens')
    input('#f-sens', '0.5')
    expect(loadSettings().sens).toBe(0.5)
    expect(app.querySelector('.sensinfo')!.textContent).toContain('32,7 cm/360')
  })

  it('chọn phòng tập thì đổi luôn bộ màu', async () => {
    await goto('#settings/visual')
    const sel = app.querySelector<HTMLSelectElement>('#f-theme')!
    sel.value = 'range'
    sel.dispatchEvent(new Event('change', { bubbles: true }))
    expect(loadSettings().wallColor).toBe('#b9b2a3')
  })
})

describe('công cụ', () => {
  it('đổi sens Valorant sang CS2', async () => {
    await goto('#tools')
    input('#cv-sens', '0.4')
    expect(app.querySelector('#cv-out')!.textContent).toContain('1,2727')
  })
})

describe('tạo bài', () => {
  it('nhân bản bài dựng sẵn, sửa thông số rồi lưu', async () => {
    await goto('#create/gridshot')
    input('#f-name', 'Gridshot to')
    input('#f-radius', '0.8')
    app.querySelector<HTMLButtonElement>('[data-save]')!.click()
    await tick()
    const mine = loadCustom()
    expect(mine).toHaveLength(1)
    expect(mine[0].name).toBe('Gridshot to')
    expect(mine[0].params.radius).toBe(0.8)
    expect(mine[0].params.spawn).toBe('grid')
    expect(location.hash).toBe(`#task/${mine[0].id}`)
  })

  it('mã chia sẻ tạo ra nhập lại được', async () => {
    await goto('#create/microshot')
    app.querySelector<HTMLButtonElement>('[data-export-code]')!.click()
    const code = app.querySelector<HTMLTextAreaElement>('#code')!.value
    expect(code.length).toBeGreaterThan(20)
    await goto('#create')
    app.querySelector<HTMLTextAreaElement>('#code')!.value = code
    app.querySelector<HTMLButtonElement>('[data-import-code]')!.click()
    await tick()
    expect(loadCustom()[0].name).toBe('Microshot (tuỳ chỉnh)')
  })
})

describe('lộ trình', () => {
  it('tạo lộ trình mới với hai bài', async () => {
    await goto('#playlist/new')
    input('#pl-name', 'Buổi sáng')
    const sel = app.querySelector<HTMLSelectElement>('#pl-add')!
    sel.value = 'sixshot'
    app.querySelector<HTMLButtonElement>('[data-add]')!.click()
    app.querySelector<HTMLSelectElement>('#pl-add')!.value = 'strafetrack'
    app.querySelector<HTMLButtonElement>('[data-add]')!.click()
    app.querySelector<HTMLButtonElement>('[data-up="1"]')!.click()
    app.querySelector<HTMLButtonElement>('[data-save]')!.click()
    await tick()
    expect(loadPlaylists()).toEqual([expect.objectContaining({ name: 'Buổi sáng', items: ['strafetrack', 'sixshot'] })])
    expect(text()).toContain('Buổi sáng')
  })
})

describe('xếp hạng', () => {
  it('hiện lượt của bạn trên bảng cùng người chơi ảo, đổi bài bằng ô chọn', async () => {
    await goto('#ranking/gridshot')
    expect(app.querySelectorAll('tbody tr')).toHaveLength(8)
    expect(text()).toContain('Bạn chưa chơi bài này')
    const task = BUILTIN.find((t) => t.id === 'gridshot')!
    const g = new Game(task.params, 1)
    recordRun(task, g.result(task.id, 60), [])
    await goto('#ranking/gridshot')
    expect(app.querySelectorAll('tbody tr')).toHaveLength(9)
    expect(app.querySelector('tr.hl')!.textContent).toContain('Bạn')
    expect(text()).toContain('trên 0/8 người chơi ảo')
    const sel = app.querySelector<HTMLSelectElement>('#rk-task')!
    sel.value = 'sixshot'
    sel.dispatchEvent(new Event('change'))
    await tick()
    expect(location.hash).toBe('#ranking/sixshot')
  })
})

describe('thống kê', () => {
  it('hiện hồ sơ kỹ năng và bảng theo bài sau khi có lượt chơi', async () => {
    const task = BUILTIN.find((t) => t.id === 'strafetrack')!
    const g = new Game(task.params, 1)
    for (let i = 0; i < 100; i++) g.update(0.05, g.targets[0]?.pos.clone().normalize() ?? g.aim)
    recordRun(task, g.result(task.id, 40), [])
    await goto('#stats')
    expect(app.querySelector('.radar')).not.toBeNull()
    expect(app.querySelector('table')!.textContent).toContain('Strafetrack')
  })
})
