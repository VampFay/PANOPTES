/** OpenAPI 3.1 specification for the PANOPTES sidecar. */

import { VERSION } from './version';

const MediationSchema = {
  type: 'object',
  required: ['decision', 'reasons', 'organs'],
  properties: {
    decision: { type: 'string', enum: ['allow', 'deny'] },
    reasons: { type: 'array', items: { type: 'string' } },
    organs: { type: 'array', items: { type: 'string' }, description: 'Organs engaged in this decision' },
    authorityConsult: {
      type: 'object',
      properties: {
        authority: { type: 'string' },
        tool: { type: 'string' },
        args: { type: 'object', additionalProperties: { type: 'string' } },
      },
    },
    remedy: {
      type: 'object',
      description: 'Offered sanitized payload for audience-denied egress',
      properties: { sanitizer: { type: 'string' }, content: { type: 'string' }, note: { type: 'string' } },
    },
  },
} as const;

const ObservationSchema = {
  type: 'object',
  required: ['content', 'injected', 'organs', 'notes'],
  properties: {
    content: { type: 'string' },
    injected: { type: 'boolean', description: 'O5 screen verdict on this output' },
    organs: { type: 'array', items: { type: 'string' } },
    notes: { type: 'array', items: { type: 'string' } },
  },
} as const;

const ErrorSchema = {
  type: 'object',
  required: ['error'],
  properties: { error: { type: 'string' } },
} as const;

export const OPENAPI_SPEC = {
  openapi: '3.1.0',
  info: {
    title: 'PANOPTES sidecar',
    version: VERSION,
    description:
      'Deterministic mediation service for LLM agent tool calls. Every check is reproducible and audited. Bearer auth when configured (--token / PANOPTES_TOKEN).',
    license: { name: 'MIT' },
  },
  servers: [{ url: 'http://localhost:8787', description: 'local sidecar' }],
  tags: [
    { name: 'infra', description: 'Health and discovery' },
    { name: 'sessions', description: 'Session lifecycle' },
    { name: 'mediation', description: 'The decision surface' },
  ],
  paths: {
    '/healthz': {
      get: { tags: ['infra'], summary: 'Liveness', responses: { 200: { description: 'ok' } } },
    },
    '/readyz': {
      get: {
        tags: ['infra'],
        summary: 'Readiness (policy loaded, session count)',
        responses: { 200: { description: 'ok' } },
      },
    },
    '/openapi.json': {
      get: { tags: ['infra'], summary: 'This spec', responses: { 200: { description: 'spec' } } },
    },
    '/v1/sessions': {
      post: {
        tags: ['sessions'],
        summary: 'Create a mediated session',
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  canaries: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Operator-issued canary tokens (survive rotation)',
                  },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'session created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['sessionId', 'canariesEnrolled'],
                  properties: {
                    sessionId: { type: 'string' },
                    canariesEnrolled: { type: 'integer' },
                    boundary: {
                      type: 'object',
                      properties: { trust: { type: 'string' }, audience: { type: 'array', items: { type: 'string' } } },
                    },
                  },
                },
              },
            },
          },
          400: { description: 'invalid JSON', content: { 'application/json': { schema: ErrorSchema } } },
          401: { description: 'unauthorized', content: { 'application/json': { schema: ErrorSchema } } },
        },
      },
    },
    '/v1/sessions/{sessionId}': {
      get: {
        tags: ['sessions'],
        summary: 'Session status (stats, flow label, canary generation)',
        parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'status' }, 404: { description: 'unknown session' } },
      },
    },
    '/v1/sessions/{sessionId}/check': {
      post: {
        tags: ['mediation'],
        summary: 'Mediate a tool call (allow or deny, with reasons and organs)',
        parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['tool'],
                properties: {
                  tool: { type: 'string', example: 'mcp/mail/send' },
                  args: {
                    type: 'object',
                    additionalProperties: { type: 'string' },
                    example: { to: 'recruiter@other.com', body: 'quarterly summary' },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'mediation', content: { 'application/json': { schema: MediationSchema } } },
          400: { description: 'invalid body', content: { 'application/json': { schema: ErrorSchema } } },
          404: { description: 'unknown session' },
        },
      },
    },
    '/v1/sessions/{sessionId}/observe': {
      post: {
        tags: ['mediation'],
        summary: 'Feed a completed tool output back (applies delta, ledger, screen)',
        parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['tool', 'output'],
                properties: {
                  tool: { type: 'string' },
                  args: { type: 'object', additionalProperties: { type: 'string' } },
                  output: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'observation', content: { 'application/json': { schema: ObservationSchema } } },
          400: { description: 'invalid body' },
          404: { description: 'unknown session' },
        },
      },
    },
    '/v1/sessions/{sessionId}/answer': {
      post: {
        tags: ['mediation'],
        summary: 'Check the final answer draft (answer-channel confinement)',
        parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['draft'],
                properties: { draft: { type: 'string' } },
              },
            },
          },
        },
        responses: { 200: { description: 'ok or blocked' }, 400: { description: 'invalid body' } },
      },
    },
    '/v1/sessions/{sessionId}/world': {
      post: {
        tags: ['mediation'],
        summary: 'Enroll world content (canary auto-enrollment on sensitive stores)',
        parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['store', 'content'],
                properties: { store: { type: 'string', example: 'hr' }, content: { type: 'string' } },
              },
            },
          },
        },
        responses: { 200: { description: 'enrolled' }, 400: { description: 'invalid body' } },
      },
    },
    '/v1/sessions/{sessionId}/rotate': {
      post: {
        tags: ['sessions'],
        summary: 'Rotate synthetic canaries (retire auto-enrolled, keep operator seeds)',
        parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'rotation report' } },
      },
    },
    '/v1/sessions/{sessionId}/fault': {
      post: {
        tags: ['sessions'],
        summary: 'Declare a memory integrity fault (session fail-closed)',
        parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'fail-closed' } },
      },
    },
    '/v1/sessions/{sessionId}/audit': {
      get: {
        tags: ['sessions'],
        summary: 'Recent audit events for this session',
        parameters: [
          { name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 200, maximum: 10000 } },
        ],
        responses: { 200: { description: 'events' }, 404: { description: 'unknown session' } },
      },
    },
  },
} as const;
