export interface DomainEvent<TPayload extends Record<string, unknown>> {
  id: string;
  name: string;
  version: number;
  occurredAt: string;
  aggregateId: string;
  correlationId: string;
  causationId?: string;
  payload: TPayload;
}
