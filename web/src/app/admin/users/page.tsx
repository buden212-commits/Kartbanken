import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { hashPassword } from "@/lib/auth/password";
import { canAdmin, roleLabel } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { Role, type Role as RoleType } from "@/lib/roles";
import { redirect } from "next/navigation";

async function requireAdmin() {
  const session = await auth();
  if (!session || !canAdmin(session.user.role)) {
    redirect("/");
  }
  return session;
}

async function createUser(formData: FormData) {
  "use server";
  const session = await requireAdmin();

  const name = formData.get("name")?.toString().trim() || null;
  const email = formData.get("email")?.toString().trim().toLowerCase();
  const password = formData.get("password")?.toString();
  const role = formData.get("role")?.toString() as RoleType;

  if (!email || !password) {
    return;
  }

  if (role !== Role.READER && role !== Role.EDITOR && role !== Role.ADMIN) {
    return;
  }

  if (password.length < 8) {
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return;
  }

  const passwordHash = await hashPassword(password);

  await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role,
      approvedAt: new Date(),
      approvedById: session.user.id,
    },
  });

  revalidatePath("/admin/users");
}

export default async function AdminUsersPage() {
  await requireAdmin();

  const users = await prisma.user.findMany({
    orderBy: [{ createdAt: "desc" }],
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <p className="page-eyebrow">Administration</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Användarhantering</h1>
      <p className="mt-2 text-sm text-slate-600">
        Skapa konton manuellt och dela e-post + lösenord med användaren.
      </p>

      <section className="card mt-8">
        <h2 className="text-lg font-medium text-slate-900">Skapa nytt konto</h2>
        <form action={createUser} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="form-label">
              Namn
            </label>
            <input id="name" name="name" type="text" className="form-input" />
          </div>
          <div>
            <label htmlFor="email" className="form-label">
              E-post *
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="form-input"
            />
          </div>
          <div>
            <label htmlFor="password" className="form-label">
              Lösenord * (min 8 tecken)
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              className="form-input"
            />
          </div>
          <div>
            <label htmlFor="role" className="form-label">
              Roll *
            </label>
            <select id="role" name="role" required defaultValue={Role.READER} className="form-select">
              <option value={Role.READER}>Läsare — kan ladda ner</option>
              <option value={Role.EDITOR}>Redaktör — kan ladda upp</option>
              <option value={Role.ADMIN}>Administratör</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary">
              Skapa konto
            </button>
          </div>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium text-slate-900">Alla användare ({users.length})</h2>
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                <th className="px-4 pb-2 pt-3 pr-4 font-medium">Namn</th>
                <th className="pb-2 pt-3 pr-4 font-medium">E-post</th>
                <th className="pb-2 pt-3 pr-4 font-medium">Roll</th>
                <th className="px-4 pb-2 pt-3 font-medium">Skapad</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 pr-4">{user.name ?? "—"}</td>
                  <td className="py-2 pr-4">{user.email}</td>
                  <td className="py-2 pr-4">
                    <span className="font-mono text-xs">{user.role}</span>
                    <span className="ml-2 text-slate-500">
                      ({roleLabel(user.role as RoleType)})
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-500">
                    {user.createdAt.toLocaleDateString("sv-SE")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
