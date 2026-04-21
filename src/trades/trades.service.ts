import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConfirmTradeDto,
  CounterOfferDto,
  CreateOfferDto,
} from './dto/trades.dto';
import { TrustService } from '../trust/trust.service';
import { NotificationsService } from '../notifications/notifications.service';

const OFFER_WINDOW_HOURS = 2;

@Injectable()
export class TradesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trust: TrustService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Create offer ───────────────────────────────────────────────────────────

  async createOffer(initiatorId: string, dto: CreateOfferDto) {
    if (initiatorId === dto.counterpartId) {
      throw new BadRequestException('Cannot create a trade offer with yourself');
    }

    // Verify initiator owns the cards they're offering
    await this.assertOwnsCards(initiatorId, dto.offeredCards);

    // Compute match score
    const matchScore = await this.computeMatchScore(
      initiatorId,
      dto.counterpartId,
      dto.offeredCards,
      dto.requestedCards,
    );

    const expiresAt = new Date(Date.now() + OFFER_WINDOW_HOURS * 60 * 60 * 1000);

    const offer = await this.prisma.tradeOffer.create({
      data: {
        initiatorId,
        counterpartId: dto.counterpartId,
        cashDeltaArs: dto.cashDeltaArs,
        matchScore,
        expiresAt,
        offeredCards: {
          create: dto.offeredCards.map((c) => ({
            cardId: c.cardId,
            quantity: c.quantity,
            condition: c.condition,
            side: 'offered',
          })),
        },
        requestedCards: {
          create: dto.requestedCards.map((c) => ({
            cardId: c.cardId,
            quantity: c.quantity,
            condition: c.condition,
            side: 'requested',
          })),
        },
      },
      include: this.offerIncludes(),
    });

    // Notify counterpart
    await this.notifications.sendTradeNotification(
      dto.counterpartId,
      'trade_offer_received',
      offer,
    );

    return { offer, expiresAt, matchScore };
  }

  // ── Get active matches for a user ─────────────────────────────────────────

  async getMatches(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { latitude: true, longitude: true },
    });

    // Get cards user wants and has for trade
    const [wishlistCards, forTradeItems] = await Promise.all([
      this.prisma.wishlistItem.findMany({
        where: { userId },
        select: { cardId: true },
      }),
      this.prisma.collectionItem.findMany({
        where: { userId, forTrade: { gt: 0 } },
        select: { cardId: true },
      }),
    ]);

    const wishlistCardIds = wishlistCards.map((w: any) => w.cardId);
    const forTradeCardIds = forTradeItems.map((f: any) => f.cardId);

    if (!wishlistCardIds.length || !forTradeCardIds.length) {
      return { matches: [], message: 'Add cards to your wishlist and mark duplicates for trade to see matches' };
    }

    // Find users who have what userId wants AND want what userId has
    const potentialMatches: {
      counterpart_id: string;
      their_card_id: string;
      your_card_id: string;
      counterpart_username: string;
      counterpart_barrio: string;
      counterpart_rep_tier: string;
      distance_m: number | null;
    }[] = await this.prisma.$queryRaw`
      SELECT DISTINCT
        ci_them.user_id    AS counterpart_id,
        ci_them.card_id    AS their_card_id,
        ci_me.card_id      AS your_card_id,
        u.username         AS counterpart_username,
        u.barrio           AS counterpart_barrio,
        u.rep_tier         AS counterpart_rep_tier,
        CASE
          WHEN ${user.latitude} IS NOT NULL AND u.latitude IS NOT NULL THEN
            ST_Distance(
              ST_MakePoint(u.longitude, u.latitude)::geography,
              ST_MakePoint(${user.longitude}, ${user.latitude})::geography
            )
          ELSE NULL
        END AS distance_m
      FROM collection_items ci_them
      JOIN collection_items ci_me
        ON ci_me.user_id   = ${userId}::uuid
        AND ci_me.card_id   = ANY(${forTradeCardIds}::uuid[])
        AND ci_me.for_trade > 0
      JOIN wishlist_items wi_them
        ON wi_them.user_id = ci_them.user_id
        AND wi_them.card_id = ci_me.card_id
      JOIN users u ON u.id = ci_them.user_id
      WHERE ci_them.user_id  != ${userId}::uuid
        AND ci_them.card_id   = ANY(${wishlistCardIds}::uuid[])
        AND ci_them.for_trade > 0
        AND (
          ${user.latitude} IS NULL
          OR u.latitude IS NULL
          OR ST_DWithin(
               ST_MakePoint(u.longitude, u.latitude)::geography,
               ST_MakePoint(${user.longitude}, ${user.latitude})::geography,
               ${50000}
             )
        )
      ORDER BY distance_m ASC NULLS LAST
      LIMIT 20
    `;

    // Enrich with card details and score
    const enriched = await Promise.all(
      potentialMatches.map(async (m) => {
        const [theirCard, yourCard] = await Promise.all([
          this.prisma.card.findUnique({
            where: { id: m.their_card_id },
            select: { name: true, rarity: true, imageUrl: true },
          }),
          this.prisma.card.findUnique({
            where: { id: m.your_card_id },
            select: { name: true, rarity: true, imageUrl: true },
          }),
        ]);

        const sharedConnections = await this.getSharedConnectionCount(
          userId,
          m.counterpart_id,
        );

        return {
          counterpart: {
            id: m.counterpart_id,
            username: m.counterpart_username,
            barrio: m.counterpart_barrio,
            repTier: m.counterpart_rep_tier,
          },
          theirCard: { id: m.their_card_id, ...theirCard },
          yourCard: { id: m.your_card_id, ...yourCard },
          distanceKm: m.distance_m ? Math.round(m.distance_m / 100) / 10 : null,
          isVecino: m.distance_m !== null && m.distance_m < 2000,
          sharedConnections,
        };
      }),
    );

    return { matches: enriched };
  }

  // ── Get offer detail ───────────────────────────────────────────────────────

  async getOffer(userId: string, offerId: string) {
    const offer = await this.prisma.tradeOffer.findUnique({
      where: { id: offerId },
      include: this.offerIncludes(),
    });

    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.initiatorId !== userId && offer.counterpartId !== userId) {
      throw new ForbiddenException('Not your offer');
    }

    return offer;
  }

  // ── Get all offers for user ────────────────────────────────────────────────

  async getMyOffers(userId: string, status?: string) {
    return this.prisma.tradeOffer.findMany({
      where: {
        OR: [{ initiatorId: userId }, { counterpartId: userId }],
        ...(status ? { status: status as any } : {}),
      },
      include: this.offerIncludes(),
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ── Counter-offer ──────────────────────────────────────────────────────────

  async counterOffer(
    userId: string,
    offerId: string,
    dto: CounterOfferDto,
  ) {
    const original = await this.assertOfferAccess(userId, offerId);

    if (original.counterpartId !== userId) {
      throw new ForbiddenException(
        'Only the counterpart can counter an offer',
      );
    }
    if (original.status !== 'pending') {
      throw new BadRequestException(`Offer is ${original.status} — cannot counter`);
    }

    // Mark original as countered
    await this.prisma.tradeOffer.update({
      where: { id: offerId },
      data: { status: 'countered' },
    });

    // Create new offer referencing the parent
    const expiresAt = new Date(Date.now() + OFFER_WINDOW_HOURS * 60 * 60 * 1000);
    const counter = await this.prisma.tradeOffer.create({
      data: {
        initiatorId: userId,
        counterpartId: original.initiatorId,
        cashDeltaArs: -dto.cashDeltaArs, // flip perspective
        parentOfferId: offerId,
        expiresAt,
        status: 'pending',
        offeredCards: {
          create: dto.offeredCards.map((c) => ({
            cardId: c.cardId,
            quantity: c.quantity,
            condition: c.condition,
            side: 'offered',
          })),
        },
        requestedCards: {
          create: dto.requestedCards.map((c) => ({
            cardId: c.cardId,
            quantity: c.quantity,
            condition: c.condition,
            side: 'requested',
          })),
        },
      },
      include: this.offerIncludes(),
    });

    await this.notifications.sendTradeNotification(
      original.initiatorId,
      'trade_countered',
      counter,
    );

    return counter;
  }

  // ── Accept ─────────────────────────────────────────────────────────────────

  async acceptOffer(userId: string, offerId: string) {
    const offer = await this.assertOfferAccess(userId, offerId);

    if (offer.counterpartId !== userId) {
      throw new ForbiddenException('Only the counterpart can accept');
    }
    this.assertOfferPending(offer);

    const updated = await this.prisma.tradeOffer.update({
      where: { id: offerId },
      data: { status: 'accepted' },
    });

    await this.notifications.sendTradeNotification(
      offer.initiatorId,
      'trade_accepted',
      offer,
    );

    return updated;
  }

  // ── Reject ─────────────────────────────────────────────────────────────────

  async rejectOffer(userId: string, offerId: string) {
    const offer = await this.assertOfferAccess(userId, offerId);
    this.assertOfferPending(offer);

    return this.prisma.tradeOffer.update({
      where: { id: offerId },
      data: { status: 'rejected' },
    });
  }

  // ── Confirm completion (both parties must call) ────────────────────────────

  async confirmTrade(userId: string, offerId: string, dto: ConfirmTradeDto) {
    const offer = await this.assertOfferAccess(userId, offerId);

    if (offer.status !== 'accepted') {
      throw new BadRequestException('Offer must be accepted before confirming');
    }

    const isInitiator = offer.initiatorId === userId;
    const newStatus = isInitiator
      ? 'confirmed_initiator'
      : 'confirmed_counterpart';

    // Check if other party already confirmed
    const offerStatusStr = String(offer.status);
    const bothConfirmed =
      (isInitiator && offerStatusStr === 'confirmed_counterpart') ||
      (!isInitiator && offerStatusStr === 'confirmed_initiator');

    if (bothConfirmed) {
      // Both confirmed — complete the trade
      return this.completeTrade(offer, dto);
    }

    return this.prisma.tradeOffer.update({
      where: { id: offerId },
      data: { status: newStatus },
    });
  }

  // ── Internal: complete trade ───────────────────────────────────────────────

  private async completeTrade(offer: any, dto: ConfirmTradeDto) {
    const trade = await this.prisma.$transaction(async (tx: any) => {
      // Mark offer completed
      await tx.tradeOffer.update({
        where: { id: offer.id },
        data: { status: 'completed' },
      });

      // Create trade record
      const trade = await tx.trade.create({
        data: {
          offerId: offer.id,
          initiatorId: offer.initiatorId,
          counterpartId: offer.counterpartId,
          cashDeltaArs: offer.cashDeltaArs,
          tradeType: dto.tradeType,
          initiatorRating: dto.rating,
        },
      });

      // Award reputation to both parties
      await tx.repEvent.createMany({
        data: [
          {
            userId: offer.initiatorId,
            eventType: 'trade_completed',
            delta: 25,
            refId: trade.id,
          },
          {
            userId: offer.counterpartId,
            eventType: 'trade_completed',
            delta: 25,
            refId: trade.id,
          },
        ],
      });

      // Update rep scores
      for (const uid of [offer.initiatorId, offer.counterpartId]) {
        const agg = await tx.repEvent.aggregate({
          where: { userId: uid },
          _sum: { delta: true },
        });
        const newScore = agg._sum.delta ?? 0;
        const newTier = this.scoreTier(newScore);

        await tx.user.update({
          where: { id: uid },
          data: { repScore: newScore, repTier: newTier },
        });
      }

      // Update social graph (user_connections)
      const [a, b] = [offer.initiatorId, offer.counterpartId].sort();
      await tx.userConnection.upsert({
        where: { userAId_userBId: { userAId: a, userBId: b } },
        create: { userAId: a, userBId: b, tradeCount: 1 },
        update: { tradeCount: { increment: 1 } },
      });

      return trade;
    });

    await this.notifications.sendTradeNotification(
      offer.counterpartId,
      'trade_completed',
      offer,
    );

    return trade;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async assertOwnsCards(
    userId: string,
    cards: { cardId: string; quantity: number }[],
  ) {
    for (const c of cards) {
      const item = await this.prisma.collectionItem.findFirst({
        where: { userId, cardId: c.cardId, forTrade: { gte: c.quantity } },
      });
      if (!item) {
        throw new BadRequestException(
          `You don't have ${c.quantity}x card ${c.cardId} marked for trade`,
        );
      }
    }
  }

  private async assertOfferAccess(userId: string, offerId: string) {
    const offer = await this.prisma.tradeOffer.findUnique({
      where: { id: offerId },
      include: this.offerIncludes(),
    });

    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.initiatorId !== userId && offer.counterpartId !== userId) {
      throw new ForbiddenException('Not your offer');
    }

    // Auto-expire stale offers
    if (offer.expiresAt && offer.expiresAt < new Date() && offer.status === 'pending') {
      await this.prisma.tradeOffer.update({
        where: { id: offerId },
        data: { status: 'expired' },
      });
      throw new BadRequestException('This offer has expired');
    }

    return offer;
  }

  private assertOfferPending(offer: { status: string }) {
    if (offer.status !== 'pending') {
      throw new BadRequestException(`Offer is already ${offer.status}`);
    }
  }

  private async computeMatchScore(
    initiatorId: string,
    counterpartId: string,
    offeredCards: { cardId: string }[],
    requestedCards: { cardId: string }[],
  ): Promise<number> {
    // Get latest prices for both sides
    const getPrices = async (cardIds: string[]) => {
      const snapshots = await this.prisma.priceSnapshot.findMany({
        where: { cardId: { in: cardIds } },
        orderBy: { snappedAt: 'desc' },
        distinct: ['cardId'],
        select: { cardId: true, priceArs: true },
      });
      return snapshots.reduce((sum: number, s: any) => sum + Number(s.priceArs), 0);
    };

    const [offeredValue, requestedValue] = await Promise.all([
      getPrices(offeredCards.map((c) => c.cardId)),
      getPrices(requestedCards.map((c) => c.cardId)),
    ]);

    const maxVal = Math.max(offeredValue, requestedValue);
    const valueParity = maxVal > 0
      ? Math.min(offeredValue, requestedValue) / maxVal
      : 0.5;

    // Trust score
    const [userA, userB] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: initiatorId }, select: { repTier: true, latitude: true, longitude: true } }),
      this.prisma.user.findUnique({ where: { id: counterpartId }, select: { repTier: true, latitude: true, longitude: true } }),
    ]);

    const tierMap: Record<string, number> = {
      rookie: 0, trader: 0.5, verified: 0.75, elite: 1,
    };
    const trustScore =
      ((tierMap[userA?.repTier ?? 'rookie'] ?? 0) +
       (tierMap[userB?.repTier ?? 'rookie'] ?? 0)) / 2;

    // Geo score
    let geoScore = 0.5;
    if (userA?.latitude && userB?.latitude) {
      const distM = await this.prisma.distanceBetweenUsers(initiatorId, counterpartId);
      geoScore = distM !== null ? 1 - Math.min(distM, 50000) / 50000 : 0.5;
    }

    // Social score
    const sharedCount = await this.getSharedConnectionCount(initiatorId, counterpartId);
    const socialScore = Math.min(sharedCount / 3, 1.0);

    // Weighted composite (tuned from blueprint)
    return (
      valueParity * 0.60 +
      trustScore  * 0.20 +
      geoScore    * 0.12 +
      socialScore * 0.08
    );
  }

  private async getSharedConnectionCount(
    userAId: string,
    userBId: string,
  ): Promise<number> {
    const result: { count: bigint }[] = await this.prisma.$queryRaw`
      SELECT COUNT(*) AS count
      FROM user_connections uc1
      JOIN user_connections uc2 ON uc2.user_b_id = uc1.user_b_id
      WHERE uc1.user_a_id = ${userAId}::uuid
        AND uc2.user_a_id = ${userBId}::uuid
    `;
    return Number(result[0]?.count ?? 0);
  }

  private scoreTier(score: number): string {
    if (score >= 800) return 'elite';
    if (score >= 500) return 'verified';
    if (score >= 200) return 'trader';
    return 'rookie';
  }

  private offerIncludes() {
    return {
      initiator: { select: { id: true, username: true, repTier: true, barrio: true } },
      counterpart: { select: { id: true, username: true, repTier: true, barrio: true } },
      offeredCards: { include: { card: { select: { name: true, rarity: true, imageUrl: true, setCode: true } } } },
      requestedCards: { include: { card: { select: { name: true, rarity: true, imageUrl: true, setCode: true } } } },
    } as const;
  }
}
