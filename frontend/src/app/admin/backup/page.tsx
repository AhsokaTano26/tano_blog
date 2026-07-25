'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { Download, Upload, Trash2, Plus, Link, FolderOpen, AlertTriangle, HardDrive, ServerCog, Play, RefreshCw, Save } from 'lucide-react';
import { Loading } from '@/components/Loading';
import { useConfirm, Select } from '@/components/ConfirmDialog';

const tabs = [
  { key: 'manage', label: '备份管理', icon: HardDrive },
  { key: 'restore', label: '数据恢复', icon: Upload },
  { key: 'sync', label: '跨机同步', icon: ServerCog },
];

const syncConfigKeys = [
  'sync_enabled', 'sync_role', 'sync_schedule_mode', 'sync_interval_minutes',
  'sync_weekdays', 'sync_time_of_day', 'sync_timezone', 'sync_ssh_target',
  'sync_ssh_key_path', 'sync_ssh_port', 'sync_remote_backup_dir', 'sync_remote_upload_dir', 'sync_bandwidth_kbps',
];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  } catch {
    return iso;
  }
}

export default function AdminBackup() {
  const { confirm } = useConfirm();
  const [activeTab, setActiveTab] = useState('manage');
  const [backups, setBackups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');

  // Restore states
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreUrl, setRestoreUrl] = useState('');
  const [restoreFilename, setRestoreFilename] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [syncConfig, setSyncConfig] = useState<Record<string, string>>({});
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [syncSaving, setSyncSaving] = useState(false);
  const [syncRunning, setSyncRunning] = useState(false);
  const [syncPrivateKey, setSyncPrivateKey] = useState('');
  const [clearSyncPrivateKey, setClearSyncPrivateKey] = useState(false);

  async function loadBackups() {
    setLoading(true);
    try {
      const res = await api.admin.backups.list();
      setBackups(res.items || []);
    } catch {
      setMessage('加载备份列表失败');
    }
    setLoading(false);
  }

  useEffect(() => {
    if (activeTab === 'manage') loadBackups();
    if (activeTab === 'sync') loadSync();
  }, [activeTab]);

  async function loadSync() {
    try {
      const [configRes, statusRes] = await Promise.all([api.admin.config.get(), api.admin.sync.status()]);
      setSyncConfig(configRes.config);
      setSyncStatus(statusRes);
    } catch (e: any) { setMessage(e.message || '加载同步配置失败'); }
  }

  async function saveSync() {
    setSyncSaving(true);
    try {
      const payload = Object.fromEntries(syncConfigKeys.map(key => [key, syncConfig[key] || '']));
      if (syncPrivateKey.trim()) payload.sync_ssh_private_key = syncPrivateKey;
      if (clearSyncPrivateKey) payload.sync_ssh_private_key_clear = 'true';
      await api.admin.config.update(payload);
      setSyncPrivateKey('');
      setClearSyncPrivateKey(false);
      setMessage('跨机同步配置已保存');
      await loadSync();
    } catch (e: any) { setMessage(e.message || '保存同步配置失败'); }
    setSyncSaving(false);
  }

  async function runSync() {
    setSyncRunning(true);
    try {
      const result = await api.admin.sync.run();
      setMessage(result.message || '同步任务已启动');
      window.setTimeout(loadSync, 1000);
    } catch (e: any) { setMessage(e.message || '启动同步失败'); }
    setSyncRunning(false);
  }

  async function handleCreate() {
    setCreating(true);
    setMessage('');
    try {
      const res = await api.admin.backups.create();
      setMessage(`备份创建成功：${res.filename}`);
      await loadBackups();
    } catch (e: any) {
      setMessage(e.message || '创建备份失败');
    }
    setCreating(false);
  }

  async function handleDelete(filename: string) {
    if (!await confirm(`确定要删除备份 ${filename} 吗？`)) return;
    try {
      await api.admin.backups.delete(filename);
      setMessage('已删除');
      await loadBackups();
    } catch (e: any) {
      setMessage(e.message || '删除失败');
    }
  }

  async function handleRestoreUpload() {
    if (!restoreFile) return;
    if (!await confirm('确定要恢复数据吗？此操作将覆盖所有现有数据！')) return;
    setRestoring(true);
    setRestoreMessage('');
    try {
      const res = await api.admin.restore.upload(restoreFile);
      setRestoreMessage(res.message || '恢复完成');
      if (res.warning) setRestoreMessage(prev => `${prev}（${res.warning}）`);
      setRestoreFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e: any) {
      setRestoreMessage(e.message || '恢复失败');
    }
    setRestoring(false);
  }

  async function handleRestoreUrl() {
    if (!restoreUrl.trim()) return;
    if (!await confirm('确定要恢复数据吗？此操作将覆盖所有现有数据！')) return;
    setRestoring(true);
    setRestoreMessage('');
    try {
      const res = await api.admin.restore.url(restoreUrl.trim());
      setRestoreMessage(res.message || '恢复完成');
      if (res.warning) setRestoreMessage(prev => `${prev}（${res.warning}）`);
    } catch (e: any) {
      setRestoreMessage(e.message || '恢复失败');
    }
    setRestoring(false);
  }

  async function handleRestoreLocal() {
    if (!restoreFilename) return;
    if (!await confirm('确定要恢复数据吗？此操作将覆盖所有现有数据！')) return;
    setRestoring(true);
    setRestoreMessage('');
    try {
      const res = await api.admin.restore.local(restoreFilename);
      setRestoreMessage(res.message || '恢复完成');
      if (res.warning) setRestoreMessage(prev => `${prev}（${res.warning}）`);
    } catch (e: any) {
      setRestoreMessage(e.message || '恢复失败');
    }
    setRestoring(false);
  }

  const inputClass = "w-full px-3 py-2.5 rounded-lg text-sm outline-none";
  const inputStyle = { border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>备份与恢复</h1>
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
          {/* ===== Backup Management ===== */}
          {activeTab === 'manage' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    备份文件保存在服务器本地，超过 7 天自动删除
                  </p>
                </div>
                <button onClick={handleCreate} disabled={creating}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
                  style={{ background: 'var(--primary)' }}>
                  <Plus className="w-4 h-4" />
                  {creating ? '创建中...' : '创建备份'}
                </button>
              </div>

              {loading ? (
                <Loading />
              ) : backups.length === 0 ? (
                <div className="text-center py-12" style={{ color: 'var(--text-info)' }}>
                  <HardDrive className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p>暂无备份文件</p>
                  <p className="text-sm mt-1">点击"创建备份"按钮开始</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ color: 'var(--text-info)', borderBottom: '1px solid var(--glass-border)' }}>
                        <th className="text-left py-3 px-3 font-medium">文件名</th>
                        <th className="text-left py-3 px-3 font-medium w-28">大小</th>
                        <th className="text-left py-3 px-3 font-medium w-44">创建时间</th>
                        <th className="text-right py-3 px-3 font-medium w-28">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backups.map((b, i) => (
                        <tr key={b.filename}
                          style={{ borderBottom: i < backups.length - 1 ? '1px solid var(--glass-border)' : 'none' }}>
                          <td className="py-3 px-3" style={{ color: 'var(--text-primary)' }}>
                            <span className="font-mono text-xs">{b.filename}</span>
                          </td>
                          <td className="py-3 px-3" style={{ color: 'var(--text-secondary)' }}>
                            {formatSize(b.size)}
                          </td>
                          <td className="py-3 px-3" style={{ color: 'var(--text-secondary)' }}>
                            {formatTime(b.created_at)}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => api.admin.backups.download(b.filename)}
                                className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
                                title="下载" style={{ color: 'var(--text-info)' }}>
                                <Download className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDelete(b.filename)}
                                className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10"
                                title="删除" style={{ color: 'hsl(0, 60%, 55%)' }}>
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'sync' && (
            <div className="max-w-3xl space-y-6">
              <div className="rounded-xl p-4" style={{ background: 'var(--btn-card-bg)', borderLeft: '3px solid var(--primary)' }}>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>主写、备拉取</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>主服务器生成数据库快照；备服务器通过 rsync/SSH 拉取快照和上传文件。备机请勿执行日常编辑。</p>
              </div>

              <details className="rounded-xl p-4 text-sm" style={{ background: 'var(--btn-card-bg)', color: 'var(--text-secondary)' }}>
                <summary className="cursor-pointer font-medium" style={{ color: 'var(--text-primary)' }}>Docker 主备部署与配置指南</summary>
                <ol className="list-decimal pl-5 mt-3 space-y-2">
                  <li>主、备服务器均部署相同版本，并各自持久化 <code>/data/postgres</code>、<code>/data/uploads</code> 和 <code>/data/backups</code>。</li>
                  <li>两台机器的 <code>.env</code> 必须使用相同的 <code>SYNC_KEY_ENCRYPTION_KEY</code>；可用 <code>openssl rand -base64 32</code> 生成一次后复制到两边，随后重启容器。</li>
                  <li>主机创建仅供同步的 SSH 用户，并把备机对应公钥加入该用户的 <code>authorized_keys</code>。在备机的 <code>data/ssh/known_hosts</code> 固定主机指纹；系统会严格校验，防止连到错误主机。</li>
                  <li>先在主机选择“主服务器”，启用并保存；再在备机选择“备服务器”，填写 <code>用户@主机域名</code>、远程目录和私钥，保存后点“立即执行”验证。私钥只需在备机填写。</li>
                  <li>确认首次同步成功后再设置间隔或每周计划。备机启用同步时会限制业务写入，请只在主机编辑内容。</li>
                </ol>
                <p className="text-xs mt-3" style={{ color: 'var(--text-info)' }}>传输使用 rsync 的断点续传与校验选项；网络中断后，下次任务会继续未完成的文件。</p>
              </details>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={syncConfig.sync_enabled === 'true'} onChange={e => setSyncConfig({ ...syncConfig, sync_enabled: String(e.target.checked) })} />
                  启用跨机同步
                </label>
                <div>
                  <label className="block text-sm mb-1.5" style={{ color: 'var(--text-secondary)' }}>本机角色</label>
                  <Select value={syncConfig.sync_role || 'standby'} onChange={v => setSyncConfig({ ...syncConfig, sync_role: v })} options={[{ value: 'primary', label: '主服务器（生成快照）' }, { value: 'standby', label: '备服务器（拉取并应用）' }]} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1.5" style={{ color: 'var(--text-secondary)' }}>计划类型</label>
                  <Select value={syncConfig.sync_schedule_mode || 'interval'} onChange={v => setSyncConfig({ ...syncConfig, sync_schedule_mode: v })} options={[{ value: 'interval', label: '固定间隔' }, { value: 'weekly', label: '每周计划' }]} />
                </div>
                {syncConfig.sync_schedule_mode !== 'weekly' ? (
                  <div><label className="block text-sm mb-1.5" style={{ color: 'var(--text-secondary)' }}>间隔（分钟，至少 5）</label><input type="number" min="5" max="10080" value={syncConfig.sync_interval_minutes || '60'} onChange={e => setSyncConfig({ ...syncConfig, sync_interval_minutes: e.target.value })} className={inputClass} style={inputStyle} /></div>
                ) : (
                  <div><label className="block text-sm mb-1.5" style={{ color: 'var(--text-secondary)' }}>执行时间</label><input type="time" value={syncConfig.sync_time_of_day || '02:00'} onChange={e => setSyncConfig({ ...syncConfig, sync_time_of_day: e.target.value })} className={inputClass} style={inputStyle} /></div>
                )}
              </div>
              {syncConfig.sync_schedule_mode === 'weekly' && (
                <div><label className="block text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>执行日期</label><div className="flex flex-wrap gap-2">{['日','一','二','三','四','五','六'].map((day, index) => { const days = (syncConfig.sync_weekdays || '1').split(','); const selected = days.includes(String(index)); return <button key={day} onClick={() => { const next = selected ? days.filter(value => value !== String(index)) : [...days, String(index)]; setSyncConfig({ ...syncConfig, sync_weekdays: next.length ? next.sort().join(',') : '1' }); }} className="w-9 h-9 rounded-lg text-sm" style={{ background: selected ? 'var(--primary)' : 'var(--btn-card-bg)', color: selected ? '#fff' : 'var(--text-secondary)' }}>周{day}</button>; })}</div></div>
              )}

              <div className="pt-5 space-y-4" style={{ borderTop: '1px solid var(--glass-border)' }}>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>备机 SSH 拉取配置</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-sm mb-1.5" style={{ color: 'var(--text-secondary)' }}>主机 SSH 目标</label><input value={syncConfig.sync_ssh_target || ''} onChange={e => setSyncConfig({ ...syncConfig, sync_ssh_target: e.target.value })} placeholder="sync@primary.example.com" className={inputClass} style={inputStyle} /><p className="text-xs mt-1" style={{ color: 'var(--text-info)' }}>仅备服务器需要填写。</p></div><div><label className="block text-sm mb-1.5" style={{ color: 'var(--text-secondary)' }}>SSH 端口</label><input type="number" min="1" max="65535" value={syncConfig.sync_ssh_port || '22'} onChange={e => setSyncConfig({ ...syncConfig, sync_ssh_port: e.target.value })} className={inputClass} style={inputStyle} /></div></div>
                <div><label className="block text-sm mb-1.5" style={{ color: 'var(--text-secondary)' }}>SSH 私钥（粘贴后加密保存）</label><textarea value={syncPrivateKey} onChange={e => { setSyncPrivateKey(e.target.value); setClearSyncPrivateKey(false); }} rows={6} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" autoComplete="off" spellCheck={false} className={inputClass} style={{ ...inputStyle, fontFamily: 'monospace', resize: 'vertical' }} /><p className="text-xs mt-1" style={{ color: 'var(--text-info)' }}>{syncStatus?.has_private_key ? '已保存加密私钥；为安全起见不会回显。粘贴新私钥并保存可替换它。' : '私钥仅用于备机拉取，保存时使用服务器环境中的加密主密钥加密。'}</p>{syncStatus?.has_private_key && <label className="inline-flex items-center gap-2 text-xs mt-2" style={{ color: 'var(--text-secondary)' }}><input type="checkbox" checked={clearSyncPrivateKey} onChange={e => setClearSyncPrivateKey(e.target.checked)} />保存时清除已保存的私钥</label>}</div>
                <div><label className="block text-sm mb-1.5" style={{ color: 'var(--text-secondary)' }}>已有私钥文件路径（可选）</label><input value={syncConfig.sync_ssh_key_path || ''} onChange={e => setSyncConfig({ ...syncConfig, sync_ssh_key_path: e.target.value })} placeholder="/run/secrets/tano_sync_ed25519" className={inputClass} style={inputStyle} /><p className="text-xs mt-1" style={{ color: 'var(--text-info)' }}>未保存粘贴私钥时，才会使用此路径。</p></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-sm mb-1.5" style={{ color: 'var(--text-secondary)' }}>主机快照目录</label><input value={syncConfig.sync_remote_backup_dir || '/data/backups/sync'} onChange={e => setSyncConfig({ ...syncConfig, sync_remote_backup_dir: e.target.value })} className={inputClass} style={inputStyle} /><p className="text-xs mt-1" style={{ color: 'var(--text-info)' }}>Docker 通常填写主机上的绝对路径，例如 /srv/tano_blog/data/backups/sync。</p></div><div><label className="block text-sm mb-1.5" style={{ color: 'var(--text-secondary)' }}>主机上传目录</label><input value={syncConfig.sync_remote_upload_dir || '/data/uploads'} onChange={e => setSyncConfig({ ...syncConfig, sync_remote_upload_dir: e.target.value })} className={inputClass} style={inputStyle} /><p className="text-xs mt-1" style={{ color: 'var(--text-info)' }}>Docker 通常填写主机上的绝对路径，例如 /srv/tano_blog/data/uploads。</p></div></div>
                <div><label className="block text-sm mb-1.5" style={{ color: 'var(--text-secondary)' }}>限速（KB/s，0 为不限）</label><input type="number" min="0" value={syncConfig.sync_bandwidth_kbps || '0'} onChange={e => setSyncConfig({ ...syncConfig, sync_bandwidth_kbps: e.target.value })} className={inputClass} style={inputStyle} /></div>
              </div>

              <div className="flex flex-wrap gap-3"><button onClick={saveSync} disabled={syncSaving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-white disabled:opacity-50" style={{ background: 'var(--primary)' }}><Save className="w-4 h-4" />{syncSaving ? '保存中...' : '保存配置'}</button><button onClick={runSync} disabled={syncRunning || syncStatus?.running} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm btn-glass disabled:opacity-50" style={{ color: 'var(--text-primary)' }}><Play className="w-4 h-4" />{syncStatus?.running || syncRunning ? '同步中...' : '立即执行'}</button><button onClick={loadSync} className="p-2 rounded-lg btn-glass" style={{ color: 'var(--text-secondary)' }} title="刷新状态"><RefreshCw className="w-4 h-4" /></button></div>
              {syncStatus && <div className="rounded-xl p-4 text-sm space-y-1" style={{ background: 'var(--btn-card-bg)', color: 'var(--text-secondary)' }}><p>状态：<span style={{ color: syncStatus.last_status === 'success' ? 'var(--color-success)' : 'var(--text-primary)' }}>{syncStatus.running ? '运行中' : (syncStatus.last_status || '未执行')}</span></p><p>SSH 私钥：{syncStatus.has_private_key ? '已加密保存' : (syncConfig.sync_ssh_key_path ? '使用文件路径' : '未配置')}</p><p>最近完成：{syncStatus.last_finished_at ? formatTime(syncStatus.last_finished_at) : '—'}</p><p>快照：{syncStatus.last_snapshot || '—'}</p>{syncStatus.last_message && <p className="break-all">信息：{syncStatus.last_message}</p>}</div>}
            </div>
          )}

          {/* ===== Restore ===== */}
          {activeTab === 'restore' && (
            <div className="space-y-8 max-w-2xl">
              {/* Warning */}
              <div className="px-4 py-3 rounded-lg text-sm flex items-start gap-2"
                style={{ background: 'rgba(255, 100, 100, 0.1)', color: 'hsl(0, 60%, 55%)', border: '1px solid rgba(255, 100, 100, 0.2)' }}>
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>恢复操作将覆盖现有所有数据（文章、评论、配置等）！此操作不可撤销。</span>
              </div>

              {/* Method 1: Upload */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <Upload className="w-4 h-4" />
                  上传文件恢复
                </h3>
                <div className="flex items-center gap-3">
                  <input type="file" accept=".zip" onChange={e => setRestoreFile(e.target.files?.[0] || null)}
                    className="flex-1 text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:text-sm file:font-medium file:cursor-pointer file:border-none file:text-white"
                    style={{ color: 'var(--text-secondary)' }}
                    ref={fileInputRef} />
                  <button onClick={handleRestoreUpload} disabled={!restoreFile || restoring}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors flex-shrink-0"
                    style={{ background: 'hsl(0, 60%, 55%)' }}>
                    <Upload className="w-4 h-4" />
                    {restoring ? '恢复中...' : '恢复'}
                  </button>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--glass-border)' }} />

              {/* Method 2: URL */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <Link className="w-4 h-4" />
                  从 URL 下载恢复
                </h3>
                <div className="flex items-center gap-3">
                  <input type="url" value={restoreUrl} onChange={e => setRestoreUrl(e.target.value)}
                    placeholder="https://example.com/backup.zip"
                    className={inputClass} style={inputStyle} />
                  <button onClick={handleRestoreUrl} disabled={!restoreUrl.trim() || restoring}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors flex-shrink-0"
                    style={{ background: 'hsl(0, 60%, 55%)' }}>
                    <Download className="w-4 h-4" />
                    {restoring ? '恢复中...' : '恢复'}
                  </button>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--glass-border)' }} />

              {/* Method 3: Local */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <FolderOpen className="w-4 h-4" />
                  从本地备份选择恢复
                </h3>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <Select value={restoreFilename} onChange={setRestoreFilename}
                      options={[
                        { value: '', label: '-- 请选择备份文件 --' },
                        ...backups.map(b => ({ value: b.filename, label: `${b.filename} (${formatSize(b.size)})` })),
                      ]} />
                  </div>
                  <button onClick={handleRestoreLocal} disabled={!restoreFilename || restoring}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors flex-shrink-0"
                    style={{ background: 'hsl(0, 60%, 55%)' }}>
                    <FolderOpen className="w-4 h-4" />
                    {restoring ? '恢复中...' : '恢复'}
                  </button>
                </div>
              </div>

              {/* Restore message */}
              {restoreMessage && (
                <div className="text-sm p-3 rounded-lg"
                  style={{
                    color: restoreMessage.includes('失败') ? 'hsl(0, 60%, 55%)' : 'hsl(142, 60%, 50%)',
                    background: restoreMessage.includes('失败')
                      ? 'rgba(255, 100, 100, 0.1)'
                      : 'rgba(100, 200, 100, 0.1)',
                    border: '1px solid ' + (restoreMessage.includes('失败')
                      ? 'rgba(255, 100, 100, 0.2)'
                      : 'rgba(100, 200, 100, 0.2)'),
                  }}>
                  {restoreMessage}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
