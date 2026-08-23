export interface AuditEntry {
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  occurredAt: string;
  correlationId: string;
  reason?: string;
  changes?: Record<string, unknown>;
}
