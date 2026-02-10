import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

export interface AnalyticsJobData {
  type: string;
  payload: Record<string, unknown>;
}

@Processor('analytics')
export class AnalyticsProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalyticsProcessor.name);

  async process(job: Job<AnalyticsJobData>): Promise<void> {
    const { type, payload } = job.data;
    this.logger.log(`Processing analytics job ${job.id}: ${type}`);

    try {
      // TODO: реализовать обработку аналитики при создании AnalyticsModule
      this.logger.log(
        `Analytics job ${job.id} completed: ${type}, payload keys: ${Object.keys(payload).join(', ')}`,
      );
    } catch (error) {
      this.logger.error(`Analytics job ${job.id} failed: ${error}`);
      throw error;
    }
  }
}
