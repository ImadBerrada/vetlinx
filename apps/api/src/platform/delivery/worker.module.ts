import { Module } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { AppointmentsModule } from '../../modules/appointments/appointments.module';
import { NotificationsModule } from '../../modules/notifications/notifications.module';
import { DeliveryWorkerService } from './delivery-worker.service';

@Module({
  imports: [AppModule, AppointmentsModule, NotificationsModule],
  providers: [DeliveryWorkerService],
})
export class WorkerModule {}
