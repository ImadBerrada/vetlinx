import type { DomainEvent } from './domain-event';

export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');

export interface EventPublisher {
  publish(
    events: ReadonlyArray<DomainEvent<Record<string, unknown>>>,
  ): Promise<void>;
}
