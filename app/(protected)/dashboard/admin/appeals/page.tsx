import { assertAdmin } from "@/modules/auth/session";
import { useSession } from "@/lib/session-context";
import { getAppeals } from "@/modules/appeals/actions";
import { AppealsList } from "@/components/admin/appeals-list";

export default async function AppealsPage() {
  const session = useSession();
  if (!session) return null;
  assertAdmin(session.user);

  const appealsResult = await getAppeals();
  const appeals = appealsResult.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Appeals</h1>
        <p className="text-muted-foreground">
          Review and resolve ban appeals from users.
        </p>
      </div>

      <AppealsList appeals={appeals} />
    </div>
  );
}
