// Thư viện bài tập dựng sẵn, mô phỏng theo các bài của Aim Lab và OKIAIMX.
// Mỗi bài chỉ là một bộ tham số cho game.ts, nên "Tạo bài" dùng lại đúng khung này.
import { DEFAULT_PARAMS, type TaskParams } from './game'

export type Skill = 'flick' | 'track' | 'switch' | 'speed' | 'precision' | 'perception'

export const SKILLS: Record<Skill, string> = {
  flick: 'Flick',
  track: 'Tracking',
  switch: 'Chuyển mục tiêu',
  speed: 'Tốc độ',
  precision: 'Chính xác',
  perception: 'Phản xạ & nhận biết',
}

export interface Task {
  id: string
  name: string
  skills: Partial<Record<Skill, number>> // trọng số cho hồ sơ kỹ năng; khoá đầu tiên là nhóm chính
  desc: string
  params: TaskParams
  custom?: boolean
  hidden?: boolean // không hiện trong thư viện (bài của công cụ tìm sens)
}

const t = (
  id: string,
  name: string,
  skills: Task['skills'],
  desc: string,
  params: Partial<TaskParams>,
  hidden = false,
): Task => ({ id, name, skills, desc, params: { ...DEFAULT_PARAMS, ...params }, hidden })

export const BUILTIN: Task[] = [
  // --- Flick tĩnh -------------------------------------------------------------
  t('gridshot', 'Gridshot', { flick: 1, speed: 1 },
    'Ba quả cầu lớn trên một lưới vô hình; hạ quả nào thì quả khác hiện ở ô trống. Luyện flick nhanh và nhịp bắn.',
    { count: 3, spawn: 'grid', cols: 4, rows: 4, spreadX: 10.5, spreadY: 9, radius: 0.45, refTime: 600, accWeight: 0.5 }),
  t('gridshot-precision', 'Gridshot Precision', { precision: 1, flick: 0.5 },
    'Như Gridshot nhưng mục tiêu nhỏ hơn nhiều và độ chính xác nặng ký trong điểm.',
    { count: 3, spawn: 'grid', cols: 5, rows: 5, spreadX: 12, spreadY: 10, radius: 0.24, refTime: 750, accWeight: 2 }),
  t('sixshot', 'Sixshot', { flick: 1, precision: 0.5 },
    'Sáu mục tiêu nhỏ cùng lúc trên tường. Hạ một quả, quả khác thế chỗ ở vị trí ngẫu nhiên.',
    { count: 6, spreadX: 14, spreadY: 8, radius: 0.22, refTime: 700 }),
  t('spidershot', 'Spidershot', { flick: 1, speed: 0.5 },
    'Luân phiên: một quả ở giữa, một quả văng ra xa ở hướng bất kỳ, xa gần và to nhỏ khác nhau. Luyện flick dài rồi về tâm.',
    { spawn: 'spider', spreadX: 35, spreadY: 18, minGap: 8, radius: 0.5, distanceJitter: 4, sizeJitter: 0.3, refTime: 700 }),
  t('spidershot-precision', 'Spidershot Precision', { precision: 1, flick: 0.5 },
    'Spidershot với mục tiêu nhỏ: flick xa nhưng phải dừng đúng chỗ.',
    { spawn: 'spider', spreadX: 35, spreadY: 18, minGap: 8, radius: 0.28, distanceJitter: 3, refTime: 850, accWeight: 2 }),
  t('microshot', 'Microshot', { precision: 1, flick: 0.5 },
    'Một mục tiêu rất nhỏ nhảy lòng vòng quanh tâm màn hình. Luyện các cú chỉnh tâm nhỏ (micro-flick).',
    { spreadX: 5, spreadY: 4, minGap: 1.5, radius: 0.18, refTime: 500, accWeight: 1.5 }),
  t('headline', 'Headshot Line', { precision: 1, flick: 0.5, perception: 0.3 },
    'Mục tiêu cỡ cái đầu, hiện ngẫu nhiên trên một đường ngang ngang tầm đầu ở 15 m. Luyện đặt tâm và flick ngang kiểu Valorant/CS2.',
    { spreadX: 30, spreadY: 1.5, minGap: 5, radius: 0.16, distance: 15, spawnDelay: 250, refTime: 650, accWeight: 1.5 }),
  t('sniper', 'Sniper Shot', { precision: 1, flick: 0.5 },
    'Mục tiêu nhỏ ở 30 m. Luyện flick tầm xa và dừng tay chính xác.',
    { spreadX: 25, spreadY: 6, minGap: 6, radius: 0.28, distance: 30, refTime: 900, accWeight: 2 }),
  t('adaptive-precision', 'Adaptive Precision', { precision: 1 },
    'Trúng thì mục tiêu nhỏ lại, trượt thì to ra: bài tự giữ bạn ở đúng giới hạn độ chính xác của mình.',
    { spreadX: 10, spreadY: 6, minGap: 3, radius: 0.35, adaptive: 'size', refTime: 700, accWeight: 2 }),
  t('360-flick', '360 Flick', { flick: 1, perception: 0.5 },
    'Mục tiêu hiện ở bất cứ đâu quanh bạn, kể cả sau lưng. Luyện xoay người nhanh và định hướng.',
    { spreadX: 180, spreadY: 30, minGap: 40, radius: 0.6, refTime: 1200 }),
  // --- Flick mục tiêu động -------------------------------------------------------
  t('motionshot', 'Motionshot', { flick: 1, track: 0.3 },
    'Ba mục tiêu di chuyển và đổi hướng bất chợt. Flick vào mục tiêu đang chạy.',
    { count: 3, spreadX: 20, spreadY: 10, motion: 'erratic', speed: 4, turnMin: 0.4, turnMax: 1.2, refTime: 700 }),
  t('doubleshot', 'Double Shot', { flick: 1, switch: 0.5 },
    'Mỗi mục tiêu cần hai phát. Luyện bắn lại ngay phát thứ hai mà không lệch tâm.',
    { count: 2, hp: 2, spreadX: 18, spreadY: 8, radius: 0.4, refTime: 800 }),
  // --- Chuyển mục tiêu -----------------------------------------------------------
  t('multishot', 'Multishot', { switch: 1, speed: 0.5 },
    'Từng đợt năm mục tiêu hiện cùng lúc; dọn sạch đợt này mới tới đợt sau. Luyện chuyển mục tiêu thật nhanh.',
    { count: 5, waves: true, spreadX: 20, spreadY: 10, radius: 0.35, refTime: 450 }),
  t('switchshot', 'Target Switch', { switch: 1, flick: 0.3 },
    'Bốn mục tiêu lướt ngang, mỗi quả cần ba phát. Hạ gọn từng quả rồi chuyển sang quả kế.',
    { count: 4, hp: 3, spreadX: 35, spreadY: 8, motion: 'strafe', speed: 3, refTime: 900 }),
  t('controlswitch', 'Controlswitch', { switch: 1, track: 0.5 },
    'Giữ chuột để xả đạn (10 viên/giây). Mục tiêu bay lắt léo và hồi máu nếu bạn bỏ dở — phải dứt điểm từng quả.',
    { count: 3, hp: 6, weapon: 'auto', fireRate: 10, regen: 4, spreadX: 30, spreadY: 12, motion: 'erratic', speed: 5, turnMin: 0.3, turnMax: 0.9, refTime: 1200 }),
  t('switchtrack', 'Switchtrack', { switch: 1, track: 0.5 },
    'Ba mục tiêu bay; giữ tâm trên một quả cho tới khi nó tan rồi chuyển sang quả khác.',
    { count: 3, hp: 1, weapon: 'track', spreadX: 30, spreadY: 12, motion: 'fly', speed: 4, turnMin: 0.5, turnMax: 1.5 }),
  // --- Tracking -------------------------------------------------------------------
  t('strafetrack', 'Strafetrack', { track: 1 },
    'Một quả cầu lướt qua lại và đổi hướng ngẫu nhiên như địch đang strafe. Chỉ cần giữ tâm trên nó, không cần bấm.',
    { hp: 3, weapon: 'track', motion: 'strafe', speed: 5, turnMin: 0.25, turnMax: 1, spreadX: 25, spreadY: 0, radius: 0.5 }),
  t('strafetrack-precision', 'Strafetrack Precision', { track: 1, precision: 0.5 },
    'Strafetrack với mục tiêu nhỏ: đòi hỏi bám thật mượt.',
    { hp: 3, weapon: 'track', motion: 'strafe', speed: 4, turnMin: 0.25, turnMax: 1, spreadX: 25, spreadY: 0, radius: 0.3 }),
  t('circletrack', 'Circletrack', { track: 1 },
    'Mục tiêu chạy vòng tròn và thỉnh thoảng đảo chiều. Luyện tracking theo đường cong.',
    { hp: 3, weapon: 'track', motion: 'circle', speed: 4, orbit: 6, turnMin: 1, turnMax: 2.5, spreadX: 15, spreadY: 10, radius: 0.5 }),
  t('smoothtrack', 'Smooth Track', { track: 1 },
    'Mục tiêu bay lượn mượt khắp không gian. Luyện tracking ổn định, đều tay.',
    { hp: 3, weapon: 'track', motion: 'fly', speed: 5, turnMin: 0.5, turnMax: 1.5, spreadX: 30, spreadY: 15, radius: 0.45 }),
  t('reactivetrack', 'Reactive Track', { track: 1, perception: 0.5 },
    'Viên thuốc cỡ người, giật hướng liên tục và rất nhanh. Luyện phản ứng khi bám mục tiêu khó đoán.',
    { hp: 3, weapon: 'track', motion: 'erratic', speed: 7, turnMin: 0.15, turnMax: 0.5, spreadX: 25, spreadY: 3, radius: 0.35, height: 0.9 }),
  // --- Phản xạ & nhận biết -----------------------------------------------------
  t('reflexshot', 'Reflexshot', { perception: 1, flick: 0.5 },
    '30 mục tiêu, mỗi quả chỉ hiện trong chốc lát. Trúng thì lần sau biến mất nhanh hơn, hụt thì chậm lại.',
    { targetLimit: 30, duration: 0, spawnDelay: 600, lifetime: 1000, adaptive: 'time', spreadX: 28, spreadY: 14, minGap: 6, radius: 0.42, refTime: 600 }),
  t('detection', 'Detection', { perception: 1 },
    '30 mục tiêu mờ hiện ở rìa tầm nhìn rồi biến mất. Luyện phát hiện bằng mắt ngoại vi.',
    { targetLimit: 30, duration: 0, spawnDelay: 900, lifetime: 1300, adaptive: 'time', spreadX: 45, spreadY: 25, minGap: 15, radius: 0.38, ghost: true, refTime: 700 }),
  t('friend-or-foe', 'Friend or Foe', { perception: 1, switch: 0.3 },
    'Mục tiêu xanh là địch, mục tiêu đỏ là đồng đội. Bắn nhầm bị trừ điểm. Luyện nhìn trước khi bóp cò.',
    { count: 3, decoys: 0.4, lifetime: 1500, spreadX: 25, spreadY: 12, radius: 0.42, refTime: 700 }),
  t('flash-dodge', 'Flash Dodge', { perception: 1, speed: 0.5 },
    'Một quả flash xuất hiện trước mặt: quay lưng lại (hơn 90°) trước khi nó nổ. Kiểu luyện né flash của OKIAIMX.',
    { targetLimit: 25, duration: 0, weapon: 'dodge', spawnDelay: 900, lifetime: 900, adaptive: 'time', spreadX: 40, spreadY: 15, radius: 0.25, distance: 8, refTime: 500 }),
  // --- Ẩn: dùng cho công cụ tìm độ nhạy ------------------------------------------
  t('finder-flick', 'Tìm sens · Flick', { flick: 1 }, 'Phần flick của bài tìm độ nhạy.',
    { duration: 20, spawn: 'spider', spreadX: 30, spreadY: 15, minGap: 10, radius: 0.4, refTime: 700 }, true),
  t('finder-track', 'Tìm sens · Tracking', { track: 1 }, 'Phần tracking của bài tìm độ nhạy.',
    { duration: 20, hp: 2, weapon: 'track', motion: 'fly', speed: 5, turnMin: 0.4, turnMax: 1.2, spreadX: 25, spreadY: 10 }, true),
]

export interface Playlist {
  id: string
  name: string
  items: string[]
  builtin?: boolean
}

export const BUILTIN_PLAYLISTS: Playlist[] = [
  { id: 'warmup', name: 'Khởi động 5 phút', items: ['gridshot', 'spidershot', 'microshot', 'strafetrack', 'circletrack'] },
  { id: 'ranked', name: 'Ranked Warmup (Valorant / CS2)', items: ['headline', 'microshot', 'reflexshot', 'strafetrack-precision', 'switchshot'] },
  { id: 'flick', name: 'Flick & tốc độ', items: ['gridshot', 'sixshot', 'spidershot', 'motionshot', 'multishot'] },
  { id: 'tracking', name: 'Tracking', items: ['strafetrack', 'circletrack', 'smoothtrack', 'reactivetrack', 'switchtrack'] },
  { id: 'precision', name: 'Chính xác', items: ['gridshot-precision', 'spidershot-precision', 'microshot', 'adaptive-precision', 'sniper'] },
  { id: 'benchmark', name: 'Đánh giá kỹ năng (Benchmark)', items: ['gridshot', 'spidershot-precision', 'strafetrack', 'switchtrack', 'reflexshot', 'multishot'] },
].map((p) => ({ ...p, builtin: true }))

/** Mô tả ngắn thông số của một bài, ví dụ "60 giây · 3 mục tiêu · bấm bắn". */
export function summary(p: TaskParams): string {
  const parts = [p.duration > 0 ? `${p.duration} giây` : `${p.targetLimit} mục tiêu`]
  if (p.count > 1) parts.push(`${p.count} mục tiêu cùng lúc`)
  parts.push(
    { click: 'bấm bắn', auto: `giữ chuột xả đạn ${p.fireRate}/s`, track: 'bám mục tiêu', dodge: 'quay lưng né' }[p.weapon],
  )
  if (p.motion !== 'static') parts.push('mục tiêu di chuyển')
  return parts.join(' · ')
}

const LIMITS: Partial<Record<keyof TaskParams, [number, number]>> = {
  duration: [0, 600], targetLimit: [0, 500], count: [1, 20], radius: [0.05, 5], height: [0, 5],
  sizeJitter: [0, 0.9], distance: [2, 100], distanceJitter: [0, 50], cols: [1, 10], rows: [1, 10],
  spreadX: [0, 180], spreadY: [0, 85], minGap: [0, 170], hp: [0.1, 100], fireRate: [1, 30], regen: [0, 100],
  speed: [0, 60], turnMin: [0.05, 10], turnMax: [0.05, 10], orbit: [0.5, 60], lifetime: [0, 10000],
  spawnDelay: [0, 10000], decoys: [0, 0.9], refTime: [100, 5000], accWeight: [0, 4],
}
const ENUMS: Partial<Record<keyof TaskParams, readonly string[]>> = {
  spawn: ['grid', 'random', 'spider'],
  weapon: ['click', 'auto', 'track', 'dodge'],
  motion: ['static', 'strafe', 'fly', 'erratic', 'circle'],
  adaptive: ['none', 'size', 'time'],
}

/** Làm sạch tham số đến từ ngoài (bài tự tạo, mã chia sẻ, file sao lưu): đúng kiểu, trong giới hạn. */
export function cleanParams(raw: unknown): TaskParams {
  const p = { ...DEFAULT_PARAMS } as Record<string, unknown>
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  for (const k of Object.keys(DEFAULT_PARAMS) as (keyof TaskParams)[]) {
    const v = src[k]
    const lim = LIMITS[k]
    const opts = ENUMS[k]
    if (lim && typeof v === 'number' && Number.isFinite(v)) p[k] = Math.min(lim[1], Math.max(lim[0], v))
    else if (opts && typeof v === 'string' && opts.includes(v)) p[k] = v
    else if (typeof v === 'boolean' && typeof DEFAULT_PARAMS[k] === 'boolean') p[k] = v
  }
  const out = p as unknown as TaskParams
  if (out.duration === 0 && out.targetLimit === 0) out.duration = 60
  out.turnMax = Math.max(out.turnMin, out.turnMax)
  out.count = Math.round(out.count)
  return out
}
