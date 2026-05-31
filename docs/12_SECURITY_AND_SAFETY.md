# 12 — Security and Safety

## 1. Never expose to kiosk

- import price
- valuation rate
- profit/margin
- supplier terms
- internal notes
- customer data
- debt
- API keys

## 2. Staff restrictions

Staff normally cannot see:

- import price
- profit
- supplier cost
- admin settings

## 3. API checklist

- whitelist output fields
- validate inputs
- enforce roles
- no raw DocType to public
- no stack trace leaks

## 4. Chemical safety

For chemical products:

```text
Lưu ý: Đọc kỹ hướng dẫn trên nhãn sản phẩm trước khi sử dụng. Để xa trẻ em, vật nuôi, thức ăn và nguồn nước. Không tự ý tăng liều hoặc trộn với sản phẩm khác nếu chưa có hướng dẫn rõ ràng.
```

## 5. POS Awesome risk

If POS Awesome is used:

- test after every upgrade
- do not patch core without documenting
- keep native POS ready
- do not store unique business data only there
