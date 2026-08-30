import { Module } from '@nestjs/common';
import { CredentialsModule } from '../credentials/credentials.module';
import { IdentityModule } from '../identity/identity.module';
import { ProfessionalsModule } from '../professionals/professionals.module';
import { LicensingAdminController } from './licensing-admin.controller';
import { LicensingController } from './licensing.controller';
import { LICENSING_PUBLIC_API } from './licensing.public';
import { LicensingService } from './licensing.service';

@Module({
  imports: [IdentityModule, CredentialsModule, ProfessionalsModule],
  controllers: [LicensingAdminController, LicensingController],
  providers: [
    LicensingService,
    { provide: LICENSING_PUBLIC_API, useExisting: LicensingService },
  ],
  exports: [LICENSING_PUBLIC_API],
})
export class LicensingModule {}
