import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { randomUUID } from 'node:crypto';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../identity/access-token.guard';
import { OrganizationsService } from './organizations.service';

class ClinicSearchDto {
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @Matches(/^[A-Za-z]{2}$/) countryCode?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
}
class BookingAvailabilityDto {
  @IsBoolean() enabled!: boolean;
}

@ApiTags('Public clinic directory')
@Controller({ path: 'clinics', version: '1' })
export class ClinicsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  list(@Query() query: ClinicSearchDto) {
    return this.organizations.listBookableClinics(query);
  }

  @Patch(':organizationId/booking')
  @UseGuards(AccessTokenGuard)
  availability(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Body() dto: BookingAvailabilityDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.organizations.setAppointmentRequests(
      request.user.accountId,
      organizationId,
      dto.enabled,
      request.header('x-correlation-id') || randomUUID(),
    );
  }
}
