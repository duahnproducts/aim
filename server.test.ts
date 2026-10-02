import { mkdtempSync, rmSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { server } from './server'

const dir = mkdtempSync(join(tmpdir(), 'tn-'))
const file = join(dir, 'scores.json')
let base = ''
let srv: ReturnType<typeof server>

const start = async () => {
  srv = server(file, join(dir, 'missing.html'))
  await new Promise<void>((r) => srv.listen(0, r))
  base = `http://localhost:${(srv.address() as AddressInfo).port}`
}
const stop = () => new Promise((r) => srv.close(r))
const post = (path: string, body: unknown) =>
  fetch(`${base}/api/${path}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) })
const an = { name: 'An', token: 'a'.repeat(32) }
const binh = { name: 'Bình', token: 'b'.repeat(32) }

beforeAll(start)
afterAll(async () => {
  await stop()
  rmSync(dir, { recursive: true, force: true })
})

describe('máy chủ xếp hạng', () => {
  it('giữ tên cho người đặt trước, không phân biệt hoa thường', async () => {
    expect((await post('name', an)).status).toBe(200)
    expect((await post('name', an)).status).toBe(200)
    expect((await post('name', { ...an, name: 'an', token: 'x'.repeat(32) })).status).toBe(409)
  })

  it('từ chối tên, bài, điểm sai và body hỏng', async () => {
    expect((await post('name', { ...an, name: 'a' })).status).toBe(400)
    expect((await post('name', { ...an, name: '<script>' })).status).toBe(400)
    expect((await post('name', { ...an, token: 'ngắn' })).status).toBe(400)
    expect((await post('scores', { ...an, task: 'Grid/../x', score: 1 })).status).toBe(400)
    expect((await post('scores', { ...an, task: 'gridshot', score: -1 })).status).toBe(400)
    expect((await post('scores', { ...an, task: 'gridshot', score: '9' })).status).toBe(400)
    expect((await post('scores', '{')).status).toBe(400)
    expect((await post('scores', 'x'.repeat(5000))).status).toBe(400)
    expect((await fetch(`${base}/`)).status).toBe(404)
  })

  it('chỉ giữ kỷ lục cao nhất mỗi tên và xếp hạng giảm dần', async () => {
    await post('scores', { ...an, task: 'gridshot', score: 50000 })
    await post('scores', { ...an, task: 'gridshot', score: 40000 })
    const res = await post('scores', { ...binh, task: 'gridshot', score: 60000 })
    const b = await res.json()
    expect(b.top.map((e: { name: string; score: number }) => [e.name, e.score])).toEqual([['Bình', 60000], ['An', 50000]])
    expect(b.me).toMatchObject({ name: 'Bình', rank: 1 })
    expect(b.total).toBe(2)
    expect((await post('scores', { ...an, token: binh.token, task: 'gridshot', score: 1e6 })).status).toBe(409)
  })

  it('đọc bảng theo tên và còn dữ liệu sau khi khởi động lại', async () => {
    await stop()
    await start()
    const b = await (await fetch(`${base}/api/scores?task=gridshot&name=an`)).json()
    expect(b.me).toMatchObject({ name: 'An', score: 50000, rank: 2 })
    expect((await fetch(`${base}/api/scores?task=khac`)).status).toBe(200)
  })
})
