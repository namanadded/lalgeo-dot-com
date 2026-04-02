import Link from "next/link";
import { redirect } from "next/navigation";
import { clearSession, countAdmins, createUser, getSessionUser, listUsers, updateUserRole, type UserRole } from "@/lib/auth";
import { createCoupon, listCoupons, setCouponActive, type CouponType } from "@/lib/coupons";

async function createCouponAction(formData: FormData) {
  "use server";
  const session = await getSessionUser();
  if (!session || session.role !== "admin") {
    redirect("/login?next=/admin");
  }

  const code = String(formData.get("code") || "");
  const type = String(formData.get("type") || "percent") as CouponType;
  const value = Number(formData.get("value") || 0);
  const maxUsesRaw = String(formData.get("maxUses") || "").trim();
  const maxUses = maxUsesRaw ? Number(maxUsesRaw) : null;

  try {
    createCoupon({
      code,
      type: type === "fixed" || type === "trial" ? type : "percent",
      value: Number.isFinite(value) ? value : 0,
      maxUses: typeof maxUses === "number" && Number.isFinite(maxUses) ? maxUses : null,
    });
  } catch {
    redirect("/admin?error=coupon_create_failed");
  }

  redirect("/admin?saved=1");
}

async function toggleCouponAction(formData: FormData) {
  "use server";
  const session = await getSessionUser();
  if (!session || session.role !== "admin") {
    redirect("/login?next=/admin");
  }

  const id = String(formData.get("id") || "");
  const active = String(formData.get("active") || "") === "1";
  if (id) {
    setCouponActive(id, active);
  }
  redirect("/admin");
}

async function createUserAction(formData: FormData) {
  "use server";
  const session = await getSessionUser();
  if (!session || session.role !== "admin") {
    redirect("/login?next=/admin");
  }

  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "").trim();
  const roleRaw = String(formData.get("role") || "staff").trim();
  const role: UserRole = roleRaw === "admin" ? "admin" : "staff";

  if (!email || password.length < 8) {
    redirect("/admin?error=user_create_invalid");
  }

  try {
    createUser(email, password, role);
  } catch {
    redirect("/admin?error=user_create_failed");
  }

  redirect("/admin?saved=user");
}

async function updateUserRoleAction(formData: FormData) {
  "use server";
  const session = await getSessionUser();
  if (!session || session.role !== "admin") {
    redirect("/login?next=/admin");
  }
  const userId = String(formData.get("userId") || "").trim();
  const roleRaw = String(formData.get("role") || "staff").trim();
  const role: UserRole = roleRaw === "admin" ? "admin" : "staff";
  if (!userId) {
    redirect("/admin?error=user_role_failed");
  }
  try {
    updateUserRole(userId, role);
  } catch {
    redirect("/admin?error=user_role_failed");
  }
  redirect("/admin?saved=role");
}

async function signOutAction() {
  "use server";
  await clearSession();
  redirect("/login");
}

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : "";
  const saved = typeof params.saved === "string" ? params.saved : "";

  const session = await getSessionUser();
  if (!session) {
    redirect("/login?next=/admin");
  }
  if (session.role !== "admin") {
    return (
      <main>
        <div className="container">
          <div className="panel admin-panel">
            <h1>Admin Access Required</h1>
            <p className="muted">This account does not have admin access.</p>
            <form action={signOutAction}>
              <button className="button secondary" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  const coupons = listCoupons();
  const users = listUsers();
  const adminCount = countAdmins();

  return (
    <main>
      <div className="container">
        <div className="header admin-header">
          <div>
            <h1>Admin</h1>
            <div className="muted">Users, roles, and coupon controls</div>
          </div>
          <div className="top-actions">
            <Link href="/dashboard" className="button secondary">
              Back to SaaS
            </Link>
            <form action={signOutAction}>
              <button className="button secondary" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>

        <div className="panel admin-panel">
          <h2>User Access</h2>
          {saved === "user" && <div className="banner">User created.</div>}
          {saved === "role" && <div className="banner">User role updated.</div>}
          {(error === "user_create_invalid" || error === "user_create_failed" || error === "user_role_failed") ? (
            <div className="banner">Unable to save user changes. Check input and try again.</div>
          ) : null}

          <form action={createUserAction} className="grid grid-3">
            <div>
              <label>Email</label>
              <input className="input" name="email" type="email" required />
            </div>
            <div>
              <label>Temporary Password</label>
              <input className="input" name="password" type="password" minLength={8} required />
            </div>
            <div>
              <label>Role</label>
              <select name="role" defaultValue="staff">
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <button className="button" type="submit">
                Create User
              </button>
            </div>
          </form>

          <div className="saas-table-wrap" style={{ marginTop: 16 }}>
            <table className="saas-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.email}</td>
                    <td>{user.role}</td>
                    <td>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(user.createdAt))}</td>
                    <td>
                      <form action={updateUserRoleAction} className="saas-row-actions">
                        <input type="hidden" name="userId" value={user.id} />
                        <select
                          name="role"
                          defaultValue={user.role}
                          disabled={user.id === session.id && user.role === "admin" && adminCount <= 1}
                        >
                          <option value="staff">Staff</option>
                          <option value="admin">Admin</option>
                        </select>
                        <button className="button secondary" type="submit">
                          Save
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel admin-panel">
          <h2>Create Coupon</h2>
          {saved === "1" && <div className="banner">Coupon saved.</div>}
          {error === "coupon_create_failed" && <div className="banner">Failed to save coupon.</div>}

          <form action={createCouponAction} className="grid grid-2">
            <div>
              <label>Code</label>
              <input className="input" name="code" placeholder="WELCOME20" required />
            </div>
            <div>
              <label>Type</label>
              <select name="type" defaultValue="percent">
                <option value="percent">Percent off</option>
                <option value="fixed">Fixed amount off</option>
                <option value="trial">Trial days</option>
              </select>
            </div>
            <div>
              <label>Value</label>
              <input className="input" type="number" name="value" min="0" step="1" defaultValue="20" required />
            </div>
            <div>
              <label>Max Uses (optional)</label>
              <input className="input" type="number" name="maxUses" min="1" step="1" />
            </div>
            <div>
              <button className="button" type="submit">
                Save Coupon
              </button>
            </div>
          </form>
        </div>

        <div className="panel admin-panel">
          <h2>Coupons</h2>
          {coupons.length === 0 ? (
            <div className="muted">No coupons yet.</div>
          ) : (
            <div className="saas-table-wrap">
              <table className="saas-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Type</th>
                    <th>Value</th>
                    <th>Uses</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {coupons.map((coupon) => (
                    <tr key={coupon.id}>
                      <td>{coupon.code}</td>
                      <td>{coupon.type}</td>
                      <td>{coupon.value}</td>
                      <td>
                        {coupon.usedCount}
                        {coupon.maxUses ? ` / ${coupon.maxUses}` : ""}
                      </td>
                      <td>{coupon.active ? "Active" : "Disabled"}</td>
                      <td>
                        <form action={toggleCouponAction}>
                          <input type="hidden" name="id" value={coupon.id} />
                          <input type="hidden" name="active" value={coupon.active ? "0" : "1"} />
                          <button className="button secondary" type="submit">
                            {coupon.active ? "Disable" : "Enable"}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
