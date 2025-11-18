#!/usr/bin/env node
import { cp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname);
const appsDir = join(projectRoot, 'apps');
const templateDir = join(appsDir, '_template');

function normalizeName(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function main() {
  const [, , rawName] = process.argv;

  if (!rawName) {
    console.error('请提供应用名称：npm run create:app my-app');
    process.exit(1);
  }

  const normalized = normalizeName(rawName);
  if (!normalized) {
    console.error('应用名称仅支持小写字母、数字与连字符');
    process.exit(1);
  }

  if (!existsSync(templateDir)) {
    console.error('未找到 apps/_template 模板目录，请先确认仓库结构');
    process.exit(1);
  }

  const targetDir = join(appsDir, normalized);
  if (existsSync(targetDir)) {
    console.error(`目标目录已存在：${targetDir}`);
    process.exit(1);
  }

  await mkdir(targetDir, { recursive: true });
  await cp(templateDir, targetDir, { recursive: true });

  console.log(`✅ 已创建新应用目录：apps/${normalized}`);
  console.log('请编辑 index.html / main.js / styles.css 以完成业务逻辑。');
}

main().catch((error) => {
  console.error('创建应用失败：', error);
  process.exit(1);
});
