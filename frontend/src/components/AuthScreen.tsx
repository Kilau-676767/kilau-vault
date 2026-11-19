import React, { useState } from 'react';
import { authApi } from '../api/client';
import { useAppStore } from '../stores/useAppStore';
import { useT } from '../stores/useI18nStore';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Route, Lock, Mail, User as UserIcon, ArrowRight, Sun, Moon } from 'lucide-react';

export const AuthScreen: React.FC = () => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
  );

  const setAuth = useAppStore((s) => s.setAuth);
  const { t } = useT();

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    localStorage.setItem('kilau-vault-theme', next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = isRegister
        ? await authApi.register(email, username, password)
        : await authApi.login(email, password);
      await setAuth(res.token, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-4 relative">
      <div className="absolute top-6 right-6 flex items-center gap-2">
        <LanguageSwitcher />
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'dark' ? t.themeLight : t.themeDark}
          className="w-9 h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] flex items-center justify-center text-[var(--fg)] hover:border-[var(--border-strong)] transition cursor-pointer"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      <div className="w-full max-w-md bg-[var(--surface-raised)] border border-[var(--border-strong)] rounded-2xl shadow-2xl p-8">
        <div className="flex items-center gap-3.5 mb-7">
          <div className="w-10 h-10 rounded-full border border-[var(--border-strong)] flex items-center justify-center text-[var(--accent)]">
            <Route className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-serif-display text-xl font-bold text-[var(--fg-strong)] tracking-tight">
              Kilau Vault
            </h1>
            <p className="text-xs text-[var(--muted)]">{t.brandSubtitle}</p>
          </div>
        </div>

        <div className="flex bg-[var(--surface)] border border-[var(--border)] p-1 rounded-xl mb-6">
          <button
            type="button"
            onClick={() => {
              setIsRegister(false);
              setError('');
            }}
            className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition cursor-pointer ${
              !isRegister
                ? 'bg-[var(--accent)] text-white shadow'
                : 'text-[var(--muted)] hover:text-[var(--fg-strong)]'
            }`}
          >
            {t.loginTab}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsRegister(true);
              setError('');
            }}
            className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition cursor-pointer ${
              isRegister
                ? 'bg-[var(--accent)] text-white shadow'
                : 'text-[var(--muted)] hover:text-[var(--fg-strong)]'
            }`}
          >
            {t.registerTab}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--muted-strong)] mb-1.5">
              {t.email}
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[var(--muted)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl pl-9 pr-3 py-2.5 text-sm text-[var(--fg-strong)] outline-none transition"
              />
            </div>
          </div>

          {isRegister && (
            <div>
              <label className="block text-xs font-medium text-[var(--muted-strong)] mb-1.5">
                {t.username}
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-[var(--muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t.nicknamePlaceholder}
                  className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl pl-9 pr-3 py-2.5 text-sm text-[var(--fg-strong)] outline-none transition"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[var(--muted-strong)] mb-1.5">
              {t.password}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[var(--muted)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t.passwordPlaceholder}
                className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl pl-9 pr-3 py-2.5 text-sm text-[var(--fg-strong)] outline-none transition"
              />
            </div>
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--accent)] hover:opacity-90 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition cursor-pointer"
          >
            {loading ? t.processing : isRegister ? t.registerBtn : t.loginBtn}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-[var(--muted)]">
          Edge Serverless · Cloudflare Workers + D1
        </p>
      </div>
    </div>
  );
};
