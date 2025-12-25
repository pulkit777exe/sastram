import Image from "next/image";
import Link from "next/link";
import { requireSession, isAdmin } from "@/modules/auth/session";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Settings } from "lucide-react";

export default async function ProfilePage() {
  const session = await requireSession();
  const user = session.user;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4 mb-4">
        <Link href="/dashboard/settings">
          <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white">
            <ArrowLeft size={16} className="mr-2" />
            Back to Settings
          </Button>
        </Link>
      </div>

      <Card className="rounded-2xl border border-zinc-800 bg-[#1C1C1E] p-8 shadow-sm">
        <CardContent className="flex flex-col gap-6 p-0 md:flex-row md:items-center">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl bg-zinc-800">
            {user.image ? (
              <Image src={user.image} alt={user.name ?? "Avatar"} width={80} height={80} />
            ) : (
              <span className="text-2xl font-semibold text-zinc-400">
                {(user.name || user.email)[0]?.toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm uppercase tracking-widest text-zinc-500">Profile</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">
              {user.name || "Unnamed"}
            </h1>
            <p className="text-zinc-400">{user.email}</p>
            <p className="mt-2 inline-flex rounded-full bg-indigo-500/10 text-indigo-400 px-3 py-1 text-xs uppercase tracking-wide border border-indigo-500/20">
              {user.role}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Link href="/dashboard/settings">
              <Button variant="outline" className="rounded-lg border-zinc-700 text-zinc-300 hover:bg-zinc-800">
                <Settings size={14} className="mr-2" />
                Edit Settings
              </Button>
            </Link>
            {isAdmin(user) && (
              <Button asChild variant="outline" className="rounded-lg border-zinc-700 text-zinc-300 hover:bg-zinc-800">
                <a href="/dashboard/admin">Admin Tools</a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-zinc-800 bg-[#1C1C1E] p-6 shadow-sm">
        <CardContent className="space-y-4 p-0">
          <h2 className="text-lg font-semibold text-white">Account Information</h2>
          <p className="text-sm text-zinc-400">
            Manage your profile settings, newsletter subscriptions, and preferences from the Settings page.
          </p>
          <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-500">
            <Link href="/dashboard/settings" className="text-indigo-400 hover:text-indigo-300 underline">
              Go to Settings
            </Link>
            {" "}to update your profile, manage newsletters, and configure notifications.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

