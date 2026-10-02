import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'

// Gộp JS và CSS vào thẳng index.html. Nhờ vậy bản build là MỘT file, mở bằng
// double-click (file://) vẫn chạy — trình duyệt chặn <script type=module src> trên file://.
// App không tách chunk nên chỉ có đúng một file JS và một file CSS.
function singleFile(): Plugin {
  return {
    name: 'single-file',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const html = bundle['index.html']
      if (!html || html.type !== 'asset') return
      let page = String(html.source)
      for (const [name, item] of Object.entries(bundle)) {
        if (item.type === 'chunk') {
          // `</script` trong mã sẽ đóng thẻ sớm. Dùng hàm thay thế để `$&` trong mã không bị hiểu nhầm.
          const code = item.code.replace(/<\/script/gi, '<\\/script')
          page = page.replace(/<script[^>]*\ssrc="[^"]*"[^>]*><\/script>/, () => `<script type="module">${code}</script>`)
          delete bundle[name]
        } else if (name.endsWith('.css')) {
          page = page.replace(/<link[^>]*rel="stylesheet"[^>]*>/, () => `<style>${String(item.source)}</style>`)
          delete bundle[name]
        }
      }
      html.source = page
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [singleFile()],
  // `npm run dev` / `preview` chuyển /api sang máy chủ xếp hạng (npm run server).
  server: { proxy: { '/api': 'http://localhost:3000' } },
  build: { modulePreload: false, cssCodeSplit: false, chunkSizeWarningLimit: 2000 },
  test: { include: ['src/**/*.test.ts', 'api/**/*.test.ts', 'server.test.ts'] },
})
