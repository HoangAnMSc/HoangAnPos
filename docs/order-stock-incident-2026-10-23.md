# Sự cố tồn Sữa chua Hoff ngày 23/10/2026

Đối chiếu bằng truy vấn chỉ đọc vào database cấu hình trong dự án. Không thay đổi
đơn hàng, số lượng hoặc lịch sử trên database thật trong lần kiểm tra này.

Đơn `HD-20261023-24448` có 4 SKU Sữa chua Hoff, mỗi SKU 2 sản phẩm.
Thời gian dưới đây theo múi giờ Asia/Bangkok (UTC+7):

| Thời gian | Thao tác | Biến động mỗi SKU |
| --- | --- | ---: |
| 20:38:45 | Tạo đơn | -2 |
| 21:22:23 | Hủy đơn | +2 |
| 21:23:35 | Lưu sản phẩm | -2 |
| 21:33:33 | Chuyển đơn về Thành công | -2 |

Hủy đơn đã hoàn đủ 8 sản phẩm. Sau đó `save_product_engine` nhận số tồn cũ từ
biểu mẫu sản phẩm và ghi đè số tồn mới, tạo thêm 4 bút toán
`Điều chỉnh tồn khi cập nhật sản phẩm`, mỗi bút toán -2. Đây là nguyên nhân
thiếu thêm 8 sản phẩm. Tồn SKU và tổng tồn lô HSD đang khớp nhau; cả hai cùng
đã phản ánh các bút toán điều chỉnh sai.

Tại thời điểm kiểm tra, đơn đang ở trạng thái Thành công sau thao tác khôi phục:

| SKU | Tồn ghi nhận | Tồn nếu giữ đơn Thành công và loại bỏ lần ghi đè sai | Tồn nếu đơn kết thúc ở trạng thái Đã hủy |
| --- | ---: | ---: | ---: |
| SUA_CHUA_HOFF-002 | 6 | 8 | 10 |
| SUA_CHUA_HOFF-003 | 0 | 2 | 4 |
| SUA_CHUA_HOFF-004 | 7 | 9 | 11 |
| SUA_CHUA_HOFF-005 | 7 | 9 | 11 |

Các số đối chiếu chỉ đúng với lịch sử đã đọc. Trước khi sửa dữ liệu cần đọc lại
giao dịch mới, xác định trạng thái đơn cần giữ và đối chiếu tồn thực tế. Không
chỉ hủy lại đơn để bù lỗi ghi đè: việc đó chỉ đảo bút toán khôi phục đơn, còn
4 bút toán điều chỉnh sai vẫn tồn tại. Khi sửa phải có bút toán bù riêng và
hoàn về đúng lô HSD đã bị trừ; không xóa lịch sử cũ.

## Bản sửa

- Biểu mẫu giữ `expected_stock_quantity` từ lúc mở, bao gồm trong bản nháp và
  khi chuyển SKU đơn sang tổ hợp.
- Database khóa SKU khi lưu. Nếu trường số lượng không được sửa, giữ tồn
  hiện tại dù đã có bán hàng, hoàn đơn, nhập hoặc quy đổi.
- Nếu người dùng sửa số lượng, chỉ áp dụng khi tồn hiện tại còn khớp số tồn
  lúc mở biểu mẫu. Dữ liệu xung đột bị từ chối nguyên giao dịch với thông báo
  `STOCK_CHANGED`; quyền nhập/xuất kho vẫn được kiểm tra.
- Biểu mẫu cũ thiếu số tồn đối chiếu không được ghi thay đổi vào tồn SKU cũ.
  Tạo SKU mới vẫn hỗ trợ tồn đầu kỳ.

Áp dụng `supabase/migrations/202610230001_product_stock_concurrency.sql` qua
Supabase SQL Editor rồi triển khai mã ứng dụng mới. Migration có thể chạy lại,
không thay đổi số lượng hiện tại và không tự sửa dữ liệu của sự cố này.
Không chạy lại `supabase/schema.sql` trên database đang sử dụng.

Kiểm thử PostgreSQL nằm ở `tests/product-stock-concurrency.test.mjs`, bao gồm
tái hiện việc mất 8 sản phẩm sau hủy đơn, lưu thông tin khi có bán hàng mới,
xung đột điều chỉnh tồn, bản nháp cũ, phân quyền và tính toàn vẹn khi nâng cấp.
