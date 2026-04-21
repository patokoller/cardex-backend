import { Module } from '@nestjs/common';
import { TradesService } from './trades.service';
import { TradesController } from './trades.controller';
import { TrustModule } from '../trust/trust.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TrustModule, NotificationsModule],
  controllers: [TradesController],
  providers: [TradesService],
  exports: [TradesService],
})
export class TradesModule {}
