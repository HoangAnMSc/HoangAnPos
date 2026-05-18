import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Edit3, Plus, Power, Trash2, UserCog } from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorNoticeModal, type ErrorNotice } from "../components/ui/ErrorNoticeModal";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "../contexts/AuthContext";
import { formatDateTime } from "../lib/format";
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
  role_id: "",
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

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
    role_id: user.role_id ?? roles[0]?.id ?? "",
  };
}

function getOnlineState(lastSeenAt: string | null) {
  if (!lastSeenAt) {
    return { label: "Chua co hoat dong", online: false };
  }

  const diffMs = Date.now() - new Date(lastSeenAt).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60_000));

  if (minutes <= 5) {
    return { label: "Dang hoat dong", online: true };
  }

  if (minutes < 60) {
    return { label: `Offline ${minutes} phut`, online: false };
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return { label: `Offline ${hours} gio`, online: false };
  }

  return { label: `Offline ${Math.floor(hours / 24)} ngay`, online: false };
}

type UserEditorModalProps = {
  open: boolean;
  roles: AppRole[];
  submitting: boolean;
  user: ManagedUser | null;
  onClose: () => void;
  onSubmit: (input: UserInput) => Promise<void>;
};

function UserEditorModal({
  onClose,
  onSubmit,
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

    if (!form.email.trim() || !form.role_id) {
      setError("Nhap email va chon role.");
      return;
    }

    if (!user && !form.password) {
      setError("Nhap mat khau cho user moi.");
      return;
    }

    try {
      await onSubmit({
        ...form,
        email: form.email.trim(),
        full_name: form.full_name.trim(),
        password: form.password || undefined,
      });
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Luu user that bai."));
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
            Luu user
          </Button>
        </div>
      }
      onClose={onClose}
      open={open}
      size="lg"
      title={user ? "Sua user" : "Tao nguoi quan tri"}
    >
      <form className="space-y-5" id={formId} onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Email"
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            type="email"
            value={form.email}
          />
          <Input
            label={user ? "Mat khau moi (bo trong neu khong doi)" : "Mat khau"}
            onChange={(event) =>
              setForm((current) => ({ ...current, password: event.target.value }))
            }
            type="password"
            value={form.password}
          />
        </div>

        <Input
          label="Ten hien thi"
          onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))}
          value={form.full_name}
        />

        <label className="block">
          <span className="mb-2 block text-sm font-extrabold text-slate-950">Role</span>
          <select
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-coal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            onChange={(event) => setForm((current) => ({ ...current, role_id: event.target.value }))}
            value={form.role_id}
          >
            <option value="">Chon role</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name} {role.is_active ? "" : "(vo hieu hoa)"}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-coal">
          <input
            checked={form.is_active}
            className="h-4 w-4 accent-green-600"
            onChange={(event) =>
              setForm((current) => ({ ...current, is_active: event.target.checked }))
            }
            type="checkbox"
          />
          User dang hoat dong
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
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [users, setUsers] = useState<ManagedUser[]>([]);
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
        detail: "Can cau hinh SUPABASE_SERVICE_ROLE_KEY trong .env/Vercel de quan ly user.",
        message: getErrorMessage(requestError, "Khong tai duoc user."),
        title: "Khong tai duoc user",
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

  function openCreateModal() {
    if (!canCreateUser) {
      return;
    }

    setEditingUser(null);
    setModalOpen(true);
  }

  function openEditModal(user: ManagedUser) {
    if (!canEditUser) {
      return;
    }

    setEditingUser(user);
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
        role_id: user.role_id ?? roles[0]?.id ?? "",
      });
      await loadData();
    } catch (requestError) {
      setErrorNotice({
        message: getErrorMessage(requestError, "Doi trang thai user that bai."),
        title: "Doi trang thai that bai",
      });
    }
  }

  async function handleDelete(user: ManagedUser) {
    if (!canDeleteUser) {
      return;
    }

    if (!window.confirm(`Xoa user "${user.email}"?`)) {
      return;
    }

    try {
      await deleteManagedUser(user.id);
      await loadData();
    } catch (requestError) {
      setErrorNotice({
        message: getErrorMessage(requestError, "Xoa user that bai."),
        title: "Xoa user that bai",
      });
    }
  }

  return (
    <div className="px-4 pb-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-3xl bg-white p-5 shadow-soft ring-1 ring-coal/5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <Badge tone="neutral">{users.length} user</Badge>
              <Badge tone="green">{onlineCount} dang online</Badge>
              <Badge tone="red">{users.filter((user) => !user.is_active).length} vo hieu hoa</Badge>
            </div>
            {canCreateUser ? (
              <Button onClick={openCreateModal}>
                <Plus className="h-4 w-4" />
                Tao quan tri
              </Button>
            ) : null}
          </div>
        </section>

        {loading ? (
          <div className="rounded-3xl bg-white p-8 shadow-soft">
            <Spinner label="Dang tai user..." />
          </div>
        ) : users.length === 0 ? (
          <EmptyState description="Tao nguoi quan tri dau tien de phan quyen." icon={UserCog} title="Chua co user" />
        ) : (
          <div className="overflow-hidden rounded-3xl bg-white shadow-soft ring-1 ring-coal/5">
            <div className="hidden grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_0.6fr] gap-4 border-b border-coal/5 px-5 py-3 text-xs font-extrabold uppercase tracking-wide text-coal/45 lg:grid">
              <span>User</span>
              <span>Role</span>
              <span>Trang thai</span>
              <span>Hoat dong</span>
              <span />
            </div>
            <div className="divide-y divide-coal/5">
              {users.map((user) => {
                const online = getOnlineState(user.last_seen_at);

                return (
                  <article
                    className="grid gap-3 px-5 py-4 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_0.6fr] lg:items-center"
                    key={user.id}
                  >
                    <div>
                      <p className="font-extrabold text-coal">{user.full_name || user.email}</p>
                      <p className="mt-1 text-sm font-semibold text-coal/45">{user.email}</p>
                      <p className="mt-1 text-xs font-semibold text-coal/35">
                        Tao {user.created_at ? formatDateTime(user.created_at) : "khong ro"}
                      </p>
                    </div>
                    <div>
                      <Badge tone="neutral">{user.role?.name ?? "Chua gan role"}</Badge>
                    </div>
                    <div>
                      <Badge tone={user.is_active ? "green" : "red"}>
                        {user.is_active ? "Hoat dong" : "Vo hieu hoa"}
                      </Badge>
                    </div>
                    <div>
                      <Badge tone={online.online ? "green" : "neutral"}>{online.label}</Badge>
                      {user.last_seen_at ? (
                        <p className="mt-1 text-xs font-semibold text-coal/40">
                          {formatDateTime(user.last_seen_at)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex gap-2 lg:justify-end">
                      {canEditUser ? (
                        <Button className="h-10 w-10 p-0" onClick={() => openEditModal(user)} variant="secondary">
                          <Edit3 className="h-4 w-4" />
                        </Button>
                      ) : null}
                      {canToggleUser ? (
                        <Button className="h-10 w-10 p-0" onClick={() => void handleToggle(user)} variant="secondary">
                          <Power className="h-4 w-4" />
                        </Button>
                      ) : null}
                      {canDeleteUser ? (
                        <Button className="h-10 w-10 p-0" onClick={() => void handleDelete(user)} variant="danger">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <UserEditorModal
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
        open={modalOpen}
        roles={roles}
        submitting={submitting}
        user={editingUser}
      />
      <ErrorNoticeModal notice={errorNotice} onClose={() => setErrorNotice(null)} />
    </div>
  );
}
