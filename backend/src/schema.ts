import { boolean, integer, jsonb, numeric, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const uploads = pgTable('uploads', {
  id: serial('id').primaryKey(),
  originalFilename: text('original_filename').notNull(),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  status: text('status', { enum: ['PROCESSING', 'COMPLETED', 'FAILED'] }).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  totalSourceRows: integer('total_source_rows').notNull().default(0),
  totalCleanedRows: integer('total_cleaned_rows').notNull().default(0),
  totalDuplicateRows: integer('total_duplicate_rows').notNull().default(0),
  totalQualityIssues: integer('total_quality_issues').notNull().default(0),
  datasetStart: timestamp('dataset_start', { withTimezone: true }),
  datasetEnd: timestamp('dataset_end', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
});

export const services = pgTable('services', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const healthCheckObservations = pgTable('health_check_observations', {
  id: serial('id').primaryKey(),
  uploadId: integer('upload_id').notNull(),
  serviceId: integer('service_id').notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  statusCode: integer('status_code').notNull(),
  latencyMs: numeric('latency_ms'),
  agent: text('agent').notNull(),
  region: text('region').notNull(),
  isAvailable: boolean('is_available').notNull(),
  qualityFlags: jsonb('quality_flags').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
