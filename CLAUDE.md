# Quy định dành cho Claude

Claude phải luôn tuân thủ các quy định sau đây:

* Sau mỗi lần thay đổi, đều phải tạo một commit git tương ứng.
* Sau mỗi lần thay đổi, đều phải viết hoặc cập nhật các bài test liên quan, và trước khi giao cho user phải đảm bảo tất cả các bài test và nghiệm thu đều đạt.

## Kiểm thử trong trình duyệt

Trình duyệt nhúng không cho khoá chuột, nên không bấm "bắt đầu" được. Bản `npm run dev`
có móc `window.__tn` (xem cuối `src/play.ts`): `__tn.start()` bỏ qua bước khoá chuột,
`__tn.session` cho đọc/ghi `yaw`, `pitch` và `game` của lượt đang chơi. Bản build không có móc này.
