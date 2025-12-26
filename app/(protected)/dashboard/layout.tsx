import { Sidebar } from "@/components/dashboard/sidebar";
import { requireSession } from "@/modules/auth/session";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();

  return (
    <div className="flex h-screen bg-[#0F0F10] p-4 gap-4 overflow-hidden">
      <aside className="h-full shrink-0">
        <Sidebar
          name={session.user.name || session.user.email || "User"}
          email={session.user.email || "User"}
          role={session.user.role}
        />
      </aside>

      <div className="flex flex-1 flex-col bg-[#161618] rounded-2xl border border-zinc-800/50 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-8 text-white">
          {children}
        </main>
      </div>
    </div>
  );
}
