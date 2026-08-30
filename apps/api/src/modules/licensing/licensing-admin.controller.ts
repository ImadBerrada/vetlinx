import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../identity/access-token.guard';
import { RequireSystemRoles } from '../identity/required-roles.decorator';
import { SystemRolesGuard } from '../identity/system-roles.guard';
import {
  CreateLicencePathwayDto,
  CreateLicenceTypeDto,
  CreateLicensingAuthorityDto,
  CreateLicensingJurisdictionDto,
  CreatePathwayVersionDto,
  UpdatePathwayVersionDto,
} from './dto/licensing-admin.dto';
import { LicensingService } from './licensing.service';

@ApiTags('Licensing administration')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard, SystemRolesGuard)
@RequireSystemRoles('LICENSING_CURATOR', 'LICENSING_REVIEWER')
@Controller({ path: 'licensing/admin', version: '1' })
export class LicensingAdminController {
  constructor(private readonly licensing: LicensingService) {}

  @Post('jurisdictions')
  createJurisdiction(
    @Body() dto: CreateLicensingJurisdictionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.licensing.createJurisdiction(
      request.user.accountId,
      dto,
      this.requireIdempotencyKey(idempotencyKey),
      this.correlationId(request),
    );
  }

  @Post('authorities')
  createAuthority(
    @Body() dto: CreateLicensingAuthorityDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.licensing.createAuthority(
      request.user.accountId,
      dto,
      this.requireIdempotencyKey(idempotencyKey),
      this.correlationId(request),
    );
  }

  @Post('licence-types')
  createLicenceType(
    @Body() dto: CreateLicenceTypeDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.licensing.createLicenceType(
      request.user.accountId,
      dto,
      this.requireIdempotencyKey(idempotencyKey),
      this.correlationId(request),
    );
  }

  @Post('pathways')
  createPathway(
    @Body() dto: CreateLicencePathwayDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.licensing.createPathway(
      request.user.accountId,
      dto,
      this.requireIdempotencyKey(idempotencyKey),
      this.correlationId(request),
    );
  }

  @Post('pathways/:pathwayId/versions')
  createPathwayVersion(
    @Param('pathwayId', new ParseUUIDPipe()) pathwayId: string,
    @Body() dto: CreatePathwayVersionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.licensing.createPathwayVersion(
      request.user.accountId,
      pathwayId,
      dto,
      this.requireIdempotencyKey(idempotencyKey),
      this.correlationId(request),
    );
  }

  @Patch('versions/:versionId')
  @HttpCode(200)
  updatePathwayVersion(
    @Param('versionId', new ParseUUIDPipe()) versionId: string,
    @Body() dto: UpdatePathwayVersionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.licensing.updatePathwayVersion(
      request.user.accountId,
      versionId,
      dto,
      this.correlationId(request),
    );
  }

  @Post('versions/:versionId/submit')
  @HttpCode(200)
  submitPathwayVersion(
    @Param('versionId', new ParseUUIDPipe()) versionId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.licensing.submitVersion(
      request.user.accountId,
      versionId,
      this.requireIdempotencyKey(idempotencyKey),
      this.correlationId(request),
    );
  }

  @Post('versions/:versionId/publish')
  @HttpCode(200)
  @RequireSystemRoles('LICENSING_REVIEWER')
  publishPathwayVersion(
    @Param('versionId', new ParseUUIDPipe()) versionId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.licensing.publishVersion(
      request.user.accountId,
      versionId,
      this.requireIdempotencyKey(idempotencyKey),
      this.correlationId(request),
    );
  }

  @Post('versions/:versionId/supersede')
  @HttpCode(200)
  @RequireSystemRoles('LICENSING_REVIEWER')
  supersedePathwayVersion(
    @Param('versionId', new ParseUUIDPipe()) versionId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.licensing.supersedeVersion(
      request.user.accountId,
      versionId,
      this.requireIdempotencyKey(idempotencyKey),
      this.correlationId(request),
    );
  }

  private correlationId(request: AuthenticatedRequest) {
    return request.header('x-correlation-id') || randomUUID();
  }

  private requireIdempotencyKey(value: string | undefined) {
    if (
      !value ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    ) {
      throw new BadRequestException(
        'Idempotency-Key header must contain a valid UUID',
      );
    }
    return value;
  }
}
