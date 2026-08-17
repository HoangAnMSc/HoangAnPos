import { type FormEvent, useEffect, useMemo, useState } from "react";
import { ChevronRight, Edit3, Eye, EyeOff, Plus, Search, Trash2, UserCog } from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorNoticeModal, type ErrorNotice } from "../components/ui/ErrorNoticeModal";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { PageContainer } from "../components/ui/Page";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "../contexts/AuthContext";
import { useActionNotice } from "../contexts/ActionNoticeContext";
import { getErrorMessage } from "../lib/errors";
import { formatDateTime } from "../lib/format";
import { formatPhoneNumber, normalizePhoneNumber } from "../lib/phone";
import {
  createManagedUser,
  deleteManagedUser,
  fetchManagedUsers,
  updateManagedUser,
  type ManagedUser,
  AdminUsersApiError,
  type UserInput,
} from "../services/adminUsers";
import { fetchRoles } from "../services/roles";
import type { AppRole } from "../types";

type UserFormState = UserInput;

const emptyUserForm: UserFormState = {
  email: "",
  full_name: "",
  is_active: true,
  password: "",
  phone: "",
  role_id: "",
};

function userToForm(user: ManagedUser | null, roles: AppRole[]): UserFormState {
  if (!user) {
    return {
      ...emptyUserForm,
      role_id: roles.find((role) => role.code === "admin")?.id ?? roles[0]?.id ?? "",
    };
  }

  return {
    email: user.email,
    full_name: user.full_name ?? "",
    is_active: user.is_active,
    password: "",
    phone: formatPhoneNumber(user.phone),
    role_id: user.role_id ?? roles[0]?.id ?? "",
  };
}

function getOnlineState(lastSeenAt: string | null) {
  if (!lastSeenAt) {
    return { label: "Ngoại tuyến", online: false };
  }

  const diffMs = Date.now() - new Date(lastSeenAt).getTime();
  const totalMinutes = Math.max(0, Math.floor(diffMs / 60_000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (totalMinutes <= 1) {
    return { label: "Trực tuyến", online: true };
  }

  if (totalMinutes < 60) {
    return {
      label: `${minutes} phút`,
      online: false,
    };
  }

  if (days === 0) {
    return {
      label: `${hours} giờ ${minutes} phút`,
      online: false,
    };
  }

  return {
    label: `${days} ngày ${hours} giờ ${minutes} phút`,
    online: false,
  };
}

type UserEditorModalProps = {
  open: boolean;
  roles: AppRole[];
  submitting: boolean;
  user: ManagedUser | null;
  canDeleteUser: boolean;
  canToggleUser: boolean;
  onClose: () => void;
  onDelete: (user: ManagedUser) => Promise<void>;
  onSubmit: (input: UserInput) => Promise<void>;
};

function UserEditorModal({
  canDeleteUser,
  canToggleUser,
  onClose,
  onDelete,
  onSubmit,
  open,
  roles,
  submitting,
  user,
}: UserEditorModalProps) {
  const [error, setError] = useState("");
  const [form, setForm] = useState<UserFormState>(() => userToForm(user, roles));
  const [showPassword, setShowPassword] = useState(false);
  const formId = user ? `user-form-${user.id}` : "user-form-create";

  useEffect(() => {
    setForm(userToForm(user, roles));
    setError("");
    setShowPassword(false);
  }, [open, roles, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!form.phone.trim() || !form.role_id) {
      setError("Nhập số điện thoại và chọn vai trò.");
      return;
    }

    if (!user && !form.password) {
      setError("Nhập mật khẩu cho nhân viên mới.");
      return;
    }

    try {
      await onSubmit({
        ...form,
        email: form.email.trim(),
        full_name: form.full_name.trim(),
        password: form.password || undefined,
        phone: normalizePhoneNumber(form.phone),
      });
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Lưu nhân viên thất bại."));
    }
  }

  return (
    <Modal
      footer={
        <div className={`grid w-full gap-2 ${user && canDeleteUser ? "grid-cols-[auto_minmax(0,1fr)_minmax(0,1.15fr)]" : "grid-cols-2"}`}>
          {user && canDeleteUser ? (
            <Button className="min-w-0 px-3" onClick={() => void onDelete(user)} type="button" variant="danger">
              <Trash2 className="h-4 w-4" />
              Xóa
            </Button>
          ) : null}
          <Button className="min-w-0 px-3" onClick={onClose} type="button" variant="secondary">
            Hủy
          </Button>
          <Button className="min-w-0 px-3" form={formId} isLoading={submitting} type="submit">
            Lưu nhân viên
          </Button>
        </div>
      }
      onClose={onClose}
      open={open}
      size="lg"
      title={user ? "Sửa nhân viên" : "Tạo nhân viên"}
    >
      <form className="space-y-5" id={formId} onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            autoComplete="tel"
            label="Số điện thoại *"
            onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
            placeholder="0362123456"
            required
            type="tel"
            value={form.phone}
          />
          <Input
            autoComplete="email"
            label="Email (tùy chọn, dùng để quên mật khẩu)"
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            placeholder="nhanvien@example.com"
            type="email"
            value={form.email}
          />
          <Input
            label="Tên hiển thị"
            onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))}
            value={form.full_name}
          />
          <div>
            <span className="mb-2 block text-sm font-bold text-coal">
              {user ? "Mật khẩu mới (bỏ trống nếu không đổi)" : "Mật khẩu"}
            </span>
            <div className="relative">
              <Input
                aria-label={user ? "Mật khẩu mới" : "Mật khẩu"}
                autoComplete="new-password"
                className="pr-12"
                minLength={6}
                onChange={(event) =>
                  setForm((current) => ({ ...current, password: event.target.value }))
                }
                type={showPassword ? "text" : "password"}
                value={form.password}
              />
              <button
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-500"
                onClick={() => setShowPassword((current) => !current)}
                type="button"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        <label className="block">
          <span className="mb-2 block text-sm font-extrabold text-slate-950">Vai trò</span>
          <select
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-coal outline-none focus:border-moss-400 focus:ring-4 focus:ring-moss-100"
            onChange={(event) => setForm((current) => ({ ...current, role_id: event.target.value }))}
            value={form.role_id}
          >
            <option value="">Chọn vai trò</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name} {role.is_active ? "" : "(đang ẩn)"}
              </option>
            ))}
          </select>
        </label>

        <label className={`flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3.5 ${user && !canToggleUser ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
          <span className="min-w-0">
            <span className="block text-sm font-extrabold text-coal">Tài khoản công khai</span>
            <span className="mt-0.5 block text-xs font-semibold text-slate-500">Cho phép nhân viên đăng nhập và sử dụng hệ thống</span>
          </span>
          <input
            checked={form.is_active}
            className="peer sr-only"
            disabled={Boolean(user && !canToggleUser)}
            onChange={(event) =>
              setForm((current) => ({ ...current, is_active: event.target.checked }))
            }
            role="switch"
            type="checkbox"
          />
          <span className="relative h-7 w-12 shrink-0 rounded-full bg-slate-300 transition peer-checked:bg-moss-700 peer-focus-visible:ring-4 peer-focus-visible:ring-moss-100 peer-disabled:opacity-60 after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-5" />
        </label>

        {error ? (
          <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}
      </form>
    </Modal>
  );
}

export function UsersPage() {
  const { confirmAction, showSuccess } = useActionNotice();
  const { canAccess } = useAuth();
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [errorNotice, setErrorNotice] = useState<ErrorNotice | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [viewingUser, setViewingUser] = useState<ManagedUser | null>(null);
  const canCreateUser = canAccess("users.create");
  const canEditUser = canAccess("users.update");
  const canToggleUser = canAccess("users.toggle-active");
  const canDeleteUser = canAccess("users.delete");

  async function loadData() {
    setLoading(true);

    try {
      const [nextRoles, nextUsers] = await Promise.all([fetchRoles(), fetchManagedUsers()]);
      setRoles(nextRoles);
      setUsers(nextUsers);
    } catch (requestError) {
      setErrorNotice({
        detail:
          requestError instanceof AdminUsersApiError && requestError.status >= 500
            ? "Kiểm tra SUPABASE_SERVICE_ROLE_KEY trong .env hoặc Environment Variables trên Vercel."
            : undefined,
        message: getErrorMessage(requestError, "Không tải được danh sách nhân viên."),
        title: "Không tải được nhân viên",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const onlineCount = useMemo(
    () => users.filter((user) => getOnlineState(user.last_seen_at).online).length,
    [users]
  );

  const offlineCount = useMemo(
    () => users.filter((user) => !getOnlineState(user.last_seen_at).online).length,
    [users]
  );

  function openCreateModal() {
    if (!canCreateUser) {
      return;
    }

    setEditingUser(null);
    setViewingUser(null);
    setModalOpen(true);
  }

  function openEditModal(user: ManagedUser) {
    if (!canEditUser) {
      return;
    }

    setEditingUser(user);
    setViewingUser(null);
    setModalOpen(true);
  }

  async function handleSubmit(input: UserInput) {
    if ((editingUser && !canEditUser) || (!editingUser && !canCreateUser)) {
      return;
    }

    setSubmitting(true);

    try {
      const wasEditing = Boolean(editingUser);
      if (editingUser) {
        await updateManagedUser(editingUser.id, input);
      } else {
        await createManagedUser(input);
      }

      setModalOpen(false);
      setEditingUser(null);
      setViewingUser(null);
      await loadData();
      showSuccess(wasEditing ? "Đã lưu thay đổi nhân viên." : "Đã thêm nhân viên mới.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(user: ManagedUser) {
    if (!canDeleteUser) {
      return;
    }

    if (!await confirmAction({
      confirmLabel: "Xóa nhân viên",
      message: `Bạn có chắc muốn xóa nhân viên “${user.full_name || formatPhoneNumber(user.phone) || user.email}”?`,
      title: "Xác nhận xóa nhân viên",
      tone: "danger",
    })) {
      return;
    }

    try {
      await deleteManagedUser(user.id);
      setModalOpen(false);
      setEditingUser(null);
      setViewingUser(null);
      await loadData();
      showSuccess("Đã xóa nhân viên.");
    } catch (requestError) {
      setErrorNotice({
        message: getErrorMessage(requestError, "Xóa nhân viên thất bại."),
        title: "Xóa nhân viên thất bại",
      });
    }
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filteredUsers = users.filter((user) => {
    const online = getOnlineState(user.last_seen_at);
    return [user.phone, formatPhoneNumber(user.phone), user.email, user.full_name, user.role?.name, user.is_active ? "công khai" : "ẩn", online.label]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalizedQuery));
  });

  return (
    <PageContainer className="pb-28 sm:pb-10">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
          <div className="hidden items-center gap-3 p-4 sm:flex">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="h-11 rounded-xl border-slate-200 bg-slate-50 py-2 pl-11 focus:bg-white"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm tên, điện thoại, email hoặc vai trò"
                value={query}
              />
            </div>
            {canCreateUser ? (
              <Button className="h-11 shrink-0 px-3" onClick={openCreateModal}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Thêm nhân viên</span>
              </Button>
            ) : null}
          </div>
          <div className="grid grid-cols-3 border-t border-slate-100 bg-slate-50/70">
            <div className="px-3 py-3 sm:px-4"><p className="text-lg font-black tabular-nums text-slate-950">{users.length}</p><p className="text-[11px] font-bold text-slate-500 sm:text-xs">Tổng nhân viên</p></div>
            <div className="border-x border-slate-200 px-3 py-3 sm:px-4"><p className="text-lg font-black tabular-nums text-emerald-700">{onlineCount}</p><p className="text-[11px] font-bold text-slate-500 sm:text-xs">Trực tuyến</p></div>
            <div className="px-3 py-3 sm:px-4"><p className="text-lg font-black tabular-nums text-slate-600">{offlineCount}</p><p className="text-[11px] font-bold text-slate-500 sm:text-xs">Ngoại tuyến</p></div>
          </div>
        </section>

        {loading ? (
          <div className="rounded-xl bg-white p-6 shadow-soft">
            <Spinner label="Đang tải nhân viên..." />
          </div>
        ) : filteredUsers.length === 0 ? (
          <EmptyState description="Tạo nhân viên đầu tiên để phân quyền." icon={UserCog} title="Chưa có nhân viên" />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft max-lg:border-0 max-lg:bg-transparent max-lg:shadow-none">
            <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_32px] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-extrabold uppercase tracking-wide text-slate-500 lg:grid">
              <span>Nhân viên</span>
              <span>Vai trò</span>
              <span>Trực tuyến</span>
              <span />
            </div>
            <div className="divide-y divide-coal/5 max-lg:grid max-lg:gap-3 max-lg:divide-y-0">
              {filteredUsers.map((user) => {
                const online = getOnlineState(user.last_seen_at);

                return (
                  <button
                    className={`relative grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-l-4 px-4 py-4 text-left transition max-lg:overflow-hidden max-lg:rounded-2xl max-lg:border max-lg:border-l-4 max-lg:border-slate-200 max-lg:shadow-[0_4px_16px_rgba(15,23,42,0.05)] lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_32px] lg:px-5 ${user.is_active ? "bg-white hover:bg-slate-50" : "bg-white after:pointer-events-none after:absolute after:inset-0 after:bg-slate-300/50"}`}
                    key={user.id}
                    onClick={() => setViewingUser(user)}
                    style={{ borderLeftColor: user.role?.color || "#8b5cf6" }}
                    type="button"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="min-w-0 truncate text-base font-extrabold text-coal">{user.full_name || formatPhoneNumber(user.phone) || user.email}</p>
                        <Badge className="shrink-0 lg:hidden" tone={online.online ? "blue" : "red"}>{online.label}</Badge>
                      </div>
                      <p className="mt-1 hidden truncate text-sm font-semibold text-coal/55 lg:block">
                        {formatPhoneNumber(user.phone)}
                      </p>
                      {user.email ? (
                        <p className="mt-0.5 hidden truncate text-xs font-semibold text-coal/40 lg:block">
                          {user.email}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-1.5 lg:hidden">
                        <span className="text-xs font-bold text-slate-600">{user.role?.name ?? "Chưa gán vai trò"}</span>
                      </div>
                      <p className="mt-1 hidden text-xs font-semibold text-coal/35 lg:block">
                        Tạo {user.created_at ? formatDateTime(user.created_at) : "không rõ"}
                      </p>
                      </div>
                    </div>
                    <div className="hidden lg:block">
                      <span className="text-sm font-bold text-slate-700">{user.role?.name ?? "Chưa gán vai trò"}</span>
                    </div>
                    <div className="hidden lg:block">
                      <Badge tone={online.online ? "blue" : "red"}>{online.label}</Badge>
                      {user.last_seen_at ? (
                        <p className="mt-1 truncate text-xs font-semibold text-coal/40">
                          {formatDateTime(user.last_seen_at)}
                        </p>
                      ) : null}
                    </div>
                    <ChevronRight className="h-5 w-5 text-slate-400" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 pb-[calc(.65rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_28px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:hidden">
        <div className={`mx-auto grid max-w-lg gap-2 ${canCreateUser ? "grid-cols-2" : "grid-cols-1"}`}>
          <button className="flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-extrabold text-slate-700" onClick={() => setSearchModalOpen(true)} type="button"><Search className="h-4 w-4" />Tìm kiếm</button>
          {canCreateUser ? <button className="flex h-11 items-center justify-center gap-2 rounded-xl bg-coal text-sm font-extrabold text-white shadow-sm" onClick={openCreateModal} type="button"><Plus className="h-4 w-4" />Thêm nhân viên</button> : null}
        </div>
      </div>

      <Modal footer={<Button className="w-full sm:w-auto" onClick={() => setSearchModalOpen(false)}>Xem {filteredUsers.length} kết quả</Button>} onClose={() => setSearchModalOpen(false)} open={searchModalOpen} size="sm" title="Tìm nhân viên">
        <div className="space-y-3">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><Input autoFocus className="h-12 rounded-xl pl-11" onChange={(event) => setQuery(event.target.value)} placeholder="Tên, điện thoại, email hoặc vai trò" value={query} /></div>
          <p className="text-sm font-semibold text-slate-500">Tìm thấy {filteredUsers.length} nhân viên</p>
        </div>
      </Modal>

      <Modal
        footer={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button onClick={() => setViewingUser(null)} type="button" variant="secondary">
              Đóng
            </Button>
            {viewingUser && canEditUser ? (
              <Button onClick={() => openEditModal(viewingUser)} type="button">
                <Edit3 className="h-4 w-4" />
                Sửa
              </Button>
            ) : null}
          </div>
        }
        onClose={() => setViewingUser(null)}
        open={Boolean(viewingUser)}
        size="md"
        title="Thông tin"
      >
        {viewingUser ? (
          <div className="space-y-6">
            <h3 className="truncate text-xl font-extrabold text-slate-950">{viewingUser.full_name || formatPhoneNumber(viewingUser.phone) || viewingUser.email}</h3>
            <dl className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:gap-4"><dt className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Số điện thoại</dt><dd className="text-sm font-bold text-slate-800 sm:text-right">{formatPhoneNumber(viewingUser.phone)}</dd></div>
              <div className="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:gap-4"><dt className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Email</dt><dd className="break-words text-sm font-bold text-slate-800 sm:text-right">{viewingUser.email || "Chưa có"}</dd></div>
              <div className="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:gap-4"><dt className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Vai trò</dt><dd className="text-sm font-bold text-slate-800 sm:text-right">{viewingUser.role?.name ?? "Chưa gán vai trò"}</dd></div>
              <div className="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:gap-4"><dt className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Trạng thái online</dt><dd className="text-sm font-bold text-slate-800 sm:text-right">{getOnlineState(viewingUser.last_seen_at).label}</dd></div>
              <div className="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:gap-4"><dt className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Ngày tạo</dt><dd className="text-sm font-bold text-slate-800 sm:text-right">{viewingUser.created_at ? formatDateTime(viewingUser.created_at) : "Không rõ"}</dd></div>
              {viewingUser.last_seen_at ? <div className="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:gap-4"><dt className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Truy cập gần nhất</dt><dd className="text-sm font-bold text-slate-800 sm:text-right">{formatDateTime(viewingUser.last_seen_at)}</dd></div> : null}
            </dl>
          </div>
        ) : null}
      </Modal>

      <UserEditorModal
        canDeleteUser={canDeleteUser}
        canToggleUser={canToggleUser}
        onClose={() => setModalOpen(false)}
        onDelete={handleDelete}
        onSubmit={handleSubmit}
        open={modalOpen}
        roles={roles}
        submitting={submitting}
        user={editingUser}
      />
      <ErrorNoticeModal notice={errorNotice} onClose={() => setErrorNotice(null)} />
    </PageContainer>
  );
}
