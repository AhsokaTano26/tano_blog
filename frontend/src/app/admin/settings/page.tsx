'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Save, Globe, FileText, Palette, MessageSquare, Code, Mail, User, Plus, Trash2, Cpu, Zap, AlertTriangle, Info, ArrowUpCircle, GitCompare } from 'lucide-react';
import { Loading } from '@/components/Loading';
import { Select } from '@/components/ConfirmDialog';
import { MediaField } from '@/components/MediaField';


const contactTypes = [
  { value: 'email', label: '邮箱' },
  { value: 'github', label: 'GitHub' },
  { value: 'twitter', label: 'Twitter/X' },
  { value: 'bilibili', label: 'B站' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'qq', label: 'QQ' },
  { value: 'link', label: '链接' },
];

const tabs = [
  { key: 'profile', label: '个人资料', icon: User },
  { key: 'basic', label: '基本设置', icon: Globe },
  { key: 'article', label: '文章设置', icon: FileText },
  { key: 'appearance', label: '外观设置', icon: Palette },
  { key: 'comment', label: '评论设置', icon: MessageSquare },
  { key: 'ai', label: 'AI 设置', icon: Cpu },
  { key: 'email', label: '邮件通知', icon: Mail },
  { key: 'injection', label: '代码注入', icon: Code },
  { key: 'danger', label: '危险操作', icon: AlertTriangle },
  { key: 'about', label: '关于', icon: Info },
];

export default function AdminSettings() {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('basic');
  const [testing, setTesting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearStep, setClearStep] = useState(0); // 0=hidden, 1=first confirm, 2=type CLEAR_ALL
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [checkingVersion, setCheckingVersion] = useState(true);
  const [versionError, setVersionError] = useState(false);
  const [changelog, setChangelog] = useState<string[]>([]);
  const [loadingChangelog, setLoadingChangelog] = useState(false);
  const [testVersionInput, setTestVersionInput] = useState('');

  function parseSemver(v: string): number[] {
    return v.replace(/^v/, '').split('.').map(Number);
  }

  function isNewerVersion(latest: string, current: string): boolean {
    const lp = parseSemver(latest);
    const cp = parseSemver(current);
    for (let i = 0; i < 3; i++) {
      if ((lp[i] || 0) > (cp[i] || 0)) return true;
      if ((lp[i] || 0) < (cp[i] || 0)) return false;
    }
    return false;
  }

  function getContacts(): { type: string; value: string }[] {
    try { return JSON.parse(config.profile_contacts || '[]'); } catch { return []; }
  }
  function setContacts(contacts: { type: string; value: string }[]) {
    setConfig({ ...config, profile_contacts: JSON.stringify(contacts) });
  }

  useEffect(() => {
    api.admin.config.get().then(res => setConfig(res.config)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setClearStep(0);
  }, [activeTab]);

  useEffect(() => {
    const current = process.env.NEXT_PUBLIC_APP_VERSION;
    api.admin.checkVersion(current && current !== 'dev' ? current : undefined)
      .then(data => {
        if (data.latest) {
          if (!current || current === 'dev') {
            setLatestVersion(data.latest);
          } else if (isNewerVersion(data.latest, current)) {
            setLatestVersion(data.latest);
          }
        }
        if (data.changelog && data.changelog.length > 0) {
          setChangelog(data.changelog);
        }
      })
      .catch(() => setVersionError(true))
      .finally(() => setCheckingVersion(false));
  }, []);

  async function handleTestChangelog() {
    const v = testVersionInput.trim();
    if (!v) return;
    setLoadingChangelog(true);
    setChangelog([]);
    try {
      const data = await api.admin.checkVersion(v);
      setChangelog(data.changelog || []);
    } catch {
      setChangelog([]);
    }
    setLoadingChangelog(false);
  }

  async function handleSave() {
    setSaving(true);
    setMessage('');
    try {
      await api.admin.config.update(config);
      // Re-fetch config to ensure UI is in sync with server
      const res = await api.admin.config.get();
      setConfig(res.config);
      setMessage('设置已保存');
      setTimeout(() => setMessage(''), 3000);
    } catch (e) { setMessage('保存失败'); }
    setSaving(false);
  }

  async function handleTestEmail() {
    setTesting(true);
    setMessage('');
    try {
      const res = await api.admin.config.testEmail();
      setMessage(res.message || '测试邮件已发送');
      setTimeout(() => setMessage(''), 5000);
    } catch (e: any) {
      setMessage(e.message || '发送失败');
      setTimeout(() => setMessage(''), 5000);
    }
    setTesting(false);
  }

  async function handleClearAll() {
    setClearing(true);
    setMessage('');
    try {
      const res = await api.admin.restore.clearAll();
      setMessage(res.message || '已清空全站数据');
      setTimeout(() => setMessage(''), 5000);
    } catch (e: any) {
      setMessage(e.message || '清空失败');
      setTimeout(() => setMessage(''), 5000);
    }
    setClearing(false);
    setClearStep(0);
  }

  const inputClass = "w-full px-3 py-2.5 rounded-lg text-sm outline-none";
  const inputStyle = { border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' };

  if (loading) return <Loading />;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>设置</h1>
      </div>

      {message && (
        <div className="mb-4 px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 glass-card"
          style={{ color: message.includes('失败') ? 'hsl(0, 60%, 55%)' : 'hsl(142, 60%, 50%)' }}>
          {message}
        </div>
      )}

      <div className="glass-card rounded-xl overflow-hidden">
        {/* Tab navigation */}
        <div className="flex" style={{ borderBottom: '1px solid var(--glass-border)' }}>
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className="flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors relative"
              style={{ color: activeTab === tab.key ? 'var(--primary)' : 'var(--text-secondary)' }}>
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: 'var(--primary)' }} />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-6">
          {activeTab === 'profile' && (
            <div className="space-y-5 max-w-2xl">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>头像</label>
                <MediaField value={config.profile_avatar || ''} onChange={url => setConfig({ ...config, profile_avatar: url })} rounded="circle" placeholder="/aimi.png" filterType="image" />
                <p className="text-xs mt-1" style={{ color: 'var(--text-info)' }}>图片路径或 URL</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>显示名称</label>
                <input type="text" value={config.profile_name || ''} onChange={e => setConfig({ ...config, profile_name: e.target.value })}
                  placeholder="Tano" className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>个人简介</label>
                <textarea value={config.profile_bio || ''} onChange={e => setConfig({ ...config, profile_bio: e.target.value })}
                  rows={2} placeholder="A BanG Dreamer!" className={`${inputClass} resize-none`} style={inputStyle} />
              </div>

              {/* Contacts */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>联系方式</label>
                <div className="space-y-2">
                  {getContacts().map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-32">
                        <Select value={c.type}
                          onChange={v => {
                            const list = getContacts();
                            list[i] = { ...list[i], type: v };
                            setContacts(list);
                          }}
                          options={contactTypes.map(t => ({ value: t.value, label: t.label }))} />
                      </div>
                      <input type="text" value={c.value}
                        onChange={e => {
                          const list = getContacts();
                          list[i] = { ...list[i], value: e.target.value };
                          setContacts(list);
                        }}
                        placeholder={contactTypes.find(t => t.value === c.type)?.label || ''}
                        className={`flex-1 ${inputClass}`} style={inputStyle} />
                      <button onClick={() => setContacts(getContacts().filter((_, j) => j !== i))}
                        className="p-2 rounded-lg transition-colors hover:bg-red-500/10"
                        style={{ color: 'hsl(0, 60%, 55%)' }}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={() => {
                  const used = getContacts().map(c => c.type);
                  const next = contactTypes.find(t => !used.includes(t.value));
                  if (next) setContacts([...getContacts(), { type: next.value, value: '' }]);
                }}
                  className="mt-2 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors"
                  style={{ color: 'var(--primary)', background: 'var(--primary-sub)' }}>
                  <Plus className="w-4 h-4" />
                  添加联系方式
                </button>
              </div>

              {/* About page content */}
              <div className="pt-4" style={{ borderTop: '1px solid var(--glass-border)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4" style={{ color: 'var(--text-info)' }} />
                  <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>关于页面</span>
                </div>
                <p className="text-xs mb-2" style={{ color: 'var(--text-info)' }}>支持 Markdown 格式，将显示在关于页面头像/简介下方</p>
                <textarea
                  value={config.about_content || ''}
                  onChange={e => setConfig({ ...config, about_content: e.target.value })}
                  rows={12}
                  placeholder="在此编写关于页面的详细内容，支持 Markdown 格式..."
                  className={`${inputClass} resize-y font-mono text-sm leading-relaxed`}
                  style={inputStyle}
                />
              </div>
            </div>
          )}

          {activeTab === 'basic' && (
            <div className="space-y-5 max-w-2xl">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>站点标题</label>
                <input type="text" value={config.site_title || ''} onChange={e => setConfig({ ...config, site_title: e.target.value })}
                  className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>站点描述</label>
                <textarea value={config.site_description || ''} onChange={e => setConfig({ ...config, site_description: e.target.value })} rows={2}
                  className={`${inputClass} resize-none`} style={inputStyle} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>站点 URL</label>
                <input type="url" value={config.site_url || ''} onChange={e => setConfig({ ...config, site_url: e.target.value })}
                  className={`${inputClass} font-mono`} style={inputStyle} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>页脚文本</label>
                <input type="text" value={config.footer_text || ''} onChange={e => setConfig({ ...config, footer_text: e.target.value })}
                  className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>站点 Favicon</label>
                <MediaField value={config.site_favicon || ''} onChange={url => setConfig({ ...config, site_favicon: url })} previewSize={32} placeholder="/favicon.ico" filterType="image" />
                <p className="text-xs mt-1" style={{ color: 'var(--text-info)' }}>建议尺寸 32×32，支持 .ico / .png / .svg</p>
              </div>
            </div>
          )}

          {activeTab === 'article' && (
            <div className="space-y-5 max-w-2xl">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>每页文章数</label>
                <input type="number" min="1" max="50" value={config.posts_per_page || '10'} onChange={e => setConfig({ ...config, posts_per_page: e.target.value })}
                  className="w-32 px-3 py-2.5 rounded-lg text-sm outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>摘要字数</label>
                <input type="number" min="50" max="500" value={config.excerpt_length || '200'} onChange={e => setConfig({ ...config, excerpt_length: e.target.value })}
                  className="w-32 px-3 py-2.5 rounded-lg text-sm outline-none" style={inputStyle} />
              </div>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="space-y-5 max-w-2xl">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>默认主题</label>
                <Select value={config.default_theme || 'dark'}
                  onChange={v => setConfig({ ...config, default_theme: v })}
                  options={[
                    { value: 'dark', label: '深色' },
                    { value: 'light', label: '浅色' },
                    { value: 'system', label: '跟随系统' },
                  ]} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>主题色</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="360"
                    value={config.accent_color || '225'}
                    onChange={e => setConfig({ ...config, accent_color: e.target.value })}
                    className="flex-1 h-2 rounded-full appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right,
                        hsl(0,60%,50%), hsl(60,60%,50%), hsl(120,60%,50%),
                        hsl(180,60%,50%), hsl(240,60%,50%), hsl(300,60%,50%), hsl(360,60%,50%))`
                    }}
                  />
                  <div className="w-8 h-8 rounded-lg flex-shrink-0"
                    style={{ backgroundColor: `hsl(${config.accent_color || '225'}, 60%, 50%)`, border: '1px solid var(--glass-border)' }} />
                  <span className="text-sm w-14 font-mono" style={{ color: 'var(--text-secondary)' }}>{config.accent_color || '225'}°</span>
                </div>
                {/* Preset shortcuts */}
                <div className="flex items-center gap-4 mt-3">
                  {[
                    { hue: 0, label: '红色' },
                    { hue: 200, label: '蓝绿色' },
                    { hue: 250, label: '青色' },
                    { hue: 345, label: '粉红色' },
                  ].map((preset) => (
                    <button
                      key={preset.hue}
                      onClick={() => setConfig({ ...config, accent_color: String(preset.hue) })}
                      className="flex items-center gap-1.5 text-sm transition-colors"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <div className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: `hsl(${preset.hue}, 60%, 50%)` }} />
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'comment' && (
            <div className="space-y-5 max-w-2xl">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>评论功能</label>
                <div className="flex gap-2">
                  <button onClick={() => setConfig({ ...config, comment_enabled: 'true' })}
                    className="px-4 py-2 rounded-lg text-sm transition-colors"
                    style={{
                      background: config.comment_enabled === 'true' ? 'hsl(142, 60%, 50%)' : 'var(--surface-bg)',
                      color: config.comment_enabled === 'true' ? '#fff' : 'var(--text-secondary)',
                      border: config.comment_enabled === 'true' ? 'none' : '1px solid var(--glass-border)',
                    }}>开启</button>
                  <button onClick={() => setConfig({ ...config, comment_enabled: 'false' })}
                    className="px-4 py-2 rounded-lg text-sm transition-colors"
                    style={{
                      background: config.comment_enabled === 'false' ? 'hsl(0, 60%, 55%)' : 'var(--surface-bg)',
                      color: config.comment_enabled === 'false' ? '#fff' : 'var(--text-secondary)',
                      border: config.comment_enabled === 'false' ? 'none' : '1px solid var(--glass-border)',
                    }}>关闭</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="space-y-5 max-w-2xl">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>AI 摘要生成</label>
                <div className="flex gap-2">
                  <button onClick={() => setConfig({ ...config, ai_enabled: 'true' })}
                    className="px-4 py-2 rounded-lg text-sm transition-colors"
                    style={{
                      background: config.ai_enabled === 'true' ? 'hsl(142, 60%, 50%)' : 'var(--surface-bg)',
                      color: config.ai_enabled === 'true' ? '#fff' : 'var(--text-secondary)',
                      border: config.ai_enabled === 'true' ? 'none' : '1px solid var(--glass-border)',
                    }}>开启</button>
                  <button onClick={() => setConfig({ ...config, ai_enabled: 'false' })}
                    className="px-4 py-2 rounded-lg text-sm transition-colors"
                    style={{
                      background: config.ai_enabled === 'false' ? 'hsl(0, 60%, 55%)' : 'var(--surface-bg)',
                      color: config.ai_enabled === 'false' ? '#fff' : 'var(--text-secondary)',
                      border: config.ai_enabled === 'false' ? 'none' : '1px solid var(--glass-border)',
                    }}>关闭</button>
                </div>
                <p className="text-xs mt-1.5" style={{ color: 'var(--text-info)' }}>开启后，可在文章编辑时使用 AI 自动生成摘要</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>API 地址</label>
                <input type="url" value={config.ai_api_url || ''} onChange={e => setConfig({ ...config, ai_api_url: e.target.value })}
                  placeholder="https://api.openai.com/v1" className={`${inputClass} font-mono`} style={inputStyle} />
                <p className="text-xs mt-1" style={{ color: 'var(--text-info)' }}>OpenAI 兼容 API 地址，默认 https://api.openai.com/v1</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>API Key</label>
                <input type="password" value={config.ai_api_key || ''} onChange={e => setConfig({ ...config, ai_api_key: e.target.value })}
                  placeholder="sk-..." className={inputClass} style={inputStyle} />
                <p className="text-xs mt-1" style={{ color: 'var(--text-info)' }}>OpenAI 或兼容服务的 API 密钥</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>模型名称</label>
                <input type="text" value={config.ai_model || ''} onChange={e => setConfig({ ...config, ai_model: e.target.value })}
                  placeholder="gpt-3.5-turbo" className={inputClass} style={inputStyle} />
                <p className="text-xs mt-1" style={{ color: 'var(--text-info)' }}>使用的模型，如 gpt-3.5-turbo、gpt-4o、gpt-4o-mini 等</p>
              </div>
            </div>
          )}

          {activeTab === 'email' && (
            <div className="space-y-5 max-w-2xl">
              {/* Enable toggle */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>邮件通知</label>
                <div className="flex gap-2">
                  <button onClick={() => setConfig({ ...config, email_enabled: 'true' })}
                    className="px-4 py-2 rounded-lg text-sm transition-colors"
                    style={{
                      background: config.email_enabled === 'true' ? 'hsl(142, 60%, 50%)' : 'var(--surface-bg)',
                      color: config.email_enabled === 'true' ? '#fff' : 'var(--text-secondary)',
                      border: config.email_enabled === 'true' ? 'none' : '1px solid var(--glass-border)',
                    }}>开启</button>
                  <button onClick={() => setConfig({ ...config, email_enabled: 'false' })}
                    className="px-4 py-2 rounded-lg text-sm transition-colors"
                    style={{
                      background: config.email_enabled === 'false' ? 'hsl(0, 60%, 55%)' : 'var(--surface-bg)',
                      color: config.email_enabled === 'false' ? '#fff' : 'var(--text-secondary)',
                      border: config.email_enabled === 'false' ? 'none' : '1px solid var(--glass-border)',
                    }}>关闭</button>
                </div>
                <p className="text-xs mt-1.5" style={{ color: 'var(--text-info)' }}>开启后，新评论和评论审核通过时会发送邮件通知</p>
              </div>

              {/* Provider selection */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>邮件服务商</label>
                <Select value={config.email_provider || 'zeabur'}
                  onChange={v => setConfig({ ...config, email_provider: v })}
                  options={[
                    { value: 'zeabur', label: 'Zeabur Email' },
                    { value: 'smtp', label: 'SMTP（QQ邮箱、Gmail 等）' },
                  ]} />
              </div>

              {/* From address */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>发件人地址</label>
                <input type="email" value={config.email_from || ''} onChange={e => setConfig({ ...config, email_from: e.target.value })}
                  placeholder="noreply@yourdomain.com" className={inputClass} style={inputStyle} />
              </div>

              {/* Zeabur fields */}
              {(config.email_provider || 'zeabur') === 'zeabur' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>API Key</label>
                    <input type="password" value={config.email_zeabur_api_key || ''} onChange={e => setConfig({ ...config, email_zeabur_api_key: e.target.value })}
                      placeholder="zs_your_api_key" className={inputClass} style={inputStyle} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>API URL</label>
                    <input type="url" value={config.email_zeabur_api_url || 'https://api.zeabur.com/api/v1/zsend/emails'} onChange={e => setConfig({ ...config, email_zeabur_api_url: e.target.value })}
                      className={`${inputClass} font-mono`} style={inputStyle} />
                  </div>
                </>
              )}

              {/* SMTP fields */}
              {config.email_provider === 'smtp' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>SMTP 主机</label>
                    <input type="text" value={config.email_smtp_host || ''} onChange={e => setConfig({ ...config, email_smtp_host: e.target.value })}
                      placeholder="smtp.qq.com" className={inputClass} style={inputStyle} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>SMTP 端口</label>
                    <input type="text" value={config.email_smtp_port || '587'} onChange={e => setConfig({ ...config, email_smtp_port: e.target.value })}
                      placeholder="587" className={`${inputClass} w-32`} style={inputStyle} />
                    <p className="text-xs mt-1" style={{ color: 'var(--text-info)' }}>587 (STARTTLS) 或 465 (SSL/TLS)</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>用户名</label>
                    <input type="text" value={config.email_smtp_username || ''} onChange={e => setConfig({ ...config, email_smtp_username: e.target.value })}
                      placeholder="your@email.com" className={inputClass} style={inputStyle} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>密码 / 授权码</label>
                    <input type="password" value={config.email_smtp_password || ''} onChange={e => setConfig({ ...config, email_smtp_password: e.target.value })}
                      placeholder="SMTP 授权码" className={inputClass} style={inputStyle} />
                    <p className="text-xs mt-1" style={{ color: 'var(--text-info)' }}>QQ邮箱请使用授权码，非登录密码</p>
                  </div>
                </>
              )}

              {/* Test email */}
              <div className="pt-4" style={{ borderTop: '1px solid var(--glass-border)' }}>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>发送测试邮件</label>
                <p className="text-xs mb-2" style={{ color: 'var(--text-info)' }}>将发送测试邮件到个人资料中的管理员邮箱</p>
                <button onClick={handleTestEmail} disabled={testing}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
                  style={{ background: 'var(--primary)' }}>
                  {testing ? '发送中...' : '发送测试邮件'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'injection' && (
            <div className="space-y-6 max-w-3xl">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>全局 Head 注入</label>
                <p className="text-xs mb-2" style={{ color: 'var(--text-info)' }}>注入到所有页面的 &lt;head&gt; 中，可用于添加统计代码、自定义样式等</p>
                <textarea
                  value={config.head_injection || ''}
                  onChange={e => setConfig({ ...config, head_injection: e.target.value })}
                  rows={6}
                  placeholder='&lt;script&gt;console.log("hello")&lt;/script&gt;'
                  className={`${inputClass} font-mono resize-none`} style={inputStyle}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>内容页 Head 注入</label>
                <p className="text-xs mb-2" style={{ color: 'var(--text-info)' }}>仅注入到文章详情页的 &lt;head&gt; 中</p>
                <textarea
                  value={config.content_head_injection || ''}
                  onChange={e => setConfig({ ...config, content_head_injection: e.target.value })}
                  rows={6}
                  placeholder='&lt;meta property="og:image" content="..." /&gt;'
                  className={`${inputClass} font-mono resize-none`} style={inputStyle}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>页脚注入</label>
                <p className="text-xs mb-2" style={{ color: 'var(--text-info)' }}>注入到所有前台页面的页脚区域之前</p>
                <textarea
                  value={config.footer_injection || ''}
                  onChange={e => setConfig({ ...config, footer_injection: e.target.value })}
                  rows={6}
                  placeholder='&lt;div&gt;自定义页脚内容&lt;/div&gt;'
                  className={`${inputClass} font-mono resize-none`} style={inputStyle}
                />
              </div>
            </div>
          )}

          {activeTab === 'danger' && (
            <div className="space-y-5 max-w-2xl">
              <div className="px-4 py-3 rounded-lg text-sm flex items-start gap-2"
                style={{ background: 'rgba(255, 100, 100, 0.1)', color: 'hsl(0, 60%, 55%)', border: '1px solid rgba(255, 100, 100, 0.2)' }}>
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>以下操作将永久删除数据，不可恢复！请谨慎操作。</span>
              </div>

              <div className="p-5 rounded-xl" style={{ background: 'rgba(255, 100, 100, 0.05)', border: '1px solid rgba(255, 100, 100, 0.15)' }}>
                <h3 className="text-sm font-semibold mb-1 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <Zap className="w-4 h-4" style={{ color: 'hsl(0, 60%, 55%)' }} />
                  清空全站数据
                </h3>
                <p className="text-xs mb-4" style={{ color: 'var(--text-info)' }}>
                  将删除所有文章、评论、媒体文件、分类、标签等全部数据，此操作不可撤销。
                </p>

                {clearStep === 0 && (
                  <button onClick={() => setClearStep(1)}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
                    style={{ background: 'hsl(0, 60%, 55%)' }}>
                    <Trash2 className="w-4 h-4" />
                    清空全站数据
                  </button>
                )}

                {clearStep === 1 && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium" style={{ color: 'hsl(0, 60%, 55%)' }}>
                      请在下方输入 <span className="font-mono font-bold">CLEAR_ALL</span> 确认清空所有数据：
                    </p>
                    <input type="text" autoFocus
                      onChange={e => { if (e.target.value === 'CLEAR_ALL') setClearStep(2); }}
                      placeholder="输入 CLEAR_ALL 确认"
                      className="w-full px-3 py-2.5 rounded-lg text-sm outline-none font-mono"
                      style={{ border: '1px solid rgba(255, 100, 100, 0.3)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
                    <button onClick={() => setClearStep(0)}
                      className="text-sm" style={{ color: 'var(--text-info)' }}>
                      取消
                    </button>
                  </div>
                )}

                {clearStep === 2 && (
                  <div className="space-y-3">
                    <div className="px-4 py-3 rounded-lg text-sm"
                      style={{ background: 'rgba(255, 100, 100, 0.15)', color: 'hsl(0, 60%, 55%)', border: '1px solid rgba(255, 100, 100, 0.3)' }}>
                      最后一次确认：此操作将删除博客全部数据且不可恢复！
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={handleClearAll} disabled={clearing}
                        className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
                        style={{ background: 'hsl(0, 60%, 55%)' }}>
                        <Zap className="w-4 h-4" />
                        {clearing ? '清空中...' : '确认清空'}
                      </button>
                      <button onClick={() => setClearStep(0)}
                        className="px-4 py-2.5 rounded-lg text-sm transition-colors"
                        style={{ color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }}>
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'about' && (
            <div className="space-y-5 max-w-2xl">
              {/* Version */}
              <div className="p-5 rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <Info className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                  系统版本
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ background: 'var(--surface-bg)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>应用版本</span>
                    <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{process.env.NEXT_PUBLIC_APP_VERSION || 'dev'}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ background: 'var(--surface-bg)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>前端框架</span>
                    <span className="font-mono" style={{ color: 'var(--text-primary)' }}>Next.js 16</span>
                  </div>
                  <div className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ background: 'var(--surface-bg)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>后端框架</span>
                    <span className="font-mono" style={{ color: 'var(--text-primary)' }}>Go + Gin</span>
                  </div>
                  <div className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ background: 'var(--surface-bg)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>构建时间</span>
                    <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{process.env.NEXT_PUBLIC_BUILD_TIME || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Changelog */}
              <div className="p-5 rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <FileText className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                  {process.env.NEXT_PUBLIC_APP_VERSION && process.env.NEXT_PUBLIC_APP_VERSION !== 'dev'
                    ? `更新日志 (${process.env.NEXT_PUBLIC_APP_VERSION})`
                    : '更新日志'}
                </h3>

                {/* Dev mode: test version input */}
                {(!process.env.NEXT_PUBLIC_APP_VERSION || process.env.NEXT_PUBLIC_APP_VERSION === 'dev') && (
                  <div className="flex gap-2 mb-3">
                    <input type="text" value={testVersionInput} onChange={e => setTestVersionInput(e.target.value)}
                      placeholder="输入版本号，如 v1.0.3"
                      className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                      style={{ background: 'var(--surface-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
                      onKeyDown={e => e.key === 'Enter' && handleTestChangelog()} />
                    <button onClick={handleTestChangelog} disabled={loadingChangelog || !testVersionInput.trim()}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
                      style={{ background: 'var(--primary)' }}>
                      {loadingChangelog ? '查询中...' : '查询'}
                    </button>
                  </div>
                )}

                {/* Changelog content */}
                {changelog.length > 0 ? (
                  <div className="space-y-1 text-sm">
                    {changelog.map((msg, i) => (
                      <div key={i} className="py-1.5 px-3 rounded-lg font-mono text-xs" style={{ background: 'var(--surface-bg)', color: 'var(--text-secondary)' }}>
                        {msg}
                      </div>
                    ))}
                  </div>
                ) : (
                  !loadingChangelog && (
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {process.env.NEXT_PUBLIC_APP_VERSION && process.env.NEXT_PUBLIC_APP_VERSION !== 'dev'
                        ? '暂无更新日志'
                        : '输入版本号查询更新日志'}
                    </p>
                  )
                )}
              </div>

              {/* Version upgrade banner */}
              {latestVersion && (
                <div className="p-4 rounded-xl flex items-start gap-3" style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                  <ArrowUpCircle className="w-5 h-5 mt-0.5 shrink-0" style={{ color: '#22c55e' }} />
                  <div className="text-sm">
                    <div className="font-medium mb-1" style={{ color: '#22c55e' }}>新版本可用</div>
                    <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      {latestVersion} 已发布，当前版本为 {process.env.NEXT_PUBLIC_APP_VERSION || 'dev'}。
                    </p>
                    <div className="mt-2 flex gap-3 text-xs">
                      <a href={`https://github.com/AhsokaTano26/tano_blog/releases/tag/${latestVersion}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors"
                        style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' }}>
                        <FileText className="w-3.5 h-3.5" />
                        更新日志
                      </a>
                      <a href={process.env.NEXT_PUBLIC_APP_VERSION && process.env.NEXT_PUBLIC_APP_VERSION !== 'dev'
                        ? `https://github.com/AhsokaTano26/tano_blog/compare/${process.env.NEXT_PUBLIC_APP_VERSION}...${latestVersion}`
                        : `https://github.com/AhsokaTano26/tano_blog/releases/tag/${latestVersion}`
                      } target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors"
                        style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' }}>
                        <GitCompare className="w-3.5 h-3.5" />
                        变更对比
                      </a>
                    </div>
                  </div>
                </div>
              )}
              {!checkingVersion && versionError && (
                <div className="p-3 rounded-xl text-xs" style={{ background: 'rgba(255, 200, 0, 0.08)', border: '1px solid rgba(255, 200, 0, 0.2)', color: 'var(--text-secondary)' }}>
                  无法检查版本更新
                </div>
              )}

              {/* Links */}
              <div className="p-5 rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>相关链接</h3>
                <div className="space-y-2 text-sm">
                  <a href="https://github.com/AhsokaTano26/tano_blog" target="_blank" rel="noopener noreferrer"
                    className="block py-2 px-3 rounded-lg transition-colors hover:bg-white/5"
                    style={{ color: 'var(--primary)' }}>
                    GitHub 仓库 ↗
                  </a>
                  <a href="/" target="_blank" rel="noopener noreferrer"
                    className="block py-2 px-3 rounded-lg transition-colors hover:bg-white/5"
                    style={{ color: 'var(--primary)' }}>
                    前台首页 ↗
                  </a>
                </div>
              </div>
            </div>
          )}

          {activeTab !== 'danger' && activeTab !== 'about' && (
            <div className="pt-4 mt-6" style={{ borderTop: '1px solid var(--glass-border)' }}>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
                style={{ background: 'var(--primary)' }}>
                <Save className="w-4 h-4" />
                {saving ? '保存中...' : '保存设置'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
