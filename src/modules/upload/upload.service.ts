import {
  Injectable,
  BadRequestException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { UploadResponseDto } from './dto';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_WIDTH = 1920;
const WEBP_QUALITY = 85;
const THUMB_SIZE = 300;

@Injectable()
export class UploadService implements OnModuleInit {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;
  private readonly logger = new Logger(UploadService.name);

  constructor(private readonly configService: ConfigService) {
    this.endpoint = this.configService.get<string>('s3.endpoint')!;
    this.bucket = this.configService.get<string>('s3.bucket')!;

    this.s3 = new S3Client({
      endpoint: this.endpoint,
      region: this.configService.get<string>('s3.region'),
      credentials: {
        accessKeyId: this.configService.get<string>('s3.accessKey')!,
        secretAccessKey: this.configService.get<string>('s3.secretKey')!,
      },
      forcePathStyle: true, // Required for MinIO
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Bucket "${this.bucket}" exists`);
    } catch (error: unknown) {
      const statusCode = (error as { $metadata?: { httpStatusCode?: number } })
        ?.$metadata?.httpStatusCode;
      if (statusCode === 404 || statusCode === 403) {
        this.logger.warn(
          `Bucket "${this.bucket}" not found, creating...`,
        );
        await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Bucket "${this.bucket}" created`);
      } else {
        this.logger.error(`Failed to check bucket: ${error}`);
      }
    }
  }

  async uploadImage(
    file: Express.Multer.File,
    folder: string,
  ): Promise<UploadResponseDto> {
    this.validateFile(file);

    const sanitizedFolder = this.sanitizeFolder(folder);
    const { original, thumbnail } = await this.processImage(file.buffer);

    const id = uuidv4();
    const key = `${sanitizedFolder}/${id}.webp`;
    const thumbKey = `${sanitizedFolder}/${id}_thumb.webp`;

    await Promise.all([
      this.uploadToS3(key, original, 'image/webp'),
      this.uploadToS3(thumbKey, thumbnail, 'image/webp'),
    ]);

    return {
      key,
      url: this.getFileUrl(key),
      thumbnailUrl: this.getFileUrl(thumbKey),
      size: original.length,
      mimeType: 'image/webp',
    };
  }

  async uploadImages(
    files: Express.Multer.File[],
    folder: string,
  ): Promise<UploadResponseDto[]> {
    return Promise.all(files.map((file) => this.uploadImage(file, folder)));
  }

  async deleteFile(key: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    // Try to delete associated thumbnail
    const thumbKey = key.replace(/\.webp$/, '_thumb.webp');
    if (thumbKey !== key) {
      try {
        await this.s3.send(
          new DeleteObjectCommand({ Bucket: this.bucket, Key: thumbKey }),
        );
      } catch {
        // Thumbnail may not exist
      }
    }
  }

  async deleteFiles(keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    const allKeys = keys.flatMap((key) => [
      key,
      key.replace(/\.webp$/, '_thumb.webp'),
    ]);

    await this.s3.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: {
          Objects: allKeys.map((Key) => ({ Key })),
        },
      }),
    );
  }

  async processImage(
    buffer: Buffer,
  ): Promise<{ original: Buffer; thumbnail: Buffer }> {
    const metadata = await sharp(buffer).metadata();

    // Resize if wider than MAX_WIDTH, convert to WebP
    let pipeline = sharp(buffer);
    if (metadata.width && metadata.width > MAX_WIDTH) {
      pipeline = pipeline.resize(MAX_WIDTH, undefined, {
        withoutEnlargement: true,
      });
    }

    let original: Buffer;
    try {
      original = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();
    } catch {
      // Fallback to JPEG if WebP encoding fails
      original = await pipeline.jpeg({ quality: WEBP_QUALITY }).toBuffer();
    }

    // Generate thumbnail (300x300, cover)
    const thumbnail = await sharp(buffer)
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover' })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    return { original, thumbnail };
  }

  async getFileBuffer(key: string): Promise<Buffer> {
    const response = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const stream = response.Body;
    if (!stream) {
      throw new BadRequestException('Файл не найден');
    }
    return Buffer.from(await stream.transformToByteArray());
  }

  getFileUrl(key: string): string {
    return `${this.endpoint}/${this.bucket}/${key}`;
  }

  private validateFile(file: Express.Multer.File): void {
    if (!file) {
      throw new BadRequestException('Файл не предоставлен');
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `Файл слишком большой. Максимальный размер: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Недопустимый тип файла. Разрешены: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }

    this.validateMagicBytes(file.buffer);
  }

  private validateMagicBytes(buffer: Buffer): void {
    if (buffer.length < 12) {
      throw new BadRequestException('Файл повреждён или слишком мал');
    }

    const isJpeg =
      buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

    const isPng =
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47;

    const isWebp =
      buffer[0] === 0x52 && // R
      buffer[1] === 0x49 && // I
      buffer[2] === 0x46 && // F
      buffer[3] === 0x46 && // F
      buffer[8] === 0x57 && // W
      buffer[9] === 0x45 && // E
      buffer[10] === 0x42 && // B
      buffer[11] === 0x50; // P

    if (!isJpeg && !isPng && !isWebp) {
      throw new BadRequestException(
        'Содержимое файла не соответствует допустимому формату изображения',
      );
    }
  }

  private async uploadToS3(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
  }

  private sanitizeFolder(folder: string): string {
    return folder
      .replace(/\.\./g, '')
      .replace(/^\/+|\/+$/g, '')
      .replace(/[^a-zA-Z0-9\-_/]/g, '');
  }
}
