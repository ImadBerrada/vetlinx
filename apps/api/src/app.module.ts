import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './modules/audit/audit.module';
import { CredentialsModule } from './modules/credentials/credentials.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PlatformModule } from './modules/platform/platform.module';
import { ProfessionalsModule } from './modules/professionals/professionals.module';
import { VerificationModule } from './modules/verification/verification.module';
import { RecruitmentModule } from './modules/recruitment/recruitment.module';
import { PortfolioModule } from './modules/portfolio/portfolio.module';
import { validateEnvironment } from './platform/config/environment';
import { EventsModule } from './platform/events/events.module';
import { PersistenceModule } from './platform/persistence/persistence.module';
import { OwnersModule } from './modules/owners/owners.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { DeliveryModule } from './platform/delivery/delivery.module';
import { IdentitySecurityModule } from './modules/identity-security/identity-security.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
    }),
    PersistenceModule,
    EventsModule,
    DeliveryModule,
    HealthModule,
    PlatformModule,
    IdentityModule,
    IdentitySecurityModule,
    ProfessionalsModule,
    CredentialsModule,
    VerificationModule,
    NotificationsModule,
    OrganizationsModule,
    RecruitmentModule,
    PortfolioModule,
    OwnersModule,
    AppointmentsModule,
    AuditModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
