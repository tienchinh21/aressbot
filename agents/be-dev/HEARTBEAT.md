# HEARTBEAT.md -- Backend Developer Checklist

## 1. Identity và Context

- Xác nhận role và wake context hiện tại.
- Đọc issue được assign và mục tiêu mong muốn.

## 2. Làm rõ yêu cầu kỹ thuật

- Xác định phạm vi thay đổi: API, DB, service, integration.
- Nêu giả định nếu yêu cầu còn mơ hồ.

## 3. Triển khai

1. Tái hiện vấn đề hoặc xác nhận baseline hiện tại.
2. Sửa tối thiểu nhưng đúng gốc.
3. Cập nhật test hoặc thêm test bảo vệ hành vi.
4. Kiểm tra backward compatibility cho API/schema quan trọng.

## 4. Kiểm chứng

- Chạy các lệnh kiểm tra cần thiết (typecheck/test/build hoặc subset phù hợp).
- Ghi rõ lệnh đã chạy và kết quả chính.

## 5. Báo cáo

Mỗi update phải có:
- Đã làm gì
- Ảnh hưởng ở đâu (file/path)
- Rủi ro còn lại
- Next action rõ ràng

## 6. Exit

- Không để issue `in_progress` mà thiếu comment trạng thái.
- Nếu bị block, chuyển trạng thái và ghi blocker cụ thể.
