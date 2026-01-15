"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  RefreshCw,
  Send,
  Clock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Users,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { cn } from "@/lib/utils/cn";

interface ThreadDigest {
  id: string;
  threadId: string;
  scheduledFor: Date;
  processedAt: Date | null;
  status: "PENDING" | "PROCESSING" | "SENT" | "FAILED";
  summary: string | null;
  emailCount: number;
  thread: {
    id: string;
    name: string;
    slug: string;
    messageCount: number;
  };
}

interface NewsletterDigestAdminProps {
  digests: ThreadDigest[];
  totalSubscribers: number;
}

export function NewsletterDigestAdmin({
  digests,
  totalSubscribers,
}: NewsletterDigestAdminProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  async function handleGenerateDigests() {
    setIsGenerating(true);
    try {
      await axios.post("/api/newsletter/generate");
      toast.success("Newsletter digests generated and sent successfully!");
    } catch (error) {
      console.error("Failed to generate digests:", error);
      toast.error("Failed to generate newsletter digests");
    } finally {
      setIsGenerating(false);
    }
  }

  const pendingDigests = digests.filter((d) => d.status === "PENDING");
  const sentDigests = digests.filter((d) => d.status === "SENT");

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return (
          <Badge
            variant="outline"
            className="text-amber-500 border-amber-500/30 bg-amber-500/10"
          >
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
      case "PROCESSING":
        return (
          <Badge
            variant="outline"
            className="text-blue-500 border-blue-500/30 bg-blue-500/10"
          >
            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
            Processing
          </Badge>
        );
      case "SENT":
        return (
          <Badge
            variant="outline"
            className="text-green-500 border-green-500/30 bg-green-500/10"
          >
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Sent
          </Badge>
        );
      case "FAILED":
        return (
          <Badge
            variant="outline"
            className="text-red-500 border-red-500/30 bg-red-500/10"
          >
            <AlertCircle className="w-3 h-3 mr-1" />
            Failed
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-indigo-500/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-indigo-500 font-medium">
                  Total Subscribers
                </p>
                <p className="text-3xl font-bold text-foreground mt-1">
                  {totalSubscribers}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-indigo-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-linear-to-br from-amber-500/5 to-orange-500/5 border-amber-500/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-amber-500 font-medium">
                  Pending Digests
                </p>
                <p className="text-3xl font-bold text-foreground mt-1">
                  {pendingDigests.length}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Clock className="h-6 w-6 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-linear-to-br from-green-500/5 to-emerald-500/5 border-green-500/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-500 font-medium">
                  Sent This Week
                </p>
                <p className="text-3xl font-bold text-foreground mt-1">
                  {sentDigests.length}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                <Send className="h-6 w-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Generate Button */}
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-linear-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-indigo-500" />
              </div>
              <div>
                <CardTitle className="text-foreground">
                  Generate Newsletter Digests
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Trigger AI-powered digest generation for all pending threads
                </p>
              </div>
            </div>
            <Button
              onClick={handleGenerateDigests}
              disabled={isGenerating || pendingDigests.length === 0}
              className="bg-linear-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Generate & Send
                </>
              )}
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Digest List */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Mail className="h-5 w-5 text-muted-foreground" />
            Recent Digests
          </CardTitle>
        </CardHeader>
        <CardContent>
          {digests.length === 0 ? (
            <div className="text-center py-12">
              <div className="h-16 w-16 mx-auto rounded-full bg-muted flex items-center justify-center mb-4">
                <Calendar className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">No digests scheduled yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Digests will appear here when users subscribe to threads
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {digests.map((digest) => (
                <div
                  key={digest.id}
                  className={cn(
                    "rounded-xl border p-4 transition-colors",
                    digest.status === "SENT"
                      ? "border-green-500/20 bg-green-500/5"
                      : digest.status === "PENDING"
                      ? "border-amber-500/20 bg-amber-500/5"
                      : "border-border bg-muted/50"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-foreground">
                          {digest.thread.name}
                        </h3>
                        {getStatusBadge(digest.status)}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>
                          Scheduled:{" "}
                          {new Date(digest.scheduledFor).toLocaleDateString()}
                        </span>
                        {digest.processedAt && (
                          <span>
                            Sent:{" "}
                            {new Date(digest.processedAt).toLocaleString()}
                          </span>
                        )}
                        {digest.emailCount > 0 && (
                          <span className="text-green-500">
                            {digest.emailCount} emails sent
                          </span>
                        )}
                      </div>
                      {digest.summary && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                          {digest.summary}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
