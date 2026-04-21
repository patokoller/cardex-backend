import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export interface OracleResult {
  cardId: string;
  priceArs: number;
  priceUsdt: number;
  confidence: number;
  sampleCount: number;
  sources: { name: string; count: number }[];
  updatedAt: Date;
}

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);
  private blueDollarRate = 1000; // Default, refreshed from API
  private lastRateRefresh = 0;
  private readonly RATE_TTL_MS = 30 * 60 * 1000; // 30 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // ── Current price for a card ───────────────────────────────────────────────

  async getCardPrice(cardId: string): Promise<OracleResult> {
    await this.assertCardExists(cardId);

    const snapshots = await this.prisma.priceSnapshot.findMany({
      where: { cardId },
      orderBy: { snappedAt: 'desc' },
      take: 20,
    });

    if (!snapshots.length) {
      return {
        cardId,
        priceArs: 0,
        priceUsdt: 0,
        confidence: 0,
        sampleCount: 0,
        sources: [],
        updatedAt: new Date(),
      };
    }

    const latest = snapshots[0];
    const sources = this.aggregateSources(snapshots);

    return {
      cardId,
      priceArs: Number(latest.priceArs),
      priceUsdt: Number(latest.priceUsdt ?? 0),
      confidence: Number(latest.confidence ?? 0),
      sampleCount: latest.sampleCount ?? 0,
      sources,
      updatedAt: latest.snappedAt,
    };
  }

  // ── 90-day price history (Pro tier gated in controller) ───────────────────

  async getPriceHistory(cardId: string, days: 7 | 30 | 90 = 30) {
    await this.assertCardExists(cardId);

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const snapshots = await this.prisma.priceSnapshot.findMany({
      where: { cardId, snappedAt: { gte: since }, source: 'internal' },
      orderBy: { snappedAt: 'asc' },
      select: {
        snappedAt: true,
        priceArs: true,
        priceUsdt: true,
        confidence: true,
        sampleCount: true,
      },
    });

    // If not enough internal data, fall back to all sources
    const data = snapshots.length >= 3
      ? snapshots
      : await this.prisma.priceSnapshot.findMany({
          where: { cardId, snappedAt: { gte: since } },
          orderBy: { snappedAt: 'asc' },
          select: {
            snappedAt: true,
            priceArs: true,
            priceUsdt: true,
            confidence: true,
            sampleCount: true,
          },
        });

    return { cardId, days, dataPoints: data };
  }

  // ── Oracle refresh — called by cron job or after trade completion ──────────

  async refreshCardPrice(cardId: string): Promise<void> {
    const blueRate = await this.getBlueDollarRate();

    // Get internal trade prices (our moat)
    const internalTrades = await this.prisma.trade.findMany({
      where: {
        completedAt: { gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) },
        offer: {
          OR: [
            { offeredCards: { some: { cardId } } },
            { requestedCards: { some: { cardId } } },
          ],
        },
      },
      select: { cashDeltaArs: true, completedAt: true },
    });

    // Get external price snapshots (scraped)
    const externalSnapshots = await this.prisma.priceSnapshot.findMany({
      where: {
        cardId,
        source: { in: ['mercadolibre', 'facebook', 'tcgplayer'] },
        snappedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { snappedAt: 'desc' },
      take: 50,
    });

    if (!externalSnapshots.length && !internalTrades.length) {
      this.logger.warn(`No price data for card ${cardId}`);
      return;
    }

    // External: IQR outlier rejection
    const externalPrices = externalSnapshots.map((s) => Number(s.priceArs));
    const cleanExternal = this.iqrFilter(externalPrices, 1.5);
    const extMedian = this.median(cleanExternal);
    const extWeight = Math.min(cleanExternal.length / 10, 1);

    // Internal: exponential decay (recent trades weighted higher)
    let intWeighted = 0;
    if (internalTrades.length) {
      const decayed = internalTrades.map((t) => {
        const ageDays =
          (Date.now() - t.completedAt.getTime()) / 86_400_000;
        const decay = Math.exp(-ageDays / 14); // 14-day half-life
        return Number(t.cashDeltaArs ?? 0) * decay;
      });
      intWeighted = decayed.reduce((a, b) => a + b, 0) / internalTrades.length;
    }
    const intWeight = Math.min(internalTrades.length / 5, 1);

    // Get total platform trades for internal bias calculation
    const totalTrades = await this.prisma.trade.count();
    const internalBias = Math.min(totalTrades / 500, 0.8);

    const finalPriceArs =
      internalTrades.length > 0
        ? intWeighted * internalBias * intWeight +
          extMedian * (1 - internalBias) * extWeight
        : extMedian;

    const confidence = Math.min(
      cleanExternal.length * 0.04 + internalTrades.length * 0.15,
      1.0,
    );

    await this.prisma.priceSnapshot.create({
      data: {
        cardId,
        priceArs: finalPriceArs,
        priceUsdt: finalPriceArs / blueRate,
        source: 'internal',
        confidence,
        sampleCount: cleanExternal.length + internalTrades.length,
      },
    });

    this.logger.debug(
      `Price refreshed for ${cardId}: ${finalPriceArs.toFixed(0)} ARS (confidence ${(confidence * 100).toFixed(0)}%)`,
    );
  }

  // ── Store an external scraped price ───────────────────────────────────────

  async recordExternalPrice(
    cardId: string,
    priceArs: number,
    source: 'mercadolibre' | 'facebook' | 'tcgplayer',
    sourceUrl?: string,
  ) {
    const blueRate = await this.getBlueDollarRate();

    return this.prisma.priceSnapshot.create({
      data: {
        cardId,
        priceArs,
        priceUsdt: priceArs / blueRate,
        source,
        sourceUrl,
        confidence: 0.3, // external sources have lower base confidence
        sampleCount: 1,
      },
    });
  }

  // ── Blue dollar rate ───────────────────────────────────────────────────────

  async getBlueDollarRate(): Promise<number> {
    if (Date.now() - this.lastRateRefresh < this.RATE_TTL_MS) {
      return this.blueDollarRate;
    }

    try {
      const url = this.config.get(
        'BLUE_DOLLAR_API_URL',
        'https://dolarapi.com/v1/dolares/blue',
      );
      const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        const data = (await resp.json()) as { venta: number };
        this.blueDollarRate = data.venta;
        this.lastRateRefresh = Date.now();
        this.logger.debug(`Blue dollar rate: ${this.blueDollarRate} ARS/USD`);
      }
    } catch (err) {
      this.logger.warn('Failed to fetch blue dollar rate — using cached value');
    }

    return this.blueDollarRate;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async assertCardExists(cardId: string) {
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      select: { id: true },
    });
    if (!card) throw new NotFoundException(`Card ${cardId} not found`);
  }

  private aggregateSources(
    snapshots: { source: string; sampleCount: number | null }[],
  ) {
    const counts: Record<string, number> = {};
    for (const s of snapshots) {
      counts[s.source] = (counts[s.source] ?? 0) + (s.sampleCount ?? 1);
    }
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }

  /** Interquartile range filter — removes statistical outliers */
  private iqrFilter(values: number[], multiplier = 1.5): number[] {
    if (values.length < 4) return values;
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    return sorted.filter(
      (v) => v >= q1 - multiplier * iqr && v <= q3 + multiplier * iqr,
    );
  }

  private median(values: number[]): number {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }
}
