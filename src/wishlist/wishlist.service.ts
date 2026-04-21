import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AddWishlistItemDto, UpdateWishlistItemDto } from './dto/wishlist.dto';

const FREE_TIER_LIMIT = 20;

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  async getWishlist(userId: string) {
    const items = await this.prisma.wishlistItem.findMany({
      where: { userId },
      orderBy: { priority: 'asc' },
      include: {
        card: {
          select: {
            id: true,
            name: true,
            rarity: true,
            setName: true,
            imageUrl: true,
            priceSnapshots: {
              orderBy: { snappedAt: 'desc' },
              take: 1,
              select: { priceArs: true, priceUsdt: true, confidence: true },
            },
            _count: { select: { collectionItems: true } }, // supply signal
          },
        },
      },
    });

    return {
      items,
      count: items.length,
      limit: FREE_TIER_LIMIT,
      slotsRemaining: Math.max(0, FREE_TIER_LIMIT - items.length),
    };
  }

  async addItem(userId: string, dto: AddWishlistItemDto) {
    // Enforce free-tier limit — drives Pro upgrade conversion
    const count = await this.prisma.wishlistItem.count({ where: { userId } });
    if (count >= FREE_TIER_LIMIT) {
      throw new BadRequestException(
        `Free tier wishlist is limited to ${FREE_TIER_LIMIT} cards. Upgrade to Pro for unlimited wishlists.`,
      );
    }

    const card = await this.prisma.card.findUnique({
      where: { id: dto.cardId },
      select: { id: true },
    });
    if (!card) throw new NotFoundException(`Card ${dto.cardId} not found`);

    return this.prisma.wishlistItem.upsert({
      where: { userId_cardId: { userId, cardId: dto.cardId } },
      create: {
        userId,
        cardId: dto.cardId,
        priority: dto.priority,
        maxCashArs: dto.maxCashArs,
      },
      update: {
        priority: dto.priority,
        maxCashArs: dto.maxCashArs,
      },
      include: { card: { select: { name: true, rarity: true } } },
    });
  }

  async updateItem(userId: string, cardId: string, dto: UpdateWishlistItemDto) {
    const item = await this.prisma.wishlistItem.findUnique({
      where: { userId_cardId: { userId, cardId } },
    });
    if (!item) throw new NotFoundException('Wishlist item not found');

    return this.prisma.wishlistItem.update({
      where: { userId_cardId: { userId, cardId } },
      data: dto,
    });
  }

  async removeItem(userId: string, cardId: string) {
    const item = await this.prisma.wishlistItem.findUnique({
      where: { userId_cardId: { userId, cardId } },
    });
    if (!item) throw new NotFoundException('Wishlist item not found');

    await this.prisma.wishlistItem.delete({
      where: { userId_cardId: { userId, cardId } },
    });
    return { deleted: true };
  }
}
