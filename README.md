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
VITE_CLOUDINARY_CLOUD_NAME=your-cloud-name
VITE_CLOUDINARY_UPLOAD_PRESET=your-unsigned-upload-preset
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

## Cloudinary

Tạo unsigned upload preset trong Cloudinary và điền vào `VITE_CLOUDINARY_UPLOAD_PRESET`.
Ảnh sản phẩm sẽ được upload vào folder `hoang-an-pos/products`.

## Scripts

```bash
npm run dev
npm run lint
npm run build
```
