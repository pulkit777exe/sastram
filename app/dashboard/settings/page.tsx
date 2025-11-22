import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { SettingsForm } from "@/components/dashboard/settings-form";

export default async function SettingsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return <div>Please log in to view settings.</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500">
          Manage your account settings and preferences.
        </p>
      </div>

      <SettingsForm user={session.user} />
    </div>
  );
}
