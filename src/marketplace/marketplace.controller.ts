// marketplace.controller.ts
import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MarketplaceService } from './marketplace.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('marketplace')
@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Browse cash listings (Month 4+ — currently returns gate message)' })
  getListings(@Param('cardId') cardId?: string) {
    return this.marketplaceService.getListings(cardId);
  }

  @Post('listings')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a cash sell listing (Month 4+)' })
  createListing(@Body() dto: unknown) {
    return this.marketplaceService.createListing('userId', dto);
  }
}
