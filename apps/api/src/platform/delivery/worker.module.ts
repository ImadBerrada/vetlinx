import { Module } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { AppointmentsModule } from '../../modules/appointments/appointments.module';
import { NotificationsModule } from '../../modules/notifications/notifications.module';
import { DeliveryWorkerService } from './delivery-worker.service';
import { CredentialsModule } from '../../modules/credentials/credentials.module';
import { IdentityModule } from '../../modules/identity/identity.module';

@Module({
  imports: [
    AppModule,
    AppointmentsModule,
    NotificationsModule,
    CredentialsModule,
    IdentityModule,
  ],
  providers: [DeliveryWorkerService],
})
export class WorkerModule {}
