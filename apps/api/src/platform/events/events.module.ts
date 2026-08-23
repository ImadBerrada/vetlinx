import { Global, Module } from '@nestjs/common';
import { EVENT_PUBLISHER } from './event-publisher.port';
import { OutboxEventPublisher } from './outbox-event.publisher';
import { OUTBOX_WRITER } from './outbox-writer.port';

@Global()
@Module({
  providers: [
    OutboxEventPublisher,
    { provide: EVENT_PUBLISHER, useExisting: OutboxEventPublisher },
    { provide: OUTBOX_WRITER, useExisting: OutboxEventPublisher },
  ],
  exports: [EVENT_PUBLISHER, OUTBOX_WRITER],
})
export class EventsModule {}
