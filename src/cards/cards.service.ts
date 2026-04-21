import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CardSearchDto } from './dto/cards.dto';

@Injectable()
export class CardsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Catalog search ─────────────────────────────────────────────────────────
  // Uses pg_trgm similarity for fuzzy name matching via $queryRaw

  async search(dto: CardSearchDto) {
    const { q, game, rarity, setCode, limit, offset } = dto;

    // Build a type-safe dynamic query
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let idx = 1;

    if (game) {
      conditions.push(`c.game = $${idx++}::text`);
      params.push(game);
    }
    if (rarity) {
      conditions.push(`c.rarity = $${idx++}::text`);
      params.push(rarity);
    }
    if (setCode) {
      conditions.push(`c.set_code ILIKE $${idx++}`);
      params.push(`${setCode}%`);
    }
    if (q) {
      conditions.push(`c.name % $${idx++}`); // pg_trgm similarity operator
      params.push(q);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderBy = q ? `ORDER BY similarity(c.name, $${idx++}) DESC` : 'ORDER BY c.set_code';
    if (q) params.push(q);

    params.push(limit, offset);
    const limitParam = `$${idx++}`;
    const offsetParam = `$${idx++}`;

    const cards: Record<string, unknown>[] = await this.prisma.$queryRawUnsafe(
      `SELECT c.id, c.set_code, c.name, c.rarity, c.set_name, c.set_total,
              c.image_url, c.game,
              COALESCE(ps.price_ars, 0) AS price_ars,
              COALESCE(ps.price_usdt, 0) AS price_usdt,
              COALESCE(ps.confidence, 0) AS price_confidence
       FROM cards c
       LEFT JOIN LATERAL (
         SELECT price_ars, price_usdt, confidence
         FROM price_snapshots
         WHERE card_id = c.id
         ORDER BY snapped_at DESC
         LIMIT 1
       ) ps ON true
       ${where}
       ${orderBy}
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      ...params,
    );

    return { items: cards, limit, offset };
  }

  // ── Card detail ────────────────────────────────────────────────────────────

  async findById(cardId: string) {
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      include: {
        priceSnapshots: {
          orderBy: { snappedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!card) throw new NotFoundException(`Card ${cardId} not found`);
    return card;
  }

  // ── Demand signal: how many collectors want this card ─────────────────────

  async getDemandSignal(cardId: string) {
    await this.assertCardExists(cardId);

    const [wishlistCount, forTradeCount] = await Promise.all([
      this.prisma.wishlistItem.count({ where: { cardId } }),
      this.prisma.collectionItem.aggregate({
        where: { cardId, forTrade: { gt: 0 } },
        _sum: { forTrade: true },
      }),
    ]);

    return {
      cardId,
      wishlistCount,
      forTradeCount: forTradeCount._sum.forTrade ?? 0,
    };
  }

  // ── Set list ───────────────────────────────────────────────────────────────

  async listSets(game = 'pokemon') {
    const sets: { set_name: string; set_code_prefix: string; count: bigint }[] =
      await this.prisma.$queryRaw`
        SELECT set_name, SPLIT_PART(set_code, '-', 1) AS set_code_prefix,
               COUNT(*) AS count
        FROM cards
        WHERE game = ${game}
        GROUP BY set_name, set_code_prefix
        ORDER BY set_name
      `;

    return sets.map((s) => ({
      ...s,
      count: Number(s.count),
    }));
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async assertCardExists(cardId: string) {
    const exists = await this.prisma.card.findUnique({
      where: { id: cardId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException(`Card ${cardId} not found`);
    return exists;
  }
}
