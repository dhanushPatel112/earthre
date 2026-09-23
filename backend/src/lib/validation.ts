import { z } from 'zod';

export const CsvRowSchema = z.object({
  service_id: z.string().optional(),
  service_name: z.string().min(1),
  timestamp: z.string().min(1),
  status_code: z.union([z.string(), z.number()]),
  latency: z.union([z.string(), z.number()]).optional(),
  latency_unit: z.string().optional(),
  agent: z.string().min(1),
  region: z.string().min(1),
});

export const UploadSummarySchema = z.object({
  sourceRows: z.number(),
  retainedObservations: z.number(),
  duplicateRows: z.number(),
  qualityIssues: z.number(),
  services: z.array(z.string()),
  datasetStart: z.string().nullable(),
  datasetEnd: z.string().nullable(),
  availabilityPct: z.number().nullable(),
});
