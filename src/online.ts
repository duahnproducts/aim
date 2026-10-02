// Bảng xếp hạng online: gửi kỷ lục lên máy chủ (server.ts) dưới tên người chơi và đọc bảng về.
// File này không import gì để server.ts dùng chung được luật đặt tên.

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
export interface Player {
  name: string
  token: string // bí mật của trình duyệt này, chứng minh tên là của mình
}

export const NAME = /^[\p{L}\p{N} _.-]{2,20}$/u
export const cleanName = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ')

/** Mã ngẫu nhiên. Không dùng crypto.randomUUID vì nó không có khi mở qua http trong mạng LAN. */
export const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')

/** Gọi API; null nếu không tới được máy chủ (mở bằng file://, mất mạng, máy chủ tắt). */
async function api(path: string, body?: object): Promise<Response | null> {
  try {
    return await fetch(`/api/${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined)
  } catch {
    return null
  }
}

async function boardOf(res: Response | null): Promise<Board | 'taken' | null> {
  if (res?.status === 409) return 'taken'
  if (!res?.ok) return null
  try {
    return (await res.json()) as Board
  } catch {
    return null
  }
}

export async function claimName(p: Player): Promise<'ok' | 'taken' | 'offline'> {
  const res = await api('name', p)
  return res?.status === 409 ? 'taken' : res?.ok ? 'ok' : 'offline'
}

/** Gửi kỷ lục của một bài; máy chủ chỉ giữ điểm cao nhất của mỗi tên. Trả về bảng mới. */
export const submit = async (p: Player, task: string, score: number) => boardOf(await api('scores', { ...p, task, score }))

export const board = async (task: string, name: string) =>
  boardOf(await api(`scores?task=${encodeURIComponent(task)}&name=${encodeURIComponent(name)}`))
