"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, X } from "lucide-react";
import { unsubscribeFromThread } from "@/modules/newsletter/actions";
import { toast } from "sonner";
import { useState, useTransition } from "react";
import Link from "next/link";

interface NewsletterSubscription {
  id: string;
  threadId: string;
  thread: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
  };
  createdAt: Date;
}

interface NewsletterManagementProps {
  subscriptions: NewsletterSubscription[];
}

export function NewsletterManagement({
  subscriptions,
}: NewsletterManagementProps) {
  const [pendingSubscriptions, setPendingSubscriptions] = useState<Set<string>>(
    new Set()
  );
  const [isPending, startTransition] = useTransition();

  async function handleUnsubscribe(threadId: string) {
    setPendingSubscriptions((prev) => new Set(prev).add(threadId));

    startTransition(async () => {
      const result = await unsubscribeFromThread(threadId);
      setPendingSubscriptions((prev) => {
        const next = new Set(prev);
        next.delete(threadId);
        return next;
      });

      if (result && "error" in result && result.error) {
        toast.error(result.error);
      } else if (result && "success" in result && result.success) {
        toast.success("Unsubscribed successfully!");
      }
    });
  }

  if (subscriptions.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
            <Mail className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            No Newsletter Subscriptions
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            You haven&apos;t subscribed to any thread newsletters yet. Subscribe
            to threads to receive daily digests.
          </p>
          <Link href="/dashboard/threads">
            <Button className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white">
              Browse Threads
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500">
          <Mail className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">
            Newsletter Subscriptions
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage your thread newsletter subscriptions.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {subscriptions.map((subscription) => {
          const isPending = pendingSubscriptions.has(subscription.threadId);
          return (
            <Card key={subscription.id} className="border-border bg-muted/50">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-foreground">
                        {subscription.thread.name}
                      </h3>
                    </div>
                    {subscription.thread.description && (
                      <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                        {subscription.thread.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>
                        Subscribed{" "}
                        {new Date(subscription.createdAt).toLocaleDateString()}
                      </span>
                      <Link
                        href={`/dashboard/threads/thread/${subscription.thread.slug}`}
                        className="text-indigo-500 hover:text-indigo-600 underline"
                      >
                        View Thread
                      </Link>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleUnsubscribe(subscription.threadId)}
                    disabled={isPending}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/10 border-red-200 dark:border-red-900/50"
                  >
                    {isPending ? (
                      "Unsubscribing..."
                    ) : (
                      <>
                        <X className="h-4 w-4 mr-1" />
                        Unsubscribe
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
