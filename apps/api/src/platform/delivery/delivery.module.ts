import { Global, Module } from '@nestjs/common';
import { MailQueueService } from './mail-queue.service';
import { MailTransportService } from './mail-transport.service';
import { DeliveryOperationsController } from './delivery-operations.controller';
import { IdentityModule } from '../../modules/identity/identity.module';
import { AuditModule } from '../../modules/audit/audit.module';

@Global()
@Module({
  imports: [IdentityModule, AuditModule],
  controllers: [DeliveryOperationsController],
  providers: [MailQueueService, MailTransportService],
  exports: [MailQueueService, MailTransportService],
})
export class DeliveryModule {}
