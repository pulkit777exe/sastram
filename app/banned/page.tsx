import { getSession } from "@/modules/auth/session";
import { prisma } from "@/lib/infrastructure/prisma";
import { redirect } from "next/navigation";
import TimeAgo from "@/components/ui/TimeAgo";

export default async function BannedPage() {
  const session = await getSession();
  if (!session) return null;
  const status = session.user.status;

  if (status !== "BANNED" && status !== "SUSPENDED") {
    redirect("/dashboard");
  }

  const ban = await prisma.userBan.findFirst({
    where: { userId: session.user.id, isActive: true },
    orderBy: { createdAt: "desc" },
    include: { issuer: { select: { name: true } } },
  });

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-card border border-border rounded-xl p-8 shadow-2xl space-y-6 text-center">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto text-red-500 text-3xl">
          Restricted
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">
            {status === "BANNED" ? "Account Banned" : "Account Suspended"}
          </h1>
          <p className="text-muted-foreground">
            Your account has been{" "}
            {status === "BANNED" ? "permanently banned" : "suspended"} from
            Sastram.
          </p>
        </div>

        {ban && (
          <div className="bg-muted/50 p-4 rounded-lg text-left space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Reason:</span>
              <span className="font-medium">{ban.reason}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date:</span>
              <TimeAgo date={ban.createdAt} />
            </div>
            {ban.expiresAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expires:</span>
                <TimeAgo date={ban.expiresAt} />
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Issued By:</span>
              <span>{ban.issuer.name || "System"}</span>
            </div>
          </div>
        )}

        <div className="text-xs text-muted-foreground pt-4 border-t border-border">
          If you believe this is a technical error, contact support@sastram.com
        </div>
      </div>
    </div>
  );
}
