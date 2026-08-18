#!/usr/bin/env node
/**
 * sync.js — one-way sync: content/posts/*.md  →  Ghost (Admin API)
 *
 * The repo is the source of truth. Every post this script manages is tagged
 * with the internal tag #repo, which gives it a safe namespace inside Ghost:
 * it never touches posts you create by hand in Ghost Admin.
 *
 * Env:
 *   GHOST_URL             e.g. https://yoursite.ghost.io (admin domain)
 *   GHOST_ADMIN_API_KEY   from a Custom Integration (Settings → Integrations)
 *   SYNC_PRUNE=true       (or --prune) delete #repo posts removed from the repo
 *
 * Frontmatter is documented in README.md.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import GhostAdminAPI from '@tryghost/admin-api';
import matter from 'gray-matter';
import { marked } from 'marked';

const GHOST_URL = process.env.GHOST_URL;
const GHOST_KEY = process.env.GHOST_ADMIN_API_KEY;
const PRUNE = process.argv.includes('--prune') || process.env.SYNC_PRUNE === 'true';

const CONTENT_DIR = 'content/posts';
const CACHE_FILE = '.sync-cache.json';
const REPO_TAG = '#repo'; // internal tag; slug becomes "hash-repo"

if (!GHOST_URL || !GHOST_KEY) {
  console.error('Missing GHOST_URL or GHOST_ADMIN_API_KEY environment variables.');
  process.exit(1);
}

const api = new GhostAdminAPI({ url: GHOST_URL, key: GHOST_KEY, version: 'v6.0' });
marked.setOptions({ gfm: true });

/* ---------------------------------- cache ---------------------------------- */
// { images: { "<relpath>#<hash>": "<ghost-url>" }, posts: { "<slug>": "<hash>" } }

async function loadCache() {
  try {
    return JSON.parse(await fs.readFile(CACHE_FILE, 'utf8'));
  } catch {
    return { images: {}, posts: {} };
  }
}

async function saveCache(cache) {
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2) + '\n');
}

const sha = (buf) => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10);

/* ---------------------------------- images --------------------------------- */

function isRemote(src) {
  return /^(https?:)?\/\//.test(src) || src.startsWith('data:') || src.startsWith('/content/');
}

async function uploadImage(localPath, cache) {
  const rel = path.relative('.', localPath);
  const buf = await fs.readFile(localPath); // throws loudly if the file is missing
  const key = `${rel}#${sha(buf)}`;
  if (cache.images[key]) return cache.images[key];
  const res = await api.images.upload({ file: path.resolve(localPath) });
  cache.images[key] = res.url;
  console.log(`  ↑ image ${rel} → ${res.url}`);
  return res.url;
}

/**
 * Rewrite local image references (markdown and inline <img>) to Ghost CDN URLs,
 * uploading each image once per content-hash.
 */
async function resolveImages(markdown, mdDir, cache) {
  const refs = new Set();
  const mdImg = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const htmlImg = /<img[^>]+src=["']([^"']+)["']/g;
  for (const re of [mdImg, htmlImg]) {
    for (const m of markdown.matchAll(re)) if (!isRemote(m[1])) refs.add(m[1]);
  }
  let out = markdown;
  for (const src of refs) {
    const url = await uploadImage(path.resolve(mdDir, src), cache);
    out = out.split(`(${src})`).join(`(${url})`).split(`"${src}"`).join(`"${url}"`).split(`'${src}'`).join(`'${url}'`);
  }
  return out;
}

/* ---------------------------------- posts ---------------------------------- */

function buildPayload(fm, html, slug) {
  const tags = [...new Set([...(fm.tags ?? []), REPO_TAG])];
  const payload = {
    title: fm.title,
    slug,
    html,
    status: fm.status ?? 'draft',
    tags,
    visibility: fm.visibility ?? 'public',
  };
  if (fm.published_at) payload.published_at = new Date(fm.published_at).toISOString();
  if (fm.excerpt) payload.custom_excerpt = fm.excerpt;
  if (fm.feature_image) payload.feature_image = fm.feature_image;
  if (fm.feature_image_alt) payload.feature_image_alt = fm.feature_image_alt;
  if (fm.feature_image_caption) payload.feature_image_caption = fm.feature_image_caption;
  if (fm.meta_title) payload.meta_title = fm.meta_title;
  if (fm.meta_description) payload.meta_description = fm.meta_description;
  if (fm.canonical_url) payload.canonical_url = fm.canonical_url;
  if (fm.featured) payload.featured = true;
  return payload;
}

async function syncFile(file, cache) {
  const raw = await fs.readFile(file, 'utf8');
  const { data: fm, content } = matter(raw);

  if (!fm.title) throw new Error(`${file}: frontmatter needs at least "title"`);
  const slug = fm.slug ?? path.basename(file, path.extname(file));

  // Feature image may be a local path too
  if (fm.feature_image && !isRemote(fm.feature_image)) {
    fm.feature_image = await uploadImage(path.resolve(path.dirname(file), fm.feature_image), cache);
  }

  const markdown = await resolveImages(content, path.dirname(file), cache);
  const html = marked.parse(markdown);
  const payload = buildPayload(fm, html, slug);

  // Skip untouched posts: hash covers rendered html + everything Ghost stores
  const hash = sha(JSON.stringify(payload));
  if (cache.posts[slug] === hash) {
    console.log(`= ${slug} (unchanged)`);
    return slug;
  }

  const existing = await api.posts.read({ slug }).catch(() => null);

  // Newsletter send happens only on the draft → published transition, and only
  // if the frontmatter explicitly asks for it. Ghost never re-sends an email
  // for a post that has already gone out.
  const options = { source: 'html' };
  const publishingNow =
    payload.status === 'published' && (!existing || existing.status === 'draft' || existing.status === 'scheduled');
  if (fm.email && publishingNow) {
    options.newsletter = fm.email === true ? 'default-newsletter' : fm.email;
    if (fm.email_segment) options.email_segment = fm.email_segment;
    console.log(`  ✉ will send as newsletter "${options.newsletter}"`);
  }

  if (existing) {
    await api.posts.edit({ id: existing.id, updated_at: existing.updated_at, ...payload }, options);
    console.log(`~ updated ${slug}`);
  } else {
    await api.posts.add(payload, options);
    console.log(`+ created ${slug}`);
  }

  cache.posts[slug] = hash;
  return slug;
}

async function prune(localSlugs, cache) {
  const remote = await api.posts.browse({ filter: 'tag:hash-repo', limit: 'all', fields: 'id,slug,title' });
  for (const post of remote) {
    if (!localSlugs.has(post.slug)) {
      await api.posts.delete({ id: post.id });
      delete cache.posts[post.slug];
      console.log(`- deleted ${post.slug} (no longer in repo)`);
    }
  }
}

/* ----------------------------------- main ----------------------------------- */

const cache = await loadCache();
const files = (await fs.readdir(CONTENT_DIR))
  .filter((f) => /\.(md|markdown)$/.test(f))
  .map((f) => path.join(CONTENT_DIR, f))
  .sort();

console.log(`Syncing ${files.length} post(s) → ${GHOST_URL}\n`);

const localSlugs = new Set();
let failed = false;

for (const file of files) {
  try {
    localSlugs.add(await syncFile(file, cache));
  } catch (err) {
    failed = true;
    console.error(`✗ ${file}: ${err.message ?? err}`);
  }
}

if (PRUNE && !failed) await prune(localSlugs, cache);
if (PRUNE && failed) console.log('\nSkipping prune because some posts failed to sync.');

await saveCache(cache);
console.log('\nDone.');
if (failed) process.exit(1);
