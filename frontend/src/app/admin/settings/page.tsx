'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Save, Globe, FileText, Palette, MessageSquare, Code, Mail, User, Plus, Trash2 } from 'lucide-react';
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
  { key: 'email', label: '邮件通知', icon: Mail },
  { key: 'injection', label: '代码注入', icon: Code },
];

export default function AdminSettings() {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('basic');
  const [testing, setTesting] = useState(false);

  function getContacts(): { type: string; value: string }[] {
    try { return JSON.parse(config.profile_contacts || '[]'); } catch { return []; }
  }
  function setContacts(contacts: { type: string; value: string }[]) {
    setConfig({ ...config, profile_contacts: JSON.stringify(contacts) });
  }

  useEffect(() => {
    api.admin.config.get().then(res => setConfig(res.config)).finally(() => setLoading(false));
  }, []);

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

          <div className="pt-4 mt-6" style={{ borderTop: '1px solid var(--glass-border)' }}>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
              style={{ background: 'var(--primary)' }}>
              <Save className="w-4 h-4" />
              {saving ? '保存中...' : '保存设置'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
