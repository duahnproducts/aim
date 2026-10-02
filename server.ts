/// <reference types="node" />
// Chạy app ở máy (không cần Vercel): phục vụ bản build và /api/ranking, lưu bảng xếp hạng vào một file JSON.
// Dùng chung handler với hàm Vercel (api/ranking.ts). Chỉ cần Node 24 (chạy thẳng file .ts).
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname } from 'node:path'
import { TOP, handler, type Db, type Score } from './api/ranking.ts'

interface Data {
  names: Record<string, string> // tên (chữ thường) → sha256 của token
  scores: Record<string, Record<string, Score>> // bài → tên (chữ thường) → kỷ lục
}

// ponytail: ghi lại cả file mỗi lần có điểm mới — đủ cho chạy ở máy; trên web đã dùng Redis.
export function fileDb(file: string): Db {
  let db: Data = { names: {}, scores: {} }
  try {
    db = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    // chưa có file: bắt đầu trống
  }
  const persist = () => {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(`${file}.tmp`, JSON.stringify(db))
    renameSync(`${file}.tmp`, file) // đổi tên là nguyên tử: tắt máy giữa chừng không làm hỏng file cũ
  }
  return {
    async claim(k, hash) {
      if (db.names[k] == null) {
        db.names[k] = hash
        persist()
      }
      return db.names[k] === hash
    },
    async submit(task, k, s) {
      const own = (db.scores[task] ??= {})
      if ((own[k]?.score ?? -1) >= s.score) return
      own[k] = s
      persist()
    },
    async board(task, k) {
      const list = Object.values(db.scores[task] ?? {}).sort((a, b) => b.score - a.score || a.date - b.date)
      const i = list.findIndex((e) => e.name.toLowerCase() === k)
      return { top: list.slice(0, TOP), total: list.length, me: i < 0 ? null : { ...list[i], rank: i + 1 } }
    },
  }
}

export function server(file: string, page = 'dist/index.html') {
  const api = handler(fileDb(file))
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    let out: Response
    if (url.pathname === '/api/ranking') {
      const chunks: Buffer[] = []
      for await (const c of req) chunks.push(c as Buffer)
      out = await api(new Request(url, { method: req.method, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined }))
    } else if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      try {
        out = new Response(readFileSync(page, 'utf8'), { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
      } catch {
        out = new Response('Chưa có bản build: chạy npm run build', { status: 404 })
      }
    } else out = new Response('Not found', { status: 404 })
    res.writeHead(out.status, Object.fromEntries(out.headers))
    res.end(Buffer.from(await out.arrayBuffer()))
  })
}

if (import.meta.main) {
  const port = Number(process.env.PORT) || 3000
  server(process.env.DATA ?? 'data/scores.json').listen(port, () => console.log(`Tâm Ngắm: http://localhost:${port}`))
}
