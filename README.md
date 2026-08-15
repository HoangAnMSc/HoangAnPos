# Hoàng An POS

Ứng dụng quản lý bán hàng sử dụng React, Vite, Supabase và Cloudinary.

## Cài đặt lần đầu

### 1. Yêu cầu

- Node.js 20 trở lên.
- Một dự án Supabase.
- Một tài khoản Cloudinary.

### 2. Cài dependency

Sau khi clone hoặc pull dự án về máy mới:

```bash
npm ci
```

`ws` đã được khai báo trong `package.json` và `package-lock.json`, vì vậy không cần cài riêng để sửa lỗi WebSocket trên Node.js 20.

Trên Windows, hãy tắt `npm run dev` trước khi chạy `npm ci`; tiến trình Vite đang chạy có thể khóa `esbuild.exe` và gây lỗi `EPERM`.

### 3. Tạo file môi trường

Sao chép `.env.example` thành `.env`, sau đó điền giá trị thật:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

Không đổi `SUPABASE_SERVICE_ROLE_KEY` hoặc các secret Cloudinary thành biến bắt đầu bằng `VITE_`. Các biến `VITE_` được đưa vào trình duyệt và không được dùng để chứa secret.

### 4. Khởi tạo Supabase

`supabase/schema.sql` là schema cài mới và tự xóa toàn bộ schema `public` trước khi khởi tạo. Không chạy file này nếu cần giữ dữ liệu.

1. Mở **SQL Editor**.
2. Chạy toàn bộ file `supabase/schema.sql` đúng một lần. File tự làm sạch schema cũ, không cần chạy lệnh reset riêng.
3. Mở **Authentication > Users** và tạo tài khoản quản trị đầu tiên.
4. Lấy UUID của tài khoản vừa tạo và chạy:

```sql
update public.profiles
set
  role = 'admin',
  role_id = (select id from public.app_roles where code = 'admin'),
  is_active = true
where id = 'UUID_TAI_KHOAN'::uuid;
```

Logic khôi phục hồ sơ tài khoản cũ và gán `role_id` đã nằm chung trong
`supabase/schema.sql`; không cần chạy thêm file SQL riêng.

Các lệnh reset đã nằm ở đầu `schema.sql`:

```sql
drop schema if exists public cascade;
create schema public;
grant all on schema public to postgres, service_role;
grant usage on schema public to anon, authenticated;
```

Các lệnh trên xóa toàn bộ bảng, hàm, policy và dữ liệu trong schema `public`.

`supabase/schema.sql` đã bao gồm toàn bộ Product Engine, tồn kho SKU, POS,
Promotion/Voucher, tích điểm, phân quyền, cấu hình card và dữ liệu khởi tạo.
Với database cài mới bằng file này, không cần chạy thêm migration SQL.

`product_variants` là nguồn duy nhất cho giá và tồn kho. File schema là bản cài
mới có tính phá hủy dữ liệu trong `public`; nếu database đang có dữ liệu thật,
không chạy lại `schema.sql`. Hãy backup rồi chỉ chạy migration nâng cấp tương ứng
trong `supabase/migrations`. Migration
`202608140001_warehouse_product_audit.sql` bổ sung lịch sử tồn đầu kỳ, giữ tên/SKU
sau khi ẩn sản phẩm và chặn ẩn sản phẩm vẫn còn tồn kho.
Migration `20260815_customer_purchase_history.sql` bổ sung quyền đọc lịch sử mua hàng,
ảnh sản phẩm và SKU trong hồ sơ khách hàng mà không làm mất dữ liệu hiện có.

Tài khoản trong **Authentication > Users** không bị xóa khi reset `public`. Schema luôn gán `hoanganmsc@gmail.com` làm Admin đang hoạt động; các tài khoản hiện có còn lại trở thành Staff.

### 5. Cấu hình email quên mật khẩu

Trong **Supabase > Authentication > Email Templates > Magic Link**, dùng `{{ .Token }}` để email chứa mã OTP, ví dụ:

```html
<p>Mã OTP của bạn: {{ .Token }}</p>
```

Ứng dụng chỉ gửi OTP qua email. Nhân viên không có email cần nhờ quản lý đặt lại mật khẩu. Khi chạy production, nên cấu hình **Custom SMTP** trong Supabase.

### 6. Dọn Cloudinary cũ

Ứng dụng chỉ sử dụng bốn thư mục sau:

- `hoang-an-pos/products`
- `hoang-an-pos/payment-qr`
- `hoang-an-pos/payment-proofs`
- `hoang-an-pos/cash-reconciliation`

Các thư mục được tạo tự động khi có ảnh đầu tiên. Trong Cloudinary Media Library, có thể xóa thủ công nội dung và thư mục cũ sau:

- `hoang-an-pos/invoices`
- `hoang-an-pos/receipts`
- `hoang-an-pos/attendance`

Mọi ảnh upload được chuyển thành WebP và nén mạnh ở mức `q_20`.

### 7. Chạy ứng dụng

```bash
npm run dev
```

## Triển khai Vercel

Khai báo đầy đủ các biến sau trong **Project Settings > Environment Variables**:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

Sau khi thay đổi biến môi trường, hãy redeploy. API quản lý nhân viên và API Cloudinary cần các biến server-side ở trên.

## Các lệnh thường dùng

```bash
npm run dev
npm run lint
npm run build
npm run preview
```

- Dùng `npm ci` sau khi clone/pull trên máy khác.
- Chỉ dùng `npm install` khi chủ động thêm, xóa hoặc cập nhật dependency và cần cập nhật `package-lock.json`.
