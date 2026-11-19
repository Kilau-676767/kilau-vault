import { create } from 'zustand';
import { TRANSLATIONS, type LangId, type Translations } from '../i18n/translations';

interface I18nState {
  lang: LangId;
  setLang: (lang: LangId) => void;
}

function getInitialLang(): LangId {
  try {
    const saved = localStorage.getItem('kilau-vault-lang') as LangId | null;
    if (saved && saved in TRANSLATIONS) return saved;
  } catch {
    // ignore
  }
  return 'zh';
}

export const useI18nStore = create<I18nState>((set) => ({
  lang: getInitialLang(),
  setLang: (lang) => {
    try {
      localStorage.setItem('kilau-vault-lang', lang);
    } catch {
      // ignore
    }
    set({ lang });
  },
}));

export function useT(): { lang: LangId; setLang: (l: LangId) => void; t: Translations } {
  const { lang, setLang } = useI18nStore();
  return { lang, setLang, t: TRANSLATIONS[lang] };
}
