export type QualityFlag =
  | 'INVALID_TIMESTAMP'
  | 'INVALID_STATUS'
  | 'INVALID_LATENCY'
  | 'MISSING_LATENCY';

export type RawObservation = Record<string, string | undefined>;

export type CleanObservation = {
  service: string;
  timestamp: string;
  agent: string;
  region: string;
  statusCode: number;
  latencyMs: number | null;
  isAvailable: boolean;
  qualityFlags: QualityFlag[];
  sourceKey: string;
  valid: boolean;
};

export type LogicalAvailabilitySummary = {
  totalChecks: number;
  availableChecks: number;
  unavailableChecks: number;
  availabilityPct: number;
};

export function normalizeServiceName(value: string): string {
  return value.trim().replace(/\s+/g, '-').toLowerCase();
}

export function parseTimestamp(raw: string | null | undefined): { value: Date | null; flags: QualityFlag[] } {
  const normalized = String(raw ?? '').trim();

  if (!normalized) {
    return { value: null, flags: ['INVALID_TIMESTAMP'] };
  }

  try {
    if (/^\d+$/.test(normalized)) {
      const epochMs = Number(normalized) * 1000;
      const date = new Date(epochMs);
      if (Number.isNaN(date.getTime())) {
        throw new Error('invalid epoch');
      }
      return { value: date, flags: [] };
    }

    const date = new Date(normalized.includes('Z') ? normalized : `${normalized}Z`);
    if (Number.isNaN(date.getTime())) {
      throw new Error('invalid timestamp');
    }
    return { value: date, flags: [] };
  } catch {
    return { value: null, flags: ['INVALID_TIMESTAMP'] };
  }
}

export function normalizeLatency(raw: string | null | undefined, unit?: string): { valueMs: number | null; flags: QualityFlag[] } {
  const normalizedRaw = String(raw ?? '').trim();
  const latencyUnit = String(unit ?? '').trim().toLowerCase();

  if (!normalizedRaw) {
    return { valueMs: null, flags: ['MISSING_LATENCY'] };
  }

  const timeValue = Number(normalizedRaw);
  if (!Number.isFinite(timeValue)) {
    return { valueMs: null, flags: ['INVALID_LATENCY'] };
  }

  if (timeValue < 0) {
    return { valueMs: null, flags: ['INVALID_LATENCY'] };
  }

  const unitKey = latencyUnit || (normalizedRaw.toLowerCase().includes('ms') ? 'ms' : 's');
  const inMilliseconds = unitKey === 's' ? timeValue * 1000 : timeValue;
  return { valueMs: inMilliseconds, flags: [] };
}

export function normalizeStatusCode(raw: string | number | null | undefined): { statusCode: number; isAvailable: boolean; flags: QualityFlag[] } {
  const value = Number(raw ?? 0);

  if (!Number.isFinite(value)) {
    return { statusCode: 0, isAvailable: false, flags: ['INVALID_STATUS'] };
  }

  const statusCode = Math.trunc(value);
  const flags: QualityFlag[] = statusCode === 999 ? ['INVALID_STATUS'] : [];
  const isAvailable = statusCode >= 200 && statusCode <= 299;

  return { statusCode, isAvailable, flags };
}

export function cleanObservation(row: RawObservation): CleanObservation {
  const service = normalizeServiceName(String(row.service_name ?? row.service ?? '').trim());
  const agent = String(row.agent ?? '').trim();
  const region = String(row.region ?? '').trim();

  const timestampCheck = parseTimestamp(String(row.timestamp ?? ''));
  const latencyCheck = normalizeLatency(String(row.latency ?? ''), String(row.latency_unit ?? ''));
  const statusCheck = normalizeStatusCode(String(row.status_code ?? ''));

  const combined: QualityFlag[] = [
    ...timestampCheck.flags,
    ...latencyCheck.flags,
    ...statusCheck.flags,
  ];
  const qualityFlags = Array.from(new Set(combined)) as QualityFlag[];

  if (!service || !agent || !region || !timestampCheck.value) {
    return {
      service,
      timestamp: '',
      agent,
      region,
      statusCode: statusCheck.statusCode,
      latencyMs: latencyCheck.valueMs,
      isAvailable: statusCheck.isAvailable,
      qualityFlags,
      sourceKey: JSON.stringify({
        service_name: row.service_name,
        service: row.service,
        timestamp: row.timestamp,
        status_code: row.status_code,
        latency: row.latency,
        latency_unit: row.latency_unit,
        agent: row.agent,
        region: row.region,
      }),
      valid: false,
    };
  }

  return {
    service,
    timestamp: timestampCheck.value.toISOString(),
    agent,
    region,
    statusCode: statusCheck.statusCode,
    latencyMs: latencyCheck.valueMs,
    isAvailable: statusCheck.isAvailable,
    qualityFlags,
    sourceKey: JSON.stringify({
      service_name: row.service_name,
      service: row.service,
      timestamp: row.timestamp,
      status_code: row.status_code,
      latency: row.latency,
      latency_unit: row.latency_unit,
      agent: row.agent,
      region: row.region,
    }),
    valid: true,
  };
}

export function dedupeObservations(rows: RawObservation[]): { deduped: RawObservation[]; duplicateCount: number } {
  const seen = new Set<string>();
  const deduped: RawObservation[] = [];
  let duplicateCount = 0;

  for (const row of rows) {
    const key = JSON.stringify({
      service_name: row.service_name,
      service: row.service,
      timestamp: row.timestamp,
      status_code: row.status_code,
      latency: row.latency,
      latency_unit: row.latency_unit,
      agent: row.agent,
      region: row.region,
    });

    if (seen.has(key)) {
      duplicateCount += 1;
      continue;
    }

    seen.add(key);
    deduped.push(row);
  }

  return { deduped, duplicateCount };
}

export function calculateLogicalAvailability(
  observations: CleanObservation[],
  options?: { start?: Date; end?: Date; services?: string[] },
): LogicalAvailabilitySummary {
  const validObservations = observations.filter((observation) => observation.valid);
  const grouped = new Map<string, CleanObservation[]>();

  for (const observation of validObservations) {
    const key = `${observation.service}|${observation.timestamp}`;
    const existing = grouped.get(key) ?? [];
    existing.push(observation);
    grouped.set(key, existing);
  }

  const serviceNames = [...new Set(options?.services ?? validObservations.map((observation) => observation.service))].sort();
  const start = options?.start ? new Date(options.start) : null;
  const end = options?.end ? new Date(options.end) : null;

  if (start && end && serviceNames.length) {
    const expectedKeys = new Set<string>();
    const expectedStart = new Date(start.getTime());
    const intervalMs = 15 * 60 * 1000;

    for (const service of serviceNames) {
      let cursor = new Date(expectedStart.getTime());
      while (cursor <= end) {
        expectedKeys.add(`${service}|${cursor.toISOString()}`);
        cursor = new Date(cursor.getTime() + intervalMs);
      }
    }

    let availableChecks = 0;
    let unavailableChecks = 0;

    for (const key of expectedKeys) {
      const group = grouped.get(key) ?? [];
      const hasSuccessfulAgent = group.some((entry) => entry.isAvailable);
      if (hasSuccessfulAgent) {
        availableChecks += 1;
      } else {
        unavailableChecks += 1;
      }
    }

    const totalChecks = availableChecks + unavailableChecks;
    const availabilityPct = totalChecks === 0 ? 0 : (availableChecks / totalChecks) * 100;

    return { totalChecks, availableChecks, unavailableChecks, availabilityPct };
  }

  let availableChecks = 0;
  let unavailableChecks = 0;

  for (const group of grouped.values()) {
    const hasSuccessfulAgent = group.some((entry) => entry.isAvailable);
    if (hasSuccessfulAgent) {
      availableChecks += 1;
    } else {
      unavailableChecks += 1;
    }
  }

  const totalChecks = availableChecks + unavailableChecks;
  const availabilityPct = totalChecks === 0 ? 0 : (availableChecks / totalChecks) * 100;

  return {
    totalChecks,
    availableChecks,
    unavailableChecks,
    availabilityPct,
  };
}

export function calculateSla(availableChecks: number, totalChecks: number): number {
  if (totalChecks === 0) {
    return 0;
  }
  return (availableChecks / totalChecks) * 100;
}

export function generateExpectedLogicalChecks(start: Date, end: Date): Date[] {
  const result: Date[] = [];
  const intervalMs = 15 * 60 * 1000;
  const cursor = new Date(start.getTime());

  while (cursor <= end) {
    result.push(new Date(cursor.getTime()));
    cursor.setTime(cursor.getTime() + intervalMs);
  }

  return result;
}

export function buildDatasetStats(observations: CleanObservation[]): {
  datasetStart: Date | null;
  datasetEnd: Date | null;
  services: string[];
  totalObservations: number;
  qualityIssueCount: number;
  validObservations: CleanObservation[];
} {
  const valid = observations.filter((entry) => entry.valid);
  const timestamps = valid.map((entry) => new Date(entry.timestamp)).filter((date) => !Number.isNaN(date.getTime()));

  const datasetStart = timestamps.length ? new Date(Math.min(...timestamps.map((date) => date.getTime()))) : null;
  const datasetEnd = timestamps.length ? new Date(Math.max(...timestamps.map((date) => date.getTime()))) : null;

  const services = [...new Set(valid.map((entry) => entry.service))].sort();
  const qualityIssueCount = valid.filter((entry) => entry.qualityFlags.length > 0).length;

  return {
    datasetStart,
    datasetEnd,
    services,
    totalObservations: valid.length,
    qualityIssueCount,
    validObservations: valid,
  };
}

export function computeAverageLatency(observations: CleanObservation[]): number | null {
  const validLatencies = observations
    .map((entry) => entry.latencyMs)
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (!validLatencies.length) {
    return null;
  }

  return validLatencies.reduce((sum, value) => sum + value, 0) / validLatencies.length;
}

export function computeP95Latency(observations: CleanObservation[]): number | null {
  const validLatencies = observations
    .map((entry) => entry.latencyMs)
    .filter((value): value is number => value !== null && Number.isFinite(value))
    .sort((a, b) => a - b);

  if (!validLatencies.length) {
    return null;
  }

  const index = Math.ceil(0.95 * validLatencies.length) - 1;
  return validLatencies[Math.max(0, index)];
}
