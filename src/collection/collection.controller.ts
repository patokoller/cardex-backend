// collection.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';

import { CollectionService } from './collection.service';
import {
  AddCardDto,
  CollectionFilterDto,
  MarkForTradeDto,
} from './dto/collection.dto';
import {
  CurrentUser,
  JwtPayload,
} from '../common/decorators/current-user.decorator';

@ApiTags('collection')
@ApiBearerAuth()
@Controller('collection')
export class CollectionController {
  constructor(private readonly collectionService: CollectionService) {}

  @Post()
  @ApiOperation({ summary: 'Scan / add a card to your collection (target: <8s)' })
  addCard(@CurrentUser() user: JwtPayload, @Body() dto: AddCardDto) {
    return this.collectionService.addCard(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get your binder view with portfolio value and set completion' })
  getBinder(@CurrentUser() user: JwtPayload, @Query() dto: CollectionFilterDto) {
    return this.collectionService.getBinder(user.sub, dto);
  }

  @Get('portfolio-value')
  @ApiOperation({ summary: 'Get total portfolio value in ARS and USDT' })
  getPortfolioValue(@CurrentUser() user: JwtPayload) {
    return this.collectionService.getPortfolioValue(user.sub);
  }

  @Get('set-completion')
  @ApiOperation({ summary: 'Get set completion % for all sets' })
  getSetCompletion(@CurrentUser() user: JwtPayload) {
    return this.collectionService.getSetCompletion(user.sub);
  }

  @Get('duplicates')
  @ApiOperation({ summary: 'Get duplicate cards with demand score — primary trade funnel' })
  getDuplicates(@CurrentUser() user: JwtPayload) {
    return this.collectionService.getDuplicates(user.sub);
  }

  @Patch(':id/trade')
  @ApiOperation({ summary: 'Mark N copies of a card as tradeable' })
  markForTrade(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: MarkForTradeDto,
  ) {
    return this.collectionService.markForTrade(user.sub, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a card from your collection' })
  removeItem(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.collectionService.removeItem(user.sub, id);
  }
}
