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
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <ChainIcon src={current.logoUrl} alt={current.name} />
        <span className="font-medium">{current.name}</span>
        <ChevronDown className="h-4 w-4 opacity-70" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Switch Networks"
          className="absolute left-0 top-11 z-50 w-[260px] rounded-2xl border border-white/10 bg-[#0b0e13]/95 p-2 shadow-2xl backdrop-blur"
        >
          <div className="flex items-center justify-between px-2 py-2">
            <div className="text-sm font-semibold">Switch Networks</div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-white/10 bg-white/5 p-1 hover:bg-white/10"
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
                    'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition',
                    active ? 'bg-emerald-400/90 text-black' : 'hover:bg-white/10'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <ChainIcon src={c.logoUrl} alt={c.name} />
                    <span className={clsx(active ? 'font-semibold' : 'font-medium')}>{c.name}</span>
                  </span>
                  {active ? (
                    <span className="flex items-center gap-2">
                      <span className="text-xs font-semibold">Connected</span>
                      <span className="h-2 w-2 rounded-full bg-emerald-600" />
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
