'use client';

import { useEffect, useState } from 'react';
import { parseUserPreferences, type UserPreferences } from '@/lib/schemas/user-preferences';

export function useUserPreferences() {
  const [prefs, setPrefs] = useState<UserPreferences>(() => parseUserPreferences({}));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/user/preferences')
      .then((r) => {
        if (!r.ok) throw new Error('Failed');
        return r.json();
      })
      .then((j) => {
        if (j?.data) setPrefs(parseUserPreferences(j.data));
      })
      .catch((e) => console.warn('[prefs] failed to load', e))
      .finally(() => setLoading(false));
  }, []);

  return { prefs, loading };
}
