import { DataSource } from 'typeorm';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Page } from '@/modules/pages/entities/page.entity';

interface LegalContext {
  brandName: string;
  supportEmail: string;
  legalEntityName: string;
  legalEntityInn: string;
  legalEntityAddress: string;
  siteUrl: string;
  currentDate: string;
}

interface LegalPageJson {
  slug: string;
  title: string;
  metaTitle?: string;
  metaDescription?: string;
  isPublished?: boolean;
  content: object;
}

function buildContext(): LegalContext {
  return {
    brandName: process.env.BRAND_NAME || 'My Shop',
    supportEmail: process.env.SUPPORT_EMAIL || 'support@example.com',
    legalEntityName:
      process.env.LEGAL_ENTITY_NAME || 'TODO: укажите юридическое лицо',
    legalEntityInn: process.env.LEGAL_ENTITY_INN || 'TODO',
    legalEntityAddress:
      process.env.LEGAL_ENTITY_ADDRESS || 'TODO: юридический адрес',
    siteUrl: process.env.WEB_URL || 'http://localhost:3002',
    currentDate: new Date().toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  };
}

function renderPlaceholders(input: string, ctx: LegalContext): string {
  return input.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = (ctx as unknown as Record<string, string>)[key];
    return value !== undefined ? value : `{{${key}}}`;
  });
}

function deepRender(value: unknown, ctx: LegalContext): unknown {
  if (typeof value === 'string') return renderPlaceholders(value, ctx);
  if (Array.isArray(value)) return value.map((v) => deepRender(v, ctx));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        deepRender(v, ctx),
      ]),
    );
  }
  return value;
}

export async function seedLegalPages(dataSource: DataSource): Promise<void> {
  const ctx = buildContext();
  const presetDir = join(__dirname, 'presets', 'legal');
  const files = readdirSync(presetDir).filter((f) => f.endsWith('.json'));

  const pageRepo = dataSource.getRepository(Page);
  const created: string[] = [];

  for (const file of files) {
    const raw = readFileSync(join(presetDir, file), 'utf-8');
    const json = JSON.parse(raw) as LegalPageJson;
    const rendered = deepRender(json, ctx) as LegalPageJson;

    // Не перезаписываем уже существующие — пользователь мог отредактировать через admin.
    const existing = await pageRepo.findOne({ where: { slug: rendered.slug } });
    if (existing) continue;

    await pageRepo.save(
      pageRepo.create({
        slug: rendered.slug,
        title: rendered.title,
        metaTitle: rendered.metaTitle,
        metaDescription: rendered.metaDescription,
        content: rendered.content,
        isPublished: rendered.isPublished ?? true,
      }),
    );
    created.push(rendered.slug);
  }

  console.log(
    `  Seeded ${created.length} legal pages: ${created.join(', ') || '(all already exist)'}`,
  );
}
