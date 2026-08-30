import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../identity/access-token.guard';
import {
  CreateExternalLicenceApplicationDto,
  LinkRequirementCredentialDto,
  PathwaySearchQueryDto,
  UpdateExternalLicenceApplicationDto,
  UpdateLicensingReminderPreferencesDto,
  UpdateRequirementProgressDto,
} from './dto/licensing-professional.dto';
import { LicensingService } from './licensing.service';

@ApiTags('Licensing')
@Controller({ path: 'licensing', version: '1' })
export class LicensingController {
  constructor(private readonly licensing: LicensingService) {}

  @Get('jurisdictions')
  listJurisdictions() {
    return this.licensing.listJurisdictions();
  }

  @Get('pathways')
  listPathways(@Query() query: PathwaySearchQueryDto) {
    return this.licensing.listPathways(query);
  }

  @Get('pathways/:pathwayId')
  getPathway(@Param('pathwayId', new ParseUUIDPipe()) pathwayId: string) {
    return this.licensing.getPathway(pathwayId);
  }

  @Get('pathways/:pathwayId/eligibility')
  @ApiBearerAuth()
  @UseGuards(AccessTokenGuard)
  previewEligibility(
    @Param('pathwayId', new ParseUUIDPipe()) pathwayId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.licensing.previewEligibility(request.user.accountId, pathwayId);
  }

  @Post('pathways/:pathwayId/enroll')
  @ApiBearerAuth()
  @UseGuards(AccessTokenGuard)
  enroll(
    @Param('pathwayId', new ParseUUIDPipe()) pathwayId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.licensing.enroll(
      request.user.accountId,
      pathwayId,
      this.requireIdempotencyKey(idempotencyKey),
      this.correlationId(request),
    );
  }

  @Get('me/enrollments')
  @ApiBearerAuth()
  @UseGuards(AccessTokenGuard)
  listMyEnrollments(@Req() request: AuthenticatedRequest) {
    return this.licensing.listMyEnrollments(request.user.accountId);
  }

  @Get('me/enrollments/:enrollmentId')
  @ApiBearerAuth()
  @UseGuards(AccessTokenGuard)
  getMyEnrollment(
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.licensing.getOwnedEnrollment(
      request.user.accountId,
      enrollmentId,
    );
  }

  @Put('me/enrollments/:enrollmentId/requirements/:requirementId/credential')
  @ApiBearerAuth()
  @UseGuards(AccessTokenGuard)
  linkRequirementCredential(
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
    @Param('requirementId', new ParseUUIDPipe()) requirementId: string,
    @Body() dto: LinkRequirementCredentialDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.licensing.linkCredential(
      request.user.accountId,
      enrollmentId,
      requirementId,
      dto.credentialId,
      this.correlationId(request),
    );
  }

  @Delete('me/enrollments/:enrollmentId/requirements/:requirementId/credential')
  @ApiBearerAuth()
  @UseGuards(AccessTokenGuard)
  unlinkRequirementCredential(
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
    @Param('requirementId', new ParseUUIDPipe()) requirementId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.licensing.unlinkCredential(
      request.user.accountId,
      enrollmentId,
      requirementId,
      this.correlationId(request),
    );
  }

  @Patch('me/enrollments/:enrollmentId/requirements/:requirementId')
  @ApiBearerAuth()
  @UseGuards(AccessTokenGuard)
  updateRequirementProgress(
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
    @Param('requirementId', new ParseUUIDPipe()) requirementId: string,
    @Body() dto: UpdateRequirementProgressDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.licensing.setRequirementInProgress(
      request.user.accountId,
      enrollmentId,
      requirementId,
      dto.note,
      this.correlationId(request),
    );
  }

  @Post('me/enrollments/:enrollmentId/external-application')
  @ApiBearerAuth()
  @UseGuards(AccessTokenGuard)
  createExternalApplication(
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateExternalLicenceApplicationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.licensing.createExternalApplication(
      request.user.accountId,
      enrollmentId,
      dto,
      this.requireIdempotencyKey(idempotencyKey),
      this.correlationId(request),
    );
  }

  @Patch('me/enrollments/:enrollmentId/external-application')
  @ApiBearerAuth()
  @UseGuards(AccessTokenGuard)
  updateExternalApplication(
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
    @Body() dto: UpdateExternalLicenceApplicationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.licensing.updateExternalApplication(
      request.user.accountId,
      enrollmentId,
      dto,
      this.correlationId(request),
    );
  }

  @Post('me/enrollments/:enrollmentId/withdraw')
  @ApiBearerAuth()
  @UseGuards(AccessTokenGuard)
  withdrawEnrollment(
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.licensing.withdrawEnrollment(
      request.user.accountId,
      enrollmentId,
      this.requireIdempotencyKey(idempotencyKey),
      this.correlationId(request),
    );
  }

  @Get('me/reminder-preferences')
  @ApiBearerAuth()
  @UseGuards(AccessTokenGuard)
  getReminderPreferences(@Req() request: AuthenticatedRequest) {
    return this.licensing.getReminderPreferences(request.user.accountId);
  }

  @Patch('me/reminder-preferences')
  @ApiBearerAuth()
  @UseGuards(AccessTokenGuard)
  updateReminderPreferences(
    @Body() dto: UpdateLicensingReminderPreferencesDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.licensing.updateReminderPreferences(
      request.user.accountId,
      dto,
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
