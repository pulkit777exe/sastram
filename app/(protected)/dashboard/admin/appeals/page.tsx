import { requireSession, assertAdmin } from "@/modules/auth/session";
import { getAppeals, resolveAppeal } from "@/modules/appeals/actions";
import { AppealsList } from "@/components/admin/appeals-list";

export default async function AppealsPage() {
  const session = await requireSession();
  assertAdmin(session.user);

  const appeals = await getAppeals();

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
