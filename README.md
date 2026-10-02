# Tâm Ngắm — luyện aim

Phần mềm luyện aim chạy trong trình duyệt, mô phỏng theo Aim Lab và OKIAIMX. Dùng một mình,
không cần tài khoản, không cần mạng.

## Mở

```bash
npm install
npm run build
```

Ra **một file duy nhất** `dist/index.html`. Copy đi đâu cũng được, double-click là chơi.
Dùng **Chrome hoặc Edge** để có chuyển động chuột thô (raw input) và khoá chuột ổn định.

Đang sửa code thì chạy `npm run dev` rồi mở địa chỉ Vite in ra (chạy thêm `npm run server` nếu cần bảng online).

### Web và bảng xếp hạng online

Web chạy trên Vercel (https://aimxnxx.vercel.app), tự deploy mỗi khi `main` trên GitHub thay đổi.
Bảng online là hàm Vercel `api/ranking.ts`, lưu vào **Upstash Redis**: vào Vercel → project →
**Storage** → thêm Upstash Redis và nối với project (Vercel tự đặt `KV_REST_API_URL`, `KV_REST_API_TOKEN`),
rồi Redeploy. Chưa nối thì app vẫn chạy, chỉ báo không kết nối được bảng online.

Chạy ở máy không cần Vercel: `npm start` build rồi mở `http://localhost:3000` (`server.ts`, Node 24),
lưu bảng vào `data/scores.json` (đổi bằng `PORT`, `DATA`). Mở `dist/index.html` trực tiếp thì không có bảng online.

Tên là của trình duyệt đặt nó trước (giữ bằng một mã bí mật trong localStorage, có trong file sao lưu).
Chưa chống gian lận và chưa giới hạn tần suất gọi.

## Đưa lên mạng

Chạy trên **Vercel**. `vercel.json` bắt Vercel chạy test trước khi build, test lỗi thì không deploy.

- Deploy thẳng từ máy: `npx vercel --prod` (lần đầu sẽ hỏi đăng nhập và tên dự án).
- Hoặc nối repo GitHub: vercel.com → Add New → Project → chọn repo. Từ đó mỗi lần push lên
  `main` là tự deploy, nhánh khác có link xem thử riêng.

Bản build chỉ là một file tĩnh, dữ liệu người chơi nằm trong trình duyệt của từng người, không cần server.

## Có gì

- **25 bài**: Gridshot, Sixshot, Spidershot, Microshot, Headshot Line, Sniper, 360 Flick,
  Motionshot, Double Shot, Multishot, Target Switch, Controlswitch, Switchtrack, Strafetrack,
  Circletrack, Smooth Track, Reactive Track, Reflexshot, Detection, Friend or Foe, Flash Dodge…
  (kèm bản Precision và Adaptive tự chỉnh độ khó).
- **Hạng 8 bậc** cho từng bài (Sắt → Thách Đấu) và **hồ sơ 6 kỹ năng**: flick, tracking,
  chuyển mục tiêu, tốc độ, chính xác, phản xạ.
- **Bảng xếp hạng online** của từng bài, theo tên người chơi, ngay trong trang chi tiết bài.
- **Phân tích sau mỗi lượt**: phân bố phát bắn, vượt quá / chưa tới, tốc độ theo vùng màn hình,
  phong độ theo thời gian, lời khuyên.
- **Lộ trình** (playlist) dựng sẵn và tự tạo, có bài đánh giá kỹ năng.
- **Độ nhạy theo game** (Valorant, CS2, Apex, Overwatch 2, CoD, Fortnite, R6, Marvel Rivals…),
  FOV, đổi sens giữa các game, **tìm sens** bằng cách chơi thử 5 mức.
- Tâm ngắm, màu mục tiêu, âm thanh, phòng tập tuỳ chỉnh; đo phản xạ; thử thách mỗi ngày;
  lịch tập và chuỗi ngày.
- **Tạo bài** từ mọi thông số, chia sẻ bằng mã.

Dữ liệu nằm trong trình duyệt (localStorage). Vào **Thống kê → Xuất dữ liệu** để sao lưu.

## Cách tính

- Điểm = tổng điểm mỗi lần hạ (100, thêm tới 100 nếu hạ nhanh hơn mốc của bài) × độ chính xác
  mũ một hệ số của bài. Bài tracking: 100 điểm mỗi giây bám trúng.
- Mốc hạng do **người chơi ảo** (`src/bot.ts`) tạo ra: nó chơi đúng luật như người, ngắm theo
  định luật Fitts, ở 8 trình độ; điểm của nó ở mỗi trình độ là mốc của hạng đó. Nhờ vậy bài
  tự tạo cũng có hạng. Mốc là ước lượng, không phải số liệu của Aim Lab.

## Mã nguồn

| File | Việc |
| --- | --- |
| `src/game.ts` | Luật chơi: sinh mục tiêu, di chuyển, bắn, tính điểm, phân tích phát bắn |
| `src/tasks.ts` | Thư viện bài, lộ trình, làm sạch thông số bài tự tạo |
| `src/bot.ts` | Người chơi ảo và mốc hạng |
| `src/stats.ts` | Hạng, hồ sơ kỹ năng, chuỗi ngày, lời khuyên, tìm sens |
| `src/sens.ts` | Độ nhạy, cm/360, FOV |
| `src/store.ts` | Cài đặt và lịch sử trong localStorage |
| `src/online.ts`, `api/ranking.ts`, `server.ts` | Bảng xếp hạng online: trình duyệt, hàm Vercel + Redis, máy chủ chạy ở máy |
| `src/view.ts`, `src/play.ts` | Vẽ 3D, khoá chuột, vòng lặp chơi, HUD, tâm ngắm |
| `src/ui.ts`, `src/charts.ts` | Các màn hình menu và biểu đồ |

`npm test` chạy toàn bộ test (luật chơi, bot, hạng, lưu trữ, giao diện, máy chủ).
