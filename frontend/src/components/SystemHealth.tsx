'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { HealthAlert, StorageHealth, SystemMetrics } from '@/lib/system-health-types';
import { requestError } from '@/lib/request-feedback';
import { RequestFeedback } from './RequestFeedback';

const alertCopy: Record<string, { message: string; action: string }> = {
  request_error_rate: {
    message: '请求错误率偏高',
    action: '检查服务日志和数据库连接，并核对近期发布的改动。',
  },
  request_latency: {
    message: '请求响应时间偏长',
    action: '检查慢请求、数据库连接等待，以及正在进行的上传或备份任务。',
  },
  disk_low_uploads: {
    message: '上传磁盘空间不足',
    action: '扩容上传目录所在磁盘，或在确认备份有效后清理不再需要的文件。',
  },
  disk_low_backups: {
    message: '备份磁盘空间不足',
    action: '扩容备份磁盘；清理旧归档前，保留一份已验证可恢复的完整备份。',
  },
  disk_probe_uploads: {
    message: '无法检测上传磁盘容量',
    action: '检查上传目录是否存在、磁盘是否挂载，以及服务账号的目录权限。',
  },
  disk_probe_backups: {
    message: '无法检测备份磁盘容量',
    action: '检查备份目录是否存在、磁盘是否挂载，以及服务账号的目录权限。',
  },
  backup_probe_failed: {
    message: '无法读取已有完整备份',
    action: '修复备份目录权限后重启服务，并创建、验证一份完整备份。',
  },
  backup_failed: {
    message: '最近一次完整备份失败或被取消',
    action: '检查备份状态、服务日志和磁盘余量；修复后重新完整备份，并验证恢复。',
  },
  backup_missing: {
    message: '尚无成功的完整备份记录',
    action: '前往备份管理创建完整备份，并通过隔离恢复演练验证内容。',
  },
  backup_stale: {
    message: '最近的完整备份已超过时效',
    action: '创建并验证一份新的完整备份，同时检查现有的备份计划。',
  },
};
const resultLabels: Record<string, string> = { completed: '完成', failed: '失败', cancelled: '已取消' };

function localizeAlert(alert: HealthAlert) {
  return alertCopy[alert.code] || { message: alert.message || '检测到新的系统告警', action: alert.action || '请检查服务日志和系统配置。' };
}

function diskSpace(storage: StorageHealth) {
  if (storage.error) return '无法读取';
  const gib = storage.available_bytes / 1024 ** 3;
  const size = gib >= 1 ? `${gib.toFixed(1)} GiB` : `${(storage.available_bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${size}（${storage.available_percent.toFixed(1)}%）`;
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '时间未知' : date.toLocaleString('zh-CN', { hour12: false });
}

export default function SystemHealth() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(false);
  const inFlight = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (!active.current || inFlight.current || document.visibilityState !== 'visible') return;
    const controller = new AbortController();
    inFlight.current = controller;
    setLoading(true);
    setError('');
    try {
      const snapshot = await api.admin.metrics(controller.signal);
      if (!active.current || inFlight.current !== controller || controller.signal.aborted) return;
      setMetrics(snapshot);
      setCheckedAt(new Date());
    } catch (cause) {
      if (active.current && inFlight.current === controller && !controller.signal.aborted) {
        setError(requestError(cause, '系统健康检查失败，请重试'));
      }
    } finally {
      if (inFlight.current === controller) {
        inFlight.current = null;
        if (active.current) setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    active.current = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    function updatePolling() {
      clearInterval(timer);
      if (document.visibilityState !== 'visible') return;
      void refresh();
      timer = setInterval(() => { void refresh(); }, 60_000);
    }
    updatePolling();
    document.addEventListener('visibilitychange', updatePolling);
    return () => {
      active.current = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', updatePolling);
      inFlight.current?.abort();
      inFlight.current = null;
    };
  }, [refresh]);

  const idle = metrics?.requests.requests === 0;
  const errorRate = !metrics || idle ? '无流量' : metrics.requests.error_rate === null ? '暂无数据' : `${(metrics.requests.error_rate * 100).toFixed(1)}%`;
  const latency = !metrics || idle ? '无流量' : metrics.requests.p95_ms === null ? '暂无数据' : `${metrics.requests.p95_overflow ? '> ' : '≤ '}${metrics.requests.p95_ms.toLocaleString('zh-CN')} ms`;
  const lastResult = metrics ? (resultLabels[metrics.backup.last_result] || metrics.backup.last_result || '暂无记录') : '';

  return <section aria-label="系统健康" aria-busy={loading} className="glass-card rounded-xl p-5 mb-6">
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>系统健康</h2>
        <p className="text-xs mt-1" style={{ color: 'var(--text-info)' }}>
          最近检查：{checkedAt ? <time dateTime={checkedAt.toISOString()}>{checkedAt.toLocaleString('zh-CN', { hour12: false })}</time> : '尚未成功检查'}
          <span className="ml-2">页面可见时每 60 秒刷新</span>
        </p>
      </div>
      <button type="button" onClick={() => void refresh()} disabled={loading} className="btn-glass px-3 py-1.5 rounded-lg text-xs disabled:opacity-50" style={{ color: 'var(--primary)' }}>
        {loading ? '检查中…' : '刷新'}
      </button>
    </div>

    <RequestFeedback error={error} onRetry={() => void refresh()} pending={loading} />
    {error && metrics && <p className="mb-3 text-xs" style={{ color: 'var(--text-secondary)' }}>当前状态尚未确认，以下保留上次成功检查的数据。</p>}
    {!metrics && <p role="status" className="text-sm" style={{ color: 'var(--text-secondary)' }}>{loading ? '正在读取系统状态…' : '等待成功检查后显示指标。'}</p>}
    {metrics && <>
      <p className="text-xs mb-3" style={{ color: 'var(--text-info)' }}>
        {metrics.requests.window_seconds ? `最近 ${Math.round(metrics.requests.window_seconds / 60)} 分钟` : '当前统计窗口'} · {metrics.requests.requests.toLocaleString('zh-CN')} 次请求 · P95 为响应时间区间估计
      </p>
      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: '5xx错误率', value: errorRate },
          { label: 'P95响应时间', value: latency },
          { label: '上传磁盘余量', value: diskSpace(metrics.storage.uploads) },
          { label: '备份磁盘余量', value: diskSpace(metrics.storage.backups) },
        ].map(metric => <div key={metric.label} className="rounded-lg p-3" style={{ background: 'var(--surface-bg)' }}>
          <dt className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{metric.label}</dt>
          <dd className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}><output aria-label={metric.label}>{metric.value}</output></dd>
        </div>)}
      </dl>
      <div className="flex flex-wrap gap-x-5 gap-y-1 my-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <span>最近完整备份：{metrics.backup.last_success ? dateLabel(metrics.backup.last_success) : '暂无成功记录'}{metrics.backup.success_source === 'archive_mtime' && '（按已有归档时间）'}</span>
        <span>{metrics.backup.running ? '备份或维护任务正在运行' : `最近任务结果：${lastResult}`}</span>
        <a href="/admin/backup" className="underline" style={{ color: 'var(--primary)' }}>备份管理</a>
      </div>
      {metrics.alerts.length === 0 ? <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        {idle ? '当前无流量，暂不评估请求质量；没有其他触发的告警。' : '当前没有触发告警。'}
      </p> : <ul aria-label="系统告警" className="space-y-2">
        {metrics.alerts.map((alert, index) => {
          const copy = localizeAlert(alert);
          const severity = alert.severity === 'critical' || alert.severity === 'error' ? '严重' : alert.severity === 'info' ? '提示' : '注意';
          return <li key={`${alert.code}-${index}`} className="rounded-lg p-3 text-sm" style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)' }}>
            <p className="font-medium" style={{ color: 'var(--color-warning, var(--text-primary))' }}>{severity} · {copy.message}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{copy.action}</p>
          </li>;
        })}
      </ul>}
    </>}
  </section>;
}
