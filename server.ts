/// <reference types="node" />
// Máy chủ bảng xếp hạng online: lưu kỷ lục theo tên người chơi vào một file JSON và phục vụ luôn
// bản build (dist/index.html). Chỉ dùng thư viện chuẩn của Node 24 (chạy thẳng file .ts).
// ponytail: không chống gian lận, không giới hạn tần suất gọi — đặt sau reverse proxy có rate limit nếu mở ra internet.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage } from 'node:http'
import { dirname } from 'node:path'
import { NAME, cleanName, type Board, type Score } from './src/online.ts'

interface Db {
  names: Record<string, string> // tên (chữ thường) → sha256 của token
  scores: Record<string, Record<string, Score>> // bài → tên (chữ thường) → kỷ lục
}

const TASK = /^[a-z0-9-]{1,40}$/
const TOP = 50
const MAX_NAMES = 10000
const MAX_TASKS = 100

const key = (name: string) => name.toLowerCase()
const sha = (s: string) => createHash('sha256').update(s).digest('hex')

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let s = ''
  for await (const chunk of req) {
    s += chunk
    if (s.length > 2000) throw new Error('too big')
  }
  const v = JSON.parse(s)
  if (!v || typeof v !== 'object') throw new Error('not an object')
  return v
}

export function server(file: string, page = 'dist/index.html') {
  let db: Db = { names: {}, scores: {} }
  try {
    db = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    // chưa có file: bắt đầu trống
  }
  // ponytail: ghi lại cả file mỗi lần có điểm mới, ổn tới vài nghìn người chơi; đông hơn thì chuyển sang node:sqlite.
  const persist = () => {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(`${file}.tmp`, JSON.stringify(db))
    renameSync(`${file}.tmp`, file) // đổi tên là nguyên tử: tắt máy giữa chừng không làm hỏng file cũ
  }

  /** Tên còn trống thì nhận cho token này; đã có chủ thì token phải khớp. */
  function claim(name: string, token: string): number {
    const k = key(name)
    if (db.names[k] == null) {
      if (Object.keys(db.names).length >= MAX_NAMES) return 507
      db.names[k] = sha(token)
      persist()
    }
    return db.names[k] === sha(token) ? 200 : 409
  }

  function board(task: string, name: string): Board {
    const list = Object.values(db.scores[task] ?? {}).sort((a, b) => b.score - a.score || a.date - b.date)
    const i = list.findIndex((e) => key(e.name) === key(name))
    return { top: list.slice(0, TOP), total: list.length, me: i < 0 ? null : { ...list[i], rank: i + 1 } }
  }

  return createServer(async (req, res) => {
    const send = (status: number, body: unknown, type = 'application/json; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type': type })
      res.end(typeof body === 'string' ? body : JSON.stringify(body))
    }
    const url = new URL(req.url ?? '/', 'http://x')
    try {
      if (req.method === 'GET' && url.pathname === '/api/scores') {
        const task = url.searchParams.get('task') ?? ''
        if (!TASK.test(task)) return send(400, { error: 'task' })
        return send(200, board(task, cleanName(url.searchParams.get('name') ?? '')))
      }
      if (req.method === 'POST' && (url.pathname === '/api/name' || url.pathname === '/api/scores')) {
        const b = await readJson(req)
        const name = cleanName(String(b.name ?? ''))
        const token = String(b.token ?? '')
        if (!NAME.test(name) || token.length < 16 || token.length > 100) return send(400, { error: 'name' })
        if (url.pathname === '/api/name') {
          const status = claim(name, token)
          return send(status, { name })
        }
        const task = String(b.task ?? '')
        const score = b.score
        if (!TASK.test(task) || typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1e7)
          return send(400, { error: 'score' })
        if (!db.scores[task] && Object.keys(db.scores).length >= MAX_TASKS) return send(507, { error: 'full' })
        const status = claim(name, token)
        if (status !== 200) return send(status, { name })
        const own = (db.scores[task] ??= {})
        if ((own[key(name)]?.score ?? -1) < score) {
          own[key(name)] = { name, score: Math.round(score), date: Date.now() }
          persist()
        }
        return send(200, board(task, name))
      }
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        let html: string
        try {
          html = readFileSync(page, 'utf8')
        } catch {
          return send(404, 'Chưa có bản build: chạy npm run build', 'text/plain; charset=utf-8')
        }
        return send(200, html, 'text/html; charset=utf-8')
      }
      send(404, { error: 'not found' })
    } catch {
      send(400, { error: 'bad request' })
    }
  })
}

if (import.meta.main) {
  const port = Number(process.env.PORT) || 3000
  server(process.env.DATA ?? 'data/scores.json').listen(port, () => console.log(`Tâm Ngắm: http://localhost:${port}`))
}
