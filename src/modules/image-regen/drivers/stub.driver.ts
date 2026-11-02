import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import {
  ImageEditInput,
  GeneratedImage,
  ImageGenDriver,
  AnalyzeGarmentInput,
  GarmentAnalysis,
} from './image-gen-driver.interface';

/**
 * Локальная заглушка ИИ-генерации: рисует sharp'ом вертикальную плашку
 * с градиентом (цвет — хэш промпта) и его текстом. Внешних вызовов нет —
 * полный флоу модуля (анализ → job → S3 → карточка 3:4) работает без ключа.
 * Активируется AI_IMAGE_DRIVER=stub (безопасный дефолт).
 */
@Injectable()
export class StubImageDriver implements ImageGenDriver {
  readonly driverName = 'stub';

  /** Детерминированный «анализ»: помечен как stub, сцены — примеры концепции. */
  async analyzeGarment(input: AnalyzeGarmentInput): Promise<GarmentAnalysis> {
    return {
      garmentType: `Домашняя одежда (stub-анализ, фото: ${input.images.length})`,
      color: 'цвет по фото не распознан — заглушка',
      styleMood: 'уютное домашнее настроение',
      modelNote: 'девушка 25–35, спокойная естественная внешность',
      notes: 'Stub-драйвер: подключите AI_IMAGE_DRIVER=openai для реального анализа фото',
      scenes: [
        {
          title: 'Чай перед сном (stub)',
          prompt:
            'The model sits in a cozy bedroom holding a cup of herbal tea, warm lamp light, calm bedtime mood.',
        },
        {
          title: 'Утро дома (stub)',
          prompt:
            'Fresh morning at home: the model stretches near a window with sheer curtains, sunlight on wooden floor.',
        },
      ],
    };
  }

  async editImage(input: ImageEditInput): Promise<GeneratedImage[]> {
    const n = Math.max(1, Math.min(2, input.n));
    const results: GeneratedImage[] = [];
    for (let i = 0; i < n; i++) {
      results.push({ buffer: await this.renderPlaceholder(input.prompt, i) });
    }
    return results;
  }

  private async renderPlaceholder(prompt: string, seed: number): Promise<Buffer> {
    const hue = (this.hashString(prompt) + seed * 137) % 360;
    const snippet = this.escapeXml(prompt.slice(0, 120));
    const words = snippet.split(/(\s+)/).reduce<string[]>((lines, word) => {
      const last = lines[lines.length - 1];
      if (last && (last + word).length <= 26) {
        lines[lines.length - 1] = last + word;
      } else {
        lines.push(word.trimStart());
      }
      return lines;
    }, []);
    const textLines = words
      .slice(0, 6)
      .map(
        (line, i) =>
          `<text x="512" y="${560 + i * 64}" font-family="sans-serif" font-size="44" fill="#ffffff" opacity="0.92" text-anchor="middle">${this.escapeXml(line)}</text>`,
      )
      .join('');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue}, 62%, 72%)"/>
      <stop offset="100%" stop-color="hsl(${(hue + 48) % 360}, 58%, 38%)"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1536" fill="url(#g)"/>
  <rect x="72" y="72" width="880" height="1392" rx="36" fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="4"/>
  <text x="512" y="300" font-family="sans-serif" font-size="64" font-weight="bold" fill="#ffffff" text-anchor="middle">AI STUB</text>
  <text x="512" y="372" font-family="sans-serif" font-size="30" fill="#ffffff" opacity="0.8" text-anchor="middle">image-regen placeholder</text>
  ${textLines}
</svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  private hashString(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = (hash * 31 + value.charCodeAt(i)) % 100000;
    }
    return hash;
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
