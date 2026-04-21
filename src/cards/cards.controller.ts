// cards.controller.ts
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CardsService } from './cards.service';
import { CardSearchDto } from './dto/cards.dto';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('cards')
@Controller('cards')
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Search the card catalog (fuzzy name, rarity, set)' })
  search(@Query() dto: CardSearchDto) {
    return this.cardsService.search(dto);
  }

  @Get('sets')
  @Public()
  @ApiOperation({ summary: 'List all card sets grouped by name' })
  listSets(@Query('game') game: string) {
    return this.cardsService.listSets(game ?? 'pokemon');
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get a single card with latest price' })
  findById(@Param('id') id: string) {
    return this.cardsService.findById(id);
  }

  @Get(':id/demand')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get demand signal — wishlist + for-trade counts' })
  getDemand(@Param('id') id: string) {
    return this.cardsService.getDemandSignal(id);
  }
}
