import { type FormEvent, useEffect, useState } from "react";
import { ChevronRight, Edit3, Plus, Power, Search, ShieldCheck, Trash2 } from "lucide-react";
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
import {
  allRolePermissionKeys,
  appNavigationSections,
  getPermissionGroupKeys,
  normalizeRolePermissions,
  permissionGroups,
  superAdminPermissionKeys,
} from "../lib/permissions";
import {
  createRole,
  deleteRole,
  fetchRoles,
  setRoleActive,
  updateRole,
  type RoleInput,
} from "../services/roles";
import type { AppRole } from "../types";

type RoleFormState = RoleInput;

const emptyRoleForm: RoleFormState = {
  code: "",
  color: "#8b5cf6",
  description: "",
  is_active: true,
  name: "",
  permissions: [],
};

function roleToForm(role?: AppRole | null): RoleFormState {
  if (!role) {
    return emptyRoleForm;
  }

  return {
    code: role.code,
    color: role.code === "admin" ? "#d4a72c" : role.code === "staff" ? "#94a3b8" : role.color || "#8b5cf6",
    description: role.description ?? "",
    is_active: role.is_active,
    name: role.name,
    permissions:
      role.code === "admin"
        ? [...superAdminPermissionKeys]
        : normalizeRolePermissions(role.permissions),
  };
}

const permissionLabels = permissionGroups.flatMap((group) => [
  { key: group.key, label: group.label },
  ...group.actions.map((action) => ({ key: action.key, label: action.label })),
]);

const orderedPermissionGroups = appNavigationSections.flatMap((section) =>
  section.keys.flatMap((key) => {
    const group = permissionGroups.find((item) => item.key === key);
    return group ? [group] : [];
  }),
);

function getPermissionLabel(permission: string) {
  return permissionLabels.find((item) => item.key === permission)?.label ?? permission;
}

const roleColorOptions = [
  ["#d4a72c", "Gold"],
  ["#8b5cf6", "Tím"], ["#0ea5e9", "Xanh dương"], ["#14b8a6", "Xanh ngọc"],
  ["#f97316", "Cam"], ["#e11d48", "Đỏ hồng"], ["#64748b", "Xám"],
] as const;

type RoleEditorModalProps = {
  open: boolean;
  role: AppRole | null;
  submitting: boolean;
  canDeleteRole: boolean;
  canToggleActive: boolean;
  onClose: () => void;
  onDelete: (role: AppRole) => Promise<void>;
  onSubmit: (input: RoleInput) => Promise<void>;
  onToggle: (role: AppRole) => Promise<void>;
};

function RoleEditorModal({
  canDeleteRole,
  canToggleActive,
  onClose,
  onDelete,
  onSubmit,
  onToggle,
  open,
  role,
  submitting,
}: RoleEditorModalProps) {
  const [form, setForm] = useState<RoleFormState>(() => roleToForm(role));
  const [error, setError] = useState("");
  const formId = role ? `role-form-${role.id}` : "role-form-create";
  const permissionLocked = role?.code === "admin";
  const selectablePermissionKeys = permissionLocked
    ? superAdminPermissionKeys
    : allRolePermissionKeys;

  useEffect(() => {
    setForm(roleToForm(role));
    setError("");
  }, [open, role]);

  function togglePermission(permission: string) {
    if (permissionLocked) {
      return;
    }

    setForm((current) => {
      const selected = current.permissions.includes(permission);
      const nextPermissions = selected
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission];

      return {
        ...current,
        permissions: normalizeRolePermissions(nextPermissions),
      };
    });
  }

  function toggleGroup(group: (typeof permissionGroups)[number]) {
    if (permissionLocked) {
      return;
    }

    const groupKeys = getPermissionGroupKeys(group);
    setForm((current) => {
      const selected = groupKeys.every((permission) => current.permissions.includes(permission));
      const nextPermissions = selected
        ? current.permissions.filter((permission) => !groupKeys.includes(permission))
        : Array.from(new Set([...current.permissions, ...groupKeys]));

      return {
        ...current,
        permissions: normalizeRolePermissions(nextPermissions),
      };
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!form.name.trim() || !form.code.trim()) {
      setError("Nhập tên và mã vai trò.");
      return;
    }

    if (form.permissions.length === 0) {
      setError("Chọn ít nhất một quyền.");
      return;
    }

    try {
      await onSubmit({
        ...form,
        permissions: permissionLocked
          ? [...superAdminPermissionKeys]
          : normalizeRolePermissions(form.permissions),
      });
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Lưu vai trò thất bại."));
    }
  }

  return (
    <Modal
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {role && canToggleActive && role.code !== "admin" ? (
              <Button onClick={() => void onToggle(role)} type="button" variant="secondary">
                <Power className="h-4 w-4" />
                {role.is_active ? "Ẩn vai trò" : "Công khai vai trò"}
              </Button>
            ) : null}
            {role && canDeleteRole ? (
              <Button onClick={() => void onDelete(role)} type="button" variant="danger">
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
              Lưu vai trò
            </Button>
          </div>
        </div>
      }
      onClose={onClose}
      open={open}
      size="xl"
      title={role ? "Sửa vai trò" : "Tạo vai trò"}
    >
      <form className="space-y-5" id={formId} onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Tên vai trò"
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            value={form.name}
          />
          <Input
            disabled={role?.code === "admin" || role?.code === "staff"}
            label="Mã vai trò"
            onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
            value={form.code}
          />
        </div>

        <label className="block">
          <span className="mb-2 block text-sm font-extrabold text-slate-950">Mô tả</span>
          <textarea
            className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-moss-400 focus:ring-4 focus:ring-moss-100"
            onChange={(event) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
            value={form.description ?? ""}
          />
        </label>

        <fieldset>
          <legend className="mb-2 text-sm font-extrabold text-slate-950">Màu nhận diện</legend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {roleColorOptions.map(([color, label]) => (
              <label className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border px-2 py-3 text-center text-xs font-bold transition ${form.color === color ? "border-slate-900 bg-slate-50" : "border-slate-200"}`} key={color}>
                <input checked={form.color === color} className="sr-only" disabled={role?.code === "admin" || role?.code === "staff"} name="role-color" onChange={() => setForm((current) => ({ ...current, color }))} type="radio" value={color} />
                <span className="h-5 w-5 rounded-full" style={{ backgroundColor: color }} />
                <span className="truncate">{label}</span>
              </label>
            ))}
          </div>
          {role?.code === "admin" || role?.code === "staff" ? <p className="mt-2 text-xs font-semibold text-slate-500">Màu của vai trò hệ thống được cố định.</p> : null}
        </fieldset>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-extrabold text-slate-950">Quyền theo từng trang</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Chọn tên trang để hiển thị trên thanh điều hướng, sau đó chọn từng thao tác được phép.
              </p>
            </div>
            <Button
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  permissions:
                    current.permissions.length === selectablePermissionKeys.length
                      ? []
                      : [...selectablePermissionKeys],
                }))
              }
              disabled={permissionLocked}
              type="button"
              variant="secondary"
            >
              {form.permissions.length === selectablePermissionKeys.length ? "Bỏ chọn" : "Chọn tất cả"}
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {orderedPermissionGroups.map((group) => {
              const groupKeys = getPermissionGroupKeys(group);
              const allSelected = groupKeys.every((permission) => form.permissions.includes(permission));

              return (
                <section className="rounded-2xl border border-slate-200 bg-white p-4" key={group.key}>
                  <div className="flex items-start justify-between gap-3">
                    <label className="flex min-w-0 cursor-pointer items-start gap-3">
                      <input
                        checked={form.permissions.includes(group.key)}
                        className="mt-1 h-4 w-4 accent-coal"
                        disabled={permissionLocked}
                        onChange={() => togglePermission(group.key)}
                        type="checkbox"
                      />
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-sm font-extrabold text-coal">
                          <group.icon className="h-4 w-4 text-coal/60" />
                          {group.label}
                        </span>
                        <span className="mt-1 block text-xs font-semibold leading-5 text-coal/50">
                          {group.description}
                        </span>
                      </span>
                    </label>
                    {group.actions.length > 0 ? (
                      <Button
                        className="h-9 px-3"
                        disabled={permissionLocked}
                        onClick={() => toggleGroup(group)}
                        type="button"
                        variant="secondary"
                      >
                        {allSelected ? "Bo" : "Tất cả"}
                      </Button>
                    ) : null}
                  </div>

                  {group.actions.length > 0 ? (
                    <div className="mt-3 grid gap-2">
                      {group.actions.map((action) => (
                        <label
                          className="flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-coal"
                          key={action.key}
                        >
                          <input
                            checked={form.permissions.includes(action.key)}
                            className="mt-1 h-4 w-4 accent-coal"
                            disabled={permissionLocked}
                            onChange={() => togglePermission(action.key)}
                            type="checkbox"
                          />
                          <span>
                            <span className="block">{action.label}</span>
                            <span className="mt-0.5 block text-xs font-semibold leading-5 text-coal/45">
                              {action.description}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </section>

        <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-coal">
          <input
            checked={form.is_active}
            className="h-4 w-4 accent-moss-600"
            disabled={!canToggleActive || role?.code === "admin"}
            onChange={(event) =>
              setForm((current) => ({ ...current, is_active: event.target.checked }))
            }
            type="checkbox"
          />
          Vai trò công khai
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

export function RolesPage() {
  const { confirmAction, showSuccess } = useActionNotice();
  const { canAccess } = useAuth();
  const [editingRole, setEditingRole] = useState<AppRole | null>(null);
  const [errorNotice, setErrorNotice] = useState<ErrorNotice | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [viewingRole, setViewingRole] = useState<AppRole | null>(null);
  const canCreateRole = canAccess("roles.create");
  const canEditRole = canAccess("roles.update");
  const canToggleRole = canAccess("roles.toggle-active");
  const canDeleteRole = canAccess("roles.delete");

  async function loadRoles() {
    setLoading(true);

    try {
      setRoles(await fetchRoles());
    } catch (requestError) {
      setErrorNotice({
        message: getErrorMessage(requestError, "Không tải được vai trò."),
        title: "Không tải được vai trò",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRoles();
  }, []);

  function openCreateModal() {
    if (!canCreateRole) {
      return;
    }

    setEditingRole(null);
    setViewingRole(null);
    setModalOpen(true);
  }

  function openEditModal(role: AppRole) {
    if (!canEditRole) {
      return;
    }

    setEditingRole(role);
    setViewingRole(null);
    setModalOpen(true);
  }

  async function handleSubmit(input: RoleInput) {
    if ((editingRole && !canEditRole) || (!editingRole && !canCreateRole)) {
      return;
    }

    setSubmitting(true);

    try {
      const wasEditing = Boolean(editingRole);
      if (editingRole) {
        await updateRole(editingRole.id, input);
      } else {
        await createRole(input);
      }

      setModalOpen(false);
      setEditingRole(null);
      setViewingRole(null);
      await loadRoles();
      showSuccess(wasEditing ? "Đã lưu thay đổi vai trò." : "Đã thêm vai trò mới.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(role: AppRole) {
    if (!canToggleRole) {
      return;
    }

    try {
      await setRoleActive(role.id, !role.is_active);
      await loadRoles();
      showSuccess(`Đã ${role.is_active ? "ẩn" : "công khai"} vai trò.`);
    } catch (requestError) {
      setErrorNotice({
        message: getErrorMessage(requestError, "Đổi trạng thái vai trò thất bại."),
        title: "Đổi trạng thái thất bại",
      });
    }
  }

  async function handleDelete(role: AppRole) {
    if (!canDeleteRole) {
      return;
    }

    if (!await confirmAction({
      confirmLabel: "Xóa vai trò",
      message: `Bạn có chắc muốn xóa vai trò “${role.name}”?`,
      title: "Xác nhận xóa vai trò",
      tone: "danger",
    })) {
      return;
    }

    try {
      await deleteRole(role);
      setModalOpen(false);
      setEditingRole(null);
      setViewingRole(null);
      await loadRoles();
      showSuccess("Đã xóa vai trò.");
    } catch (requestError) {
      setErrorNotice({
        message: getErrorMessage(requestError, "Xóa vai trò thất bại."),
        title: "Xóa vai trò thất bại",
      });
    }
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filteredRoles = roles.filter((role) =>
    [role.name, role.code, role.description]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalizedQuery))
  );

  return (
    <PageContainer className="pb-28 sm:pb-10">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
          <div className="hidden items-center gap-3 p-4 sm:flex">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="h-11 rounded-xl border-slate-200 bg-slate-50 py-2 pl-11 focus:bg-white"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm tên, mã vai trò hoặc mô tả"
                value={query}
              />
            </div>
            {canCreateRole ? (
              <Button className="h-11 shrink-0 px-3" onClick={openCreateModal}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Tạo vai trò</span>
              </Button>
            ) : null}
          </div>
          <div className="grid grid-cols-3 border-t border-slate-100 bg-slate-50/70">
            <div className="px-3 py-3 sm:px-4"><p className="text-lg font-black tabular-nums text-slate-950">{roles.length}</p><p className="text-[11px] font-bold text-slate-500 sm:text-xs">Tổng vai trò</p></div>
            <div className="border-x border-slate-200 px-3 py-3 sm:px-4"><p className="text-lg font-black tabular-nums text-moss-800">{roles.filter((role) => role.is_active).length}</p><p className="text-[11px] font-bold text-slate-500 sm:text-xs">Công khai</p></div>
            <div className="px-3 py-3 sm:px-4"><p className="text-lg font-black tabular-nums text-slate-950">{filteredRoles.length}</p><p className="text-[11px] font-bold text-slate-500 sm:text-xs">Đang hiển thị</p></div>
          </div>
        </section>

        {loading ? (
          <div className="rounded-xl bg-white p-6 shadow-soft">
            <Spinner label="Đang tải vai trò..." />
          </div>
        ) : filteredRoles.length === 0 ? (
          <EmptyState description="Tạo vai trò đầu tiên để phân quyền truy cập." icon={ShieldCheck} title="Chưa có vai trò" />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft max-lg:border-0 max-lg:bg-transparent max-lg:shadow-none">
            <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(0,1.2fr)_32px] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-extrabold uppercase tracking-wide text-slate-500 lg:grid">
              <span>Vai trò</span>
              <span>Mô tả</span>
              <span>Quyền</span>
              <span />
            </div>
            <div className="divide-y divide-coal/5 max-lg:grid max-lg:gap-3 max-lg:divide-y-0">
              {filteredRoles.map((role) => {
                const visiblePermissions = role.permissions.slice(0, 3);

                return (
                  <button
                    className={`relative grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-l-4 px-4 py-4 text-left transition max-lg:overflow-hidden max-lg:rounded-2xl max-lg:border max-lg:border-l-4 max-lg:border-slate-200 max-lg:shadow-[0_4px_16px_rgba(15,23,42,0.05)] lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(0,1.2fr)_32px] lg:px-5 ${role.is_active ? "bg-white hover:bg-slate-50" : "bg-white after:pointer-events-none after:absolute after:inset-0 after:bg-slate-300/50"}`}
                    key={role.id}
                    onClick={() => setViewingRole(role)}
                    style={{ borderLeftColor: role.code === "admin" ? "#d4a72c" : role.code === "staff" ? "#94a3b8" : role.color || "#8b5cf6" }}
                    type="button"
                  >
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-extrabold text-coal">{role.name}</h3>
                      <p className="mt-1 text-xs font-semibold text-coal/45 lg:hidden">
                        {role.permissions.length} quyền được gán
                      </p>
                      <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-slate-500 lg:hidden">{role.description || "Chưa có mô tả."}</p>
                    </div>

                    <p className="hidden line-clamp-2 text-sm font-semibold leading-5 text-coal/55 lg:block">
                      {role.description || "Chưa có mô tả."}
                    </p>

                    <div className="hidden min-w-0 lg:block">
                      <p className="line-clamp-2 text-sm font-semibold leading-5 text-slate-700">{visiblePermissions.map(getPermissionLabel).join(", ")}{role.permissions.length > visiblePermissions.length ? ` và ${role.permissions.length - visiblePermissions.length} quyền khác` : ""}</p>
                      <p className="mt-1 text-xs font-semibold text-coal/40">{role.permissions.length} quyền được gán</p>
                    </div>

                    <ChevronRight className="h-5 w-5 text-slate-400" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 pb-[calc(.65rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_28px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:hidden">
        <div className={`mx-auto grid max-w-lg gap-2 ${canCreateRole ? "grid-cols-2" : "grid-cols-1"}`}>
          <button className="flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-extrabold text-slate-700" onClick={() => setSearchModalOpen(true)} type="button"><Search className="h-4 w-4" />Tìm kiếm</button>
          {canCreateRole ? <button className="flex h-11 items-center justify-center gap-2 rounded-xl bg-coal text-sm font-extrabold text-white shadow-sm" onClick={openCreateModal} type="button"><Plus className="h-4 w-4" />Tạo vai trò</button> : null}
        </div>

      </div>

      <Modal footer={<Button className="w-full sm:w-auto" onClick={() => setSearchModalOpen(false)}>Xem {filteredRoles.length} kết quả</Button>} onClose={() => setSearchModalOpen(false)} open={searchModalOpen} size="sm" title="Tìm vai trò">
        <div className="space-y-3">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><Input autoFocus className="h-12 rounded-xl pl-11" onChange={(event) => setQuery(event.target.value)} placeholder="Tên, mã vai trò hoặc mô tả" value={query} /></div>
          <p className="text-sm font-semibold text-slate-500">Tìm thấy {filteredRoles.length} vai trò</p>
        </div>
      </Modal>

      <Modal
        footer={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button onClick={() => setViewingRole(null)} type="button" variant="secondary">
              Đóng
            </Button>
            {viewingRole && canEditRole ? (
              <Button onClick={() => openEditModal(viewingRole)} type="button">
                <Edit3 className="h-4 w-4" />
                Sửa
              </Button>
            ) : null}
          </div>
        }
        onClose={() => setViewingRole(null)}
        open={Boolean(viewingRole)}
        size="lg"
        title="Thông tin vai trò"
      >
        {viewingRole ? (
          <div className="space-y-4">
            <h3 className="text-xl font-extrabold text-slate-950">{viewingRole.name}</h3>
            <dl className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="grid gap-1 px-4 py-3 sm:grid-cols-[130px_1fr] sm:gap-4"><dt className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Mã vai trò</dt><dd className="text-sm font-bold text-slate-800 sm:text-right">{viewingRole.code}</dd></div>
              <div className="grid gap-1 px-4 py-3 sm:grid-cols-[130px_1fr] sm:gap-4"><dt className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Hiển thị</dt><dd className="text-sm font-bold text-slate-800 sm:text-right">{viewingRole.is_active ? "Công khai" : "Ẩn"}</dd></div>
              <div className="grid gap-1 px-4 py-3 sm:grid-cols-[130px_1fr] sm:gap-4"><dt className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Mô tả</dt><dd className="text-sm font-bold text-slate-800 sm:text-right">{viewingRole.description || "Chưa có mô tả."}</dd></div>
            </dl>
            <div>
              <p className="mb-2 text-sm font-extrabold text-slate-950">
                {viewingRole.permissions.length} quyền
              </p>
              <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-100 p-3">
                <ul className="grid gap-2 sm:grid-cols-2">
                  {viewingRole.permissions.map((permission) => <li className="flex items-start gap-2 text-sm font-semibold text-slate-700" key={permission}><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />{getPermissionLabel(permission)}</li>)}
                </ul>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <RoleEditorModal
        canDeleteRole={canDeleteRole}
        canToggleActive={canToggleRole}
        onClose={() => setModalOpen(false)}
        onDelete={handleDelete}
        onSubmit={handleSubmit}
        onToggle={handleToggle}
        open={modalOpen}
        role={editingRole}
        submitting={submitting}
      />
      <ErrorNoticeModal notice={errorNotice} onClose={() => setErrorNotice(null)} />
    </PageContainer>
  );
}
