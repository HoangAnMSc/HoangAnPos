import {
  BadgeDollarSign,
  Boxes,
  CalendarClock,
  ClipboardList,
  Images,
  ReceiptText,
  Settings,
  ShieldCheck,
  UsersRound,
  UserCog,
} from "lucide-react";

type PermissionAction = {
  key: string;
  label: string;
  description: string;
};

type PermissionGroup = {
  key: string;
  label: string;
  path: string;
  icon: typeof BadgeDollarSign;
  description: string;
  actions: PermissionAction[];
};

export const permissionGroups = [
  {
    key: "pos",
    label: "POS",
    path: "/pos",
    icon: BadgeDollarSign,
    description: "Mo man hinh ban hang tai quay.",
    actions: [
      {
        key: "pos.checkout",
        label: "Ban hang / tao hoa don",
        description: "Them san pham vao gio, thanh toan va tao hoa don.",
      },
      {
        key: "pos.discount",
        label: "Giam gia",
        description: "Nhap giam gia tren hoa don POS.",
      },
      {
        key: "pos.quick-customer.create",
        label: "Them khach nhanh",
        description: "Tao khach hang moi ngay trong man hinh POS.",
      },
      {
        key: "pos.payment-proof.upload",
        label: "Anh xac nhan CK",
        description: "Tai anh/chup anh bien lai chuyen khoan.",
      },
    ],
  },
  {
    key: "orders",
    label: "Hoa don",
    path: "/orders",
    icon: ReceiptText,
    description: "Xem danh sach va chi tiet hoa don da tao.",
    actions: [],
  },
  {
    key: "customers",
    label: "Khach hang",
    path: "/customers",
    icon: UsersRound,
    description: "Mo danh sach khach hang.",
    actions: [
      {
        key: "customers.create",
        label: "Them khach hang",
        description: "Tao ho so khach hang moi.",
      },
      {
        key: "customers.update",
        label: "Sua khach hang",
        description: "Cap nhat thong tin khach hang.",
      },
      {
        key: "customers.delete",
        label: "Xoa khach hang",
        description: "Xoa ho so khach hang.",
      },
    ],
  },
  {
    key: "products",
    label: "San pham",
    path: "/products",
    icon: Boxes,
    description: "Mo danh sach va chi tiet san pham.",
    actions: [
      {
        key: "products.create",
        label: "Them san pham",
        description: "Tao san pham moi.",
      },
      {
        key: "products.update",
        label: "Sua san pham",
        description: "Cap nhat thong tin, gia, ton va anh san pham.",
      },
      {
        key: "products.delete",
        label: "Xoa san pham",
        description: "Xoa hoac an san pham khoi danh sach.",
      },
      {
        key: "products.toggle-active",
        label: "An / hien san pham",
        description: "Doi trang thai hien thi cua san pham.",
      },
      {
        key: "products.receive-stock",
        label: "Nhap kho",
        description: "Them lo hang va so luong ton.",
      },
      {
        key: "products.categories.create",
        label: "Them nhom hang",
        description: "Tao category moi trong form san pham.",
      },
      {
        key: "products.ean13.print",
        label: "In/Tao EAN-13",
        description: "Mo man in tem ma vach EAN-13.",
      },
    ],
  },
  {
    key: "cloudinary-images",
    label: "Anh Cloudinary",
    path: "/cloudinary-images",
    icon: Images,
    description: "Xem toan bo anh trong Cloudinary Media Library.",
    actions: [
      {
        key: "cloudinary-images.upload",
        label: "Tai anh",
        description: "Upload anh moi len Cloudinary.",
      },
      {
        key: "cloudinary-images.delete",
        label: "Xoa anh",
        description: "Xoa mot hoac nhieu anh tren Cloudinary.",
      },
    ],
  },
  {
    key: "inventory",
    label: "Ton kho",
    path: "/inventory",
    icon: ClipboardList,
    description: "Mo trang kiem ke ton kho.",
    actions: [
      {
        key: "inventory.count",
        label: "Nhap kiem ke",
        description: "Quet ma, nhap/sua/xoa so luong dem duoc.",
      },
      {
        key: "inventory.report.create",
        label: "Tao bao cao",
        description: "Tao anh bao cao ton kho tu du lieu da dem.",
      },
      {
        key: "inventory.history.delete",
        label: "Xoa lich su",
        description: "Xoa lich su bao cao luu tren may hien tai.",
      },
    ],
  },
  {
    key: "attendance",
    label: "Cham cong",
    path: "/attendance",
    icon: CalendarClock,
    description: "Mo trang cham cong va lich su ca lam.",
    actions: [
      {
        key: "attendance.clock",
        label: "Cham cong / tan lam",
        description: "Ghi nhan gio vao ca va gio tan lam.",
      },
      {
        key: "attendance.history.view",
        label: "Xem lich su cham cong",
        description: "Xem danh sach gio da cham cong trong thang.",
      },
      {
        key: "attendance.history.update",
        label: "Sua lich su cham cong",
        description: "Chinh sua gio cham cong va gio tan lam da luu.",
      },
      {
        key: "attendance.history.delete",
        label: "Xoa lich su cham cong",
        description: "Xoa mot ca cham cong da luu.",
      },
    ],
  },
  {
    key: "payment-settings",
    label: "Thanh toan",
    path: "/payment-settings",
    icon: Settings,
    description: "Xem cau hinh ma QR va ghi chu chuyen khoan.",
    actions: [
      {
        key: "payment-settings.update",
        label: "Sua cau hinh",
        description: "Cap nhat anh QR va thong tin chuyen khoan.",
      },
    ],
  },
  {
    key: "roles",
    label: "Quan ly role",
    path: "/roles",
    icon: ShieldCheck,
    description: "Xem danh sach role va ma quyen.",
    actions: [
      {
        key: "roles.create",
        label: "Tao role",
        description: "Tao role moi.",
      },
      {
        key: "roles.update",
        label: "Sua role",
        description: "Cap nhat ten, mo ta va danh sach quyen.",
      },
      {
        key: "roles.toggle-active",
        label: "Hoat dong / vo hieu hoa",
        description: "Doi trang thai role.",
      },
      {
        key: "roles.delete",
        label: "Xoa role",
        description: "Xoa role khong phai role he thong.",
      },
    ],
  },
  {
    key: "users",
    label: "Quan ly user",
    path: "/users",
    icon: UserCog,
    description: "Xem danh sach nguoi quan tri va trang thai online.",
    actions: [
      {
        key: "users.create",
        label: "Tao user",
        description: "Tao tai khoan quan tri moi.",
      },
      {
        key: "users.update",
        label: "Sua user",
        description: "Cap nhat email, mat khau, ten va role.",
      },
      {
        key: "users.toggle-active",
        label: "Hoat dong / vo hieu hoa",
        description: "Khoa hoac mo khoa tai khoan quan tri.",
      },
      {
        key: "users.delete",
        label: "Xoa user",
        description: "Xoa tai khoan khoi Supabase Auth.",
      },
    ],
  },
] as const satisfies readonly PermissionGroup[];

export const appPermissions = permissionGroups.map((permission) => ({
  description: permission.description,
  icon: permission.icon,
  key: permission.key,
  label: permission.label,
  path: permission.path,
}));

export type AppPermissionKey = (typeof appPermissions)[number]["key"];

export const allAppPermissionKeys = appPermissions.map((permission) => permission.key);

export const allRolePermissionKeys = permissionGroups.flatMap((group) => [
  group.key,
  ...group.actions.map((action) => action.key),
]);

export const permissionLabelByKey = new Map<string, string>(
  permissionGroups.flatMap((group) => [
    [group.key, group.label],
    ...group.actions.map((action) => [action.key, action.label] as const),
  ])
);

export function getPermissionGroupKeys(group: PermissionGroup) {
  return [group.key, ...group.actions.map((action) => action.key)];
}

export function normalizeRolePermissions(permissions: string[]) {
  const selected = new Set(permissions);

  permissionGroups.forEach((group) => {
    const hasAction = group.actions.some((action) => selected.has(action.key));

    if (hasAction) {
      selected.add(group.key);
    }
  });

  return allRolePermissionKeys.filter((permission) => selected.has(permission));
}
