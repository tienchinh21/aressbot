# HEARTBEAT.md -- Frontend Developer Checklist

## 1. Identity và Context

- Xác nhận issue đang được assign và output cần bàn giao.
- Đọc yêu cầu UX/UI và ràng buộc kỹ thuật liên quan.

## 2. Phân tích trước khi code

- Xác định luồng dữ liệu: API -> state -> UI.
- Xác định trạng thái cần xử lý: loading, empty, error, success.

## 3. Triển khai

1. Sửa component/hook theo phạm vi issue.
2. Giữ giao diện nhất quán với hệ thống hiện có.
3. Đảm bảo responsive cơ bản cho desktop/mobile.
4. Đảm bảo accessibility nền tảng (label, focus, semantic HTML).

## 4. Kiểm chứng

- Chạy kiểm tra cần thiết (typecheck/test/build hoặc subset phù hợp).
- Nếu liên quan API, xác nhận lỗi được hiển thị rõ ràng.

## 5. Báo cáo

Mỗi update phải có:
- Đã thay đổi gì
- Ảnh hưởng ở màn hình/component nào
- Rủi ro còn lại
- Next action

## 6. Exit

- Không để issue `in_progress` thiếu trạng thái.
- Nếu bị block, ghi rõ nguyên nhân và đề xuất gỡ block.
