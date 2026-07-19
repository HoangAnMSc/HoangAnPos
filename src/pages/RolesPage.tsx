import { type FormEvent, useEffect, useState } from "react";
import { Edit3, Plus, Power, Search, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorNoticeModal, type ErrorNotice } from "../components/ui/ErrorNoticeModal";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "../contexts/AuthContext";
import {
  allRolePermissionKeys,
  getPermissionGroupKeys,
  normalizeRolePermissions,
  permissionGroups,
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
    description: role.description ?? "",
    is_active: role.is_active,
    name: role.name,
    permissions: role.code === "admin" ? [...allRolePermissionKeys] : normalizeRolePermissions(role.permissions),
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const permissionLabels = permissionGroups.flatMap((group) => [
  { key: group.key, label: group.label },
  ...group.actions.map((action) => ({ key: action.key, label: action.label })),
]);

function getPermissionLabel(permission: string) {
  return permissionLabels.find((item) => item.key === permission)?.label ?? permission;
}

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
  const systemRole = role?.code === "admin" || role?.code === "staff";
  const permissionLocked = role?.code === "admin";

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
      setError("Nhap ten role va ma role.");
      return;
    }

    if (form.permissions.length === 0) {
      setError("Chon it nhat mot quyen.");
      return;
    }

    try {
      await onSubmit({
        ...form,
        permissions: permissionLocked ? [...allRolePermissionKeys] : normalizeRolePermissions(form.permissions),
      });
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Luu role that bai."));
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
                {role.is_active ? "Vo hieu hoa" : "Kich hoat"}
              </Button>
            ) : null}
            {role && canDeleteRole ? (
              <Button onClick={() => void onDelete(role)} type="button" variant="danger">
                <Trash2 className="h-4 w-4" />
                Xoa
              </Button>
            ) : null}
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button onClick={onClose} type="button" variant="secondary">
              Huy
            </Button>
            <Button form={formId} isLoading={submitting} type="submit">
              Luu role
            </Button>
          </div>
        </div>
      }
      onClose={onClose}
      open={open}
      size="xl"
      title={role ? "Sua role" : "Tao role"}
    >
      <form className="space-y-5" id={formId} onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            disabled={systemRole}
            label="Ten role"
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            value={form.name}
          />
          <Input
            disabled={systemRole}
            label="Ma role"
            onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
            value={form.code}
          />
        </div>

        <label className="block">
          <span className="mb-2 block text-sm font-extrabold text-slate-950">Mo ta</span>
          <textarea
            className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-moss-400 focus:ring-4 focus:ring-moss-100"
            onChange={(event) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
            value={form.description ?? ""}
          />
        </label>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-extrabold text-slate-950">Quyen theo tung trang</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Chon ten trang de hien tren sidebar, chon tung thao tac de hien nut chuc nang.
              </p>
            </div>
            <Button
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  permissions:
                    current.permissions.length === allRolePermissionKeys.length
                      ? []
                      : [...allRolePermissionKeys],
                }))
              }
              disabled={permissionLocked}
              type="button"
              variant="secondary"
            >
              {form.permissions.length === allRolePermissionKeys.length ? "Bo chon" : "Chon tat ca"}
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {permissionGroups.map((group) => {
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
                        {allSelected ? "Bo" : "Tat ca"}
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
          Role dang hoat dong
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
  const { canAccess } = useAuth();
  const [editingRole, setEditingRole] = useState<AppRole | null>(null);
  const [errorNotice, setErrorNotice] = useState<ErrorNotice | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState("");
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
        message: getErrorMessage(requestError, "Khong tai duoc role."),
        title: "Khong tai duoc role",
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
      if (editingRole) {
        await updateRole(editingRole.id, input);
      } else {
        await createRole(input);
      }

      setModalOpen(false);
      setEditingRole(null);
      setViewingRole(null);
      await loadRoles();
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
    } catch (requestError) {
      setErrorNotice({
        message: getErrorMessage(requestError, "Doi trang thai role that bai."),
        title: "Doi trang thai that bai",
      });
    }
  }

  async function handleDelete(role: AppRole) {
    if (!canDeleteRole) {
      return;
    }

    if (!window.confirm(`Xoa role "${role.name}"?`)) {
      return;
    }

    try {
      await deleteRole(role);
      setModalOpen(false);
      setEditingRole(null);
      setViewingRole(null);
      await loadRoles();
    } catch (requestError) {
      setErrorNotice({
        message: getErrorMessage(requestError, "Xoa role that bai."),
        title: "Xoa role that bai",
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
    <div className="px-3 pb-8 sm:px-4 lg:px-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <section className="rounded-xl bg-white p-4 shadow-soft ring-1 ring-coal/5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wide text-coal/45">
                Phan quyen
              </p>
              <h2 className="mt-1 font-display text-xl font-bold text-coal">Quan ly role</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge tone="neutral">{roles.length} role</Badge>
                <Badge tone="neutral">{filteredRoles.length} dang hien thi</Badge>
                <Badge tone="green">{roles.filter((role) => role.is_active).length} hoat dong</Badge>
              </div>
            </div>
            {canCreateRole ? (
              <Button className="h-10 rounded-xl px-3" onClick={openCreateModal}>
                <Plus className="h-4 w-4" />
                Tao role
              </Button>
            ) : null}
          </div>

          <div className="relative mt-3 w-full xl:max-w-xl">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-coal/35" />
            <Input
              className="h-10 rounded-xl py-2 pl-11"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tim role, ma role, mo ta..."
              value={query}
            />
          </div>
        </section>

        {loading ? (
          <div className="rounded-xl bg-white p-6 shadow-soft">
            <Spinner label="Dang tai role..." />
          </div>
        ) : filteredRoles.length === 0 ? (
          <EmptyState description="Tao role dau tien de phan quyen sidebar." icon={ShieldCheck} title="Chua co role" />
        ) : (
          <div className="overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-coal/5">
            <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(0,1.2fr)_auto] gap-3 border-b border-coal/5 bg-coal px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide text-white/70 lg:grid">
              <span>Role</span>
              <span>Mo ta</span>
              <span>Quyen</span>
              <span className="text-right">Thao tac</span>
            </div>
            <div className="divide-y divide-coal/5">
              {filteredRoles.map((role) => {
                const visiblePermissions = role.permissions.slice(0, 4);
                const hiddenPermissionCount = Math.max(role.permissions.length - visiblePermissions.length, 0);

                return (
                  <button
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 py-3 text-left transition hover:bg-cream/30 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(0,1.2fr)_auto] lg:gap-3"
                    key={role.id}
                    onClick={() => setViewingRole(role)}
                    type="button"
                  >
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-extrabold text-coal">{role.name}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 lg:mt-2 lg:gap-2">
                        <Badge tone="neutral">{role.code}</Badge>
                        <Badge tone={role.is_active ? "green" : "red"}>
                          {role.is_active ? "Hoat dong" : "Vo hieu hoa"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs font-semibold text-coal/45 lg:hidden">
                        {role.permissions.length} quyen duoc gan
                      </p>
                    </div>

                    <p className="hidden line-clamp-2 text-sm font-semibold leading-5 text-coal/55 lg:block">
                      {role.description || "Chua co mo ta."}
                    </p>

                    <div className="hidden min-w-0 lg:block">
                      <div className="flex flex-wrap gap-1.5">
                        {visiblePermissions.map((permission) => (
                          <Badge key={permission} tone="neutral">
                            {getPermissionLabel(permission)}
                          </Badge>
                        ))}
                        {hiddenPermissionCount > 0 ? (
                          <Badge tone="amber">+{hiddenPermissionCount} quyen</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs font-semibold text-coal/40">
                        {role.permissions.length} quyen duoc gan
                      </p>
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
      </div>

      <Modal
        footer={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button onClick={() => setViewingRole(null)} type="button" variant="secondary">
              Dong
            </Button>
            {viewingRole && canEditRole ? (
              <Button onClick={() => openEditModal(viewingRole)} type="button">
                <Edit3 className="h-4 w-4" />
                Sua
              </Button>
            ) : null}
          </div>
        }
        onClose={() => setViewingRole(null)}
        open={Boolean(viewingRole)}
        size="lg"
        title="Xem role"
      >
        {viewingRole ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">{viewingRole.code}</Badge>
                <Badge tone={viewingRole.is_active ? "green" : "red"}>
                  {viewingRole.is_active ? "Hoat dong" : "Vo hieu hoa"}
                </Badge>
              </div>
              <h3 className="mt-3 text-xl font-extrabold text-slate-950">{viewingRole.name}</h3>
              <p className="mt-2 text-sm font-semibold text-slate-600">
                {viewingRole.description || "Chua co mo ta."}
              </p>
            </div>
            <div>
              <p className="mb-2 text-sm font-extrabold text-slate-950">
                {viewingRole.permissions.length} quyen
              </p>
              <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-100 p-3">
                <div className="flex flex-wrap gap-2">
                  {viewingRole.permissions.map((permission) => (
                    <Badge key={permission} tone="neutral">
                      {getPermissionLabel(permission)}
                    </Badge>
                  ))}
                </div>
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
    </div>
  );
}
