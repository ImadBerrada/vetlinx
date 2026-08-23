import { Module } from '@nestjs/common';
import { PrivateFilesModule } from '../../platform/files/private-files.module';
import { IdentityModule } from '../identity/identity.module';
import { OrganizationReviewController } from './organization-review.controller';
import { OrganizationsController } from './organizations.controller';
import { ORGANIZATIONS_PUBLIC_API } from './organizations.public';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [IdentityModule, PrivateFilesModule],
  controllers: [OrganizationsController, OrganizationReviewController],
  providers: [
    OrganizationsService,
    { provide: ORGANIZATIONS_PUBLIC_API, useExisting: OrganizationsService },
  ],
  exports: [ORGANIZATIONS_PUBLIC_API],
})
export class OrganizationsModule {}
