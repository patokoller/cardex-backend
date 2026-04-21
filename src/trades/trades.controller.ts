import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TradesService } from './trades.service';
import {
  ConfirmTradeDto,
  CounterOfferDto,
  CreateOfferDto,
} from './dto/trades.dto';
import {
  CurrentUser,
  JwtPayload,
} from '../common/decorators/current-user.decorator';

@ApiTags('trades')
@ApiBearerAuth()
@Controller()
export class TradesController {
  constructor(private readonly tradesService: TradesService) {}

  // ── Match discovery ────────────────────────────────────────────────────────

  @Get('matches')
  @ApiOperation({
    summary: 'Get live matches — people who have what you want and want what you have',
  })
  getMatches(@CurrentUser() user: JwtPayload) {
    return this.tradesService.getMatches(user.sub);
  }

  // ── Offer management ───────────────────────────────────────────────────────

  @Post('offers')
  @ApiOperation({ summary: 'Create a trade offer (card-for-card ± cash delta)' })
  createOffer(@CurrentUser() user: JwtPayload, @Body() dto: CreateOfferDto) {
    return this.tradesService.createOffer(user.sub, dto);
  }

  @Get('offers')
  @ApiOperation({ summary: 'Get all your trade offers (sent and received)' })
  @ApiQuery({ name: 'status', required: false })
  getMyOffers(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
  ) {
    return this.tradesService.getMyOffers(user.sub, status);
  }

  @Get('offers/:id')
  @ApiOperation({ summary: 'Get a single offer detail' })
  getOffer(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.tradesService.getOffer(user.sub, id);
  }

  @Post('offers/:id/counter')
  @ApiOperation({ summary: 'Counter an incoming trade offer' })
  counterOffer(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CounterOfferDto,
  ) {
    return this.tradesService.counterOffer(user.sub, id, dto);
  }

  @Post('offers/:id/accept')
  @ApiOperation({ summary: 'Accept a trade offer — starts the 2-hour confirmation window' })
  acceptOffer(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.tradesService.acceptOffer(user.sub, id);
  }

  @Post('offers/:id/reject')
  @ApiOperation({ summary: 'Reject a trade offer' })
  rejectOffer(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.tradesService.rejectOffer(user.sub, id);
  }

  @Post('trades/:id/confirm')
  @ApiOperation({
    summary:
      'Confirm trade completion — both parties must call. ' +
      'Second confirmation completes the trade and awards reputation.',
  })
  confirmTrade(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ConfirmTradeDto,
  ) {
    return this.tradesService.confirmTrade(user.sub, id, dto);
  }
}
