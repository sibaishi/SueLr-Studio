#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ensureDependencies,
  ensureNodeVersion,
  fail,
  print,
  rootDir,
  runNpmChecked,
} from './local-web-common.mjs';

async function main() {
  const distDir = resolve(rootDir, 'dist');
  const indexHtml = resolve(distDir, 'index.html');

  print('');
  print('SueLr Studio Local-Web Build');
  print('============================');

  ensureNodeVersion();
  await ensureDependencies();

  await runNpmChecked(['run', 'build'], { cwd: rootDir });

  if (!existsSync(indexHtml)) {
    fail(`Build completed but ${indexHtml} was not generated.`);
  }

  print(`[ready] local-web assets built at ${distDir}`);
}

main().catch((error) => {
  fail(error?.message || String(error));
});
