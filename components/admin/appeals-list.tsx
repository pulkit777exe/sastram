'use client';

import { useState } from 'react';
import TimeAgo from '@/components/ui/TimeAgo';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { resolveAppeal } from '@/modules/appeals/actions';
import { toasts } from '@/lib/utils/toast';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface JuryVote {
  id: string;
  vote: string | null;
  reason: string | null;
  moderator: { id: string; name: string | null; email: string; image: string | null };
}

interface Appeal {
  id: string;
  reporter: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  } | null;
  reason: string;
  details?: string | null;
  status: string;
  createdAt: Date;
  banReason: string;
  banDate: Date;
  jury?: {
    votes: JuryVote[];
    approvedCount: number;
    rejectedCount: number;
    totalJurors: number;
    majority: number;
  };
}

export function AppealsList({ appeals }: { appeals: Appeal[] }) {
  const [selectedAppeal, setSelectedAppeal] = useState<Appeal | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionType, setActionType] = useState<'APPROVE' | 'REJECT' | null>(null);

  const handleResolve = async () => {
    if (!selectedAppeal || !actionType) return;

    setIsProcessing(true);
    const approved = actionType === 'APPROVE';

    const result = await resolveAppeal({ appealId: selectedAppeal.id, approved });

    if (result?.error) {
      toasts.error(result.error);
    } else {
      const data = result?.data as unknown as { resolved?: boolean; approved?: boolean; approvedCount?: number; rejectedCount?: number } | null;
      if (data && typeof data.resolved === 'boolean') {
        if (!data.resolved) {
          toasts.success(`Vote recorded — awaiting jury (${data.approvedCount ?? 0} approve / ${data.rejectedCount ?? 0} reject)`);
        } else {
          const finalApproved = data.approved ?? approved;
          toasts.success(`Jury decided: appeal ${finalApproved ? 'approved' : 'rejected'} (${data.approvedCount}-${data.rejectedCount})`);
        }
      } else {
        toasts.success(`Appeal ${approved ? 'approved' : 'rejected'} successfully`);
      }
      setSelectedAppeal(null);
      setActionType(null);
    }
    setIsProcessing(false);
  };

  if (appeals.length === 0) {
    return (
      <div className="text-center py-12 border border-line dashed rounded-card">
        <p className="text-muted-foreground">No pending appeals</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-control border border-line overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>User</TableHead>
              <TableHead>Ban Date</TableHead>
              <TableHead>Ban Reason</TableHead>
              <TableHead>Appeal Reason</TableHead>
              <TableHead>Jury</TableHead>
              <TableHead className="sticky right-0 bg-muted/50 z-10 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {appeals.map((appeal) => (
              <TableRow key={appeal.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={appeal.reporter?.image || undefined} />
                      <AvatarFallback>{appeal.reporter?.name?.charAt(0) || 'U'}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-sm">{appeal.reporter?.name}</p>
                      <p className="text-xs text-muted-foreground">{appeal.reporter?.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  <TimeAgo date={appeal.banDate} />
                </TableCell>
                <TableCell className="max-w-50 truncate text-sm" title={appeal.banReason}>
                  {appeal.banReason}
                </TableCell>
                <TableCell
                  className="max-w-75 truncate text-sm italic text-muted-foreground"
                  title={appeal.reason}
                >
                  &quot;{appeal.reason || 'No appeal reason provided'}&quot;
                </TableCell>
                <TableCell className="text-xs">
                  {appeal.jury ? (
                    <div className="flex flex-col gap-1 min-w-24">
                      <span className="font-mono text-xs">
                        {appeal.jury.approvedCount}✓ / {appeal.jury.rejectedCount}✗ / {appeal.jury.totalJurors - appeal.jury.approvedCount - appeal.jury.rejectedCount}…
                      </span>
                      <span className="text-muted-foreground text-[10px] leading-none">
                        {appeal.jury.totalJurors === 0 ? 'Legacy (no jury)' : `${appeal.jury.totalJurors} jurors · 2/3 to decide`}
                      </span>
                      {appeal.jury.votes.length > 0 && (
                        <div className="flex -space-x-1 mt-1">
                          {appeal.jury.votes.map((v) => (
                            <span
                              key={v.id}
                              title={`${v.moderator.name ?? v.moderator.email}: ${v.vote ?? 'PENDING'}`}
                              className={`h-5 w-5 rounded-full border border-line flex items-center justify-center text-[9px] font-bold ${
                                v.vote === 'APPROVED' ? 'bg-green-100 text-green-700' : v.vote === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {v.vote === 'APPROVED' ? '✓' : v.vote === 'REJECTED' ? '✗' : '·'}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="sticky right-0 bg-surface z-10 text-right">
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" size="icon-sm"
                      onClick={() => {
                        setSelectedAppeal(appeal);
                        setActionType('REJECT');
                      }}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm"
                      onClick={() => {
                        setSelectedAppeal(appeal);
                        setActionType('APPROVE');
                      }}
                      className="text-green-600 hover:text-green-700 hover:bg-green/10"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </div>

      <Dialog open={!!selectedAppeal} onOpenChange={(open) => !open && setSelectedAppeal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'APPROVE' ? 'Approve Appeal & Unban User' : 'Reject Appeal'}
            </DialogTitle>
            <DialogDescription>
              {actionType === 'APPROVE'
                ? 'This will immediately unban the user and restore their access.'
                : 'The user will remain banned. They cannot submit another appeal for this ban.'}
            </DialogDescription>
          </DialogHeader>

          {selectedAppeal && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-[100px_1fr] gap-2 text-sm">
                <span className="text-muted-foreground">User:</span>
                <span className="font-medium">{selectedAppeal.reporter?.name}</span>

                <span className="text-muted-foreground">Ban Reason:</span>
                <span>{selectedAppeal.banReason}</span>

                <span className="text-muted-foreground">Appeal:</span>
                <div className="p-3 bg-muted rounded-control text-xs italic">
                  &quot;{selectedAppeal.reason || 'No appeal reason provided'}&quot;
                </div>

                {selectedAppeal.jury && (
                  <>
                    <span className="text-muted-foreground">Jury:</span>
                    <div className="space-y-2">
                      <p className="text-xs font-mono">
                        {selectedAppeal.jury.approvedCount} approve · {selectedAppeal.jury.rejectedCount} reject · {selectedAppeal.jury.totalJurors - selectedAppeal.jury.approvedCount - selectedAppeal.jury.rejectedCount} pending — 2/3 majority decides
                      </p>
                      <div className="space-y-1">
                        {selectedAppeal.jury.votes.map((v) => (
                          <div key={v.id} className="flex items-center gap-2 text-xs">
                            <Avatar className="h-5 w-5">
                              <AvatarImage src={v.moderator.image || undefined} />
                              <AvatarFallback className="text-[9px]">{v.moderator.name?.charAt(0) || 'M'}</AvatarFallback>
                            </Avatar>
                            <span className="flex-1 truncate">{v.moderator.name ?? v.moderator.email}</span>
                            <span className={`px-1.5 py-0.5 rounded-chip text-[10px] font-bold ${v.vote === 'APPROVED' ? 'bg-green-100 text-green-700' : v.vote === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-muted text-muted-foreground'}`}>
                              {v.vote ?? 'PENDING'}
                            </span>
                          </div>
                        ))}
                        {selectedAppeal.jury.totalJurors === 0 && (
                          <p className="text-xs text-muted-foreground">Legacy appeal — single moderator can decide.</p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSelectedAppeal(null)}>
              Cancel
            </Button>
            <Button type="button"
              onClick={handleResolve}
              disabled={isProcessing}
            >
              {isProcessing
                ? 'Processing...'
                : actionType === 'APPROVE'
                  ? 'Approve Appeal'
                  : 'Reject Appeal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
