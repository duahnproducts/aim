// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { RunResult } from './game'
import {
  DEFAULT_SETTINGS,
  addRun,
  exportAll,
  importAll,
  loadCustom,
  loadRuns,
  loadSettings,
  saveCustom,
  saveSettings,
} from './store'
import { cleanParams, type Task } from './tasks'

beforeEach(() => localStorage.clear())

describe('cài đặt', () => {
  it('chưa lưu gì thì dùng mặc định', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('lưu rồi đọc lại; trường sai kiểu thì lấy mặc định', () => {
    saveSettings({ ...DEFAULT_SETTINGS, sens: 0.35 })
    expect(loadSettings().sens).toBe(0.35)
    localStorage.setItem('tn.settings', JSON.stringify({ sens: 'nhanh', dpi: 1600 }))
    expect(loadSettings().sens).toBe(DEFAULT_SETTINGS.sens)
    expect(loadSettings().dpi).toBe(1600)
  })

  it('dữ liệu hỏng không làm sập app', () => {
    localStorage.setItem('tn.settings', '{hỏng')
    localStorage.setItem('tn.runs', '{hỏng')
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
    expect(loadRuns()).toEqual([])
  })
})

describe('lịch sử và sao lưu', () => {
  const run = { task: 'gridshot', score: 1234, date: 1 } as RunResult

  it('thêm lượt chơi rồi đọc lại', () => {
    addRun(run)
    addRun({ ...run, score: 2000 })
    expect(loadRuns().map((r) => r.score)).toEqual([1234, 2000])
  })

  it('xuất rồi nhập lại khôi phục đủ dữ liệu', () => {
    addRun(run)
    saveSettings({ ...DEFAULT_SETTINGS, dpi: 1600 })
    const backup = exportAll()
    localStorage.clear()
    expect(importAll(backup)).toBe(true)
    expect(loadRuns()).toHaveLength(1)
    expect(loadSettings().dpi).toBe(1600)
  })

  it('từ chối file không phải bản sao lưu của app', () => {
    expect(importAll('{"foo":1}')).toBe(false)
    expect(importAll('không phải json')).toBe(false)
  })
})

describe('bài tự tạo', () => {
  it('tham số lạ bị làm sạch về giới hạn an toàn', () => {
    const p = cleanParams({ count: 9999, weapon: 'laser', radius: -3, duration: 0, targetLimit: 0, ghost: true })
    expect(p.count).toBe(20)
    expect(p.weapon).toBe('click')
    expect(p.radius).toBe(0.05)
    expect(p.duration).toBe(60) // không có điểm dừng thì cho 60 giây
    expect(p.ghost).toBe(true)
  })

  it('đọc bài tự tạo đã lưu, bỏ bản ghi hỏng', () => {
    saveCustom([{ id: 'c1', name: 'Bài của tôi', params: { count: 4 } } as unknown as Task, { foo: 1 } as unknown as Task])
    const list = loadCustom()
    expect(list).toHaveLength(1)
    expect(list[0].params.count).toBe(4)
    expect(list[0].custom).toBe(true)
  })
})
