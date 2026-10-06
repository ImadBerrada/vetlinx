import {
  Body,
  Controller,
  Get,
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
import {
  AppointmentDecisionDto,
  AppointmentProposalDto,
  AppointmentProposalResponseDto,
  RequestAppointmentDto,
} from './appointments.dto';
import { AppointmentsService } from './appointments.service';

@ApiTags('Appointments')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller({ path: 'appointments', version: '1' })
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}
  @Get('me') mine(@Req() request: AuthenticatedRequest) {
    return this.appointments.listMine(request.user.accountId);
  }
  @Post() create(
    @Body() dto: RequestAppointmentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.appointments.request(
      request.user.accountId,
      dto,
      this.correlation(request),
    );
  }
  @Post(':appointmentId/cancel') cancel(
    @Param('appointmentId', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.appointments.cancelMine(
      request.user.accountId,
      id,
      this.correlation(request),
    );
  }
  @Get('organizations/:organizationId') clinic(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.appointments.listForClinic(
      request.user.accountId,
      organizationId,
    );
  }
  @Post('organizations/:organizationId/:appointmentId/proposal') propose(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('appointmentId', new ParseUUIDPipe()) id: string,
    @Body() dto: AppointmentProposalDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.appointments.propose(
      request.user.accountId,
      organizationId,
      id,
      dto,
      this.correlation(request),
    );
  }
  @Post(':appointmentId/proposal/accept') acceptProposal(
    @Param('appointmentId', new ParseUUIDPipe()) id: string,
    @Body() dto: AppointmentProposalResponseDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.appointments.respondToProposal(
      request.user.accountId,
      id,
      dto,
      true,
      this.correlation(request),
    );
  }
  @Post(':appointmentId/proposal/reject') rejectProposal(
    @Param('appointmentId', new ParseUUIDPipe()) id: string,
    @Body() dto: AppointmentProposalResponseDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.appointments.respondToProposal(
      request.user.accountId,
      id,
      dto,
      false,
      this.correlation(request),
    );
  }
  @Patch('organizations/:organizationId/:appointmentId') decide(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('appointmentId', new ParseUUIDPipe()) id: string,
    @Body() dto: AppointmentDecisionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.appointments.decide(
      request.user.accountId,
      organizationId,
      id,
      dto,
      this.correlation(request),
    );
  }
  private correlation(request: AuthenticatedRequest) {
    return request.header('x-correlation-id') || randomUUID();
  }
}
