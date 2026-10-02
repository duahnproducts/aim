import { describe, expect, it } from 'vitest'
import { cmPer360, convert360, focalScale, gameById, hFov, vFov } from './sens'

describe('độ nhạy', () => {
  it('tính cm/360 theo yaw của game', () => {
    // Valorant 0.4 ở 800 DPI: 360 / (0.07 · 0.4 · 800) · 2.54
    expect(cmPer360(gameById('valorant'), 0.4, 800)).toBeCloseTo(40.82, 2)
    expect(cmPer360(gameById('cs2'), 1, 800)).toBeCloseTo(51.95, 2)
  })

  it('đổi sens giữa hai game giữ nguyên cm/360', () => {
    const val = gameById('valorant')
    const cs = gameById('cs2')
    const s = convert360(val, 0.4, cs)
    expect(s).toBeCloseTo(1.2727, 3)
    expect(cmPer360(cs, s, 800)).toBeCloseTo(cmPer360(val, 0.4, 800), 6)
    // đổi cả DPI: 800 → 1600 thì sens giảm một nửa
    expect(convert360(val, 0.4, val, 800, 1600)).toBeCloseTo(0.2, 6)
  })

  it('id lạ thì lùi về game đầu danh sách', () => {
    expect(gameById('khong-co').id).toBe('valorant')
  })
})

describe('FOV', () => {
  it('quy mọi kiểu FOV về FOV dọc', () => {
    expect(vFov(103, 'h169')).toBeCloseTo(70.53, 1) // Valorant
    expect(vFov(90, 'h43')).toBeCloseTo(73.74, 1) // CS2
    expect(vFov(70, 'v')).toBeCloseTo(70, 6)
  })

  it('FOV ngang ở màn 16:9 khớp lại với số đã nhập', () => {
    expect(hFov(vFov(103, 'h169'), 16 / 9)).toBeCloseTo(103, 6)
    expect(hFov(vFov(90, 'h43'), 16 / 9)).toBeCloseTo(106.26, 1)
  })

  it('cùng FOV thì hệ số monitor distance bằng 1', () => {
    expect(focalScale(70, 70)).toBeCloseTo(1, 9)
    expect(focalScale(70, 80)).toBeGreaterThan(1)
  })
})
