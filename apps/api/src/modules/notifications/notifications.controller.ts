import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../identity/access-token.guard';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

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
