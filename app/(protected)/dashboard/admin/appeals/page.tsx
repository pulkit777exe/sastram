import { assertAdmin } from "@/modules/auth/session";
import { getSession } from "@/modules/auth/session";
import { getAppeals } from "@/modules/appeals/actions";
import { AppealsList } from "@/components/admin/appeals-list";

export default async function AppealsPage() {
  const session = await getSession();
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
