import React, { useEffect, useRef, useState } from 'react';
import { authApi } from '../api/client';
import { useAppStore } from '../stores/useAppStore';
import type { UserStats } from '../types';
import {
  Camera,
  Database,
  HardDrive,
  KeyRound,
  Pencil,
  ShieldAlert,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react';

interface UserProfileModalProps {
  onClose: () => void;
}

const AVATAR_COLORS = [
  '#d98a73',
  '#a6b682',
  '#78a9a1',
  '#c7a769',
  '#a99bc6',
  '#ef4444',
];

function isImageAvatar(val?: string): boolean {
  if (!val) return false;
  return val.startsWith('data:image/') || val.startsWith('http://') || val.startsWith('https://');
}

async function compressImageToDataUrl(file: File, size = 160): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas unavailable'));
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ onClose }) => {
  const { user, setUser, logout, vaults, renameVault, deleteVault } = useAppStore();
  const [tab, setTab] = useState<'profile' | 'security' | 'vaults'>('profile');

  // Profile state
  const [username, setUsername] = useState(user?.username ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [avatar, setAvatar] = useState(user?.avatar || AVATAR_COLORS[0]);
  const [profileMsg, setProfileMsg] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  // Security state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [deletePwd, setDeletePwd] = useState('');
  const [deleteErr, setDeleteErr] = useState('');

  // Stats & Vaults state
  const [stats, setStats] = useState<UserStats | null>(null);

  useEffect(() => {
    authApi.getStats().then(setStats).catch(() => {});
  }, [vaults.length]);

  if (!user) return null;

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageToDataUrl(file);
      setAvatar(dataUrl);
      setProfileMsg('头像已裁切预览，点击「保存资料」生效');
    } catch (err) {
      setProfileMsg(err instanceof Error ? err.message : '头像处理失败');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMsg('');
    try {
      const res = await authApi.updateProfile({ username, bio, avatar });
      setUser(res.user);
      setProfileMsg('个人资料已保存');
    } catch (err) {
      setProfileMsg(err instanceof Error ? err.message : '保存失败');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg(null);
    if (newPassword !== confirmPassword) {
      setPwdMsg({ type: 'err', text: '两次输入的新密码不一致' });
      return;
    }
    try {
      await authApi.changePassword(oldPassword, newPassword);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwdMsg({ type: 'ok', text: '密码修改成功' });
    } catch (err) {
      setPwdMsg({ type: 'err', text: err instanceof Error ? err.message : '修改失败' });
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteErr('');
    if (!confirm('此操作将永久删除你的账户及所有知识库笔记，且不可恢复，确定继续吗？')) {
      return;
    }
    try {
      await authApi.deleteAccount(deletePwd);
      logout();
      onClose();
    } catch (err) {
      setDeleteErr(err instanceof Error ? err.message : '注销失败');
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-[#1e1e1e] border border-[#3a3a3a] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#333] bg-[#181818]">
          <div className="flex items-center gap-3">
            <div
              style={!isImageAvatar(avatar) ? { backgroundColor: avatar || AVATAR_COLORS[0] } : undefined}
              className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-white font-bold text-base shadow border border-[var(--border-strong)]"
            >
              {isImageAvatar(avatar) ? (
                <img src={avatar} alt={user.username} className="w-full h-full object-cover" />
              ) : (
                user.username.slice(0, 1).toUpperCase()
              )}
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">{user.username}</h3>
              <p className="text-xs text-[#888]">{user.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#888] hover:text-white p-1.5 rounded-lg hover:bg-[#2a2a2a] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[#333] px-6 bg-[#1a1a1a] gap-2">
          <button
            type="button"
            onClick={() => setTab('profile')}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition cursor-pointer ${
              tab === 'profile'
                ? 'border-[#7f6df2] text-[#c4a7ff]'
                : 'border-transparent text-[#888] hover:text-white'
            }`}
          >
            <UserIcon className="w-3.5 h-3.5" />
            个人资料
          </button>
          <button
            type="button"
            onClick={() => setTab('vaults')}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition cursor-pointer ${
              tab === 'vaults'
                ? 'border-[#7f6df2] text-[#c4a7ff]'
                : 'border-transparent text-[#888] hover:text-white'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            配额与知识库 ({vaults.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('security')}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition cursor-pointer ${
              tab === 'security'
                ? 'border-[#7f6df2] text-[#c4a7ff]'
                : 'border-transparent text-[#888] hover:text-white'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            安全与密码
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs text-[#999] mb-2">更换头像（上传图片 / 外链 / 字母背景色）</label>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void handleAvatarUpload(e)}
                  />
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#262626] hover:bg-[#333] border border-[#3a3a3a] text-xs text-white cursor-pointer transition"
                  >
                    <Camera className="w-3.5 h-3.5 text-[#d98a73]" />
                    上传本地图片
                  </button>

                  <div className="flex gap-2">
                    {AVATAR_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setAvatar(c)}
                        style={{ backgroundColor: c }}
                        className={`w-6 h-6 rounded-full cursor-pointer transition ${
                          avatar === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#1e1e1e]' : ''
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <input
                  type="text"
                  value={isImageAvatar(avatar) && !avatar.startsWith('data:') ? avatar : ''}
                  onChange={(e) => setAvatar(e.target.value)}
                  placeholder="或者粘贴图片 URL（如 https://kilau.cn/images/kilau-avatar.jpg）"
                  className="mt-2.5 w-full bg-[#161616] border border-[#333] rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-[#d98a73]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[#999] mb-1">昵称 / 用户名</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-[#161616] border border-[#333] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#7f6df2]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#999] mb-1">绑定邮箱</label>
                  <input
                    type="text"
                    disabled
                    value={user.email}
                    className="w-full bg-[#161616]/50 border border-[#2c2c2c] rounded-lg px-3 py-2 text-sm text-[#777] cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-[#999] mb-1">个人简介</label>
                <textarea
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="写一句话介绍你的第二大脑..."
                  className="w-full bg-[#161616] border border-[#333] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#7f6df2]"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-[#666]">
                  注册时间：{new Date(user.createdAt).toLocaleDateString('zh-CN')}
                </span>
                <div className="flex items-center gap-3">
                  {profileMsg && <span className="text-xs text-emerald-400">{profileMsg}</span>}
                  <button
                    type="submit"
                    disabled={profileSaving}
                    className="px-4 py-2 rounded-lg bg-[#7f6df2] hover:bg-[#8e7ef7] text-white text-xs font-medium cursor-pointer"
                  >
                    {profileSaving ? '保存中...' : '保存资料'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {tab === 'vaults' && (
            <div className="space-y-6">
              {stats && (
                <div className="bg-[#161616] border border-[#333] rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-[#ccc] font-medium">
                      <HardDrive className="w-4 h-4 text-[#a882ff]" />
                      云端存储空间配额
                    </span>
                    <span className="text-[#999]">
                      {formatBytes(stats.storageBytes)} / {formatBytes(stats.quotaBytes)}
                    </span>
                  </div>
                  <div className="h-2 bg-[#262626] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#7f6df2] rounded-full"
                      style={{
                        width: `${Math.max(
                          2,
                          Math.min(100, (stats.storageBytes / stats.quotaBytes) * 100)
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-2 pt-1 text-center text-xs">
                    <div className="bg-[#1e1e1e] rounded-lg p-2 border border-[#2c2c2c]">
                      <div className="text-white font-bold">{stats.vaultCount}</div>
                      <div className="text-[11px] text-[#777]">知识库</div>
                    </div>
                    <div className="bg-[#1e1e1e] rounded-lg p-2 border border-[#2c2c2c]">
                      <div className="text-white font-bold">{stats.noteCount}</div>
                      <div className="text-[11px] text-[#777]">笔记篇数</div>
                    </div>
                    <div className="bg-[#1e1e1e] rounded-lg p-2 border border-[#2c2c2c]">
                      <div className="text-white font-bold">{stats.totalWords.toLocaleString()}</div>
                      <div className="text-[11px] text-[#777]">总字数</div>
                    </div>
                    <div className="bg-[#1e1e1e] rounded-lg p-2 border border-[#2c2c2c]">
                      <div className="text-white font-bold">{stats.shareCount}</div>
                      <div className="text-[11px] text-[#777]">公开分享</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="text-xs font-medium text-[#999]">管理我的知识库</div>
                {vaults.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-[#161616] border border-[#333]"
                  >
                    <div>
                      <div className="text-sm font-medium text-white">{v.name}</div>
                      <div className="text-[11px] text-[#666]">
                        创建于 {new Date(v.createdAt).toLocaleDateString('zh-CN')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const name = prompt('重命名知识库：', v.name);
                          if (name?.trim() && name.trim() !== v.name) {
                            void renameVault(v.id, name.trim());
                          }
                        }}
                        className="p-1.5 text-[#999] hover:text-white hover:bg-[#262626] rounded cursor-pointer"
                        title="重命名"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {vaults.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`确定删除知识库「${v.name}」及其所有笔记吗？`)) {
                              void deleteVault(v.id);
                            }
                          }}
                          className="p-1.5 text-[#999] hover:text-red-400 hover:bg-[#262626] rounded cursor-pointer"
                          title="删除知识库"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'security' && (
            <div className="space-y-6">
              <form onSubmit={handleChangePassword} className="space-y-3 bg-[#161616] p-4 rounded-xl border border-[#333]">
                <div className="text-sm font-medium text-white">修改登录密码</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="password"
                    required
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="当前密码"
                    className="bg-[#1e1e1e] border border-[#333] rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#7f6df2]"
                  />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="新密码 (至少6位)"
                    className="bg-[#1e1e1e] border border-[#333] rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#7f6df2]"
                  />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="确认新密码"
                    className="bg-[#1e1e1e] border border-[#333] rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#7f6df2]"
                  />
                </div>
                {pwdMsg && (
                  <div
                    className={`text-xs ${
                      pwdMsg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {pwdMsg.text}
                  </div>
                )}
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#7f6df2] hover:bg-[#8e7ef7] text-white text-xs font-medium cursor-pointer"
                >
                  更新密码
                </button>
              </form>

              <form
                onSubmit={handleDeleteAccount}
                className="space-y-3 bg-red-950/15 p-4 rounded-xl border border-red-900/40"
              >
                <div className="flex items-center gap-1.5 text-sm font-medium text-red-400">
                  <ShieldAlert className="w-4 h-4" />
                  危险操作：注销账户
                </div>
                <p className="text-xs text-[#999]">
                  注销后，你的账号、所有知识库、笔记与分享链接将被永久清空。
                </p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    required
                    value={deletePwd}
                    onChange={(e) => setDeletePwd(e.target.value)}
                    placeholder="输入当前密码以确认注销"
                    className="flex-1 bg-[#161616] border border-red-900/40 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-red-500"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-medium cursor-pointer"
                  >
                    永久注销
                  </button>
                </div>
                {deleteErr && <div className="text-xs text-red-400">{deleteErr}</div>}
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
