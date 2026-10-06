import {
  Controller,
  Body,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../identity/access-token.guard';
import { NotificationsService } from './notifications.service';
import { UpdateNotificationPreferencesDto } from './notification-preferences.dto';
import { randomUUID } from 'node:crypto';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('preferences')
  preferences(@Req() request: AuthenticatedRequest) {
    return this.notifications.getPreferences(request.user.accountId);
  }

  @Patch('preferences')
  updatePreferences(
    @Body() dto: UpdateNotificationPreferencesDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.notifications.updatePreferences(
      request.user.accountId,
      dto,
      request.header('x-correlation-id') ?? randomUUID(),
    );
  }

  @Get('me')
  @ApiOperation({ summary: 'List the authenticated account notifications' })
  listMine(@Req() request: AuthenticatedRequest) {
    return this.notifications.listMine(request.user.accountId);
  }

  @Post('me/:notificationId/read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark an owned notification as read' })
  markRead(
    @Param('notificationId', new ParseUUIDPipe()) notificationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.notifications.markRead(request.user.accountId, notificationId);
  }
}
