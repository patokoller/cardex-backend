// pricing.controller.ts
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PricingService } from './pricing.service';
import {
  CurrentUser,
  JwtPayload,
} from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('pricing')
@Controller('cards/:id')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get('price')
  @Public()
  @ApiOperation({ summary: 'Get current oracle price with source breakdown' })
  getPrice(@Param('id') id: string) {
    return this.pricingService.getCardPrice(id);
  }

  @Get('price/history')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get price history chart data (Pro tier — 90 days)' })
  @ApiQuery({ name: 'days', enum: [7, 30, 90], required: false })
  getPriceHistory(
    @CurrentUser() _user: JwtPayload,
    @Param('id') id: string,
    @Query('days') days: string,
  ) {
    // TODO: gate on Pro tier — throw ForbiddenException if user.tier === 'free'
    const d = parseInt(days ?? '30', 10);
    const validDays = [7, 30, 90].includes(d) ? (d as 7 | 30 | 90) : 30;
    return this.pricingService.getPriceHistory(id, validDays);
  }

  @Get('price/blue-rate')
  @Public()
  @ApiOperation({ summary: 'Get current blue dollar ARS/USD exchange rate' })
  getBlueDollarRate() {
    return this.pricingService.getBlueDollarRate().then((rate) => ({
      rateArsPerUsd: rate,
      source: 'dolarapi.com',
      note: 'Blue dollar (informal) rate. Not the official BCRA rate.',
    }));
  }
}
