"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { useRouter } from "next/navigation";

type User = {
  _id: string;
  name: string;
  email: string;
  role?: string;
  voteStatus?: boolean;
};

const backendBase = "http://localhost:4000";

/**
 * Portal modal (stable identity). onClose optional.
 */
function ModalPortal({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  if (typeof document === "undefined") return null;

  const inner = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-lg text-black"
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  );

  return ReactDOM.createPortal(inner, document.body);
}

/**
 * Add/Edit form extracted and memoized so it won't remount on parent re-renders.
 * Focus handled locally (only once).
 */
const AddEditForm = React.memo(function AddEditForm({
  initialName,
  initialEmail,
  initialRole,
  onSubmit,
  onCancel,
  submitting,
  isEdit,
  isSelf,
}: {
  initialName: string;
  initialEmail: string;
  initialRole: string;
  onSubmit: (payload: { name: string; email?: string; role?: string; password?: string }) => void;
  onCancel: () => void;
  submitting: boolean;
  isEdit: boolean;
  isSelf: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [role, setRole] = useState(initialRole);
  const [password, setPassword] = useState("");
  const nameRef = useRef<HTMLInputElement | null>(null);
  const hasFocusedRef = useRef(false);

  // initialize once on mount
  useEffect(() => {
    setName(initialName);
    setEmail(initialEmail);
    setRole(initialRole);
    setPassword("");
    hasFocusedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hasFocusedRef.current) return;
    const t = setTimeout(() => {
      const el = nameRef.current;
      if (el) {
        el.focus();
        const v = el.value;
        el.setSelectionRange(v.length, v.length);
        hasFocusedRef.current = true;
      }
    }, 10);
    return () => clearTimeout(t);
  }, []);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const payload: any = { name };
        if (!isEdit) {
          payload.email = email;
          payload.role = role;
          payload.password = password;
        } else {
          // edit: allow role change only if not self (admin editing other user)
          if (!isSelf) payload.role = role;
        }
        onSubmit(payload);
      }}
      className="space-y-3"
    >
      <div>
        <label className="block text-sm text-black">Name</label>
        <input
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="mt-1 w-full rounded border p-2 text-black"
        />
      </div>

      <div>
        <label className="block text-sm text-black">Email</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          type="email"
          className="mt-1 w-full rounded border p-2 text-black"
          readOnly={isEdit} // readonly on edit
        />
      </div>

      <div>
        <label className="block text-sm text-black">Role</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="mt-1 w-full rounded border p-2 text-black"
          disabled={isSelf} // if editing self, role cannot be changed
        >
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
      </div>

      {/* password only when creating (register) */}
      {!isEdit && (
        <div>
          <label className="block text-sm text-black">Password</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            type="password"
            className="mt-1 w-full rounded border p-2 text-black"
          />
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded border px-3 py-1 text-sm">
          Cancel
        </button>
        <button type="submit" disabled={submitting} className="rounded bg-blue-600 px-3 py-1 text-sm text-white">
          {submitting ? "Saving..." : isEdit ? "Save changes" : "Create user"}
        </button>
      </div>
    </form>
  );
});
AddEditForm.displayName = "AddEditForm";

export default function AdminUsersPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);

  // modal states
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);

  const [submitting, setSubmitting] = useState(false);

  // form initial values stored to pass as stable props to AddEditForm
  const [formInit, setFormInit] = useState({ name: "", email: "", role: "user" });

  // current logged-in user
  const [currentUser, setCurrentUser] = useState<{ _id?: string; role?: string } | null>(null);

  useEffect(() => setMounted(true), []);

  // load current user from localStorage (or decode token if you prefer)
  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        setCurrentUser({ _id: parsed.id ?? parsed._id, role: parsed.role });
        return;
      } catch {}
    }
    // fallback: try to decode JWT from token
    const token = localStorage.getItem("token");
    if (token) {
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          setCurrentUser({ _id: payload.id ?? payload._id ?? payload.sub, role: payload.role });
        }
      } catch {}
    }
  }, []);

  // fetchUsers is wrapped in useCallback so identity stable
  const fetchUsers = useCallback(
    async (options?: { force?: boolean }) => {
      // page restricted: only admin
      if (!currentUser || currentUser.role !== "admin") {
        // redirect away if mounted
        return;
      }

      // skip auto-fetch while modal open unless forced
      if (showAddEditModal && !options?.force) return;

      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${backendBase}/api/users`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token") ?? ""}`,
          },
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => null);
          throw new Error(errBody?.message ?? `Failed to fetch users (status ${res.status})`);
        }

        const data = await res.json();
        const list: any[] = Array.isArray(data) ? data : data.items ?? data.users ?? [];
        const normalized: User[] = list.map((u: any) => ({
          _id: String(u._id ?? u.id ?? u.email ?? Math.random()),
          name: u.name ?? "",
          email: u.email ?? "",
          role: u.role ?? "user",
          voteStatus: typeof u.voteStatus === "boolean" ? u.voteStatus : Boolean(u.voteStatus),
        }));

        setUsers(normalized);
      } catch (err: any) {
        setError(err?.message ?? "Failed to fetch users");
      } finally {
        setLoading(false);
      }
    },
    [showAddEditModal, currentUser]
  );

  useEffect(() => {
    if (!mounted) return;
    // require login
    const token = localStorage.getItem("token");
    const userRaw = localStorage.getItem("user");
    if (!token && !userRaw) {
      router.replace("/");
      return;
    }

    // if currentUser loaded and not admin, redirect
    if (currentUser && currentUser.role !== "admin") {
      router.replace("/");
      return;
    }

    void fetchUsers();
  }, [mounted, router, fetchUsers, currentUser]);

  const openAddModal = useCallback(() => {
    setEditingUser(null);
    setFormInit({ name: "", email: "", role: "user" });
    setShowAddEditModal(true);
  }, []);

  const openEditModal = useCallback((u: User) => {
    setEditingUser(u);
    setFormInit({ name: u.name, email: u.email, role: u.role ?? "user" });
    setShowAddEditModal(true);
  }, []);

  const openDeleteModal = useCallback((u: User) => {
    setDeletingUser(u);
    setShowDeleteModal(true);
  }, []);

  const handleAddEdit = useCallback(
    async (payload: { name: string; email?: string; role?: string; password?: string }) => {
      setSubmitting(true);
      setError(null);
      try {
        if (editingUser) {
          // EDIT: only name (self) or name+role (others) as enforced by form
          const res = await fetch(`${backendBase}/api/users/${editingUser._id}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${localStorage.getItem("token") ?? ""}`,
            },
            body: JSON.stringify({ name: payload.name, role: payload.role }),
          });
          if (!res.ok) {
            const errBody = await res.json().catch(() => null);
            throw new Error(errBody?.message ?? `Failed to update user (status ${res.status})`);
          }
          await fetchUsers({ force: true });
        } else {
          // ADD -> register endpoint
          const res = await fetch(`${backendBase}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: payload.name, email: payload.email, role: payload.role, password: payload.password }),
          });
          if (!res.ok) {
            const errBody = await res.json().catch(() => null);
            throw new Error(errBody?.message ?? `Failed to register user (status ${res.status})`);
          }
          await fetchUsers({ force: true });
        }

        setShowAddEditModal(false);
        setEditingUser(null);
      } catch (err: any) {
        setError(err?.message ?? "Operation failed");
      } finally {
        setSubmitting(false);
      }
    },
    [editingUser, fetchUsers]
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deletingUser) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${backendBase}/api/users/${deletingUser._id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") ?? ""}`,
        },
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.message ?? `Failed to delete user (status ${res.status})`);
      }
      await fetchUsers({ force: true });
      setShowDeleteModal(false);
      setDeletingUser(null);
    } catch (err: any) {
      setError(err?.message ?? "Delete failed");
    } finally {
      setSubmitting(false);
    }
  }, [deletingUser, fetchUsers]);

  // memoized table to avoid re-creating DOM when unrelated state changes
  const usersTable = useMemo(() => {
    return (
      <table className="w-full table-auto text-left text-black">
        <thead>
          <tr>
            <th className="pb-2">Name</th>
            <th className="pb-2">Email</th>
            <th className="pb-2">Role</th>
            <th className="pb-2">Vote Status</th>
            <th className="pb-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u._id} className="border-t text-black">
              <td className="py-3">{u.name}</td>
              <td className="py-3">{u.email}</td>
              <td className="py-3">{u.role ?? "user"}</td>
              <td className="py-3">{u.voteStatus ? "Voted" : "Not Voted"}</td>
              <td className="py-3">
                <div className="flex gap-2">
                  <button onClick={() => openEditModal(u)} className="rounded border px-2 py-1 text-sm text-black hover:bg-gray-50">Edit</button>
                  <button onClick={() => openDeleteModal(u)} className="rounded border px-2 py-1 text-sm text-red-600 hover:bg-red-50">Delete</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users]);

  if (!mounted) return null;

  // guard: if not admin, redirect (also handled in fetchUsers)
  if (currentUser && currentUser.role !== "admin") {
    // intentional redirect; render nothing meanwhile
    router.replace("/");
    return null;
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-black">User Management</h1>
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/home")} className="rounded border px-3 py-1 text-sm text-black hover:bg-gray-100">Back</button>
            <button onClick={openAddModal} className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700">Add User</button>
          </div>
        </header>

        <section className="mb-4">
          <div className="rounded bg-white p-4 shadow">
            {error && <div className="mb-3 rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}

            {loading ? (
              <div>Loading...</div>
            ) : users.length === 0 ? (
              <div className="text-sm text-black">No users yet.</div>
            ) : (
              usersTable
            )}
          </div>
        </section>

        {/* Add/Edit modal */}
        {showAddEditModal && (
          <ModalPortal onClose={() => setShowAddEditModal(false)}>
            <h3 className="text-lg font-semibold text-black mb-3">{editingUser ? "Edit user" : "Add user"}</h3>

            <AddEditForm
              initialName={formInit.name}
              initialEmail={formInit.email}
              initialRole={formInit.role}
              onSubmit={handleAddEdit}
              onCancel={() => setShowAddEditModal(false)}
              submitting={submitting}
              isEdit={Boolean(editingUser)}
              isSelf={Boolean(editingUser && currentUser && editingUser._id === currentUser._id)}
            />
          </ModalPortal>
        )}

        {/* Delete confirmation modal */}
        {showDeleteModal && deletingUser && (
          <ModalPortal onClose={() => setShowDeleteModal(false)}>
            <h3 className="text-lg font-semibold text-black mb-3">Delete user</h3>
            <p className="text-sm text-black">Are you sure you want to delete <strong>{deletingUser.name}</strong> ({deletingUser.email})?</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowDeleteModal(false)} className="rounded border px-3 py-1 text-sm">Cancel</button>
              <button onClick={handleDeleteConfirm} disabled={submitting} className="rounded bg-red-600 px-3 py-1 text-sm text-white">{submitting ? "Deleting..." : "Delete"}</button>
            </div>
          </ModalPortal>
        )}
      </div>
    </main>
  );
}
