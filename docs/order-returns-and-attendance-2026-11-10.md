# Hoàn hóa đơn, tiền két đang mở và nhiều ca chấm công

## Cập nhật database đang sử dụng

Chạy lần lượt trong Supabase SQL Editor, trước khi triển khai giao diện:

1. `supabase/migrations/202611100001_order_returns_and_open_drawer.sql`
2. `supabase/migrations/202611100002_multiple_attendance_shifts.sql`

Hai migration giữ nguyên dữ liệu hiện có và có thể chạy lại. `schema.sql` đã bao
gồm chúng cho cài mới; không chạy lại `schema.sql` trên database đang dùng vì file
đó xóa schema `public`.

Nếu migration 2 bản trước báo `Unexpected clock-in function; upgrade was not
applied`, mở lại file `202611100002_multiple_attendance_shifts.sql` đã cập nhật
và chạy toàn bộ file từ đầu. Bản sửa dùng `CREATE OR REPLACE FUNCTION`, không
còn so khớp chuỗi mã nguồn của hàm cũ nên chạy được với cả CRLF/LF và cách thụt
lề khác nhau. Chỉ cần chạy lại migration 2 nếu migration 1 đã thành công.

## Hành vi sau cập nhật

- Hủy/xóa hóa đơn thành công hoàn số lượng từng dòng SKU, gồm cả quà tặng, đúng
  một lần. Xóa hóa đơn đã hủy không hoàn lần nữa. Tồn SKU, lô HSD, điểm khách và
  trạng thái hóa đơn được cập nhật trong cùng giao dịch.
- Hủy nhiều hóa đơn chạy trong một giao dịch: một hóa đơn lỗi sẽ hủy toàn bộ
  thao tác. Hóa đơn thiếu SKU hoặc chứa sản phẩm đã xóa được báo lỗi trước khi
  thay đổi tiền/hàng. Quyền xóa hóa đơn đủ để xóa hóa đơn thành công; không mở
  thêm quyền gọi chức năng hủy độc lập.
- Tiền hoàn lấy theo `orders.total` đã thanh toán, không lấy tiền khách đưa.
  Hóa đơn tiền mặt của ca hiện tại tự giảm tổng bán tiền mặt. Hóa đơn ca cũ được
  trừ vào tiền két hiện tại hoặc số bàn giao nếu không có ca mở. Khôi phục hóa
  đơn thực hiện chiều ngược lại. Hóa đơn chuyển khoản không thay đổi tiền mặt.
- Tổng bán tiền mặt/chuyển khoản của từng ca phản ánh hóa đơn còn hiệu lực.
  Tiền thực đếm, tiền dự kiến và chênh lệch lúc chốt ca giữ lại ảnh chụp lịch sử;
  điều chỉnh/hoàn tiền sau đó đi vào số dư hiện tại.
- Admin có thể đặt số tiền mặt thực tế khi nhân viên đang mở ca. Điều chỉnh
  được cộng vào số dư của ca hiện tại; không xóa điều chỉnh của các ca khác.
  Hóa đơn phát sinh sau đó tiếp tục cộng/trừ bình thường và chốt ca sử dụng số
  dư đã điều chỉnh. Vai trò khác vẫn bị chặn khi két nhân viên đang mở.
- Một nhân viên có thể vào/tan nhiều ca trong cùng ngày, nhưng chỉ có một ca
  đang mở. Mỗi ca có bản ghi và đối soát riêng. Lịch cá nhân và bảng toàn bộ
  nhân viên hiển thị tất cả ca cùng ngày; tổng ca đếm từng bản ghi.

## Giới hạn dữ liệu cũ

Migration không tự bù các sai lệch đã phát sinh trước đây: không thể xác định
chắc chắn khoản hoàn hoặc điều chỉnh nào đã được thực hiện bên ngoài hệ thống.
Cần đối chiếu riêng nếu muốn sửa dữ liệu lịch sử.

## Phiếu lương PNG theo tháng

Vào **Chấm công → Xuất dữ liệu → Xuất phiếu lương PNG**, chọn tháng và nhân
viên. Đơn giá mặc định là **200.000đ/ngày**, có thể sửa ngay trên phiếu.

- Số ngày làm đếm các ngày chấm công riêng biệt của nhân viên trong tháng,
  gồm cả ngày có ca đang mở. Nhiều ca cùng ngày chỉ tính một ngày; ca qua đêm
  thuộc ngày vào ca được lưu trong `work_date`.
- Lương kỳ này = số ngày làm × lương/ngày. Nhập từng khoản trừ với tên và số
  tiền, chẳng hạn “Tạm ứng lần 1”, “Tạm ứng lần 2”. Thực nhận = lương kỳ này −
  tổng khoản trừ; không tự đưa số âm về 0.
- Xem trước phiếu theo bố cục hai cột của mẫu rồi tải PNG. Tên khoản trừ dài
  được xuống dòng; ảnh tăng chiều cao để giữ đủ nội dung.
- Khoản trừ nhập cho lần xuất hiện tại, không ghi vào database. Đóng cửa sổ
  phiếu lương sẽ bỏ các khoản vừa nhập. Thay nhân viên/tháng khi cửa sổ còn mở
  giữ riêng thông tin đang nhập của từng người/tháng.
- Chức năng dùng quyền `attendance.export` hiện có. Lỗi tải dữ liệu hoặc số
  tiền chưa hợp lệ sẽ chặn xuất phiếu, tránh tạo bảng lương từ dữ liệu thiếu.

Phần phiếu lương không cần migration mới ngoài hai migration ở trên để hỗ trợ
nhiều ca chấm công.

## Kiểm tra

`npm run lint`, `npm test`, `npm run build`.

`tests/order-returns-and-attendance.test.mjs` thực thi PostgreSQL bằng PGlite
với schema/policy/trigger thật, kiểm tra tính lặp an toàn, hoàn qua bàn giao,
quyền admin/xóa độc lập, hoàn SKU/quà tặng/HSD, hủy nhóm và nhiều ca cùng ngày.

`tests/payroll-export.test.mjs` kiểm tra tính lương theo tháng, không cộng trùng
ngày, khoản trừ, năm nhuận, dữ liệu không hợp lệ và tải đủ các trang chấm công.

`tests/attendance-migration-compatibility.test.mjs` giữ nguyên kiểu xuống dòng
của SQL để tái hiện lỗi migration trên Windows; kiểm tra nâng cấp/chạy lại với
CRLF, LF và hàm cũ được định dạng khác, giữ nguyên lịch sử/đối soát và quyền
chấm công.
