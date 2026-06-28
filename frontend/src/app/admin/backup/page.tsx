'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { Download, Upload, Trash2, Plus, Link, FolderOpen, AlertTriangle, HardDrive } from 'lucide-react';
import { Loading } from '@/components/Loading';

const tabs = [
  { key: 'manage', label: '备份管理', icon: HardDrive },
  { key: 'restore', label: '数据恢复', icon: Upload },
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
  }, [activeTab]);

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
    if (!confirm(`确定要删除备份 ${filename} 吗？`)) return;
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
    if (!confirm('确定要恢复数据吗？此操作将覆盖所有现有数据！')) return;
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
    if (!confirm('确定要恢复数据吗？此操作将覆盖所有现有数据！')) return;
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
    if (!confirm('确定要恢复数据吗？此操作将覆盖所有现有数据！')) return;
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
                  <select value={restoreFilename} onChange={e => setRestoreFilename(e.target.value)}
                    className={inputClass} style={inputStyle}>
                    <option value="">-- 请选择备份文件 --</option>
                    {backups.map(b => (
                      <option key={b.filename} value={b.filename}>
                        {b.filename} ({formatSize(b.size)})
                      </option>
                    ))}
                  </select>
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
