'use client';

import * as React from 'react';
import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export function Select({
  value,
  onChange,
  options,
  className,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const selectedLabel = React.useMemo(() => {
    const found = options.find((o) => o.value === value);
    return found?.label;
  }, [options, value]);

  return (
    <RadixSelect.Root value={value} onValueChange={onChange} disabled={disabled}>
      <RadixSelect.Trigger
        className={clsx(
          'inline-flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm',
          'text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/15',
          'disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
        aria-label="Select"
      >
        <RadixSelect.Value placeholder={placeholder || 'Select…'}>
          <span className="truncate">{selectedLabel}</span>
        </RadixSelect.Value>
        <RadixSelect.Icon className="text-white/60">
          <ChevronDown size={16} />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={8}
          className={clsx(
            'z-[9999] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0e14] shadow-glow',
            'min-w-[var(--radix-select-trigger-width)]',
          )}
        >
          <RadixSelect.ScrollUpButton className="grid place-items-center py-1 text-white/70">
            <ChevronUp size={16} />
          </RadixSelect.ScrollUpButton>

          <RadixSelect.Viewport className="max-h-[280px] p-1">
            {options.map((opt) => (
              <RadixSelect.Item
                key={opt.value}
                value={opt.value}
                disabled={opt.disabled}
                className={clsx(
                  'relative flex select-none items-center rounded-xl px-3 py-2 text-sm outline-none',
                  'text-white/90 data-[highlighted]:bg-white/10',
                  'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
                )}
              >
                <RadixSelect.ItemText>{opt.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator className="absolute right-2 inline-flex items-center justify-center text-white/80">
                  <Check size={16} />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>

          <RadixSelect.ScrollDownButton className="grid place-items-center py-1 text-white/70">
            <ChevronDown size={16} />
          </RadixSelect.ScrollDownButton>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
