import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  ImageRegenJob,
  ImageRegenJobStatus,
} from './entities/image-regen-job.entity';
import { StartImageRegenDto, AnalyzeImagesDto } from './dto';
import {
  IMAGE_GEN_DRIVER,
  ImageGenDriver,
  GarmentAnalysis,
} from './drivers/image-gen-driver.interface';
import { fetchImage, sniffMimeType } from './image-regen.utils';
import { ProductsService } from '@/modules/products/products.service';
import { SettingsService } from '@/modules/settings/settings.service';

/**
 * Тех-суффикс, который сервер добавляет к каждому промпту: формат карточки
 * магазина (3:4), сохранение вещи как есть (включая посадку/длину — размерный
 * образ), АКТИВНОЕ удаление ТОЛЬКО брендовых артефактов исходника (логотипы,
 * названия брендов, сайты/водяные знаки). Любой ДРУГОЙ текст, уже имеющийся
 * на фото — описания товара (маркетинговые подписи), размерные метки, инфо-
 * надписи, принты — воспроизводится в новом фото теми же словами и языком;
 * нового текста не добавляется.
 * См. docs/PRODUCT_PHOTO_STYLE.md.
 */
export const REGEN_TECH_SUFFIX =
  'Output: vertical 3:4 portrait lifestyle product photo, garment is the hero of the shot. ' +
  'Preserve the exact garment from the reference image — do not alter its colors, pattern, print, cut, length, fit or sizing look. ' +
  'Preserve the SUBJECT of the reference photo: a woman stays a woman, a man stays a man, ' +
  'and a body-part-only framing (torso / legs / close-up detail) keeps the same framing — ' +
  'do NOT swap gender or invent a full model where the reference shows only a body part. ' +
  'Preserve the model POSE and the CAMERA viewpoint of the reference photo: if the reference shows the model from the side, ' +
  'from the back or front-facing, the new photo must keep the same viewpoint and shooting direction — ' +
  'do NOT rotate the model toward the camera or change the camera angle. ' +
  'Remove ONLY brand artifacts from the photo: brand logos and brand names on the garment or props, ' +
  'website URLs and watermarks — reconstruct clean fabric or pattern where logos were, ' +
  'without changing the garment itself. ' +
  'KEEP and reproduce in the new photo every other piece of text that already exists in the reference — ' +
  'product descriptions and marketing captions, size markings, measurements, care or info labels, text prints — ' +
  'exactly as in the reference: same wording, same language, similar style and placement; ' +
  'do not alter, translate, shorten or remove it. ' +
  'Do NOT add any new text, logos, watermarks or price tags that are not in the reference photo.';

export const MAX_IMAGES_PER_JOB = 10;

@Injectable()
export class ImageRegenService {
  private readonly logger = new Logger(ImageRegenService.name);

  constructor(
    @InjectRepository(ImageRegenJob)
    private readonly repository: Repository<ImageRegenJob>,
    @InjectQueue('image-regen')
    private readonly regenQueue: Queue,
    @Inject(IMAGE_GEN_DRIVER)
    private readonly driver: ImageGenDriver | null,
    private readonly productsService: ProductsService,
    private readonly settingsService: SettingsService,
    private readonly configService: ConfigService,
  ) {}

  /** Полный промпт = [BASE STYLE] + [сцена админа] + [тех-суффикс]. */
  composePrompt(basePrompt: string, userPrompt: string): string {
    return [basePrompt.trim(), userPrompt.trim(), REGEN_TECH_SUFFIX]
      .filter(Boolean)
      .join('\n\n');
  }

  /**
   * Vision-анализ выбранных фото ПЕРЕД генерацией: что за вещь и какие
   * сцены/модель/интерьер подойдут под концепцию магазина (basePrompt из
   * настроек). Админ видит карточку анализа и готовый промпт сцены,
   * правит при желании — и только потом запускает генерацию.
   */
  async analyze(dto: AnalyzeImagesDto): Promise<GarmentAnalysis> {
    if (!this.driver) {
      throw new BadRequestException(
        'ИИ-генерация не настроена на сервере (задайте AI_IMAGE_DRIVER и AI_API_KEY)',
      );
    }

    const product = await this.productsService.findById(dto.productId);
    const byId = new Map((product.images || []).map((img) => [img.id, img]));
    const unknown = dto.imageIds.filter((id) => !byId.has(id));
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Фото не принадлежат товару: ${unknown.join(', ')}`,
      );
    }

    const settings = await this.settingsService.getSettings();
    const concept = settings.aiImagePrompts?.basePrompt || '';

    const images = await Promise.all(
      dto.imageIds.map(async (id) => {
        const buffer = await fetchImage(byId.get(id)!.url);
        return { buffer, mimeType: sniffMimeType(buffer) };
      }),
    );

    return this.driver.analyzeGarment({ images, concept });
  }

  async start(dto: StartImageRegenDto, userId: string): Promise<ImageRegenJob> {
    if (!this.driver) {
      throw new BadRequestException(
        'ИИ-генерация не настроена на сервере (задайте AI_IMAGE_DRIVER и AI_API_KEY)',
      );
    }

    const product = await this.productsService.findById(dto.productId);
    const byId = new Map((product.images || []).map((img) => [img.id, img]));
    const unknown = dto.imageIds.filter((id) => !byId.has(id));
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Фото не принадлежат товару: ${unknown.join(', ')}`,
      );
    }

    const settings = await this.settingsService.getSettings();
    const basePrompt = settings.aiImagePrompts?.basePrompt || '';
    const composedPrompt = this.composePrompt(basePrompt, dto.prompt);
    const model =
      this.driver.driverName === 'routerai'
        ? this.configService.get<string>('ai.imageModel') || 'routerai'
        : this.driver.driverName;

    const job = this.repository.create({
      status: ImageRegenJobStatus.PENDING,
      productId: dto.productId,
      prompt: dto.prompt,
      composedPrompt,
      model,
      items: dto.imageIds.map((id) => ({
        sourceImageId: id,
        sourceUrl: byId.get(id)!.url,
        variants: [],
      })),
      totalImages: dto.imageIds.length,
      createdBy: userId,
    });
    const saved = await this.repository.save(job);

    // Без автоповторов: генерация платная, упавшее фото фиксируется в items[].error
    await this.regenQueue.add(
      'process-image-regen',
      { jobId: saved.id, variantsPerImage: dto.variantsPerImage ?? 1 },
      { attempts: 1, removeOnComplete: 100, removeOnFail: 200 },
    );

    this.logger.log(
      `Image regen job ${saved.id} created: product=${dto.productId}, images=${dto.imageIds.length}, model=${model}`,
    );
    return saved;
  }

  /**
   * Конфиг для админки: включена ли генерация, какой драйвер/модель,
   * пресеты сцен и базовый промпт из настроек магазина.
   */
  async getConfig(): Promise<{
    enabled: boolean;
    driver: string | null;
    model: string;
    basePrompt: string;
    presets: Array<{ id: string; title: string; prompt: string }>;
  }> {
    const settings = await this.settingsService.getSettings();
    return {
      enabled: !!this.driver,
      driver: this.driver?.driverName ?? null,
      model:
        this.driver?.driverName === 'routerai'
          ? this.configService.get<string>('ai.imageModel') || 'routerai'
          : (this.driver?.driverName ?? ''),
      basePrompt: settings.aiImagePrompts?.basePrompt || '',
      presets: settings.aiImagePrompts?.presets || [],
    };
  }

  async findJobs(
    productId?: string,
    page = 1,
    limit = 20,
  ): Promise<{
    data: ImageRegenJob[];
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  }> {
    const [data, total] = await this.repository.findAndCount({
      where: productId ? { productId } : undefined,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    };
  }

  async findJob(id: string): Promise<ImageRegenJob> {
    const job = await this.repository.findOne({ where: { id } });
    if (!job) {
      throw new NotFoundException('Задача регенерации не найдена');
    }
    return job;
  }
}
