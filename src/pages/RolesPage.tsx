import { type FormEvent, useEffect, useState } from "react";
import { Edit3, Plus, Power, ShieldCheck, Trash2 } from "lucide-react";
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

type RoleEditorModalProps = {
  open: boolean;
  role: AppRole | null;
  submitting: boolean;
  canToggleActive: boolean;
  onClose: () => void;
  onSubmit: (input: RoleInput) => Promise<void>;
};

function RoleEditorModal({
  canToggleActive,
  onClose,
  onSubmit,
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
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Button onClick={onClose} type="button" variant="secondary">
            Huy
          </Button>
          <Button form={formId} isLoading={submitting} type="submit">
            Luu role
          </Button>
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
            className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
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
            className="h-4 w-4 accent-green-600"
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
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [submitting, setSubmitting] = useState(false);
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
    setModalOpen(true);
  }

  function openEditModal(role: AppRole) {
    if (!canEditRole) {
      return;
    }

    setEditingRole(role);
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
      await loadRoles();
    } catch (requestError) {
      setErrorNotice({
        message: getErrorMessage(requestError, "Xoa role that bai."),
        title: "Xoa role that bai",
      });
    }
  }

  return (
    <div className="px-4 pb-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-3xl bg-white p-5 shadow-soft ring-1 ring-coal/5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <Badge tone="neutral">{roles.length} role</Badge>
              <Badge tone="green">{roles.filter((role) => role.is_active).length} hoat dong</Badge>
            </div>
            {canCreateRole ? (
              <Button onClick={openCreateModal}>
                <Plus className="h-4 w-4" />
                Tao role
              </Button>
            ) : null}
          </div>
        </section>

        {loading ? (
          <div className="rounded-3xl bg-white p-8 shadow-soft">
            <Spinner label="Dang tai role..." />
          </div>
        ) : roles.length === 0 ? (
          <EmptyState description="Tao role dau tien de phan quyen sidebar." icon={ShieldCheck} title="Chua co role" />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {roles.map((role) => (
              <article className="rounded-3xl bg-white p-5 shadow-soft ring-1 ring-coal/5" key={role.id}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={role.is_active ? "green" : "red"}>
                        {role.is_active ? "Hoat dong" : "Vo hieu hoa"}
                      </Badge>
                      <Badge tone="neutral">{role.code}</Badge>
                    </div>
                    <h3 className="mt-3 text-xl font-extrabold text-coal">{role.name}</h3>
                    <p className="mt-1 text-sm font-semibold leading-6 text-coal/55">
                      {role.description || "Chua co mo ta."}
                    </p>
                  </div>
                  {canEditRole || canToggleRole || canDeleteRole ? (
                    <div className="flex gap-2">
                      {canEditRole ? (
                        <Button className="h-10 w-10 p-0" onClick={() => openEditModal(role)} variant="secondary">
                          <Edit3 className="h-4 w-4" />
                        </Button>
                      ) : null}
                      {canToggleRole ? (
                        <Button className="h-10 w-10 p-0" onClick={() => void handleToggle(role)} variant="secondary">
                          <Power className="h-4 w-4" />
                        </Button>
                      ) : null}
                      {canDeleteRole ? (
                        <Button className="h-10 w-10 p-0" onClick={() => void handleDelete(role)} variant="danger">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {role.permissions.map((permission) => {
                    const permissionInfo = permissionGroups
                      .flatMap((group) => [
                        { key: group.key, label: group.label },
                        ...group.actions.map((action) => ({
                          key: action.key,
                          label: action.label,
                        })),
                      ])
                      .find((item) => item.key === permission);
                    return (
                      <Badge key={permission} tone="neutral">
                        {permissionInfo?.label ?? permission}
                      </Badge>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <RoleEditorModal
        canToggleActive={canToggleRole}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
        open={modalOpen}
        role={editingRole}
        submitting={submitting}
      />
      <ErrorNoticeModal notice={errorNotice} onClose={() => setErrorNotice(null)} />
    </div>
  );
}
