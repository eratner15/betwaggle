#!/usr/bin/env node
/**
 * Import golf courses into WAGGLE_DB D1 database.
 * Sources:
 *   1. US_Golf_Courses CSV (17K+ courses, basic data)
 *   2. data/courses.json (5 courses with full scorecards)
 *   3. SEED_COURSES from worker.js (11 courses with full scorecards)
 *
 * Usage:
 *   node scripts/import-courses.js
 *
 * Requires: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID env vars
 * Or run via: wrangler d1 execute waggle-db --file=scripts/courses.sql
 */

const fs = require('node:fs');
const path = require('node:path');

const CSV_PATH = '/tmp/golf_courses.csv';
const ENRICHED_PATH = path.resolve(__dirname, '../data/courses.json');
const SQL_OUTPUT = path.resolve(__dirname, 'courses.sql');

// Seed courses with full scorecard data (from worker.js)
const SEED_COURSES = [
  { id: 'pebble-beach', name: 'Pebble Beach Golf Links', city: 'Pebble Beach', state: 'CA', slope: 144, rating: 74.9,
    par: [4,5,4,4,3,5,3,4,4,4,4,3,4,5,4,4,3,5], strokeIndex: [6,10,12,16,14,2,18,4,8,3,9,17,7,1,13,11,15,5] },
  { id: 'augusta-national', name: 'Augusta National Golf Club', city: 'Augusta', state: 'GA', slope: 137, rating: 76.2,
    par: [4,5,4,3,4,3,4,5,4,5,4,3,5,4,5,3,4,4], strokeIndex: [11,7,1,15,5,17,3,9,13,6,8,16,2,10,4,18,12,14] },
  { id: 'bethpage-black', name: 'Bethpage State Park (Black)', city: 'Farmingdale', state: 'NY', slope: 155, rating: 78.0,
    par: [4,4,3,5,4,4,5,3,4,4,4,4,5,3,4,4,3,4], strokeIndex: [8,16,18,2,4,10,6,14,12,9,11,7,3,17,1,5,13,15] },
  { id: 'torrey-pines-south', name: 'Torrey Pines Golf Course (South)', city: 'La Jolla', state: 'CA', slope: 144, rating: 76.1,
    par: [4,4,3,4,5,3,5,3,4,4,4,4,3,4,5,4,3,5], strokeIndex: [9,3,15,7,1,17,5,13,11,6,4,8,16,10,2,12,18,14] },
  { id: 'tpc-sawgrass', name: 'TPC Sawgrass (Stadium)', city: 'Ponte Vedra Beach', state: 'FL', slope: 155, rating: 76.8,
    par: [4,5,3,4,4,4,4,3,5,4,5,4,3,4,4,5,3,4], strokeIndex: [11,15,17,9,3,13,1,7,5,12,8,16,18,4,6,10,14,2] },
  { id: 'pinehurst-no2', name: 'Pinehurst Resort & Country Club (No. 2)', city: 'Pinehurst', state: 'NC', slope: 143, rating: 75.4,
    par: [4,4,4,4,5,3,4,5,3,5,4,4,4,4,3,5,3,4], strokeIndex: [11,3,9,1,15,5,7,17,13,18,8,10,6,2,16,14,4,12] },
  { id: 'merion-east', name: 'Merion Golf Club (East)', city: 'Ardmore', state: 'PA', slope: 148, rating: 76.1,
    par: [4,4,3,4,4,4,3,4,5,4,4,4,3,4,4,3,4,4], strokeIndex: [3,7,15,1,11,5,17,9,13,4,6,12,18,2,8,16,10,14] },
  { id: 'winged-foot-west', name: 'Winged Foot Golf Club (West)', city: 'Mamaroneck', state: 'NY', slope: 144, rating: 75.7,
    par: [4,3,5,4,3,4,5,4,4,5,3,4,4,3,4,5,3,4], strokeIndex: [7,17,3,9,15,5,1,11,13,2,14,8,6,18,10,4,16,12] },
  { id: 'bandon-dunes', name: 'Bandon Dunes Golf Resort', city: 'Bandon', state: 'OR', slope: 142, rating: 75.8,
    par: [4,4,4,4,3,5,4,3,5,4,4,3,4,5,3,4,3,5], strokeIndex: [9,3,7,1,17,5,11,15,13,6,4,16,8,2,18,10,14,12] },
  { id: 'oakmont', name: 'Oakmont Country Club', city: 'Oakmont', state: 'PA', slope: 155, rating: 78.5,
    par: [4,4,4,3,4,3,5,3,4,4,4,5,3,4,4,4,4,4], strokeIndex: [1,5,11,17,7,15,3,13,9,4,6,2,18,10,8,12,14,16] },
  { id: 'streamsong-black', name: 'Streamsong Resort (Black)', city: 'Streamsong', state: 'FL', slope: 135, rating: 74.7,
    par: [5,4,4,5,3,4,3,4,4,5,4,5,4,4,3,4,3,5], strokeIndex: [12,16,4,2,6,18,14,8,10,11,3,7,9,15,17,1,13,5] },
  { id: 'pga-frisco-east', name: 'Fields Ranch East at PGA Frisco', city: 'Frisco', state: 'TX', slope: 152, rating: 78.9, par: null, strokeIndex: null },
  { id: 'pga-frisco-west', name: 'Fields Ranch West at PGA Frisco', city: 'Frisco', state: 'TX', slope: 148, rating: 77.2, par: null, strokeIndex: null },
];

function escSql(s) {
  return String(s || '').replace(/'/g, "''");
}

function makeId(name, city, state) {
  return (name + '-' + city + '-' + state)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseFee(raw) {
  if (!raw || raw === 'N/A') return null;
  const m = String(raw).match(/\$?([\d,.]+)/);
  return m ? parseFloat(m[1].replace(/,/g, '')) : null;
}

// ── Main ──

const lines = fs.readFileSync(CSV_PATH, 'utf8').split('\n').filter(l => l.trim());
const header = parseCSVLine(lines[0]);
console.log(`CSV: ${lines.length - 1} rows, ${header.length} columns`);

const sql = [];

// Create table
sql.push(`DROP TABLE IF EXISTS courses;`);
sql.push(`CREATE TABLE courses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  club_name TEXT,
  city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  zip TEXT,
  county TEXT,
  phone TEXT,
  public_private TEXT DEFAULT 'public',
  holes INTEGER DEFAULT 18,
  slope INTEGER,
  rating REAL,
  par INTEGER DEFAULT 72,
  fee_weekend REAL,
  fee_weekday REAL,
  designer TEXT,
  year_built TEXT,
  season TEXT,
  scorecard TEXT,
  tees TEXT,
  source TEXT DEFAULT 'csv',
  updated_at TEXT DEFAULT (datetime('now'))
);`);

sql.push(`CREATE INDEX idx_courses_name ON courses(name);`);
sql.push(`CREATE INDEX idx_courses_city ON courses(city);`);
sql.push(`CREATE INDEX idx_courses_state ON courses(state);`);
sql.push(`CREATE INDEX idx_courses_zip ON courses(zip);`);

// Track IDs to avoid dupes
const seenIds = new Set();

// 1. Import seed courses (with scorecards) first — they take priority
for (const c of SEED_COURSES) {
  seenIds.add(c.id);
  const scorecard = c.par ? JSON.stringify(c.par.map((p, i) => ({
    hole: i + 1, par: p, handicap: c.strokeIndex ? c.strokeIndex[i] : i + 1
  }))) : null;
  const totalPar = c.par ? c.par.reduce((a, b) => a + b, 0) : 72;
  sql.push(`INSERT INTO courses (id, name, club_name, city, state, slope, rating, par, scorecard, source) VALUES ('${escSql(c.id)}', '${escSql(c.name)}', '${escSql(c.name)}', '${escSql(c.city)}', '${escSql(c.state)}', ${c.slope || 'NULL'}, ${c.rating || 'NULL'}, ${totalPar}, ${scorecard ? "'" + escSql(scorecard) + "'" : 'NULL'}, 'seed');`);
}

// 2. Import enriched courses from data/courses.json (with full tee data)
if (fs.existsSync(ENRICHED_PATH)) {
  const enriched = JSON.parse(fs.readFileSync(ENRICHED_PATH, 'utf8'));
  for (const c of enriched) {
    const id = makeId(c.name || c.club, c.city || '', c.state || '');
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    const tees = c.tees ? JSON.stringify(c.tees) : null;
    const firstTee = c.tees?.[0];
    const scorecard = firstTee?.holes ? JSON.stringify(firstTee.holes) : null;
    const slope = firstTee?.slope || null;
    const rating = firstTee?.rating || null;
    const par = firstTee?.par || 72;
    sql.push(`INSERT INTO courses (id, name, club_name, city, state, slope, rating, par, scorecard, tees, source) VALUES ('${escSql(id)}', '${escSql(c.name)}', '${escSql(c.club || c.name)}', '${escSql(c.city || '')}', '${escSql(c.state || '')}', ${slope || 'NULL'}, ${rating || 'NULL'}, ${par}, ${scorecard ? "'" + escSql(scorecard) + "'" : 'NULL'}, ${tees ? "'" + escSql(tees) + "'" : 'NULL'}, 'enriched');`);
  }
  console.log(`Enriched: ${enriched.length} courses`);
}

// 3. Import CSV courses (basic data, no scorecards)
let csvCount = 0;
for (let i = 1; i < lines.length; i++) {
  const fields = parseCSVLine(lines[i]);
  if (fields.length < 5) continue;

  const name = fields[0] || '';
  const city = fields[2] || '';
  const state = fields[3] || '';
  if (!name || !state) continue;

  const id = makeId(name, city, state);
  if (seenIds.has(id)) continue;
  seenIds.add(id);

  const zip = fields[4] || '';
  const county = fields[6] || '';
  const phone = fields[8] || '';
  const pubPriv = (fields[11] || 'public').toLowerCase();
  const yearBuilt = fields[12] || '';
  const season = fields[14] || '';
  const designer = fields[19] || '';
  const feeWeekend = parseFee(fields[22]);
  const feeWeekday = parseFee(fields[23]);
  const holesRaw = parseInt(fields[27]) || 18;

  sql.push(`INSERT INTO courses (id, name, club_name, city, state, zip, county, phone, public_private, holes, fee_weekend, fee_weekday, designer, year_built, season, source) VALUES ('${escSql(id)}', '${escSql(name)}', '${escSql(name)}', '${escSql(city)}', '${escSql(state)}', '${escSql(zip)}', '${escSql(county)}', '${escSql(phone)}', '${escSql(pubPriv)}', ${holesRaw}, ${feeWeekend !== null ? feeWeekend : 'NULL'}, ${feeWeekday !== null ? feeWeekday : 'NULL'}, '${escSql(designer)}', '${escSql(yearBuilt)}', '${escSql(season)}', 'csv');`);
  csvCount++;
}

console.log(`CSV courses: ${csvCount}`);
console.log(`Total SQL statements: ${sql.length}`);

fs.writeFileSync(SQL_OUTPUT, sql.join('\n') + '\n', 'utf8');
console.log(`Wrote ${SQL_OUTPUT}`);
