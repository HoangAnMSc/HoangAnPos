# Quản lý hạn sử dụng tại Kho

## Nâng cấp cơ sở dữ liệu đang sử dụng

Chạy `supabase/migrations/202610200003_stock_expiry.sql` trong SQL Editor, sau hai migration quy đổi `202610200001_stock_conversions.sql` và `202610200002_stock_conversion_management.sql`.
Sau đó chạy `supabase/migrations/202610200004_cancel_order_deleted_products.sql` để chặn hủy hóa đơn chứa sản phẩm đã xóa. Nếu đã cài HSD, chỉ cần chạy thêm migration `202610200004` cho thay đổi này.
Chạy tiếp `supabase/migrations/202610200005_stock_expiry_management.sql` để nhập HSD cho tồn ban đầu, phân bổ theo SKU và xóa HSD. Nếu các migration trước đã được cài, chỉ chạy thêm `202610200005`. Migration này không sửa số lượng tồn hay xóa lịch sử; cột theo dõi mới thuộc bảng lô HSD, không thuộc bảng sản phẩm.
Migration HSD bổ sung bảng và hàm trong một giao dịch, có thể chạy lại. Trong lúc khởi tạo, các thao tác thay đổi tồn chờ giao dịch nâng cấp hoàn tất để số dư đầu kỳ được nhất quán.

**Không chạy `supabase/schema.sql` trên cơ sở dữ liệu đang có dữ liệu.** File đó dành cho cài mới và có lệnh xóa schema `public`.

Không thêm trường HSD vào bảng sản phẩm, không thay đổi giao diện Sản phẩm, không sửa số tồn, giá, đơn hàng hoặc lô cũ khi nâng cấp. HSD dùng các bảng riêng, liên kết sản phẩm, biến thể và lần nhập.

Nếu tổng lô cũ không vượt tồn thực tế, hệ thống sao chép số lượng và HSD còn ghi nhận được; phần thiếu được giữ dưới dạng chưa xác định. Nếu tổng lô cũ lớn hơn tồn thực tế, không thể biết chính xác phần nào đã bán: số dư đầu kỳ được để chưa xác định HSD, còn dữ liệu lô cũ vẫn nguyên vẹn. Có thể bổ sung ngày sau khi đối chiếu hàng thực tế.

## Sử dụng

- **Kho → Nhập kho:** quét EAN-13 bằng nút biểu tượng, nhập số lượng và bật **Có HSD** ở từng SKU cần theo dõi. Có thể xác nhận nhập hàng trước khi biết ngày HSD. Gửi lại cùng thao tác sau lỗi mạng không cộng tồn lần nữa.
- **Kho → HSD:** xem toàn bộ SKU đang sử dụng và SKU ngừng hoạt động còn tồn, tìm tên/biến thể/EAN-13, lọc danh mục hoặc HSD. Nút tải lại lấy số tồn mới nhất.
- Danh sách mobile hiện tên, giá trị biến thể, EAN-13, HSD gần nhất và tổng tồn. Bộ lọc được thu gọn bằng nút biểu tượng. Chạm dòng sản phẩm để xem tất cả HSD; mở **Nguồn hàng** khi cần xem từng lần nhập. Cùng SKU, cùng ngày được cộng số lượng để xem nhanh; chi tiết lần nhập vẫn được giữ riêng.
- Tab **Chờ nhập HSD** tập hợp hàng đã bật theo dõi nhưng chưa nhập ngày. Chọn **Nhập HSD**, nhập một hoặc nhiều ngày và số lượng. Có thể phân bổ một phần, không vượt quá số hàng đã chọn; phần chưa phân bổ tiếp tục chờ nhập HSD sau. Khi sửa một ngày, phần chưa phân bổ giữ nguyên ngày cũ.
- Hàng được tạo hoặc nhập ban đầu mà không theo dõi HSD có nút **Nhập HSD** ngay trên dòng. Chỉ gắn ngày cho hàng đang có thực tế; SKU có tồn bằng 0 hiển thị hướng dẫn nhập kho trước. Nếu tồn chưa có bản ghi HSD, hệ thống đối chiếu và tạo phần chưa xác định để phân bổ, không nhận hàng thêm lần nữa.
- Trong chi tiết sản phẩm, nút thùng rác bên cạnh một ngày cho phép **Xóa HSD** của toàn bộ số hàng còn lại ở ngày đó, kể cả ngày được nhập nhiều lần. Phần hàng này chuyển sang **không theo dõi HSD**, không chuyển sang chờ nhập. Các ngày khác, số tồn và nguồn nhập vẫn giữ nguyên. Có thể dùng **Nhập HSD** để theo dõi lại sau.

Trong **Cài đặt cảnh báo HSD**, chọn số ngày cảnh báo từ 0 đến 3650, mặc định 30:

- Xanh: số ngày còn lại lớn hơn mốc cảnh báo.
- Vàng: còn từ 0 đến mốc cảnh báo, bao gồm HSD hôm nay.
- Đỏ: ngày hiện tại đã qua HSD.

Danh sách chỉ tô màu dòng, không có icon cảnh báo hay cột Trạng thái. Nếu SKU có nhiều ngày, ưu tiên màu đỏ rồi vàng; hàng chờ nhập ngày dùng màu trung tính và có số lượng chờ để đối chiếu. Ngày được tính theo múi giờ Việt Nam (UTC+7).

## Phân quyền và biến động tồn

Trang **Vai trò → Kho** có hai quyền mới, độc lập:

- **Bổ sung, sửa và xóa HSD** (`warehouse.expiry.manage`).
- **Cài đặt cảnh báo HSD** (`warehouse.expiry.settings`).

Quyền **Kho** cho phép xem danh sách. Quyền nhập/xuất kho hiện có vẫn được kiểm tra riêng. Quản trị viên có sẵn các quyền; vai trò cũ không tự được cấp thêm quyền sửa HSD hoặc cài đặt cảnh báo. Backend kiểm tra quyền cho từng thao tác, không chỉ ẩn nút trên giao diện.

Bán hàng tự trừ HSD gần nhất còn hạn trước (FEFO); không yêu cầu người bán chọn lô. Hàng chưa rõ ngày được dùng sau các ngày đã biết. Hàng đã quá hạn không được dùng để bán nhưng có thể xuất kho để xử lý. Tổng tồn tại POS vẫn là tổng vật lý, nên giao dịch có thể báo thiếu hàng còn hạn dù SKU còn hàng hết hạn.

Hủy đơn hoàn lại đúng phần HSD đã trừ. Nếu một lần nhập được bổ sung ngày sau khi đã bán một phần, việc sửa chỉ áp dụng phần còn tồn; hủy đơn cũ không tự gán ngày mới cho phần hàng đã bán khi chưa rõ HSD. Đơn có trước khi cài HSD không đủ dữ liệu phân bổ sẽ được hoàn về phần chưa xác định ngày.
Xóa HSD cũng chỉ tác động hàng còn tồn. Nếu hủy một đơn đã bán trước khi xóa HSD, hàng hoàn vẫn mang HSD đã ghi trong lần bán, phần hàng đã ngừng theo dõi giữ nguyên lựa chọn đó.

Nếu bất kỳ sản phẩm trong hóa đơn đã bị xóa, backend từ chối hủy toàn bộ hóa đơn và thông báo tên sản phẩm. Không hoàn hàng, không thay đổi số lượng HSD, điểm khách hàng hoặc trạng thái hóa đơn. Sản phẩm chỉ ngừng bán, chưa xóa, vẫn được hoàn hàng khi hủy. Việc xóa hóa đơn đã thanh toán cũng dùng cùng kiểm tra vì thao tác đó hoàn hàng thông qua hàm hủy đơn. Không áp dụng chặn này cho hóa đơn đã hủy trước đó: gửi lại cùng yêu cầu vẫn không hoàn thêm hàng.

Quy đổi giữ từng HSD của hàng nguồn, không gộp ngày khác nhau thành một ngày. Chiều đóng gói yêu cầu đủ số lượng theo tỷ lệ trong cùng nhóm HSD: `6 lốc HSD A + 6 lốc HSD B` không được đóng thành một thùng 12 lốc; `6 + 6` cùng HSD từ hai lần nhập có thể gộp. Nếu không đủ nhóm hợp lệ, toàn bộ giao dịch quy đổi được hoàn tác.

Thay đổi tồn trực tiếp từ các API sản phẩm cũ cũng được đối chiếu cuối giao dịch. Phần tăng chưa xác định nguồn được ghi nhận chưa có HSD; phần giảm trừ ngày sớm trước. Không sửa lại lịch sử tồn cũ để đoán ngày đã xuất.

## Kiểm tra

`npm run build`, `npm run lint`, `npm test`.

Kiểm thử PostgreSQL dùng PGlite riêng, gồm nâng cấp giữ dữ liệu và chạy lại, phân quyền, nhập/chia nhiều HSD, gửi lại yêu cầu, sửa dữ liệu đã thay đổi, bán/hủy/khôi phục đơn, hàng hết hạn và quy đổi. Các kiểm thử không kết nối hay thay đổi dữ liệu Supabase đang sử dụng.
