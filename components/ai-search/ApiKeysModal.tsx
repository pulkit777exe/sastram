'use client';

import { useState } from 'react';
import { Eye, EyeOff, Check, X, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface ApiKeysModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeysChange: (hasAll: boolean) => void;
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

export function ApiKeysModal({ isOpen, onClose, onKeysChange }: ApiKeysModalProps) {
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

    // Notify parent
    const allPresent = KEY_CONFIGS.every((c) => updated[c.id] && updated[c.id].length > 0);
    onKeysChange(allPresent);
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
            Your API keys are stored <strong>only in your browser</strong> and never sent to our
            servers for storage. They are passed securely via request headers for each search.
          </p>
        </div>

        <div className="px-6 py-4 space-y-4">
          {KEY_CONFIGS.map((config) => {
            const value = keys[config.id] || '';
            const isValid = value ? config.validate(value) : false;
            const show = showKeys[config.id] || false;

            return (
              <div key={config.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-ink">{config.label}</label>
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
                    type={show ? 'text' : 'password'}
                    value={value}
                    onChange={(e) => handleKeyChange(config.id, e.target.value.trim())}
                    placeholder={config.placeholder}
                    className="text-xs font-mono pr-16"
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
