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
  OptionalDecisionNoteDto,
  RequiredDecisionReasonDto,
} from './dto/verification-decision.dto';
import { VerificationService } from './verification.service';

@ApiTags('Verification reviewer operations')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard, SystemRolesGuard)
@RequireSystemRoles('REVIEWER', 'OPERATIONS_ADMIN')
@Controller({ path: 'verification-reviews', version: '1' })
export class ReviewerVerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Get()
  @ApiOperation({ summary: 'List submitted and active verification reviews' })
  listQueue() {
    return this.verification.listReviewQueue();
  }

  @Get(':requestId')
  @ApiOperation({ summary: 'Read a verification review workspace' })
  getReview(@Param('requestId', new ParseUUIDPipe()) requestId: string) {
    return this.verification.getReview(requestId);
  }

  @Post(':requestId/start')
  @HttpCode(200)
  @ApiOperation({ summary: 'Claim and begin a submitted review' })
  start(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.verification.startReview(
      request.user.accountId,
      requestId,
      this.correlationId(request),
    );
  }

  @Post(':requestId/request-information')
  @HttpCode(200)
  @ApiOperation({ summary: 'Request specific additional evidence' })
  requestInformation(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() dto: RequiredDecisionReasonDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.verification.decideReview(
      request.user.accountId,
      requestId,
      'NEEDS_INFORMATION',
      dto.reason,
      this.correlationId(request),
    );
  }

  @Post(':requestId/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve and verify the credential' })
  approve(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() dto: OptionalDecisionNoteDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.verification.decideReview(
      request.user.accountId,
      requestId,
      'VERIFIED',
      dto.reason,
      this.correlationId(request),
    );
  }

  @Post(':requestId/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reject the credential with a recorded reason' })
  reject(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() dto: RequiredDecisionReasonDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.verification.decideReview(
      request.user.accountId,
      requestId,
      'REJECTED',
      dto.reason,
      this.correlationId(request),
    );
  }

  @Get(':requestId/evidence/:evidenceId')
  @ApiOperation({
    summary: 'Stream private evidence through authorized access',
  })
  async evidence(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Param('evidenceId', new ParseUUIDPipe()) evidenceId: string,
  ) {
    const evidence = await this.verification.readReviewEvidence(
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
