# Hoang An POS

Trang quản trị bán hàng dùng ReactJS, Tailwind CSS, Supabase và Cloudinary.

## Tính năng

- Đăng nhập bằng Supabase Auth, tự lưu phiên đăng nhập bằng Supabase session.
- Phân quyền admin qua bảng `profiles.role`.
- POS: chọn sản phẩm, gắn khách hàng, giảm giá, tạo hóa đơn và trừ tồn kho.
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
CLOUDINARY_UPLOAD_PRESET=your-unsigned-upload-preset
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
set role = 'admin'
where id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'::uuid;
```

Hoặc gán admin theo email để đỡ phải copy UUID:

```sql
update public.profiles p
set role = 'admin'
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

Neu da co database truoc do, hay chay lai `supabase/schema.sql` de cap nhat bang role, danh sach permission chi tiet va cac policy `has_permission()`.

## Cloudinary

Tạo unsigned upload preset trong Cloudinary và điền vào `CLOUDINARY_UPLOAD_PRESET`.
Ảnh sản phẩm sẽ được upload vào folder `hoang-an-pos/products`.

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

Anh moi upload se luu `delete_token` va co the xoa nhanh trong khoang ngan sau upload. Anh cu van can API key/secret de xoa that tren Cloudinary.

## Scripts

```bash
npm run dev
npm run lint
npm run build
```
