'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Save, Globe, FileText, Palette, MessageSquare, Code } from 'lucide-react';

const tabs = [
  { key: 'basic', label: '基本设置', icon: Globe },
  { key: 'article', label: '文章设置', icon: FileText },
  { key: 'appearance', label: '外观设置', icon: Palette },
  { key: 'comment', label: '评论设置', icon: MessageSquare },
  { key: 'injection', label: '代码注入', icon: Code },
];

export default function AdminSettings() {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('basic');

  useEffect(() => {
    api.admin.config.get().then(res => setConfig(res.config)).finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage('');
    try {
      await api.admin.config.update(config);
      setMessage('设置已保存');
      setTimeout(() => setMessage(''), 3000);
    } catch (e) { setMessage('保存失败'); }
    setSaving(false);
  }

  const inputClass = "w-full px-3 py-2.5 rounded-lg text-sm outline-none";
  const inputStyle = { border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' };

  if (loading) return (
    <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>
      <div className="animate-spin w-8 h-8 border-4 rounded-full mx-auto mb-4" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
      加载中...
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>设置</h1>
      </div>

      {message && (
        <div className="mb-4 px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 glass-card"
          style={{ color: message === '保存失败' ? 'hsl(0, 60%, 55%)' : 'hsl(142, 60%, 50%)' }}>
          {message === '保存失败' ? '保存失败，请重试' : '设置已保存'}
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
                <select value={config.default_theme || 'dark'} onChange={e => setConfig({ ...config, default_theme: e.target.value })}
                  className={inputClass} style={inputStyle}>
                  <option value="dark">深色</option>
                  <option value="light">浅色</option>
                  <option value="system">跟随系统</option>
                </select>
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
