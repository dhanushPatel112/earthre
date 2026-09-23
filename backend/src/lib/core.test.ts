import { describe, expect, it } from 'vitest';
import {
  calculateLogicalAvailability,
  calculateMonthlyAvailability,
  calculateSla,
  buildDatasetStats,
  cleanObservation,
  dedupeObservations,
  normalizeLatency,
  normalizeStatusCode,
  parseTimestamp,
} from './core.js';

describe('timestamp normalization', () => {
  it('converts ISO timestamps to UTC', () => {
    const { value } = parseTimestamp('2025-05-13T12:45:00Z');
    expect(value?.toISOString()).toBe('2025-05-13T12:45:00.000Z');
  });

  it('converts unix epoch seconds to UTC', () => {
    const { value } = parseTimestamp('1746938700');
    expect(value?.toISOString()).toBe('2025-05-11T04:45:00.000Z');
  });
});

describe('latency normalization', () => {
  it('normalizes milliseconds to milliseconds', () => {
    const { valueMs } = normalizeLatency('500', 'ms');
    expect(valueMs).toBe(500);
  });

  it('normalizes seconds to milliseconds', () => {
    const { valueMs } = normalizeLatency('0.5', 's');
    expect(valueMs).toBe(500);
  });

  it('marks negative latency invalid and nulls it out', () => {
    const { valueMs, flags } = normalizeLatency('-286', 'ms');
    expect(valueMs).toBeNull();
    expect(flags).toContain('INVALID_LATENCY');
  });

  it('marks missing latency as MISSING_LATENCY', () => {
    const { valueMs, flags } = normalizeLatency('', 'ms');
    expect(valueMs).toBeNull();
    expect(flags).toContain('MISSING_LATENCY');
  });
});

describe('status and availability', () => {
  it.each([
    ['200', true],
    ['299', true],
    ['500', false],
    ['999', false],
  ])('normalizes %s to availability %s', (value, expected) => {
    const { statusCode, isAvailable, flags } = normalizeStatusCode(value);
    expect(statusCode).toBe(Number(value));
    expect(isAvailable).toBe(expected);
    if (value === '999') {
      expect(flags).toContain('INVALID_STATUS');
    }
  });
});

describe('duplicate and logical check handling', () => {
  it('removes exact duplicates and retains distinct agent observations', () => {
    const rows = [
      { service_name: 'auth-api', timestamp: '2025-05-08T00:00:00Z', status_code: '200', latency: '200', latency_unit: 'ms', agent: 'agent-1', region: 'ap-south-1' },
      { service_name: 'auth-api', timestamp: '2025-05-08T00:00:00Z', status_code: '200', latency: '200', latency_unit: 'ms', agent: 'agent-1', region: 'ap-south-1' },
      { service_name: 'auth-api', timestamp: '2025-05-08T00:00:00Z', status_code: '500', latency: '200', latency_unit: 'ms', agent: 'agent-2', region: 'ap-south-1' },
    ];

    const { deduped, duplicateCount } = dedupeObservations(rows);
    expect(duplicateCount).toBe(1);
    expect(deduped).toHaveLength(2);
  });

  it('summarizes logical availability by UTC month', () => {
    const observations = [
      cleanObservation({ service_name: 'auth-api', timestamp: '2025-05-31T23:45:00Z', status_code: '200', latency: '120', latency_unit: 'ms', agent: 'agent-1', region: 'ap-south-1' }),
      cleanObservation({ service_name: 'auth-api', timestamp: '2025-06-01T00:00:00Z', status_code: '500', latency: '120', latency_unit: 'ms', agent: 'agent-1', region: 'ap-south-1' }),
    ];

    expect(calculateMonthlyAvailability(observations)).toMatchObject([
      { month: '2025-05', totalChecks: 1, availableChecks: 1, availabilityPct: 100 },
      { month: '2025-06', totalChecks: 1, unavailableChecks: 1, availabilityPct: 0 },
    ]);
  });

  it('treats a logical check as available when at least one agent succeeds', () => {
    const observations = [
      cleanObservation({ service_name: 'auth-api', timestamp: '2025-05-08T00:00:00Z', status_code: '200', latency: '120', latency_unit: 'ms', agent: 'agent-1', region: 'ap-south-1' }),
      cleanObservation({ service_name: 'auth-api', timestamp: '2025-05-08T00:00:00Z', status_code: '500', latency: '420', latency_unit: 'ms', agent: 'agent-2', region: 'ap-south-1' }),
    ];

    const summary = calculateLogicalAvailability(observations);
    expect(summary.totalChecks).toBe(1);
    expect(summary.availableChecks).toBe(1);
    expect(summary.unavailableChecks).toBe(0);
  });

  it('treats a logical check as unavailable when all agents fail', () => {
    const observations = [
      cleanObservation({ service_name: 'auth-api', timestamp: '2025-05-08T00:00:00Z', status_code: '500', latency: '420', latency_unit: 'ms', agent: 'agent-1', region: 'ap-south-1' }),
      cleanObservation({ service_name: 'auth-api', timestamp: '2025-05-08T00:00:00Z', status_code: '503', latency: '260', latency_unit: 'ms', agent: 'agent-2', region: 'ap-south-1' }),
    ];

    const summary = calculateLogicalAvailability(observations);
    expect(summary.availableChecks).toBe(0);
    expect(summary.unavailableChecks).toBe(1);
  });

  it('counts missing logical checks as unavailable in the SLA denominator', () => {
    const summary = calculateLogicalAvailability([
      cleanObservation({ service_name: 'auth-api', timestamp: '2025-05-08T00:00:00Z', status_code: '200', latency: '120', latency_unit: 'ms', agent: 'agent-1', region: 'ap-south-1' }),
    ]);

    expect(summary.totalChecks).toBe(1);
    expect(summary.availableChecks).toBe(1);
    expect(calculateSla(1, 2)).toBeCloseTo(50, 10);
  });
});

describe('quality issue accounting', () => {
  it('retains usable observations with quality flags', () => {
    const observation = cleanObservation({
      service_name: 'auth-api',
      timestamp: '2025-05-08T00:00:00Z',
      status_code: '999',
      latency: '',
      latency_unit: 'ms',
      agent: 'agent-1',
      region: 'ap-south-1',
    });

    expect(observation.valid).toBe(true);
    expect(observation.latencyMs).toBeNull();
    expect(observation.qualityFlags).toEqual(['MISSING_LATENCY', 'INVALID_STATUS']);
    expect(buildDatasetStats([observation])).toMatchObject({
      totalObservations: 1,
      qualityIssueCount: 1,
    });
  });

  it('does not count invalid observations that are not persisted', () => {
    const observation = cleanObservation({
      service_name: 'auth-api',
      timestamp: 'not-a-timestamp',
      status_code: '200',
      latency: '120',
      latency_unit: 'ms',
      agent: 'agent-1',
      region: 'ap-south-1',
    });

    expect(observation.valid).toBe(false);
    expect(buildDatasetStats([observation])).toMatchObject({
      totalObservations: 0,
      qualityIssueCount: 0,
    });
  });
});
