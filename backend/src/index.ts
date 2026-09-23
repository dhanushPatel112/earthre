import { parse } from 'csv-parse/sync';
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { z } from 'zod';

import { healthCheckObservations } from './schema.js';
import {
  buildDatasetStats,
  calculateLogicalAvailability,
  calculateSla,
  cleanObservation,
  computeAverageLatency,
  computeP95Latency,
  dedupeObservations,
  type CleanObservation,
} from './lib/core.js';
import { CsvRowSchema } from './lib/validation.js';

export interface Env {
  DATABASE_URL?: string;
  ALLOWED_ORIGIN?: string;
}

type StoredObservation = CleanObservation & { serviceId: number };
type Database = NeonQueryFunction<false, false>;

const json = (status: number, payload: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  });

const csvFileSchema = z.object({
  file: z.custom<File>((value) => value instanceof File, 'Missing CSV file'),
});

const parseDateParam = (value: string | null, endOfDay = false): Date | null => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const requireDatabase = (env: Env): Database => {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required; this Worker does not use in-memory persistence.');
  }
  return neon<false, false>(env.DATABASE_URL);
};

const parseCsvRows = (text: string) =>
  parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Array<Record<string, string>>;

const OBSERVATION_BATCH_SIZE = 5_000;

const insertObservations = async (
  sql: Database,
  uploadId: number,
  observations: CleanObservation[],
  serviceIds: Map<string, number>,
) => {
  const db = drizzle(sql);

  for (let offset = 0; offset < observations.length; offset += OBSERVATION_BATCH_SIZE) {
    const batch = observations.slice(offset, offset + OBSERVATION_BATCH_SIZE);
    await db.insert(healthCheckObservations).values(
      batch.map((observation) => {
        const serviceId = serviceIds.get(observation.service);
        if (serviceId === undefined) {
          throw new Error(`Failed to resolve service "${observation.service}".`);
        }
        return {
          uploadId,
          serviceId,
          timestamp: new Date(observation.timestamp),
          statusCode: observation.statusCode,
          latencyMs: observation.latencyMs === null ? null : String(observation.latencyMs),
          agent: observation.agent,
          region: observation.region,
          isAvailable: observation.isAvailable,
          qualityFlags: observation.qualityFlags,
        };
      }),
    ).execute();
  }
};

const loadActiveObservations = async (sql: Database): Promise<StoredObservation[]> => {
  const rows = await sql.query(
    `SELECT
       o.timestamp,
       s.name AS service,
       o.status_code AS "statusCode",
       o.latency_ms AS "latencyMs",
       o.agent,
       o.region,
       o.is_available AS "isAvailable",
       o.quality_flags AS "qualityFlags"
     FROM health_check_observations o
     INNER JOIN services s ON s.id = o.service_id
     INNER JOIN uploads u ON u.id = o.upload_id
     WHERE u.is_active = true AND u.status = 'COMPLETED'
     ORDER BY o.timestamp DESC`,
  );

  return rows.map((row) => ({
    service: String(row.service),
    timestamp: new Date(String(row.timestamp)).toISOString(),
    agent: String(row.agent),
    region: String(row.region),
    statusCode: Number(row.statusCode),
    latencyMs: row.latencyMs === null ? null : Number(row.latencyMs),
    isAvailable: Boolean(row.isAvailable),
    qualityFlags: Array.isArray(row.qualityFlags) ? row.qualityFlags : [],
    sourceKey: '',
    valid: true,
    serviceId: Number(row.serviceId ?? 0),
  }));
};

const getActiveUpload = async (sql: Database) => {
  const rows = await sql.query(
    `SELECT
       total_source_rows AS "sourceRows",
       total_cleaned_rows AS "retainedObservations",
       total_duplicate_rows AS "duplicateRows",
       total_quality_issues AS "qualityIssues",
       dataset_start AS "datasetStart",
       dataset_end AS "datasetEnd"
     FROM uploads
     WHERE is_active = true AND status = 'COMPLETED'
     ORDER BY completed_at DESC
     LIMIT 1`,
  );
  return rows[0] ?? null;
};

const buildStats = (observations: StoredObservation[], upload: Record<string, unknown> | undefined) => {
  const dataset = buildDatasetStats(observations);
  const availability = calculateLogicalAvailability(observations, {
    start: dataset.datasetStart ?? undefined,
    end: dataset.datasetEnd ?? undefined,
    services: dataset.services,
  });

  const perService = dataset.services.map((service) => {
    const rows = observations.filter((observation) => observation.service === service);
    const logical = calculateLogicalAvailability(rows, {
      start: dataset.datasetStart ?? undefined,
      end: dataset.datasetEnd ?? undefined,
      services: [service],
    });
    return {
      service,
      availabilityPct: logical.totalChecks ? calculateSla(logical.availableChecks, logical.totalChecks) : 0,
      expectedChecks: logical.totalChecks,
      availableChecks: logical.availableChecks,
      unavailableChecks: logical.unavailableChecks,
      averageLatency: computeAverageLatency(rows),
      p95Latency: computeP95Latency(rows),
    };
  });

  return {
    overall: {
      availabilityPct: availability.totalChecks ? calculateSla(availability.availableChecks, availability.totalChecks) : null,
      totalExpectedLogicalChecks: availability.totalChecks,
      availableLogicalChecks: availability.availableChecks,
      unavailableLogicalChecks: availability.unavailableChecks,
      totalAgentObservations: observations.length,
      dataQualityIssueCount: dataset.qualityIssueCount,
      datasetStart: upload?.datasetStart ?? dataset.datasetStart?.toISOString() ?? null,
      datasetEnd: upload?.datasetEnd ?? dataset.datasetEnd?.toISOString() ?? null,
    },
    perService,
  };
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const configuredOrigin = env.ALLOWED_ORIGIN ?? '*';
    const origin = request.headers.get('Origin');
    const corsOrigin = configuredOrigin === '*' || !origin || configuredOrigin === origin ? configuredOrigin : 'null';
    const baseHeaders = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: baseHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json(200, { ok: true, service: 'earthre-sla-worker', timestamp: new Date().toISOString() }, baseHeaders);
    }

    let processingUploadId: number | null = null;

    try {
      const sql = requireDatabase(env);

      if (url.pathname === '/uploads' && request.method === 'POST') {
        const formData = await request.formData();
        const parsed = csvFileSchema.safeParse({ file: formData.get('file') });
        if (!parsed.success) return json(400, { error: parsed.error.issues[0]?.message ?? 'Missing CSV file' }, baseHeaders);

        const file = parsed.data.file;
        if (!file.name.toLowerCase().endsWith('.csv')) return json(400, { error: 'Only .csv files are supported.' }, baseHeaders);
        if (file.size > 10 * 1024 * 1024) return json(413, { error: 'File exceeds the 10MB size limit.' }, baseHeaders);

        const rows = parseCsvRows(await file.text());
        if (!rows.length) return json(400, { error: 'CSV is empty or malformed.' }, baseHeaders);
        if (rows.some((row) => !CsvRowSchema.safeParse(row).success)) {
          return json(400, { error: 'CSV contains rows that do not match the required monitoring schema.' }, baseHeaders);
        }

        const { deduped, duplicateCount } = dedupeObservations(rows);
        const cleaned = deduped
          .map((row) => cleanObservation(row))
          .filter((observation) => observation.valid);
        const dataset = buildDatasetStats(cleaned);
        const upload = await sql.query(
          `INSERT INTO uploads
            (original_filename, status, started_at, total_source_rows, total_duplicate_rows, is_active)
           VALUES ($1, 'PROCESSING', NOW(), $2, $3, false)
           RETURNING id`,
          [file.name || 'upload.csv', rows.length, duplicateCount],
        );
        const uploadId = Number(upload[0]?.id);
        if (!uploadId) throw new Error('Failed to create upload record.');
        processingUploadId = uploadId;

        const serviceRows = await sql.query(
          `INSERT INTO services (name)
           SELECT DISTINCT name FROM unnest($1::text[]) AS names(name)
           ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
           RETURNING id, name`,
          [dataset.services],
        );
        const serviceIds = new Map(serviceRows.map((row) => [String(row.name), Number(row.id)]));
        await insertObservations(sql, uploadId, cleaned, serviceIds);

        const availability = calculateLogicalAvailability(cleaned, {
          start: dataset.datasetStart ?? undefined,
          end: dataset.datasetEnd ?? undefined,
          services: dataset.services,
        });
        const summary = {
          sourceRows: rows.length,
          retainedObservations: dataset.totalObservations,
          duplicateRows: duplicateCount,
          qualityIssues: dataset.qualityIssueCount,
          services: dataset.services,
          datasetStart: dataset.datasetStart?.toISOString() ?? null,
          datasetEnd: dataset.datasetEnd?.toISOString() ?? null,
          availabilityPct: availability.totalChecks ? calculateSla(availability.availableChecks, availability.totalChecks) : null,
        };

        await sql.query(
          `WITH deactivated AS (
             UPDATE uploads
             SET is_active = false
             WHERE is_active = true AND id <> $5
           )
           UPDATE uploads SET
             status = 'COMPLETED',
             completed_at = NOW(),
             total_cleaned_rows = $1,
             total_quality_issues = $2,
             dataset_start = $3,
             dataset_end = $4,
             is_active = true
           WHERE id = $5`,
          [summary.retainedObservations, summary.qualityIssues, summary.datasetStart, summary.datasetEnd, uploadId],
        );

        return json(200, { message: 'Upload completed', ...summary }, baseHeaders);
      }

      if (url.pathname === '/dashboard/stats' && request.method === 'GET') {
        const [observations, upload] = await Promise.all([loadActiveObservations(sql), getActiveUpload(sql)]);
        return json(200, buildStats(observations, upload as Record<string, unknown> | undefined), baseHeaders);
      }

      if (url.pathname === '/logs' && request.method === 'GET') {
        const from = parseDateParam(url.searchParams.get('from'));
        const to = parseDateParam(url.searchParams.get('to'), true);
        const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? '50') || 50));
        const offset = (page - 1) * limit;
        const conditions = ['u.is_active = true', 'u.status = \'COMPLETED\''];
        const values: unknown[] = [];
        if (from) {
          values.push(from.toISOString());
          conditions.push(`o.timestamp >= $${values.length}`);
        }
        if (to) {
          values.push(to.toISOString());
          conditions.push(`o.timestamp <= $${values.length}`);
        }
        values.push(limit, offset);
        const limitParam = values.length - 1;
        const pageParam = values.length;
        const rows = await sql.query(
          `SELECT
             o.timestamp,
             s.name AS service,
             o.status_code AS status,
             o.is_available AS availability,
             o.latency_ms AS latency,
             o.agent,
             o.region,
             o.quality_flags AS quality
           FROM health_check_observations o
           INNER JOIN services s ON s.id = o.service_id
           INNER JOIN uploads u ON u.id = o.upload_id
           WHERE ${conditions.join(' AND ')}
           ORDER BY o.timestamp DESC
           LIMIT $${limitParam} OFFSET $${pageParam}`,
          values,
        );
        const countValues = values.slice(0, values.length - 2);
        const countRows = await sql.query(
          `SELECT COUNT(*)::int AS total
           FROM health_check_observations o
           INNER JOIN uploads u ON u.id = o.upload_id
           WHERE ${conditions.join(' AND ')}`,
          countValues,
        );
        return json(200, {
          items: rows.map((row) => ({
            timestamp: new Date(String(row.timestamp)).toISOString(),
            service: String(row.service),
            status: Number(row.status),
            availability: Boolean(row.availability) ? 'available' : 'unavailable',
            latency: row.latency === null ? null : Number(row.latency),
            agent: String(row.agent),
            region: String(row.region),
            quality: Array.isArray(row.quality) ? row.quality : [],
          })),
          page,
          pageSize: limit,
          total: Number(countRows[0]?.total ?? 0),
        }, baseHeaders);
      }

      return json(404, { error: 'Not found' }, baseHeaders);
    } catch (error) {
      if (processingUploadId !== null && env.DATABASE_URL) {
        try {
          await requireDatabase(env).query(
            `UPDATE uploads
             SET status = 'FAILED', completed_at = NOW(), is_active = false
             WHERE id = $1`,
            [processingUploadId],
          );
        } catch (failureUpdateError) {
          console.error('Failed to mark upload as FAILED', failureUpdateError);
        }
      }
      return json(500, { error: error instanceof Error ? error.message : 'Request failed.' }, baseHeaders);
    }
  },
};
