/**
 * Canonical object endpoints — DOMAIN-scoped, full commit path (ADR-P0-08),
 * outbox event emitted atomically on create/correct (published after commit).
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { PipelineService } from '../pipeline/pipeline.service.js';
import { newId } from '../shared/ids.js';
import { ObjectsCapability } from '../shared/capabilities.js';
import type { EyeRequest } from '../pipeline/http.js';
import { ObjectsService, type CreateObjectInput } from './objects.service.js';

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) {
    throw new HttpException(errorBody('EYE_REQ_001', req.eyeCorrelationId ?? 'unknown'), 400);
  }
  return { envelope, principal };
}

@Controller('/v1/tenants/:tenantId/domains/:domainId/objects')
export class ObjectsController {
  constructor(
    private readonly pipeline: PipelineService,
    private readonly objects: ObjectsService,
  ) {}

  @Post()
  async create(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: CreateObjectInput },
  ) {
    const { envelope, principal } = ctx(req);
    // Gate-2.2 C6: target id generated before the capability is minted.
    const objectIdToCreate = newId();
    const route = {
      scope: 'DOMAIN' as const, tenantId, domainId,
      action: 'objects.create', objectType: body.payload?.objectType ?? null, objectId: objectIdToCreate,
    };
    const input = body.payload;
    // Gate-2.1 §7: a controller edge never rejects an AUTHENTICATED request
    // without durable sanitized evidence.
    if (input === undefined) {
      await this.pipeline.rejectAuthenticatedRequest(
        envelope, principal, route, 'EYE-REQ-001', 'payload is required', 400,
      );
    }
    const out = await this.pipeline.write(envelope, principal, route, ObjectsCapability.write, async (tx, c) => {
      const row = await this.objects.createObject(
        tx, c, `principal:${principal.principalId}`, envelope.correlation_id,
        input as CreateObjectInput, objectIdToCreate,
      );
      return {
        result: row,
        targetType: row.object_type,
        targetId: row.object_id,
        targetVersion: String(row.object_version),
        outboxEvent: {
          eventType: 'IntelligenceObjectAdmitted',
          payload: { object_id: row.object_id, object_type: row.object_type, object_version: Number(row.object_version) },
        },
      };
    });
    return { object: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  @Post('/:objectId/correct')
  async correct(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Param('objectId') objectId: string,
    @Body() body: { payload?: { expectedVersion?: number; correction?: CreateObjectInput } },
  ) {
    const { envelope, principal } = ctx(req);
    const expectedVersion = body.payload?.expectedVersion;
    const correction = body.payload?.correction;
    const route = {
      scope: 'DOMAIN' as const, tenantId, domainId,
      action: 'objects.correct', objectType: correction?.objectType ?? null, objectId,
    };
    if (typeof expectedVersion !== 'number' || correction === undefined) {
      await this.pipeline.rejectAuthenticatedRequest(
        envelope, principal, route, 'EYE-REQ-001', 'expectedVersion + correction required', 400,
      );
    }
    const out = await this.pipeline.write(envelope, principal, route, ObjectsCapability.write, async (tx, c) => {
      const row = await this.objects.correctObject(
        tx, c, `principal:${principal.principalId}`, envelope.correlation_id, objectId,
        expectedVersion as number, correction as CreateObjectInput,
      );
      return {
        result: row,
        targetType: row.object_type,
        targetId: row.object_id,
        targetVersion: String(row.object_version),
        outboxEvent: {
          eventType: 'IntelligenceObjectCorrected',
          payload: {
            object_id: row.object_id,
            object_version: Number(row.object_version),
            correction_of: `${objectId}@${expectedVersion}`,
          },
        },
      };
    });
    return { object: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  @Post('/list')
  async list(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: { objectType?: string; limit?: number } },
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, {
      scope: 'DOMAIN', tenantId, domainId,
      action: 'objects.read', objectType: body.payload?.objectType ?? null, objectId: null,
    }, ObjectsCapability.read, async (tx) => this.objects.listObjects(tx, body.payload?.objectType ?? null, body.payload?.limit ?? 50));
    return { objects: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  @Post('/:objectId/get')
  async get(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Param('objectId') objectId: string,
    @Body() body: { payload?: { knownAt?: string; history?: boolean } },
  ) {
    const { envelope, principal } = ctx(req);
    const knownAt = body.payload?.knownAt;
    const wantHistory = body.payload?.history === true;
    const out = await this.pipeline.consequentialRead(envelope, principal, {
      scope: 'DOMAIN', tenantId, domainId,
      action: 'objects.read', objectType: null, objectId,
    }, ObjectsCapability.read, async (tx) => {
      if (wantHistory) return { history: await this.objects.versionHistory(tx, objectId) };
      if (knownAt !== undefined) {
        return { object: await this.objects.getKnownAt(tx, objectId, knownAt, envelope.correlation_id), as_of: knownAt };
      }
      return { object: await this.objects.getCurrent(tx, objectId, envelope.correlation_id) };
    });
    return { ...(out.result as Record<string, unknown>), receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }
}
