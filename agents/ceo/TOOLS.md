# Tools

## Paperclip API Auth (local)

- Nếu thiếu `PAPERCLIP_API_KEY`, tạo key mới bằng:
  `pnpm --dir /Users/tienchinh21/Work/Me/paperclip paperclipai agent local-cli "$PAPERCLIP_AGENT_ID" --company-id "$PAPERCLIP_COMPANY_ID"`
- Lấy giá trị từ dòng `export PAPERCLIP_API_KEY='...'` rồi dùng header:
  `Authorization: Bearer $PAPERCLIP_API_KEY`
