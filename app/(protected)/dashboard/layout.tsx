import { Sidebar } from "@/components/dashboard/sidebar";
import { useSession } from "@/lib/session-context";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = useSession();
  if (!session) return null;

  return (
    <div className="flex h-screen bg-background p-4 gap-4 overflow-hidden">
      <aside className="h-full shrink-0">
        <Sidebar
          name={session.user.name || session.user.email || "User"}
          email={session.user.email || "User"}
          role={session.user.role}
        />
      </aside>

      <div className="flex flex-1 flex-col bg-card rounded-2xl border border-border overflow-hidden">
        <main className="flex-1 overflow-y-auto p-8 text-foreground">
          {children}
        </main>
      </div>
    </div>
  );
}
