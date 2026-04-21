import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';

import { UsersService } from './users.service';
import {
  RegisterPushDeviceDto,
  UpdateLocationDto,
  UpdateWhatsappDto,
} from './dto/users.dto';
import {
  CurrentUser,
  JwtPayload,
} from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get your own profile and stats' })
  getMe(@CurrentUser() user: JwtPayload) {
    return this.usersService.getMe(user.sub);
  }

  @Get('me/rep-history')
  @ApiOperation({ summary: 'Get your reputation event log' })
  getRepHistory(@CurrentUser() user: JwtPayload) {
    return this.usersService.getRepHistory(user.sub);
  }

  @Patch('me/location')
  @ApiOperation({ summary: 'Update your geo location for vecino matching' })
  updateLocation(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.usersService.updateLocation(user.sub, dto);
  }

  @Patch('me/whatsapp')
  @ApiOperation({ summary: 'Toggle WhatsApp number sharing opt-in' })
  updateWhatsapp(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateWhatsappDto,
  ) {
    return this.usersService.updateWhatsappOptIn(user.sub, dto);
  }

  @Post('me/devices')
  @ApiOperation({ summary: 'Register a push notification device token' })
  registerDevice(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RegisterPushDeviceDto,
  ) {
    return this.usersService.registerPushDevice(user.sub, dto);
  }

  @Delete('me/devices/:token')
  @ApiOperation({ summary: 'Remove a push device token' })
  removeDevice(
    @CurrentUser() user: JwtPayload,
    @Param('token') token: string,
  ) {
    return this.usersService.removePushDevice(user.sub, token);
  }

  @Get(':username')
  @Public()
  @ApiOperation({ summary: 'Get a public collector profile (no auth)' })
  getPublicProfile(@Param('username') username: string) {
    return this.usersService.getPublicProfile(username);
  }
}
