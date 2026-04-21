// wishlist.controller.ts
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
import { WishlistService } from './wishlist.service';
import { AddWishlistItemDto, UpdateWishlistItemDto } from './dto/wishlist.dto';
import {
  CurrentUser,
  JwtPayload,
} from '../common/decorators/current-user.decorator';

@ApiTags('wishlist')
@ApiBearerAuth()
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  @ApiOperation({ summary: 'Get your wishlist (sorted by priority)' })
  getWishlist(@CurrentUser() user: JwtPayload) {
    return this.wishlistService.getWishlist(user.sub);
  }

  @Post()
  @ApiOperation({ summary: 'Add a card to wishlist (free tier: 20 cards max)' })
  addItem(@CurrentUser() user: JwtPayload, @Body() dto: AddWishlistItemDto) {
    return this.wishlistService.addItem(user.sub, dto);
  }

  @Patch(':cardId')
  @ApiOperation({ summary: 'Update priority or max cash bridge for a wishlist card' })
  updateItem(
    @CurrentUser() user: JwtPayload,
    @Param('cardId') cardId: string,
    @Body() dto: UpdateWishlistItemDto,
  ) {
    return this.wishlistService.updateItem(user.sub, cardId, dto);
  }

  @Delete(':cardId')
  @ApiOperation({ summary: 'Remove a card from your wishlist' })
  removeItem(@CurrentUser() user: JwtPayload, @Param('cardId') cardId: string) {
    return this.wishlistService.removeItem(user.sub, cardId);
  }
}
