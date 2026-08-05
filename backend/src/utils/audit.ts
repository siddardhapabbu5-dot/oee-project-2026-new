import type { Request } from 'express';
import { prisma } from '../config/prisma.js';

export async function writeAuditLog(params: {
  req?: Request;
  action: string;
  entity: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}) {
  const { req, action, entity, entityId, before, after } = params;
  await prisma.auditLog.create({
    data: {
      actorId: req?.user?.id,
      action,
      entity,
      entityId,
      before: before ? (before as object) : undefined,
      after: after ? (after as object) : undefined,
      ipAddress: req?.ip,
      userAgent: req?.headers['user-agent'],
    },
  });
}
