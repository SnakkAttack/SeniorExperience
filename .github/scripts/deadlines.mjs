#!/usr/bin/env node
/**
 * Senior Experience - Discord deadline board.
 *
 * Reads `due:` frontmatter from Assignments/, renders a deadline board, and keeps
 * a single pinned Discord message current by editing it in place. Posts a separate
 * @here alert only when something is due within a day or is freshly overdue.
 *
 * State lives in Discord: the pinned message authored by this bot IS the record.
 * Nothing is ever written back to the repo.
 *
 *   node .github/scripts/deadlines.mjs            post/edit for real
 *   node .github/scripts/deadlines.mjs --dry-run  print payloads, call nothing
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const DRY_RUN = process.argv.includes('--dry-run');

const ASSIGNMENTS_DIR = 'Assignments';
const TIMEZONE = 'America/Denver';
// Board lists anything due within this window. Overridable so a manual run can
// widen the view without editing the file.
const HORIZON_DAYS = Number(process.env.HORIZON_DAYS) || 7;
const ALERT_FLOOR_DAYS = -3; // stop pinging once something is this far overdue

const API = 'https://discord.com/api/v10';
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const APP_ID = process.env.DISCORD_APP_ID;

// First bucket whose `max` the day-count fits under. Order matters.
const BUCKETS = [
  { max: -1, emoji: '🔴', color: 0xed4245, label: (d) => `OVERDUE by ${plural(-d, 'day')}` },
  { max: 0, emoji: '🟠', color: 0xfaa61a, label: () => 'due TODAY' },
  { max: 1, emoji: '🟠', color: 0xfaa61a, label: () => 'due tomorrow' },
  { max: 3, emoji: '🟡', color: 0xfee75c, label: (d) => `due in ${plural(d, 'day')}` },
  { max: HORIZON_DAYS, emoji: '⚪', color: 0x5865f2, label: (d) => `due in ${plural(d, 'day')}` },
];

const warn = (msg) => console.warn(`warning: ${msg}`);

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------------------------------------------------------- dates --- */

/** Today's calendar date in TIMEZONE, as YYYY-MM-DD. en-CA formats that way. */
function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Whole days between two YYYY-MM-DD strings. Both are anchored to UTC midnight
 *  so DST transitions can't produce a 23- or 25-hour day and skew the count. */
function daysBetween(fromISO, toISO) {
  const from = Date.parse(`${fromISO}T00:00:00Z`);
  const to = Date.parse(`${toISO}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

const prettyDate = (iso) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${iso}T00:00:00Z`));

const bucketFor = (days) => BUCKETS.find((b) => days <= b.max) ?? null;

/* ----------------------------------------------------------------- notes --- */

/** Minimal YAML frontmatter reader: flat `key: value` pairs only, which is all
 *  this contract uses. Returns null unless the file opens with a `---` fence. */
function parseFrontmatter(text) {
  if (!text.startsWith('---')) return null;

  const openEnd = text.indexOf('\n');
  if (openEnd === -1) return null;

  const closeStart = text.indexOf('\n---', openEnd);
  if (closeStart === -1) return null;

  const fields = {};
  for (const line of text.slice(openEnd + 1, closeStart).split('\n')) {
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const value = match[2]
      .replace(/\s+#.*$/, '') // trailing comment
      .trim()
      .replace(/^["']|["']$/g, '');
    fields[match[1]] = value;
  }
  return fields;
}

async function findMarkdown(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return []; // directory absent is not an error; there's just nothing due
  }

  const found = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await findMarkdown(path)));
    else if (entry.isFile() && entry.name.endsWith('.md')) found.push(path);
  }
  return found;
}

/** The folder is the assignment; the filename is usually "Outline" or "Template"
 *  and would read as nonsense on the board. `title:` overrides when needed. */
function displayName(file) {
  const segment = relative(ASSIGNMENTS_DIR, file).split(/[\\/]/)[0];
  return segment.replace(/\.md$/, '');
}

async function collectAssignments() {
  const now = today();
  const items = [];

  for (const file of await findMarkdown(ASSIGNMENTS_DIR)) {
    const raw = (await readFile(file, 'utf8')).replace(/^﻿/, '').replace(/\r\n/g, '\n');
    const fields = parseFrontmatter(raw);

    if (!fields || String(fields.assignment).toLowerCase() !== 'true') continue;
    if (String(fields.status ?? '').toLowerCase() === 'submitted') continue;

    const due = fields.due ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || Number.isNaN(Date.parse(`${due}T00:00:00Z`))) {
      // One malformed note must never take the whole digest down with it.
      warn(`${file}: \`due\` is missing or malformed (${JSON.stringify(due)}) - skipped`);
      continue;
    }

    items.push({
      title: fields.title || displayName(file),
      due,
      days: daysBetween(now, due),
      path: file.replace(/\\/g, '/'),
    });
  }

  return items.sort((a, b) => a.due.localeCompare(b.due));
}

/* -------------------------------------------------------------- rendering --- */

function buildBoard(items) {
  const visible = items.filter((item) => item.days <= HORIZON_DAYS);
  if (visible.length === 0) return null; // silence rule: no empty daily post

  const lines = visible.map((item) => {
    const bucket = bucketFor(item.days);
    return (
      `${bucket.emoji} **${item.title}** - ${bucket.label(item.days)}\n` +
      `-# ${prettyDate(item.due)} · ${item.path}`
    );
  });

  return {
    embeds: [
      {
        title: '📅 Senior Experience - Deadlines',
        description: lines.join('\n\n'),
        color: bucketFor(visible[0].days).color, // soonest item sets the mood
        footer: { text: 'Updated every morning · edit due dates in the vault' },
        timestamp: new Date().toISOString(),
      },
    ],
    allowed_mentions: { parse: [] }, // the board never pings, only the alert does
  };
}

function buildAlert(items) {
  const urgent = items.filter((item) => item.days <= 1 && item.days >= ALERT_FLOOR_DAYS);
  if (urgent.length === 0) return null;

  const lines = urgent.map((item) => {
    const bucket = bucketFor(item.days);
    return `${bucket.emoji} **${item.title}** - ${bucket.label(item.days)} (${prettyDate(item.due)})`;
  });

  return {
    content: `@here\n${lines.join('\n')}`,
    allowed_mentions: { parse: ['everyone'] }, // required for @here to actually ping
  };
}

/* ------------------------------------------------------------------- api --- */

async function api(method, path, body) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bot ${TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'SeniorExperienceDeadlineBot (github.com/SnakkAttack/SeniorExperience, 1.0)',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after') ?? 1);
      warn(`rate limited by Discord, retrying in ${retryAfter}s`);
      await sleep(retryAfter * 1000 + 250);
      continue;
    }
    if (res.status === 401) {
      fail('Discord rejected the bot token. Reset it in the developer portal, then update the DISCORD_BOT_TOKEN secret.');
    }
    if (res.status === 403) {
      fail(`Discord returned 403 for ${method} ${path}. The bot is either not in the server, or lacks a permission on that channel.`);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`${method} ${path} -> ${res.status} ${detail.slice(0, 300)}`);
    }

    return res.status === 204 ? null : res.json();
  }
  throw new Error(`${method} ${path} kept getting rate limited - gave up`);
}

/** Discord is the state store. The bot's own pinned message is the board, so a
 *  deleted pin just means tomorrow's run rebuilds it. No state file, no drift. */
async function findPinnedBoard() {
  let pinned = [];
  try {
    const res = await api('GET', `/channels/${CHANNEL_ID}/messages/pins`);
    pinned = (res?.items ?? []).map((entry) => entry.message);
  } catch {
    const res = await api('GET', `/channels/${CHANNEL_ID}/pins`); // pre-2025 shape
    pinned = Array.isArray(res) ? res : [];
  }
  return pinned.find((message) => message?.author?.id === APP_ID) ?? null;
}

async function pin(messageId) {
  try {
    await api('PUT', `/channels/${CHANNEL_ID}/messages/pins/${messageId}`);
  } catch {
    await api('PUT', `/channels/${CHANNEL_ID}/pins/${messageId}`);
  }
}

/* ------------------------------------------------------------------ main --- */

const items = await collectAssignments();
const board = buildBoard(items);
const alert = buildAlert(items);

console.log(`${items.length} assignment(s) tracked, ${items.filter((i) => i.days <= HORIZON_DAYS).length} within ${HORIZON_DAYS} days`);

if (!board) {
  console.log(`Nothing due within ${HORIZON_DAYS} days. Staying quiet.`);
  process.exit(0);
}

if (DRY_RUN) {
  console.log('\n--- board ---\n' + JSON.stringify(board, null, 2));
  console.log('\n--- alert ---\n' + (alert ? JSON.stringify(alert, null, 2) : '(none)'));
  process.exit(0);
}

for (const [name, value] of Object.entries({ DISCORD_BOT_TOKEN: TOKEN, DISCORD_CHANNEL_ID: CHANNEL_ID, DISCORD_APP_ID: APP_ID })) {
  if (!value) fail(`${name} is not set`);
}

const existing = await findPinnedBoard();
if (existing) {
  await api('PATCH', `/channels/${CHANNEL_ID}/messages/${existing.id}`, board);
  console.log(`Edited pinned board ${existing.id}`);
} else {
  const created = await api('POST', `/channels/${CHANNEL_ID}/messages`, board);
  await pin(created.id);
  console.log(`Created and pinned board ${created.id}`);
}

if (alert) {
  await api('POST', `/channels/${CHANNEL_ID}/messages`, alert);
  console.log('Posted @here alert');
}
