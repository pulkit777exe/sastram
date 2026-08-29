'use client';

import { useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ApiKeysModal, hasAllApiKeys } from '@/components/ai-search/ApiKeysModal';
import { SaiSearchLayout } from '@/components/ai-search/sai-search-layout';
import { SearchProvider, useSearch } from '@/components/ai-search/search-provider';
import { SearchComposer } from '@/components/ai-search/search-composer';

const apiKeysListeners = new Set<() => void>();
function subscribeToApiKeys(cb: () => void) {
  apiKeysListeners.add(cb);
  return () => apiKeysListeners.delete(cb);
}
function getHasApiKeys() {
  return hasAllApiKeys();
}
function notifyApiKeysChanged(_hasAll?: boolean) {
  apiKeysListeners.forEach((fn) => fn());
}

interface SearchPageProps {
  user?: { name?: string | null; email?: string | null; image?: string | null } | null;
}

// Inner — accesses lifted state via context (state-lift-state, state-decouple-implementation)
function SearchPageInner({ initialQuery }: { initialQuery: string }) {
  const {
    state: { appState, isChatActive, currentSessionId },
    actions: { selectSession, newSearch },
  } = useSearch();
  const [showApiKeys, setShowApiKeys] = useState(false);
  const hasKeys = useSyncExternalStore(subscribeToApiKeys, getHasApiKeys, () => false);

  // Explicit variants — patterns-explicit-variants (no isChatActive prop to Composer)
  const content = !isChatActive && appState === 'idle'
    ? <SearchComposer.IdleVariant initialQuery={initialQuery} />
    : <SearchComposer.ActiveVariant onNewSearchInitial={initialQuery} />;

  return (
    <SaiSearchLayout
      onSelectSession={selectSession}
      onNewSearch={() => newSearch(initialQuery)}
      currentSessionId={currentSessionId}
      hasApiKeys={hasKeys}
      onOpenApiKeys={() => setShowApiKeys(true)}
    >
      <SearchComposer.Frame>
        {/* IdleVariant already includes motion; wrap once for consistency */}
        { !isChatActive && appState === 'idle' ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            {content}
          </motion.div>
        ) : content }
      </SearchComposer.Frame>

      <ApiKeysModal
        isOpen={showApiKeys}
        onClose={() => setShowApiKeys(false)}
        onKeysChange={notifyApiKeysChanged}
      />
    </SaiSearchLayout>
  );
}

export function SearchPage({ user }: SearchPageProps) {
  void user;
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';
  // Provider lifts state — same UI works with any provider impl (dependency injection)
  return (
    <SearchProvider initialQuery={initialQuery}>
      <SearchPageInner initialQuery={initialQuery} />
    </SearchProvider>
  );
}
