"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  Ban,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type ModerationActionType =
  | "DISMISS"
  | "REMOVE_MESSAGE"
  | "WARN_USER"
  | "SUSPEND_USER"
  | "BAN_USER";

interface ActionConfig {
  key: ModerationActionType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  variant: "default" | "destructive" | "outline";
  requiresNote: boolean;
  showDuration?: boolean;
  userNotification: string;
}

const actionConfigs: Record<ModerationActionType, ActionConfig> = {
  DISMISS: {
    key: "DISMISS",
    label: "Dismiss Report",
    description:
      "Mark this report as invalid or false positive. No action will be taken against the user.",
    icon: CheckCircle,
    variant: "outline",
    requiresNote: false,
    userNotification:
      "The reporter will be notified that the report was reviewed and no violation was found.",
  },
  REMOVE_MESSAGE: {
    key: "REMOVE_MESSAGE",
    label: "Remove Message",
    description:
      "Hide this message from the thread. The user will not receive any warning or penalty.",
    icon: XCircle,
    variant: "outline",
    requiresNote: true,
    userNotification:
      "The message author will be notified that their message was removed.",
  },
  WARN_USER: {
    key: "WARN_USER",
    label: "Warn User",
    description:
      "Remove the message and issue an official warning to the user. This will be added to their violation history.",
    icon: AlertCircle,
    variant: "outline",
    requiresNote: true,
    userNotification:
      "The user will receive a warning notification with your message.",
  },
  SUSPEND_USER: {
    key: "SUSPEND_USER",
    label: "Suspend User",
    description:
      "Temporarily suspend the user from posting. Choose the duration below.",
    icon: Clock,
    variant: "outline",
    requiresNote: true,
    showDuration: true,
    userNotification:
      "The user will be suspended and notified of the duration and reason.",
  },
  BAN_USER: {
    key: "BAN_USER",
    label: "Permanently Ban User",
    description:
      "Permanently ban this user from the platform. This action should be reserved for serious violations.",
    icon: Ban,
    variant: "destructive",
    requiresNote: true,
    userNotification:
      "The user will be permanently banned and notified. They will be able to appeal this decision.",
  },
};

const suspensionDurations = [
  { value: "1h", label: "1 hour" },
  { value: "6h", label: "6 hours" },
  { value: "24h", label: "24 hours" },
  { value: "3d", label: "3 days" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];

interface ActionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: ModerationActionType;
  reportId: string;
  messagePreview?: string;
  userName?: string;
  onConfirm: (data: {
    action: ModerationActionType;
    note: string;
    notifyReporter: boolean;
    duration?: string;
  }) => Promise<void>;
}

export function ActionModal({
  open,
  onOpenChange,
  action,
  reportId,
  messagePreview,
  userName,
  onConfirm,
}: ActionModalProps) {
  const [note, setNote] = useState("");
  const [notifyReporter, setNotifyReporter] = useState(true);
  const [duration, setDuration] = useState("24h");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const config = actionConfigs[action];
  const Icon = config.icon;

  const handleSubmit = async () => {
    if (config.requiresNote && note.trim().length < 10) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm({
        action,
        note: note.trim(),
        notifyReporter,
        duration: config.showDuration ? duration : undefined,
      });
      onOpenChange(false);
      // Reset form
      setNote("");
      setNotifyReporter(true);
      setDuration("24h");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-foreground sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Icon
              className={cn(
                "w-5 h-5",
                config.variant === "destructive"
                  ? "text-destructive"
                  : "text-foreground"
              )}
            />
            {config.label}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {config.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Warning for destructive actions */}
          {config.variant === "destructive" && (
            <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/30 rounded-lg p-3">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-destructive">
                  This action is irreversible
                </p>
                <p className="text-muted-foreground mt-1">
                  Please ensure you have reviewed the full context before
                  proceeding.
                </p>
              </div>
            </div>
          )}

          {/* Target Preview */}
          <div className="bg-muted rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Target User</span>
              <Badge variant="outline" className="text-xs">
                Report #{reportId.slice(-6).toUpperCase()}
              </Badge>
            </div>
            <p className="text-sm font-medium text-foreground">
              {userName || "Unknown User"}
            </p>
            {messagePreview && (
              <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                &ldquo;{messagePreview}&rdquo;
              </p>
            )}
          </div>

          {/* Duration selector for suspensions */}
          {config.showDuration && (
            <div className="space-y-2">
              <Label htmlFor="duration">Suspension Duration</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger className="bg-muted border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {suspensionDurations.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Internal note */}
          <div className="space-y-2">
            <Label htmlFor="note" className="flex items-center justify-between">
              <span>
                Moderator Note{" "}
                {config.requiresNote && (
                  <span className="text-destructive">*</span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                {note.length}/500
              </span>
            </Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                config.requiresNote
                  ? "Explain the reason for this action (required)..."
                  : "Optional notes for internal reference..."
              }
              className="min-h-[100px] bg-muted border-border resize-none"
              maxLength={500}
            />
            {config.requiresNote && note.length < 10 && note.length > 0 && (
              <p className="text-xs text-destructive">
                Please provide at least 10 characters
              </p>
            )}
          </div>

          {/* User notification info */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
            <p className="text-xs text-blue-400">
              <strong>What the user will see:</strong> {config.userNotification}
            </p>
          </div>

          {/* Notify reporter option */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="notify-reporter"
              checked={notifyReporter}
              onCheckedChange={(checked: boolean | "indeterminate") =>
                setNotifyReporter(checked === true)
              }
            />
            <Label
              htmlFor="notify-reporter"
              className="text-sm text-muted-foreground cursor-pointer"
            >
              Notify the reporter about this action
            </Label>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={
              config.variant === "destructive" ? "destructive" : "default"
            }
            onClick={handleSubmit}
            disabled={
              isSubmitting || (config.requiresNote && note.trim().length < 10)
            }
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Icon className="w-4 h-4 mr-2" />
                Confirm {config.label}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
