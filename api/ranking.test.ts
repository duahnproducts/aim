import { describe, expect, it } from 'vitest'
import { handler, redisDb, upstashEnv } from './ranking'

// Upstash giả: trả lời theo tên lệnh, ghi lại các lệnh đã nhận.
function fakeUpstash(answers: Record<string, unknown>) {
  const sent: (string | number)[][] = []
  const f = (async (_url: string, init: RequestInit) => {
    const cmds = JSON.parse(init.body as string) as (string | number)[][]
    sent.push(...cmds)
    return Response.json(cmds.map((c) => ({ result: answers[c[0]] ?? null })))
  }) as typeof fetch
  return { sent, db: redisDb('https://kv.test', 'secret', f) }
}

const req = (body?: object, query = '') =>
  new Request(`https://x.test/api/ranking${query}`, body ? { method: 'POST', body: JSON.stringify(body) } : undefined)

describe('Redis', () => {
  it('đọc bảng: tách WITHSCORES, ghép tên hiển thị và hạng của mình', async () => {
    const { db } = fakeUpstash({
      ZREVRANGE: ['binh', '600', 'an', '500'],
      ZCARD: 2,
      ZREVRANK: 1,
      ZSCORE: '500',
      HGET: JSON.stringify({ name: 'An', date: 5 }),
      HMGET: [JSON.stringify({ name: 'Bình', date: 7 }), JSON.stringify({ name: 'An', date: 5 })],
    })
    expect(await db.board('gridshot', 'an')).toEqual({
      top: [{ name: 'Bình', score: 600, date: 7 }, { name: 'An', score: 500, date: 5 }],
      total: 2,
      me: { name: 'An', score: 500, date: 5, rank: 2 },
    })
  })

  it('gửi điểm: nhận tên bằng SET NX, ghi điểm bằng ZADD GT, chỉ cập nhật tên/ngày khi điểm tăng', async () => {
    const token = 'a'.repeat(32)
    const hash = '3ba3f5f43b92602683c19aee62a20342b084dd5971ddd33808d81a328879a547' // sha256 của token
    const { sent, db } = fakeUpstash({ GET: hash, ZADD: 1, ZREVRANGE: [], ZCARD: 0 })
    const res = await handler(db)(req({ name: ' An ', token, task: 'gridshot', score: 41.6 }))
    expect(res.status).toBe(200)
    expect(sent).toContainEqual(['SET', 'tn:name:an', hash, 'NX'])
    expect(sent).toContainEqual(['ZADD', 'tn:b:gridshot', 'GT', 'CH', 42, 'an'])
    expect(sent.find((c) => c[0] === 'HSET')?.[3]).toContain('"name":"An"')
  })

  it('tên của người khác thì 409, lỗi kho dữ liệu thì 503, chưa cấu hình thì 503', async () => {
    expect((await handler(fakeUpstash({ GET: 'khac' }).db)(req({ name: 'An', token: 'a'.repeat(32) }))).status).toBe(409)
    const down = redisDb('https://kv.test', 's', (async () => new Response('', { status: 500 })) as unknown as typeof fetch)
    expect((await handler(down)(req(undefined, '?task=gridshot'))).status).toBe(503)
    const { GET } = await import('./ranking')
    expect((await GET(req(undefined, '?task=gridshot'))).status).toBe(503)
  })
})

describe('biến môi trường', () => {
  it('nhận mọi tiền tố Vercel đặt cho Upstash, báo riêng khi chỉ có Redis TCP', () => {
    const c = { url: 'https://u', token: 't' }
    expect(upstashEnv({ KV_REST_API_URL: 'https://u', KV_REST_API_TOKEN: 't', KV_URL: 'rediss://x' })).toEqual(c)
    expect(upstashEnv({ STORAGE_REST_API_URL: 'https://u', STORAGE_REST_API_TOKEN: 't' })).toEqual(c)
    expect(upstashEnv({ UPSTASH_REDIS_REST_URL: 'https://u', UPSTASH_REDIS_REST_TOKEN: 't' })).toEqual(c)
    expect(upstashEnv({ REDIS_URL: 'redis://x' })).toBe('tcp-only')
    expect(upstashEnv({ PATH: '/bin' })).toBeNull()
  })
})
