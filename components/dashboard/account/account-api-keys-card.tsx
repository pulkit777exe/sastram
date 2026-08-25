'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiKeysModal } from '@/components/ai-search/ApiKeysModal';

export function AccountApiKeysCard() {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI provider API keys</CardTitle>
        <CardDescription>
          Add your own Exa, Tavily, and Gemini keys to power Sai search. Keys are stored only in
          your browser.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" onClick={() => setOpen(true)}>
          <KeyRound className="mr-2 h-4 w-4" />
          Manage API keys
        </Button>
        <ApiKeysModal isOpen={open} onClose={() => setOpen(false)} onKeysChange={() => {}} />
      </CardContent>
    </Card>
  );
}
