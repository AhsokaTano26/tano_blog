export interface StorageHealth {
  available_bytes: number;
  available_percent: number;
  total_bytes?: number;
  error?: string;
}

export interface HealthAlert {
  code: string;
  severity: string;
  message: string;
  action: string;
}

export interface SystemMetrics {
  requests: {
    requests: number;
    error_rate: number | null;
    p95_ms: number | null;
    p95_overflow: boolean;
    window_seconds?: number;
  };
  storage: { uploads: StorageHealth; backups: StorageHealth };
  backup: {
    running: boolean;
    last_success: string | null;
    last_result: string;
    kind?: string;
    success_source?: string;
  };
  alerts: HealthAlert[];
}
