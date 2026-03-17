# API Contract v1

Base URL: `http://localhost:${API_PORT}` (mac dinh `3000`)

## 1) GET `/api/categories/default`

Tra danh muc mac dinh cho FE render nhanh.

Response `200`:

```json
{
  "data": [
    {
      "id": 1,
      "key": "salary",
      "name": "Luong",
      "type": "income",
      "isDefault": true
    }
  ]
}
```

## 2) POST `/api/transactions`

Tao giao dich thu/chi.

Request body:

```json
{
  "amount": 120000,
  "type": "expense",
  "categoryKey": "food",
  "note": "com trua",
  "happenedAt": "2026-03-16T08:00:00.000Z"
}
```

Rules:
- `amount > 0`
- `type` phai la `income | expense`
- `categoryKey` phai ton tai va dung voi `type`
- `happenedAt` phai la ISO datetime hop le

Response `201`:

```json
{
  "data": {
    "id": 1,
    "amount": 120000,
    "type": "expense",
    "categoryKey": "food",
    "categoryName": "An uong",
    "note": "com trua",
    "happenedAt": "2026-03-16T08:00:00.000Z",
    "createdAt": "2026-03-16T09:00:00.000Z"
  }
}
```

## 3) GET `/api/transactions?from=<iso>&to=<iso>`

Lay lich su giao dich, sort moi nhat.

Query:
- `from` (optional)
- `to` (optional)
- Neu co ca 2 tham so, `from <= to`

Response `200`:

```json
{
  "data": [
    {
      "id": 2,
      "amount": 25000,
      "type": "expense",
      "categoryKey": "food",
      "categoryName": "An uong",
      "note": "",
      "happenedAt": "2026-03-16T11:00:00.000Z",
      "createdAt": "2026-03-16T11:00:01.000Z"
    }
  ]
}
```

## 4) GET `/api/stats/summary?period=day|month&anchorDate=YYYY-MM-DD`

Lay thong ke tong thu/tong chi/chenh lech theo ngay hoac thang.

Query:
- `period`: `day` hoac `month` (mac dinh `month`)
- `anchorDate`: `YYYY-MM-DD` hoac ISO datetime (optional, mac dinh ngay hien tai UTC)

Response `200`:

```json
{
  "data": {
    "period": "day",
    "anchorDate": "2026-03-16",
    "from": "2026-03-16T00:00:00.000Z",
    "to": "2026-03-16T23:59:59.999Z",
    "totalIncome": 200000,
    "totalExpense": 70000,
    "net": 130000
  }
}
```

## Error response chung

Tat ca loi tra ve theo format:

```json
{
  "error": {
    "code": "INVALID_AMOUNT",
    "message": "amount must be a positive number.",
    "details": null
  }
}
```
