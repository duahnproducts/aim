// Vài biểu đồ SVG tự vẽ: đủ cho đúng những gì app cần, không kéo thêm thư viện.
// Màu lấy từ CSS (các lớp c-*), nên đổi giao diện không phải sửa ở đây.

const f1 = (n: number) => Math.round(n * 10) / 10

/** Đường điểm số theo thời gian. `marks`: các đường mốc ngang (ví dụ mốc hạng) kèm màu. */
export function line(values: number[], opts: { marks?: { v: number; color: string }[]; fmt?: (v: number) => string } = {}): string {
  const W = 600
  const H = 180
  const P = 8
  if (!values.length) return `<p class="muted">Chưa có dữ liệu.</p>`
  const fmt = opts.fmt ?? ((v: number) => String(Math.round(v)))
  const lo = Math.min(...values) * 0.95
  const hi = Math.max(...values) * 1.05 || 1
  const marks = (opts.marks ?? []).filter((m) => m.v >= lo && m.v <= hi)
  const x = (i: number) => (values.length === 1 ? W / 2 : P + ((W - 2 * P) * i) / (values.length - 1))
  const y = (v: number) => H - P - ((H - 2 * P) * (v - lo)) / (hi - lo || 1)
  const pts = values.map((v, i) => `${f1(x(i))},${f1(y(v))}`).join(' ')
  const last = values.length - 1
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Biểu đồ điểm">
    ${marks.map((m) => `<line x1="0" x2="${W}" y1="${f1(y(m.v))}" y2="${f1(y(m.v))}" stroke="${m.color}" class="c-mark"/>`).join('')}
    <polyline points="${pts}" class="c-line" vector-effect="non-scaling-stroke"/>
    <circle cx="${f1(x(last))}" cy="${f1(y(values[last]))}" r="4" class="c-dot"/>
  </svg><div class="chart-axis"><span>${fmt(Math.min(...values))}</span><span>cao nhất ${fmt(Math.max(...values))}</span></div>`
}

/** Mạng nhện kỹ năng, giá trị 0..max. */
export function radar(labels: string[], values: (number | null)[], max = 900): string {
  const S = 300
  const c = S / 2
  const R = 105
  const n = labels.length
  const pt = (i: number, r: number) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n
    return [c + r * Math.cos(a), c + r * Math.sin(a)]
  }
  const ring = (k: number) => labels.map((_, i) => pt(i, R * k).map(f1).join(',')).join(' ')
  const poly = values.map((v, i) => pt(i, (R * Math.min(max, v ?? 0)) / max).map(f1).join(',')).join(' ')
  return `<svg class="radar" viewBox="0 0 ${S} ${S}" role="img" aria-label="Hồ sơ kỹ năng">
    ${[0.25, 0.5, 0.75, 1].map((k) => `<polygon points="${ring(k)}" class="c-grid"/>`).join('')}
    ${labels.map((_, i) => `<line x1="${c}" y1="${c}" x2="${f1(pt(i, R)[0])}" y2="${f1(pt(i, R)[1])}" class="c-grid"/>`).join('')}
    <polygon points="${poly}" class="c-area"/>
    ${labels
      .map((l, i) => {
        const [x, y] = pt(i, R + 22)
        const anchor = Math.abs(x - c) < 5 ? 'middle' : x > c ? 'start' : 'end'
        return `<text x="${f1(x)}" y="${f1(y + 4)}" text-anchor="${anchor}" class="c-label">${l}</text>`
      })
      .join('')}
  </svg>`
}

/** Phân bố phát bắn quanh tâm mục tiêu (đơn vị: bán kính mục tiêu). */
export function scatter(points: { dx: number; dy: number; hit: boolean }[]): string {
  const L = 3
  const dots = points
    .filter((p) => Number.isFinite(p.dx) && Number.isFinite(p.dy))
    .slice(-400)
    .map((p) => {
      const x = Math.max(-L, Math.min(L, p.dx))
      const y = Math.max(-L, Math.min(L, -p.dy))
      return `<circle cx="${f1(x * 100) / 100}" cy="${f1(y * 100) / 100}" r="0.07" class="${p.hit ? 'c-hit' : 'c-miss'}"/>`
    })
    .join('')
  return `<svg class="scatter" viewBox="${-L} ${-L} ${2 * L} ${2 * L}" role="img" aria-label="Phân bố phát bắn">
    <circle cx="0" cy="0" r="1" class="c-target"/>
    <line x1="${-L}" x2="${L}" y1="0" y2="0" class="c-grid"/><line y1="${-L}" y2="${L}" x1="0" x2="0" class="c-grid"/>
    ${dots}
  </svg>`
}

/** Lưới 3×3 thời gian hạ trung bình theo vùng: xanh là nhanh, đỏ là chậm. */
export function heat(cells: (number | null)[]): string {
  const vals = cells.filter((v): v is number => v != null)
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  return `<div class="heat">${cells
    .map((v) => {
      if (v == null) return `<div class="heat-cell empty">—</div>`
      const k = hi > lo ? (v - lo) / (hi - lo) : 0
      return `<div class="heat-cell" style="background:hsl(${Math.round(130 - 130 * k)} 65% 38%)">${v}<small>ms</small></div>`
    })
    .join('')}</div>`
}

/** Cột theo thời gian (mỗi cột 5 giây). */
export function bars(values: number[], fmt: (v: number) => string): string {
  const hi = Math.max(...values, 1e-9)
  return `<div class="bars">${values
    .map((v) => `<div class="bar" title="${fmt(v)}"><i style="height:${Math.round((100 * v) / hi)}%"></i></div>`)
    .join('')}</div>`
}

/** Thước vượt quá / chưa tới. gain đơn vị bán kính mục tiêu. */
export function gauge(gain: number): string {
  const k = Math.max(-1, Math.min(1, gain))
  return `<div class="gauge"><div class="gauge-track"><i style="left:${50 + 50 * k}%"></i></div>
    <div class="gauge-axis"><span>Chưa tới</span><span>Đúng tâm</span><span>Vượt quá</span></div></div>`
}

/** Lịch tập kiểu GitHub: mỗi ô một ngày, đậm hơn là tập lâu hơn. */
export function calendar(days: Map<string, number>, key: (ts: number) => string, weeks = 20, now = Date.now()): string {
  const end = new Date(now)
  const start = new Date(now)
  // bắt đầu từ thứ Hai của tuần cách đây (weeks - 1) tuần
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 7 * (weeks - 1))
  const cells: string[] = []
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const sec = days.get(key(d.getTime())) ?? 0
    const lv = sec === 0 ? 0 : sec < 180 ? 1 : sec < 600 ? 2 : sec < 1200 ? 3 : 4
    cells.push(`<i class="l${lv}" title="${d.toLocaleDateString('vi-VN')}: ${Math.round(sec / 60)} phút"></i>`)
  }
  return `<div class="cal">${cells.join('')}</div>`
}
