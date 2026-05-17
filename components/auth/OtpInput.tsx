'use client';

import { useRef, useCallback } from 'react';

interface OtpInputProps {
  length?: number;
  value: string[];
  onChange: (index: number, value: string) => void;
  onComplete?: (fullOtp: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled = false,
  autoFocus = false,
}: OtpInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const setRef = useCallback(
    (index: number) => (el: HTMLInputElement | null) => {
      inputRefs.current[index] = el;
    },
    []
  );

  const handleChange = (index: number, rawValue: string) => {
    const cleaned = rawValue.replace(/[^0-9]/g, '');

    if (cleaned.length > 1) {
      const chars = cleaned.slice(0, length).split('');
      for (let i = 0; i < chars.length && index + i < length; i++) {
        onChange(index + i, chars[i]);
      }
      inputRefs.current[Math.min(length - 1, index + chars.length)]?.focus();

      const updated = [...value];
      for (let i = 0; i < chars.length && index + i < length; i++) {
        updated[index + i] = chars[i];
      }
      const fullOtp = updated.join('');
      if (fullOtp.length === length && onComplete) {
        onComplete(fullOtp);
      }
      return;
    }

    onChange(index, cleaned);

    if (cleaned && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    const updated = [...value];
    updated[index] = cleaned;
    const fullOtp = updated.join('');
    if (fullOtp.length === length && onComplete) {
      onComplete(fullOtp);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={setRef(index)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[index] || ''}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          className="w-10 h-12 text-center text-lg font-semibold border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:opacity-50"
          aria-label={`Digit ${index + 1}`}
        />
      ))}
    </div>
  );
}
