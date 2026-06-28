'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import QRCode from 'qrcode';
import { Save, Lock, User, Shield, KeyRound, Trash2, Plus } from 'lucide-react';
import { Loading } from '@/components/Loading';

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlToBuffer(base64url: string): ArrayBuffer {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return buffer;
}

export default function AdminProfile() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<'profile' | 'password' | 'totp' | 'passkey'>('profile');

  // TOTP fields
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpSecret, setTotpSecret] = useState('');
  const [totpQrCode, setTotpQrCode] = useState('');
  const [totpCode, setTotpCode] = useState('');

  // Profile fields
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [bio, setBio] = useState('');

  // Password fields
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Passkey fields
  const [passkeys, setPasskeys] = useState<{ id: string; nickname: string; created_at: string }[]>([]);
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  useEffect(() => {
    api.getMe().then(u => {
      setUser(u);
      setDisplayName(u.display_name || '');
      setEmail(u.email || '');
      setAvatarUrl(u.avatar_url || '');
      setBio(u.bio || '');
      setTotpEnabled(u.totp_enabled || false);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab === 'passkey') loadPasskeys();
  }, [tab]);

  async function handleSaveProfile() {
    setSaving(true);
    setMessage('');
    try {
      await api.updateProfile({
        display_name: displayName,
        email,
        avatar_url: avatarUrl,
        bio,
      });
      setMessage('个人信息已保存');
      setTimeout(() => setMessage(''), 3000);
    } catch (e: any) {
      setMessage(e.message || '保存失败');
    }
    setSaving(false);
  }

  async function handleChangePassword() {
    if (newPassword !== confirmPassword) {
      setMessage('两次输入的密码不一致');
      return;
    }
    if (newPassword.length < 6) {
      setMessage('新密码不能少于6个字符');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      await api.changePassword({ old_password: oldPassword, new_password: newPassword });
      setMessage('密码已修改');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setMessage(''), 3000);
    } catch (e: any) {
      setMessage(e.message || '修改失败');
    }
    setSaving(false);
  }

  async function handleSetupTOTP() {
    try {
      const res = await api.setupTOTP();
      setTotpSecret(res.secret);
      const dataUrl = await QRCode.toDataURL(res.qr_code, { width: 192, margin: 2 });
      setTotpQrCode(dataUrl);
    } catch (e: any) {
      setMessage(e.message || '设置失败');
    }
  }

  async function handleVerifyTOTP() {
    if (totpCode.length !== 6) {
      setMessage('请输入6位验证码');
      return;
    }
    try {
      await api.verifyTOTP(totpCode);
      setTotpEnabled(true);
      setTotpSecret('');
      setTotpQrCode('');
      setTotpCode('');
      setMessage('两步验证已启用');
      setTimeout(() => setMessage(''), 3000);
    } catch (e: any) {
      setMessage(e.message || '验证失败');
    }
  }

  async function handleDisableTOTP() {
    if (!confirm('确定要关闭两步验证？')) return;
    try {
      await api.disableTOTP();
      setTotpEnabled(false);
      setMessage('两步验证已关闭');
      setTimeout(() => setMessage(''), 3000);
    } catch (e: any) {
      setMessage(e.message || '操作失败');
    }
  }

  async function loadPasskeys() {
    setPasskeyLoading(true);
    try {
      const list = await api.passkeysList();
      setPasskeys(list);
    } catch {}
    setPasskeyLoading(false);
  }

  async function handleRegisterPasskey() {
    try {
      const options = await api.passkeyRegisterOptions();
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: base64urlToBuffer(options.challenge),
          rp: options.rp,
          user: {
            id: base64urlToBuffer(options.user.id),
            name: options.user.name,
            displayName: options.user.displayName,
          },
          pubKeyCredParams: options.pubKeyCredParams,
          timeout: options.timeout,
        },
      }) as PublicKeyCredential;
      const attestation = credential as any;
      await api.passkeyRegisterVerify({
        id: attestation.id,
        response: {
          clientDataJSON: bufferToBase64url(attestation.response.clientDataJSON),
          attestationObject: bufferToBase64url(attestation.response.attestationObject),
        },
      });
      setMessage('通行密钥已添加');
      setTimeout(() => setMessage(''), 3000);
      loadPasskeys();
    } catch (e: any) {
      if (e.name !== 'NotAllowedError') {
        setMessage(e.message || '注册失败');
      }
    }
  }

  async function handleDeletePasskey(id: string) {
    if (!confirm('确定要删除此通行密钥？')) return;
    try {
      await api.passkeyDelete(id);
      setPasskeys(passkeys.filter(p => p.id !== id));
      setMessage('通行密钥已删除');
      setTimeout(() => setMessage(''), 3000);
    } catch (e: any) {
      setMessage(e.message || '删除失败');
    }
  }

  async function handleRenamePasskey(id: string, currentName: string) {
    const name = prompt('输入新名称', currentName);
    if (!name || name === currentName) return;
    try {
      await api.passkeyRename(id, name);
      setPasskeys(passkeys.map(p => p.id === id ? { ...p, nickname: name } : p));
      setMessage('已重命名');
      setTimeout(() => setMessage(''), 3000);
    } catch (e: any) {
      setMessage(e.message || '重命名失败');
    }
  }

  const inputClass = "w-full px-3 py-2.5 rounded-lg text-sm outline-none";
  const inputStyle = { border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' };

  if (loading) return <Loading />;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>个人资料</h1>
      </div>

      {message && (
        <div className="mb-4 px-4 py-2.5 rounded-lg text-sm glass-card"
          style={{ color: message.includes('已') ? 'hsl(142, 60%, 50%)' : 'hsl(0, 60%, 55%)' }}>
          {message}
        </div>
      )}

      <div className="glass-card rounded-xl overflow-hidden">
        {/* Tabs */}
        <div className="flex" style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <button onClick={() => setTab('profile')}
            className="flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors relative"
            style={{ color: tab === 'profile' ? 'var(--primary)' : 'var(--text-secondary)' }}>
            <User className="w-4 h-4" />
            个人信息
            {tab === 'profile' && <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: 'var(--primary)' }} />}
          </button>
          <button onClick={() => setTab('password')}
            className="flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors relative"
            style={{ color: tab === 'password' ? 'var(--primary)' : 'var(--text-secondary)' }}>
            <Lock className="w-4 h-4" />
            修改密码
            {tab === 'password' && <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: 'var(--primary)' }} />}
          </button>
          <button onClick={() => setTab('totp')}
            className="flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors relative"
            style={{ color: tab === 'totp' ? 'var(--primary)' : 'var(--text-secondary)' }}>
            <Shield className="w-4 h-4" />
            两步验证
            {tab === 'totp' && <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: 'var(--primary)' }} />}
          </button>
          <button onClick={() => setTab('passkey')}
            className="flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors relative"
            style={{ color: tab === 'passkey' ? 'var(--primary)' : 'var(--text-secondary)' }}>
            <KeyRound className="w-4 h-4" />
            通行密钥
            {tab === 'passkey' && <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: 'var(--primary)' }} />}
          </button>
        </div>

        <div className="p-6">
          {tab === 'profile' && (
            <div className="space-y-5 max-w-2xl">
              {/* Avatar preview */}
              <div className="flex items-center gap-4">
                <img src={avatarUrl || '/aimi.png'} alt="头像"
                  className="w-16 h-16 rounded-full object-cover"
                  onError={(e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.src = '/aimi.png'; }} />
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{displayName || user?.username}</div>
                  <div className="text-xs" style={{ color: 'var(--text-info)' }}>@{user?.username}</div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>显示名称</label>
                <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                  placeholder="显示名称" className={inputClass} style={inputStyle} />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>邮箱</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="admin@example.com" className={inputClass} style={inputStyle} />
                <p className="text-xs mt-1" style={{ color: 'var(--text-info)' }}>用于接收评论通知等邮件</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>头像链接</label>
                <input type="url" value={avatarUrl} onChange={e => setAvatarUrl(e.target.value)}
                  placeholder="https://example.com/avatar.png" className={inputClass} style={inputStyle} />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>个人简介</label>
                <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3}
                  placeholder="介绍一下自己..." className={`${inputClass} resize-none`} style={inputStyle} />
              </div>

              <button onClick={handleSaveProfile} disabled={saving}
                className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
                style={{ background: 'var(--primary)' }}>
                <Save className="w-4 h-4" />
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          )}

          {tab === 'password' && (
            <div className="space-y-5 max-w-md">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>旧密码</label>
                <input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)}
                  placeholder="输入当前密码" className={inputClass} style={inputStyle} />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>新密码</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  placeholder="至少6个字符" className={inputClass} style={inputStyle} />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>确认新密码</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="再次输入新密码" className={inputClass} style={inputStyle} />
              </div>

              <button onClick={handleChangePassword} disabled={saving}
                className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
                style={{ background: 'var(--primary)' }}>
                <Lock className="w-4 h-4" />
                {saving ? '修改中...' : '修改密码'}
              </button>
            </div>
          )}

          {tab === 'totp' && (
            <div className="space-y-5 max-w-md">
              {totpEnabled ? (
                <>
                  <div className="flex items-center gap-3 p-4 rounded-xl" style={{ background: 'var(--primary-sub)' }}>
                    <Shield className="w-5 h-5" style={{ color: 'var(--primary)' }} />
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--primary)' }}>两步验证已启用</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>登录时需要输入验证码</p>
                    </div>
                  </div>
                  <button onClick={handleDisableTOTP}
                    className="px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
                    style={{ background: 'var(--color-error)', color: '#fff' }}>
                    关闭两步验证
                  </button>
                </>
              ) : totpQrCode ? (
                <>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    使用 Google Authenticator 或其他 TOTP 应用扫描二维码：
                  </p>
                  <div className="flex justify-center p-4 bg-white rounded-xl">
                    <img src={totpQrCode} alt="TOTP QR Code" className="w-48 h-48" />
                  </div>
                  <div>
                    <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                      或手动输入密钥：
                      <span className="font-mono cursor-pointer hover:opacity-80 underline underline-offset-2"
                        style={{ color: 'var(--primary)' }}
                        onClick={() => { navigator.clipboard.writeText(totpSecret); setMessage('密钥已复制'); setTimeout(() => setMessage(''), 2000); }}>
                        {totpSecret}
                      </span>
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>验证码</label>
                    <input type="text" value={totpCode} onChange={e => setTotpCode(e.target.value)}
                      placeholder="输入6位验证码" maxLength={6}
                      className={inputClass} style={inputStyle} />
                  </div>
                  <button onClick={handleVerifyTOTP}
                    className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
                    style={{ background: 'var(--primary)' }}>
                    验证并启用
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    两步验证为您的账户增加一层额外的安全保护。启用后，登录时需要输入手机验证码。
                  </p>
                  <button onClick={handleSetupTOTP}
                    className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
                    style={{ background: 'var(--primary)' }}>
                    <Shield className="w-4 h-4" />
                    开始设置
                  </button>
                </>
              )}
            </div>
          )}

          {tab === 'passkey' && (
            <div className="space-y-5 max-w-md">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                通行密钥（Passkey）让您无需输入密码即可安全登录。支持指纹、面容识别或设备密码。
              </p>

              {passkeyLoading ? (
                <Loading text="加载中..." />
              ) : passkeys.length > 0 ? (
                <div className="space-y-3">
                  {passkeys.map(pk => (
                    <div key={pk.id} className="flex items-center justify-between p-4 rounded-xl" style={{ border: '1px solid var(--glass-border)' }}>
                      <div className="flex items-center gap-3">
                        <KeyRound className="w-5 h-5" style={{ color: 'var(--primary)' }} />
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{pk.nickname || '未命名密钥'}</p>
                          <p className="text-xs" style={{ color: 'var(--text-info)' }}>
                            添加于 {new Date(pk.created_at).toLocaleDateString('zh-CN')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleRenamePasskey(pk.id, pk.nickname)}
                          className="p-2 rounded-lg transition-colors hover:opacity-80"
                          style={{ color: 'var(--text-secondary)' }}>
                          <User className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeletePasskey(pk.id)}
                          className="p-2 rounded-lg transition-colors hover:opacity-80"
                          style={{ color: 'var(--color-error)' }}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 rounded-xl" style={{ border: '1px dashed var(--glass-border)' }}>
                  <KeyRound className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-info)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>尚未添加通行密钥</p>
                </div>
              )}

              <button onClick={handleRegisterPasskey}
                className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ background: 'var(--primary)' }}>
                <Plus className="w-4 h-4" />
                添加通行密钥
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
