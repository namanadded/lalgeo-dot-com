import Link from "next/link";
import { redirect } from "next/navigation";
import { clearSession, createUser, getSessionUser, listUsers, setSession } from "@/lib/auth";
import { createCoupon, listCoupons, setCouponActive, type CouponType } from "@/lib/coupons";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "naman.malhotra@hotmail.com").toLowerCase();

function adminExists() {
  return listUsers().some((user) => user.email.toLowerCase() === ADMIN_EMAIL);
}

async function createAdminAction(formData: FormData) {
  "use server";
  if (adminExists()) {
    redirect("/login?next=/admin");
  }

  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  if (password.length < 8) {
    redirect("/admin?error=weak_password");
  }
  if (password !== confirmPassword) {
    redirect("/admin?error=password_mismatch");
  }

  const user = createUser(ADMIN_EMAIL, password);
  await setSession(user);
  redirect("/admin?created=1");
}

async function createCouponAction(formData: FormData) {
  "use server";
  const session = await getSessionUser();
  if (!session || session.email.toLowerCase() !== ADMIN_EMAIL) {
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
  if (!session || session.email.toLowerCase() !== ADMIN_EMAIL) {
    redirect("/login?next=/admin");
  }

  const id = String(formData.get("id") || "");
  const active = String(formData.get("active") || "") === "1";
  if (id) {
    setCouponActive(id, active);
  }
  redirect("/admin");
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
  const created = params.created === "1";
  const saved = params.saved === "1";

  const session = await getSessionUser();
  const hasAdmin = adminExists();

  const isAdminSession = Boolean(session && session.email.toLowerCase() === ADMIN_EMAIL);

  if (!isAdminSession && !hasAdmin) {
    return (
      <main>
        <div className="container">
          <div className="panel admin-panel">
            <h1>Admin Setup</h1>
            <p className="muted">Create first admin password.</p>
            {error === "weak_password" && (
              <div className="banner">Password must be at least 8 characters.</div>
            )}
            {error === "password_mismatch" && <div className="banner">Passwords do not match.</div>}
            <form action={createAdminAction} className="grid">
              <div>
                <label>Password</label>
                <input className="input" type="password" name="password" minLength={8} required />
              </div>
              <div>
                <label>Confirm Password</label>
                <input className="input" type="password" name="confirmPassword" minLength={8} required />
              </div>
              <button className="button" type="submit">
                Create Admin Account
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  if (!session) {
    redirect("/login?next=/admin");
  }

  if (!isAdminSession) {
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

  return (
    <main>
      <div className="container">
        <div className="header admin-header">
          <div>
            <h1>Admin</h1>
            <div className="muted">Coupon and account controls</div>
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
          <h2>Create Coupon</h2>
          {created && <div className="banner">Admin account created successfully.</div>}
          {saved && <div className="banner">Coupon saved.</div>}
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
