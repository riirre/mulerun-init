#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.slice(2);
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = 'true';
    }
  }
  return args;
}

function toSlug(value, fallback) {
  if (!value) return fallback;
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || fallback
  );
}

function normalizeApp(value, fallback) {
  if (!value) return fallback;
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || fallback
  );
}

async function updatePackageJson(slug) {
  const path = join(projectRoot, 'package.json');
  if (!existsSync(path)) return;
  const raw = await readFile(path, 'utf8');
  const pkg = JSON.parse(raw);
  pkg.name = slug;
  if (pkg.scripts && pkg.scripts['pages:deploy']) {
    pkg.scripts['pages:deploy'] = `wrangler pages deploy dist --project-name=${slug}`;
  }
  await writeFile(path, `${JSON.stringify(pkg, null, 2)}\n`);
}

async function updateWranglerToml(slug) {
  const path = join(projectRoot, 'wrangler.toml');
  if (!existsSync(path)) return;
  const raw = await readFile(path, 'utf8');
  const next = raw.replace(/^(name\s*=\s*").*?(")/m, `$1${slug}$2`);
  await writeFile(path, next);
}

async function updateConfigFile(appSlug, title) {
  const path = join(projectRoot, 'src', 'config.ts');
  if (!existsSync(path)) return;
  let raw = await readFile(path, 'utf8');
  raw = raw.replace(/(DEFAULT_APP_SLUG\s*=\s*')[^']*(')/, `$1${appSlug}$2`);
  raw = raw.replace(/(PROJECT_TITLE\s*=\s*')[^']*(')/, `$1${title}$2`);
  await writeFile(path, raw);
}

async function updateReadme(title, appSlug) {
  const path = join(projectRoot, 'README.md');
  if (!existsSync(path)) return;
  let raw = await readFile(path, 'utf8');
  raw = raw.replace(/^# .+$/m, `# ${title}`);
  raw = raw.replace(/apps\/[a-z0-9-]+\/index\.html/g, `apps/${appSlug}/index.html`);
  await writeFile(path, raw);
}

async function updateMulerunConfig(slug) {
  const path = join(projectRoot, 'mulerun-config.env');
  if (!existsSync(path)) return;
  let raw = await readFile(path, 'utf8');
  raw = raw.replace(/^(PROJECT_NAME\s*=\s*).+$/m, `$1${slug}`);
  await writeFile(path, raw);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slug = toSlug(args.name || args.slug, 'init');
  const appSlug = normalizeApp(args.app, 'init');
  const title = (args.title || 'MuleRun iframe 项目模板').trim();

  await updatePackageJson(slug);
  await updateWranglerToml(slug);
  await updateConfigFile(appSlug, title);
  await updateReadme(title, appSlug);
  await updateMulerunConfig(slug);

  console.log('✅ 项目信息已更新：');
  console.log(`- package.json name: ${slug}`);
  console.log(`- wrangler.toml name: ${slug}`);
  console.log(`- 默认 iframe 应用: ${appSlug}`);
  console.log(`- 项目标题: ${title}`);
  console.log('');
  console.log('请逐步完成以下事项:');
  console.log('1. 更新 .dev.vars / mulerun-config.env 中的密钥与配置');
  console.log('2. 如需新页面，执行 npm run create:app <app-slug>');
  console.log('3. 运行 npm run build && npm run dev 进行本地验证');
}

main().catch((error) => {
  console.error('初始化失败：', error);
  process.exit(1);
});
