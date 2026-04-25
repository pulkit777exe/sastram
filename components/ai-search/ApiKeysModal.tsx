'use client';

import { useState } from 'react';
import { Eye, EyeOff, Check, X, KeyRound } from 'lucide-react';

interface ApiKeysModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeysChange: (hasAll: boolean) => void;
}

const KEY_CONFIGS = [
  {
    id: 'exa',
    label: 'Exa API Key',
    storageKey: 'sastram_exa_key',
    placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    validate: (key: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key),
    description: 'Get your key from exa.ai',
  },
  {
    id: 'tavily',
    label: 'Tavily API Key',
    storageKey: 'sastram_tavily_key',
    placeholder: 'tvly-xxxxxxxxxxxxx',
    validate: (key: string) => key.startsWith('tvly-') && key.length > 10,
    description: 'Get your key from tavily.com',
  },
  {
    id: 'gemini',
    label: 'Gemini API Key',
    storageKey: 'sastram_gemini_key',
    placeholder: 'Enter your API key',
    validate: (key: string) => key.startsWith('AIza') && key.length > 20,
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-card border border-border rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <KeyRound size={16} className="text-foreground/70" />
            <h3 className="text-sm font-semibold text-foreground">API Keys</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-foreground/5 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Info */}
        <div className="px-5 py-3 bg-foreground/2">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Your API keys are stored <strong>only in your browser</strong> and never sent to our
            servers for storage. They are passed securely via request headers for each search.
          </p>
        </div>

        {/* Key inputs */}
        <div className="px-5 py-4 space-y-4">
          {KEY_CONFIGS.map((config) => {
            const value = keys[config.id] || '';
            const isValid = value ? config.validate(value) : false;
            const show = showKeys[config.id] || false;

            return (
              <div key={config.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-foreground">{config.label}</label>
                  {value && (
                    <span className="flex items-center gap-1 text-[10px]">
                      {isValid ? (
                        <span className="text-emerald-500 flex items-center gap-0.5">
                          <Check size={10} /> Valid
                        </span>
                      ) : (
                        <span className="text-amber-500 flex items-center gap-0.5">
                          <X size={10} /> Invalid format
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={show ? 'text' : 'password'}
                    value={value}
                    onChange={(e) => handleKeyChange(config.id, e.target.value.trim())}
                    placeholder={config.placeholder}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/20 pr-16 font-mono"
                  />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                    <button
                      onClick={() => setShowKeys({ ...showKeys, [config.id]: !show })}
                      className="p-1.5 text-muted-foreground/50 hover:text-foreground transition-colors"
                    >
                      {show ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                    {value && (
                      <button
                        onClick={() => clearKey(config.id)}
                        className="p-1.5 text-muted-foreground/50 hover:text-red-500 transition-colors"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground/50 mt-1">{config.description}</p>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium bg-foreground text-background rounded-lg hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Helper to read API keys from localStorage.
 */
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
