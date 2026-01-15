import { requireSession, SessionUser } from "@/modules/auth/session";
import { prisma } from "@/lib/infrastructure/prisma";
import { format } from "date-fns";
import { redirect } from "next/navigation";
import { AppealForm } from "@/components/appeals/appeal-form";

export default async function BannedPage() {
  const session = await requireSession(false); // Don't redirect if banned

  // Use a type guard or direct check. If status is missing from type, we assume runtime object has it.
  // Casting to any to silence TS error temporarily if type update failed.
  // Ideally type update should have worked but we are defensive here.
  const status = (session.user as SessionUser).status;

  if (status !== "BANNED" && status !== "SUSPENDED") {
    redirect("/dashboard");
  }

  const ban = await prisma.userBan.findFirst({
    where: { userId: session.user.id, isActive: true },
    orderBy: { createdAt: "desc" },
    include: { issuer: { select: { name: true } } },
  });

  const existingAppeal = await prisma.appeal.findFirst({
    where: { userId: session.user.id, status: "PENDING" },
    orderBy: { createdAt: "desc" },
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
              <span>{format(ban.createdAt, "PPP")}</span>
            </div>
            {ban.expiresAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expires:</span>
                <span>{format(ban.expiresAt, "PPP")}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Issued By:</span>
              <span>{ban.issuer.name || "System"}</span>
            </div>
          </div>
        )}

        {existingAppeal ? (
          <div className="bg-blue-500/10 border border-blue-500/20 text-blue-500 p-4 rounded-lg text-sm">
            <p className="font-medium flex items-center justify-center gap-2">
              <span className="animate-pulse">●</span> Appeal Under Review
            </p>
            <p className="mt-1 opacity-80">
              Our team is reviewing your appeal. You will be notified via email
              once a decision is made.
            </p>
          </div>
        ) : (
          <AppealForm />
        )}

        <div className="text-xs text-muted-foreground pt-4 border-t border-border">
          If you believe this is a technical error, contact support@sastram.com
        </div>
      </div>
    </div>
  );
}
