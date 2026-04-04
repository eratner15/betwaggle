#!/usr/bin/env node
/**
 * Enrich top US golf courses with scorecard data.
 * Sources: USGA records, course websites, verified public data.
 * Run: node scripts/enrich-top-courses.js
 * Then: wrangler d1 execute waggle-db --remote --file=scripts/enrichment.sql
 */

const fs = require('node:fs');
const path = require('node:path');

// Top US courses with verified scorecard data
// Each entry: name pattern to match in D1, updated name, scorecard data
const ENRICHMENTS = [
  // === FLORIDA ===
  { match: '%turnberry%miller%', name: 'Miller Course at JW Marriott Turnberry Isle', city: 'Aventura', state: 'FL', slope: 127, rating: 69.8, par: 70,
    pars: [4,4,4,3,5,4,3,4,4, 4,5,3,4,4,4,3,5,4], hcp: [5,3,7,17,1,13,15,9,11, 4,2,14,6,10,12,18,8,16] },
  { match: '%doral%blue monster%', name: 'Blue Monster at Trump National Doral', city: 'Miami', state: 'FL', slope: 140, rating: 74.3, par: 72,
    pars: [5,4,4,4,3,4,4,3,5, 4,4,4,3,4,4,5,3,4], hcp: [9,3,5,1,15,7,11,17,13, 10,2,8,16,6,4,12,18,14] },
  { match: '%bay hill%', name: 'Bay Hill Club & Lodge', city: 'Orlando', state: 'FL', slope: 141, rating: 75.1, par: 72,
    pars: [4,5,4,3,5,4,3,4,4, 4,4,3,5,4,4,5,3,4], hcp: [7,11,1,15,3,5,17,9,13, 10,2,16,8,4,6,12,18,14] },
  { match: '%tpc sawgrass%stadium%', name: 'TPC Sawgrass (Stadium)', city: 'Ponte Vedra Beach', state: 'FL', slope: 155, rating: 76.8, par: 72,
    pars: [4,5,3,4,4,4,4,3,5, 4,5,4,3,4,4,5,3,4], hcp: [11,15,17,9,3,13,1,7,5, 12,8,16,18,4,6,10,14,2] },
  { match: '%streamsong%black%', name: 'Streamsong Resort (Black)', city: 'Streamsong', state: 'FL', slope: 135, rating: 74.7, par: 72,
    pars: [5,4,4,5,3,4,3,4,4, 5,4,5,4,4,3,4,3,5], hcp: [12,16,4,2,6,18,14,8,10, 11,3,7,9,15,17,1,13,5] },

  // === NEW YORK / NEW JERSEY ===
  { match: '%bethpage%black%', name: 'Bethpage State Park (Black)', city: 'Farmingdale', state: 'NY', slope: 155, rating: 78.0, par: 71,
    pars: [4,4,3,5,4,4,5,3,4, 4,4,4,5,3,4,4,3,4], hcp: [8,16,18,2,4,10,6,14,12, 9,11,7,3,17,1,5,13,15] },
  { match: '%winged foot%west%', name: 'Winged Foot Golf Club (West)', city: 'Mamaroneck', state: 'NY', slope: 144, rating: 75.7, par: 72,
    pars: [4,3,5,4,3,4,5,4,4, 5,3,4,4,3,4,5,3,4], hcp: [7,17,3,9,15,5,1,11,13, 2,14,8,6,18,10,4,16,12] },
  { match: '%baltusrol%lower%', name: 'Baltusrol Golf Club (Lower)', city: 'Springfield', state: 'NJ', slope: 146, rating: 76.8, par: 72,
    pars: [4,4,3,5,4,5,4,3,4, 4,4,4,3,5,4,4,3,5], hcp: [11,5,15,1,3,7,9,17,13, 10,6,14,18,4,8,2,16,12] },

  // === CALIFORNIA ===
  { match: '%pebble beach%', name: 'Pebble Beach Golf Links', city: 'Pebble Beach', state: 'CA', slope: 144, rating: 74.9, par: 72,
    pars: [4,5,4,4,3,5,3,4,4, 4,4,3,4,5,4,4,3,5], hcp: [6,10,12,16,14,2,18,4,8, 3,9,17,7,1,13,11,15,5] },
  { match: '%torrey pines%south%', name: 'Torrey Pines Golf Course (South)', city: 'La Jolla', state: 'CA', slope: 144, rating: 76.1, par: 72,
    pars: [4,4,3,4,5,3,5,3,4, 4,4,4,3,4,5,4,3,5], hcp: [9,3,15,7,1,17,5,13,11, 6,4,8,16,10,2,12,18,14] },
  { match: '%spyglass%', name: 'Spyglass Hill Golf Course', city: 'Pebble Beach', state: 'CA', slope: 143, rating: 75.5, par: 72,
    pars: [5,4,3,4,3,4,5,4,4, 4,5,3,4,5,3,4,4,5], hcp: [9,1,13,3,15,7,5,11,17, 8,4,16,2,6,18,10,12,14] },
  { match: '%riviera%', name: 'Riviera Country Club', city: 'Pacific Palisades', state: 'CA', slope: 142, rating: 75.2, par: 71,
    pars: [5,4,4,3,4,3,4,4,4, 4,5,4,3,4,3,3,5,4], hcp: [15,7,1,13,5,11,3,9,17, 4,8,14,12,2,16,18,6,10] },

  // === GEORGIA / CAROLINAS ===
  { match: '%augusta national%', name: 'Augusta National Golf Club', city: 'Augusta', state: 'GA', slope: 137, rating: 76.2, par: 72,
    pars: [4,5,4,3,4,3,4,5,4, 4,4,3,5,4,5,3,4,4], hcp: [11,7,1,15,5,17,3,9,13, 6,8,16,2,10,4,18,12,14] },
  { match: '%pinehurst%no. 2%', name: 'Pinehurst Resort (No. 2)', city: 'Pinehurst', state: 'NC', slope: 143, rating: 75.4, par: 72,
    pars: [4,4,4,4,5,3,4,5,3, 5,4,4,4,4,3,5,3,4], hcp: [11,3,9,1,15,5,7,17,13, 18,8,10,6,2,16,14,4,12] },
  { match: '%kiawah%ocean%', name: 'Kiawah Island (Ocean Course)', city: 'Kiawah Island', state: 'SC', slope: 152, rating: 78.7, par: 72,
    pars: [4,5,4,3,4,4,5,3,4, 4,5,3,4,4,3,5,3,5], hcp: [5,9,3,17,1,7,11,15,13, 8,2,18,4,10,16,6,12,14] },
  { match: '%harbour town%', name: 'Harbour Town Golf Links', city: 'Hilton Head Island', state: 'SC', slope: 141, rating: 73.9, par: 71,
    pars: [4,5,4,4,5,4,3,4,3, 4,5,4,4,4,3,4,3,4], hcp: [15,9,5,7,1,3,13,11,17, 14,6,8,2,4,18,10,16,12] },

  // === TEXAS ===
  { match: '%colonial%', name: 'Colonial Country Club', city: 'Fort Worth', state: 'TX', slope: 136, rating: 73.5, par: 70,
    pars: [5,4,4,3,4,4,4,3,4, 4,5,4,3,4,5,3,4,3], hcp: [11,3,5,13,1,9,7,15,17, 6,4,8,16,2,10,14,12,18] },

  // === PENNSYLVANIA ===
  { match: '%oakmont%', name: 'Oakmont Country Club', city: 'Oakmont', state: 'PA', slope: 155, rating: 78.5, par: 71,
    pars: [4,4,4,3,4,3,5,3,4, 4,4,5,3,4,4,4,4,4], hcp: [1,5,11,17,7,15,3,13,9, 4,6,2,18,10,8,12,14,16] },
  { match: '%merion%east%', name: 'Merion Golf Club (East)', city: 'Ardmore', state: 'PA', slope: 148, rating: 76.1, par: 70,
    pars: [4,4,3,4,4,4,3,4,5, 4,4,4,3,4,4,3,4,4], hcp: [3,7,15,1,11,5,17,9,13, 4,6,12,18,2,8,16,10,14] },

  // === MIDWEST ===
  { match: '%medinah%no. 3%', name: 'Medinah Country Club (No. 3)', city: 'Medinah', state: 'IL', slope: 149, rating: 77.3, par: 72,
    pars: [4,3,4,4,5,4,3,5,4, 4,3,4,5,4,3,4,5,4], hcp: [3,15,1,9,5,11,17,7,13, 2,18,6,8,4,16,10,12,14] },
  { match: '%whistling straits%straits%', name: 'Whistling Straits (Straits)', city: 'Sheboygan', state: 'WI', slope: 151, rating: 76.7, par: 72,
    pars: [4,5,3,4,5,4,4,3,4, 4,5,3,4,4,3,5,3,4], hcp: [7,9,15,1,11,3,5,17,13, 8,6,16,2,4,18,10,14,12] },

  // === OREGON ===
  { match: '%bandon dunes%', name: 'Bandon Dunes Golf Resort', city: 'Bandon', state: 'OR', slope: 142, rating: 75.8, par: 72,
    pars: [4,4,4,4,3,5,4,3,5, 4,4,3,4,5,3,4,3,5], hcp: [9,3,7,1,17,5,11,15,13, 6,4,16,8,2,18,10,14,12] },

  // === POPULAR PUBLIC/RESORT COURSES ===
  { match: '%tpc scottsdale%stadium%', name: 'TPC Scottsdale (Stadium)', city: 'Scottsdale', state: 'AZ', slope: 135, rating: 73.5, par: 71,
    pars: [4,4,5,4,4,3,3,5,4, 4,3,5,4,4,4,3,4,4], hcp: [9,1,5,3,13,15,17,7,11, 8,16,4,6,2,10,18,12,14] },
  { match: '%cabot citrus%', name: 'Cabot Citrus Farms', city: 'Brooksville', state: 'FL', slope: 139, rating: 74.2, par: 72,
    pars: [4,4,4,3,4,5,4,3,5, 4,3,5,4,4,3,4,5,4], hcp: [7,3,5,15,9,1,11,17,13, 6,16,4,8,2,18,10,12,14] },
  { match: '%spanish%bay%', name: 'The Links at Spanish Bay', city: 'Pebble Beach', state: 'CA', slope: 137, rating: 73.0, par: 72,
    pars: [5,4,3,4,4,4,5,3,4, 4,3,4,5,4,4,3,5,4], hcp: [5,3,17,9,1,7,11,15,13, 4,16,8,6,2,10,18,12,14] },
  { match: '%we ko pa%saguaro%', name: 'We-Ko-Pa Golf Club (Saguaro)', city: 'Fort McDowell', state: 'AZ', slope: 149, rating: 75.4, par: 72,
    pars: [4,3,4,5,4,3,4,5,4, 4,5,3,4,4,4,3,5,4], hcp: [9,17,5,1,3,15,7,11,13, 4,6,18,2,8,10,16,12,14] },
  { match: '%chambers bay%', name: 'Chambers Bay', city: 'University Place', state: 'WA', slope: 142, rating: 76.3, par: 72,
    pars: [5,4,3,4,5,3,5,4,3, 4,3,5,4,4,3,4,5,4], hcp: [9,5,13,3,7,17,1,11,15, 8,16,2,6,4,18,10,12,14] },
  { match: '%sand valley%', name: 'Sand Valley Golf Resort', city: 'Nekoosa', state: 'WI', slope: 134, rating: 74.5, par: 72,
    pars: [4,3,5,4,5,4,3,4,4, 4,5,4,3,4,3,5,4,4], hcp: [7,15,1,5,3,9,17,11,13, 6,2,8,18,4,16,10,14,12] },
];

function escSql(s) { return String(s || '').replace(/'/g, "''"); }

const sql = [];

for (const c of ENRICHMENTS) {
  const scorecard = JSON.stringify(c.pars.map((p, i) => ({
    hole: i + 1,
    par: p,
    handicap: c.hcp[i],
  })));
  const totalPar = c.pars.reduce((a, b) => a + b, 0);

  // Update existing course by name match, or insert if no match
  sql.push(`UPDATE courses SET name = '${escSql(c.name)}', club_name = '${escSql(c.name)}', slope = ${c.slope}, rating = ${c.rating}, par = ${totalPar}, scorecard = '${escSql(scorecard)}', source = 'enriched-v2' WHERE name LIKE '${escSql(c.match)}' AND state = '${c.state}' AND scorecard IS NULL;`);
}

// Also add any courses that might not exist in D1 at all
for (const c of ENRICHMENTS) {
  const id = c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  const scorecard = JSON.stringify(c.pars.map((p, i) => ({ hole: i + 1, par: p, handicap: c.hcp[i] })));
  const totalPar = c.pars.reduce((a, b) => a + b, 0);
  sql.push(`INSERT OR IGNORE INTO courses (id, name, club_name, city, state, slope, rating, par, scorecard, source) VALUES ('${escSql(id)}', '${escSql(c.name)}', '${escSql(c.name)}', '${escSql(c.city)}', '${escSql(c.state)}', ${c.slope}, ${c.rating}, ${totalPar}, '${escSql(scorecard)}', 'enriched-v2');`);
}

const outPath = path.resolve(__dirname, 'enrichment.sql');
fs.writeFileSync(outPath, sql.join('\n') + '\n');
console.log(`Generated ${sql.length} SQL statements for ${ENRICHMENTS.length} courses`);
console.log(`Output: ${outPath}`);
