'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Play, RotateCcw, Save, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useEntryAnimationPreview, type EntryAnimationConfig, type EntryAnimationSettings as Settings } from '@/lib/entry-animation';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { FilePicker } from '@/components/ui/FilePicker';
import { Disclosure } from '@/components/ui/Disclosure';

const emptyConfig = (): EntryAnimationConfig => ({ overrides: {}, icon_data_url: '' });
const controlStyle = { background: 'var(--surface-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' };
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm disabled:opacity-50';

export function EntryAnimationSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<EntryAnimationConfig>(emptyConfig);
  const [busy, setBusy] = useState<'save' | 'preview' | 'icon' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const reader = useRef<FileReader | null>(null);
  const preview = useEntryAnimationPreview();

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    api.admin.entryAnimation.get(controller.signal).then(value => {
      if (!active) return;
      setSettings(value);
      setDraft({ overrides: value.overrides, icon_data_url: value.icon_data_url });
      setMessage(value.warning || '');
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : '读取失败'); });
    return () => { active = false; controller.abort(); reader.current?.abort(); };
  }, [reload]);

  async function run(action: 'save' | 'preview') {
    setBusy(action); setMessage(''); setError('');
    try {
      if (action === 'save') {
        const value = await api.admin.entryAnimation.update(draft);
        setSettings(value);
        setDraft({ overrides: value.overrides, icon_data_url: value.icon_data_url });
        setMessage('动画设置已保存');
      } else {
        const document = await api.admin.entryAnimation.preview(draft);
        preview?.(document);
        setMessage('已预览当前草稿，尚未保存的修改仍保留在此处');
      }
    } catch (e) { setError(e instanceof Error ? e.message : '操作失败'); }
    finally { setBusy(null); }
  }

  function selectIcon(file: File | undefined) {
    if (!file) return;
    setMessage(''); setError('');
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 512 * 1024) {
      setError('请选择不超过 512 KiB 的 PNG、JPEG、WebP 或 GIF 图片');
      return;
    }
    reader.current?.abort();
    const next = new FileReader();
    reader.current = next;
    setBusy('icon');
    next.onload = () => {
      setDraft(value => ({ ...value, icon_data_url: String(next.result) }));
      setBusy(null);
    };
    next.onerror = () => { setError('图标读取失败，请重新选择'); setBusy(null); };
    next.readAsDataURL(file);
  }

  if (!settings) return <div className="space-y-3 text-sm" role="status" style={{ color: 'var(--text-secondary)' }}>
    {error || '正在读取动画设置…'}
    {error && <button type="button" className={buttonClass} style={controlStyle} onClick={() => { setError(''); setReload(value => value + 1); }}>重试</button>}
  </div>;

  const groups = Array.from(new Set(settings.fields.map(field => field.group)));
  // The welcome title/icon are the most commonly edited controls.
  const welcome = settings.fields.find(field => field.key === 'welcome_title')?.group;
  if (welcome) groups.sort((a, b) => a === welcome ? -1 : b === welcome ? 1 : 0);

  return <section className="space-y-5" aria-label="进入动画设置">
    <div>
      <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>进入动画</h2>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        颜色自动跟随全局明暗模式与主题色。文字留空使用默认内容，欢迎标题留空使用站点标题。
        可用 {'{name}'} 表示显示名称、{'{username}'} 表示登录账户。
      </p>
    </div>

    <div className="rounded-xl p-4 space-y-3" style={controlStyle}>
      <h3 className="text-sm font-medium">欢迎页图标</h3>
      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        不上传时使用默认标记。支持 PNG、JPEG、WebP、GIF，最大 512 KiB、2048×2048 像素；图标仅登录后可读取。
      </p>
      <div className="flex flex-wrap items-center gap-4">
        {/* Private data URI: keep it out of any public image optimizer URL. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {draft.icon_data_url && <img src={draft.icon_data_url} alt="欢迎页图标预览" className="h-16 w-20 rounded-lg object-contain p-1" style={{ background: 'var(--glass-bg)' }} />}
        <FilePicker label="选择欢迎页图标" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy !== null}
          onChange={event => { selectIcon(event.target.files?.[0]); event.target.value = ''; }} />
        {draft.icon_data_url && <button type="button" className={buttonClass} disabled={busy !== null} style={controlStyle}
          onClick={() => setDraft(value => ({ ...value, icon_data_url: '' }))}><Trash2 size={14} />移除图标</button>}
      </div>
    </div>

    <div className="space-y-3">
      {groups.map(group => <Disclosure key={group} title={group} defaultOpen={group === welcome}>
        <div className="grid gap-4 py-3 sm:grid-cols-2">
          {settings.fields.filter(field => field.group === group).map(field => {
            const props = {
              id: `entry-field-${field.key}`,
              value: draft.overrides[field.key] || '',
              placeholder: field.default,
              maxLength: field.max_length,
              disabled: busy !== null,
              className: 'w-full px-3 py-2.5 text-sm',
              style: controlStyle,
              onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                const value = event.target.value;
                setDraft(current => ({ ...current, overrides: { ...current.overrides, [field.key]: value } }));
                setMessage('');
              },
            };
            return <div key={field.key} className={field.multiline ? 'sm:col-span-2' : ''}>
              <label className="mb-1.5 block text-sm" htmlFor={props.id} style={{ color: 'var(--text-secondary)' }}>{field.label}</label>
              {field.multiline ? <Textarea {...props} rows={6} /> : <Input {...props} />}
            </div>;
          })}
        </div>
      </Disclosure>)}
    </div>

    {error && <p role="alert" className="text-sm" style={{ color: 'hsl(0,65%,55%)' }}>{error}</p>}
    {message && <p role="status" className="text-sm" style={{ color: 'var(--primary)' }}>{message}</p>}
    <div className="flex flex-wrap gap-3 border-t pt-5" style={{ borderColor: 'var(--glass-border)' }}>
      <button type="button" disabled={busy !== null} className={buttonClass} style={{ background: 'var(--primary)', color: '#fff' }}
        onClick={() => void run('save')}><Save size={16} />{busy === 'save' ? '保存中…' : '保存动画设置'}</button>
      <button type="button" disabled={busy !== null || !preview} className={buttonClass} style={controlStyle}
        onClick={() => void run('preview')}><Play size={16} />{busy === 'preview' ? '准备预览…' : '预览当前草稿'}</button>
      <button type="button" disabled={busy !== null} className={buttonClass} style={controlStyle}
        onClick={() => { setDraft(emptyConfig()); setError(''); setMessage('已恢复默认草稿，点击“保存动画设置”后生效'); }}>
        <RotateCcw size={16} />恢复默认
      </button>
    </div>
  </section>;
}
