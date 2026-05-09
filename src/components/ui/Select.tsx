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
          'ui-select-trigger',
          'disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
        aria-label="Select"
      >
        <RadixSelect.Value placeholder={placeholder || 'Select...'}>
          <span className="truncate">{selectedLabel}</span>
        </RadixSelect.Value>
        <RadixSelect.Icon className="muted-icon">
          <ChevronDown size={16} />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={8}
          className="ui-select-content"
        >
          <RadixSelect.ScrollUpButton className="ui-select-scroll">
            <ChevronUp size={16} />
          </RadixSelect.ScrollUpButton>

          <RadixSelect.Viewport className="max-h-[280px] p-1">
            {options.map((opt) => (
              <RadixSelect.Item
                key={opt.value}
                value={opt.value}
                disabled={opt.disabled}
                className="ui-select-item"
              >
                <RadixSelect.ItemText>{opt.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator className="absolute right-2 inline-flex items-center justify-center">
                  <Check size={16} />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>

          <RadixSelect.ScrollDownButton className="ui-select-scroll">
            <ChevronDown size={16} />
          </RadixSelect.ScrollDownButton>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
