/// <reference types="node" />
// Bảng xếp hạng online: một endpoint /api/ranking.
//   GET  ?task=&name=            → bảng của bài
//   POST {name, token}           → nhận tên (tên đã có chủ thì token phải khớp)
//   POST {name, token, task, score} → gửi kỷ lục, máy chủ chỉ giữ điểm cao nhất mỗi tên
// Trên Vercel lưu vào Upstash Redis; server.ts (chạy ở máy) dùng file JSON qua cùng handler.
// File này không import file nào khác của dự án: Vercel biên dịch từng hàm riêng, Node chạy thẳng file .ts.
// ponytail: không chống gian lận, không giới hạn tần suất gọi — thêm khi bị lạm dụng.

export interface Score {
  name: string
  score: number
  date: number
}
export interface Board {
  top: Score[]
  total: number
  me: (Score & { rank: number }) | null
}

export const NAME = /^[\p{L}\p{N} _.-]{2,20}$/u
export const cleanName = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ')
export const TOP = 50
const TASK = /^[a-z0-9-]{1,40}$/

/** Nơi lưu. `k` là tên viết thường. */
export interface Db {
  /** Tên còn trống thì nhận cho hash này; trả về true nếu tên thuộc về hash này. */
  claim(k: string, hash: string): Promise<boolean>
  /** Lưu điểm nếu cao hơn kỷ lục cũ của tên đó. */
  submit(task: string, k: string, s: Score): Promise<void>
  board(task: string, k: string): Promise<Board>
}

async function sha(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function handler(db: Db) {
  return async (req: Request): Promise<Response> => {
    const send = (status: number, body: unknown) => Response.json(body, { status })
    const url = new URL(req.url)
    let b: Record<string, unknown> = {}
    if (req.method === 'POST') {
      try {
        const text = await req.text()
        if (text.length > 2000) return send(400, { error: 'too big' })
        b = JSON.parse(text)
        if (!b || typeof b !== 'object') return send(400, { error: 'body' })
      } catch {
        return send(400, { error: 'body' })
      }
    } else if (req.method !== 'GET') return send(405, { error: 'method' })
    try {
      if (req.method === 'GET') {
        const task = url.searchParams.get('task') ?? ''
        if (!TASK.test(task)) return send(400, { error: 'task' })
        return send(200, await db.board(task, cleanName(url.searchParams.get('name') ?? '').toLowerCase()))
      }
      const name = cleanName(String(b.name ?? ''))
      const token = String(b.token ?? '')
      if (!NAME.test(name) || token.length < 16 || token.length > 100) return send(400, { error: 'name' })
      const k = name.toLowerCase()
      const isScore = 'task' in b
      const task = String(b.task ?? '')
      const score = b.score
      if (isScore && (!TASK.test(task) || typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1e7))
        return send(400, { error: 'score' })
      if (!(await db.claim(k, await sha(token)))) return send(409, { name })
      if (!isScore) return send(200, { name })
      await db.submit(task, k, { name, score: Math.round(score as number), date: Date.now() })
      return send(200, await db.board(task, k))
    } catch {
      return send(503, { error: 'storage' }) // chưa cấu hình hoặc không tới được nơi lưu
    }
  }
}

/**
 * Upstash Redis qua REST (Vercel → Storage → Upstash cấp sẵn biến môi trường).
 * Mỗi bài một sorted set tên → điểm (ZADD GT chỉ ghi khi cao hơn, nguyên tử), tên hiển thị và ngày nằm trong một hash.
 */
export function redisDb(url: string, token: string, f: typeof fetch = fetch): Db {
  async function run(...cmds: (string | number)[][]): Promise<unknown[]> {
    const res = await f(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(cmds),
    })
    if (!res.ok) throw new Error(`redis ${res.status}`)
    const out = (await res.json()) as { result?: unknown; error?: string }[]
    return out.map((x) => {
      if (x.error) throw new Error(x.error)
      return x.result
    })
  }
  const meta = (v: unknown) => {
    try {
      return JSON.parse(String(v)) as { name: string; date: number }
    } catch {
      return null
    }
  }
  return {
    async claim(k, hash) {
      const [, owner] = await run(['SET', `tn:name:${k}`, hash, 'NX'], ['GET', `tn:name:${k}`])
      return owner === hash
    },
    async submit(task, k, s) {
      const [changed] = await run(['ZADD', `tn:b:${task}`, 'GT', 'CH', s.score, k])
      if (changed) await run(['HSET', `tn:m:${task}`, k, JSON.stringify({ name: s.name, date: s.date })])
    },
    async board(task, k) {
      const [flat, total, rank, score, mine] = (await run(
        ['ZREVRANGE', `tn:b:${task}`, 0, TOP - 1, 'WITHSCORES'],
        ['ZCARD', `tn:b:${task}`],
        ['ZREVRANK', `tn:b:${task}`, k],
        ['ZSCORE', `tn:b:${task}`, k],
        ['HGET', `tn:m:${task}`, k],
      )) as [string[], number, number | null, string | null, string | null]
      const keys = flat.filter((_, i) => i % 2 === 0)
      const metas = keys.length ? ((await run(['HMGET', `tn:m:${task}`, ...keys]))[0] as (string | null)[]) : []
      const top = keys.map((key, i) => ({ name: meta(metas[i])?.name ?? key, score: Number(flat[2 * i + 1]), date: meta(metas[i])?.date ?? 0 }))
      const m = meta(mine)
      return {
        top,
        total,
        me: rank == null || score == null ? null : { name: m?.name ?? k, score: Number(score), date: m?.date ?? 0, rank: rank + 1 },
      }
    },
  }
}

/** Hàm Vercel. Chưa nối Upstash thì trả 503 để app báo "không kết nối được". */
async function vercel(req: Request): Promise<Response> {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return Response.json({ error: 'storage not configured' }, { status: 503 })
  return handler(redisDb(url, token))(req)
}
export { vercel as GET, vercel as POST }
