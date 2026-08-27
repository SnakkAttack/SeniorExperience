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
// 14 rather than 7: coursework lands weeks apart, and a board that is empty
// most mornings trains people to stop looking at it.
const HORIZON_DAYS = Number(process.env.HORIZON_DAYS) || 14;
const ALERT_FLOOR_DAYS = -3; // stop pinging once something is this far overdue

// Runs also fire on push, so the same alert can be generated many times a day.
// Comfortably under the 24h cron gap, so the daily reminder still lands.
const ALERT_DEDUPE_HOURS = 20;

// Doubles as the board's fingerprint when the pin is unavailable, so changing it
// orphans the current board and a fresh one gets posted.
const BOARD_TITLE = '📅 Senior Experience - Deadlines';

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
        title: BOARD_TITLE,
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

class HttpError extends Error {
  constructor(status, method, path, detail) {
    super(`${method} ${path} -> ${status}${detail ? ` ${detail}` : ''}`);
    this.status = status;
  }
}

const isFatal = (err) => err instanceof HttpError && (err.status === 401 || err.status === 403);

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
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new HttpError(res.status, method, path, detail.slice(0, 300));
    }

    return res.status === 204 ? null : res.json();
  }
  throw new Error(`${method} ${path} kept getting rate limited - gave up`);
}

const isOurBoard = (message) =>
  message?.author?.id === APP_ID && message?.embeds?.[0]?.title === BOARD_TITLE;

/** Discord is the state store - there is no state file to drift.
 *
 *  The pin is the preferred handle, but pinning needs Manage Messages, which a
 *  locked-down channel can revoke independently of the server-wide grant. So an
 *  unpinnable board must still be findable, or every morning posts a duplicate.
 *  Recent history is the fallback: slower, but it makes the pin purely cosmetic. */
async function findBoard() {
  const pinEndpoints = [`/channels/${CHANNEL_ID}/messages/pins`, `/channels/${CHANNEL_ID}/pins`];

  for (const path of pinEndpoints) {
    try {
      const res = await api('GET', path);
      // Newer API wraps each pin as { pinned_at, message }; the older one is a bare array.
      const messages = Array.isArray(res) ? res : (res?.items ?? []).map((entry) => entry.message);
      const found = messages.find(isOurBoard);
      if (found) return found;
    } catch (err) {
      if (isFatal(err)) throw err;
    }
  }

  try {
    const recent = await api('GET', `/channels/${CHANNEL_ID}/messages?limit=50`);
    return (Array.isArray(recent) ? recent : []).find(isOurBoard) ?? null;
  } catch (err) {
    if (isFatal(err)) throw err;
    return null;
  }
}

/** The board is edited in place, so re-running it is free. An alert is a new
 *  message that pings everyone, so re-running it is not. Push-triggered runs
 *  would otherwise ping once per push on the day something comes due. */
async function alertAlreadyPosted(alert) {
  try {
    const recent = await api('GET', `/channels/${CHANNEL_ID}/messages?limit=50`);
    const cutoff = Date.now() - ALERT_DEDUPE_HOURS * 3_600_000;
    return (Array.isArray(recent) ? recent : []).some(
      (message) =>
        message?.author?.id === APP_ID &&
        message?.content === alert.content &&
        Date.parse(message.timestamp) > cutoff
    );
  } catch (err) {
    if (isFatal(err)) throw err;
    return false; // a duplicate ping beats a missed deadline
  }
}

/** Best-effort. A board that failed to pin still works; it just scrolls away. */
async function pin(messageId) {
  for (const path of [`/channels/${CHANNEL_ID}/messages/pins/${messageId}`, `/channels/${CHANNEL_ID}/pins/${messageId}`]) {
    try {
      await api('PUT', path);
      return true;
    } catch {
      // Try the other endpoint shape before giving up.
    }
  }
  warn(
    'could not pin the board - the bot needs Manage Messages on this channel. ' +
      'The board still updates correctly (future runs find it by scanning recent messages), ' +
      'it just will not stay pinned to the top.'
  );
  return false;
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

try {
  const existing = await findBoard();

  if (existing) {
    await api('PATCH', `/channels/${CHANNEL_ID}/messages/${existing.id}`, board);
    console.log(`Edited board ${existing.id}`);
  } else {
    const created = await api('POST', `/channels/${CHANNEL_ID}/messages`, board);
    const pinned = await pin(created.id);
    console.log(`Created board ${created.id}${pinned ? ' and pinned it' : ' (unpinned)'}`);
  }

  if (alert) {
    if (await alertAlreadyPosted(alert)) {
      console.log('Identical @here alert already posted recently - staying quiet');
    } else {
      await api('POST', `/channels/${CHANNEL_ID}/messages`, alert);
      console.log('Posted @here alert');
    }
  }
} catch (err) {
  if (err.status === 401) {
    fail('Discord rejected the bot token. Reset it in the developer portal, then update the DISCORD_BOT_TOKEN secret.');
  }
  if (err.status === 403) {
    fail(`${err.message}\nThe bot is missing a permission on this channel. Check the channel-level overrides on #announcements - they beat the server-wide grant from the invite.`);
  }
  fail(err.message);
}
