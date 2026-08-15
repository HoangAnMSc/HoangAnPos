import {
  BadgeDollarSign,
  Boxes,
  CalendarClock,
  Images,
  ReceiptText,
  ChartNoAxesCombined,
  Settings,
  ShieldCheck,
  Warehouse,
  UsersRound,
  UserCog,
  TicketPercent,
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
    description: "Mở màn hình bán hàng tại quầy.",
    actions: [
      {
        key: "pos.checkout",
        label: "Bán hàng / tạo hóa đơn",
        description: "Thêm sản phẩm vào giỏ, thanh toán và tạo hóa đơn.",
      },
      {
        key: "pos.quick-customer.create",
        label: "Thêm khách nhanh",
        description: "Tạo khách hàng mới ngay trong màn hình POS.",
      },
      {
        key: "pos.payment-proof.upload",
        label: "Ảnh xác nhận chuyển khoản",
        description: "Tải lên hoặc chụp ảnh biên lai chuyển khoản.",
      },
    ],
  },
  {
    key: "orders",
    label: "Hóa đơn",
    path: "/orders",
    icon: ReceiptText,
    description: "Xem danh sách và chi tiết hóa đơn đã tạo.",
    actions: [
      {
        key: "orders.cancel",
        label: "Hủy hóa đơn",
        description: "Hủy hóa đơn thành công và hoàn lại số lượng vào kho.",
      },
      {
        key: "orders.delete",
        label: "Xóa hóa đơn",
        description: "Chọn và xóa vĩnh viễn một hoặc nhiều hóa đơn.",
      },
    ],
  },
  {
    key: "revenue",
    label: "Doanh thu",
    path: "/revenue",
    icon: ChartNoAxesCombined,
    description: "Theo dõi doanh thu, quỹ và lịch sử đối soát nhân viên.",
    actions: [
      {
        key: "revenue.export",
        label: "In / xuất sổ doanh thu",
        description: "In hoặc xuất dữ liệu sổ doanh thu S1a-HKD.",
      },
      {
        key: "cash-management",
        label: "Truy cập quỹ và đối soát",
        description: "Cho phép dùng dữ liệu két và các chức năng đối soát trong trang Doanh thu.",
      },
      {
        key: "cash-management.session.open",
        label: "Mở ca bán hàng",
        description: "Khai báo số tiền đầu ca trước khi bắt đầu bán hàng.",
      },
      {
        key: "cash-management.reconciliation.required",
        label: "Bắt buộc đối soát két trước khi bán",
        description: "Vai trò được gán quyền này phải vào ca và xác nhận tiền két trước khi tạo hóa đơn. Không gán cho Chủ hoặc người chỉ bán phụ.",
      },
      {
        key: "cash-management.session.close",
        label: "Chốt ca / kiểm đếm két",
        description: "Nhập tiền mặt thực đếm và ghi nhận chênh lệch cuối ca.",
      },
      {
        key: "cash-management.handover.override",
        label: "Xác nhận lệch bàn giao",
        description: "Cho phép quản lý mở ca khi tiền thực nhận khác số tiền ca trước bàn giao; bắt buộc tải ảnh bằng chứng.",
      },
      {
        key: "cash-management.history.view",
        label: "Xem lịch sử đối soát",
        description: "Mở lịch sử xác nhận tiền két của bản thân từ nút chuông trên header.",
      },
      {
        key: "cash-management.view-all",
        label: "Xem đối soát toàn bộ nhân viên",
        description: "Mở rộng lịch sử và dữ liệu đối soát sang toàn bộ nhân viên.",
      },
      {
        key: "cash-management.balance.adjust",
        label: "Điều chỉnh tiền mặt",
        description: "Cho phép quản lý sửa riêng tiền mặt thực tế; không thay đổi doanh thu hoặc chuyển khoản từ hóa đơn.",
      },
      {
        key: "cash-management.reconciliation.update",
        label: "Sửa lịch sử đối soát",
        description: "Chỉnh số tiền thực đếm và ảnh bằng chứng của bản ghi đối soát.",
      },
      {
        key: "cash-management.reconciliation.delete",
        label: "Xóa lịch sử đối soát",
        description: "Xóa bản ghi đối soát đã hoàn tất khỏi lịch sử.",
      },
    ],
  },
  {
    key: "customers",
    label: "Khách hàng",
    path: "/customers",
    icon: UsersRound,
    description: "Mở danh sách khách hàng.",
    actions: [
      {
        key: "customers.create",
        label: "Thêm khách hàng",
        description: "Tạo hồ sơ khách hàng mới.",
      },
      {
        key: "customers.update",
        label: "Sửa khách hàng",
        description: "Cập nhật thông tin khách hàng.",
      },
      {
        key: "customers.purchase-history.view",
        label: "Xem lịch sử mua hàng",
        description: "Xem các đơn và sản phẩm khách hàng đã từng mua.",
      },
      {
        key: "customers.delete",
        label: "Xóa khách hàng",
        description: "Xóa hồ sơ khách hàng.",
      },
    ],
  },
  {
    key: "products",
    label: "Sản phẩm",
    path: "/products",
    icon: Boxes,
    description: "Mở danh sách và chi tiết sản phẩm.",
    actions: [
      {
        key: "products.create",
        label: "Thêm sản phẩm",
        description: "Tạo sản phẩm mới.",
      },
      {
        key: "products.update",
        label: "Sửa sản phẩm",
        description: "Cập nhật thông tin, giá, tồn kho và ảnh sản phẩm.",
      },
      {
        key: "products.types.manage",
        label: "Quản lý danh mục sản phẩm",
        description: "Thêm, sửa, xóa Product Type và cấu hình thuộc tính theo danh mục.",
      },
      {
        key: "products.attributes.manage",
        label: "Quản lý thuộc tính sản phẩm",
        description: "Thêm, sửa hoặc xóa định nghĩa thuộc tính dùng chung.",
      },
      {
        key: "products.card.update",
        label: "Sửa giao diện card",
        description: "Thay đổi thông tin và cách hiển thị card ở Sản phẩm/POS.",
      },
      {
        key: "products.delete",
        label: "Xóa sản phẩm",
        description: "Xóa hoặc ẩn sản phẩm khỏi danh sách.",
      },
      {
        key: "products.toggle-active",
        label: "Ẩn / hiện sản phẩm",
        description: "Đổi trạng thái hiển thị của sản phẩm.",
      },
      {
        key: "products.categories.create",
        label: "Thêm nhóm hàng",
        description: "Tạo nhóm hàng mới trong biểu mẫu sản phẩm.",
      },
      {
        key: "products.ean13.print",
        label: "In / tạo mã EAN-13",
        description: "Mở màn hình in tem mã vạch EAN-13.",
      },
    ],
  },
  {
    key: "promotions",
    label: "Khuyến mãi",
    path: "/promotions",
    icon: TicketPercent,
    description: "Quản lý voucher và chương trình giảm giá tự động.",
    actions: [
      { key: "promotions.create", label: "Tạo chương trình", description: "Tạo voucher hoặc ưu đãi tự động." },
      { key: "promotions.update", label: "Sửa chương trình", description: "Cập nhật điều kiện, phạm vi và giới hạn sử dụng." },
      { key: "promotions.delete", label: "Xóa chương trình", description: "Xóa chương trình không còn sử dụng." },
    ],
  },
  {
    key: "cloudinary-images",
    label: "Thư viện ảnh",
    path: "/cloudinary-images",
    icon: Images,
    description: "Xem toàn bộ ảnh trong thư viện Cloudinary.",
    actions: [
      {
        key: "cloudinary-images.upload",
        label: "Tải ảnh lên",
        description: "Tải ảnh mới lên Cloudinary.",
      },
      {
        key: "cloudinary-images.delete",
        label: "Xóa ảnh",
        description: "Xóa một hoặc nhiều ảnh trên Cloudinary.",
      },
    ],
  },
  {
    key: "warehouse",
    label: "Kho",
    path: "/warehouse",
    icon: Warehouse,
    description: "Xem sản phẩm trong kho, lịch sử kiểm kê và thực hiện nhập xuất kho.",
    actions: [
      {
        key: "warehouse.audit.delete",
        label: "Xóa phiên kiểm kê",
        description: "Xóa một phiên kiểm kê đã được nhân viên hoàn tất.",
      },
      {
        key: "inventory",
        label: "Sử dụng kiểm kê kho",
        description: "Cho phép truy cập chức năng tạo và xem phiên kiểm kê kho.",
      },
      {
        key: "inventory.count",
        label: "Nhập số lượng kiểm kê",
        description: "Quét mã và nhập số lượng thực tế của các sản phẩm trong một phiên kiểm kê.",
      },
      {
        key: "inventory.submit",
        label: "Hoàn tất phiên kiểm kê",
        description: "Xác nhận và lưu kết quả của một phiên kiểm kê.",
      },
      {
        key: "products.receive-stock",
        label: "Nhập hàng vào kho",
        description: "Nhập nhiều SKU và cộng số lượng tồn trong một lần xác nhận.",
      },
      {
        key: "warehouse.stock-out",
        label: "Xuất hàng khỏi kho",
        description: "Xuất nhiều SKU, trừ số lượng tồn và ghi nhận lý do.",
      },
    ],
  },
  {
    key: "attendance",
    label: "Chấm công",
    path: "/attendance",
    icon: CalendarClock,
    description: "Mở trang chấm công và lịch sử ca làm.",
    actions: [
      {
        key: "attendance.clock",
        label: "Chấm công / tan làm",
        description: "Ghi nhận giờ vào ca và giờ tan làm.",
      },
      {
        key: "attendance.history.view",
        label: "Xem lịch sử chấm công",
        description: "Xem danh sách giờ đã chấm công trong tháng.",
      },
      {
        key: "attendance.history.view-all",
        label: "Xem lịch sử toàn bộ nhân viên",
        description: "Mở tab lịch sử theo tháng của tất cả nhân viên.",
      },
      {
        key: "attendance.history.update",
        label: "Sửa lịch sử chấm công",
        description: "Chỉnh sửa giờ chấm công và giờ tan làm đã lưu.",
      },
      {
        key: "attendance.history.delete",
        label: "Xóa lịch sử chấm công",
        description: "Xóa một ca chấm công đã lưu.",
      },
      {
        key: "attendance.export",
        label: "Xuất chấm công nhân viên",
        description: "Xuất chấm công của tất cả hoặc các nhân viên được chọn theo tháng.",
      },
    ],
  },
  {
    key: "payment-settings",
    label: "Thanh toán",
    path: "/payment-settings",
    icon: Settings,
    description: "Xem cấu hình mã QR và ghi chú chuyển khoản.",
    actions: [
      {
        key: "payment-settings.update",
        label: "Sửa cấu hình",
        description: "Cập nhật ảnh QR và thông tin chuyển khoản.",
      },
    ],
  },
  {
    key: "roles",
    label: "Vai trò",
    path: "/roles",
    icon: ShieldCheck,
    description: "Xem danh sách vai trò và quyền truy cập.",
    actions: [
      {
        key: "roles.create",
        label: "Tạo vai trò",
        description: "Tạo vai trò mới.",
      },
      {
        key: "roles.update",
        label: "Sửa vai trò",
        description: "Cập nhật tên, mô tả và danh sách quyền.",
      },
      {
        key: "roles.toggle-active",
        label: "Hoạt động / vô hiệu hóa",
        description: "Đổi trạng thái vai trò.",
      },
      {
        key: "roles.delete",
        label: "Xóa vai trò",
        description: "Xóa vai trò không thuộc hệ thống.",
      },
    ],
  },
  {
    key: "users",
    label: "Nhân viên",
    path: "/users",
    icon: UserCog,
    description: "Xem danh sách nhân viên và trạng thái trực tuyến.",
    actions: [
      {
        key: "users.create",
        label: "Tạo nhân viên",
        description: "Tạo tài khoản nhân viên mới.",
      },
      {
        key: "users.update",
        label: "Sửa nhân viên",
        description: "Cập nhật số điện thoại, email, mật khẩu, tên và vai trò.",
      },
      {
        key: "users.toggle-active",
        label: "Hoạt động / vô hiệu hóa",
        description: "Khóa hoặc mở khóa tài khoản nhân viên.",
      },
      {
        key: "users.delete",
        label: "Xóa nhân viên",
        description: "Xóa tài khoản khỏi Supabase Auth.",
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

export const appNavigationSections = [
  { label: "Bán hàng", keys: ["pos", "orders", "customers", "promotions"] },
  { label: "Hàng hóa", keys: ["products", "warehouse", "cloudinary-images"] },
  { label: "Báo cáo & vận hành", keys: ["revenue", "attendance"] },
  { label: "Hệ thống", keys: ["payment-settings", "users", "roles"] },
] as const;

export type AppPermissionKey = (typeof appPermissions)[number]["key"];

export const allAppPermissionKeys = appPermissions.map((permission) => permission.key);

export const allRolePermissionKeys = permissionGroups.flatMap((group) => [
  group.key,
  ...group.actions.map((action) => action.key),
]);

export const superAdminPermissionKeys = allRolePermissionKeys.filter(
  (permission) => permission !== "cash-management.reconciliation.required"
);

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

  if (selected.has("cash-management.view-all")) {
    selected.add("cash-management.history.view");
  }

  if (
    selected.has("cash-management.reconciliation.update") ||
    selected.has("cash-management.reconciliation.delete")
  ) {
    selected.add("cash-management");
    selected.add("cash-management.history.view");
    selected.add("cash-management.view-all");
  }

  if (selected.has("cash-management.reconciliation.required")) {
    [
      "pos",
      "pos.checkout",
      "attendance",
      "attendance.clock",
      "cash-management",
      "cash-management.session.open",
      "cash-management.session.close",
    ].forEach((permission) => selected.add(permission));
  }

  permissionGroups.forEach((group) => {
    const hasAction = group.actions.some((action) => selected.has(action.key));

    if (hasAction) {
      selected.add(group.key);
    }
  });

  return allRolePermissionKeys.filter((permission) => selected.has(permission));
}
