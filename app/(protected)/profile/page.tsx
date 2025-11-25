import Image from "next/image";
import { requireSession, isAdmin } from "@/modules/auth/session";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function ProfilePage() {
  const session = await requireSession();
  const user = session.user;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card className="rounded-[32px] border border-slate-100 bg-white p-8 shadow-sm">
        <CardContent className="flex flex-col gap-6 p-0 md:flex-row md:items-center">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl bg-slate-100">
            {user.image ? (
              <Image src={user.image} alt={user.name ?? "Avatar"} width={80} height={80} />
            ) : (
              <span className="text-2xl font-semibold text-slate-500">
                {(user.name || user.email)[0]?.toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm uppercase tracking-widest text-slate-400">Profile</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">
              {user.name || "Unnamed"}
            </h1>
            <p className="text-slate-500">{user.email}</p>
            <p className="mt-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs uppercase tracking-wide text-slate-600">
              {user.role}
            </p>
          </div>
          {isAdmin(user) && (
            <div className="flex flex-col gap-2 text-sm text-slate-500">
              <Button asChild variant="outline" className="rounded-full">
                <a href="/dashboard/admin">Open admin tools</a>
              </Button>
              <Button variant="ghost" className="text-red-500 hover:text-red-600">
                Delete sensitive data
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[32px] border border-slate-100 bg-white p-6 shadow-sm">
        <CardContent className="space-y-4 p-0">
          <h2 className="text-lg font-semibold text-slate-900">Minimal settings</h2>
          <p className="text-sm text-slate-500">
            Profile edits are temporarily locked. To request changes, contact an administrator.
          </p>
          <div className="rounded-3xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
            Coming soon: theme preferences, digest cadence, and notification routing.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

