#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_LEADS_PATH = path.join(REPO_ROOT, 'data', 'course-leads-enriched.json');
const FALLBACK_LEADS_PATH = path.join(REPO_ROOT, 'data', 'course-leads.json');
const DEFAULT_TEMPLATE_PATH = path.join(REPO_ROOT, 'emails', 'outreach', 'scramble-pitch.html');
const DEFAULT_LOG_PATH = path.join(REPO_ROOT, 'data', 'outreach-log.json');
const RESEND_URL = 'https://api.resend.com/emails';

function parseArgs(argv) {
  const options = {
    states: [],
    segments: [],
    leadsPath: '',
    templatePath: '',
    logPath: DEFAULT_LOG_PATH,
    subject: '',
    from: 'Waggle <hello@betwaggle.com>',
    refCode: '',
    limit: 0,
    dryRun: false,
  };

  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    const idx = arg.indexOf('=');
    if (idx === -1 || !arg.startsWith('--')) continue;
    const key = arg.slice(2, idx).trim();
    const rawVal = arg.slice(idx + 1).trim();

    if (key === 'state' || key === 'states') {
      options.states = rawVal.split(',').map((v) => v.trim().toUpperCase()).filter(Boolean);
    } else if (key === 'segment' || key === 'segments') {
      options.segments = rawVal.split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
    } else if (key === 'leads') {
      options.leadsPath = rawVal;
    } else if (key === 'template') {
      options.templatePath = rawVal;
    } else if (key === 'log') {
      options.logPath = rawVal;
    } else if (key === 'subject') {
      options.subject = rawVal;
    } else if (key === 'from') {
      options.from = rawVal;
    } else if (key === 'ref-code') {
      options.refCode = rawVal;
    } else if (key === 'limit') {
      options.limit = Number.parseInt(rawVal, 10) || 0;
    }
  }

  return options;
}

function printHelp() {
  console.log(`send-outreach.js

Usage:
  node scripts/send-outreach.js [options]

Options:
  --state=FL,TX              Filter by state code(s)
  --segment=public,private   Filter by segment(s)
  --leads=path/to/leads.json Leads JSON file (default: data/course-leads-enriched.json)
  --template=path/to.html    HTML template (default: emails/outreach/scramble-pitch.html)
  --subject="..."            Email subject (required)
  --from="Name <email>"      Sender (default: Waggle <hello@betwaggle.com>)
  --ref-code=ABC123          Default ref code merge value
  --limit=100                Max sends
  --dry-run                  Render/log without calling Resend
  --log=path/to/log.json     Output log JSON (default: data/outreach-log.json)
  --help                     Show this help
`);
}

function resolvePathMaybe(relativeOrAbs) {
  if (!relativeOrAbs) return '';
  return path.isAbsolute(relativeOrAbs) ? relativeOrAbs : path.join(REPO_ROOT, relativeOrAbs);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function normalizeLead(lead) {
  const email = String(
    lead.email ||
    lead.contact_email ||
    lead.contactEmail ||
    lead.pro_email ||
    ''
  ).trim().toLowerCase();

  const clubName = String(lead.club_name || lead.club || lead.course_name || lead.name || '').trim();
  const courseName = String(lead.course_name || lead.name || clubName).trim();

  let firstName = String(
    lead.first_name ||
    lead.firstName ||
    lead.contact_first_name ||
    ''
  ).trim();

  if (!firstName && email.includes('@')) {
    firstName = email.split('@')[0].split(/[._-]/)[0] || '';
  }

  if (!firstName) firstName = 'there';
  firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  return {
    ...lead,
    email,
    first_name: firstName,
    club_name: clubName,
    course_name: courseName,
    state: String(lead.state || '').trim().toUpperCase(),
    segment: String(lead.segment || '').trim().toLowerCase(),
    city: String(lead.city || '').trim(),
  };
}

function renderTemplate(template, merge) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const value = merge[key];
    return value == null ? '' : String(value);
  });
}

function filterLeads(leads, options) {
  let filtered = leads;

  if (options.states.length > 0) {
    const allowed = new Set(options.states);
    filtered = filtered.filter((lead) => allowed.has(lead.state));
  }

  if (options.segments.length > 0) {
    const allowed = new Set(options.segments);
    filtered = filtered.filter((lead) => allowed.has(lead.segment));
  }

  if (options.limit > 0) {
    filtered = filtered.slice(0, options.limit);
  }

  return filtered;
}

async function readJsonArray(filePath, label) {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON array: ${filePath}`);
  }
  return parsed;
}

async function appendLogEntries(logPath, entries) {
  await fs.mkdir(path.dirname(logPath), { recursive: true });

  let current = [];
  if (await fileExists(logPath)) {
    try {
      current = await readJsonArray(logPath, 'Outreach log');
    } catch (err) {
      throw new Error(`Unable to parse log file ${logPath}: ${err.message}`);
    }
  }

  const combined = current.concat(entries);
  await fs.writeFile(logPath, JSON.stringify(combined, null, 2));
}

async function sendViaResend({ apiKey, from, to, subject, html }) {
  const response = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return { ok: response.ok, status: response.status, payload };
}

async function loadLeads(leadsPath) {
  const absolutePath = resolvePathMaybe(leadsPath);
  if (absolutePath) {
    return { path: absolutePath, leads: await readJsonArray(absolutePath, 'Leads file') };
  }

  if (await fileExists(DEFAULT_LEADS_PATH)) {
    return { path: DEFAULT_LEADS_PATH, leads: await readJsonArray(DEFAULT_LEADS_PATH, 'Leads file') };
  }

  if (await fileExists(FALLBACK_LEADS_PATH)) {
    return { path: FALLBACK_LEADS_PATH, leads: await readJsonArray(FALLBACK_LEADS_PATH, 'Leads file') };
  }

  throw new Error(`No leads file found. Checked ${DEFAULT_LEADS_PATH} and ${FALLBACK_LEADS_PATH}`);
}

async function main() {
  const options = parseArgs(process.argv);

  if (options.help) {
    printHelp();
    return;
  }

  if (!options.subject) {
    throw new Error('Missing required --subject');
  }

  const templatePath = resolvePathMaybe(options.templatePath) || DEFAULT_TEMPLATE_PATH;
  const logPath = resolvePathMaybe(options.logPath) || DEFAULT_LOG_PATH;
  const resendApiKey = process.env.RESEND_API_KEY || '';

  if (!options.dryRun && !resendApiKey) {
    throw new Error('RESEND_API_KEY is required unless --dry-run is set');
  }

  const [{ path: leadsResolvedPath, leads: rawLeads }, template] = await Promise.all([
    loadLeads(options.leadsPath),
    fs.readFile(templatePath, 'utf8'),
  ]);

  const normalizedLeads = rawLeads.map(normalizeLead);
  const targetLeads = filterLeads(normalizedLeads, options);

  const runId = `${new Date().toISOString()}-${Math.random().toString(36).slice(2, 10)}`;
  const summary = { total: targetLeads.length, sent: 0, failed: 0, skipped: 0, dryRun: options.dryRun };
  const results = [];

  for (const lead of targetLeads) {
    const timestamp = new Date().toISOString();
    const refCode = String(lead.ref_code || options.refCode || '').trim();

    if (!isValidEmail(lead.email)) {
      summary.skipped += 1;
      results.push({
        run_id: runId,
        ts: timestamp,
        status: 'skipped',
        reason: 'missing_or_invalid_email',
        subject: options.subject,
        email: lead.email || '',
        state: lead.state,
        segment: lead.segment,
        club_name: lead.club_name,
      });
      continue;
    }

    const merge = {
      first_name: lead.first_name,
      club_name: lead.club_name,
      course_name: lead.course_name,
      ref_code: refCode,
      email: lead.email,
      state: lead.state,
      city: lead.city,
      segment: lead.segment,
      unsubscribe_url: `https://betwaggle.com/api/unsubscribe?email=${encodeURIComponent(lead.email)}`,
      month: new Date().toLocaleString('en-US', { month: 'long' }),
      month_year: new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      month_slug: new Date().toLocaleString('en-US', { month: 'long' }).toLowerCase(),
    };

    const html = renderTemplate(template, merge);

    if (options.dryRun) {
      summary.sent += 1;
      results.push({
        run_id: runId,
        ts: timestamp,
        status: 'dry_run',
        subject: options.subject,
        from: options.from,
        email: lead.email,
        state: lead.state,
        segment: lead.segment,
        club_name: lead.club_name,
        ref_code: refCode,
      });
      continue;
    }

    try {
      const resend = await sendViaResend({
        apiKey: resendApiKey,
        from: options.from,
        to: lead.email,
        subject: options.subject,
        html,
      });

      if (!resend.ok) {
        summary.failed += 1;
        results.push({
          run_id: runId,
          ts: timestamp,
          status: 'failed',
          subject: options.subject,
          email: lead.email,
          state: lead.state,
          segment: lead.segment,
          club_name: lead.club_name,
          resend_status: resend.status,
          resend_payload: resend.payload,
        });
        continue;
      }

      summary.sent += 1;
      results.push({
        run_id: runId,
        ts: timestamp,
        status: 'sent',
        subject: options.subject,
        email: lead.email,
        state: lead.state,
        segment: lead.segment,
        club_name: lead.club_name,
        resend_status: resend.status,
        resend_id: resend.payload?.id || null,
      });
    } catch (err) {
      summary.failed += 1;
      results.push({
        run_id: runId,
        ts: timestamp,
        status: 'failed',
        subject: options.subject,
        email: lead.email,
        state: lead.state,
        segment: lead.segment,
        club_name: lead.club_name,
        error: err.message,
      });
    }
  }

  await appendLogEntries(logPath, results);

  console.log(JSON.stringify({
    ok: true,
    run_id: runId,
    leads_file: leadsResolvedPath,
    template: templatePath,
    log_file: logPath,
    filters: { states: options.states, segments: options.segments, limit: options.limit || null },
    summary,
  }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
});
