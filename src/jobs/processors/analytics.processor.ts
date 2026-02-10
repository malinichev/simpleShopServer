import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';
import { AnalyticsService } from '@/modules/analytics/analytics.service';

export interface AnalyticsJobData {
  type: string;
  payload: Record<string, unknown>;
}

@Processor('analytics')
export class AnalyticsProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalyticsProcessor.name);

  constructor(
    @Inject(forwardRef(() => AnalyticsService))
    private readonly analyticsService: AnalyticsService,
  ) {
    super();
  }

  async process(job: Job<AnalyticsJobData>): Promise<void> {
    const { type, payload } = job.data;
    this.logger.log(`Processing analytics job ${job.id}: ${type}`);

    try {
      switch (type) {
        case 'track-event':
          await this.analyticsService.processTrackEvent(payload);
          break;

        case 'calculate-daily':
          await this.analyticsService.calculateDaily(
            payload.date ? new Date(payload.date as string) : new Date(),
          );
          break;

        default:
          this.logger.warn(`Unknown analytics job type: ${type}`);
      }

      this.logger.log(`Analytics job ${job.id} completed: ${type}`);
    } catch (error) {
      this.logger.error(`Analytics job ${job.id} failed: ${error}`);
      throw error;
    }
  }
}
