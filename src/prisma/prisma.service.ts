import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Prisma connected to PostgreSQL');

    // Log slow queries in development
    if (process.env.NODE_ENV !== 'production') {
      (this.$on as any)('query', (e: { duration: number; query: string }) => {
        if (e.duration > 200) {
          this.logger.warn(
            `Slow query (${e.duration}ms): ${e.query.slice(0, 120)}`,
          );
        }
      });
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Prisma disconnected');
  }

  // ── Geo helpers (PostGIS raw queries) ──────────────────────────────────────

  /**
   * Returns user IDs within radiusMeters of the given lat/lng.
   * Uses PostGIS ST_DWithin with geography type for accurate distance.
   */
  async findUsersWithinRadius(
    lat: number,
    lng: number,
    radiusMeters: number,
  ): Promise<{ id: string; distance_m: number }[]> {
    return this.$queryRaw`
      SELECT id, ST_Distance(
        ST_MakePoint(longitude, latitude)::geography,
        ST_MakePoint(${lng}, ${lat})::geography
      ) AS distance_m
      FROM users
      WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        AND ST_DWithin(
          ST_MakePoint(longitude, latitude)::geography,
          ST_MakePoint(${lng}, ${lat})::geography,
          ${radiusMeters}
        )
      ORDER BY distance_m ASC
    `;
  }

  /**
   * Returns distance in metres between two user locations.
   */
  async distanceBetweenUsers(
    userAId: string,
    userBId: string,
  ): Promise<number | null> {
    const result: { dist: number | null }[] = await this.$queryRaw`
      SELECT ST_Distance(
        ST_MakePoint(a.longitude, a.latitude)::geography,
        ST_MakePoint(b.longitude, b.latitude)::geography
      ) AS dist
      FROM users a, users b
      WHERE a.id = ${userAId}::uuid
        AND b.id = ${userBId}::uuid
        AND a.latitude IS NOT NULL AND b.latitude IS NOT NULL
    `;
    return result[0]?.dist ?? null;
  }
}
