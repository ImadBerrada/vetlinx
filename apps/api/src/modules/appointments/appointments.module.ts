import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { OwnersModule } from '../owners/owners.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { AppointmentRemindersService } from './appointment-reminders.service';
import { SchedulingService } from './scheduling.service';
import { SchedulingController } from './scheduling.controller';

@Module({
  imports: [
    IdentityModule,
    OwnersModule,
    OrganizationsModule,
    NotificationsModule,
  ],
  controllers: [AppointmentsController, SchedulingController],
  providers: [
    AppointmentsService,
    AppointmentRemindersService,
    SchedulingService,
  ],
  exports: [AppointmentRemindersService, SchedulingService],
})
export class AppointmentsModule {}
