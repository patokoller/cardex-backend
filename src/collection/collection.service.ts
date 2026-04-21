import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AddCardDto,
  CollectionFilterDto,
  MarkForTradeDto,
} from './dto/collection.dto';

const SCAN_HARD_LIMIT_MS = 8000; // Any server processing must stay far below this

@Injectable()
export class CollectionService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Add card (the critical <8s path) ──────────────────────────────────────

  async addCard(userId: string, dto: AddCardDto) {
    const start = Date.now();

    // Resolve card from set-code
    const card = await this.prisma.card.findFirst({
      where: { setCode: dto.setCode },
      include: {
        priceSnapshots: {
          orderBy: { snappedAt: 'desc' },
          take: 1,
          select: { priceArs: true, priceUsdt: true, confidence: true },
        },
      },
    });

    if (!card) {
      throw new NotFoundException(
        `Card with set-code "${dto.setCode}" not found in catalog`,
      );
    }

    // Upsert collection item (handle duplicates gracefully)
    const item = await this.prisma.collectionItem.upsert({
      where: {
        userId_cardId_condition: {
          userId,
          cardId: card.id,
          condition: dto.condition,
        },
      },
      create: {
        userId,
        cardId: card.id,
        condition: dto.condition,
        quantity: dto.quantity,
      },
      update: {
        quantity: { increment: dto.quantity },
      },
    });

    const elapsed = Date.now() - start;
    const latestPrice = card.priceSnapshots[0];

    return {
      item,
      card: {
        id: card.id,
        name: card.name,
        setCode: card.setCode,
        rarity: card.rarity,
        imageUrl: card.imageUrl,
      },
      currentPriceArs: latestPrice?.priceArs ?? null,
      currentPriceUsdt: latestPrice?.priceUsdt ?? null,
      priceConfidence: latestPrice?.confidence ?? null,
      isDuplicate: item.quantity > dto.quantity, // was already in collection
      serverMs: elapsed,                          // telemetry — alert if > 500ms
    };
  }

  // ── Binder view (paginated by set) ─────────────────────────────────────────

  async getBinder(userId: string, dto: CollectionFilterDto) {
    const skip = (dto.page - 1) * dto.pageSize;

    const [items, total] = await Promise.all([
      this.prisma.collectionItem.findMany({
        where: {
          userId,
          ...(dto.forTradeOnly ? { forTrade: { gt: 0 } } : {}),
          ...(dto.set
            ? { card: { setName: { contains: dto.set, mode: 'insensitive' } } }
            : {}),
        },
        include: {
          card: {
            select: {
              id: true,
              name: true,
              setCode: true,
              rarity: true,
              setName: true,
              setTotal: true,
              imageUrl: true,
              priceSnapshots: {
                orderBy: { snappedAt: 'desc' },
                take: 1,
                select: { priceArs: true, priceUsdt: true },
              },
            },
          },
        },
        orderBy: [{ card: { setName: 'asc' } }, { card: { setCode: 'asc' } }],
        skip,
        take: dto.pageSize,
      }),
      this.prisma.collectionItem.count({ where: { userId } }),
    ]);

    // Portfolio value = sum of (price × quantity) across all owned cards
    const portfolioValue = await this.getPortfolioValue(userId);

    // Set completion stats
    const setCompletion = await this.getSetCompletion(userId);

    return {
      items,
      pagination: {
        page: dto.page,
        pageSize: dto.pageSize,
        total,
        totalPages: Math.ceil(total / dto.pageSize),
      },
      portfolioValue,
      setCompletion,
    };
  }

  // ── Portfolio value ────────────────────────────────────────────────────────

  async getPortfolioValue(userId: string) {
    const result: { total_ars: string; total_usdt: string }[] =
      await this.prisma.$queryRaw`
        SELECT
          SUM(ci.quantity * COALESCE(ps.price_ars, 0))  AS total_ars,
          SUM(ci.quantity * COALESCE(ps.price_usdt, 0)) AS total_usdt
        FROM collection_items ci
        LEFT JOIN LATERAL (
          SELECT price_ars, price_usdt
          FROM price_snapshots
          WHERE card_id = ci.card_id
          ORDER BY snapped_at DESC
          LIMIT 1
        ) ps ON true
        WHERE ci.user_id = ${userId}::uuid
      `;

    return {
      totalArs: parseFloat(result[0]?.total_ars ?? '0'),
      totalUsdt: parseFloat(result[0]?.total_usdt ?? '0'),
    };
  }

  // ── Set completion ─────────────────────────────────────────────────────────

  async getSetCompletion(userId: string) {
    const sets: {
      set_name: string;
      set_total: number;
      owned: bigint;
      pct: number;
    }[] = await this.prisma.$queryRaw`
      SELECT
        c.set_name,
        c.set_total,
        COUNT(DISTINCT ci.card_id) AS owned,
        ROUND((COUNT(DISTINCT ci.card_id)::numeric / c.set_total) * 100, 1) AS pct
      FROM cards c
      LEFT JOIN collection_items ci
        ON ci.card_id = c.id AND ci.user_id = ${userId}::uuid
      GROUP BY c.set_name, c.set_total
      ORDER BY pct DESC
    `;

    return sets.map((s) => ({
      setName: s.set_name,
      setTotal: s.set_total,
      owned: Number(s.owned),
      completionPct: s.pct,
      missing: s.set_total - Number(s.owned),
    }));
  }

  // ── Duplicate dashboard ───────────────────────────────────────────────────

  async getDuplicates(userId: string) {
    const duplicates = await this.prisma.collectionItem.findMany({
      where: { userId, quantity: { gt: 1 } },
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
              select: { priceArs: true },
            },
            _count: { select: { wishlistItems: true } },
          },
        },
      },
      orderBy: { card: { rarity: 'desc' } },
    });

    return duplicates.map((d: any) => ({
      itemId: d.id,
      card: {
        id: d.card.id,
        name: d.card.name,
        rarity: d.card.rarity,
        setName: d.card.setName,
        imageUrl: d.card.imageUrl,
        priceArs: d.card.priceSnapshots[0]?.priceArs ?? null,
      },
      owned: d.quantity,
      forTrade: d.forTrade,
      extras: d.quantity - 1,
      demandScore: d.card._count.wishlistItems, // how many users want this
    }));
  }

  // ── Mark for trade ─────────────────────────────────────────────────────────

  async markForTrade(userId: string, itemId: string, dto: MarkForTradeDto) {
    const item = await this.prisma.collectionItem.findFirst({
      where: { id: itemId, userId },
    });

    if (!item) throw new NotFoundException('Collection item not found');

    if (dto.forTrade > item.quantity) {
      throw new BadRequestException(
        `Cannot mark ${dto.forTrade} for trade — you only own ${item.quantity}`,
      );
    }

    return this.prisma.collectionItem.update({
      where: { id: itemId },
      data: { forTrade: dto.forTrade },
    });
  }

  // ── Remove item from collection ───────────────────────────────────────────

  async removeItem(userId: string, itemId: string) {
    const item = await this.prisma.collectionItem.findFirst({
      where: { id: itemId, userId },
    });

    if (!item) throw new NotFoundException('Collection item not found');

    await this.prisma.collectionItem.delete({ where: { id: itemId } });
    return { deleted: true };
  }
}
