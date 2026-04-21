// trust.controller.ts
import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TrustService } from './trust.service';
import {
  CurrentUser,
  JwtPayload,
} from '../common/decorators/current-user.decorator';

@ApiTags('trust')
@ApiBearerAuth()
@Controller('trust')
export class TrustController {
  constructor(private readonly trustService: TrustService) {}

  @Get('verify/:username')
  @ApiOperation({
    summary:
      'Get trust profile for a counterpart — badges, trade history, shared network',
  })
  getTrustProfile(
    @CurrentUser() user: JwtPayload,
    @Param('username') username: string,
  ) {
    return this.trustService.getTrustProfile(user.sub, username);
  }

  @Get('vecino/:userId')
  @ApiOperation({ summary: 'Check if another user is a vecino (<2km)' })
  checkVecino(
    @CurrentUser() user: JwtPayload,
    @Param('userId') targetId: string,
  ) {
    return this.trustService
      .isVecino(user.sub, targetId)
      .then((isVecino) => ({ isVecino }));
  }

  @Get('primera-oferta')
  @ApiOperation({
    summary: 'Check if user is eligible for the first-trade guarantee',
  })
  checkGuarantee(@CurrentUser() user: JwtPayload) {
    return this.trustService
      .isPrimeraOfertaEligible(user.sub)
      .then((eligible) => ({ eligible, reserveUsd: 20 }));
  }
}
