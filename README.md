# Hoang An POS

Trang quản trị bán hàng dùng ReactJS, Tailwind CSS, Supabase và Cloudinary.

## Tính năng

- Đăng nhập bằng Supabase Auth, tự lưu phiên đăng nhập bằng Supabase session.
- Phân quyền admin qua bảng `profiles.role`.
- POS: chọn sản phẩm, gắn khách hàng, giảm giá, tạo hóa đơn và trừ tồn kho.
- Quỹ & đối soát: số cuối ca tự động bàn giao sang ca sau, chỉ một ca được mở trên két, tự động tách tiền mặt/chuyển khoản và lưu mọi chênh lệch theo nhân viên.
- Khách hàng: thêm, sửa, xóa, tìm kiếm.
- Sản phẩm: thêm, sửa, xóa, tìm kiếm, upload ảnh lên Cloudinary.
- Layout và component UI tái sử dụng: button, input, modal, card, badge, empty state.

## Chạy dự án

```bash
npm install
npm run dev
```

Tạo file `.env` từ `.env.example`:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

## Supabase

1. Mở Supabase SQL Editor.
2. Chạy toàn bộ file `supabase/schema.sql`.
3. Tạo user trong Authentication.
4. Gán quyền admin cho user đầu tiên. Không chạy nguyên chữ `USER_UUID`; hãy thay bằng UUID thật trong Supabase Authentication:

```sql
update public.profiles
set role = 'admin', is_active = true
where id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'::uuid;
```

Hoặc gán admin theo email để đỡ phải copy UUID:

```sql
update public.profiles p
set role = 'admin', is_active = true
from auth.users u
where p.id = u.id
  and u.email = 'hoanganmsc@gmail.com';
```

Có thể kiểm tra danh sách user và role bằng:

```sql
select p.id, u.email, p.role
from public.profiles p
join auth.users u on u.id = p.id
order by p.created_at desc;
```

De trang quan ly user tao/sua/xoa duoc tai khoan Auth, can them `SUPABASE_SERVICE_ROLE_KEY` vao `.env` khi chay local va vao Environment Variables tren Vercel. Day la server-side secret, khong doi thanh `VITE_SUPABASE_SERVICE_ROLE_KEY` va khong commit gia tri that len git. Sau khi them tren Vercel, redeploy project de API route doc duoc bien moi truong moi.

### Cau hinh OTP quen mat khau

- Trong **Authentication > Email Templates > Magic Link**, dung bien `{{ .Token }}` de email chua ma OTP 6 so, vi du: `<p>Ma OTP cua ban: {{ .Token }}</p>`. Neu template dung `{{ .ConfirmationURL }}`, Supabase se gui lien ket thay vi ma OTP.
- Quen mat khau chi gui OTP qua email, khong dung SMS va khong can Twilio. Nhan vien khong co email phai nho quan ly dat lai mat khau trong trang Nhan vien.
- De gui OTP den email nhan vien trong moi truong thuc te, cau hinh **Custom SMTP** trong Supabase thay vi dich vu email mac dinh bi gioi han.
- OTP khong tao tai khoan moi (`shouldCreateUser: false`). Sau khi xac thuc OTP va doi mat khau, ung dung dang xuat phien OTP de nhan vien dang nhap lai bang mat khau moi.

Nếu đã có database trước đó, hãy chạy lại `supabase/schema.sql` để cập nhật bảng quỹ, nhật ký kiểm toán, danh sách quyền và các policy bảo mật. Sau cập nhật, mỗi nhân viên phải mở ca tại trang **Quỹ & đối soát** trước khi tạo hóa đơn mới. Tiền thực đếm đầu ca phải khớp số cuối ca trước; chỉ người có quyền **Xác nhận lệch bàn giao** mới được chấp nhận chênh lệch kèm lý do.

### Phân quyền đối soát két trước khi bán

- Gán quyền **Bắt buộc đối soát két trước khi bán** cho vai trò nhân viên phải vào ca, xác nhận tiền đầu ca và chốt két.
- Không gán quyền này cho vai trò Chủ hoặc người chỉ bán phụ. Các vai trò đó vẫn cần quyền **Bán hàng / tạo hóa đơn**, nhưng không bị POS yêu cầu mở ca két.
- Tài khoản Admin luôn được miễn bước đối soát. Nếu đang có két của nhân viên mở, hóa đơn bán phụ của Chủ/Admin vẫn được cộng vào két đang mở để đối soát đúng doanh thu.
- Sau khi cập nhật mã nguồn, chạy lại `supabase/schema.sql` trong Supabase SQL Editor để áp dụng ràng buộc ở database.
- Quyền **Xem lịch sử đối soát** hiển thị nút chuông lịch sử trên trang Quỹ & đối soát. Kết hợp thêm **Xem đối soát toàn bộ nhân viên** nếu vai trò được phép xem lịch sử của cả đội.

## Cloudinary

Ảnh được upload bằng chữ ký ngắn hạn do API đã xác thực tạo ra; không dùng unsigned upload preset. Ảnh sản phẩm được lưu trong folder `hoang-an-pos/products`.

De xoa anh truc tiep tren Cloudinary tu trang quan ly anh, deploy Supabase Edge Function:

```bash
supabase functions deploy delete-cloudinary-image
supabase secrets set CLOUDINARY_CLOUD_NAME=your-cloud-name
supabase secrets set CLOUDINARY_API_KEY=your-api-key
supabase secrets set CLOUDINARY_API_SECRET=your-api-secret
```

Neu deploy tren Vercel, app dung API route `api/cloudinary-images.js` de liet ke toan bo anh Cloudinary va xoa anh. Khai bao 3 bien moi truong server-side trong Vercel:

```bash
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

API key và secret chỉ được đặt ở môi trường server, tuyệt đối không đặt tên biến bắt đầu bằng `VITE_` và không commit giá trị thật.

## Scripts

```bash
npm run dev
npm run lint
npm run build
```
