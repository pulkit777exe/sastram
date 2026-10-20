'use client';

import { useState } from 'react';
import { Eye, EyeOff, Check, X, KeyRound, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export interface ApiKeyIssue {
  provider: string;
  label: string;
  envVar?: string;
}

export interface ApiKeyIssueDetails {
  message?: string;
  missingKeys?: ApiKeyIssue[];
  invalidKeys?: ApiKeyIssue[];
}

interface ApiKeysModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeysChange: (keys: Record<string, string>) => void;
  issue?: ApiKeyIssueDetails | null;
}

// UUID v4 pattern: 8-4-4-4-12 hex chars
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TAVILY_PREFIX = 'tvly-';
const GEMINI_MIN_LENGTH = 20;

function isValidExaKey(key: string): boolean {
  return UUID_PATTERN.test(key);
}

function isValidTavilyKey(key: string): boolean {
  return key.startsWith(TAVILY_PREFIX) && key.length > 10;
}

function isValidGeminiKey(key: string): boolean {
  return (key.startsWith('AIza') || key.startsWith('AQ')) && key.length >= GEMINI_MIN_LENGTH;
}

const KEY_CONFIGS = [
  {
    id: 'exa',
    label: 'Exa API Key',
    storageKey: 'sastram_exa_key',
    placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    validate: isValidExaKey,
    description: 'Get your key from exa.ai',
  },
  {
    id: 'tavily',
    label: 'Tavily API Key',
    storageKey: 'sastram_tavily_key',
    placeholder: 'tvly-xxxxxxxxxxxxx',
    validate: isValidTavilyKey,
    description: 'Get your key from tavily.com',
  },
  {
    id: 'gemini',
    label: 'Gemini API Key',
    storageKey: 'sastram_gemini_key',
    placeholder: 'AIza... or AQ...',
    validate: isValidGeminiKey,
    description: 'Get your key from aistudio.google.com',
  },
];

export function isValidApiKey(provider: string, value: string): boolean {
  const config = KEY_CONFIGS.find((entry) => entry.id === provider);
  return config ? config.validate(value.trim()) : false;
}

export function ApiKeysModal({ isOpen, onClose, onKeysChange, issue }: ApiKeysModalProps) {
  const [keys, setKeys] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    const loaded: Record<string, string> = {};
    KEY_CONFIGS.forEach((config) => {
      const saved = localStorage.getItem(config.storageKey);
      if (saved) loaded[config.id] = saved;
    });
    return loaded;
  });
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  const handleKeyChange = (id: string, value: string) => {
    const updated = { ...keys, [id]: value };
    setKeys(updated);

    // Persist to localStorage
    const config = KEY_CONFIGS.find((c) => c.id === id);
    if (config && typeof window !== 'undefined') {
      if (value) {
        localStorage.setItem(config.storageKey, value);
      } else {
        localStorage.removeItem(config.storageKey);
      }
    }

    // Notify parent with the current key values so it can resume a pending
    // search as soon as the specific missing providers are filled in.
    onKeysChange(updated);
  };

  const clearKey = (id: string) => {
    handleKeyChange(id, '');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound size={16} className="text-ink-2" />
            API Keys
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-3 bg-hover/30 rounded-control mx-6">
          <p className="text-xs text-ink-2 leading-relaxed">
            Your API keys are stored <strong>only in your browser</strong> and never stored on our
            servers. They are sent with each search request so the search can run.
          </p>
        </div>

        {issue?.message && (
          <div
            role="alert"
            className="mx-6 mt-3 flex gap-2 rounded-control border border-amber-300/60 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200"
          >
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-medium">{issue.message}</p>
              {issue.missingKeys && issue.missingKeys.length > 0 && (
                <p>
                  Server environment: {issue.missingKeys.map((key) => key.envVar).filter(Boolean).join(', ')}.
                  Enter the keys below to continue your search immediately.
                </p>
              )}
              {issue.invalidKeys && issue.invalidKeys.length > 0 && (
                <p>Check the highlighted key{issue.invalidKeys.length > 1 ? 's' : ''} below.</p>
              )}
            </div>
          </div>
        )}

        <div className="px-6 py-4 space-y-4">
          {KEY_CONFIGS.map((config) => {
            const value = keys[config.id] || '';
            const isValid = value ? config.validate(value) : false;
            const show = showKeys[config.id] || false;
            const isInvalid = issue?.invalidKeys?.some((key) => key.provider === config.id) ?? false;

            return (
              <div key={config.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor={`api-key-${config.id}`} className="text-xs font-medium text-ink">
                    {config.label}
                  </label>
                  {value && (
                    <span className="flex items-center gap-1 text-xs">
                      {isValid ? (
                        <span className="text-sai-green flex items-center gap-0.5">
                          <Check size={10} /> Valid
                        </span>
                      ) : (
                        <span className="text-sai-orange flex items-center gap-0.5">
                          <X size={10} /> Invalid format
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id={`api-key-${config.id}`}
                    type={show ? 'text' : 'password'}
                    value={value}
                    onChange={(e) => handleKeyChange(config.id, e.target.value.trim())}
                    placeholder={config.placeholder}
                    aria-invalid={isInvalid || undefined}
                    className={`text-xs font-mono pr-16${isInvalid ? ' border-sai-red/60 focus-visible:ring-sai-red/20' : ''}`}
                  />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                    <Button type="button"
                      onClick={() => setShowKeys({ ...showKeys, [config.id]: !show })}
                      variant="ghost"
                      size="icon-sm"
                      className="text-ink-3 hover:text-ink"
                    >
                      {show ? <EyeOff size={12} /> : <Eye size={12} />}
                    </Button>
                    {value && (
                      <Button type="button"
                        onClick={() => clearKey(config.id)}
                        variant="ghost"
                        size="icon-sm"
                        className="text-ink-3 hover:text-sai-red"
                      >
                        <X size={12} />
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-ink-3/50 mt-1">{config.description}</p>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function getStoredApiKeys(): {
  exa: string;
  tavily: string;
  gemini: string;
} {
  if (typeof window === 'undefined') return { exa: '', tavily: '', gemini: '' };
  return {
    exa: localStorage.getItem('sastram_exa_key') || '',
    tavily: localStorage.getItem('sastram_tavily_key') || '',
    gemini: localStorage.getItem('sastram_gemini_key') || '',
  };
}

export function hasAllApiKeys(): boolean {
  const keys = getStoredApiKeys();
  return !!keys.exa && !!keys.tavily && !!keys.gemini;
}
