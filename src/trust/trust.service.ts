import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const REP_DELTAS = {
  trade_completed: 25,
  on_time_confirmation: 10,
  dispute_raised: -100,
  dispute_resolved: 15,
  peer_rating_positive: 5,
  peer_rating_negative: -10,
  first_trade_bonus: 50,
} as const;

const TIER_THRESHOLDS = {
  elite: 800,
  verified: 500,
  trader: 200,
  rookie: 0,
} as const;

@Injectable()
export class TrustService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Verification card (full trust profile) ────────────────────────────────

  async getTrustProfile(viewerId: string, targetUsername: string) {
    const target = await this.prisma.user.findUnique({
      where: { username: targetUsername },
      select: {
        id: true,
        username: true,
        repScore: true,
        repTier: true,
        barrio: true,
        createdAt: true,
        idCardSent: true,
        _count: {
          select: {
            initiatedTrades: true,
            counterpartTrades: true,
          },
        },
      },
    });

    if (!target) throw new NotFoundException(`User @${targetUsername} not found`);

    // Last 3 completed trades (public summary only)
    const recentTrades = await this.prisma.trade.findMany({
      where: {
        OR: [
          { initiatorId: target.id },
          { counterpartId: target.id },
        ],
      },
      orderBy: { completedAt: 'desc' },
      take: 3,
      select: {
        completedAt: true,
        tradeType: true,
        initiatorRating: true,
        counterpartRating: true,
        initiator: { select: { username: true } },
        counterpart: { select: { username: true } },
      },
    });

    // Shared network with viewer
    const sharedConnections = await this.getSharedNetwork(viewerId, target.id);

    // Vecino check
    const isVecino = await this.isVecino(viewerId, target.id);

    // Dispute count (public)
    const disputeCount = await this.prisma.repEvent.count({
      where: { userId: target.id, eventType: 'dispute_raised' },
    });

    return {
      username: target.username,
      repScore: target.repScore,
      repTier: target.repTier,
      barrio: target.barrio,
      memberSince: target.createdAt,
      physicalIdCard: target.idCardSent,
      stats: {
        totalTrades:
          target._count.initiatedTrades + target._count.counterpartTrades,
        disputes: disputeCount,
      },
      recentTrades,
      sharedNetwork: sharedConnections,
      isVecino,
    };
  }

  // ── Primera Oferta Garantizada flag ───────────────────────────────────────

  async isPrimeraOfertaEligible(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstTradeGuaranteeUsed: true, _count: { select: { initiatedTrades: true } } },
    });
    return (
      !!user &&
      !user.firstTradeGuaranteeUsed &&
      user._count.initiatedTrades === 0
    );
  }

  async markGuaranteeUsed(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { firstTradeGuaranteeUsed: true },
    });
  }

  // ── Vecino badge — <2km proximity ─────────────────────────────────────────

  async isVecino(userAId: string, userBId: string): Promise<boolean> {
    const distM = await this.prisma.distanceBetweenUsers(userAId, userBId);
    return distM !== null && distM < 2000;
  }

  // ── Shared connections (Conocido de conocido) ─────────────────────────────

  async getSharedNetwork(
    userAId: string,
    userBId: string,
  ): Promise<{ userId: string; username: string; tradeCount: number }[]> {
    const shared: { shared_id: string; username: string; trade_count: number }[] =
      await this.prisma.$queryRaw`
        SELECT DISTINCT u.id AS shared_id, u.username, uc1.trade_count
        FROM user_connections uc1
        JOIN user_connections uc2 ON uc2.user_b_id = uc1.user_b_id
        JOIN users u ON u.id = uc1.user_b_id
        WHERE uc1.user_a_id = ${userAId}::uuid
          AND uc2.user_a_id = ${userBId}::uuid
        LIMIT 5
      `;

    return shared.map((s) => ({
      userId: s.shared_id,
      username: s.username,
      tradeCount: s.trade_count,
    }));
  }

  // ── Award rep event ───────────────────────────────────────────────────────

  async awardRep(
    userId: string,
    event: keyof typeof REP_DELTAS,
    refId?: string,
  ) {
    const delta = REP_DELTAS[event];

    await this.prisma.repEvent.create({
      data: { userId, eventType: event, delta, refId },
    });

    // Recalculate and update score + tier
    const agg = await this.prisma.repEvent.aggregate({
      where: { userId },
      _sum: { delta: true },
    });
    const newScore = agg._sum.delta ?? 0;
    const newTier = this.scoreToTier(newScore);

    return this.prisma.user.update({
      where: { id: userId },
      data: { repScore: newScore, repTier: newTier as any },
      select: { repScore: true, repTier: true },
    });
  }

  // ── ID card eligibility (5+ trades) ──────────────────────────────────────

  async checkIdCardEligibility(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { idCardSent: true, _count: { select: { initiatedTrades: true } } },
    });

    const eligible =
      !user.idCardSent && user._count.initiatedTrades >= 5;

    if (eligible) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { idCardSent: true },
      });
      // TODO: trigger physical ID card fulfillment job
    }

    return { eligible, alreadySent: user.idCardSent };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  scoreToTier(score: number): string {
    if (score >= TIER_THRESHOLDS.elite) return 'elite';
    if (score >= TIER_THRESHOLDS.verified) return 'verified';
    if (score >= TIER_THRESHOLDS.trader) return 'trader';
    return 'rookie';
  }
}
