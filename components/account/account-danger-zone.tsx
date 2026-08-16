'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requestAccountDeletion, exportUserData } from '@/modules/users/actions';

export function AccountDangerZone() {
  const router = useRouter();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const result = await exportUserData();
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      const blob = new Blob([JSON.stringify(result?.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sastram-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Data exported successfully');
    } catch {
      toast.error('Failed to export data');
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    if (!password.trim()) {
      toast.error('Password is required');
      return;
    }
    setDeleting(true);
    try {
      const result = await requestAccountDeletion({ password });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Account deleted. You will be redirected.');
      setShowDeleteDialog(false);
      router.push('/');
    } catch {
      toast.error('Failed to delete account');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Export Your Data</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Download a copy of all your data including messages, threads, and activity.
        </p>
        <Button variant="outline" className="mt-4" onClick={handleExport} disabled={exporting}>
          <Download className="mr-2 h-4 w-4" />
          {exporting ? 'Exporting...' : 'Export Data'}
        </Button>
      </div>

      <div className="border-t pt-6">
        <h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Permanently delete your account and all associated data. This action cannot be undone.
          Your data will be purged after 30 days.
        </p>
        <Button variant="destructive" className="mt-4" onClick={() => setShowDeleteDialog(true)}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Account
        </Button>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will soft-delete your account. You will be logged out immediately. Your data
              will be anonymized and permanently purged after 30 days. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-password">Enter your password to confirm</Label>
            <Input
              id="delete-password"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleDelete()}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting || !password.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting...' : 'Delete Account'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
