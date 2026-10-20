# Quy đổi biến thể trong cùng sản phẩm

## Cài trên cơ sở dữ liệu đang có dữ liệu

Nếu đã cài chức năng quy đổi, chạy **chỉ** file `supabase/migrations/202610200002_stock_conversion_management.sql` trong SQL Editor để thêm xóa thiết lập và đổi sản phẩm khi sửa.
Nếu chưa cài, chạy `202610200001_stock_conversions.sql` rồi `202610200002_stock_conversion_management.sql` trong thư mục `supabase/migrations`.
Các migration bổ sung bảng, hàm và quyền; không xóa hoặc khởi tạo lại dữ liệu hiện có. Có thể chạy lại từng migration nâng cấp theo đúng thứ tự.
Không chạy lại `supabase/schema.sql`: đó là file cài mới có lệnh xóa schema `public`.

Trong trang **Vai trò**, nhóm **Kho** có hai quyền độc lập:

- **Thiết lập quy đổi** (`warehouse.conversion.configure`): thêm/sửa/xóa thiết lập, chọn lại sản phẩm, cặp biến thể và số lượng.
- **Thực hiện quy đổi** (`warehouse.conversion.execute`): thực hiện theo tỷ lệ đã lưu.

Quản trị viên có sẵn hai quyền. Quyền của các vai trò đang có được giữ nguyên; quản lý tự cấp quyền mới khi cần.

## Sử dụng

- Vào **Kho → Quy đổi**. Chỉ các tab được cấp quyền xuất hiện.
- **Thiết lập → Thêm** mở popup chọn sản phẩm dạng card, có tìm tên/biến thể/EAN-13 và lọc danh mục ở trên. Nhấn card để mở thiết lập hai biến thể và số lượng nguyên dương hai phía; có thể bấm **Đổi sản phẩm** để chọn lại trước khi lưu.
- Danh sách sử dụng card sản phẩm. Nhấn card trong tab Thiết lập để sửa; nếu có nhiều cặp, chọn cặp cần sửa.
- Khi sửa, **Đổi sản phẩm** mở lại danh sách card. Đổi sản phẩm yêu cầu chọn lại hai biến thể; chỉ khi lưu thì thiết lập cũ mới được cập nhật. Lịch sử đã thực hiện giữ thông tin sản phẩm và biến thể ban đầu.
- Nút **Xóa** trong popup sửa có bước xác nhận, chỉ xóa cặp thiết lập đang chọn. Các cặp khác, tồn kho và lịch sử đã thực hiện được giữ nguyên.
- Trong tab **Quy đổi**, chỉ có sản phẩm đã được thiết lập. Nhấn card, chọn cặp nếu có nhiều cặp, nhập số lượng nguồn và xem tồn trước/sau.
- Biểu tượng giữa hai phía trong thiết lập chỉ minh họa hai chiều. Trong popup thực hiện, cùng vị trí là nút **Đảo chiều quy đổi**.
- Với tỷ lệ `1 thùng ↔ 12 lốc`, chiều ngược yêu cầu số lốc là bội số của 12. Hệ thống không tự làm tròn, không cho tồn âm.

Backend kiểm tra lại quyền, sản phẩm/biến thể đang hoạt động, tỷ lệ và tồn mới nhất. Trừ nguồn, cộng đích, cập nhật lô và ghi lịch sử trong một giao dịch. Gửi lại cùng mã thao tác không trừ tồn lần nữa.
Giá bán, giá vốn và cấu hình sản phẩm không bị sửa. Các dòng lịch sử kho có lý do **Quy đổi** và cùng mã tham chiếu.
Khi chuyển lô, lô nhận dùng hạn sớm nhất trong các lô nguồn đã dùng; nếu có phần hàng không rõ hạn thì lô nhận không tự gán hạn.
Sau khi cài thêm [Quản lý HSD](stock-expiry.md), danh sách HSD theo dõi riêng từng ngày và số lượng được chuyển, kể cả nhiều HSD trong một lần quy đổi. Chiều đóng gói chỉ gộp đủ đơn vị trong cùng một ngày HSD.

## Kiểm tra

`npm run build`, `npm run lint`, `npm test`.
Kiểm thử PostgreSQL chạy trong PGlite riêng, không kết nối hoặc thay đổi dữ liệu Supabase đang sử dụng.
Kiểm thử tạo mã thao tác có bao gồm trình duyệt không có `crypto.randomUUID`, để popup vẫn mở khi truy cập web qua HTTP trong mạng nội bộ.
