/**
 * PANOPTES — deterministic, survivable security mediation for LLM agents.
 *
 * Public API. The production surface is the `Observatory` (v2) engine:
 *
 *   import { Observatory, loadPolicy, AuditSink } from 'panoptes-core';
 *
 * The v1 modules (`./v1`) are the research prototype kept for the benchmark
 * harness and regression tests; new integrations should use `Observatory`.
 */

export * from './core/v2';
export { loadPolicy, declarativePolicy, globToRegExp, parseToolName, type PolicyFile, type MatchRule } from './policy-load';
export { JsonlAuditSink, OtelAuditSink, CompositeSink, AuditedSession, type AuditEvent, type AuditSink } from './audit';
export { BENCH_POLICY } from './core/policy';
export { CORPUS } from './corpus';
