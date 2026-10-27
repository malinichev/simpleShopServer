#!/usr/bin/env node
/**
 * pre-commit хук server: держит контракт и типы фронтов в синхроне.
 *
 * Срабатывает ТОЛЬКО если среди staged файлов есть API-поверхность
 * (controllers / dto / entities / swagger-конфиг). Тогда:
 *   1. pnpm openapi:export          → ../openapi.json (+ .yaml)
 *   2. admin:  pnpm gen:api         → src/shared/api/generated/ (orval)
 *   3. client: npm run gen:api      → src/shared/api/generated/ (rtk-codegen)
 *
 * Если артефакты изменились — коммит блокируется: хук не может коммитить в
 * чужие репозитории (корень/admin/client), разработчик коммитит их сам и
 * повторяет коммит server (повторный прогон увидит чистое дерево).
 *
 * Отказ инфраструктуры (docker dev-стек не поднят, нет node_modules во фронтах)
 * НЕ блокирует коммит — печатает предупреждение с командами догоняющей синхронизации.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const monoRoot = resolve(serverRoot, '..');
const adminRoot = resolve(monoRoot, 'admin');
const clientRoot = resolve(monoRoot, 'client');

/** Файлы, влияющие на форму API-контракта. */
const API_SURFACE = [
  /^src\/.*\.(controller|dto|entity)\.ts$/,
  /^src\/config\/swagger\.config\.ts$/,
  /^src\/common\/(dto|decorators)\/.*\.ts$/,
];

function stagedFiles() {
  const result = spawnSync(
    'git',
    ['diff', '--cached', '--name-only'],
    { cwd: serverRoot, encoding: 'utf8' },
  );
  if (result.status !== 0) return null;
  return result.stdout.split('\n').filter(Boolean);
}

function run(cmd, args, cwd) {
  return spawnSync(cmd, args, { cwd, stdio: 'inherit' });
}

function dirtyPaths(repo, paths) {
  const result = spawnSync(
    'git',
    ['-C', repo, 'status', '--porcelain', '--', ...paths],
    { encoding: 'utf8' },
  );
  return result.status === 0 ? result.stdout.trim() : '';
}

const files = stagedFiles();
if (files === null) process.exit(0); // не смогли прочитать индекс — не блокируем

const touchesApi = files.some((f) => API_SURFACE.some((re) => re.test(f)));
if (!touchesApi) process.exit(0); // коммит не касается API — тихо пропускаем

console.log(
  '[api-sync] среди staged есть API-файлы — синхронизирую контракт и типы фронтов...',
);

// 1. Экспорт контракта (нужен поднятый dev-стек: postgres + redis).
if (run('pnpm', ['openapi:export'], serverRoot).status !== 0) {
  console.error('');
  console.error('⚠️  [api-sync] openapi:export НЕ выполнен (docker dev-стек поднят?).');
  console.error('    Коммит пропущен без синхронизации. Догони как можно скорее:');
  console.error('      docker compose -f server/docker-compose.dev.yml up -d postgres redis');
  console.error('      pnpm api:generate   # из корня монорепо');
  console.error('    и закоммить артефакты: openapi.json (корень) + generated/ (admin, client).');
  console.error('');
  process.exit(0);
}

// 2. Генерация типов/хуков во фронтах (docker не нужен).
const frontendJobs = [
  { cwd: adminRoot, cmd: 'pnpm', args: ['gen:api'], label: 'admin' },
  { cwd: clientRoot, cmd: 'npm', args: ['run', 'gen:api'], label: 'client' },
];
for (const job of frontendJobs) {
  if (!existsSync(job.cwd) || !existsSync(resolve(job.cwd, 'node_modules'))) {
    console.warn(`⚠️  [api-sync] ${job.label} недоступен/не установлен — генерация пропущена.`);
    continue;
  }
  if (run(job.cmd, job.args, job.cwd).status !== 0) {
    console.warn(`⚠️  [api-sync] генерация в ${job.label} не удалась — пропущена.`);
  }
}

// 3. Артефакты изменились → блокируем коммит с инструкцией.
const artifactChecks = [
  {
    repo: monoRoot,
    paths: ['openapi.json', 'openapi.yaml'],
    hint: 'корень (siteWithAdmin): git add openapi.json openapi.yaml',
  },
  {
    repo: adminRoot,
    paths: ['src/shared/api/generated'],
    hint: 'admin: git add src/shared/api/generated',
  },
  {
    repo: clientRoot,
    paths: ['src/shared/api/generated'],
    hint: 'client: git add src/shared/api/generated',
  },
];

const changed = artifactChecks.filter(
  (check) => existsSync(check.repo) && dirtyPaths(check.repo, check.paths) !== '',
);

if (changed.length > 0) {
  console.error('');
  console.error('❌ [api-sync] изменение API меняет контракт/сгенерированный код.');
  console.error('    Хук не может коммитить в другие репозитории — сделай это сам:');
  for (const check of changed) {
    console.error(`      cd ${check.repo.replace(monoRoot, '.')} && ${check.hint}`);
  }
  console.error('    Затем повтори коммит в server — повторный прогон пройдёт чисто.');
  console.error('');
  process.exit(1);
}

console.log('[api-sync] контракт и типы фронтов актуальны ✓');
