import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../identity/access-token.guard';
import { RequireSystemRoles } from '../identity/required-roles.decorator';
import { SystemRolesGuard } from '../identity/system-roles.guard';
import {
  OrganizationDecisionNoteDto,
  OrganizationDecisionReasonDto,
} from './dto/organization.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('Organization reviewer operations')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard, SystemRolesGuard)
@RequireSystemRoles('REVIEWER', 'OPERATIONS_ADMIN')
@Controller({ path: 'organization-reviews', version: '1' })
export class OrganizationReviewController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  listQueue() {
    return this.organizations.listReviewQueue();
  }

  @Get(':requestId')
  getReview(@Param('requestId', new ParseUUIDPipe()) requestId: string) {
    return this.organizations.getReview(requestId);
  }

  @Post(':requestId/start')
  @HttpCode(200)
  start(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.organizations.startReview(
      request.user.accountId,
      requestId,
      this.correlationId(request),
    );
  }

  @Post(':requestId/request-information')
  @HttpCode(200)
  requestInformation(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() dto: OrganizationDecisionReasonDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.organizations.decideReview(
      request.user.accountId,
      requestId,
      'NEEDS_INFORMATION',
      dto.reason,
      this.correlationId(request),
    );
  }

  @Post(':requestId/approve')
  @HttpCode(200)
  approve(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() dto: OrganizationDecisionNoteDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.organizations.decideReview(
      request.user.accountId,
      requestId,
      'VERIFIED',
      dto.reason,
      this.correlationId(request),
    );
  }

  @Post(':requestId/reject')
  @HttpCode(200)
  reject(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() dto: OrganizationDecisionReasonDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.organizations.decideReview(
      request.user.accountId,
      requestId,
      'REJECTED',
      dto.reason,
      this.correlationId(request),
    );
  }

  @Get(':requestId/evidence/:evidenceId')
  @ApiOperation({
    summary: 'Stream organization evidence through authorized access',
  })
  async evidence(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Param('evidenceId', new ParseUUIDPipe()) evidenceId: string,
  ) {
    const evidence = await this.organizations.readReviewEvidence(
      requestId,
      evidenceId,
    );
    return new StreamableFile(evidence.buffer, {
      type: evidence.mediaType,
      disposition: `inline; filename="${evidence.downloadName}"`,
      length: evidence.buffer.length,
    });
  }

  private correlationId(request: AuthenticatedRequest) {
    return request.header('x-correlation-id') || randomUUID();
  }
}
