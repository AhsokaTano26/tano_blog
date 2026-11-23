import type { HealthAlert, StorageHealth, SystemMetrics } from './system-health-types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStorageHealth(value: unknown): value is StorageHealth {
  return isRecord(value)
    && isNumber(value.available_bytes)
    && isNumber(value.available_percent)
    && (value.total_bytes === undefined || isNumber(value.total_bytes))
    && (value.error === undefined || typeof value.error === 'string');
}

function isHealthAlert(value: unknown): value is HealthAlert {
  return isRecord(value)
    && typeof value.code === 'string'
    && typeof value.severity === 'string'
    && typeof value.message === 'string'
    && typeof value.action === 'string';
}

function isSystemMetrics(value: unknown): value is SystemMetrics {
  if (!isRecord(value)) return false;
  const { requests, storage, backup, alerts } = value;
  return isRecord(requests)
    && isNumber(requests.requests)
    && (requests.error_rate === null || isNumber(requests.error_rate))
    && (requests.p95_ms === null || isNumber(requests.p95_ms))
    && typeof requests.p95_overflow === 'boolean'
    && (requests.window_seconds === undefined || isNumber(requests.window_seconds))
    && isRecord(storage)
    && isStorageHealth(storage.uploads)
    && isStorageHealth(storage.backups)
    && isRecord(backup)
    && typeof backup.running === 'boolean'
    && (backup.last_success === null || typeof backup.last_success === 'string')
    && typeof backup.last_result === 'string'
    && (backup.kind === undefined || typeof backup.kind === 'string')
    && (backup.success_source === undefined || typeof backup.success_source === 'string')
    && Array.isArray(alerts)
    && alerts.every(isHealthAlert);
}

export function parseSystemMetrics(value: unknown): SystemMetrics {
  if (!isSystemMetrics(value)) throw new Error('系统健康数据不完整或格式异常，请重试');
  return value;
}
