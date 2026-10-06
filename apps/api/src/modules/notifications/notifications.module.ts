import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NOTIFICATIONS_PUBLIC_API } from './notifications.public';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [IdentityModule, AuditModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    { provide: NOTIFICATIONS_PUBLIC_API, useExisting: NotificationsService },
  ],
  exports: [NOTIFICATIONS_PUBLIC_API],
})
export class NotificationsModule {}
