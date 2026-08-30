import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { LicensingAdminController } from './licensing-admin.controller';
import { LICENSING_PUBLIC_API } from './licensing.public';
import { LicensingService } from './licensing.service';

@Module({
  imports: [IdentityModule],
  controllers: [LicensingAdminController],
  providers: [
    LicensingService,
    { provide: LICENSING_PUBLIC_API, useExisting: LicensingService },
  ],
  exports: [LICENSING_PUBLIC_API],
})
export class LicensingModule {}
