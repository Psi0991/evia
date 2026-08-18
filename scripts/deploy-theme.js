#!/usr/bin/env node
/**
 * deploy-theme.js — zip theme/ and upload it to Ghost via the Admin API.
 * Activates the theme after upload unless --no-activate is passed.
 *
 * Env: GHOST_URL, GHOST_ADMIN_API_KEY (same custom integration as sync.js)
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import GhostAdminAPI from '@tryghost/admin-api';

const GHOST_URL = process.env.GHOST_URL;
const GHOST_KEY = process.env.GHOST_ADMIN_API_KEY;
const ACTIVATE = !process.argv.includes('--no-activate');

if (!GHOST_URL || !GHOST_KEY) {
  console.error('Missing GHOST_URL or GHOST_ADMIN_API_KEY environment variables.');
  process.exit(1);
}

const themeDir = 'theme';
const name = JSON.parse(fs.readFileSync(path.join(themeDir, 'package.json'), 'utf8')).name;
const zipPath = path.resolve(`dist/${name}.zip`);

fs.mkdirSync('dist', { recursive: true });
fs.rmSync(zipPath, { force: true });
execSync(`cd ${themeDir} && zip -r -X ${zipPath} . -x "node_modules/*" -x ".*"`, { stdio: 'inherit' });

const api = new GhostAdminAPI({ url: GHOST_URL, key: GHOST_KEY, version: 'v6.0' });

const uploaded = await api.themes.upload({ file: zipPath });
console.log(`Uploaded theme "${uploaded.name}" (${uploaded.package?.version ?? 'unversioned'})`);

if (ACTIVATE) {
  await api.themes.activate(uploaded.name);
  console.log(`Activated "${uploaded.name}".`);
}
