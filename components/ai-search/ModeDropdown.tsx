'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ModeDropdownOption<T extends string> {
  value: T;
  label: string;
}

interface ModeDropdownProps<T extends string> {
  label: string;
  value: T;
  options: readonly ModeDropdownOption<T>[];
  onChange: (value: T) => void;
}

export function ModeDropdown<T extends string>({
  label,
  value,
  options,
  onChange,
}: ModeDropdownProps<T>) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger className="h-8 w-auto gap-1 text-xs px-2 py-1 border-0 bg-transparent hover:bg-foreground/5">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value} className="text-xs">
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}