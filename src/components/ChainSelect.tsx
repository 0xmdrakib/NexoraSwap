'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { CHAIN_META } from '@/lib/chainsMeta';
import clsx from 'clsx';

type Props = {
  chainId: number;
  onSelect: (chainId: number) => void | Promise<void>;
};

function ChainIcon({ src, alt }: { src: string; alt: string }) {
  // Remote icons are OK for a starter; in production consider serving from your own CDN.
  return (
    <img
      src={src}
      alt={alt}
      className="h-5 w-5 rounded-full"
      loading="lazy"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = 'none';
      }}
    />
  );
}

export default function ChainSelect({ chainId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const current = CHAIN_META[chainId] || CHAIN_META[1];
  const chains = useMemo(() => Object.values(CHAIN_META), []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!open) return;
      if (!wrapRef.current) return;
      if (wrapRef.current.contains(e.target as any)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div className="network-shell relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="network-button"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <ChainIcon src={current.logoUrl} alt={current.name} />
        <span className="truncate">{current.name}</span>
        <ChevronDown className="h-4 w-4 muted-icon" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Switch Networks"
          className="chain-dropdown"
        >
          <div className="flex items-center justify-between px-2 py-2">
            <div className="modal-title text-sm">Switch Networks</div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="icon-button !h-8 !w-8"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[340px] overflow-auto px-1 pb-1">
            {chains.map((c) => {
              const active = c.id === chainId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={async () => {
                    try {
                      await onSelect(c.id);
                    } finally {
                      setOpen(false);
                    }
                  }}
                  className={clsx(
                    'menu-row',
                    active && 'menu-row-active',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <ChainIcon src={c.logoUrl} alt={c.name} />
                    <span className={clsx(active ? 'font-semibold' : 'font-medium')}>{c.name}</span>
                  </span>
                  {active ? (
                    <span className="flex items-center gap-2">
                      <span className="text-xs font-semibold">Connected</span>
                      <span className="status-dot !h-2 !w-2" />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
