import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Edit3, Eye, EyeOff, Plus, Power, Search, Trash2, UserCog } from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorNoticeModal, type ErrorNotice } from "../components/ui/ErrorNoticeModal";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { PageContainer } from "../components/ui/Page";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "../contexts/AuthContext";
import { getErrorMessage } from "../lib/errors";
import { formatDateTime } from "../lib/format";
import { formatPhoneNumber, normalizePhoneNumber } from "../lib/phone";
import {
  createManagedUser,
  deleteManagedUser,
  fetchManagedUsers,
  updateManagedUser,
  type ManagedUser,
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
  onToggle: (user: ManagedUser) => Promise<void>;
};

function UserEditorModal({
  canDeleteUser,
  canToggleUser,
  onClose,
  onDelete,
  onSubmit,
  onToggle,
  open,
  roles,
  submitting,
  user,
}: UserEditorModalProps) {
  const [error, setError] = useState("");
  const [form, setForm] = useState<UserFormState>(() => userToForm(user, roles));
  const formId = user ? `user-form-${user.id}` : "user-form-create";

  useEffect(() => {
    setForm(userToForm(user, roles));
    setError("");
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
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {user && canToggleUser ? (
              <Button onClick={() => void onToggle(user)} type="button" variant="secondary">
                <Power className="h-4 w-4" />
                {user.is_active ? "Vô hiệu hóa" : "Kích hoạt"}
              </Button>
            ) : null}
            {user && canDeleteUser ? (
              <Button onClick={() => void onDelete(user)} type="button" variant="danger">
                <Trash2 className="h-4 w-4" />
                Xóa
              </Button>
            ) : null}
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button onClick={onClose} type="button" variant="secondary">
              Hủy
            </Button>
            <Button form={formId} isLoading={submitting} type="submit">
              Lưu nhân viên
            </Button>
          </div>
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
            placeholder="0901234567"
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
          <Input
            autoComplete="new-password"
            label={user ? "Mật khẩu mới (bỏ trống nếu không đổi)" : "Mật khẩu"}
            minLength={6}
            onChange={(event) =>
              setForm((current) => ({ ...current, password: event.target.value }))
            }
            type="password"
            value={form.password}
          />
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
                {role.name} {role.is_active ? "" : "(vô hiệu hóa)"}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-coal">
          <input
            checked={form.is_active}
            className="h-4 w-4 accent-moss-600"
            onChange={(event) =>
              setForm((current) => ({ ...current, is_active: event.target.checked }))
            }
            type="checkbox"
          />
          Tài khoản đang hoạt động
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
  const { canAccess } = useAuth();
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [errorNotice, setErrorNotice] = useState<ErrorNotice | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState("");
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
        detail: "Cần cấu hình SUPABASE_SERVICE_ROLE_KEY trong .env/Vercel để quản lý nhân viên.",
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
      if (editingUser) {
        await updateManagedUser(editingUser.id, input);
      } else {
        await createManagedUser(input);
      }

      setModalOpen(false);
      setEditingUser(null);
      setViewingUser(null);
      await loadData();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(user: ManagedUser) {
    if (!canToggleUser) {
      return;
    }

    try {
      await updateManagedUser(user.id, {
        email: user.email,
        full_name: user.full_name ?? "",
        is_active: !user.is_active,
        phone: user.phone,
        role_id: user.role_id ?? roles[0]?.id ?? "",
      });
      setModalOpen(false);
      setEditingUser(null);
      setViewingUser(null);
      await loadData();
    } catch (requestError) {
      setErrorNotice({
        message: getErrorMessage(requestError, "Đổi trạng thái nhân viên thất bại."),
        title: "Đổi trạng thái thất bại",
      });
    }
  }

  async function handleDelete(user: ManagedUser) {
    if (!canDeleteUser) {
      return;
    }

    if (!window.confirm(`Xóa nhân viên "${user.full_name || formatPhoneNumber(user.phone) || user.email}"?`)) {
      return;
    }

    try {
      await deleteManagedUser(user.id);
      setModalOpen(false);
      setEditingUser(null);
      setViewingUser(null);
      await loadData();
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
    return [user.phone, formatPhoneNumber(user.phone), user.email, user.full_name, user.role?.name, user.is_active ? "hoạt động" : "vô hiệu hóa", online.label]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalizedQuery));
  });

  return (
    <PageContainer>
        <section className="rounded-xl bg-white p-4 shadow-soft ring-1 ring-coal/5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="relative mt-3 w-full xl:max-w-xl">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-coal/35" />
              <Input
                className="h-10 rounded-xl py-2 pl-11"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm số điện thoại, email, tên hoặc vai trò..."
                value={query}
              />
            </div>
            {canCreateUser ? (
              <Button className="h-10 rounded-xl px-3" onClick={openCreateModal}>
                <Plus className="h-4 w-4" />
                Thêm nhân viên mới
              </Button>
            ) : null}
          </div>
          <div className="mt-2 w-full flex justify-start gap-2">
            <Badge tone="blue">{onlineCount} trực tuyến</Badge>
            <Badge tone="red">{offlineCount} ngoại tuyến</Badge>
          </div>
        </section>

        {loading ? (
          <div className="rounded-xl bg-white p-6 shadow-soft">
            <Spinner label="Đang tải nhân viên..." />
          </div>
        ) : filteredUsers.length === 0 ? (
          <EmptyState description="Tạo nhân viên đầu tiên để phân quyền." icon={UserCog} title="Chưa có nhân viên" />
        ) : (
          <div className="overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-coal/5">
            <div className="hidden grid-cols-[minmax(0,1.45fr)_minmax(0,0.85fr)_minmax(0,0.95fr)_minmax(0,1fr)_auto] gap-3 border-b border-coal/5 bg-coal px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide text-white/70 lg:grid">
              <span>Nhân viên</span>
              <span>Vai trò</span>
              <span>Trạng thái</span>
              <span>Hoạt động</span>
              <span />
            </div>
            <div className="divide-y divide-coal/5">
              {filteredUsers.map((user) => {
                const online = getOnlineState(user.last_seen_at);

                return (
                  <button
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 py-3 text-left transition hover:bg-cream/30 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,0.85fr)_minmax(0,0.95fr)_minmax(0,1fr)_auto] lg:gap-3"
                    key={user.id}
                    onClick={() => setViewingUser(user)}
                    type="button"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-base font-extrabold text-coal">
                        {user.full_name || formatPhoneNumber(user.phone) || user.email}
                      </p>
                      <p className="mt-1 truncate text-sm font-semibold text-coal/55">
                        {formatPhoneNumber(user.phone)}
                      </p>
                      {user.email ? (
                        <p className="mt-0.5 truncate text-xs font-semibold text-coal/40">
                          {user.email}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-1.5 lg:hidden">
                        <Badge tone="neutral">{user.role?.name ?? "Chưa gán vai trò"}</Badge>
                        <Badge aria-label={user.is_active ? "Công khai" : "Ẩn"} title={user.is_active ? "Công khai" : "Ẩn"} tone={user.is_active ? "green" : "red"}>
                          {user.is_active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        </Badge>
                        <Badge tone={online.online ? "blue" : "red"}>{online.label}</Badge>
                      </div>
                      <p className="mt-1 hidden text-xs font-semibold text-coal/35 lg:block">
                        Tạo {user.created_at ? formatDateTime(user.created_at) : "không rõ"}
                      </p>
                    </div>
                    <div className="hidden lg:block">
                      <Badge tone="neutral">{user.role?.name ?? "Chưa gán vai trò"}</Badge>
                    </div>
                    <div className="hidden lg:block">
                      <Badge aria-label={user.is_active ? "Công khai" : "Ẩn"} title={user.is_active ? "Công khai" : "Ẩn"} tone={user.is_active ? "green" : "red"}>
                        {user.is_active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      </Badge>
                    </div>
                    <div className="hidden lg:block">
                      <Badge tone={online.online ? "blue" : "red"}>{online.label}</Badge>
                      {user.last_seen_at ? (
                        <p className="mt-1 truncate text-xs font-semibold text-coal/40">
                          {formatDateTime(user.last_seen_at)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex justify-end">
                      <Badge tone="neutral">Xem</Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
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
            <div className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-4">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-extrabold text-slate-950">
                  {viewingUser.full_name || formatPhoneNumber(viewingUser.phone) || viewingUser.email}
                </h3>
                <p className="mt-1 truncate text-sm font-semibold text-slate-600">
                  {formatPhoneNumber(viewingUser.phone)}
                </p>
                {viewingUser.email ? (
                  <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
                    {viewingUser.email}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Badge tone="neutral">{viewingUser.role?.name ?? "Chưa gán vai trò"}</Badge>
                <Badge aria-label={viewingUser.is_active ? "Công khai" : "Ẩn"} title={viewingUser.is_active ? "Công khai" : "Ẩn"} tone={viewingUser.is_active ? "green" : "red"}>
                  {viewingUser.is_active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </Badge>
              </div>
            </div>
            <div className="grid gap-2 text-sm font-semibold text-slate-700">
              <p>
                <span className="text-slate-400">Tạo:</span>{" "}
                {viewingUser.created_at ? formatDateTime(viewingUser.created_at) : "Không rõ"}
              </p>
              <p>
                <span className="text-slate-400">Hoạt động:</span>{" "}
                {getOnlineState(viewingUser.last_seen_at).label}
              </p>
              {viewingUser.last_seen_at ? (
                <p>
                  <span className="text-slate-400">Lần cuối:</span>{" "}
                  {formatDateTime(viewingUser.last_seen_at)}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>

      <UserEditorModal
        canDeleteUser={canDeleteUser}
        canToggleUser={canToggleUser}
        onClose={() => setModalOpen(false)}
        onDelete={handleDelete}
        onSubmit={handleSubmit}
        onToggle={handleToggle}
        open={modalOpen}
        roles={roles}
        submitting={submitting}
        user={editingUser}
      />
      <ErrorNoticeModal notice={errorNotice} onClose={() => setErrorNotice(null)} />
    </PageContainer>
  );
}
