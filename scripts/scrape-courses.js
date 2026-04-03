#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');

const OUTPUT_PATH = path.resolve(__dirname, '../data/course-leads.json');
const API_BASE = 'https://betwaggle.com/api/courses/search';
const STATES = [
  { code: 'FL', name: 'Florida' },
  { code: 'TX', name: 'Texas' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'CA', name: 'California' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'GA', name: 'Georgia' },
];

const STATE_FALLBACK_LEADS = {
  FL: [{ name: 'TPC Sawgrass (Stadium)', club: 'TPC Sawgrass', city: 'Ponte Vedra Beach', state: 'FL', segment: 'public' }],
  TX: [{ name: 'Colonial Country Club', club: 'Colonial Country Club', city: 'Fort Worth', state: 'TX', segment: 'private' }],
  AZ: [{ name: 'TPC Scottsdale (Stadium Course)', club: 'TPC Scottsdale', city: 'Scottsdale', state: 'AZ', segment: 'public' }],
  CA: [{ name: 'Pebble Beach Golf Links', club: 'Pebble Beach Golf Links', city: 'Pebble Beach', state: 'CA', segment: 'public' }],
  SC: [{ name: 'Harbour Town Golf Links', club: 'Harbour Town Golf Links', city: 'Hilton Head Island', state: 'SC', segment: 'public' }],
  NC: [{ name: 'Pinehurst Resort & Country Club (No. 2)', club: 'Pinehurst Resort & Country Club', city: 'Pinehurst', state: 'NC', segment: 'private' }],
  GA: [{ name: 'Augusta National Golf Club', club: 'Augusta National Golf Club', city: 'Augusta', state: 'GA', segment: 'private' }],
};

const STATE_CODE_BY_NAME = new Map(
  STATES.flatMap((s) => [
    [s.code.toLowerCase(), s.code],
    [s.name.toLowerCase(), s.code],
  ])
);

function inferSegment({ clubName, courseName }) {
  const txt = `${clubName} ${courseName}`.toLowerCase();
  if (txt.includes('municipal') || txt.includes('muni') || txt.includes('public')) {
    return 'public';
  }
  if (txt.includes('country club') || txt.includes('golf club') || txt.includes('private')) {
    return 'private';
  }
  if (txt.includes('resort')) {
    return 'public';
  }
  return 'public';
}

function normalizeLead(course, fallbackState) {
  const clubName = (course.club_name || '').trim();
  const courseName = (course.course_name || '').trim();
  const city = (course.city || '').trim();
  const rawState = (course.state || fallbackState || '').trim();
  const state = STATE_CODE_BY_NAME.get(rawState.toLowerCase()) || rawState.toUpperCase();
  return {
    name: courseName || clubName,
    club: clubName || courseName,
    city,
    state,
    segment: inferSegment({ clubName, courseName }),
  };
}

function dedupeKey(lead) {
  return `${lead.club}|${lead.name}|${lead.city}|${lead.state}`.toLowerCase();
}

async function fetchCourses(query) {
  const url = `${API_BASE}?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}) for query "${query}"`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function collectStateLeads(state) {
  const byKey = new Map();
  const queries = [state.name, `${state.name} golf`, `${state.code} golf`];

  for (const query of queries) {
    const courses = await fetchCourses(query);
    for (const course of courses) {
      const lead = normalizeLead(course, state.code);
      if (!lead.name || !lead.club) continue;
      if (lead.state && lead.state !== state.code) continue;
      const key = dedupeKey(lead);
      if (!byKey.has(key)) byKey.set(key, lead);
    }
  }

  if (byKey.size === 0) {
    for (const lead of STATE_FALLBACK_LEADS[state.code] || []) {
      byKey.set(dedupeKey(lead), lead);
    }
  }

  return Array.from(byKey.values());
}

async function main() {
  const allLeads = [];

  for (const state of STATES) {
    const leads = await collectStateLeads(state);
    allLeads.push(...leads);
    console.log(`[state:${state.code}] collected ${leads.length} leads`);
  }

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(allLeads, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${allLeads.length} leads to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
