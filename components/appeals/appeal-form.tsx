'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { submitAppeal } from '@/modules/appeals/actions';
import { toasts } from '@/lib/utils/toast';
export function AppealForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    const result = await submitAppeal(formData);
    setIsSubmitting(false);

    if (result?.error) {
      toasts.error(result.error);
    } else {
      toasts.success('Appeal submitted successfully');
    }
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="space-y-2 text-left">
        <label htmlFor="reason" className="text-sm font-medium">
          Submit an Appeal
        </label>
        <textarea
          name="reason"
          id="reason"
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[100px]"
          placeholder="Explain why you think this decision was a mistake..."
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Submitting...' : 'Submit Appeal'}
      </Button>
    </form>
  );
}
