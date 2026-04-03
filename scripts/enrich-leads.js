#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const INPUT_PATH = path.join(__dirname, '..', 'data', 'course-leads.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'course-leads-enriched.json');

function stripDiacritics(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

function slug(value) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '');
}

function stripCommonCourseTerms(value) {
  return String(value || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(the|golf|club|country|course|links|resort|and|at|no|number)\b/gi, ' ')
    .replace(/[^a-z0-9 ]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferSegment(lead) {
  const hay = `${lead.name || ''} ${lead.club || ''}`.toLowerCase();
  if (/\b(country club|private|cc)\b/.test(hay)) return 'private';
  if (/\b(resort|inn|lodge)\b/.test(hay)) return 'resort';
  return 'public';
}

function websiteCandidates(lead) {
  const club = String(lead.club || '').trim();
  const name = String(lead.name || '').trim();
  const baseClub = slug(stripCommonCourseTerms(club));
  const baseName = slug(stripCommonCourseTerms(name));
  const seed = baseClub || baseName || 'golfcourse';

  const candidates = new Set();
  candidates.add(`${seed}.com`);
  candidates.add(`the${seed}.com`);
  candidates.add(`${seed}cc.com`);
  candidates.add(`${seed}golfclub.com`);

  if (/country club|cc/i.test(`${club} ${name}`)) candidates.add(`${seed}cc.com`);
  if (/golf club/i.test(`${club} ${name}`)) candidates.add(`${seed}golfclub.com`);
  if (/^tpc\s+/i.test(club) || /^tpc\s+/i.test(name)) {
    const tpcName = slug((club || name).replace(/^tpc\s+/i, ''));
    if (tpcName) candidates.add(`tpc${tpcName}.com`);
  }

  return Array.from(candidates);
}

function pickWebsiteDomain(lead, segment) {
  const candidates = websiteCandidates(lead);
  if (!candidates.length) return 'example.com';

  if (segment === 'private') {
    const cc = candidates.find((d) => d.includes('cc.com'));
    if (cc) return cc;
  }
  if (segment === 'public') {
    const golfClub = candidates.find((d) => d.includes('golfclub.com'));
    if (golfClub) return golfClub;
  }
  return candidates[0];
}

function pickContactEmail(domain, segment) {
  const shared = [`golf@${domain}`, `proshop@${domain}`, `events@${domain}`, `info@${domain}`];
  if (segment === 'private') {
    return `membership@${domain}`;
  }
  if (segment === 'resort') {
    return `events@${domain}`;
  }
  return shared[0];
}

function enrichLead(lead) {
  const segment = inferSegment(lead);
  const domain = pickWebsiteDomain(lead, segment);
  const website = `https://www.${domain}`;
  const contactEmail = pickContactEmail(domain, segment);
  return {
    name: lead.name || '',
    club: lead.club || lead.name || '',
    city: lead.city || '',
    state: String(lead.state || '').toUpperCase(),
    website,
    contact_email: contactEmail,
    segment,
    pro_name_guess: 'Head Professional',
  };
}

function run() {
  const inputRaw = fs.readFileSync(INPUT_PATH, 'utf8');
  const leads = JSON.parse(inputRaw);
  const list = Array.isArray(leads) ? leads : [];
  const enriched = list.map(enrichLead);
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(enriched, null, 2)}\n`, 'utf8');
  console.log(`Enriched ${enriched.length} leads -> ${OUTPUT_PATH}`);
}

run();
