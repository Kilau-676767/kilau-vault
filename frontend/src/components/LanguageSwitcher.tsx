import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Languages } from 'lucide-react';
import { LANGUAGES } from '../i18n/translations';
import { useT } from '../stores/useI18nStore';

export const LanguageSwitcher: React.FC = () => {
  const { lang, setLang, t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const current = LANGUAGES.find((l) => l.id === lang) ?? LANGUAGES[0];

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t.switchLang}
        aria-expanded={open}
        className="h-9 px-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)]/70 hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] text-[var(--fg)] flex items-center gap-1.5 transition cursor-pointer"
      >
        <Languages className="w-4 h-4 text-[var(--muted-strong)]" />
        <span className="text-xs font-semibold min-w-[18px] text-center">
          {current.short}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-[var(--muted)]" />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] w-44 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-raised)]/95 backdrop-blur-lg shadow-2xl p-1.5 z-50">
          <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">
            {t.switchLang}
          </div>
          {LANGUAGES.map((item) => {
            const active = item.id === lang;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setLang(item.id);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition cursor-pointer ${
                  active
                    ? 'bg-[var(--accent)]/15 text-[var(--accent)] font-medium'
                    : 'text-[var(--fg)] hover:bg-[var(--surface-muted)]'
                }`}
              >
                <span>{item.name}</span>
                {active ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <span className="text-[10px] text-[var(--muted)]">{item.short}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
