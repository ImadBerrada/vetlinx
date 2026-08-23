import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
  ApplyToJobDto,
  CandidateSearchQueryDto,
  CreateJobDto,
  CreateOfferDto,
  EndEmploymentDto,
  JobSearchQueryDto,
  RespondToOfferDto,
  ScheduleInterviewDto,
  UpdateApplicationStatusDto,
  UpdateInterviewStatusDto,
  UpdateJobDto,
  UpdateOfferDto,
  WithdrawOfferDto,
} from './dto/recruitment.dto';
import { RecruitmentService } from './recruitment.service';

@ApiTags('Recruitment')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller({ version: '1' })
export class RecruitmentController {
  constructor(private readonly recruitment: RecruitmentService) {}

  @Get('organizations/:organizationId/jobs')
  listOrganizationJobs(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.recruitment.listOrganizationJobs(
      request.user.accountId,
      organizationId,
    );
  }

  @Post('organizations/:organizationId/jobs')
  createJob(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Body() dto: CreateJobDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.recruitment.createJob(
      request.user.accountId,
      organizationId,
      dto,
      this.correlationId(request),
    );
  }

  @Patch('organizations/:organizationId/jobs/:jobId')
  updateJob(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Body() dto: UpdateJobDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.recruitment.updateJob(
      request.user.accountId,
      organizationId,
      jobId,
      dto,
      this.correlationId(request),
    );
  }

  @Post('organizations/:organizationId/jobs/:jobId/publish')
  @HttpCode(200)
  publishJob(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.recruitment.publishJob(
      request.user.accountId,
      organizationId,
      jobId,
      this.correlationId(request),
    );
  }

  @Post('organizations/:organizationId/jobs/:jobId/close')
  @HttpCode(200)
  closeJob(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.recruitment.closeJob(
      request.user.accountId,
      organizationId,
      jobId,
      this.correlationId(request),
    );
  }

  @Get('organizations/:organizationId/jobs/:jobId/applications')
  listApplications(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.recruitment.listApplications(
      request.user.accountId,
      organizationId,
      jobId,
    );
  }

  @Patch('organizations/:organizationId/applications/:applicationId/status')
  updateApplicationStatus(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('applicationId', new ParseUUIDPipe()) applicationId: string,
    @Body() dto: UpdateApplicationStatusDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.recruitment.updateApplicationStatus(
      request.user.accountId,
      organizationId,
      applicationId,
      dto,
      this.correlationId(request),
    );
  }

  @Get('organizations/:organizationId/candidates')
  discoverCandidates(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Query() query: CandidateSearchQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.recruitment.discoverCandidates(
      request.user.accountId,
      organizationId,
      query,
    );
  }

  @Post('organizations/:organizationId/applications/:applicationId/interviews')
  scheduleInterview(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('applicationId', new ParseUUIDPipe()) applicationId: string,
    @Body() dto: ScheduleInterviewDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.recruitment.scheduleInterview(
      request.user.accountId,
      organizationId,
      applicationId,
      dto,
      this.correlationId(request),
    );
  }

  @Patch('organizations/:organizationId/interviews/:interviewId/status')
  updateInterviewStatus(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('interviewId', new ParseUUIDPipe()) interviewId: string,
    @Body() dto: UpdateInterviewStatusDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.recruitment.updateInterviewStatus(
      request.user.accountId,
      organizationId,
      interviewId,
      dto,
      this.correlationId(request),
    );
  }

  @Post('organizations/:organizationId/applications/:applicationId/offers')
  createOffer(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('applicationId', new ParseUUIDPipe()) applicationId: string,
    @Body() dto: CreateOfferDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.recruitment.createOffer(
      request.user.accountId,
      organizationId,
      applicationId,
      dto,
      this.correlationId(request),
    );
  }

  @Patch('organizations/:organizationId/offers/:offerId')
  updateOffer(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('offerId', new ParseUUIDPipe()) offerId: string,
    @Body() dto: UpdateOfferDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.recruitment.updateOffer(
      request.user.accountId,
      organizationId,
      offerId,
      dto,
      this.correlationId(request),
    );
  }

  @Post('organizations/:organizationId/offers/:offerId/send')
  @HttpCode(200)
  sendOffer(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('offerId', new ParseUUIDPipe()) offerId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.recruitment.sendOffer(
      request.user.accountId,
      organizationId,
      offerId,
      this.correlationId(request),
    );
  }

  @Post('organizations/:organizationId/offers/:offerId/withdraw')
  @HttpCode(200)
  withdrawOffer(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('offerId', new ParseUUIDPipe()) offerId: string,
    @Body() dto: WithdrawOfferDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.recruitment.withdrawOffer(
      request.user.accountId,
      organizationId,
      offerId,
      dto.reason,
      this.correlationId(request),
    );
  }

  @Post('organizations/:organizationId/offers/:offerId/employment')
  confirmEmployment(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('offerId', new ParseUUIDPipe()) offerId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.recruitment.confirmEmployment(
      request.user.accountId,
      organizationId,
      offerId,
      this.correlationId(request),
    );
  }

  @Get('organizations/:organizationId/employments')
  listOrganizationEmployments(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.recruitment.listOrganizationEmployments(
      request.user.accountId,
      organizationId,
    );
  }

  @Post('organizations/:organizationId/employments/:employmentId/activate')
  @HttpCode(200)
  activateEmployment(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('employmentId', new ParseUUIDPipe()) employmentId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.recruitment.activateEmployment(
      request.user.accountId,
      organizationId,
      employmentId,
      this.correlationId(request),
    );
  }

  @Post('organizations/:organizationId/employments/:employmentId/end')
  @HttpCode(200)
  endEmployment(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('employmentId', new ParseUUIDPipe()) employmentId: string,
    @Body() dto: EndEmploymentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.recruitment.endEmployment(
      request.user.accountId,
      organizationId,
      employmentId,
      dto,
      this.correlationId(request),
    );
  }

  @Get('jobs')
  searchPublished(@Query() query: JobSearchQueryDto) {
    return this.recruitment.searchPublished(query);
  }

  @Get('jobs/:jobId')
  getPublished(@Param('jobId', new ParseUUIDPipe()) jobId: string) {
    return this.recruitment.getPublished(jobId);
  }

  @Post('jobs/:jobId/applications')
  apply(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Body() dto: ApplyToJobDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.recruitment.apply(
      request.user.accountId,
      jobId,
      dto,
      this.correlationId(request),
    );
  }

  @Get('applications/me')
  listMine(@Req() request: AuthenticatedRequest) {
    return this.recruitment.listMyApplications(request.user.accountId);
  }

  @Get('interviews/me')
  listMyInterviews(@Req() request: AuthenticatedRequest) {
    return this.recruitment.listMyInterviews(request.user.accountId);
  }

  @Get('offers/me')
  listMyOffers(@Req() request: AuthenticatedRequest) {
    return this.recruitment.listMyOffers(request.user.accountId);
  }

  @Get('employments/me')
  listMyEmployments(@Req() request: AuthenticatedRequest) {
    return this.recruitment.listMyEmployments(request.user.accountId);
  }

  @Post('offers/me/:offerId/respond')
  @HttpCode(200)
  respondToOffer(
    @Param('offerId', new ParseUUIDPipe()) offerId: string,
    @Body() dto: RespondToOfferDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.recruitment.respondToOffer(
      request.user.accountId,
      offerId,
      dto,
      this.correlationId(request),
    );
  }

  @Post('applications/me/:applicationId/withdraw')
  @HttpCode(200)
  withdraw(
    @Param('applicationId', new ParseUUIDPipe()) applicationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.recruitment.withdrawApplication(
      request.user.accountId,
      applicationId,
      this.correlationId(request),
    );
  }

  private correlationId(request: AuthenticatedRequest) {
    return request.header('x-correlation-id') || randomUUID();
  }
}
