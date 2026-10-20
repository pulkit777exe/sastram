'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ApiKeysModal,
  hasAllApiKeys,
  isValidApiKey,
  type ApiKeyIssueDetails,
} from '@/components/ai-search/ApiKeysModal';
import { SaiSearchLayout } from '@/components/ai-search/sai-search-layout';
import { SearchProvider, useSearch } from '@/components/ai-search/search-provider';
import { SearchComposer } from '@/components/ai-search/search-composer';

type KeyDialogState = ApiKeyIssueDetails;

interface SearchPageProps {
  user?: { name?: string | null; email?: string | null; image?: string | null } | null;
}

// Inner — accesses lifted state via context (state-lift-state, state-decouple-implementation)
function SearchPageInner({ initialQuery }: { initialQuery: string }) {
  const {
    state: { appState, isChatActive, currentSessionId },
    actions: { selectSession, newSearch },
  } = useSearch();
  const [keyDialog, setKeyDialog] = useState<KeyDialogState | null>(null);
  const [hasKeys, setHasKeys] = useState(false);

  useEffect(() => {
    setHasKeys(hasAllApiKeys());
    const handler = (event: Event) => {
      setKeyDialog((event as CustomEvent<KeyDialogState>).detail ?? {});
    };
    window.addEventListener('sastram:open-api-keys', handler);
    return () => window.removeEventListener('sastram:open-api-keys', handler);
  }, []);

  function handleKeysChange(keys: Record<string, string>) {
    const allPresent = ['exa', 'tavily', 'gemini'].every((provider) => Boolean(keys[provider]?.trim()));
    setHasKeys(allPresent);

    // A key error opened this dialog: resume the pending query as soon as the
    // providers that were missing/invalid now have values. Server env keys can
    // cover the rest, so we don't require all three browser keys here.
    if (!keyDialog?.message) return;
    const required = [...(keyDialog.missingKeys ?? []), ...(keyDialog.invalidKeys ?? [])];
    const ready = required.length > 0
      ? required.every((key) => isValidApiKey(key.provider, keys[key.provider] ?? ''))
      : allPresent;
    if (!ready) return;

    setKeyDialog(null);
    window.dispatchEvent(new Event('sastram:api-keys-saved'));
  }

  // Explicit variants — patterns-explicit-variants (no isChatActive prop to Composer)
  const content = !isChatActive && appState === 'idle'
    ? <SearchComposer.IdleVariant initialQuery={initialQuery} />
    : <SearchComposer.ActiveVariant />;

  return (
    <SaiSearchLayout
      onSelectSession={selectSession}
      onNewSearch={() => newSearch('')}
      currentSessionId={currentSessionId}
      hasApiKeys={hasKeys}
      onOpenApiKeys={() => setKeyDialog({})}
    >
      <SearchComposer.Frame>
        {content}
      </SearchComposer.Frame>

      <ApiKeysModal
        isOpen={keyDialog !== null}
        onClose={() => setKeyDialog(null)}
        onKeysChange={handleKeysChange}
        issue={keyDialog}
      />
    </SaiSearchLayout>
  );
}

export function SearchPage({ user }: SearchPageProps) {
  void user;
  const searchParams = useSearchParams();
  const rawQuery = searchParams.get('q');
  let initialQuery: string;
  if (rawQuery !== null) {
    initialQuery = rawQuery;
  } else {
    initialQuery = '';
  }
  // Provider lifts state — same UI works with any provider impl (dependency injection)
  return (
    <SearchProvider initialQuery={initialQuery}>
      <SearchPageInner initialQuery={initialQuery} />
    </SearchProvider>
  );
}
