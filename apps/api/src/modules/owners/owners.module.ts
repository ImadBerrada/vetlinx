import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { OwnersController } from './owners.controller';
import { OwnersService } from './owners.service';
import { OWNERS_PUBLIC_API } from './owners.public';

@Module({
  imports: [IdentityModule],
  controllers: [OwnersController],
  providers: [
    OwnersService,
    { provide: OWNERS_PUBLIC_API, useExisting: OwnersService },
  ],
  exports: [OWNERS_PUBLIC_API],
})
export class OwnersModule {}
