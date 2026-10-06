import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../identity/access-token.guard';
import { SchedulingService } from './scheduling.service';
import {
  AvailabilityQueryDto,
  ConfigureSchedulingDto,
  CreateAppointmentSlotDto,
  CreateBookingHoldDto,
  CreateClinicServiceDto,
  CreateClinicResourceDto,
  UpdateAppointmentSlotDto,
  UpdateClinicServiceDto,
  UpdateClinicResourceDto,
} from './scheduling.dto';
import { Inject } from '@nestjs/common';
import {
  ORGANIZATIONS_PUBLIC_API,
  type OrganizationsPublicApi,
} from '../organizations/organizations.public';

@ApiTags('Clinic services and availability')
@Controller({ path: 'scheduling', version: '1' })
export class SchedulingController {
  @Get('appointments/:appointmentId/alternatives')
  @UseGuards(AccessTokenGuard)
  alternatives(
    @Param('appointmentId', new ParseUUIDPipe()) id: string,
    @Query() query: AvailabilityQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.scheduling.alternatives(req.user.accountId, id, query.cursor);
  }
  constructor(
    private readonly scheduling: SchedulingService,
    @Inject(ORGANIZATIONS_PUBLIC_API)
    private readonly organizations: OrganizationsPublicApi,
  ) {}
  @Get('clinics/:organizationId') publicTimes(
    @Param('organizationId', new ParseUUIDPipe()) id: string,
    @Query() query: AvailabilityQueryDto,
  ) {
    return this.scheduling.list(id, query);
  }
  @Get('organizations/:organizationId')
  @UseGuards(AccessTokenGuard)
  manage(
    @Param('organizationId', new ParseUUIDPipe()) id: string,
    @Query() query: AvailabilityQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.scheduling.list(id, query, req.user.accountId);
  }
  @Patch('organizations/:organizationId')
  @UseGuards(AccessTokenGuard)
  configure(
    @Param('organizationId', new ParseUUIDPipe()) id: string,
    @Body() dto: ConfigureSchedulingDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.organizations.configureAppointmentScheduling(
      req.user.accountId,
      id,
      dto.enabled,
      dto.expectedEnabled,
      this.correlation(req),
    );
  }
  @Post('organizations/:organizationId/resources')
  @UseGuards(AccessTokenGuard)
  resource(
    @Param('organizationId', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateClinicResourceDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.scheduling.createResource(
      req.user.accountId,
      id,
      dto,
      this.correlation(req),
    );
  }
  @Patch('organizations/:organizationId/resources/:resourceId')
  @UseGuards(AccessTokenGuard)
  updateResource(
    @Param('organizationId', new ParseUUIDPipe()) id: string,
    @Param('resourceId', new ParseUUIDPipe()) resourceId: string,
    @Body() dto: UpdateClinicResourceDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.scheduling.updateResource(
      req.user.accountId,
      id,
      resourceId,
      dto,
      this.correlation(req),
    );
  }
  @Post('organizations/:organizationId/services')
  @UseGuards(AccessTokenGuard)
  service(
    @Param('organizationId', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateClinicServiceDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.scheduling.createService(
      req.user.accountId,
      id,
      dto,
      this.correlation(req),
    );
  }
  @Patch('organizations/:organizationId/services/:serviceId')
  @UseGuards(AccessTokenGuard)
  updateService(
    @Param('organizationId', new ParseUUIDPipe()) id: string,
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
    @Body() dto: UpdateClinicServiceDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.scheduling.updateService(
      req.user.accountId,
      id,
      serviceId,
      dto,
      this.correlation(req),
    );
  }
  @Post('organizations/:organizationId/slots')
  @UseGuards(AccessTokenGuard)
  slot(
    @Param('organizationId', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateAppointmentSlotDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.scheduling.createSlot(
      req.user.accountId,
      id,
      dto,
      this.correlation(req),
    );
  }
  @Patch('organizations/:organizationId/slots/:slotId')
  @UseGuards(AccessTokenGuard)
  updateSlot(
    @Param('organizationId', new ParseUUIDPipe()) id: string,
    @Param('slotId', new ParseUUIDPipe()) slotId: string,
    @Body() dto: UpdateAppointmentSlotDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.scheduling.updateSlot(
      req.user.accountId,
      id,
      slotId,
      dto,
      this.correlation(req),
    );
  }
  @Post('clinics/:organizationId/holds')
  @UseGuards(AccessTokenGuard)
  hold(
    @Param('organizationId', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateBookingHoldDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.scheduling.hold(req.user.accountId, id, dto);
  }
  @Post('holds/:holdId/release')
  @UseGuards(AccessTokenGuard)
  release(
    @Param('holdId', new ParseUUIDPipe()) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.scheduling.release(req.user.accountId, id);
  }
  private correlation(req: AuthenticatedRequest) {
    return req.header('x-correlation-id') || randomUUID();
  }
}
