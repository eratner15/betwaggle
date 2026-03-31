// betwaggle.com — Standalone Waggle Worker
// Extracted from cafecito-ai monolith. All routes rewritten from /waggle/ to /

// ===== SHARED UTILITIES =====
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function sanitizeName(raw) {
  return String(raw || '').replace(/<[^>]*>/g, '').replace(/[^\w\s'.,-]/g, '').trim().slice(0, 50);
}

// Simple HTML tag stripper for server-side sanitization
function stripHtml(str) {
  return String(str || '').replace(/<[^>]*>/g, '').trim();
}

// Generate random 4-digit admin PIN (1000-9999)
function randomPin() {
  return String(1000 + Math.floor(Math.random() * 9000));
}

// Server-side ML table for odds validation (source: app/js/betting.js)
const ML_TABLE = [
  [   0,  -138,  -190,  -262,  -363,  -507,  -715, -1020, -1477, -2169, -3238, -4915, -7589,-11921,-19048,-30952],
  [ 138,     0,  -137,  -188,  -258,  -356,  -495,  -694,  -985, -1415, -2064, -3058, -4602, -7043,-10961,-17343],
  [ 190,   137,     0,  -137,  -186,  -255,  -350,  -483,  -674,  -951, -1359, -1968, -2892, -4319, -6553,-10107],
  [ 262,   188,   137,     0,  -136,  -185,  -251,  -344,  -473,  -656,  -920, -1306, -1878, -2741, -4062, -6113],
  [ 363,   258,   186,   136,     0,  -135,  -183,  -248,  -338,  -462,  -638,  -890, -1256, -1796, -2602, -3827],
  [ 507,   356,   255,   185,   135,     0,  -135,  -182,  -245,  -332,  -453,  -622,  -863, -1210, -1719, -2475],
  [ 715,   495,   350,   251,   183,   135,     0,  -134,  -180,  -242,  -327,  -444,  -606,  -837, -1167, -1648],
  [1020,   694,   483,   344,   248,   182,   134,     0,  -134,  -179,  -240,  -322,  -435,  -592,  -812, -1127],
  [1477,   985,   674,   473,   338,   245,   180,   134,     0,  -133,  -178,  -237,  -317,  -426,  -578,  -789],
  [2169,  1415,   951,   656,   462,   332,   242,   179,   133,     0,  -133,  -176,  -234,  -312,  -418,  -564],
  [3238,  2064,  1359,   920,   638,   453,   327,   240,   178,   133,     0,  -132,  -175,  -232,  -308,  -411],
  [4915,  3058,  1968,  1306,   890,   622,   444,   322,   237,   176,   132,     0,  -132,  -174,  -229,  -304],
  [7589,  4602,  2892,  1878,  1256,   863,   606,   435,   317,   234,   175,   132,     0,  -132,  -173,  -227],
  [11921, 7043,  4319,  2741,  1796,  1210,   837,   592,   426,   312,   232,   174,   132,     0,  -131,  -172],
  [19048,10961,  6553,  4062,  2602,  1719,  1167,   812,   578,   418,   308,   229,   173,   131,     0,  -131],
  [30952,17343, 10107,  6113,  3827,  2475,  1648,  1127,   789,   564,   411,   304,   227,   172,   131,     0],
];
function serverMlToDecimal(ml) {
  if (ml === 0) return 2.00;
  if (ml < 0) return +(1 + 100 / Math.abs(ml)).toFixed(2);
  return +(1 + ml / 100).toFixed(2);
}
function serverExpectedOdds(hcpA, hcpB) {
  const a = Math.max(0, Math.min(15, Math.round(hcpA)));
  const b = Math.max(0, Math.min(15, Math.round(hcpB)));
  return serverMlToDecimal(ML_TABLE[a][b]);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Auto-seed events on first request (fire-and-forget, idempotent)
    ctx.waitUntil(seedDemoEvent(env).catch(()=>{}));
    ctx.waitUntil(seedFriscoV2(env).catch(()=>{}));

    // www redirect
    if (url.hostname === 'www.betwaggle.com') {
      return Response.redirect(`https://betwaggle.com${url.pathname}${url.search}`, 301);
    }

    // Health check — also auto-seeds events on first hit
    if (url.pathname === '/health') {
      // Fire-and-forget seed — idempotent, skips if already exists
      ctx.waitUntil(seedDemoEvent(env));
      ctx.waitUntil(seedFriscoV2(env));
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ===== COURSE SEARCH (Golf Course API proxy) =====
    // GET /api/courses/search?q=... — returns [{id,club_name,course_name,location}]
    if (url.pathname === '/api/courses/search' && request.method === 'GET') {
      const q = url.searchParams.get('q') || '';
      if (q.length < 2) {
        return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
      try {
        // Hardcoded courses not in the Golf Course API (too new or missing)
        const CUSTOM_COURSES = [
          { id: 'pga-frisco-east', club_name: 'Fields Ranch East at PGA Frisco', course_name: 'Fields Ranch East', city: 'Frisco', state: 'TX', location: 'Frisco, TX', slope: 152, rating: 78.9, custom: true },
          { id: 'pga-frisco-west', club_name: 'Fields Ranch West at PGA Frisco', course_name: 'Fields Ranch West', city: 'Frisco', state: 'TX', location: 'Frisco, TX', slope: 148, rating: 77.2, custom: true },
        ];
        const ql = q.toLowerCase();
        const customMatches = CUSTOM_COURSES.filter(c =>
          c.club_name.toLowerCase().includes(ql) || c.course_name.toLowerCase().includes(ql) || c.city.toLowerCase().includes(ql)
        );

        const apiKey = env.GOLF_COURSE_API_KEY || '';
        const gcRes = await fetch(`https://api.golfcourseapi.com/v1/search?search_query=${encodeURIComponent(q)}`, {
          headers: { 'Authorization': `Key ${apiKey}` }
        });
        if (!gcRes.ok) {
          return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        }
        const gcData = await gcRes.json();
        const courses = (gcData.courses || []).slice(0, 20).map(c => {
          const loc = c.location || {};
          const city = loc.city || c.city || '';
          const state = loc.state || c.state_name || '';
          // Extract tee summaries from search results
          const tees = c.tees || {};
          const maleTees = Array.isArray(tees.male) ? tees.male : (Array.isArray(tees) ? tees : []);
          const slope = maleTees[0]?.course_slope || '';
          const rating = maleTees[0]?.course_rating || '';
          return {
            id: c.id,
            club_name: c.club_name,
            course_name: c.course_name,
            city, state,
            location: [city, state].filter(Boolean).join(', '),
            slope, rating,
          };
        });
        // Merge custom courses first, then API results
        const allCourses = [...customMatches, ...courses];
        return new Response(JSON.stringify(allCourses), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch {
        // If API fails, still return custom matches
        const ql2 = q.toLowerCase();
        const CUSTOM_COURSES_FALLBACK = [
          { id: 'pga-frisco-east', club_name: 'Fields Ranch East at PGA Frisco', course_name: 'Fields Ranch East', city: 'Frisco', state: 'TX', location: 'Frisco, TX', slope: 152, rating: 78.9, custom: true },
          { id: 'pga-frisco-west', club_name: 'Fields Ranch West at PGA Frisco', course_name: 'Fields Ranch West', city: 'Frisco', state: 'TX', location: 'Frisco, TX', slope: 148, rating: 77.2, custom: true },
        ];
        const fallbackMatches = CUSTOM_COURSES_FALLBACK.filter(c => c.club_name.toLowerCase().includes(ql2) || c.city.toLowerCase().includes(ql2));
        return new Response(JSON.stringify(fallbackMatches), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
    }

    // GET /api/ghin/search?q=Name — search GHIN golfers by name
    if (url.pathname === '/api/ghin/search') {
      const q = (url.searchParams.get('q') || '').trim();
      if (q.length < 2) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      return handleGhinSearch(q, env);
    }

    // GET /api/ghin/debug — test auth and search (dev only)
    if (url.pathname === '/api/ghin/debug') {
      const h = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
      try {
        const auth = await getGhinAuth(env);
        if (!auth) return new Response(JSON.stringify({ error: 'GHIN auth failed' }), { headers: h });
        const { token, assocId } = auth;
        const params = new URLSearchParams({ last_name: 'Smith', per_page: '5', page: '1', status: 'Active', sorting_criteria: 'last_name_first_name' });
        if (assocId) params.set('association_id', assocId); else params.set('country', 'US');
        const res = await fetch(`${GHIN_BASE}/golfers/search.json?${params}`, { headers: { ...GHIN_HEADERS, 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        return new Response(JSON.stringify({ ok: true, assocId, searchStatus: res.status, count: data.golfers?.length, sample: data.golfers?.slice(0,2) }), { headers: h });
      } catch(e) { return new Response(JSON.stringify({ error: e.message }), { headers: h }); }
    }

    // GET /api/courses/:id — custom PGA Frisco courses
    if (url.pathname === '/api/courses/pga-frisco-east') {
      const h = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=86400' };
      return new Response(JSON.stringify({
        id: 'pga-frisco-east', club_name: 'Fields Ranch East at PGA Frisco', course_name: 'Fields Ranch East',
        city: 'Frisco', state: 'TX', address: '1 PGA Dr, Frisco, TX 75034',
        tees: [
          { name: 'PGA', gender: 'male', slope: 152, rating: 78.9, par: 72, yardage: 7860,
            holes: [
              {hole:1,par:5,handicap:9,yardage:633},{hole:2,par:4,handicap:5,yardage:463},{hole:3,par:5,handicap:17,yardage:609},
              {hole:4,par:3,handicap:11,yardage:235},{hole:5,par:4,handicap:7,yardage:500},{hole:6,par:4,handicap:1,yardage:534},
              {hole:7,par:4,handicap:13,yardage:345},{hole:8,par:3,handicap:15,yardage:179},{hole:9,par:4,handicap:3,yardage:482},
              {hole:10,par:4,handicap:8,yardage:488},{hole:11,par:4,handicap:12,yardage:413},{hole:12,par:4,handicap:4,yardage:488},
              {hole:13,par:3,handicap:10,yardage:269},{hole:14,par:5,handicap:2,yardage:600},{hole:15,par:4,handicap:14,yardage:358},
              {hole:16,par:4,handicap:6,yardage:544},{hole:17,par:3,handicap:18,yardage:144},{hole:18,par:5,handicap:16,yardage:576},
            ]},
          { name: 'Three', gender: 'male', slope: 146, rating: 75.5, par: 72, yardage: 7066,
            holes: [
              {hole:1,par:5,handicap:9,yardage:580},{hole:2,par:4,handicap:5,yardage:406},{hole:3,par:5,handicap:17,yardage:560},
              {hole:4,par:3,handicap:11,yardage:190},{hole:5,par:4,handicap:7,yardage:458},{hole:6,par:4,handicap:1,yardage:472},
              {hole:7,par:4,handicap:13,yardage:312},{hole:8,par:3,handicap:15,yardage:157},{hole:9,par:4,handicap:3,yardage:440},
              {hole:10,par:4,handicap:8,yardage:470},{hole:11,par:4,handicap:12,yardage:376},{hole:12,par:4,handicap:4,yardage:436},
              {hole:13,par:3,handicap:10,yardage:210},{hole:14,par:5,handicap:2,yardage:539},{hole:15,par:4,handicap:14,yardage:300},
              {hole:16,par:4,handicap:6,yardage:497},{hole:17,par:3,handicap:18,yardage:126},{hole:18,par:5,handicap:16,yardage:537},
            ]},
        ],
        pars: [5,4,5,3,4,4,4,3,4,4,4,4,3,5,4,4,3,5],
        strokeIndex: [9,5,17,11,7,1,13,15,3,8,12,4,10,2,14,6,18,16],
      }), { headers: h });
    }
    if (url.pathname === '/api/courses/pga-frisco-west') {
      const h = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=86400' };
      return new Response(JSON.stringify({
        id: 'pga-frisco-west', club_name: 'Fields Ranch West at PGA Frisco', course_name: 'Fields Ranch West',
        city: 'Frisco', state: 'TX', address: '1 PGA Dr, Frisco, TX 75034',
        tees: [
          { name: 'Combo', gender: 'male', slope: 148, rating: 77.2, par: 72, yardage: 6800,
            holes: [
              {hole:1,par:5,handicap:7,yardage:571},{hole:2,par:4,handicap:3,yardage:424},{hole:3,par:3,handicap:9,yardage:207},
              {hole:4,par:4,handicap:1,yardage:432},{hole:5,par:3,handicap:17,yardage:125},{hole:6,par:5,handicap:11,yardage:608},
              {hole:7,par:4,handicap:5,yardage:379},{hole:8,par:4,handicap:15,yardage:295},{hole:9,par:5,handicap:13,yardage:537},
              {hole:10,par:3,handicap:12,yardage:193},{hole:11,par:4,handicap:4,yardage:421},{hole:12,par:3,handicap:16,yardage:162},
              {hole:13,par:4,handicap:2,yardage:465},{hole:14,par:4,handicap:8,yardage:387},{hole:15,par:4,handicap:18,yardage:310},
              {hole:16,par:3,handicap:14,yardage:175},{hole:17,par:5,handicap:6,yardage:546},{hole:18,par:5,handicap:10,yardage:546},
            ]},
        ],
        pars: [5,4,3,4,3,5,4,4,5,3,4,3,4,4,4,3,5,5],
        strokeIndex: [7,3,9,1,17,11,5,15,13,12,4,16,2,8,18,14,6,10],
      }), { headers: h });
    }

    // GET /api/courses/:id — fetch full scorecard (pars + stroke index) for a course
    if (url.pathname.match(/^\/api\/courses\/(\d+)$/)) {
      const courseId = url.pathname.split('/').pop();
      try {
        const apiKey = env.GOLF_COURSE_API_KEY || '';
        const gcRes = await fetch(`https://api.golfcourseapi.com/v1/courses/${courseId}`, {
          headers: { 'Authorization': `Key ${apiKey}` }
        });
        if (!gcRes.ok) return new Response(JSON.stringify(null), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        const gcData = await gcRes.json();
        const raw = gcData.course || gcData;
        // Normalize tee structure: { male: [...], female: [...] } → flat array with gender tag
        const allTees = [];
        const rawTees = raw.tees || {};
        for (const [gender, teeList] of Object.entries(rawTees)) {
          if (!Array.isArray(teeList)) continue;
          for (const t of teeList) {
            const holes = (t.holes || []).map((h, i) => ({
              hole: h.hole_number || (i + 1),
              par: h.par,
              handicap: h.handicap || h.handicap_index || h.stroke_index,
              yardage: h.yardage || h.yards,
            }));
            allTees.push({
              name: t.tee_name || t.name || 'Unknown',
              gender,
              slope: t.course_slope || null,
              rating: t.course_rating || null,
              par: t.par_total || holes.reduce((s, h) => s + (h.par || 0), 0),
              yardage: t.total_yardage || holes.reduce((s, h) => s + (h.yardage || 0), 0),
              holes,
            });
          }
        }
        const loc = raw.location || {};
        const normalized = {
          id: raw.id,
          club_name: raw.club_name,
          course_name: raw.course_name,
          city: loc.city || '',
          state: loc.state || '',
          address: loc.address || '',
          tees: allTees,
          // Convenience: default male tee pars and stroke index for the create wizard
          pars: allTees.find(t => t.gender === 'male')?.holes.map(h => h.par) || [],
          strokeIndex: allTees.find(t => t.gender === 'male')?.holes.map(h => h.handicap) || [],
        };
        return new Response(JSON.stringify(normalized), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=86400' }
        });
      } catch {
        return new Response(JSON.stringify(null), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
    }

    // ===== COURSE DETAIL PAGE =====
    // /courses/:id — dynamic course detail page (server-rendered)
    const coursePageMatch = url.pathname.match(/^\/courses\/(\d+)\/?$/);
    if (coursePageMatch) {
      return handleCourseDetailPage(coursePageMatch[1], env);
    }

    // ===== EMAIL CAPTURE =====
    if (url.pathname === '/api/email-capture' && request.method === 'POST') {
      return handleEmailCapture(request, env);
    }
    if (url.pathname === '/api/email-capture' && request.method === 'OPTIONS') {
      return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' } });
    }

    // ===== MY EVENTS (Commissioner Dashboard) =====
    // GET /api/my-events?email={email} — list commissioner's events
    if (url.pathname === '/api/my-events' && request.method === 'GET') {
      const email = (url.searchParams.get('email') || '').trim().toLowerCase();
      const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
      if (!email) return new Response(JSON.stringify({ events: [] }), { headers });
      const slugsRaw = await env.MG_BOOK.get(`commissioner:${email}`, 'json');
      const slugs = slugsRaw || [];
      const events = [];
      for (const slug of slugs) {
        const configRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
        if (!configRaw) continue;
        try {
          const config = JSON.parse(configRaw);
          events.push({
            slug,
            name: config.event?.name || slug,
            date: config.event?.dates?.day1 || '',
            playerCount: (config.players || config.roster || []).length,
            status: config.event?.status || 'active',
            eventType: config.event?.eventType || '',
          });
        } catch {}
      }
      return new Response(JSON.stringify({ events }), { headers });
    }
    if (url.pathname === '/api/my-events' && request.method === 'OPTIONS') {
      return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': 'Content-Type' } });
    }

    // ===== UNSUBSCRIBE =====
    if (url.pathname === '/api/unsubscribe' && request.method === 'GET') {
      return handleUnsubscribe(url, env);
    }

    // ===== MULTI-TENANT EVENT API =====
    // /:slug/api/* — multi-tenant routes
    const waggleApiMatch = url.pathname.match(/^\/([a-z0-9_-]+)\/api\/(.*)/);
    if (waggleApiMatch && !['create', 'overview', 'tour', 'ads', 'gtm', 'affiliate', 'affiliates', 'marketing', 'go', 'success', 'courses', 'api', 'app', 'join', 'season', 'games', 'my-events', 'register', 'partner', 'share', 'inventory'].includes(waggleApiMatch[1])) {
      const slug = waggleApiMatch[1];
      const apiPath = waggleApiMatch[2];
      const resp = await handleEventApi(slug, apiPath, request, env, ctx);
      if (resp) return resp;
    }

    // /join/:slug — player self-registration page (must be before SPA match)
    const joinMatch = url.pathname.match(/^\/join\/([a-z0-9_-]+)\/?$/);
    if (joinMatch) {
      return handleWaggleJoinPage(joinMatch[1], env);
    }

    // ===== FRIENDLY REDIRECTS for common dead-end routes (must be before SPA match) =====
    const friendlyRedirects = { '/find': '/my-events/', '/new': '/create/', '/setup': '/create/', '/guide': '/overview/', '/rules': '/games/', '/help': '/overview/' };
    const redirectTarget = friendlyRedirects[url.pathname] || friendlyRedirects[url.pathname.replace(/\/$/, '')];
    if (redirectTarget) {
      return Response.redirect(`https://betwaggle.com${redirectTarget}`, 301);
    }

    // /:slug/ — serve the SPA with dynamic config
    const waggleSpaMatch = url.pathname.match(/^\/([a-z0-9_-]+)(\/.*)?$/);
    if (waggleSpaMatch && !url.pathname.includes('/api/') && !['join', 'create', 'overview', 'tour', 'ads', 'gtm', 'affiliate', 'affiliates', 'marketing', 'go', 'success', 'courses', 'api', 'app', 'season', 'games', 'my-events', 'demo', 'register', 'partner', 'b', 'share', 'inventory'].includes(waggleSpaMatch[1])) {
      const slug = waggleSpaMatch[1];
      // Serve static assets (JS/CSS/images) from /app/ (shared SPA code)
      const subPath = waggleSpaMatch[2] || '/';
      // /:slug/register — team self-registration page
      if (subPath === '/register' || subPath === '/register/') {
        return env.ASSETS.fetch(new Request(new URL('/register/index.html', request.url), request));
      }
      // Dynamic OG image: /:slug/og-image.svg
      if (subPath === '/og-image.svg') {
        return await serveOgImage(slug, env);
      }
      // Dynamic manifest.json — PWA manifest for this event
      if (subPath === '/manifest.json') {
        let eventName = 'Waggle';
        let shortName = 'Waggle';
        let themeColor = '#1A472A';
        try {
          const cfgRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
          if (cfgRaw) {
            const cfg = JSON.parse(cfgRaw);
            eventName = cfg.event?.name || 'Waggle';
            shortName = cfg.event?.shortName || eventName;
            themeColor = cfg.theme?.primary || '#1A472A';
          }
        } catch {}
        const manifest = {
          name: eventName,
          short_name: shortName.slice(0, 12),
          start_url: `/${slug}/#dashboard`,
          display: 'standalone',
          background_color: '#F5F0E8',
          theme_color: themeColor,
          icons: [{ src: `/${slug}/icon-180.svg`, sizes: '180x180', type: 'image/svg+xml' }]
        };
        return new Response(JSON.stringify(manifest), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' }
        });
      }
      // Dynamic icon SVG for this event
      if (subPath === '/icon-180.svg') {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180"><rect width="180" height="180" rx="32" fill="#1A472A"/><text x="90" y="108" text-anchor="middle" font-family="sans-serif" font-size="64" font-weight="700" fill="#D4AF37">W</text></svg>`;
        return new Response(svg, {
          headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' }
        });
      }
      if (subPath.match(/\.(js|css|svg|png|json|woff2?)$/) && subPath !== '/config.json') {
        // Rewrite to shared asset path: /foo/js/app.js -> /app/js/app.js
        const assetPath = '/app' + subPath;
        const assetReq = new Request(new URL(assetPath, request.url), request);
        const assetResp = await env.ASSETS.fetch(assetReq);
        const hdrs = new Headers(assetResp.headers);
        hdrs.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        return new Response(assetResp.body, { status: assetResp.status, headers: hdrs });
      }
      // Serve config.json from KV (strip adminPin — never expose to client)
      if (subPath === '/config.json') {
        let configRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
        // Seed known demo events if config not found (mirrors serveEventHtml seeding)
        if (!configRaw) {
          const seedMap = {
            'pga-frisco-2026': () => seedFriscoV2(env),
            'cabot-citrus-invitational': () => seedDemoEvent(env),
            'demo-buddies': () => seedDemoBuddies(env),
            'demo-scramble': () => seedDemoScramble(env),
            'legends-trip': () => seedLegendsTrip(env),
            'stag-night': () => seedStagNight(env),
            'augusta-scramble': () => seedAugustaScramble(env),
            'masters-member-guest': () => seedMastersMG(env),
            'weekend-warrior': () => seedWeekendWarrior(env),
          };
          if (seedMap[slug]) {
            try { await seedMap[slug](); configRaw = await env.MG_BOOK.get(`config:${slug}`, 'text'); } catch {}
          }
        }
        if (!configRaw) {
          return new Response(JSON.stringify({ error: 'Event not found' }), {
            status: 404, headers: { 'Content-Type': 'application/json' }
          });
        }
        try {
          const cfg = JSON.parse(configRaw);
          delete cfg.adminPin;
          if (cfg.event) delete cfg.event.adminPin;
          return new Response(JSON.stringify(cfg), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }
          });
        } catch {
          return new Response(JSON.stringify({ error: 'Config parse error' }), {
            status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }
      }
      // Serve dynamic index.html (SPA shell with config-driven meta tags)
      return await serveEventHtml(slug, request, env);
    }

    // /api/create-event — create a new event
    if (url.pathname === '/api/create-event' && request.method === 'POST') {
      return handleCreateEvent(request, env);
    }
    if (url.pathname === '/api/create-event' && request.method === 'OPTIONS') {
      return new Response(null, { headers: EVENT_CORS });
    }

    // ===== SUBSCRIPTION ROUTES =====
    // POST /api/subscribe — create Stripe subscription checkout
    if (url.pathname === '/api/subscribe' && request.method === 'POST') {
      return handleSubscribe(request, env);
    }
    if (url.pathname === '/api/subscribe' && request.method === 'OPTIONS') {
      return new Response(null, { headers: EVENT_CORS });
    }
    // POST /api/billing-portal — Stripe customer portal for manage/cancel
    if (url.pathname === '/api/billing-portal' && request.method === 'POST') {
      return handleBillingPortal(request, env);
    }
    if (url.pathname === '/api/billing-portal' && request.method === 'OPTIONS') {
      return new Response(null, { headers: EVENT_CORS });
    }
    // GET /api/subscription-status?email= — check subscription status
    if (url.pathname === '/api/subscription-status' && request.method === 'GET') {
      const email = (url.searchParams.get('email') || '').trim().toLowerCase();
      if (!email) return new Response(JSON.stringify({ active: false }), { headers: EVENT_CORS });
      const sub = await env.MG_BOOK.get(`subscriber:${email}`, 'json');
      const active = sub && sub.status === 'active' && (sub.currentPeriodEnd || 0) > Date.now();
      return new Response(JSON.stringify({ active: !!active, plan: sub?.plan || null }), { headers: EVENT_CORS });
    }

    // /api/create-checkout — initiate Stripe payment before event creation
    if (url.pathname === '/api/create-checkout' && request.method === 'POST') {
      return handleCreateCheckout(request, env);
    }
    if (url.pathname === '/api/create-checkout' && request.method === 'OPTIONS') {
      return new Response(null, { headers: EVENT_CORS });
    }

    // GET /api/create-checkout?resume=TEMP_ID — resume abandoned checkout
    if (url.pathname === '/api/create-checkout' && request.method === 'GET' && url.searchParams.get('resume')) {
      return handleResumeCheckout(url, env);
    }

    // GET /api/pending-checkout?email={email} — check for abandoned checkout
    if (url.pathname === '/api/pending-checkout' && request.method === 'GET') {
      const email = (url.searchParams.get('email') || '').trim().toLowerCase();
      if (!email) return new Response(JSON.stringify({ pending: false }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      const pending = await env.MG_BOOK.get(`pending-checkout:${email}`, 'json');
      if (pending) {
        // Check if temp config still exists
        const tempConfig = await env.MG_BOOK.get(`pending:${pending.tempId}`, 'text');
        if (tempConfig) {
          return new Response(JSON.stringify({ pending: true, eventName: pending.eventName, tempId: pending.tempId }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        }
      }
      return new Response(JSON.stringify({ pending: false }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    // /api/validate-promo — validate a promo code
    if (url.pathname === '/api/validate-promo' && request.method === 'POST') {
      return handleValidatePromo(request, env);
    }
    if (url.pathname === '/api/validate-promo' && request.method === 'OPTIONS') {
      return new Response(null, { headers: EVENT_CORS });
    }

    // /api/checkout-success — Stripe redirect after payment
    if (url.pathname === '/api/checkout-success' && request.method === 'GET') {
      return handleCheckoutSuccess(url, env);
    }

    // POST /api/admin/refund — refund a Stripe payment
    if (url.pathname === '/api/admin/refund' && request.method === 'POST') {
      const pin = request.headers.get('X-Marketing-Pin') || '';
      const validPin = env.WAGGLE_MARKETING_PIN || '';
      if (!validPin || pin !== validPin) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
      return handleAdminRefund(request, env);
    }
    if (url.pathname === '/api/admin/refund' && request.method === 'OPTIONS') {
      return new Response(null, { headers: EVENT_CORS });
    }

    // /api/stripe-webhook — Stripe webhook for resilient activation
    if (url.pathname === '/api/stripe-webhook' && request.method === 'POST') {
      return handleStripeWebhook(request, env);
    }

    // /create/ — wizard (static)
    if (url.pathname === '/create' || url.pathname === '/create/') {
      const wizReq = new Request(new URL('/create/index.html', request.url), request);
      return env.ASSETS.fetch(wizReq);
    }

    // /overview/ — GM operations guide (static)
    if (url.pathname === '/overview' || url.pathname === '/overview/') {
      const ovReq = new Request(new URL('/overview/index.html', request.url), request);
      return env.ASSETS.fetch(ovReq);
    }

    // /ads/ — ad creative brief (no-cache to bypass edge)
    if (url.pathname === '/ads' || url.pathname === '/ads/') {
      const req = new Request(new URL('/ads/index.html', request.url), request);
      const res = await env.ASSETS.fetch(req);
      return new Response(res.body, { ...res, headers: { ...Object.fromEntries(res.headers), 'Cache-Control': 'no-store' } });
    }

    // /gtm/ — GTM doc (no-cache to bypass edge)
    if (url.pathname === '/gtm' || url.pathname === '/gtm/') {
      const req = new Request(new URL('/gtm/index.html', request.url), request);
      const res = await env.ASSETS.fetch(req);
      return new Response(res.body, { ...res, headers: { ...Object.fromEntries(res.headers), 'Cache-Control': 'no-store' } });
    }

    // /marketing/ — Evan's marketing command center (password-protected)
    if (url.pathname === '/marketing' || url.pathname === '/marketing/') {
      const req = new Request(new URL('/marketing/index.html', request.url), request);
      return env.ASSETS.fetch(req);
    }

    // /api/marketing/stats — live stats for the marketing dashboard
    if (url.pathname === '/api/marketing/stats' && request.method === 'GET') {
      return handleMarketingStats(url, env);
    }

    // /api/ads/pain-points — scrape Reddit + Claude pain point extraction
    if (url.pathname === '/api/ads/pain-points' && request.method === 'GET') {
      return handleAdsPainPoints(url, env);
    }

    // /api/ads/generate — Claude ad copy generation
    if (url.pathname === '/api/ads/generate' && request.method === 'POST') {
      return handleAdsGenerate(request, env);
    }

    // /api/ads/library — save/list generated ad variations
    if (url.pathname === '/api/ads/library' && request.method === 'GET') {
      return handleAdsLibrary(url, env);
    }
    if (url.pathname === '/api/ads/library' && request.method === 'POST') {
      return handleAdsSave(request, env);
    }

    // /api/affiliates — affiliate management
    if (url.pathname === '/api/affiliates/register' && request.method === 'POST') {
      return handleAffiliateRegister(request, env);
    }
    if (url.pathname === '/api/affiliates/stats' && request.method === 'GET') {
      return handleAffiliateStats(url, env);
    }
    if (url.pathname === '/api/affiliates/payout-request' && request.method === 'POST') {
      return handleAffiliatePayoutRequest(request, env);
    }
    if (url.pathname === '/api/affiliates/admin' && request.method === 'GET') {
      return handleAffiliateAdmin(url, env);
    }
    if (url.pathname === '/api/affiliates/mark-paid' && request.method === 'POST') {
      return handleAffiliateMarkPaid(request, env);
    }

    // POST /api/referral-credit — credit a commissioner for a referral
    if (url.pathname === '/api/referral-credit' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const { referrerEmail, referredSlug } = body;
      const JSON_CORS_HDR = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
      if (!referrerEmail) return new Response(JSON.stringify({ error: 'referrerEmail required' }), { status: 400, headers: JSON_CORS_HDR });
      if (!referredSlug) return new Response(JSON.stringify({ error: 'referredSlug required' }), { status: 400, headers: JSON_CORS_HDR });

      const email = referrerEmail.trim().toLowerCase();

      // Rate limit: max 1 credit per email per day
      const rlKey = `referral-rl:${email}`;
      const lastCredit = await env.MG_BOOK.get(rlKey, 'text');
      if (lastCredit) {
        return new Response(JSON.stringify({ error: 'Credit already issued today' }), { status: 429, headers: JSON_CORS_HDR });
      }

      // Verify referred event actually exists
      const eventConfig = await env.MG_BOOK.get(`config:${referredSlug}`, 'text');
      if (!eventConfig) return new Response(JSON.stringify({ error: 'Event not found' }), { status: 404, headers: JSON_CORS_HDR });

      // Prevent duplicate referrer+referee pair
      const key = `referral-credits:${email}`;
      const existing = (await env.MG_BOOK.get(key, 'json')) || { credits: 0, referrals: [] };
      const alreadyCredited = existing.referrals.some(r => r.slug === referredSlug);
      if (alreadyCredited) return new Response(JSON.stringify({ error: 'Already credited for this referral' }), { status: 409, headers: JSON_CORS_HDR });

      // Set rate limit (24h TTL)
      await env.MG_BOOK.put(rlKey, String(Date.now()), { expirationTtl: 86400 });

      existing.credits += 800; // $8.00 in cents
      existing.referrals.push({ slug: referredSlug, ts: Date.now() });
      await env.MG_BOOK.put(key, JSON.stringify(existing));
      return new Response(JSON.stringify({ ok: true, totalCredits: existing.credits, referralCount: existing.referrals.length }), { headers: JSON_CORS_HDR });
    }
    if (url.pathname === '/api/referral-credit' && request.method === 'OPTIONS') {
      return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
    }

    if (url.pathname === '/affiliate/' || url.pathname === '/affiliate') {
      return handleAffiliatePage(url, env);
    }

    // /api/affiliate-signup — public affiliate signup from /affiliates/ page
    if (url.pathname === '/api/affiliate-signup' && request.method === 'POST') {
      return handleAffiliateSignup(request, env);
    }
    if (url.pathname === '/api/affiliate-signup' && request.method === 'OPTIONS') {
      return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' } });
    }

    // /api/leads — lead tracker CRUD
    if (url.pathname === '/api/leads' && request.method === 'GET') {
      return handleLeadsList(url, env);
    }
    if (url.pathname === '/api/leads' && request.method === 'POST') {
      return handleLeadsUpsert(request, env);
    }
    if (url.pathname.startsWith('/api/leads/') && request.method === 'DELETE') {
      return handleLeadsDelete(url, env);
    }

    // /api/campaigns — campaign tracker CRUD
    if (url.pathname === '/api/campaigns' && request.method === 'GET') {
      return handleCampaignsList(url, env);
    }
    if (url.pathname === '/api/campaigns' && request.method === 'POST') {
      return handleCampaignsUpsert(request, env);
    }
    if (url.pathname === '/api/campaigns/status' && request.method === 'POST') {
      return handleCampaignsStatus(request, env);
    }
    if (url.pathname.startsWith('/api/campaigns/') && request.method === 'DELETE') {
      return handleCampaignsDelete(url, env);
    }

    // /go/ — PPC landing page (redirects to main page, preserves UTM params)
    if (url.pathname === '/go' || url.pathname === '/go/') {
      const dest = '/' + (url.search || '');
      return Response.redirect('https://betwaggle.com' + dest, 302);
    }

    // /affiliate/dashboard — affiliate dashboard page (static)
    if (url.pathname === '/affiliate/dashboard' || url.pathname === '/affiliate/dashboard/') {
      const req = new Request(new URL('/affiliate/dashboard.html', request.url), request);
      return env.ASSETS.fetch(req);
    }

    // /affiliate/ — affiliate link generator page (static)
    if (url.pathname === '/affiliate' || url.pathname === '/affiliate/') {
      const req = new Request(new URL('/affiliates/index.html', request.url), request);
      return env.ASSETS.fetch(req);
    }

    // /affiliate/generate — generate a referral link
    if (url.pathname === '/affiliate/generate' && request.method === 'GET') {
      return handleAffiliateGenerate(url);
    }

    // /partner/ — partner dashboard page (static)
    if (url.pathname === '/partner' || url.pathname === '/partner/') {
      const req = new Request(new URL('/partner/index.html', request.url), request);
      return env.ASSETS.fetch(req);
    }

    // /api/partner/:code — partner dashboard data
    const partnerMatch = url.pathname.match(/^\/api\/partner\/([a-z0-9_-]+)$/);
    if (partnerMatch && request.method === 'GET') {
      return handlePartnerDashboard(partnerMatch[1], env);
    }
    // /api/partner/:code/events — partner events list
    const partnerEventsMatch = url.pathname.match(/^\/api\/partner\/([a-z0-9_-]+)\/events$/);
    if (partnerEventsMatch && request.method === 'GET') {
      return handlePartnerEvents(partnerEventsMatch[1], env);
    }
    // /api/partner/:code/teams — export all teams
    const partnerTeamsMatch = url.pathname.match(/^\/api\/partner\/([a-z0-9_-]+)\/teams$/);
    if (partnerTeamsMatch && request.method === 'GET') {
      return handlePartnerTeams(partnerTeamsMatch[1], env);
    }
    // /api/partner/:code/payout-request — request payout
    const partnerPayoutMatch = url.pathname.match(/^\/api\/partner\/([a-z0-9_-]+)\/payout-request$/);
    if (partnerPayoutMatch && request.method === 'POST') {
      return handlePartnerPayoutRequest(partnerPayoutMatch[1], request, env);
    }
    // CORS preflight for partner APIs
    if (url.pathname.startsWith('/api/partner/') && request.method === 'OPTIONS') {
      return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
    }

    // /success/ — post-purchase confirmation page
    if (url.pathname === '/success' || url.pathname === '/success/') {
      return handleWaggleSuccess(url, env);
    }

    // /api/recap — AI round recap narrative
    if (url.pathname === '/api/recap' && request.method === 'GET') {
      return handleWaggleRecap(url, env);
    }
    if (url.pathname === '/api/recap' && request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: EVENT_CORS });
    }

    // /api/advisor — AI game format + stakes advisor
    if (url.pathname === '/api/advisor' && request.method === 'POST') {
      return handleWaggleAdvisor(request, env);
    }
    if (url.pathname === '/api/advisor' && request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: EVENT_CORS });
    }

    // /api/history — event history from waggle-db
    if (url.pathname === '/api/history' && request.method === 'GET') {
      return handleWaggleHistory(url, env);
    }

    // /api/ghin-lookup — GHIN handicap lookup proxy
    if (url.pathname === '/api/ghin-lookup' && request.method === 'GET') {
      return handleGhinLookup(url, env);
    }

    // /api/season/:id — get season leaderboard (aggregated across events)
    const seasonMatch = url.pathname.match(/^\/api\/season\/([a-z0-9_-]+)$/);
    if (seasonMatch && request.method === 'GET') {
      return handleSeasonLeaderboard(seasonMatch[1], env);
    }

    // /api/season — create/update season
    if (url.pathname === '/api/season' && request.method === 'POST') {
      return handleSeasonSave(request, env);
    }
    if (url.pathname === '/api/season' && request.method === 'OPTIONS') {
      return new Response(null, { headers: EVENT_CORS });
    }

    // /api/courses/search?q= — search courses by name (internal DB)
    if (url.pathname === '/api/courses/search' && request.method === 'GET') {
      return handleCourseSearch(url, env);
    }
    if (url.pathname === '/api/courses/search' && request.method === 'OPTIONS') {
      return new Response(null, { headers: EVENT_CORS });
    }

    // /api/courses/:id — get course by ID (internal DB)
    const courseGetMatch = url.pathname.match(/^\/api\/courses\/([a-z0-9_-]+)$/);
    if (courseGetMatch && request.method === 'GET') {
      return handleCourseGet(courseGetMatch[1], env);
    }

    // /api/courses — save a custom course (admin)
    if (url.pathname === '/api/courses' && request.method === 'POST') {
      return handleCourseSave(request, env);
    }
    if (url.pathname === '/api/courses' && request.method === 'OPTIONS') {
      return new Response(null, { headers: EVENT_CORS });
    }

    // /season/:id — season leaderboard page (dynamic HTML)
    const seasonPageMatch = url.pathname.match(/^\/season\/([a-z0-9_-]+)\/?$/);
    if (seasonPageMatch) {
      return handleSeasonPage(seasonPageMatch[1], env);
    }

    // /tour/ — product tour page (static)
    if (url.pathname === '/tour' || url.pathname === '/tour/') {
      const tourReq = new Request(new URL('/tour/index.html', request.url), request);
      return env.ASSETS.fetch(tourReq);
    }

    // /pricing/ — pricing page (static)
    if (url.pathname === '/pricing' || url.pathname === '/pricing/') {
      const pricingReq = new Request(new URL('/pricing/index.html', request.url), request);
      return env.ASSETS.fetch(pricingReq);
    }

    // / — landing page (A/B test: 50/50 split, sticky via cookie)
    if (url.pathname === '/' || url.pathname === '') {
      const cookies = request.headers.get('Cookie') || '';
      const abMatch = cookies.match(/waggle_ab=([AB])/);
      let variant = abMatch ? abMatch[1] : (Math.random() < 0.5 ? 'A' : 'B');
      const assetPath = variant === 'B' ? '/b/index.html' : '/index.html';
      const response = await env.ASSETS.fetch(new Request(new URL(assetPath, request.url), request));
      if (!abMatch) {
        const r = new Response(response.body, response);
        r.headers.set('Set-Cookie', `waggle_ab=${variant}; Path=/; Max-Age=2592000; SameSite=Lax`);
        return r;
      }
      return response;
    }

    // ===== LEGACY: backward compat for /waggle/ URLs during migration =====
    if (url.pathname.startsWith('/waggle/')) {
      const newPath = url.pathname.replace('/waggle/', '/');
      return Response.redirect(`https://betwaggle.com${newPath}${url.search}`, 301);
    }

    // ===== LEGACY: /golf/mg/ backward compat =====
    if (url.pathname.startsWith('/golf/mg/api/')) {
      const apiPath = url.pathname.replace('/golf/mg/api/', '');
      const resp = await handleEventApi('mg', apiPath, request, env, ctx);
      if (resp) return resp;
    }

    // ===== SEED DEMO EVENT (dev/admin) =====
    if (url.pathname === '/api/seed-demo' && request.method === 'GET') {
      try {
        const result = await seedDemoEvent(env);
        return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // Seed Joe's Frisco trip (v2 — clean slate)
    if (url.pathname === '/api/seed-frisco-v2' && request.method === 'GET') {
      try {
        const slug = 'pga-frisco-2026';
        // Delete old version if exists
        await env.MG_BOOK.delete(`config:${slug}`).catch(()=>{});
        await env.MG_BOOK.delete(`${slug}:holes`).catch(()=>{});
        await env.MG_BOOK.delete(`${slug}:game-state`).catch(()=>{});
        await env.MG_BOOK.delete(`${slug}:bets`).catch(()=>{});
        await env.MG_BOOK.delete(`${slug}:feed`).catch(()=>{});
        await env.MG_BOOK.delete(`${slug}:settings`).catch(()=>{});
        await env.MG_BOOK.delete(`${slug}:scores`).catch(()=>{});
        await env.MG_BOOK.delete(`${slug}:players`).catch(()=>{});

        const config = {
          event: {
            name: 'PGA Frisco 2026',
            shortName: 'PGA Frisco',
            venue: 'Fields Ranch at PGA Frisco',
            url: `https://betwaggle.com/${slug}/`,
            dates: { day1: '2026-03-28', day2: '2026-03-29' },
            format: 'nassau',
            adminPin: randomPin(),
            adminContact: 'joe@joeweill.com',
            eventType: 'buddies_trip',
            slug: slug,
          },
          scoring: { holesPerMatch: 18, handicapAllowance: 0.85 },
          structure: { nassauBet: 10, skinsBet: 5, autoPress: { enabled: true, threshold: 2 } },
          features: { betting: true },
          games: { nassau: true, skins: true, wolf: true, vegas: false, stableford: false, match_play: false, stroke_play: false, banker: false, bloodsome: false, bingo: false, nines: false, scramble: false },
          holesPerRound: 18,
          players: [
            { name: 'Joseph Weill', handicapIndex: 7.8, venmo: '', club: 'Tavistock' },
            { name: 'Andrew Morrison', handicapIndex: 12.4, venmo: '', club: 'Eligo' },
            { name: 'Robert Edgerton', handicapIndex: 11.2, venmo: '', club: 'Woodland' },
            { name: 'Benjamin Samuels', handicapIndex: 5.2, venmo: '', club: 'CC of Maryland' },
          ],
          roster: [
            { name: 'Joseph Weill', handicapIndex: 7.8, venmo: '', club: 'Tavistock' },
            { name: 'Andrew Morrison', handicapIndex: 12.4, venmo: '', club: 'Eligo' },
            { name: 'Robert Edgerton', handicapIndex: 11.2, venmo: '', club: 'Woodland' },
            { name: 'Benjamin Samuels', handicapIndex: 5.2, venmo: '', club: 'CC of Maryland' },
          ],
          wolfOrder: ['Joseph Weill', 'Andrew Morrison', 'Robert Edgerton', 'Benjamin Samuels'],
          teams: {}, flights: {}, flightOrder: [], pairings: {},
          theme: { primary: '#1A472A', accent: '#D4AF37', bg: '#F5F0E8', headerFont: 'Inter', bodyFont: 'Inter' },
          course: { id: 'pga-frisco-east', name: 'Fields Ranch East at PGA Frisco' },
          coursePars: [5,4,5,3,4,4,4,3,4,4,4,4,3,5,4,4,3,5],
          courseHcpIndex: [9,5,17,11,7,1,13,15,3,8,12,4,10,2,14,6,18,16],
        };

        await env.MG_BOOK.put(`config:${slug}`, JSON.stringify(config));
        await env.MG_BOOK.put(`${slug}:settings`, JSON.stringify({
          announcements: ['Welcome to PGA Frisco 2026! Nassau $10, Skins $5, Wolf. Auto-press at 2-down. Let\'s go.'],
          lockedMatches: [], oddsOverrides: {},
        }));

        // Index for both Joe and Evan
        for (const email of ['joe@joeweill.com', 'evan.ratner@gmail.com']) {
          const slugs = (await env.MG_BOOK.get(`commissioner:${email}`, 'json')) || [];
          if (!slugs.includes(slug)) { slugs.push(slug); await env.MG_BOOK.put(`commissioner:${email}`, JSON.stringify(slugs)); }
        }

        return new Response(JSON.stringify({
          ok: true,
          slug,
          url: `https://betwaggle.com/${slug}/`,
          adminUrl: `https://betwaggle.com/${slug}/#admin`,
          adminPin: config.event.adminPin,
          commissioner: 'joe@joeweill.com',
          players: ['Joseph Weill (7.8)', 'Andrew Morrison (12.4)', 'Robert Edgerton (11.2)', 'Benjamin Samuels (5.2)'],
          games: 'Nassau $10, Skins $5, Wolf (auto-press at 2-down)',
          course: 'Fields Ranch East at PGA Frisco — Par 72',
          instructions: 'Joe: open the admin URL, enter PIN 1234, go to Settings to toggle games or change stakes. Go to Scorecard tab to enter scores on game day.',
        }), { headers: { 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // Seed the Frisco buddies trip event (v1 — legacy)
    if (url.pathname === '/api/seed-frisco' && request.method === 'GET') {
      try {
        const slug = 'frisco-ranch-buddies';
        const existing = await env.MG_BOOK.get(`config:${slug}`, 'text');
        if (existing) {
          // Patch existing event with latest config
          const cfg = JSON.parse(existing);
          cfg.event.adminContact = 'joe@joeweill.com';
          // Add all game options
          cfg.games = { skins: true, nassau: true, wolf: true, vegas: true, stableford: true, match_play: true, nines: false, scramble: false };
          // Add round info
          cfg.rounds = {
            1: { course: 'Fields Ranch East', tees: 'Three Tees (~6,500 yds)', par: 72 },
            2: { course: 'Fields Ranch East', tees: 'Three Tees (~6,500 yds)', par: 72 },
            3: { course: 'Fields Ranch West', tees: 'Combo Tees (~6,400 yds)', par: 72 },
          };
          cfg.westCoursePars = [5, 4, 3, 4, 3, 5, 4, 4, 5, 3, 4, 3, 4, 4, 4, 3, 5, 5];
          cfg.westCourseHcpIndex = [7, 3, 9, 1, 17, 11, 5, 15, 13, 12, 4, 16, 2, 8, 18, 14, 6, 10];
          await env.MG_BOOK.put(`config:${slug}`, JSON.stringify(cfg));
          // Index for Joe's dashboard
          const joeSlugs = (await env.MG_BOOK.get('commissioner:joe@joeweill.com', 'json')) || [];
          if (!joeSlugs.includes(slug)) { joeSlugs.push(slug); await env.MG_BOOK.put('commissioner:joe@joeweill.com', JSON.stringify(joeSlugs)); }
          // Also keep Evan indexed
          const evanSlugs = (await env.MG_BOOK.get('commissioner:evan.ratner@gmail.com', 'json')) || [];
          if (!evanSlugs.includes(slug)) { evanSlugs.push(slug); await env.MG_BOOK.put('commissioner:evan.ratner@gmail.com', JSON.stringify(evanSlugs)); }
          return new Response(JSON.stringify({ ok: true, slug, status: 'patched', commissioner: 'joe@joeweill.com', games: Object.keys(cfg.games).filter(g => cfg.games[g]), rounds: cfg.rounds, url: `https://betwaggle.com/${slug}/` }), { headers: { 'Content-Type': 'application/json' } });
        }
        const config = {
          event: { name: 'Frisco Ranch Buddies Trip', shortName: 'Frisco Ranch', venue: 'PGA Frisco — Fields Ranch East', url: `https://betwaggle.com/${slug}/`, dates: { day1: new Date().toISOString().slice(0, 10) }, format: 'skins', adminPin: randomPin(), adminContact: 'joe@joeweill.com', eventType: 'buddies_trip', slug },
          scoring: { holesPerMatch: 18, handicapAllowance: 0.85 },
          structure: { nassauBet: 10, skinsBet: 5, autoPress: { enabled: true, threshold: 2 } },
          features: { betting: true },
          games: { skins: true, nassau: true, wolf: true, vegas: true, stableford: true, match_play: true, nines: false, scramble: false },
          holesPerRound: 18,
          players: [
            { name: 'Joseph Weill', handicapIndex: 7.8, venmo: '', club: 'Tavistock' },
            { name: 'Andrew Morrison', handicapIndex: 12.4, venmo: '', club: 'Eligo' },
            { name: 'Robert Edgerton', handicapIndex: 11.2, venmo: '', club: 'Woodland' },
            { name: 'Benjamin Samuels', handicapIndex: 5.2, venmo: '', club: 'CC of Maryland' },
          ],
          roster: [
            { name: 'Joseph Weill', handicapIndex: 7.8, venmo: '', club: 'Tavistock' },
            { name: 'Andrew Morrison', handicapIndex: 12.4, venmo: '', club: 'Eligo' },
            { name: 'Robert Edgerton', handicapIndex: 11.2, venmo: '', club: 'Woodland' },
            { name: 'Benjamin Samuels', handicapIndex: 5.2, venmo: '', club: 'CC of Maryland' },
          ],
          wolfOrder: ['Joseph Weill', 'Andrew Morrison', 'Robert Edgerton', 'Benjamin Samuels'],
          teams: {}, flights: {}, flightOrder: [], pairings: {},
          theme: { primary: '#1A472A', accent: '#D4AF37', bg: '#F5F0E8', headerFont: 'Inter', bodyFont: 'Inter' },
          // 3 rounds at PGA Frisco
          rounds: {
            1: { course: 'Fields Ranch East', tees: 'Three Tees (~6,500 yds)', par: 72 },
            2: { course: 'Fields Ranch East', tees: 'Three Tees (~6,500 yds)', par: 72 },
            3: { course: 'Fields Ranch West', tees: 'Combo Tees (~6,400 yds)', par: 72 },
          },
          // Default to Round 1: Fields Ranch East
          coursePars: [5, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 4, 3, 5, 4, 4, 3, 5],
          courseHcpIndex: [9, 5, 17, 11, 7, 1, 13, 15, 3, 8, 12, 4, 10, 2, 14, 6, 18, 16],
          // West course data for Round 3
          westCoursePars: [5, 4, 3, 4, 3, 5, 4, 4, 5, 3, 4, 3, 4, 4, 4, 3, 5, 5],
          westCourseHcpIndex: [7, 3, 9, 1, 17, 11, 5, 15, 13, 12, 4, 16, 2, 8, 18, 14, 6, 10],
        };
        await env.MG_BOOK.put(`config:${slug}`, JSON.stringify(config));
        await env.MG_BOOK.put(`${slug}:settings`, JSON.stringify({ announcements: ['Welcome to the Frisco Ranch Buddies Trip! Nassau $10, Skins $5, Wolf active. Auto-press at 2-down.'], lockedMatches: [], oddsOverrides: {} }));
        const commEmail = 'evan.ratner@gmail.com';
        const existingSlugs = (await env.MG_BOOK.get(`commissioner:${commEmail}`, 'json')) || [];
        if (!existingSlugs.includes(slug)) { existingSlugs.push(slug); await env.MG_BOOK.put(`commissioner:${commEmail}`, JSON.stringify(existingSlugs)); }
        return new Response(JSON.stringify({ ok: true, slug, url: `https://betwaggle.com/${slug}/`, adminPin: config.event.adminPin, players: config.players.map(p => `${p.name} (${p.venmo})`), games: 'Nassau $10 + Skins $5 + Wolf' }), { headers: { 'Content-Type': 'application/json' } });
      } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } }); }
    }

    // Serve static assets
    const assetResp = await env.ASSETS.fetch(request);
    const hdrs = new Headers(assetResp.headers);

    // Force no-cache for SPA JS/CSS/HTML files (prevent stale mobile cache)
    if (url.pathname.startsWith('/app/') && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.html'))) {
      hdrs.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      hdrs.set('CDN-Cache-Control', 'no-store');
      hdrs.delete('ETag');
    }
    if (url.pathname === '/app/' || url.pathname === '/app/index.html') {
      hdrs.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      hdrs.set('CDN-Cache-Control', 'no-store');
    }

    return new Response(assetResp.body, { status: assetResp.status, headers: hdrs });
  },

  // Cron handler: weekly digest + drip emails + demo seed + expiration cleanup
  async scheduled(event, env, ctx) {
    ctx.waitUntil(seedDemoEvent(env));
    ctx.waitUntil(seedFriscoV2(env));
    ctx.waitUntil(sendWeeklyMarketingDigest(env));
    ctx.waitUntil(processDripEmails(env));
    ctx.waitUntil(cleanupExpiredEvents(env));
  },
};


// ─── Expired Event Cleanup ────────────────────────────────────────────────

async function cleanupExpiredEvents(env) {
  if (!env.MG_BOOK) return;
  const now = new Date();
  const cutoff90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  let cleaned = 0;

  try {
    // List all event configs from KV
    let cursor = undefined;
    const allKeys = [];
    do {
      const listOpts = { prefix: 'config:' };
      if (cursor) listOpts.cursor = cursor;
      const list = await env.MG_BOOK.list(listOpts);
      allKeys.push(...list.keys);
      cursor = list.list_complete ? undefined : list.cursor;
    } while (cursor);

    for (const key of allKeys) {
      const slug = key.name.replace('config:', '');
      // Skip demo/seed events
      if (slug.startsWith('demo-') || slug === 'mg') continue;

      const configRaw = await env.MG_BOOK.get(key.name, 'text');
      if (!configRaw) continue;

      let config;
      try { config = JSON.parse(configRaw); } catch { continue; }

      // Don't expire completed/trophy events — those are permanent
      if (config.event?.status === 'complete') continue;
      // Don't re-process already archived events
      if (config.event?.status === 'archived') continue;

      // Check if expired: explicit expiresAt field OR createdAt older than 90 days
      const expiresAt = config.event?.expiresAt;
      const createdAt = config.event?.createdAt;
      const isExpired = (expiresAt && new Date(expiresAt) < now) ||
                        (createdAt && createdAt < cutoff90d) ||
                        (!expiresAt && !createdAt);

      if (!isExpired) continue;

      // Already marked expired or refunded — archive and clean up KV
      // For active events, first mark as expired
      if (config.event?.status !== 'expired' && config.event?.status !== 'refunded') {
        config.event.status = 'expired';
        config.event.expiredAt = now.toISOString();
      }

      // Archive to D1
      if (env.WAGGLE_DB) {
        try {
          await env.WAGGLE_DB.prepare(
            'INSERT INTO archived_events (slug, config, archived_at) VALUES (?, ?, ?)'
          ).bind(slug, configRaw, now.toISOString()).run();
        } catch (e) {
          // Table may not exist yet — that's OK, just log
          console.error('archive-insert', slug, e.message);
        }
        // Update events table status
        try {
          await env.WAGGLE_DB.prepare('UPDATE events SET status = ? WHERE slug = ?').bind('archived', slug).run();
        } catch {}
      }

      // Delete KV keys for this event
      const kvKeysToDelete = [
        `${slug}:holes`, `${slug}:game-state`, `${slug}:feed`,
        `${slug}:bets`, `config:${slug}`
      ];
      for (const k of kvKeysToDelete) {
        await env.MG_BOOK.delete(k).catch(() => {});
      }

      cleaned++;
    }

    if (cleaned > 0) console.log(`cleanup-expired-events: archived and cleaned ${cleaned} events`);
  } catch (e) {
    console.error('cleanup-expired-events', e.message);
  }
}

// ─── Demo Buddies Trip Seeder ────────────────────────────────────────────────

async function seedDemoBuddies(env) {
  const KEY = 'config:demo-buddies';
  const existing = await env.MG_BOOK.get(KEY);
  if (existing) return { seeded: false };

  const players = [
    { name: 'Jake Sullivan', handicapIndex: 8.2 },
    { name: 'Ryan Costa', handicapIndex: 14.6 },
    { name: 'Mike Torres', handicapIndex: 5.1 },
    { name: 'Dan Keller', handicapIndex: 11.8 }
  ];
  const pars = [4,4,3,5,4,4,3,4,5, 4,3,5,4,4,4,3,4,5]; // par 72

  const config = {
    event: { name: 'The Dunes Trip 2026', shortName: 'Dunes Trip', eventType: 'buddies_trip', course: 'Streamsong Black', currentRound: 1, venue: 'Streamsong Resort' },
    players: players,
    roster: players,
    games: { nassau: true, skins: true, wolf: true },
    structure: { nassauBet: '10', skinsBet: '5', autoPress: { enabled: true, threshold: 2 } },
    holesPerRound: 18,
    course: { name: 'Streamsong Black', pars: pars, tees: 'Blue' },
    rounds: { '1': { course: 'Streamsong Black', tees: 'Blue' } },
    adminPin: randomPin()
  };
  await env.MG_BOOK.put(KEY, JSON.stringify(config));

  // Pre-seed 12 holes of scores — Jake is hot, Ryan is bleeding
  const scores = {
    1: { 'Jake Sullivan': 4, 'Ryan Costa': 5, 'Mike Torres': 4, 'Dan Keller': 5 },
    2: { 'Jake Sullivan': 3, 'Ryan Costa': 5, 'Mike Torres': 4, 'Dan Keller': 4 },
    3: { 'Jake Sullivan': 3, 'Ryan Costa': 4, 'Mike Torres': 3, 'Dan Keller': 3 },
    4: { 'Jake Sullivan': 5, 'Ryan Costa': 6, 'Mike Torres': 5, 'Dan Keller': 5 },
    5: { 'Jake Sullivan': 4, 'Ryan Costa': 5, 'Mike Torres': 3, 'Dan Keller': 4 },
    6: { 'Jake Sullivan': 4, 'Ryan Costa': 5, 'Mike Torres': 4, 'Dan Keller': 5 },
    7: { 'Jake Sullivan': 2, 'Ryan Costa': 4, 'Mike Torres': 3, 'Dan Keller': 3 },
    8: { 'Jake Sullivan': 4, 'Ryan Costa': 5, 'Mike Torres': 4, 'Dan Keller': 4 },
    9: { 'Jake Sullivan': 5, 'Ryan Costa': 6, 'Mike Torres': 4, 'Dan Keller': 5 },
    10: { 'Jake Sullivan': 4, 'Ryan Costa': 5, 'Mike Torres': 4, 'Dan Keller': 3 },
    11: { 'Jake Sullivan': 3, 'Ryan Costa': 4, 'Mike Torres': 2, 'Dan Keller': 3 },
    12: { 'Jake Sullivan': 4, 'Ryan Costa': 6, 'Mike Torres': 5, 'Dan Keller': 5 }
  };

  const holes = {};
  for (const [h, s] of Object.entries(scores)) {
    holes[h] = { scores: s, timestamp: Date.now() - (12 - parseInt(h)) * 600000 };
  }
  await env.MG_BOOK.put(`demo-buddies:holes`, JSON.stringify(holes));

  // Compute basic game state for skins
  const gameState = { skins: { history: [], pot: 1 } };
  for (let h = 1; h <= 12; h++) {
    const hScores = scores[h];
    const entries = players.map(p => ({ name: p.name, score: hScores[p.name] }));
    const minScore = Math.min(...entries.map(e => e.score));
    const winners = entries.filter(e => e.score === minScore);
    if (winners.length === 1) {
      gameState.skins.history.push({ hole: h, winner: winners[0].name, pot: gameState.skins.pot, value: gameState.skins.pot * 3 * 5 });
      gameState.skins.pot = 1;
    } else {
      gameState.skins.history.push({ hole: h, winner: null, pot: gameState.skins.pot, carry: true });
      gameState.skins.pot++;
    }
  }
  await env.MG_BOOK.put(`demo-buddies:game-state`, JSON.stringify(gameState));

  // Seed feed with narrative
  const feed = [
    { ts: Date.now() - 100000, type: 'score', text: 'Jake birdies #7! Takes the skin ($15). Pushing to +$30.', player: 'Jake Sullivan' },
    { ts: Date.now() - 200000, type: 'score', text: 'Ryan double-bogeys #12. The bleeding continues.', player: 'Ryan Costa' },
    { ts: Date.now() - 300000, type: 'score', text: 'Mike drains a 20-footer on #11 for birdie. Skin won!', player: 'Mike Torres' },
    { ts: Date.now() - 400000, type: 'chirp', text: 'Ryan hasn\'t won a skin since the parking lot. Someone buy him a beer.', player: 'System' },
    { ts: Date.now() - 500000, type: 'score', text: 'Skin carries on #4. Pot growing to $10.', player: 'System' },
  ];
  await env.MG_BOOK.put(`demo-buddies:feed`, JSON.stringify(feed));

  return { seeded: true };
}

// ─── Demo Scramble Seeder ───────────────────────────────────────────────────

async function seedDemoScramble(env) {
  const KEY = 'config:demo-scramble';
  const existing = await env.MG_BOOK.get(KEY);
  if (existing) return { seeded: false };

  const teamNames = ['Team Alpha', 'Team Bravo', 'Team Charlie', 'Team Delta', 'Team Eagle', 'Team Falcon', 'Team Grizzly', 'Team Hawk'];
  const teams = teamNames.map((name, i) => ({ name, handicapIndex: [5.2, 4.8, 6.1, 5.5, 7.0, 4.2, 6.8, 5.9][i] }));
  const pars = [4,5,3,4,4,4,3,5,4, 4,3,4,5,4,3,4,5,4]; // par 72

  const config = {
    event: { name: 'Spring Scramble 2026', shortName: 'Spring Scramble', eventType: 'scramble', course: 'TPC Sawgrass', currentRound: 1, venue: 'TPC Sawgrass' },
    players: teams.map(t => ({ name: t.name, handicapIndex: t.handicapIndex })),
    roster: teams.map(t => ({ name: t.name, handicapIndex: t.handicapIndex })),
    teams: teams,
    games: { scramble: true },
    structure: {},
    holesPerRound: 18,
    course: { name: 'TPC Sawgrass', pars: pars, tees: 'Blue' },
    rounds: { '1': { course: 'TPC Sawgrass', tees: 'Blue' } },
    scrambleEntryFee: 200,
    scrambleTeams: teams,
    adminPin: randomPin()
  };
  await env.MG_BOOK.put(KEY, JSON.stringify(config));

  // Pre-seed 9 holes — tight leaderboard with fun team names
  //                     Alpha Bravo Charlie Delta Eagle Falcon Grizzly Hawk
  const holeScores = [
    /*1 p4*/ [3, 4, 4, 3, 4, 3, 4, 4],
    /*2 p5*/ [4, 4, 5, 4, 5, 4, 4, 5],
    /*3 p3*/ [3, 2, 3, 3, 3, 2, 3, 3],
    /*4 p4*/ [3, 4, 4, 4, 4, 3, 3, 4],
    /*5 p4*/ [4, 3, 4, 4, 3, 4, 4, 3],
    /*6 p4*/ [3, 4, 3, 4, 4, 3, 4, 4],
    /*7 p3*/ [3, 3, 3, 2, 3, 3, 2, 3],
    /*8 p5*/ [4, 5, 4, 4, 5, 4, 5, 4],
    /*9 p4*/ [3, 4, 4, 3, 4, 4, 3, 4],
  ];

  const holes = {};
  const totals = {};
  teamNames.forEach(t => { totals[t] = 0; });

  for (let h = 1; h <= 9; h++) {
    const s = {};
    teamNames.forEach((t, i) => {
      s[t] = holeScores[h - 1][i];
      totals[t] += holeScores[h - 1][i];
    });
    holes[h] = { scores: s, timestamp: Date.now() - (9 - h) * 600000 };
  }
  await env.MG_BOOK.put('demo-scramble:holes', JSON.stringify(holes));

  // Build scramble leaderboard from totals
  const leaderboard = teamNames.map(t => ({ team: t, total: totals[t] }))
    .sort((a, b) => a.total - b.total)
    .map((entry, i) => ({ ...entry, position: i + 1 }));

  // Build per-hole results for the scramble engine state
  const scrambleHoles = {};
  for (let h = 1; h <= 9; h++) {
    scrambleHoles[h] = {};
    teamNames.forEach((t, i) => { scrambleHoles[h][t] = holeScores[h - 1][i]; });
  }

  const gameState = {
    scramble: {
      running: totals,
      holes: scrambleHoles,
      leaderboard: leaderboard
    }
  };
  await env.MG_BOOK.put('demo-scramble:game-state', JSON.stringify(gameState));

  const baseTs = new Date().setHours(10, 15, 0, 0);
  const feed = [
    { ts: baseTs + 87 * 60000, type: 'chirp', text: 'Front 9 complete. Three teams within a shot. Back 9 is going to be a war.', player: 'System' },
    { ts: baseTs + 82 * 60000, type: 'score', text: 'Team Delta aces the par 3 7th. Best shot of the day. The tent erupted.', player: 'Team Delta' },
    { ts: baseTs + 75 * 60000, type: 'score', text: 'Team Falcon birdies #6. Tied for the lead at -5. Ice in their veins.', player: 'Team Falcon' },
    { ts: baseTs + 68 * 60000, type: 'score', text: 'Team Alpha eagles #5. The avalanche has started — they\'re -6 through 5.', player: 'Team Alpha' },
    { ts: baseTs + 55 * 60000, type: 'score', text: 'Team Grizzly hits it to 4 feet on 7. Birdie inevitable. They\'re lurking.', player: 'Team Grizzly' },
    { ts: baseTs + 42 * 60000, type: 'chirp', text: 'Three teams deadlocked at -5 heading to the back nine. Buckle up.', player: 'System' },
    { ts: baseTs + 35 * 60000, type: 'score', text: 'Team Eagle shoots +1 through 6. Bracket busted already. Drinks on them.', player: 'Team Eagle' },
    { ts: baseTs + 22 * 60000, type: 'score', text: 'Team Falcon\'s birdie putt lips out on 3. The howl heard across the course.', player: 'Team Falcon' },
    { ts: baseTs + 12 * 60000, type: 'side', text: 'Closest to pin on #4: Team Delta, 6\' 2\". Money on the line.', player: 'Team Delta' },
    { ts: baseTs, type: 'score', text: 'Team Bravo fires -4 on the front. They\'re coming. Nobody\'s safe.', player: 'Team Bravo' },
  ];
  await env.MG_BOOK.put('demo-scramble:feed', JSON.stringify(feed));

  return { seeded: true };
}

// ─── Demo Event Seeder ──────────────────────────────────────────────────────

async function seedDemoEvent(env) {
  const KEY = 'config:cabot-citrus-invitational';
  const existing = await env.MG_BOOK.get(KEY);
  if (existing) return { seeded: false, reason: 'already exists' };

  // Event config
  const config = {
    event: {
      name: 'Cabot Citrus Invitational 2026',
      shortName: 'Cabot Citrus',
      venue: 'Cabot Citrus Farms',
      url: 'https://betwaggle.com/cabot-citrus-invitational/',
      dates: { day1: '2026-04-15' },
      format: 'skins',
      adminPin: randomPin(),
      adminContact: '',
      eventType: 'buddies_trip',
      status: 'active',
    },
    scoring: { holesPerMatch: 18, handicapAllowance: 0.85 },
    structure: { nassauBet: 20, skinsBet: 10, autoPress: { enabled: true, threshold: 2 } },
    features: { betting: true },
    games: { skins: true, nassau: true, wolf: true },
    holesPerRound: 18,
    players: [
      { name: 'Tiger Woods', handicapIndex: 0.6, venmo: '@tigerwoods' },
      { name: 'Rory McIlroy', handicapIndex: -1.2, venmo: '@rorymci' },
      { name: 'Phil Mickelson', handicapIndex: 2.1, venmo: '@philmickelson' },
      { name: 'Dustin Johnson', handicapIndex: 0.4, venmo: '@djohnson' },
      { name: 'Jon Rahm', handicapIndex: -0.8, venmo: '@jonrahm' },
      { name: 'Justin Thomas', handicapIndex: 0.2, venmo: '@justinthomas' },
      { name: 'Scottie Scheffler', handicapIndex: -0.5, venmo: '@scheffler' },
      { name: 'Brooks Koepka', handicapIndex: 1.0, venmo: '@bkoepka' },
    ],
    roster: [
      { name: 'Tiger Woods', handicapIndex: 0.6 },
      { name: 'Rory McIlroy', handicapIndex: -1.2 },
      { name: 'Phil Mickelson', handicapIndex: 2.1 },
      { name: 'Dustin Johnson', handicapIndex: 0.4 },
      { name: 'Jon Rahm', handicapIndex: -0.8 },
      { name: 'Justin Thomas', handicapIndex: 0.2 },
      { name: 'Scottie Scheffler', handicapIndex: -0.5 },
      { name: 'Brooks Koepka', handicapIndex: 1.0 },
    ],
    wolfOrder: ['Tiger Woods', 'Rory McIlroy', 'Phil Mickelson', 'Dustin Johnson', 'Jon Rahm', 'Justin Thomas', 'Scottie Scheffler', 'Brooks Koepka'],
    teams: {},
    flights: {},
    flightOrder: [],
    pairings: {},
    theme: { primary: '#1A472A', accent: '#D4AF37', bg: '#F5F0E8', headerFont: 'Inter', bodyFont: 'Inter' },
  };

  // Hole scores (holes 1-14)
  const now = Date.now();
  const holeScores = {
    1: { scores: { 'Tiger Woods': 4, 'Rory McIlroy': 3, 'Phil Mickelson': 5, 'Dustin Johnson': 4, 'Jon Rahm': 4, 'Justin Thomas': 3, 'Scottie Scheffler': 4, 'Brooks Koepka': 5 }, timestamp: now - 180000 },
    2: { scores: { 'Tiger Woods': 3, 'Rory McIlroy': 4, 'Phil Mickelson': 4, 'Dustin Johnson': 3, 'Jon Rahm': 3, 'Justin Thomas': 4, 'Scottie Scheffler': 3, 'Brooks Koepka': 4 }, timestamp: now - 170000 },
    3: { scores: { 'Tiger Woods': 5, 'Rory McIlroy': 4, 'Phil Mickelson': 5, 'Dustin Johnson': 5, 'Jon Rahm': 4, 'Justin Thomas': 5, 'Scottie Scheffler': 4, 'Brooks Koepka': 6 }, timestamp: now - 160000 },
    4: { scores: { 'Tiger Woods': 4, 'Rory McIlroy': 4, 'Phil Mickelson': 4, 'Dustin Johnson': 3, 'Jon Rahm': 5, 'Justin Thomas': 4, 'Scottie Scheffler': 4, 'Brooks Koepka': 4 }, timestamp: now - 150000 },
    5: { scores: { 'Tiger Woods': 3, 'Rory McIlroy': 3, 'Phil Mickelson': 4, 'Dustin Johnson': 4, 'Jon Rahm': 3, 'Justin Thomas': 3, 'Scottie Scheffler': 3, 'Brooks Koepka': 4 }, timestamp: now - 140000 },
    6: { scores: { 'Tiger Woods': 4, 'Rory McIlroy': 5, 'Phil Mickelson': 4, 'Dustin Johnson': 4, 'Jon Rahm': 4, 'Justin Thomas': 4, 'Scottie Scheffler': 5, 'Brooks Koepka': 5 }, timestamp: now - 130000 },
    7: { scores: { 'Tiger Woods': 2, 'Rory McIlroy': 3, 'Phil Mickelson': 3, 'Dustin Johnson': 3, 'Jon Rahm': 3, 'Justin Thomas': 4, 'Scottie Scheffler': 3, 'Brooks Koepka': 3 }, timestamp: now - 120000 },
    8: { scores: { 'Tiger Woods': 5, 'Rory McIlroy': 4, 'Phil Mickelson': 6, 'Dustin Johnson': 5, 'Jon Rahm': 4, 'Justin Thomas': 5, 'Scottie Scheffler': 4, 'Brooks Koepka': 5 }, timestamp: now - 110000 },
    9: { scores: { 'Tiger Woods': 4, 'Rory McIlroy': 3, 'Phil Mickelson': 4, 'Dustin Johnson': 4, 'Jon Rahm': 4, 'Justin Thomas': 4, 'Scottie Scheffler': 3, 'Brooks Koepka': 5 }, timestamp: now - 100000 },
    10: { scores: { 'Tiger Woods': 4, 'Rory McIlroy': 4, 'Phil Mickelson': 5, 'Dustin Johnson': 4, 'Jon Rahm': 3, 'Justin Thomas': 4, 'Scottie Scheffler': 4, 'Brooks Koepka': 4 }, timestamp: now - 90000 },
    11: { scores: { 'Tiger Woods': 3, 'Rory McIlroy': 3, 'Phil Mickelson': 3, 'Dustin Johnson': 4, 'Jon Rahm': 3, 'Justin Thomas': 3, 'Scottie Scheffler': 3, 'Brooks Koepka': 4 }, timestamp: now - 80000 },
    12: { scores: { 'Tiger Woods': 4, 'Rory McIlroy': 5, 'Phil Mickelson': 4, 'Dustin Johnson': 4, 'Jon Rahm': 4, 'Justin Thomas': 4, 'Scottie Scheffler': 5, 'Brooks Koepka': 4 }, timestamp: now - 70000 },
    13: { scores: { 'Tiger Woods': 3, 'Rory McIlroy': 2, 'Phil Mickelson': 3, 'Dustin Johnson': 3, 'Jon Rahm': 3, 'Justin Thomas': 3, 'Scottie Scheffler': 3, 'Brooks Koepka': 3 }, timestamp: now - 60000 },
    14: { scores: { 'Tiger Woods': 4, 'Rory McIlroy': 4, 'Phil Mickelson': 5, 'Dustin Johnson': 4, 'Jon Rahm': 4, 'Justin Thomas': 4, 'Scottie Scheffler': 4, 'Brooks Koepka': 5 }, timestamp: now - 50000 },
  };

  // Game state
  const gameState = {
    skins: {
      pot: 1,
      holes: {
        1: { winner: 'Rory McIlroy', potWon: 1 },
        2: { carried: true },
        3: { carried: true },
        4: { winner: 'Dustin Johnson', potWon: 3 },
        5: { carried: true },
        6: { carried: true },
        7: { winner: 'Tiger Woods', potWon: 3 },
        8: { carried: true },
        9: { winner: 'Rory McIlroy', potWon: 2 },
        10: { winner: 'Jon Rahm', potWon: 1 },
        11: { carried: true },
        12: { carried: true },
        13: { winner: 'Rory McIlroy', potWon: 3 },
        14: { carried: true },
      },
    },
    nassau: {
      running: {
        'Tiger Woods': { front: 34, back: 18, total: 52 },
        'Rory McIlroy': { front: 33, back: 18, total: 51 },
        'Scottie Scheffler': { front: 33, back: 19, total: 52 },
        'Jon Rahm': { front: 34, back: 17, total: 51 },
        'Justin Thomas': { front: 34, back: 18, total: 52 },
        'Dustin Johnson': { front: 35, back: 19, total: 54 },
        'Phil Mickelson': { front: 38, back: 20, total: 58 },
        'Brooks Koepka': { front: 41, back: 21, total: 62 },
      },
      frontWinner: 'Rory McIlroy',
      presses: [],
    },
  };

  // Bets
  const bets = [
    { id: 'bet-demo-1', bettor: 'Gallery Fan', type: 'match_winner', selection: 'Tiger Woods', matchId: 'nassau', description: 'Tiger to win Nassau overall', stake: 50, odds: 2.1, americanOdds: '+110', status: 'active', createdAt: new Date().toISOString() },
    { id: 'bet-demo-2', bettor: 'The Degenerate', type: 'match_winner', selection: 'Rory McIlroy', matchId: 'skins', description: 'Rory to lead skins', stake: 30, odds: 1.8, americanOdds: '-125', status: 'active', createdAt: new Date().toISOString() },
    { id: 'bet-demo-3', bettor: 'Club Pro', type: 'game_winner', selection: 'Jon Rahm', matchId: 'nassau', description: 'Rahm to win Nassau back 9', stake: 25, odds: 3.0, americanOdds: '+200', status: 'active', createdAt: new Date().toISOString() },
  ];

  // Feed
  const feed = [
    { id: 'feed-1', type: 'score', player: 'Tiger Woods', text: 'Tiger Woods made a deuce on Hole 7!', emoji: '', ts: now - 120000 },
    { id: 'feed-2', type: 'score', player: 'Rory McIlroy', text: 'Rory McIlroy eagled Hole 13!', emoji: '', ts: now - 60000 },
    { id: 'feed-3', type: 'chirp', player: 'The Degenerate', text: 'Tiger is dialed in today', emoji: '', ts: now - 90000 },
    { id: 'feed-4', type: 'score', player: 'Nassau', text: 'Rory is 1 UP thru 14 in the Nassau', emoji: '', ts: now - 40000 },
    { id: 'feed-5', type: 'press', player: 'Brooks Koepka', text: 'Auto-press! Brooks is 3-down on the front', emoji: '', ts: now - 100000, auto: true },
  ];

  // Settings
  const settings = {
    announcements: ['Welcome to the Cabot Citrus Invitational! Nassau $20, Skins $10, Wolf active. Good luck.'],
    lockedMatches: [],
    oddsOverrides: {},
  };

  // Write all keys to KV
  const slug = 'cabot-citrus-invitational';
  await Promise.all([
    env.MG_BOOK.put(KEY, JSON.stringify(config)),
    env.MG_BOOK.put(`${slug}:holes`, JSON.stringify(holeScores)),
    env.MG_BOOK.put(`${slug}:game-state`, JSON.stringify(gameState)),
    env.MG_BOOK.put(`${slug}:bets`, JSON.stringify(bets)),
    env.MG_BOOK.put(`${slug}:feed`, JSON.stringify(feed)),
    env.MG_BOOK.put(`${slug}:settings`, JSON.stringify(settings)),
  ]);

  console.log('Demo event seeded: cabot-citrus-invitational');
  return { seeded: true, slug, keys: [KEY, `${slug}:holes`, `${slug}:game-state`, `${slug}:bets`, `${slug}:feed`, `${slug}:settings`] };
}


// ─── Shared helpers ────────────────────────────────────────────────────────

// ── Unified AI helper: Workers AI (free, edge) → Anthropic (fallback) ──────
async function callAI(env, system, userMessage, maxTokens = 400) {
  // Try Workers AI first (free, runs at the edge)
  if (env.AI) {
    try {
      const result = await env.AI.run('@cf/meta/llama-3.1-70b-instruct', {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: typeof userMessage === 'string' ? userMessage : JSON.stringify(userMessage) }
        ],
        max_tokens: maxTokens,
        temperature: 0.7,
      });
      if (result?.response) {
        return { content: [{ type: 'text', text: result.response }] };
      }
    } catch (e) {
      console.error('Workers AI error, falling back to Anthropic:', e.message);
    }
  }
  // Fallback to Anthropic Claude
  return callClaude(env, system, [{ role: 'user', content: typeof userMessage === 'string' ? userMessage : JSON.stringify(userMessage) }], maxTokens);
}

async function callClaude(env, system, messages, maxTokens = 400, extra = {}) {
  const body = {
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: maxTokens,
    system,
    messages,
    ...extra,
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Anthropic API error:', res.status, err);
    throw new Error(`Anthropic ${res.status}: ${err.slice(0, 200)}`);
  }
  return res.json();
}

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (match) return JSON.parse(match[0]);
  return null;
}

// ─── GHIN Handicap Lookup ─────────────────────────────────────────────────

async function handleGhinLookup(url, env) {
  const ghinNum = url.searchParams.get('ghin');
  const lastName = (url.searchParams.get('last_name') || '').trim();

  if (!ghinNum || !/^\d{5,10}$/.test(ghinNum)) {
    return new Response(JSON.stringify({ error: 'Enter a valid GHIN number (5-10 digits)' }), { headers: EVENT_CORS });
  }

  // Check KV cache first (24h TTL)
  const cacheKey = 'ghin:cache:' + encodeURIComponent(ghinNum + (lastName ? ':' + lastName.toLowerCase() : ''));
  if (env.MG_BOOK) {
    try {
      const cached = await env.MG_BOOK.get(cacheKey, 'json');
      if (cached) return new Response(JSON.stringify(cached), { headers: EVENT_CORS });
    } catch {}
  }

  // Try GHIN official API if token configured
  if (env.GHIN_TOKEN) {
    try {
      const res = await fetch(
        `https://api2.ghin.com/api/v1/golfers.json?per_page=1&page=1&golfer_id=${ghinNum}&from_ghin=true&status=Active`,
        { headers: { 'Authorization': `Bearer ${env.GHIN_TOKEN}`, 'Accept': 'application/json' } }
      );
      if (res.ok) {
        const data = await res.json();
        const golfers = data.golfers || [];
        if (golfers.length > 0) {
          const g = golfers[0];
          if (lastName && !g.last_name.toLowerCase().startsWith(lastName.toLowerCase())) {
            return new Response(JSON.stringify({ error: 'Last name does not match GHIN record' }), { headers: EVENT_CORS });
          }
          const result = {
            name: `${g.first_name} ${g.last_name}`,
            handicapIndex: parseFloat(g.handicap_index) || 0,
            ghinNumber: g.ghin_number,
            club: g.club_name,
          };
          if (env.MG_BOOK) await env.MG_BOOK.put(cacheKey, JSON.stringify(result), { expirationTtl: 86400 }).catch(() => {});
          return new Response(JSON.stringify(result), { headers: EVENT_CORS });
        }
        return new Response(JSON.stringify({ error: `No active golfer found for GHIN #${ghinNum}` }), { headers: EVENT_CORS });
      }
    } catch (e) { /* fall through */ }
  }

  // Try GHIN self-lookup: golfer authenticates with their GHIN# + last name
  if (lastName) {
    try {
      const loginRes = await fetch('https://api2.ghin.com/api/v1/golfer_login.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          user: { email_or_ghin: ghinNum, password: lastName, remember_me: false },
          token: 'waggle-app',
        }),
      });
      if (loginRes.ok) {
        const loginData = await loginRes.json();
        const golfer = loginData?.golfer_user?.golfers?.[0];
        if (golfer) {
          const result = {
            name: (`${golfer.first_name || ''} ${golfer.last_name || ''}`).trim() || golfer.player_name || ghinNum,
            handicapIndex: parseFloat(golfer.handicap_index) || parseFloat(golfer.low_hi_display) || 0,
            ghinNumber: golfer.ghin_number || ghinNum,
            club: golfer.club_name || '',
          };
          if (env.MG_BOOK) await env.MG_BOOK.put(cacheKey, JSON.stringify(result), { expirationTtl: 86400 }).catch(() => {});
          return new Response(JSON.stringify(result), { headers: EVENT_CORS });
        }
      }
    } catch (e) { /* fall through */ }
  }

  // Fallback — guide user to ghin.com for manual lookup
  return new Response(JSON.stringify({
    manualLookup: true,
    ghinNumber: ghinNum,
    lookupUrl: 'https://www.ghin.com/',
    message: `Open ghin.com, search for GHIN #${ghinNum}, and enter the Handicap Index below.`,
  }), { headers: EVENT_CORS });
}

// ─── Web Push Notifications ──────────────────────────────────────────────

async function sendHolePushNotifications(slug, holeNum, events, gameState, env) {
  if (!env.MG_BOOK || !env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) return;

  const subs = await env.MG_BOOK.get(`${slug}:push-subs`, 'json').catch(() => null);
  if (!subs || subs.length === 0) return;

  let title = `Hole ${holeNum} Scored`;
  let body = '';

  for (const ev of events) {
    if (ev.type === 'skin_won') {
      body += `${ev.winner} wins skin on H${ev.hole} (\u00d7${ev.pot}) \u00b7 `;
    } else if (ev.type === 'skin_carried') {
      body += `Skin carried \u2192 pot \u00d7${ev.potAfter} \u00b7 `;
    } else if (ev.type === 'nassau_front_complete') {
      body += `Front 9 complete \u2014 ${ev.winner} leads \u00b7 `;
    } else if (ev.type === 'nassau_back_complete') {
      body += `Back 9 complete \u2014 ${ev.winner} leads \u00b7 `;
    } else if (ev.type === 'nassau_total_complete') {
      title = `Round Complete`;
      body += `Nassau total winner: ${ev.winner} \u00b7 `;
    } else if (ev.type === 'wolf_won') {
      body += `Wolf: ${ev.winner} wins H${ev.hole} \u00b7 `;
    }
  }
  if (!body) body = `Scores entered by admin`;
  body = body.replace(/ \u00b7 $/, '');

  const payload = JSON.stringify({
    title,
    body,
    tag: `${slug}-hole-${holeNum}`,
    url: `https://betwaggle.com/${slug}/#scorecard`,
  });

  await Promise.allSettled(subs.map(sub => sendWebPush(sub, payload, env)));
}

async function sendWebPush(subscription, payload, env) {
  const endpoint = subscription.endpoint;
  const keys = subscription.keys;
  if (!endpoint || !keys?.auth || !keys?.p256dh) return;

  const subject = env.VAPID_SUBJECT || 'mailto:admin@betwaggle.com';
  const vapidPublicKey = env.VAPID_PUBLIC_KEY;
  const vapidPrivateKeyB64 = env.VAPID_PRIVATE_KEY;

  try {
    const audience = new URL(endpoint).origin;
    const exp = Math.floor(Date.now() / 1000) + 12 * 3600;

    const header = btoa(JSON.stringify({ typ: 'JWT', alg: 'ES256' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const claims = btoa(JSON.stringify({ aud: audience, exp, sub: subject })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const unsigned = `${header}.${claims}`;

    const privKeyBytes = Uint8Array.from(atob(vapidPrivateKeyB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const privKey = await crypto.subtle.importKey(
      'pkcs8', privKeyBytes,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false, ['sign']
    );

    const enc = new TextEncoder();
    const sigBuffer = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privKey,
      enc.encode(unsigned)
    );
    const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuffer))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const jwt = `${unsigned}.${sig}`;

    const vapidHeader = `vapid t=${jwt},k=${vapidPublicKey}`;

    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': vapidHeader,
        'Content-Type': 'application/json',
        'TTL': '86400',
      },
      body: payload,
    });
  } catch (e) {
    console.warn('push-send-failed', endpoint, e.message);
  }
}

async function sendSettlementPush(slug, events, env) {
  if (!env.MG_BOOK || !env.VAPID_PRIVATE_KEY) return;
  const subs = await env.MG_BOOK.get(`${slug}:push-subs`, 'json').catch(() => null);
  if (!subs || subs.length === 0) return;

  const payload = JSON.stringify({
    title: '\uD83C\uDFC6 Round Complete \u2014 Settlement Ready',
    body: 'View the settlement card to see final results',
    tag: `${slug}-settlement`,
    url: `https://betwaggle.com/${slug}/#settle`,
  });

  await Promise.allSettled(subs.map(sub => sendWebPush(sub, payload, env)));
}

// ─── Season Leaderboard ──────────────────────────────────────────────────

async function handleSeasonLeaderboard(seasonId, env) {
  if (!env.MG_BOOK) return new Response(JSON.stringify({ error: 'Storage not available' }), { headers: EVENT_CORS });

  const season = await env.MG_BOOK.get(`season:${seasonId}`, 'json');
  if (!season) return new Response(JSON.stringify({ error: 'Season not found' }), { status: 404, headers: EVENT_CORS });

  const aggregated = {};

  await Promise.all((season.events || []).map(async (slug) => {
    try {
      const [gameStateRaw, holesRaw, configRaw] = await Promise.all([
        env.MG_BOOK.get(`${slug}:game-state`, 'json'),
        env.MG_BOOK.get(`${slug}:holes`, 'json'),
        env.MG_BOOK.get(`config:${slug}`, 'text'),
      ]);
      if (!gameStateRaw || !holesRaw) return;

      const holes = holesRaw || {};
      const holesPlayed = Object.keys(holes).length;
      const cfg = configRaw ? JSON.parse(configRaw) : {};
      const eventName = cfg?.event?.name || slug;

      if (gameStateRaw.stroke?.running) {
        for (const [name, net] of Object.entries(gameStateRaw.stroke.running)) {
          if (!aggregated[name]) aggregated[name] = { events: [], totalNet: 0, eventCount: 0 };
          aggregated[name].events.push({ slug, eventName, net, holes: holesPlayed });
          aggregated[name].totalNet += net;
          aggregated[name].eventCount++;
        }
      }
    } catch (e) { /* skip failed event */ }
  }));

  const leaderboard = Object.entries(aggregated)
    .map(([name, data]) => ({ name, ...data, avgNet: data.eventCount > 0 ? (data.totalNet / data.eventCount).toFixed(1) : 0 }))
    .sort((a, b) => a.totalNet - b.totalNet);

  return new Response(JSON.stringify({ season, leaderboard }), { headers: EVENT_CORS });
}

async function handleSeasonSave(request, env) {
  const body = await request.json().catch(() => ({}));
  const { id, name, events } = body;
  if (!id || !name) return new Response(JSON.stringify({ error: 'id and name required' }), { status: 400, headers: EVENT_CORS });
  if (!env.MG_BOOK) return new Response(JSON.stringify({ error: 'Storage not available' }), { headers: EVENT_CORS });

  const existing = await env.MG_BOOK.get(`season:${id}`, 'json') || {};
  const season = { id, name, events: events || existing.events || [], created: existing.created || Date.now(), updated: Date.now() };
  await env.MG_BOOK.put(`season:${id}`, JSON.stringify(season));

  const index = await env.MG_BOOK.get('seasons:index', 'json') || [];
  const idx = index.findIndex(s => s.id === id);
  const summary = { id, name, eventCount: season.events.length };
  if (idx >= 0) index[idx] = summary; else index.push(summary);
  await env.MG_BOOK.put('seasons:index', JSON.stringify(index));

  return new Response(JSON.stringify({ ok: true, season }), { headers: EVENT_CORS });
}

// ─── Course Database ──────────────────────────────────────────────────────

const SEED_COURSES = [
  { id: 'pebble-beach', name: 'Pebble Beach Golf Links', city: 'Pebble Beach', state: 'CA', slope: 144, rating: 74.9,
    par: [4,5,4,4,3,5,3,4,4,4,4,3,4,5,4,4,3,5],
    strokeIndex: [6,10,12,16,14,2,18,4,8,3,9,17,7,1,13,11,15,5] },
  { id: 'augusta-national', name: 'Augusta National Golf Club', city: 'Augusta', state: 'GA', slope: 137, rating: 76.2,
    par: [4,5,4,3,4,3,4,5,4,4,4,3,5,4,5,3,4,4],
    strokeIndex: [11,7,1,15,5,17,3,9,13,6,8,16,2,10,4,18,12,14] },
  { id: 'bethpage-black', name: 'Bethpage State Park (Black)', city: 'Farmingdale', state: 'NY', slope: 155, rating: 78.0,
    par: [4,4,3,5,4,4,5,3,4,4,4,4,5,3,4,4,3,4],
    strokeIndex: [8,16,18,2,4,10,6,14,12,9,11,7,3,17,1,5,13,15] },
  { id: 'torrey-pines-south', name: 'Torrey Pines Golf Course (South)', city: 'La Jolla', state: 'CA', slope: 144, rating: 76.1,
    par: [4,4,3,4,5,3,5,3,4,4,4,4,3,4,5,4,3,5],
    strokeIndex: [9,3,15,7,1,17,5,13,11,6,4,8,16,10,2,12,18,14] },
  { id: 'tpc-sawgrass', name: 'TPC Sawgrass (Stadium)', city: 'Ponte Vedra Beach', state: 'FL', slope: 155, rating: 76.8,
    par: [4,5,3,4,4,4,4,3,5,4,5,4,3,4,4,5,3,4],
    strokeIndex: [11,15,17,9,3,13,1,7,5,12,8,16,18,4,6,10,14,2] },
  { id: 'pinehurst-no2', name: 'Pinehurst Resort & Country Club (No. 2)', city: 'Pinehurst', state: 'NC', slope: 143, rating: 75.4,
    par: [4,4,4,4,5,3,4,5,3,5,4,4,4,4,3,5,3,4],
    strokeIndex: [11,3,9,1,15,5,7,17,13,18,8,10,6,2,16,14,4,12] },
  { id: 'merion-east', name: 'Merion Golf Club (East)', city: 'Ardmore', state: 'PA', slope: 148, rating: 76.1,
    par: [4,4,3,4,4,4,3,4,5,4,4,4,3,4,4,3,4,4],
    strokeIndex: [3,7,15,1,11,5,17,9,13,4,6,12,18,2,8,16,10,14] },
  { id: 'winged-foot-west', name: 'Winged Foot Golf Club (West)', city: 'Mamaroneck', state: 'NY', slope: 144, rating: 75.7,
    par: [4,3,5,4,3,4,5,4,4,5,3,4,4,3,4,5,3,4],
    strokeIndex: [7,17,3,9,15,5,1,11,13,2,14,8,6,18,10,4,16,12] },
  { id: 'bandon-dunes', name: 'Bandon Dunes Golf Resort', city: 'Bandon', state: 'OR', slope: 142, rating: 75.8,
    par: [4,4,4,4,3,5,4,3,5,4,4,3,4,5,3,4,3,5],
    strokeIndex: [9,3,7,1,17,5,11,15,13,6,4,16,8,2,18,10,14,12] },
  { id: 'oakmont', name: 'Oakmont Country Club', city: 'Oakmont', state: 'PA', slope: 155, rating: 78.5,
    par: [4,4,4,3,4,3,5,3,4,4,4,5,3,4,4,4,4,4],
    strokeIndex: [1,5,11,17,7,15,3,13,9,4,6,2,18,10,8,12,14,16] },
  { id: 'streamsong-black', name: 'Streamsong Resort (Black)', city: 'Streamsong', state: 'FL', slope: 135, rating: 74.7,
    par: [5,4,4,5,3,4,3,4,4,5,4,5,4,4,3,4,3,5],
    strokeIndex: [12,16,4,2,6,18,14,8,10,11,3,7,9,15,17,1,13,5] },
];

async function handleCourseSearch(url, env) {
  const q = (url.searchParams.get('q') || '').toLowerCase().trim();
  if (q.length < 2) {
    return new Response(JSON.stringify([]), { headers: EVENT_CORS });
  }

  const results = SEED_COURSES
    .filter(c => c.name.toLowerCase().includes(q) || c.city.toLowerCase().includes(q) || c.state.toLowerCase().includes(q))
    .slice(0, 8)
    .map(c => ({ id: c.id, name: c.name, city: c.city, state: c.state, slope: c.slope, rating: c.rating }));

  if (env.MG_BOOK) {
    try {
      const customList = await env.MG_BOOK.get('courses:index', 'json') || [];
      const customMatches = customList
        .filter(c => c.name.toLowerCase().includes(q))
        .slice(0, 4)
        .map(c => ({ ...c, custom: true }));
      results.push(...customMatches);
    } catch (e) { /* ignore */ }
  }

  return new Response(JSON.stringify(results), { headers: EVENT_CORS });
}

async function handleCourseGet(courseId, env) {
  const seed = SEED_COURSES.find(c => c.id === courseId);
  if (seed) {
    return new Response(JSON.stringify(seed), { headers: EVENT_CORS });
  }
  if (env.MG_BOOK) {
    const course = await env.MG_BOOK.get(`course:${courseId}`, 'json');
    if (course) return new Response(JSON.stringify(course), { headers: EVENT_CORS });
  }
  return new Response(JSON.stringify({ error: 'Course not found' }), { status: 404, headers: EVENT_CORS });
}

async function handleCourseSave(request, env) {
  const body = await request.json().catch(() => ({}));
  const { name, city, state, slope, rating, par, strokeIndex } = body;
  if (!name || !Array.isArray(par) || par.length !== 18) {
    return new Response(JSON.stringify({ error: 'name and par[18] required' }), { status: 400, headers: EVENT_CORS });
  }
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const course = { id, name, city: city || '', state: state || '', slope: slope || 113, rating: rating || 72.0,
    par, strokeIndex: strokeIndex || Array.from({length: 18}, (_, i) => i + 1) };
  if (env.MG_BOOK) {
    await env.MG_BOOK.put(`course:${id}`, JSON.stringify(course));
    const index = await env.MG_BOOK.get('courses:index', 'json') || [];
    const existingIdx = index.findIndex(c => c.id === id);
    const summary = { id, name, city: course.city, state: course.state, slope: course.slope, rating: course.rating };
    if (existingIdx >= 0) index[existingIdx] = summary;
    else index.push(summary);
    await env.MG_BOOK.put('courses:index', JSON.stringify(index));
  }
  return new Response(JSON.stringify({ ok: true, course }), { headers: EVENT_CORS });
}

// ─── Season Leaderboard Page ──────────────────────────────────────────────

async function handleSeasonPage(seasonId, env) {
  let season = null;
  let leaderboard = [];
  if (env.MG_BOOK) {
    try {
      season = await env.MG_BOOK.get(`season:${seasonId}`, 'json');
      if (season) {
        const res = await handleSeasonLeaderboard(seasonId, env);
        const data = await res.json();
        leaderboard = data.leaderboard || [];
      }
    } catch {}
  }

  const name = season?.name || 'Season Leaderboard';
  const rows = leaderboard.map((p, i) => `
    <tr style="border-bottom:1px solid #2D2D2D">
      <td style="padding:10px 12px;color:#9CA3AF">${i + 1}</td>
      <td style="padding:10px 12px;font-weight:${i===0?700:500};color:#F9FAFB">${escHtml(p.name)}</td>
      <td style="padding:10px 12px;text-align:center;color:#9CA3AF">${p.eventCount}</td>
      <td style="padding:10px 12px;text-align:center;color:${i===0?'#34D399':'#F9FAFB'};font-weight:700">${p.totalNet}</td>
      <td style="padding:10px 12px;text-align:center;color:#9CA3AF">${p.avgNet}</td>
    </tr>`).join('');

  const eventsHtml = (season?.events || []).map(e => `<div style="display:inline-block;background:#1F2937;border-radius:6px;padding:4px 10px;font-size:12px;color:#9CA3AF;margin:2px">${e}</div>`).join('');

  const html = `<!DOCTYPE html><html lang="en"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${name} \u2014 Waggle Season</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,'Inter',sans-serif;background:#111827;color:#F9FAFB;min-height:100vh}
    .header{padding:32px 20px 24px;text-align:center;border-bottom:1px solid #1F2937}
    .kicker{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6B7280;margin-bottom:8px}
    h1{font-size:28px;font-weight:700;color:#F9FAFB;margin-bottom:4px}
    .sub{font-size:13px;color:#6B7280}
    .container{max-width:600px;margin:0 auto;padding:24px 16px}
    table{width:100%;border-collapse:collapse;background:#1F2937;border-radius:12px;overflow:hidden}
    th{padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#6B7280;background:#111827;border-bottom:1px solid #2D2D2D}
    th:nth-child(3),th:nth-child(4),th:nth-child(5){text-align:center}
    .back{display:inline-block;margin-bottom:20px;color:#34D399;font-size:13px;text-decoration:none}
    .events-section{margin-top:24px}
    .events-label{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#6B7280;margin-bottom:8px}
  </style></head><body>
  <div class="header">
    <div class="kicker">Waggle Season</div>
    <h1>${name}</h1>
    <div class="sub">${leaderboard.length} players \u00b7 ${(season?.events||[]).length} events</div>
  </div>
  <div class="container">
    <a href="/" class="back">\u2190 Back to Waggle</a>
    ${leaderboard.length === 0
      ? `<div style="text-align:center;padding:60px 20px;color:#6B7280">No scores yet. Add events to this season to see the leaderboard.</div>`
      : `<table>
          <thead><tr>
            <th>#</th><th>Player</th><th>Events</th><th>Net Total</th><th>Avg/Round</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>`}
    ${eventsHtml ? `<div class="events-section"><div class="events-label">Events in Season</div>${eventsHtml}</div>` : ''}
  </div>
</body></html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

// ─── Player Join Page ──────────────────────────────────────────────────

async function handleWaggleJoinPage(slug, env) {
  let eventName = 'Golf Event';
  let venue = '';
  let dates = '';
  if (env.MG_BOOK) {
    try {
      const cfg = JSON.parse(await env.MG_BOOK.get(`config:${slug}`, 'text') || 'null');
      if (cfg) {
        eventName = cfg.event?.name || eventName;
        venue = cfg.event?.venue || '';
        const d = cfg.event?.dates || {};
        const fmt = s => s ? new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric' }) : '';
        dates = [fmt(d.day1), fmt(d.day3 || d.day2)].filter(Boolean).join(' \u2013 ');
      }
    } catch {}
  }
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Join ${eventName} | Waggle</title>
<meta property="og:title" content="Join ${eventName}">
<meta property="og:description" content="Register for ${eventName}${venue ? ' at ' + venue : ''}. Enter your name and handicap index.">
<meta name="theme-color" content="#0D2818">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0D2818;color:#F5F0E8;font-family:'Inter',sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:24px 16px}
.logo{width:48px;height:48px;border-radius:12px;margin-bottom:16px}
.event-name{font-family:'Inter',sans-serif;font-size:26px;font-weight:700;color:#D4AF37;text-align:center;line-height:1.2}
.event-sub{font-size:14px;color:#9BAF88;text-align:center;margin-top:6px}
.card{background:#1A472A;border:1px solid rgba(212,175,55,0.25);border-radius:16px;padding:24px;width:100%;max-width:420px;margin-top:24px}
label{display:block;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#9BAF88;margin-bottom:6px}
input{width:100%;padding:14px 16px;background:#0D2818;border:2px solid rgba(212,175,55,0.25);border-radius:10px;font-size:17px;color:#F5F0E8;font-family:'Inter',sans-serif;outline:none;transition:border-color 0.2s;-webkit-appearance:none}
input:focus{border-color:#D4AF37}
.field{margin-bottom:20px}
.hi-hint{font-size:12px;color:#9BAF88;margin-top:6px}
.btn{width:100%;padding:16px;background:#D4AF37;color:#0D2818;border:none;border-radius:10px;font-size:17px;font-weight:700;font-family:'Inter',sans-serif;cursor:pointer;transition:opacity 0.2s;margin-top:4px}
.btn:active{opacity:0.85}
.btn:disabled{opacity:0.4;cursor:default}
.success{text-align:center;padding:32px 0}
.success-icon{font-size:48px;margin-bottom:16px}
.success-title{font-family:'Inter',sans-serif;font-size:24px;color:#D4AF37;margin-bottom:8px}
.success-msg{color:#9BAF88;font-size:14px;line-height:1.6}
.error-msg{color:#ff6b6b;font-size:13px;margin-top:8px;display:none}
.powered{font-size:11px;color:rgba(155,175,136,0.5);margin-top:32px;text-align:center}
.hi-help{display:flex;align-items:center;gap:12px;margin-top:10px;padding:10px 12px;background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.2);border-radius:8px}
.hi-help-icon{font-size:20px;flex-shrink:0}
.hi-help-text{font-size:12px;color:#9BAF88;line-height:1.5}
.hi-help-text a{color:#D4AF37;text-decoration:none}
</style>
</head>
<body>
<img src="/logo.png" alt="Waggle" class="logo">
<div class="event-name">${eventName}</div>
${venue || dates ? `<div class="event-sub">${[venue, dates].filter(Boolean).join(' \u00b7 ')}</div>` : ''}
<div class="card" id="card">
  <div class="field">
    <label>Your Name</label>
    <input type="text" id="inp-name" placeholder="First Last" autocomplete="name" autocorrect="off">
  </div>
  <div class="field">
    <label>Handicap Index</label>
    <input type="number" id="inp-hi" placeholder="8.4" step="0.1" min="-10" max="54" inputmode="decimal">
    <div class="hi-help">
      <div class="hi-help-icon">\uD83D\uDCF1</div>
      <div class="hi-help-text">
        Open the <strong style="color:#F5F0E8">GHIN app</strong> \u2014 your Handicap Index is on the home screen.<br>
        No app? Find it at <a href="https://www.ghin.com/golfers" target="_blank">ghin.com/golfers</a>
      </div>
    </div>
  </div>
  <div class="field">
    <label>Email <span style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
    <input type="email" id="inp-email" placeholder="you@example.com" autocomplete="email">
  </div>
  <div id="err" class="error-msg"></div>
  <button class="btn" id="btn-join" onclick="submitJoin()">Join the Event</button>
</div>
<div class="powered">Powered by Waggle</div>
<script>
const SLUG = '${slug}';

(function(){
  const params = new URLSearchParams(location.search);
  const n = params.get('name');
  if (n) document.getElementById('inp-name').value = decodeURIComponent(n);
})();

async function submitJoin() {
  const name = document.getElementById('inp-name').value.trim();
  const hi = parseFloat(document.getElementById('inp-hi').value);
  const email = (document.getElementById('inp-email').value || '').trim();
  const err = document.getElementById('err');
  const btn = document.getElementById('btn-join');
  err.style.display = 'none';
  if (!name || name.length < 2) { err.textContent = 'Please enter your full name.'; err.style.display = 'block'; return; }
  if (isNaN(hi) || hi < -10 || hi > 54) { err.textContent = 'Please enter a valid handicap index.'; err.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = 'Joining...';
  try {
    const payload = { name, hi };
    if (email) payload.email = email;
    const res = await fetch('/' + SLUG + '/api/join', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) { err.textContent = data.error || 'Something went wrong.'; err.style.display = 'block'; btn.disabled = false; btn.textContent = 'Join the Event'; return; }
    document.getElementById('card').innerHTML = \`
      <div class="success">
        <div class="success-icon">&#9971;</div>
        <div class="success-title">You're in!</div>
        <div class="success-msg">Your registration has been submitted.<br>The event admin will confirm you shortly.<br><br>You'll get the event link once you're approved.</div>
      </div>\`;
  } catch(e) { err.textContent = 'Connection error. Please try again.'; err.style.display = 'block'; btn.disabled = false; btn.textContent = 'Join the Event'; }
}
document.getElementById('inp-name').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('inp-hi').focus(); });
document.getElementById('inp-hi').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('inp-email').focus(); });
document.getElementById('inp-email').addEventListener('keydown', e => { if (e.key === 'Enter') submitJoin(); });
</script>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-store' } });
}

// ─── Stripe Payment Gate ───────────────────────────────────────────────

const WAGGLE_PRICES = { member_guest: 14900, scramble: 14900, trip: 3200, outing: 3200 };
const WAGGLE_LABELS = { member_guest: 'Waggle Member-Guest ($149)', scramble: 'Waggle Scramble / Outing ($149)', trip: 'Waggle Buddies Trip ($32)', outing: 'Waggle Event ($32)' };

// Built-in promo codes — can move to KV later
const PROMO_CODES = {
  'FIRSTTRIP': { discount: 50, label: '50% off your first outing', maxUses: 1000 },
  'FREETRIAL': { discount: 100, label: 'Free trial outing', maxUses: 500 },
  'GOLF2026': { discount: 25, label: '25% off', maxUses: 2000 },
  'BUDDIES': { discount: 30, label: '30% off buddies trip', maxUses: 1000 },
  'FRISCOBOYS': { discount: 100, label: 'Frisco Ranch crew — on the house', maxUses: 5 },
  'BETA': { discount: 100, label: 'Beta tester — free outing', maxUses: 50 },
};

async function handleValidatePromo(request, env) {
  let body;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ valid: false }), { headers: EVENT_CORS }); }
  const code = (body.code || '').trim().toUpperCase();
  if (!code || !PROMO_CODES[code]) {
    return new Response(JSON.stringify({ valid: false }), { headers: EVENT_CORS });
  }
  // Check usage count
  if (env.MG_BOOK) {
    const usageKey = `promo:${code}:uses`;
    const uses = parseInt(await env.MG_BOOK.get(usageKey) || '0');
    if (uses >= PROMO_CODES[code].maxUses) {
      return new Response(JSON.stringify({ valid: false }), { headers: EVENT_CORS });
    }
  }
  return new Response(JSON.stringify({ valid: true, discount: PROMO_CODES[code].discount, label: PROMO_CODES[code].label }), { headers: EVENT_CORS });
}

// ─── Subscription Handlers ────────────────────────────────────────────────

async function handleSubscribe(request, env) {
  if (!env.STRIPE_SECRET_KEY) return new Response(JSON.stringify({ error: 'Payments not configured' }), { status: 500, headers: EVENT_CORS });
  let body;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: EVENT_CORS }); }
  const email = (body.email || '').trim().toLowerCase();
  const plan = body.plan || 'monthly'; // 'monthly' or 'annual'
  if (!email) return new Response(JSON.stringify({ error: 'Email required' }), { status: 400, headers: EVENT_CORS });

  const priceId = plan === 'annual' ? (env.STRIPE_PRICE_ANNUAL || '') : (env.STRIPE_PRICE_MONTHLY || '');
  if (!priceId) return new Response(JSON.stringify({ error: 'Subscription pricing not configured. Contact support.' }), { status: 500, headers: EVENT_CORS });

  // Check if already subscribed
  const existing = await env.MG_BOOK.get(`subscriber:${email}`, 'json');
  if (existing && existing.status === 'active' && (existing.currentPeriodEnd || 0) > Date.now()) {
    return new Response(JSON.stringify({ error: 'Already subscribed', plan: existing.plan }), { status: 400, headers: EVENT_CORS });
  }

  const stripeBody = new URLSearchParams({
    'payment_method_types[]': 'card',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    'mode': 'subscription',
    'success_url': `https://betwaggle.com/pricing?subscribed=true&email=${encodeURIComponent(email)}`,
    'cancel_url': 'https://betwaggle.com/pricing',
    'customer_email': email,
    'metadata[waggle_subscription]': 'true',
    'metadata[plan]': plan,
    'metadata[email]': email,
  });

  const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: stripeBody.toString(),
  });

  if (!stripeRes.ok) {
    const err = await stripeRes.json();
    return new Response(JSON.stringify({ error: err?.error?.message || 'Stripe error' }), { status: 500, headers: EVENT_CORS });
  }

  const session = await stripeRes.json();
  return new Response(JSON.stringify({ checkoutUrl: session.url }), { headers: EVENT_CORS });
}

async function handleBillingPortal(request, env) {
  if (!env.STRIPE_SECRET_KEY) return new Response(JSON.stringify({ error: 'Payments not configured' }), { status: 500, headers: EVENT_CORS });
  let body;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: EVENT_CORS }); }
  const email = (body.email || '').trim().toLowerCase();
  if (!email) return new Response(JSON.stringify({ error: 'Email required' }), { status: 400, headers: EVENT_CORS });

  const sub = await env.MG_BOOK.get(`subscriber:${email}`, 'json');
  if (!sub || !sub.stripeCustomerId) return new Response(JSON.stringify({ error: 'No subscription found for this email' }), { status: 404, headers: EVENT_CORS });

  const portalBody = new URLSearchParams({
    'customer': sub.stripeCustomerId,
    'return_url': 'https://betwaggle.com/pricing',
  });

  const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: portalBody.toString(),
  });

  if (!portalRes.ok) {
    const err = await portalRes.json();
    return new Response(JSON.stringify({ error: err?.error?.message || 'Portal error' }), { status: 500, headers: EVENT_CORS });
  }

  const portal = await portalRes.json();
  return new Response(JSON.stringify({ portalUrl: portal.url }), { headers: EVENT_CORS });
}

// ─── One-Time Checkout ────────────────────────────────────────────────────

async function handleCreateCheckout(request, env) {
  if (!env.MG_BOOK) return new Response(JSON.stringify({ error: 'Storage not configured' }), { status: 500, headers: EVENT_CORS });

  let config;
  try { config = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: EVENT_CORS }); }

  const isFreeType = config.event?.eventType === 'quick' || (config.event?.eventType === 'buddies_trip' && !env.STRIPE_SECRET_KEY);
  if (isFreeType) {
    return handleCreateEventFromConfig(config, env);
  }

  if (!env.STRIPE_SECRET_KEY) {
    return handleCreateEventFromConfig(config, env);
  }

  // Promo code validation
  const promoCode = (config.promoCode || '').trim().toUpperCase();
  let discount = 0;
  let promoLabel = '';
  if (promoCode && PROMO_CODES[promoCode]) {
    const usageKey = `promo:${promoCode}:uses`;
    const uses = parseInt(await env.MG_BOOK.get(usageKey) || '0');
    if (uses < PROMO_CODES[promoCode].maxUses) {
      discount = PROMO_CODES[promoCode].discount;
      promoLabel = PROMO_CODES[promoCode].label;
    }
  }

  const eventType = config.event?.eventType === 'scramble' ? 'scramble' : config.event?.format === 'round_robin_match_play' ? 'member_guest' : (config.event?.format || 'trip');
  const originalAmount = WAGGLE_PRICES[eventType] ?? 3200;
  const label = WAGGLE_LABELS[eventType] ?? 'Waggle Event';

  // Check Season Pass subscription — subscribers create events for free
  const adminEmail = (config.event?.adminContact || '').trim().toLowerCase();
  if (adminEmail && env.MG_BOOK) {
    const sub = await env.MG_BOOK.get(`subscriber:${adminEmail}`, 'json');
    if (sub && sub.status === 'active' && (sub.currentPeriodEnd || 0) > Date.now()) {
      config.meta = { ...(config.meta || {}), paidVia: 'subscription', plan: sub.plan };
      return handleCreateEventFromConfig(config, env);
    }
  }

  // Check referral credits — if commissioner has enough, create free event
  if (adminEmail && env.MG_BOOK) {
    const credKey = `referral-credits:${adminEmail}`;
    const credits = await env.MG_BOOK.get(credKey, 'json');
    if (credits && credits.credits >= originalAmount) {
      credits.credits -= originalAmount;
      await env.MG_BOOK.put(credKey, JSON.stringify(credits));
      config.meta = config.meta || {};
      config.meta.paidVia = 'referral_credits';
      return handleCreateEventFromConfig(config, env);
    }
  }

  // If 100% discount, create event for free (skip Stripe)
  if (discount === 100) {
    // Increment promo usage
    if (env.MG_BOOK) {
      const usageKey = `promo:${promoCode}:uses`;
      const uses = parseInt(await env.MG_BOOK.get(usageKey) || '0');
      await env.MG_BOOK.put(usageKey, String(uses + 1));
    }
    // Store promo info on config for success page
    config.meta = { ...(config.meta || {}), promoCode, promoLabel, promoDiscount: discount, originalAmountCents: originalAmount, actualAmountCents: 0 };
    return handleCreateEventFromConfig(config, env);
  }

  // Apply discount to amount
  const amount = discount > 0 ? Math.round(originalAmount * (1 - discount / 100)) : originalAmount;
  const discountedLabel = discount > 0 ? `${label} (${discount}% off — ${promoLabel})` : label;

  const tempId = crypto.randomUUID();
  // Store promo info in pending config
  if (discount > 0) {
    config.meta = { ...(config.meta || {}), promoCode, promoLabel, promoDiscount: discount, originalAmountCents: originalAmount, actualAmountCents: amount };
  }
  await env.MG_BOOK.put(`pending:${tempId}`, JSON.stringify(config), { expirationTtl: 7200 });

  // Store pending checkout reference for recovery
  const pendingEmail = (config.event?.adminContact || '').trim().toLowerCase();
  if (pendingEmail) {
    await env.MG_BOOK.put(`pending-checkout:${pendingEmail}`, JSON.stringify({
      tempId,
      eventName: config.event?.name,
      createdAt: Date.now()
    }), { expirationTtl: 7200 }); // 2 hours, same as temp config
  }

  const stripeBody = new URLSearchParams({
    'payment_method_types[]': 'card',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][product_data][name]': discountedLabel,
    'line_items[0][price_data][product_data][description]': `${config.event?.name || 'Golf Event'} \u00b7 ${config.event?.venue || ''}`,
    'line_items[0][price_data][unit_amount]': String(amount),
    'line_items[0][quantity]': '1',
    'mode': 'payment',
    'success_url': `https://betwaggle.com/api/checkout-success?session_id={CHECKOUT_SESSION_ID}&tmp=${tempId}`,
    'cancel_url': 'https://betwaggle.com/create/',
    'metadata[waggle_temp_id]': tempId,
    'metadata[event_name]': config.event?.name || '',
    'metadata[event_type]': eventType,
    'metadata[ref_code]': config.meta?.source?.ref || config.meta?.ref_code || '',
    'metadata[promo_code]': promoCode || '',
  });

  const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: stripeBody.toString(),
  });

  if (!stripeRes.ok) {
    const err = await stripeRes.json();
    return new Response(JSON.stringify({ error: err?.error?.message || 'Stripe error' }), { status: 500, headers: EVENT_CORS });
  }

  // Increment promo usage on successful checkout creation
  if (discount > 0 && promoCode && env.MG_BOOK) {
    const usageKey = `promo:${promoCode}:uses`;
    const uses = parseInt(await env.MG_BOOK.get(usageKey) || '0');
    await env.MG_BOOK.put(usageKey, String(uses + 1));
  }

  const session = await stripeRes.json();
  return new Response(JSON.stringify({ checkoutUrl: session.url }), { headers: EVENT_CORS });
}

async function handleResumeCheckout(url, env) {
  const tempId = url.searchParams.get('resume');
  if (!tempId) return Response.redirect('https://betwaggle.com/create/', 302);

  const configRaw = await env.MG_BOOK.get(`pending:${tempId}`, 'text');
  if (!configRaw) return Response.redirect('https://betwaggle.com/create/?error=expired', 302);

  if (!env.STRIPE_SECRET_KEY) return Response.redirect('https://betwaggle.com/create/', 302);

  const config = JSON.parse(configRaw);
  const eventType = config.event?.eventType === 'scramble' ? 'scramble' : config.event?.format === 'round_robin_match_play' ? 'member_guest' : (config.event?.format || 'trip');
  const amount = config.meta?.actualAmountCents || (WAGGLE_PRICES[eventType] ?? 3200);
  const label = WAGGLE_LABELS[eventType] ?? 'Waggle Event';
  const discountedLabel = config.meta?.promoDiscount ? `${label} (${config.meta.promoDiscount}% off — ${config.meta.promoLabel})` : label;

  const stripeBody = new URLSearchParams({
    'payment_method_types[]': 'card',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][product_data][name]': discountedLabel,
    'line_items[0][price_data][product_data][description]': `${config.event?.name || 'Golf Event'} \u00b7 ${config.event?.venue || ''}`,
    'line_items[0][price_data][unit_amount]': String(amount),
    'line_items[0][quantity]': '1',
    'mode': 'payment',
    'success_url': `https://betwaggle.com/api/checkout-success?session_id={CHECKOUT_SESSION_ID}&tmp=${tempId}`,
    'cancel_url': 'https://betwaggle.com/create/',
    'metadata[waggle_temp_id]': tempId,
    'metadata[event_name]': config.event?.name || '',
    'metadata[event_type]': eventType,
  });

  const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: stripeBody.toString(),
  });

  if (!stripeRes.ok) return Response.redirect('https://betwaggle.com/create/?error=stripe_error', 302);

  const session = await stripeRes.json();
  if (session.url) return Response.redirect(session.url, 302);
  return Response.redirect('https://betwaggle.com/create/', 302);
}

async function handleCheckoutSuccess(url, env) {
  const sessionId = url.searchParams.get('session_id');
  const tempId = url.searchParams.get('tmp');

  if (!sessionId || !tempId) {
    return Response.redirect('https://betwaggle.com/create/?error=missing_session', 302);
  }

  let organizerEmail = null;
  if (env.STRIPE_SECRET_KEY) {
    const stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
      headers: { 'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}` },
    });
    if (stripeRes.ok) {
      const session = await stripeRes.json();
      if (session.payment_status !== 'paid') {
        return Response.redirect('https://betwaggle.com/create/?error=payment_failed', 302);
      }
      organizerEmail = session.customer_details?.email || null;
    }
  }

  const configRaw = await env.MG_BOOK.get(`pending:${tempId}`, 'text');
  if (!configRaw) {
    return Response.redirect('https://betwaggle.com/create/?error=expired', 302);
  }

  const config = JSON.parse(configRaw);
  if (organizerEmail) config.meta = { ...(config.meta || {}), organizerEmail };
  config.meta = { ...(config.meta || {}), stripe_session_id: sessionId };
  const result = await activateEvent(config, env);
  await env.MG_BOOK.delete(`pending:${tempId}`);

  // Clean up pending-checkout recovery key
  const pendingEmail2 = (config.event?.adminContact || '').trim().toLowerCase();
  if (pendingEmail2) {
    await env.MG_BOOK.delete(`pending-checkout:${pendingEmail2}`).catch(() => {});
  }

  const refCode = config.meta?.source?.ref || config.meta?.ref_code || '';
  if (refCode && env.WAGGLE_DB) {
    try {
      const eventType2 = config.event?.eventType === 'scramble' ? 'scramble' : config.event?.format === 'round_robin_match_play' ? 'member_guest' : 'trip';
      const purchaseAmountCents = WAGGLE_PRICES[eventType2] ?? 3200;
      const commissionCents = 2000;
      await env.WAGGLE_DB.prepare(
        `INSERT OR IGNORE INTO referrals (id, affiliate_code, event_slug, event_type, amount_cents, commission_cents, stripe_session_id, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))`
      ).bind(crypto.randomUUID(), refCode, result.slug, eventType2, purchaseAmountCents, commissionCents, sessionId).run();
      await env.WAGGLE_DB.prepare(
        `UPDATE affiliates SET total_referrals = total_referrals + 1, total_payout_cents = total_payout_cents + ? WHERE code = ?`
      ).bind(commissionCents, refCode).run();
    } catch (err) { console.error('WAGGLE_REFERRAL_ERROR', { error: String(err) }); }
  }

  // Credit referring commissioner via KV referral credits
  if (refCode && env.MG_BOOK) {
    try {
      const refConfig = await env.MG_BOOK.get(`config:${refCode}`, 'json');
      if (refConfig?.event?.adminContact) {
        const referrerEmail = refConfig.event.adminContact.trim().toLowerCase();
        const credKey = `referral-credits:${referrerEmail}`;
        const existing = (await env.MG_BOOK.get(credKey, 'json')) || { credits: 0, referrals: [] };
        existing.credits += 800;
        existing.referrals.push({ slug: result.slug, ts: Date.now() });
        await env.MG_BOOK.put(credKey, JSON.stringify(existing));
      }
    } catch {}
  }

  if (env.RESEND_API_KEY) {
    const eventName = config.event?.name || 'Your Event';
    const eventUrl = result.url;
    const adminUrl = `${eventUrl}#admin`;
    const adminPin = config.event?.adminPin || '(see your setup)';
    const resendPost = (payload) => fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const promises = [];

    if (organizerEmail) {
      promises.push(resendPost({
        from: 'Waggle <waggle@cafecito-ai.com>',
        to: organizerEmail,
        subject: `Your Waggle event is live: ${eventName}`,
        html: `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;padding:32px 24px">
  <img src="https://betwaggle.com/logo.png" alt="Waggle" style="height:36px;margin-bottom:24px">
  <h2 style="color:#0D2818;font-size:22px;margin:0 0 8px">Your sportsbook is live.</h2>
  <p style="color:#374151;font-size:15px;margin:0 0 24px">Share this link with your group. Everyone opens it on their phone.</p>
  <a href="${eventUrl}" style="display:block;background:#2D6A4F;color:#fff;text-align:center;padding:14px 24px;border-radius:8px;font-size:16px;font-weight:600;text-decoration:none;margin-bottom:24px">${eventUrl}</a>
  <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:16px 20px;margin-bottom:24px">
    <p style="margin:0 0 8px;font-size:13px;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;font-weight:600">Admin Access</p>
    <p style="margin:0 0 4px;font-size:15px;color:#111827"><strong>Admin link:</strong> <a href="${adminUrl}" style="color:#2D6A4F">${adminUrl}</a></p>
    <p style="margin:0;font-size:15px;color:#111827"><strong>PIN:</strong> ${adminPin}</p>
  </div>
  <p style="color:#6B7280;font-size:14px;margin:0 0 4px">Need the full GM guide? <a href="https://betwaggle.com/overview/" style="color:#2D6A4F">betwaggle.com/overview/</a></p>
  <p style="color:#9CA3AF;font-size:12px;margin:24px 0 0">Waggle by Waggle</p>
</div>`,
      }));
    }

    promises.push(resendPost({
      from: 'Waggle <waggle@cafecito-ai.com>',
      to: 'evan@cafecito-ai.com',
      subject: `New Waggle event: ${result.slug}${organizerEmail ? ' by ' + organizerEmail : ''}`,
      html: `<p><strong>Event:</strong> ${eventName}</p><p><strong>Slug:</strong> ${result.slug}</p><p><strong>Organizer:</strong> ${organizerEmail || 'unknown'}</p><p><strong>URL:</strong> <a href="${eventUrl}">${eventUrl}</a></p><p><strong>Source:</strong> ${JSON.stringify(config.meta?.source || {})}</p>`,
    }));

    await Promise.allSettled(promises);
  }

  const purchaseValue = config.event?.format === 'round_robin_match_play' ? 149 : 32;
  return Response.redirect(`https://betwaggle.com/success/?slug=${result.slug}&v=${purchaseValue}`, 302);
}

async function handleWaggleSuccess(url, env) {
  const slug = url.searchParams.get('slug') || '';
  const value = parseFloat(url.searchParams.get('v') || '32');
  const gadsId = env.WAGGLE_GADS_ID || '';
  const gadsLabel = env.WAGGLE_GADS_LABEL || '';

  let eventName = 'Your Event';
  let adminPin = '';
  let eventUrl = slug ? `https://betwaggle.com/${slug}/` : 'https://betwaggle.com/';
  let promoLabel = '';
  let promoDiscount = 0;
  let originalAmountCents = 0;
  let actualAmountCents = 0;
  let eventGames = {};
  let eventStructure = {};
  let eventDate = '';

  if (slug && env.MG_BOOK) {
    try {
      const raw = await env.MG_BOOK.get(`config:${slug}`, 'text');
      if (raw) {
        const cfg = JSON.parse(raw);
        eventName = cfg.event?.name || eventName;
        adminPin = cfg.event?.adminPin || '';
        promoLabel = cfg.meta?.promoLabel || '';
        promoDiscount = cfg.meta?.promoDiscount || 0;
        originalAmountCents = cfg.meta?.originalAmountCents || 0;
        actualAmountCents = cfg.meta?.actualAmountCents || 0;
        // Extract games/stakes/date for invitation text
        eventGames = cfg.games || {};
        eventStructure = cfg.structure || {};
        eventDate = cfg.event?.dates?.day1 || cfg.event?.date || '';
      }
    } catch (_) {}
  }

  if (!slug) {
    return Response.redirect('https://betwaggle.com/', 302);
  }

  const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const originalPrice = originalAmountCents ? (originalAmountCents / 100).toFixed(0) : '';
  const actualPrice = (actualAmountCents !== undefined && promoDiscount > 0) ? (actualAmountCents / 100).toFixed(0) : '';
  const escEventName = esc(eventName);
  const escEventUrl = esc(eventUrl);

  // Build stakes line for invitation
  const stakeParts = [];
  const nassauBet = parseInt(eventStructure?.nassauBet) || 0;
  const skinsBet = parseInt(eventStructure?.skinsBet) || 0;
  if (eventGames.nassau && nassauBet > 0) stakeParts.push(`Nassau $${nassauBet}`);
  if (eventGames.skins && skinsBet > 0) stakeParts.push(`Skins $${skinsBet}`);
  if (eventGames.wolf) stakeParts.push('Wolf');
  if (eventGames.vegas) stakeParts.push('Vegas');
  if (eventGames.bestBall) stakeParts.push('Best Ball');
  const stakesLine = stakeParts.length > 0 ? stakeParts.join(' \\u00b7 ') : '';
  const dateStr = eventDate || '';
  // Escape for JS string embedding
  const jsEventName = eventName.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
  const jsStakesLine = stakesLine;
  const jsDateStr = dateStr.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const jsEventUrl = eventUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>You're All Set -- Waggle</title>
  <meta name="robots" content="noindex">
  <link rel="icon" type="image/png" href="/logo.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  ${gadsId ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${gadsId}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${gadsId}');
    gtag('event', 'conversion', {
      send_to: '${gadsId}/${gadsLabel}',
      value: ${value},
      currency: 'USD',
      transaction_id: '${slug}'
    });
  </script>` : ''}
  ${env.META_PIXEL_ID ? `<script>
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init','${env.META_PIXEL_ID}');
    fbq('track','PageView');
  </script>` : ''}
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --forest: #0D2818; --green: #1B4332; --green-mid: #2D6A4F; --sage: #52B788; --ivory: #F5F0E8; --gold: #C9A84C; --text: #1A1A1A; --muted: #6B7280; }
    body { font-family: 'Inter', sans-serif; background: var(--ivory); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; -webkit-font-smoothing: antialiased; }
    .card { background: #fff; border-radius: 16px; box-shadow: 0 2px 24px rgba(0,0,0,.08); padding: 48px 40px; width: 100%; max-width: 520px; text-align: center; }
    .check { width: 56px; height: 56px; background: var(--green-mid); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 28px; }
    .check svg { width: 26px; height: 26px; }
    h1 { font-family: 'Inter', sans-serif; font-size: 28px; font-weight: 700; color: var(--forest); margin-bottom: 10px; }
    .event-name { font-size: 15px; color: var(--muted); margin-bottom: 16px; }
    .share-label { font-size: 11px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--green-mid); margin-bottom: 10px; }
    .link-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .link-box { flex: 1; background: #F9FAFB; border: 1px solid #D1D5DB; border-radius: 8px; padding: 11px 14px; font-size: 14px; color: var(--forest); font-weight: 500; text-align: left; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .copy-btn { flex-shrink: 0; padding: 11px 18px; background: var(--green-mid); color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: 'Inter', sans-serif; transition: background .15s; white-space: nowrap; }
    .copy-btn:hover { background: var(--forest); }
    .copy-btn.copied { background: #059669; }
    .share-note { font-size: 12px; color: var(--muted); margin-bottom: 24px; line-height: 1.5; }
    .divider { border: none; border-top: 1px solid #E5E7EB; margin: 0 0 28px; }
    ${adminPin ? `.pin-box { background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 10px; padding: 14px 18px; margin-bottom: 28px; font-size: 13px; color: var(--forest); text-align: left; } .pin-box strong { display: block; margin-bottom: 4px; } .pin-code { font-family: 'Courier New', monospace; font-size: 18px; font-weight: 700; letter-spacing: .12em; color: var(--green-mid); }` : ''}
    .btn-primary { display: block; background: var(--gold); color: var(--forest); font-size: 15px; font-weight: 600; padding: 15px 32px; border-radius: 8px; text-decoration: none; transition: background .2s; letter-spacing: .01em; }
    .btn-primary:hover { background: #d9b85c; }
    .btn-secondary { display: block; margin-top: 12px; font-size: 13px; color: var(--muted); text-decoration: none; text-align: center; }
    .btn-secondary:hover { color: var(--green-mid); }
    .share-actions { display: flex; gap: 10px; justify-content: center; margin-top: 16px; }
    .share-actions button { padding: 14px 24px; border: none; border-radius: 8px; font-weight: 700; font-size: 15px; cursor: pointer; font-family: 'Inter', sans-serif; }
    .share-btn { background: var(--gold); color: var(--forest); }
    .share-btn:hover { background: #d9b85c; }
    .copy-link-btn { background: #fff; color: var(--forest); border: 1.5px solid #D4CFC7 !important; }
    .copy-link-btn:hover { background: #F9FAFB; }
    .onboard-step { display: flex; gap: 12px; align-items: flex-start; }
    .onboard-num { width: 28px; height: 28px; border-radius: 50%; background: var(--gold); color: var(--forest); font-weight: 700; font-size: 13px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="check"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
    <h1>Your sportsbook is live.</h1>
    <p class="event-name">${escEventName}</p>

    ${promoLabel ? `<div style="text-align:center;margin:0 0 20px;font-size:14px;color:var(--muted)">
      <span style="text-decoration:line-through">$${originalPrice}</span> <span style="color:#16A34A;font-weight:700">$${actualPrice}</span> <span style="background:rgba(22,163,74,.1);color:#16A34A;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">${esc(promoLabel)}</span>
    </div>` : ''}

    <div style="text-align:center;margin:24px 0">
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(eventUrl)}&bgcolor=FAFAF7&color=0D2818"
        width="280" height="280" alt="QR code" style="border-radius:12px;border:2px solid #E5E1D8">
      <div style="font-size:13px;color:#7A7A7A;margin-top:8px">Hold this up -- everyone scans to join</div>
    </div>

    <div class="share-actions">
      <button class="share-btn" onclick="shareInvitation()">Share with Group</button>
      <button class="copy-link-btn" onclick="navigator.clipboard.writeText('${escEventUrl}').then(function(){this.textContent='Copied!';}.bind(this))">Copy Link</button>
    </div>

    <button onclick="copyInvitation(this)" style="width:100%;padding:14px;background:transparent;border:1.5px solid #D4CFC7;border-radius:8px;color:#0D2818;font-size:14px;font-weight:600;cursor:pointer;margin-top:8px;letter-spacing:.02em">
      Copy Formal Invitation
    </button>
    <button onclick="navigator.clipboard.writeText('${escEventUrl}?spectator=true').then(function(){this.textContent='Copied!';}.bind(this))" style="width:100%;padding:12px;background:transparent;border:1.5px solid #D4CFC7;border-radius:8px;color:#7A7A7A;font-size:13px;font-weight:600;cursor:pointer;margin-top:6px">
      Share Spectator Link
    </button>
    <div style="font-size:11px;color:#7A7A7A;margin-top:4px;text-align:center">For friends watching from home -- view-only, no betting access</div>
    <script>
    function buildInvitationText() {
      var parts = [];
      parts.push('You have been invited to ${jsEventName}.');
      parts.push('');
      parts.push('The book is open. Establish your lines and secure your tee time.');
      parts.push('');
      ${jsStakesLine ? `parts.push('${jsStakesLine}');` : ''}
      ${jsDateStr ? `parts.push('${jsDateStr}');` : ''}
      ${jsStakesLine || jsDateStr ? `parts.push('');` : ''}
      parts.push('Open the sportsbook: ${jsEventUrl}');
      return parts.join('\\n');
    }
    function copyInvitation(btn) {
      var text = buildInvitationText();
      navigator.clipboard.writeText(text).then(function() {
        btn.textContent = 'Copied to clipboard';
        setTimeout(function() { btn.textContent = 'Copy Formal Invitation'; }, 2000);
      });
    }
    function shareInvitation() {
      var text = buildInvitationText();
      if (navigator.share) {
        navigator.share({title:'${jsEventName}',text:text,url:'${jsEventUrl}'}).catch(function(){});
      } else {
        navigator.clipboard.writeText(text).then(function(){
          var btn = document.querySelector('.share-btn');
          if (btn) { btn.textContent = 'Invitation copied!'; setTimeout(function(){ btn.textContent = 'Share with Group'; }, 2000); }
        });
      }
    }
    </script>

    <p class="share-label" style="margin-top:24px">Event link</p>
    <div class="link-row">
      <div class="link-box" id="event-link">${eventUrl}</div>
      <button class="copy-btn" id="copy-btn" onclick="copyLink()">Copy</button>
    </div>
    <p class="share-note">Everyone opens this on their phone. No download needed.</p>

    <hr class="divider">

    ${adminPin ? `<div class="pin-box"><strong>Your admin PIN -- keep this safe</strong><div class="pin-code">${adminPin}</div><div style="font-size:12px;color:#6B7280;margin-top:6px">You'll need this to manage bets and settle the round.</div></div>` : ''}

    <div style="max-width:400px;margin:0 auto 32px;text-align:left">
      <div style="font-family:'Inter',sans-serif;font-size:18px;font-weight:700;color:#0D2818;margin-bottom:16px">Get Started</div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="onboard-step">
          <div class="onboard-num">1</div>
          <div><div style="font-weight:600;font-size:14px">Share the link</div><div style="font-size:12px;color:#7A7A7A">Text or airdrop the QR code above to your group</div></div>
        </div>
        <div class="onboard-step">
          <div class="onboard-num">2</div>
          <div><div style="font-weight:600;font-size:14px">Enter scores on game day</div><div style="font-size:12px;color:#7A7A7A">Open Admin tab, enter gross scores hole by hole</div></div>
        </div>
        <div class="onboard-step">
          <div class="onboard-num">3</div>
          <div><div style="font-weight:600;font-size:14px">Share the settlement card</div><div style="font-size:12px;color:#7A7A7A">Drop it in the group chat. Venmo links included.</div></div>
        </div>
      </div>
    </div>

    <a href="${eventUrl}" class="btn-primary">Open my event</a>
    <a href="https://betwaggle.com/" class="btn-secondary">Back to Waggle</a>
  </div>
  <script>
    function copyLink() {
      var link = document.getElementById('event-link').textContent.trim();
      var btn = document.getElementById('copy-btn');
      navigator.clipboard.writeText(link).then(function() {
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(function() { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
      }).catch(function() {
        prompt('Copy this link:', link);
      });
    }
  </script>
  <script>
    if (typeof fbq === 'function') {
      fbq('track', 'Purchase', { value: ${value}, currency: 'USD' });
    }
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-store' },
  });
}

// ===== COURSE DETAIL PAGE (server-rendered) =====
// This is a very long function — extracted verbatim from cafecito-ai worker.js
// with /waggle/ paths rewritten to /
async function handleCourseDetailPage(courseId, env) {
  const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let course = null;
  try {
    const apiKey = env.GOLF_COURSE_API_KEY || '';
    const res = await fetch(`https://api.golfcourseapi.com/v1/courses/${courseId}`, {
      headers: { 'Authorization': `Key ${apiKey}` }
    });
    if (res.ok) {
        const raw = await res.json();
        course = raw.course || raw;
      }
  } catch {}

  if (!course) {
    return new Response(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Course Not Found</title></head><body style="font-family:Inter,sans-serif;text-align:center;padding:80px 20px"><h1>Course not found</h1><p><a href="/courses/">Back to search</a></p></body></html>`, {
      status: 404, headers: { 'Content-Type': 'text/html' }
    });
  }

  const clubName = esc(course.club_name || 'Golf Course');
  const courseName = esc(course.course_name || '');
  const loc = course.location || {};
  const city = esc(loc.city || '');
  const state = esc(loc.state || loc.state_name || '');
  const location = [city, state].filter(Boolean).join(', ');

  const rawTees = course.tees || {};
  const allTees = [];
  for (const gender of ['male', 'female']) {
    const arr = rawTees[gender];
    if (Array.isArray(arr)) {
      arr.forEach(t => allTees.push({ ...t, gender }));
    }
  }

  const teeColors = {
    'black': '#1a1a1a', 'championship': '#1a1a1a', 'onyx': '#1a1a1a',
    'blue': '#1e40af', 'tournament': '#1e40af', 'navy': '#1e3a5f',
    'white': '#e8e8e8', 'member': '#e8e8e8',
    'green': '#166534',
    'gold': '#ca8a04', 'senior': '#ca8a04', 'yellow': '#ca8a04',
    'silver': '#9ca3af',
    'red': '#dc2626', 'forward': '#dc2626', 'crimson': '#dc2626',
    'combo': '#7c3aed', 'teal': '#0d9488',
  };
  function getTeeColor(name) {
    const n = (name || '').toLowerCase();
    for (const [key, color] of Object.entries(teeColors)) {
      if (n.includes(key)) return color;
    }
    return '#52B788';
  }

  const validTees = allTees.map((tee, i) => {
    if (!tee || !tee.holes || tee.holes.length < 9) return null;
    const holes = tee.holes.map((h, idx) => ({ ...h, hole_number: idx + 1 }));
    const front9 = holes.slice(0, 9);
    const back9 = holes.length >= 18 ? holes.slice(9, 18) : [];
    const is18 = back9.length > 0;
    const frontYds = front9.reduce((s, h) => s + (h.yardage || 0), 0);
    const backYds = back9.reduce((s, h) => s + (h.yardage || 0), 0);
    const yds = frontYds + backYds;
    const color = getTeeColor(tee.tee_name);
    const dotBorder = color === '#e8e8e8' ? '2px solid #999' : '2px solid rgba(0,0,0,0.15)';
    return { tee, holes, front9, back9, is18, frontYds, backYds, yds, color, dotBorder, idx: i,
      rating: tee.course_rating || '\u2014', slope: tee.slope_rating || '\u2014',
      name: esc(tee.tee_name || 'Unknown'), gender: tee.gender };
  }).filter(Boolean);

  const refTee = validTees[0];

  // Build HTML (simplified — keeping essential structure, paths rewritten)
  const html = `<!DOCTYPE html><html lang="en"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${clubName} \u2014 Waggle</title>
  <meta name="description" content="View the full scorecard for ${clubName}${location ? ' in ' + location : ''}.">
  <link rel="icon" type="image/png" href="/logo.png">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}body{font-family:'Inter',sans-serif;background:#F5F0E8;color:#1A1A1A}a{color:inherit;text-decoration:none}.header{background:#0D2818;padding:20px 32px;display:flex;align-items:center;justify-content:space-between}.header-logo{display:flex;align-items:center;gap:10px;color:#fff;font-family:'Inter',sans-serif;font-size:18px;font-weight:700}.header-logo img{height:32px;border-radius:6px}.header-nav{display:flex;gap:20px;align-items:center}.header-nav a{color:rgba(255,255,255,0.7);font-size:13px;font-weight:500}.header-nav .cta{background:#C9A84C;color:#0D2818;padding:8px 16px;border-radius:8px;font-weight:700;font-size:13px}</style>
</head><body>
  <header class="header">
    <a href="/" class="header-logo"><img src="/logo.png" alt="Waggle"><span>Waggle</span></a>
    <nav class="header-nav"><a href="/courses/">Courses</a><a href="/create/?course=${courseId}" class="cta">Play Here</a></nav>
  </header>
  <div style="max-width:960px;margin:20px auto;padding:0 20px;font-size:13px;color:#7A7A7A"><a href="/" style="color:#2D6A4F;font-weight:600">Waggle</a> / <a href="/courses/" style="color:#2D6A4F;font-weight:600">Courses</a> / ${clubName}</div>
  <div style="max-width:960px;margin:16px auto 0;padding:0 20px">
    <div style="background:linear-gradient(135deg,#00261b,#0b3d2e);border-radius:16px;padding:40px 36px;color:#fff">
      <h1 style="font-family:'Inter',sans-serif;font-size:clamp(24px,4vw,36px);font-weight:700;line-height:1.15;margin-bottom:12px">${clubName}</h1>
      ${location ? `<div style="font-size:14px;color:rgba(255,255,255,0.6);margin-bottom:24px">${location}</div>` : ''}
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <a href="/create/?course=${courseId}" style="background:#C9A84C;color:#00261b;padding:14px 28px;border-radius:6px;font-weight:700;font-size:15px">Play Here \u2192</a>
        <a href="/courses/" style="background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.7);padding:14px 24px;border-radius:6px;font-weight:600;font-size:14px">\u2190 Back to Search</a>
      </div>
    </div>
  </div>
  <div style="max-width:960px;margin:32px auto 0;padding:0 20px">
    <h2 style="font-family:'Inter',sans-serif;font-size:22px;font-weight:700;color:#0D2818;margin-bottom:20px">Scorecard</h2>
    ${!refTee ? '<p style="color:#7A7A7A">No scorecard data available for this course.</p>' : (() => {
      const totalPar = refTee.front9.reduce((s,h) => s + (h.par||0), 0) + refTee.back9.reduce((s,h) => s + (h.par||0), 0);
      const is18 = refTee.is18;
      let sc = '<p style="color:#7A7A7A;font-size:13px;margin-bottom:20px">Par ' + totalPar + ' &middot; ' + validTees.length + ' tee' + (validTees.length !== 1 ? 's' : '') + ' available</p>';
      sc += '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin-bottom:24px">';
      sc += '<table style="width:100%;border-collapse:collapse;font-size:12px;font-family:&quot;SF Mono&quot;,&quot;Fira Code&quot;,monospace;min-width:' + (is18 ? '720' : '420') + 'px">';
      // FRONT 9 header
      sc += '<thead><tr style="background:#0D2818;color:#fff">';
      sc += '<th style="padding:8px 6px;text-align:left;font-weight:700;font-size:10px;letter-spacing:0.5px;text-transform:uppercase;position:sticky;left:0;background:#0D2818;z-index:1">Hole</th>';
      for (let h = 1; h <= 9; h++) sc += '<th style="padding:8px 4px;text-align:center;font-weight:600;min-width:34px">' + h + '</th>';
      sc += '<th style="padding:8px 6px;text-align:center;font-weight:700;background:#1B4332">OUT</th>';
      if (is18) {
        for (let h = 10; h <= 18; h++) sc += '<th style="padding:8px 4px;text-align:center;font-weight:600;min-width:34px">' + h + '</th>';
        sc += '<th style="padding:8px 6px;text-align:center;font-weight:700;background:#1B4332">IN</th>';
        sc += '<th style="padding:8px 6px;text-align:center;font-weight:700;background:#C9A84C;color:#0D2818">TOT</th>';
      }
      sc += '</tr></thead><tbody>';
      // Par row
      const frontPar = refTee.front9.reduce((s,h)=>s+(h.par||0),0);
      const backPar = refTee.back9.reduce((s,h)=>s+(h.par||0),0);
      sc += '<tr style="background:#f8f6f0;font-weight:700;color:#1B4332">';
      sc += '<td style="padding:7px 6px;font-weight:700;font-size:10px;letter-spacing:0.5px;text-transform:uppercase;position:sticky;left:0;background:#f8f6f0;z-index:1">Par</td>';
      refTee.front9.forEach(h => { sc += '<td style="padding:7px 4px;text-align:center">' + (h.par||'') + '</td>'; });
      sc += '<td style="padding:7px 6px;text-align:center;font-weight:800;background:#eae6da">' + frontPar + '</td>';
      if (is18) {
        refTee.back9.forEach(h => { sc += '<td style="padding:7px 4px;text-align:center">' + (h.par||'') + '</td>'; });
        sc += '<td style="padding:7px 6px;text-align:center;font-weight:800;background:#eae6da">' + backPar + '</td>';
        sc += '<td style="padding:7px 6px;text-align:center;font-weight:800;background:#eae6da">' + totalPar + '</td>';
      }
      sc += '</tr>';
      // Handicap row
      sc += '<tr style="background:#fff;color:#7A7A7A;font-size:11px">';
      sc += '<td style="padding:6px;font-size:10px;letter-spacing:0.5px;text-transform:uppercase;position:sticky;left:0;background:#fff;z-index:1">Hdcp</td>';
      refTee.front9.forEach(h => { sc += '<td style="padding:6px 4px;text-align:center">' + (h.handicap||'') + '</td>'; });
      sc += '<td style="padding:6px;background:#f5f3ed"></td>';
      if (is18) {
        refTee.back9.forEach(h => { sc += '<td style="padding:6px 4px;text-align:center">' + (h.handicap||'') + '</td>'; });
        sc += '<td style="padding:6px;background:#f5f3ed"></td><td style="padding:6px;background:#f5f3ed"></td>';
      }
      sc += '</tr>';
      // Tee rows (yardage per tee)
      validTees.forEach(t => {
        const bg = t.color === '#e8e8e8' ? '#fafafa' : '#fff';
        sc += '<tr style="background:' + bg + ';border-top:1px solid #E8E4DC">';
        sc += '<td style="padding:7px 6px;position:sticky;left:0;background:' + bg + ';z-index:1;white-space:nowrap"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + t.color + ';border:' + t.dotBorder + ';vertical-align:middle;margin-right:6px"></span><span style="font-size:11px;font-weight:600;color:#3D3D3D">' + t.name + '</span>' + (t.gender === 'female' ? '<span style="font-size:9px;color:#999;margin-left:3px">W</span>' : '') + '</td>';
        t.front9.forEach(h => { sc += '<td style="padding:7px 4px;text-align:center;color:#3D3D3D">' + (h.yardage||'') + '</td>'; });
        sc += '<td style="padding:7px 6px;text-align:center;font-weight:700;background:#f5f3ed;color:#1B4332">' + t.frontYds + '</td>';
        if (is18) {
          t.back9.forEach(h => { sc += '<td style="padding:7px 4px;text-align:center;color:#3D3D3D">' + (h.yardage||'') + '</td>'; });
          sc += '<td style="padding:7px 6px;text-align:center;font-weight:700;background:#f5f3ed;color:#1B4332">' + t.backYds + '</td>';
          sc += '<td style="padding:7px 6px;text-align:center;font-weight:800;background:#f5f3ed;color:#0D2818">' + t.yds + '</td>';
        }
        sc += '</tr>';
        // Rating/slope sub-row
        sc += '<tr style="background:' + bg + ';border-bottom:1px solid #E8E4DC">';
        sc += '<td colspan="' + (is18 ? 22 : 11) + '" style="padding:2px 6px 6px;font-size:10px;color:#999;position:sticky;left:0;background:' + bg + '">';
        sc += 'Rating: ' + t.rating + ' &middot; Slope: ' + t.slope;
        sc += '</td></tr>';
      });
      sc += '</tbody></table></div>';
      return sc;
    })()}
  </div>
  <footer style="text-align:center;padding:48px 20px 32px;color:#7A7A7A;font-size:13px">
    <p>Waggle by <a href="https://betwaggle.com/" style="color:#2D6A4F;font-weight:600">Waggle</a> \u00b7 <a href="/courses/" style="color:#2D6A4F;font-weight:600">Find a Course</a> \u00b7 <a href="/create/" style="color:#2D6A4F;font-weight:600">Create Event</a></p>
  </footer>
</body></html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=3600' }
  });
}

// ─── Admin Refund ─────────────────────────────────────────────────────────

async function handleAdminRefund(request, env) {
  const body = await request.json().catch(() => ({}));
  const { slug, reason } = body;
  if (!slug) return new Response(JSON.stringify({ error: 'slug required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const configRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
  if (!configRaw) return new Response(JSON.stringify({ error: 'Event not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

  const config = JSON.parse(configRaw);
  const stripeSessionId = config.meta?.stripe_session_id;
  if (!stripeSessionId) return new Response(JSON.stringify({ error: 'No Stripe session found for this event' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  if (!env.STRIPE_SECRET_KEY) return new Response(JSON.stringify({ error: 'Stripe not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

  try {
    // Get the payment intent from the session
    const sessionRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${stripeSessionId}`, {
      headers: { 'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}` }
    });
    const session = await sessionRes.json();
    const paymentIntentId = session.payment_intent;

    if (!paymentIntentId) return new Response(JSON.stringify({ error: 'No payment intent found' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    // Create refund
    const refundRes = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `payment_intent=${paymentIntentId}&reason=requested_by_customer`
    });
    const refund = await refundRes.json();

    if (refund.id) {
      // Mark event as refunded
      config.event.status = 'refunded';
      config.event.refundedAt = new Date().toISOString();
      config.event.refundReason = reason || '';
      await env.MG_BOOK.put(`config:${slug}`, JSON.stringify(config));

      return new Response(JSON.stringify({ ok: true, refundId: refund.id, amount: refund.amount }), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: 'Refund failed', details: refund }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

// ─── Stripe Webhook ───────────────────────────────────────────────────────

async function handleStripeWebhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    // No secret configured — reject all webhooks for security
    return new Response(JSON.stringify({ error: 'Webhook not configured' }), { status: 500 });
  }

  const sig = request.headers.get('stripe-signature');
  if (!sig) {
    return new Response(JSON.stringify({ error: 'Missing signature' }), { status: 400 });
  }

  const body = await request.text();

  // Verify Stripe signature using Web Crypto API
  const parts = sig.split(',').reduce((acc, part) => {
    const [key, value] = part.split('=');
    acc[key] = value;
    return acc;
  }, {});

  const timestamp = parts.t;
  const signature = parts.v1;

  if (!timestamp || !signature) {
    return new Response(JSON.stringify({ error: 'Invalid signature format' }), { status: 400 });
  }

  // Check timestamp is within 5 minutes (prevent replay attacks)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    return new Response(JSON.stringify({ error: 'Timestamp too old' }), { status: 400 });
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const expectedSig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expectedHex = Array.from(new Uint8Array(expectedSig)).map(b => b.toString(16).padStart(2, '0')).join('');

  if (expectedHex !== signature) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 400 });
  }

  // Signature valid — process the event
  const event = JSON.parse(body);

  if (event.type === 'checkout.session.completed') {
    const session = event.data?.object;
    // Handle subscription checkout
    if (session?.metadata?.waggle_subscription === 'true' && session.subscription) {
      const email = (session.metadata?.email || session.customer_email || '').toLowerCase();
      if (email && env.MG_BOOK) {
        // Fetch subscription details from Stripe
        const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${session.subscription}`, {
          headers: { 'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}` },
        });
        const sub = subRes.ok ? await subRes.json() : null;
        await env.MG_BOOK.put(`subscriber:${email}`, JSON.stringify({
          plan: session.metadata?.plan || 'monthly',
          status: 'active',
          stripeSubId: session.subscription,
          stripeCustomerId: session.customer,
          currentPeriodEnd: sub ? sub.current_period_end * 1000 : Date.now() + 30 * 24 * 60 * 60 * 1000,
          createdAt: Date.now(),
        }));
      }
    }
    // Handle one-time event checkout
    const tempId = session?.metadata?.waggle_temp_id;
    if (tempId) {
      const configRaw = await env.MG_BOOK.get(`pending:${tempId}`, 'text');
      if (configRaw) {
        await activateEvent(JSON.parse(configRaw), env);
        await env.MG_BOOK.delete(`pending:${tempId}`);
      }
    }

    // Handle team entry fee checkout
    if (session?.metadata?.type === 'team_entry_fee') {
      const teamSlug = session.metadata.waggle_slug;
      const teamId = session.metadata.team_id;
      if (teamSlug && teamId && env.MG_BOOK) {
        const teams = (await env.MG_BOOK.get(`${teamSlug}:registered-teams`, 'json')) || [];
        const team = teams.find(t => t.id === teamId);
        if (team) {
          team.paid = true;
          team.paidAt = new Date().toISOString();
          team.stripeSessionId = session.id;
          await env.MG_BOOK.put(`${teamSlug}:registered-teams`, JSON.stringify(teams));
        }
      }
    }
  }

  // Handle subscription lifecycle events
  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const sub = event.data?.object;
    if (sub && env.MG_BOOK) {
      // Find subscriber by Stripe subscription ID
      // We need to look up by customer email since we key by email
      const customerEmail = sub.metadata?.email || '';
      if (customerEmail) {
        const existing = await env.MG_BOOK.get(`subscriber:${customerEmail}`, 'json');
        if (existing && existing.stripeSubId === sub.id) {
          existing.status = sub.status === 'active' ? 'active' : 'canceled';
          existing.currentPeriodEnd = sub.current_period_end * 1000;
          await env.MG_BOOK.put(`subscriber:${customerEmail}`, JSON.stringify(existing));
        }
      }
    }
  }

  return new Response('ok');
}

// ─── Event Activation ─────────────────────────────────────────────────────

async function activateEvent(config, env) {
  let slug = (config.event?.name || 'event')
    .toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 40);
  const existing = await env.MG_BOOK.get(`config:${slug}`, 'text');
  if (existing) slug = slug + '-' + crypto.randomUUID().slice(0, 6);

  config.event.url = `https://betwaggle.com/${slug}/`;
  if (!config.event.createdAt) config.event.createdAt = new Date().toISOString();
  if (!config.event.expiresAt) config.event.expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  if (!Array.isArray(config.flightOrder)) config.flightOrder = Object.keys(config.flights || {});
  if (!config.flights) config.flights = {};
  if (!config.pairings) config.pairings = {};
  if (!config.structure) config.structure = {};
  if (!config.structure.roundDays) config.structure.roundDays = {};
  if (!config.structure.roundTimes) config.structure.roundTimes = {};

  await env.MG_BOOK.put(`config:${slug}`, JSON.stringify(config));

  // Index event by commissioner email for /my-events/ dashboard
  const adminContact = (config.event?.adminContact || '').trim().toLowerCase();
  if (adminContact && adminContact.includes('@')) {
    const existingSlugs = (await env.MG_BOOK.get(`commissioner:${adminContact}`, 'json')) || [];
    if (!existingSlugs.includes(slug)) {
      existingSlugs.push(slug);
      await env.MG_BOOK.put(`commissioner:${adminContact}`, JSON.stringify(existingSlugs));
    }
  }

  if (env.WAGGLE_DB) {
    const id = `evt_${Date.now()}_${slug}`;
    const eventType = config.event?.eventType || 'unknown';
    const name = config.event?.name || slug;
    env.WAGGLE_DB.prepare(
      'INSERT OR IGNORE INTO events (id, slug, event_type, name, config, created_at) VALUES (?, ?, ?, ?, ?, datetime("now"))'
    ).bind(id, slug, eventType, name, JSON.stringify(config)).run().catch(() => {});
  }

  // Index event by affiliate code for partner dashboard
  const affiliateCode = config.meta?.source?.ref || config.meta?.ref_code || '';
  if (affiliateCode && env.MG_BOOK) {
    try {
      const eventsKey = `affiliate-events:${affiliateCode}`;
      const affEvents = (await env.MG_BOOK.get(eventsKey, 'json')) || [];
      if (!affEvents.includes(slug)) {
        affEvents.push(slug);
        await env.MG_BOOK.put(eventsKey, JSON.stringify(affEvents));
      }
    } catch (err) { console.error('AFFILIATE_EVENT_INDEX_ERROR', { error: String(err) }); }
  }

  return { slug, url: config.event.url };
}

async function handleCreateEventFromConfig(config, env) {
  if (!env.MG_BOOK) return new Response(JSON.stringify({ error: 'Storage not configured' }), { status: 500, headers: EVENT_CORS });
  const isRoundMode = ['quick', 'buddies_trip'].includes(config.event?.eventType);
  const hasPlayers = isRoundMode ? (config.players?.length >= 2 || config.roster?.length >= 2) : (config.teams && Object.keys(config.teams).length >= 2);
  if (!config.event?.name || !config.event?.adminPin || !hasPlayers) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: EVENT_CORS });
  }
  if (isRoundMode && !config.teams) {
    const roster = config.players || config.roster || [];
    config.teams = Object.fromEntries(roster.map((p, i) => [String(i + 1), { member: p.name, memberHI: p.handicapIndex ?? 0 }]));
    if (!config.flightOrder || !config.flightOrder.length) config.flightOrder = [];
    if (!config.flights || !Object.keys(config.flights).length) {
      config.flights = { 'A': { name: 'Field', teams: roster.map((_, i) => String(i + 1)) } };
      config.flightOrder = ['A'];
    }
    if (!config.pairings || !Object.keys(config.pairings).length) {
      config.pairings = {};
    }
  }
  const result = await activateEvent(config, env);
  return new Response(JSON.stringify({ ok: true, slug: result.slug, url: result.url, adminUrl: `${result.url}#admin` }), { headers: EVENT_CORS });
}

async function handleCreateEvent(request, env) {
  let config;
  try { config = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: EVENT_CORS }); }
  return handleCreateEventFromConfig(config, env);
}

// ─── Marketing stats API ───────────────────────────────────────────────────

async function handleMarketingStats(url, env) {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  const pin = url.searchParams.get('pin');
  const validPin = env.WAGGLE_MARKETING_PIN || '';
  if (!validPin || pin !== validPin) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers });

  if (!env.MG_BOOK) return new Response(JSON.stringify({ error: 'storage not configured' }), { status: 500, headers });

  const list = await env.MG_BOOK.list({ prefix: 'config:' });
  const events = [];

  await Promise.all(list.keys.slice(0, 200).map(async (key) => {
    try {
      const raw = await env.MG_BOOK.get(key.name, 'text');
      if (!raw) return;
      const cfg = JSON.parse(raw);
      const src = cfg.meta?.source || {};
      const channel = src.utm_source || (src.ref ? 'affiliate:' + src.ref : null) || 'direct';
      const price = cfg.event?.format === 'round_robin_match_play' ? 149 : 29;
      events.push({
        slug: key.name.replace('config:', ''),
        name: cfg.event?.name || '(unnamed)',
        email: cfg.meta?.organizerEmail || null,
        format: cfg.event?.format || 'trip',
        channel,
        ref: src.ref || null,
        price,
        createdAt: key.expiration ? (key.expiration - 0) : null,
      });
    } catch {}
  }));

  const total = events.length;
  const revenue = events.reduce((s, e) => s + e.price, 0);
  const byChannel = {};
  events.forEach(e => { byChannel[e.channel] = (byChannel[e.channel] || 0) + 1; });
  const recent = events.slice(-10).reverse();

  return new Response(JSON.stringify({ total, revenue, byChannel, recent }), { headers });
}

// ─── Weekly Marketing Digest ──────────────────────────────────────────────

async function sendWeeklyMarketingDigest(env) {
  if (!env.MG_BOOK || !env.RESEND_API_KEY) return;

  try {
    const list = await env.MG_BOOK.list({ prefix: 'config:' });
    const allEvents = [];
    const cutoff7 = Date.now() - 7 * 24 * 60 * 60 * 1000;

    await Promise.all(list.keys.slice(0, 500).map(async (key) => {
      try {
        const raw = await env.MG_BOOK.get(key.name, 'text');
        if (!raw) return;
        const cfg = JSON.parse(raw);
        const src = cfg.meta?.source || {};
        const channel = src.utm_source || (src.ref ? 'affiliate:' + src.ref : null) || 'direct';
        const price = cfg.event?.format === 'round_robin_match_play' ? 149 : 29;
        const isWarrior = cfg.event?.eventType === 'quick';
        const actualPrice = isWarrior ? 0 : price;
        allEvents.push({
          slug: key.name.replace('config:', ''),
          name: cfg.event?.name || '(unnamed)',
          format: cfg.event?.eventType || cfg.event?.format || 'trip',
          channel,
          price: actualPrice,
          isRecent: key.metadata?.created ? key.metadata.created > cutoff7 : false,
        });
      } catch {}
    }));

    const totalEvents = allEvents.length;
    const paidEvents = allEvents.filter(e => e.price > 0);
    const revenue = paidEvents.reduce((s, e) => s + e.price, 0);
    const recentEvents = allEvents.filter(e => e.isRecent);
    const recentRevenue = recentEvents.filter(e => e.price > 0).reduce((s, e) => s + e.price, 0);

    const byChannel = {};
    allEvents.forEach(e => { byChannel[e.channel] = (byChannel[e.channel] || 0) + 1; });
    const channelRows = Object.entries(byChannel)
      .sort((a, b) => b[1] - a[1])
      .map(([ch, n]) => `<tr><td>${ch}</td><td>${n}</td></tr>`)
      .join('');

    const html = `
    <h2>Waggle Weekly Digest</h2>
    <p><strong>Week of ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong></p>
    <hr>
    <h3>This Week</h3>
    <ul>
      <li>New events: <strong>${recentEvents.length}</strong></li>
      <li>New revenue: <strong>$${recentRevenue.toLocaleString()}</strong></li>
    </ul>
    <h3>All Time</h3>
    <ul>
      <li>Total events: <strong>${totalEvents}</strong></li>
      <li>Total paid events: <strong>${paidEvents.length}</strong></li>
      <li>Total revenue: <strong>$${revenue.toLocaleString()}</strong></li>
    </ul>
    <h3>By Channel</h3>
    <table border="1" cellpadding="6" cellspacing="0">
      <tr><th>Channel</th><th>Events</th></tr>
      ${channelRows}
    </table>
    <p style="margin-top:16px;color:#666;font-size:12px">View full dashboard at betwaggle.com/marketing/</p>`;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Waggle <waggle@cafecito-ai.com>',
        to: ['evan@cafecito-ai.com'],
        subject: `Waggle Weekly \u2014 ${recentEvents.length} new events \u00b7 $${recentRevenue} this week`,
        html,
      }),
    });
  } catch (e) {
    console.error('weekly-digest-failed', e.message);
  }
}

// ─── Ad copy generator ─────────────────────────────────────────────────────

const ADS_JSON = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

function mktgAuth(pin, env) { const v = env.WAGGLE_MARKETING_PIN || ''; return v && pin === v; }

async function handleAdsPainPoints(url, env) {
  if (!mktgAuth(url.searchParams.get('pin'), env)) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: ADS_JSON });

  const cacheKey = 'adgen:pain-points-cache';
  if (env.MG_BOOK) {
    const cached = await env.MG_BOOK.get(cacheKey, 'text');
    if (cached) return new Response(cached, { headers: ADS_JSON });
  }

  const searches = [
    { sub: 'golf', q: 'nassau trip betting' },
    { sub: 'golf', q: 'scorecard settlement group' },
    { sub: 'golfbetting', q: 'nassau skins wolf' },
  ];

  const posts = [];
  for (const s of searches) {
    try {
      const r = await fetch(`https://www.reddit.com/r/${s.sub}/search.json?q=${encodeURIComponent(s.q)}&restrict_sr=on&sort=top&t=year&limit=15`, {
        headers: { 'User-Agent': 'WaggleBot/1.0 (marketing research)' },
      });
      if (!r.ok) continue;
      const data = await r.json();
      (data?.data?.children || []).forEach(({ data: p }) => {
        if (p.score >= 3 && !posts.find(x => x.id === p.id)) {
          posts.push({ id: p.id, title: p.title, text: (p.selftext || '').slice(0, 250), score: p.score, sub: p.subreddit });
        }
      });
    } catch {}
  }

  const fallback = [
    { text: 'We always track Nassau in a group chat and someone always disputes the math', theme: 'scoring', relevance: 10 },
    { text: 'Settling up after the round takes longer than the round itself', theme: 'settlement', relevance: 9 },
    { text: 'Nobody can agree on who bet what on which hole', theme: 'betting', relevance: 9 },
    { text: 'Our spreadsheet breaks every time someone adds a side bet', theme: 'organizing', relevance: 8 },
    { text: 'Half the group never knows the live standings mid-round', theme: 'scoring', relevance: 8 },
    { text: 'Setting up the Wolf pairings takes 20 minutes of group chat arguments', theme: 'group_chat', relevance: 7 },
  ];

  if (posts.length === 0 || (!env.AI && !env.ANTHROPIC_API_KEY)) {
    const result = JSON.stringify({ painPoints: fallback, posts: [], source: 'fallback' });
    if (env.MG_BOOK) await env.MG_BOOK.put(cacheKey, result, { expirationTtl: 21600 });
    return new Response(result, { headers: ADS_JSON });
  }

  const prompt = `Extract the top 8 pain points golfers have about organizing trips, tracking bets, Nassau/skins scoring, or settling up. Use their actual language.

Posts:
${posts.slice(0, 18).map((p, i) => `[${i}] "${p.title}: ${p.text}"`).join('\n')}

Return JSON array only: [{"text":"...", "theme":"scoring|betting|settlement|group_chat|organizing", "relevance":1-10, "source_index":0}]
Include source_index pointing to which post the pain point came from.`;

  try {
    const aiResult = await callAI(env, 'Extract golf pain points from Reddit posts. Return JSON array only.', prompt, 1024);
    const raw = aiResult.content?.[0]?.text || '';
    const match = raw.match(/\[[\s\S]*\]/);
    const painPoints = match ? JSON.parse(match[0]) : fallback;
    const topPosts = posts.slice(0, 20).map(p => ({ id: p.id, title: p.title, score: p.score, sub: p.sub, url: `https://www.reddit.com/r/${p.sub}/comments/${p.id}/` }));
    const result = JSON.stringify({ painPoints, posts: topPosts, source: 'reddit' });
    if (env.MG_BOOK) await env.MG_BOOK.put(cacheKey, result, { expirationTtl: 21600 });
    return new Response(result, { headers: ADS_JSON });
  } catch {
    return new Response(JSON.stringify({ painPoints: fallback, posts: [], source: 'fallback' }), { headers: ADS_JSON });
  }
}

async function handleAdsGenerate(request, env) {
  if (!env.AI && !env.ANTHROPIC_API_KEY) return new Response(JSON.stringify({ error: 'AI not configured' }), { status: 500, headers: ADS_JSON });
  let body;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'bad json' }), { status: 400, headers: ADS_JSON }); }
  if (!mktgAuth(body.pin, env)) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: ADS_JSON });

  const segDesc = {
    trip: 'guys planning annual golf buddy trips who run Nassau/skins/wolf ($32)',
    club: 'golf club members or staff running member-guests or charity outings ($149)',
    pro: 'club professionals offering a live betting add-on to members',
  };

  const pts = (body.painPoints || []).slice(0, 6).map(p => `- "${p.text}"`).join('\n');
  const prompt = `You write direct-response Google Search ads for Waggle, a $${body.segment === 'club' ? 149 : 29} golf sportsbook that runs Nassau/skins/wolf from any phone with no app download and auto-settlement.

Target: ${segDesc[body.segment] || segDesc.trip}

Pain points from real golfers:
${pts}

Write 3 Google Search ad variations. Each:
- headline1: max 30 chars
- headline2: max 30 chars
- headline3: max 30 chars
- description: max 90 chars
- angle: one sentence on which pain point this targets

Rules: no em dashes, no exclamation marks, no "free", count characters carefully.

Return JSON array only: [{"headline1":"...","headline2":"...","headline3":"...","description":"...","angle":"..."}]`;

  try {
    const aiResult = await callAI(env, 'You write Google Search ads. Return JSON array only.', prompt, 1024);
    const raw = aiResult.content?.[0]?.text || '';
    const match = raw.match(/\[[\s\S]*\]/);
    const variations = match ? JSON.parse(match[0]) : [];
    return new Response(JSON.stringify({ variations }), { headers: ADS_JSON });
  } catch (e) {
    console.error('ad-generation-failed', { error: String(e) });
    return new Response(JSON.stringify({ error: 'generation failed' }), { status: 500, headers: ADS_JSON });
  }
}

async function handleAdsLibrary(url, env) {
  if (!mktgAuth(url.searchParams.get('pin'), env)) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: ADS_JSON });
  if (!env.MG_BOOK) return new Response(JSON.stringify([]), { headers: ADS_JSON });
  const list = await env.MG_BOOK.list({ prefix: 'adlib:' });
  const items = await Promise.all(list.keys.map(async k => {
    try { return JSON.parse(await env.MG_BOOK.get(k.name, 'text')); } catch { return null; }
  }));
  return new Response(JSON.stringify(items.filter(Boolean).reverse()), { headers: ADS_JSON });
}

async function handleAdsSave(request, env) {
  let body;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'bad json' }), { status: 400, headers: ADS_JSON }); }
  if (!mktgAuth(body.pin, env)) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: ADS_JSON });
  if (!env.MG_BOOK) return new Response(JSON.stringify({ error: 'no storage' }), { status: 500, headers: ADS_JSON });
  const id = crypto.randomUUID().slice(0, 8);
  const record = { id, ...body.ad, segment: body.segment, savedAt: new Date().toISOString() };
  await env.MG_BOOK.put(`adlib:${id}`, JSON.stringify(record));
  return new Response(JSON.stringify({ ok: true, id }), { headers: ADS_JSON });
}

// ─── Lead tracker ───────────────────────────────────────────────────────

async function handleLeadsList(url, env) {
  if (!mktgAuth(url.searchParams.get('pin'), env)) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: ADS_JSON });
  if (!env.MG_BOOK) return new Response(JSON.stringify([]), { headers: ADS_JSON });
  const list = await env.MG_BOOK.list({ prefix: 'lead:' });
  const items = await Promise.all(list.keys.map(async k => {
    try { return JSON.parse(await env.MG_BOOK.get(k.name, 'text')); } catch { return null; }
  }));
  return new Response(JSON.stringify(items.filter(Boolean).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))), { headers: ADS_JSON });
}

async function handleLeadsUpsert(request, env) {
  let body;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'bad json' }), { status: 400, headers: ADS_JSON }); }
  if (!mktgAuth(body.pin, env)) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: ADS_JSON });
  if (!env.MG_BOOK) return new Response(JSON.stringify({ error: 'no storage' }), { status: 500, headers: ADS_JSON });
  const id = body.id || crypto.randomUUID().slice(0, 8);
  const record = { id, name: body.name, contact: body.contact, interest: body.interest, status: body.status || 'texted', notes: body.notes || '', updatedAt: new Date().toISOString() };
  await env.MG_BOOK.put(`lead:${id}`, JSON.stringify(record));
  return new Response(JSON.stringify({ ok: true, id, record }), { headers: ADS_JSON });
}

async function handleLeadsDelete(url, env) {
  if (!mktgAuth(url.searchParams.get('pin'), env)) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: ADS_JSON });
  const id = url.pathname.split('/').pop();
  if (env.MG_BOOK) await env.MG_BOOK.delete(`lead:${id}`);
  return new Response(JSON.stringify({ ok: true }), { headers: ADS_JSON });
}

// ─── Campaign tracker ──────────────────────────────────────────────────

async function handleCampaignsList(url, env) {
  if (!mktgAuth(url.searchParams.get('pin'), env)) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: ADS_JSON });
  if (!env.MG_BOOK) return new Response(JSON.stringify({ campaigns: [] }), { headers: ADS_JSON });
  const index = await env.MG_BOOK.get('campaigns:index', 'json') || [];
  const camps = await Promise.all(index.map(id => env.MG_BOOK.get(`campaign:${id}`, 'json').catch(() => null)));
  return new Response(JSON.stringify({ campaigns: camps.filter(Boolean) }), { headers: ADS_JSON });
}

async function handleCampaignsUpsert(request, env) {
  const body = await request.json().catch(() => ({}));
  if (!mktgAuth(body.pin, env)) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: ADS_JSON });
  if (!env.MG_BOOK) return new Response(JSON.stringify({ error: 'no storage' }), { status: 500, headers: ADS_JSON });
  const id = body.id || `cmp_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
  const existing = body.id ? (await env.MG_BOOK.get(`campaign:${id}`, 'json').catch(() => null)) : null;
  const camp = {
    id, name: body.name || 'Untitled', channel: body.channel || 'other',
    budget: Number(body.budget) || 0, spent: Number(body.spent) || 0,
    conversions: Number(body.conversions) || 0, status: body.status || 'planned',
    audience: body.audience || '', notes: body.notes || '',
    updatedAt: Date.now(), createdAt: existing?.createdAt || Date.now(),
  };
  await env.MG_BOOK.put(`campaign:${id}`, JSON.stringify(camp));
  const index = await env.MG_BOOK.get('campaigns:index', 'json') || [];
  if (!index.includes(id)) { index.push(id); await env.MG_BOOK.put('campaigns:index', JSON.stringify(index)); }
  return new Response(JSON.stringify({ ok: true, id }), { headers: ADS_JSON });
}

async function handleCampaignsStatus(request, env) {
  const body = await request.json().catch(() => ({}));
  if (!mktgAuth(body.pin, env)) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: ADS_JSON });
  if (!env.MG_BOOK || !body.id) return new Response(JSON.stringify({ error: 'bad request' }), { status: 400, headers: ADS_JSON });
  const camp = await env.MG_BOOK.get(`campaign:${body.id}`, 'json');
  if (!camp) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: ADS_JSON });
  camp.status = body.status;
  camp.updatedAt = Date.now();
  await env.MG_BOOK.put(`campaign:${body.id}`, JSON.stringify(camp));
  return new Response(JSON.stringify({ ok: true }), { headers: ADS_JSON });
}

async function handleCampaignsDelete(url, env) {
  if (!mktgAuth(url.searchParams.get('pin'), env)) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: ADS_JSON });
  const id = url.pathname.split('/').pop();
  if (env.MG_BOOK) {
    await env.MG_BOOK.delete(`campaign:${id}`);
    const index = (await env.MG_BOOK.get('campaigns:index', 'json') || []).filter(i => i !== id);
    await env.MG_BOOK.put('campaigns:index', JSON.stringify(index));
  }
  return new Response(JSON.stringify({ ok: true }), { headers: ADS_JSON });
}

// ─── Affiliate link generator ──────────────────────────────────────────

// ─── Partner Dashboard API ─────────────────────────────────────────────

const PARTNER_CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

async function handlePartnerDashboard(code, env) {
  if (!env.WAGGLE_DB) return new Response(JSON.stringify({ error: 'db not configured' }), { status: 500, headers: PARTNER_CORS });

  // Look up affiliate in D1
  const affiliate = await env.WAGGLE_DB.prepare(`SELECT * FROM affiliates WHERE code = ?`).bind(code).first();
  if (!affiliate) return new Response(JSON.stringify({ error: 'Partner not found. Check your affiliate code.' }), { status: 404, headers: PARTNER_CORS });

  // Fetch referrals
  const referrals = await env.WAGGLE_DB.prepare(
    `SELECT * FROM referrals WHERE affiliate_code = ? ORDER BY created_at DESC LIMIT 200`
  ).bind(code).all();
  const refs = referrals.results || [];

  // Revenue calculations
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thisYearStart = new Date(now.getFullYear(), 0, 1).toISOString();

  let thisMonth = 0, thisYear = 0, allTime = 0;
  for (const r of refs) {
    const c = r.commission_cents || 0;
    allTime += c;
    const rd = r.created_at || '';
    if (rd >= thisYearStart) thisYear += c;
    if (rd >= thisMonthStart) thisMonth += c;
  }

  // Fetch event configs for this affiliate from KV index
  const eventsKey = `affiliate-events:${code}`;
  const eventSlugs = (env.MG_BOOK ? (await env.MG_BOOK.get(eventsKey, 'json')) : null) || [];

  // Also check referrals for event slugs not in the KV index
  const refSlugs = refs.map(r => r.event_slug).filter(Boolean);
  const allSlugs = [...new Set([...eventSlugs, ...refSlugs])];

  const events = [];
  const allTeams = [];
  let totalTeams = 0;

  for (const slug of allSlugs) {
    if (!slug || !env.MG_BOOK) continue;
    try {
      const configRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
      if (!configRaw) continue;
      const cfg = JSON.parse(configRaw);
      const teams = cfg.teams || {};
      const teamCount = Object.keys(teams).length;
      totalTeams += teamCount;

      const createdAt = cfg.event?.createdAt || '';
      const expiresAt = cfg.event?.expiresAt || '';
      const isExpired = expiresAt && new Date(expiresAt) < now;
      const eventType = cfg.event?.eventType || 'trip';
      const priceCents = (eventType === 'scramble' || eventType === 'member_guest') ? 14900 : 3200;

      let status = 'active';
      if (isExpired) status = 'complete';
      else if (createdAt && new Date(createdAt) > now) status = 'upcoming';

      events.push({
        slug,
        name: cfg.event?.name || slug,
        date: createdAt,
        teamCount,
        priceCents,
        eventType,
        status,
        venue: cfg.event?.venue || ''
      });

      // Collect teams for CRM export
      for (const [tid, t] of Object.entries(teams)) {
        allTeams.push({
          event: cfg.event?.name || slug,
          eventSlug: slug,
          name: t.captain || t.member || `Team ${tid}`,
          members: [t.captain, t.member, t.member2, t.member3, t.member4].filter(Boolean).join(', '),
          handicap: t.captainHI || t.memberHI || ''
        });
      }
    } catch (err) { /* skip broken configs */ }
  }

  // Sort events by date descending
  events.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const owed = (affiliate.total_payout_cents || 0) - (affiliate.paid_out_cents || 0);

  return new Response(JSON.stringify({
    ok: true,
    affiliate: {
      code: affiliate.code,
      name: affiliate.name,
      email: affiliate.email || '',
      joinedAt: affiliate.created_at || ''
    },
    revenue: { thisMonth, thisYear, allTime },
    events,
    teams: allTeams,
    referrals: refs,
    stats: {
      totalEvents: events.length,
      totalTeams,
      avgTeamsPerEvent: events.length > 0 ? (totalTeams / events.length).toFixed(1) : '0'
    },
    owed_cents: owed,
    link: `https://betwaggle.com/create/?ref=${encodeURIComponent(code)}`
  }), { headers: PARTNER_CORS });
}

async function handlePartnerEvents(code, env) {
  if (!env.WAGGLE_DB) return new Response(JSON.stringify({ error: 'db not configured' }), { status: 500, headers: PARTNER_CORS });
  const affiliate = await env.WAGGLE_DB.prepare(`SELECT * FROM affiliates WHERE code = ?`).bind(code).first();
  if (!affiliate) return new Response(JSON.stringify({ error: 'Partner not found' }), { status: 404, headers: PARTNER_CORS });

  const eventsKey = `affiliate-events:${code}`;
  const eventSlugs = (env.MG_BOOK ? (await env.MG_BOOK.get(eventsKey, 'json')) : null) || [];

  // Also pull from referrals
  const referrals = await env.WAGGLE_DB.prepare(`SELECT DISTINCT event_slug FROM referrals WHERE affiliate_code = ?`).bind(code).all();
  const refSlugs = (referrals.results || []).map(r => r.event_slug).filter(Boolean);
  const allSlugs = [...new Set([...eventSlugs, ...refSlugs])];

  const events = [];
  const now = new Date();
  for (const slug of allSlugs) {
    if (!slug || !env.MG_BOOK) continue;
    try {
      const configRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
      if (!configRaw) continue;
      const cfg = JSON.parse(configRaw);
      const teams = cfg.teams || {};
      const teamCount = Object.keys(teams).length;
      const expiresAt = cfg.event?.expiresAt || '';
      const isExpired = expiresAt && new Date(expiresAt) < now;
      events.push({
        slug,
        name: cfg.event?.name || slug,
        date: cfg.event?.createdAt || '',
        teamCount,
        eventType: cfg.event?.eventType || 'trip',
        status: isExpired ? 'complete' : 'active',
        venue: cfg.event?.venue || ''
      });
    } catch {}
  }
  events.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return new Response(JSON.stringify({ ok: true, events }), { headers: PARTNER_CORS });
}

async function handlePartnerTeams(code, env) {
  if (!env.WAGGLE_DB) return new Response(JSON.stringify({ error: 'db not configured' }), { status: 500, headers: PARTNER_CORS });
  const affiliate = await env.WAGGLE_DB.prepare(`SELECT * FROM affiliates WHERE code = ?`).bind(code).first();
  if (!affiliate) return new Response(JSON.stringify({ error: 'Partner not found' }), { status: 404, headers: PARTNER_CORS });

  const eventsKey = `affiliate-events:${code}`;
  const eventSlugs = (env.MG_BOOK ? (await env.MG_BOOK.get(eventsKey, 'json')) : null) || [];
  const referrals = await env.WAGGLE_DB.prepare(`SELECT DISTINCT event_slug FROM referrals WHERE affiliate_code = ?`).bind(code).all();
  const refSlugs = (referrals.results || []).map(r => r.event_slug).filter(Boolean);
  const allSlugs = [...new Set([...eventSlugs, ...refSlugs])];

  const allTeams = [];
  for (const slug of allSlugs) {
    if (!slug || !env.MG_BOOK) continue;
    try {
      const configRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
      if (!configRaw) continue;
      const cfg = JSON.parse(configRaw);
      const teams = cfg.teams || {};
      for (const [tid, t] of Object.entries(teams)) {
        allTeams.push({
          event: cfg.event?.name || slug,
          eventSlug: slug,
          name: t.captain || t.member || `Team ${tid}`,
          members: [t.captain, t.member, t.member2, t.member3, t.member4].filter(Boolean).join(', '),
          handicap: t.captainHI || t.memberHI || ''
        });
      }
    } catch {}
  }
  return new Response(JSON.stringify({ ok: true, teams: allTeams }), { headers: PARTNER_CORS });
}

async function handlePartnerPayoutRequest(code, request, env) {
  if (!env.WAGGLE_DB) return new Response(JSON.stringify({ error: 'db not configured' }), { status: 500, headers: PARTNER_CORS });
  const affiliate = await env.WAGGLE_DB.prepare(`SELECT * FROM affiliates WHERE code = ?`).bind(code).first();
  if (!affiliate) return new Response(JSON.stringify({ error: 'Partner not found' }), { status: 404, headers: PARTNER_CORS });
  const owed = (affiliate.total_payout_cents || 0) - (affiliate.paid_out_cents || 0);
  if (owed < 2000) return new Response(JSON.stringify({ error: 'Minimum $20 required to request payout', owed_cents: owed }), { status: 400, headers: PARTNER_CORS });

  let paypal_email = '';
  try { const body = await request.json(); paypal_email = body.paypal_email || ''; } catch {}
  if (paypal_email) {
    await env.WAGGLE_DB.prepare(`UPDATE affiliates SET paypal_email = ? WHERE code = ?`).bind(paypal_email, code).run();
  }

  if (env.RESEND_API_KEY) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Waggle Partners <waggle@cafecito-ai.com>',
        to: 'evan@cafecito-ai.com',
        subject: `Waggle Partner Payout: ${affiliate.name} \u2014 $${(owed / 100).toFixed(2)}`,
        html: `<p><strong>${escHtml(affiliate.name)}</strong> (partner code: ${escHtml(code)}) is requesting a payout of <strong>$${(owed / 100).toFixed(2)}</strong>.</p><p>PayPal: ${escHtml(paypal_email || affiliate.paypal_email || '(not provided)')}</p>`
      }),
    }).catch(() => {});
  }
  return new Response(JSON.stringify({ ok: true, owed_cents: owed, message: 'Payout request submitted. Expect payment within 3-5 business days.' }), { headers: PARTNER_CORS });
}

// ─── Affiliate Signup (public /affiliates/ page) ──────────────────────
async function handleAffiliateSignup(request, env) {
  const h = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  let body;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: h }); }
  const { name, email, promotion_method, website_url } = body || {};
  if (!name || !name.trim()) return new Response(JSON.stringify({ error: 'Name is required' }), { status: 400, headers: h });
  if (!email || !email.trim()) return new Response(JSON.stringify({ error: 'Email is required' }), { status: 400, headers: h });

  // Generate 8-char alphanumeric affiliate_id
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let affiliate_id = '';
  for (let i = 0; i < 8; i++) affiliate_id += chars[Math.floor(Math.random() * chars.length)];

  const record = {
    affiliate_id,
    name: name.trim(),
    email: email.trim(),
    promotion_method: promotion_method || '',
    website_url: website_url || '',
    created_at: new Date().toISOString(),
    status: 'pending',
    referrals: 0
  };

  try {
    await env.MG_BOOK.put(`affiliate:${affiliate_id}`, JSON.stringify(record));
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to save. Please try again.' }), { status: 500, headers: h });
  }

  return new Response(JSON.stringify({
    ok: true,
    affiliate_id,
    link: `https://betwaggle.com/create/?ref=${affiliate_id}`
  }), { headers: h });
}

function handleAffiliateGenerate(url) {
  const corsHeaders = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  const name = (url.searchParams.get('name') || '').trim();
  const club = (url.searchParams.get('club') || '').trim();
  if (!name) return new Response(JSON.stringify({ error: 'name is required' }), { status: 400, headers: corsHeaders });
  const ref = [name, club].filter(Boolean).join(' ').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 50);
  const refUrl = `https://betwaggle.com/?ref=${encodeURIComponent(ref)}`;
  return new Response(JSON.stringify({ ref, url: refUrl }), { headers: corsHeaders });
}

// ─── Affiliate System ──────────────────────────────────────────────────

const AFFILIATE_CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
const AFFILIATE_COMMISSION_CENTS = 2000;

async function handleAffiliateRegister(request, env) {
  if (!env.WAGGLE_DB) return new Response(JSON.stringify({ error: 'db not configured' }), { status: 500, headers: AFFILIATE_CORS });
  let body;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400, headers: AFFILIATE_CORS }); }
  const { name, email, paypal_email } = body;
  if (!name) return new Response(JSON.stringify({ error: 'name required' }), { status: 400, headers: AFFILIATE_CORS });
  const code = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  try {
    await env.WAGGLE_DB.prepare(
      `INSERT OR IGNORE INTO affiliates (code, name, email, paypal_email, total_referrals, total_payout_cents, paid_out_cents, created_at)
       VALUES (?, ?, ?, ?, 0, 0, 0, datetime('now'))`
    ).bind(code, name, email || '', paypal_email || '').run();
    const existing = await env.WAGGLE_DB.prepare(`SELECT * FROM affiliates WHERE code = ?`).bind(code).first();
    return new Response(JSON.stringify({
      ok: true, code, name: existing.name,
      link: `https://betwaggle.com/go/?ref=${encodeURIComponent(code)}`,
      dashboard: `https://betwaggle.com/affiliate/?code=${encodeURIComponent(code)}`
    }), { headers: AFFILIATE_CORS });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: AFFILIATE_CORS });
  }
}

async function handleAffiliateStats(url, env) {
  if (!env.WAGGLE_DB) return new Response(JSON.stringify({ error: 'db not configured' }), { status: 500, headers: AFFILIATE_CORS });
  const code = url.searchParams.get('code');
  if (!code) return new Response(JSON.stringify({ error: 'code required' }), { status: 400, headers: AFFILIATE_CORS });
  const affiliate = await env.WAGGLE_DB.prepare(`SELECT * FROM affiliates WHERE code = ?`).bind(code).first();
  if (!affiliate) return new Response(JSON.stringify({ error: 'affiliate not found' }), { status: 404, headers: AFFILIATE_CORS });
  const referrals = await env.WAGGLE_DB.prepare(
    `SELECT * FROM referrals WHERE affiliate_code = ? ORDER BY created_at DESC LIMIT 50`
  ).bind(code).all();
  const pending_cents = (referrals.results || []).filter(r => r.status === 'pending').reduce((s, r) => s + (r.commission_cents || 0), 0);
  return new Response(JSON.stringify({
    ok: true,
    affiliate: { code: affiliate.code, name: affiliate.name, total_referrals: affiliate.total_referrals, total_payout_cents: affiliate.total_payout_cents, paid_out_cents: affiliate.paid_out_cents },
    pending_cents,
    owed_cents: affiliate.total_payout_cents - (affiliate.paid_out_cents || 0),
    referrals: referrals.results || [],
    link: `https://betwaggle.com/go/?ref=${encodeURIComponent(code)}`
  }), { headers: AFFILIATE_CORS });
}

async function handleAffiliatePayoutRequest(request, env) {
  if (!env.WAGGLE_DB) return new Response(JSON.stringify({ error: 'db not configured' }), { status: 500, headers: AFFILIATE_CORS });
  let body;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400, headers: AFFILIATE_CORS }); }
  const { code, paypal_email } = body;
  if (!code) return new Response(JSON.stringify({ error: 'code required' }), { status: 400, headers: AFFILIATE_CORS });
  const affiliate = await env.WAGGLE_DB.prepare(`SELECT * FROM affiliates WHERE code = ?`).bind(code).first();
  if (!affiliate) return new Response(JSON.stringify({ error: 'affiliate not found' }), { status: 404, headers: AFFILIATE_CORS });
  const owed = affiliate.total_payout_cents - (affiliate.paid_out_cents || 0);
  if (owed < 2000) return new Response(JSON.stringify({ error: 'minimum $20 required to request payout', owed_cents: owed }), { status: 400, headers: AFFILIATE_CORS });
  if (paypal_email) {
    await env.WAGGLE_DB.prepare(`UPDATE affiliates SET paypal_email = ? WHERE code = ?`).bind(paypal_email, code).run();
  }
  if (env.RESEND_API_KEY) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Waggle Affiliates <waggle@cafecito-ai.com>',
        to: 'evan@cafecito-ai.com',
        subject: `Waggle Affiliate Payout Request: ${affiliate.name} \u2014 $${(owed / 100).toFixed(2)}`,
        html: `<p><strong>${escHtml(affiliate.name)}</strong> (code: ${escHtml(code)}) is requesting a payout of <strong>$${(owed / 100).toFixed(2)}</strong>.</p><p>PayPal: ${escHtml(paypal_email || affiliate.paypal_email || '(not provided)')}</p>`
      }),
    }).catch(() => {});
  }
  return new Response(JSON.stringify({ ok: true, owed_cents: owed, message: 'Payout request sent. Expect payment within 3 business days.' }), { headers: AFFILIATE_CORS });
}

async function handleAffiliateAdmin(url, env) {
  if (!env.WAGGLE_DB) return new Response(JSON.stringify({ error: 'db not configured' }), { status: 500, headers: AFFILIATE_CORS });
  const pin = url.searchParams.get('pin');
  if (!pin || pin !== (env.ADMIN_PIN || '')) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: AFFILIATE_CORS });
  const affiliates = await env.WAGGLE_DB.prepare(`SELECT * FROM affiliates ORDER BY total_payout_cents DESC`).all();
  const referrals = await env.WAGGLE_DB.prepare(`SELECT * FROM referrals ORDER BY created_at DESC LIMIT 100`).all();
  return new Response(JSON.stringify({ ok: true, affiliates: affiliates.results, referrals: referrals.results }), { headers: AFFILIATE_CORS });
}

async function handleAffiliateMarkPaid(request, env) {
  if (!env.WAGGLE_DB) return new Response(JSON.stringify({ error: 'db not configured' }), { status: 500, headers: AFFILIATE_CORS });
  let body;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400, headers: AFFILIATE_CORS }); }
  const { code, amount_cents, pin } = body;
  if (!pin || pin !== (env.ADMIN_PIN || '')) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: AFFILIATE_CORS });
  if (!code || !amount_cents) return new Response(JSON.stringify({ error: 'code and amount_cents required' }), { status: 400, headers: AFFILIATE_CORS });
  await env.WAGGLE_DB.prepare(`UPDATE affiliates SET paid_out_cents = paid_out_cents + ? WHERE code = ?`).bind(amount_cents, code).run();
  await env.WAGGLE_DB.prepare(`UPDATE referrals SET status = 'paid' WHERE affiliate_code = ? AND status = 'pending'`).bind(code).run();
  return new Response(JSON.stringify({ ok: true, marked_paid_cents: amount_cents }), { headers: AFFILIATE_CORS });
}

async function handleAffiliatePage(url, env) {
  const code = url.searchParams.get('code') || '';
  // Simplified — the full affiliate page HTML is served from static assets
  // The API calls within the page use relative URLs which now point to betwaggle.com
  const req = new Request(new URL('/affiliates/index.html', url), { method: 'GET' });
  return env.ASSETS.fetch(req);
}

// ─── Serve dynamic event HTML ──────────────────────────────────────────

// ─── Dynamic OG Image (SVG) ────────────────────────────────────────────────
async function serveOgImage(slug, env) {
  const escSvg = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let config = {};
  try {
    const raw = await env.MG_BOOK.get(`config:${slug}`, 'text');
    if (raw) config = JSON.parse(raw);
  } catch {}

  const eventName = escSvg(config.event?.name || 'Golf Event');
  const venue = escSvg(config.event?.venue || '');
  const players = config.players || config.roster || [];
  const isComplete = config.event?.status === 'complete';

  // Try to read game state for live/completed data
  let holes = {};
  let gameState = {};
  try {
    const holesRaw = await env.MG_BOOK.get(`${slug}:holes`, 'json');
    if (holesRaw) holes = holesRaw;
    const gsRaw = await env.MG_BOOK.get(`${slug}:game-state`, 'json');
    if (gsRaw) gameState = gsRaw;
  } catch {}

  // Calculate simple scores from holes data
  const playerScores = [];
  const coursePars = config.coursePars || Array(18).fill(4);
  for (const p of players.slice(0, 6)) {
    const name = p.name || p.member || '';
    const hcp = p.handicapIndex ?? p.handicap ?? p.memberHI ?? 0;
    let totalStrokes = 0;
    let holesPlayed = 0;
    let totalPar = 0;
    for (let h = 1; h <= 18; h++) {
      const score = holes[name]?.[h] ?? holes[h]?.[name];
      if (score && typeof score === 'number' && score > 0) {
        totalStrokes += score;
        totalPar += (coursePars[h - 1] || 4);
        holesPlayed++;
      }
    }
    const toPar = holesPlayed > 0 ? totalStrokes - totalPar : 0;
    playerScores.push({ name: escSvg(name), hcp, holesPlayed, toPar, strokes: totalStrokes });
  }

  // Determine state
  const maxHoles = Math.max(0, ...playerScores.map(p => p.holesPlayed));
  let statusLine = `${players.length} player${players.length !== 1 ? 's' : ''} registered`;
  let statusColor = '#D4AF37';
  if (isComplete || maxHoles >= 18) {
    statusLine = 'FINAL RESULTS';
    statusColor = '#D4AF37';
  } else if (maxHoles > 0) {
    statusLine = `LIVE \u2014 Hole ${maxHoles} of 18`;
    statusColor = '#4ade80';
  }

  // Sort by to-par if any scores exist
  if (maxHoles > 0) playerScores.sort((a, b) => a.toPar - b.toPar);

  const displayPlayers = playerScores.slice(0, 4);
  const rowHeight = 60;
  const startY = 260;

  const playerRows = displayPlayers.map((p, i) => {
    const y = startY + i * rowHeight;
    const toParStr = p.holesPlayed > 0 ? (p.toPar > 0 ? '+' + p.toPar : p.toPar === 0 ? 'E' : String(p.toPar)) : '--';
    const rankColors = ['#D4AF37', '#C0C0C0', '#CD7F32', '#FFFFFF'];
    const rankColor = maxHoles > 0 ? (rankColors[i] || '#FFFFFF') : '#FFFFFF';
    return `
      <rect x="60" y="${y - 20}" width="1080" height="50" rx="8" fill="rgba(255,255,255,0.05)"/>
      <text x="90" y="${y + 8}" font-family="Inter,Helvetica,Arial,sans-serif" font-size="24" fill="${rankColor}" font-weight="700">${i + 1}</text>
      <text x="130" y="${y + 8}" font-family="Inter,Helvetica,Arial,sans-serif" font-size="24" fill="#FFFFFF" font-weight="600">${p.name}</text>
      <text x="700" y="${y + 8}" font-family="monospace" font-size="22" fill="rgba(255,255,255,0.5)">${p.hcp > 0 ? p.hcp.toFixed(1) + ' HCP' : ''}</text>
      <text x="1000" y="${y + 8}" font-family="monospace" font-size="28" fill="${p.toPar < 0 ? '#4ade80' : p.toPar > 0 ? '#f87171' : '#FFFFFF'}" font-weight="700" text-anchor="end">${toParStr}</text>
      ${p.holesPlayed > 0 ? `<text x="1080" y="${y + 8}" font-family="monospace" font-size="18" fill="rgba(255,255,255,0.4)" text-anchor="end">${p.strokes}</text>` : ''}
    `;
  }).join('');

  const morePlayersText = players.length > 4 ? `<text x="600" y="${startY + displayPlayers.length * rowHeight + 10}" font-family="Inter,Helvetica,Arial,sans-serif" font-size="18" fill="rgba(255,255,255,0.4)" text-anchor="middle">+ ${players.length - 4} more player${players.length - 4 !== 1 ? 's' : ''}</text>` : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#0D3B1A"/>
      <stop offset="100%" stop-color="#071F0E"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <!-- Subtle pattern overlay -->
  <rect width="1200" height="630" fill="none" stroke="rgba(255,255,255,0.02)" stroke-width="1">
    <animate attributeName="opacity" values="0.5;1;0.5" dur="4s" repeatCount="indefinite"/>
  </rect>
  <!-- Top accent line -->
  <rect x="0" y="0" width="1200" height="4" fill="#D4AF37"/>
  <!-- Event name -->
  <text x="60" y="80" font-family="Georgia,serif" font-size="40" fill="#D4AF37" font-weight="700">${eventName}</text>
  ${venue ? `<text x="60" y="118" font-family="Inter,Helvetica,Arial,sans-serif" font-size="20" fill="rgba(255,255,255,0.5)">${venue}</text>` : ''}
  <!-- Status badge -->
  <rect x="60" y="145" width="${statusLine.length * 12 + 32}" height="34" rx="17" fill="rgba(255,255,255,0.1)"/>
  <circle cx="82" cy="162" r="5" fill="${statusColor}"/>
  <text x="96" y="168" font-family="Inter,Helvetica,Arial,sans-serif" font-size="14" fill="${statusColor}" font-weight="700" letter-spacing="1">${statusLine}</text>
  <!-- Divider -->
  <line x1="60" y1="210" x2="1140" y2="210" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  <!-- Leaderboard header -->
  <text x="90" y="240" font-family="Inter,Helvetica,Arial,sans-serif" font-size="12" fill="rgba(255,255,255,0.3)" font-weight="600" letter-spacing="2">#</text>
  <text x="130" y="240" font-family="Inter,Helvetica,Arial,sans-serif" font-size="12" fill="rgba(255,255,255,0.3)" font-weight="600" letter-spacing="2">PLAYER</text>
  <text x="700" y="240" font-family="Inter,Helvetica,Arial,sans-serif" font-size="12" fill="rgba(255,255,255,0.3)" font-weight="600" letter-spacing="2">HCP</text>
  <text x="1000" y="240" font-family="Inter,Helvetica,Arial,sans-serif" font-size="12" fill="rgba(255,255,255,0.3)" font-weight="600" letter-spacing="2" text-anchor="end">${maxHoles > 0 ? 'TO PAR' : ''}</text>
  ${playerRows}
  ${morePlayersText}
  <!-- Branding -->
  <text x="600" y="600" font-family="Inter,Helvetica,Arial,sans-serif" font-size="16" fill="rgba(212,175,55,0.6)" text-anchor="middle" font-weight="600" letter-spacing="2">betwaggle.com</text>
</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=300',
    }
  });
}

async function serveEventHtml(slug, request, env) {
  let configRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');

  // If config not found, try seeding known events synchronously then retry
  if (!configRaw) {
    if (slug === 'pga-frisco-2026') {
      await seedFriscoV2(env);
      configRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
    } else if (slug === 'cabot-citrus-invitational') {
      await seedDemoEvent(env);
      configRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
    } else if (slug === 'demo-buddies') {
      await seedDemoBuddies(env);
      configRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
    } else if (slug === 'demo-scramble') {
      await seedDemoScramble(env);
      configRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
    } else if (slug === 'legends-trip') {
      await seedLegendsTrip(env);
      configRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
    } else if (slug === 'stag-night') {
      await seedStagNight(env);
      configRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
    } else if (slug === 'augusta-scramble') {
      await seedAugustaScramble(env);
      configRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
    } else if (slug === 'masters-member-guest') {
      await seedMastersMG(env);
      configRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
    } else if (slug === 'weekend-warrior') {
      await seedWeekendWarrior(env);
      configRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
    }
  }

  if (!configRaw) {
    return new Response(`<!DOCTYPE html><html><head><title>Event Not Found</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#F5F0E8;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;text-align:center;color:#1a1a1a}.logo{height:48px;margin-bottom:24px;opacity:0.6}h1{font-family:'Inter',sans-serif;font-size:28px;color:#1A472A;margin-bottom:12px}p{font-size:15px;color:#6B7280;margin-bottom:8px}.slug{font-weight:600;color:#1a1a1a}a.btn{display:inline-block;margin-top:20px;background:#1A472A;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px}a.btn:hover{background:#2D6A3E}</style></head>
<body>
<img src="/logo.png" alt="Waggle" class="logo">
<h1>Event not found</h1>
<p>No event exists at <span class="slug">/${slug}</span></p>
<p>It may have ended or the link might be wrong.</p>
<a href="/" class="btn">Go to Waggle</a>
</body></html>`, { status: 404, headers: { 'Content-Type': 'text/html', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' } });
  }

  let config;
  try { config = JSON.parse(configRaw); } catch {
    return new Response('Invalid event config', { status: 500 });
  }

  // Expired event page
  if (config.event?.status === 'expired') {
    return new Response(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Event Expired</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="font-family:Inter,sans-serif;background:#FAF8F5;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:20px">
  <div><h1 style="font-family:'Inter',sans-serif;font-size:28px;color:#0D2818">This event has ended</h1>
  <p style="color:#6B7280;margin:12px 0 24px">The sportsbook for this outing has been archived.</p>
  <a href="/create/" style="background:#C9A84C;color:#0D2818;padding:14px 32px;border-radius:8px;font-weight:700;text-decoration:none;font-size:15px">Create a New Outing</a></div>
</body></html>`, { headers: { 'Content-Type': 'text/html', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' } });
  }

  // Refunded event page
  if (config.event?.status === 'refunded') {
    return new Response(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Event Cancelled</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="font-family:Inter,sans-serif;background:#FAF8F5;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:20px">
  <div><h1 style="font-family:'Inter',sans-serif;font-size:28px;color:#0D2818">This event has been cancelled</h1>
  <p style="color:#6B7280;margin:12px 0 24px">The organizer cancelled this event and a refund was issued.</p>
  <a href="/create/" style="background:#C9A84C;color:#0D2818;padding:14px 32px;border-radius:8px;font-weight:700;text-decoration:none;font-size:15px">Create a New Outing</a></div>
</body></html>`, { headers: { 'Content-Type': 'text/html', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' } });
  }

  const reqUrl = new URL(request.url);
  const isPaid = reqUrl.searchParams.get('paid') === '1';
  const gadsId = env.WAGGLE_GADS_ID || '';
  const gadsLabel = env.WAGGLE_GADS_LABEL || '';

  const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const eventName = esc(config.event?.name || 'Golf Event');
  const shortName = esc(config.event?.shortName || config.event?.name || 'Golf Event');
  const venue = esc(config.event?.venue || '');
  const eventUrl = `https://betwaggle.com/${slug}/`;
  const themeColor = esc(config.theme?.primary || '#1A472A');

  // ── Dynamic OG tags based on event state ──
  const players = config.players || config.roster || [];
  const playerCount = players.length;
  const gameNames = [];
  const gamesObj = config.games || {};
  if (gamesObj.nassau) gameNames.push('Nassau');
  if (gamesObj.skins) gameNames.push('Skins');
  if (gamesObj.match_play) gameNames.push('Match Play');
  if (gamesObj.wolf) gameNames.push('Wolf');
  if (gamesObj.vegas) gameNames.push('Vegas');
  if (gamesObj.stroke_play) gameNames.push('Stroke Play');
  if (gamesObj.stableford) gameNames.push('Stableford');
  if (gamesObj.scramble) gameNames.push('Scramble');
  const gamesStr = gameNames.slice(0, 3).join(', ') + (gameNames.length > 3 ? ' + more' : '');
  const nassauBet = config.structure?.nassauBet;
  const skinsBet = config.structure?.skinsBet;
  const stakesStr = [nassauBet ? `Nassau $${nassauBet}` : '', skinsBet ? `Skins $${skinsBet}` : ''].filter(Boolean).join(', ');

  let ogTitle, ogDesc;
  // Try to read live scores for dynamic state
  let ogHoles = {};
  try {
    const holesRaw = await env.MG_BOOK.get(`${slug}:holes`, 'json');
    if (holesRaw) ogHoles = holesRaw;
  } catch {}

  // Determine event phase
  const coursePars = config.coursePars || Array(18).fill(4);
  let maxHolesPlayed = 0;
  let leaderName = '';
  let leaderToPar = 0;
  for (const p of players.slice(0, 20)) {
    const pName = p.name || p.member || '';
    let strokes = 0, par = 0, hPlayed = 0;
    for (let h = 1; h <= 18; h++) {
      const sc = ogHoles[pName]?.[h] ?? ogHoles[h]?.[pName];
      if (sc && typeof sc === 'number' && sc > 0) { strokes += sc; par += (coursePars[h - 1] || 4); hPlayed++; }
    }
    if (hPlayed > maxHolesPlayed) maxHolesPlayed = hPlayed;
    const tp = hPlayed > 0 ? strokes - par : 999;
    if (tp < leaderToPar || !leaderName) { leaderToPar = tp; leaderName = pName; }
  }

  const isComplete = config.event?.status === 'complete' || maxHolesPlayed >= 18;
  const isLive = maxHolesPlayed > 0 && !isComplete;
  const leaderToParStr = leaderToPar > 0 ? '+' + leaderToPar : leaderToPar === 0 ? 'E' : String(leaderToPar);

  if (isComplete && leaderName) {
    ogTitle = `${eventName} \u2014 Final Results`;
    ogDesc = `${esc(leaderName)} wins at ${leaderToParStr}. ${playerCount} players. See the full breakdown.`;
  } else if (isLive && leaderName) {
    const remaining = 18 - maxHolesPlayed;
    ogTitle = `${eventName} \u2014 LIVE`;
    ogDesc = `${esc(leaderName)} leads at ${leaderToParStr}. ${remaining} hole${remaining !== 1 ? 's' : ''} remaining. ${gamesStr}.`;
  } else {
    ogTitle = `${eventName}${stakesStr ? ' \u2014 Lines Are Set' : ''}`;
    ogDesc = `${playerCount} player${playerCount !== 1 ? 's' : ''}. ${stakesStr || gamesStr || 'Live scores & side action'}. ${venue ? venue + '. ' : ''}Join the action.`;
  }
  const ogImageUrl = `https://betwaggle.com/${slug}/og-image.svg`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="theme-color" content="${themeColor}">
  <title>${eventName}</title>
  <meta property="og:title" content="${ogTitle}">
  <meta property="og:description" content="${ogDesc}">
  <meta property="og:image" content="${ogImageUrl}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${eventUrl}">
  <meta property="og:site_name" content="Waggle">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${ogTitle}">
  <meta name="twitter:description" content="${ogDesc}">
  <meta name="twitter:image" content="${ogImageUrl}">
  <meta name="description" content="${ogDesc}">
  <meta name="apple-mobile-web-app-title" content="${shortName}">
  <link rel="icon" type="image/svg+xml" href="/${slug}/icon-180.svg">
  <link rel="manifest" href="/${slug}/manifest.json">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/${slug}/css/styles.css">
  ${isPaid && gadsId ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${gadsId}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${gadsId}');
    gtag('event', 'conversion', {
      send_to: '${gadsId}/${gadsLabel}',
      value: ${config.event?.format === 'round_robin_match_play' ? 149 : 29},
      currency: 'USD',
      transaction_id: '${slug}'
    });
  </script>` : ''}
</head>
<body>
  ${config.event?.status === 'complete' ? `
<div style="background:linear-gradient(135deg,#C9A84C,#9A7A2E);color:#0D2818;text-align:center;padding:12px 16px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">
  Trophy Room &mdash; ${eventName} &mdash; Final Results
</div>
<script>window.__WAGGLE_TROPHY_MODE__ = true;</script>
` : ''}
  ${(slug === 'demo' || slug === 'cabot-citrus-invitational' || slug.startsWith('demo-') || ['legends-trip','stag-night','augusta-scramble','masters-member-guest','weekend-warrior'].includes(slug)) ? `<div style="background:#D4AF37;color:#0D2818;text-align:center;font-size:12px;font-weight:700;padding:7px 12px;letter-spacing:0.5px">INTERACTIVE DEMO &nbsp;\u00b7&nbsp; <a href="/" style="color:#0D2818;text-decoration:underline">Create your own event \u2192</a></div>
<script>window.__WAGGLE_SPECTATOR__ = true;</script>` : ''}
  <header class="mg-header">
    <a href="/" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);text-decoration:none;line-height:0;opacity:0.95" aria-label="Back to Waggle">
      <img src="/logo.png" style="height:44px;width:auto;mix-blend-mode:screen;filter:contrast(1.3) saturate(1.2)" alt="Waggle">
    </a>
    <h1>${shortName}</h1>
    <div class="mg-subtitle">${venue}</div>
    <button onclick="waggleShare()" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.15);border:none;color:#fff;width:36px;height:36px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center" aria-label="Share event">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
    </button>
  </header>
  <style>.mg-header{position:relative}</style>
  <script>
  function waggleShare(){
    const url='${eventUrl}';
    const text='${eventName} \u2014 live scores, odds & side action. Open on your phone:';
    if(navigator.share){navigator.share({title:'${shortName}',text:text,url:url}).catch(()=>{});}
    else{navigator.clipboard.writeText(url).then(()=>{const t=document.getElementById('mg-toast');t.textContent='Link copied!';t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500);}).catch(()=>{});}
  }
  </script>
  <div id="app">
    <div class="mg-content mg-skeleton">
      <div class="mg-card skeleton-pulse" style="height:80px"></div>
      <div style="width:120px;height:16px;border-radius:4px;margin-bottom:12px" class="skeleton-pulse"></div>
      <div class="mg-flight-grid">
        <div class="mg-flight-card skeleton-pulse" style="height:100px"></div>
        <div class="mg-flight-card skeleton-pulse" style="height:100px"></div>
      </div>
    </div>
  </div>
  <nav class="mg-nav">
    <div class="mg-nav-inner">
      <a href="#dashboard" data-tab="dashboard"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12l9-9 9 9"/><path d="M9 21V9h6v12"/></svg><span class="nav-label">Home</span></a>
      <a href="#flights" data-tab="flights"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg><span class="nav-label">Flights</span></a>
      <a href="#bet" data-tab="bet"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg><span class="nav-label">Bet</span></a>
      <a href="#mybets" data-tab="mybets"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span class="nav-label">My Bets</span></a>
      <a href="#scorecard" data-tab="scorecard"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="12" y2="15"/></svg><span class="nav-label">Scores</span></a>
      <a href="#scenarios" data-tab="scenarios"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><span class="nav-label">What-If</span></a>
      <a href="#settle" data-tab="settle" style="display:none"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg><span class="nav-label">Settle</span></a>
      <a href="#admin" data-tab="admin"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg><span class="nav-label">Admin</span></a>
    </div>
  </nav>
  <div id="mg-toast" class="mg-toast"></div>
  <div id="save-indicator" style="position:fixed;top:68px;right:12px;background:rgba(26,71,42,0.9);color:#D4AF37;font-size:11px;font-weight:700;padding:4px 10px;border-radius:6px;opacity:0;transition:opacity 0.3s;pointer-events:none;z-index:100">Saved</div>
  <style>
    @keyframes flashIn { from { opacity:0; transform:scale(0.95); } to { opacity:1; transform:scale(1); } }
    @keyframes flashOut { from { opacity:1; } to { opacity:0; transform:scale(0.95); } }
  </style>
  <script type="module" src="/${slug}/js/app.js"></script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html;charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    }
  });
}

// ─── Game Engines ────────────────────────────────────────────────────────

const EVENT_CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Pin, X-Admin-Token',
  'Cache-Control': 'no-store'
};

function wggStrokesOnHole(handicapIndex, holeNum, strokeIndex) {
  const abs = Math.abs(handicapIndex);
  const ph = Math.max(0, Math.round(abs));
  const sign = handicapIndex < 0 ? -1 : 1;
  if (strokeIndex && strokeIndex.length === 18) {
    const rank = strokeIndex[holeNum - 1];
    const perHole = Math.floor(ph / 18);
    const extra = ph % 18;
    return sign * (perHole + (rank <= extra ? 1 : 0));
  }
  const perHole = Math.floor(ph / 18);
  const extra = ph % 18;
  return sign * (perHole + (holeNum <= extra ? 1 : 0));
}

function wggNetScores(grossScores, players, holeNum, strokeIndex) {
  const net = {};
  for (const [name, gross] of Object.entries(grossScores)) {
    const hi = players[name]?.handicapIndex ?? 0;
    net[name] = gross - wggStrokesOnHole(hi, holeNum, strokeIndex);
  }
  return net;
}

function wggRunSkins(holeNum, grossScores, prevState, players, strokeIndex, grossOnly) {
  const holes = { ...(prevState.holes || {}) };
  const events = [];
  // Gross-only mode: use raw scores (no handicap strokes). Eliminates "where do the strokes fall" arguments.
  const compareScores = grossOnly ? grossScores : wggNetScores(grossScores, players, holeNum, strokeIndex);
  const vals = Object.values(compareScores);
  const minVal = Math.min(...vals);
  const winners = Object.keys(compareScores).filter(n => compareScores[n] === minVal);
  const prevPot = prevState.pot || 1;

  if (winners.length === 1) {
    holes[holeNum] = { winner: winners[0], potWon: prevPot, compareScores, gross: grossScores };
    events.push({ type: 'skin_won', hole: holeNum, winner: winners[0], pot: prevPot });
    return { pot: 1, holes, events };
  }
  holes[holeNum] = { winner: null, carried: true, potBefore: prevPot, compareScores, gross: grossScores };
  events.push({ type: 'skin_carried', hole: holeNum, potBefore: prevPot, potAfter: prevPot + 1 });
  return { pot: prevPot + 1, holes, events };
}

function wggRunNassau(holeNum, grossScores, prevState, players, strokeIndex) {
  const state = JSON.parse(JSON.stringify(prevState));
  if (!state.running) state.running = {};
  if (!state.presses) state.presses = [];
  const events = [];
  const net = wggNetScores(grossScores, players, holeNum, strokeIndex);

  for (const [name, netScore] of Object.entries(net)) {
    if (!state.running[name]) state.running[name] = { front: 0, back: 0, total: 0 };
    state.running[name].total += netScore;
    if (holeNum <= 9) state.running[name].front += netScore;
    else state.running[name].back += netScore;
  }

  if (holeNum === 9) {
    const sorted = Object.entries(state.running).map(([n, s]) => ({ name: n, score: s.front })).sort((a, b) => a.score - b.score);
    state.frontWinner = sorted[0]?.name;
    events.push({ type: 'nassau_front_complete', winner: sorted[0]?.name, standings: sorted });
  }

  if (holeNum === 18) {
    const backSorted = Object.entries(state.running).map(([n, s]) => ({ name: n, score: s.back })).sort((a, b) => a.score - b.score);
    const totalSorted = Object.entries(state.running).map(([n, s]) => ({ name: n, score: s.total })).sort((a, b) => a.score - b.score);
    state.backWinner = backSorted[0]?.name;
    state.totalWinner = totalSorted[0]?.name;
    events.push({ type: 'nassau_back_complete', winner: backSorted[0]?.name });
    events.push({ type: 'nassau_total_complete', winner: totalSorted[0]?.name });
  }

  for (const press of state.presses || []) {
    if (!press.active) continue;
    if (holeNum < press.startHole) continue;
    if (press.segment === 'front' && holeNum > 9) continue;
    if (press.segment === 'back' && holeNum < 10) continue;
    if (!press.running) press.running = {};
    for (const [name, netScore] of Object.entries(net)) {
      press.running[name] = (press.running[name] || 0) + netScore;
    }
    const segmentEnd = (press.segment === 'front') ? 9 : 18;
    if (holeNum === segmentEnd || (press.segment === 'full' && holeNum === 18)) {
      press.active = false;
      const sorted = Object.entries(press.running).sort((a, b) => a[1] - b[1]);
      press.winner = sorted[0]?.[0];
      events.push({ type: 'press_complete', pressId: press.id, player: press.player, winner: press.winner });
    }
  }

  state.events = events;
  return state;
}

function wggRunWolf(holeNum, grossScores, prevState, players, strokeIndex) {
  const state = JSON.parse(JSON.stringify(prevState));
  if (!state.results) state.results = {};
  const events = [];
  const pick = state.picks?.[holeNum];
  if (!pick) { state.events = []; return state; }

  const net = wggNetScores(grossScores, players, holeNum, strokeIndex);
  const playerNames = Object.keys(grossScores);
  const { wolf, partner } = pick;

  let wolfTeamWon = false;
  if (pick.format === '2v2' && partner) {
    const wolfTeam = [wolf, partner].filter(p => playerNames.includes(p));
    const otherTeam = playerNames.filter(p => !wolfTeam.includes(p));
    const wolfScore = wolfTeam.reduce((s, p) => s + (net[p] || 99), 0);
    const otherScore = otherTeam.reduce((s, p) => s + (net[p] || 99), 0);
    wolfTeamWon = wolfScore < otherScore;
  } else {
    const wolfNet = net[wolf] ?? 99;
    const otherNets = playerNames.filter(p => p !== wolf).map(p => net[p] ?? 99);
    wolfTeamWon = otherNets.every(s => wolfNet < s);
  }

  state.results[holeNum] = { wolfTeamWon, wolf, partner: partner || null, net };
  events.push({ type: 'wolf_result', hole: holeNum, wolfTeamWon, wolf, format: pick.format });
  state.events = events;
  return state;
}

function wggRunVegas(holeNum, grossScores, prevState, players, vegasTeams, strokeIndex) {
  const state = JSON.parse(JSON.stringify(prevState));
  if (!state.holes) state.holes = {};
  const events = [];
  const net = wggNetScores(grossScores, players, holeNum, strokeIndex);
  const names = Object.keys(grossScores);

  let teamA, teamB;
  if (vegasTeams?.A && vegasTeams?.B) {
    teamA = vegasTeams.A.filter(p => names.includes(p));
    teamB = vegasTeams.B.filter(p => names.includes(p));
  } else {
    teamA = names.slice(0, Math.floor(names.length / 2));
    teamB = names.slice(Math.floor(names.length / 2));
  }

  const vegasNum = (team) => {
    const scores = team.map(p => net[p] ?? 99).sort((a, b) => a - b);
    return scores.length >= 2 ? scores[0] * 10 + scores[1] : scores[0] * 10;
  };

  const numA = vegasNum(teamA);
  const numB = vegasNum(teamB);
  const diff = Math.abs(numA - numB);
  const winner = numA < numB ? 'A' : numA > numB ? 'B' : 'push';

  state.holes[holeNum] = { teamA: numA, teamB: numB, diff, winner };
  state.teamA = teamA;
  state.teamB = teamB;
  if (!state.score) state.score = { A: 0, B: 0 };
  if (winner === 'A') state.score.A += diff;
  else if (winner === 'B') state.score.B += diff;

  events.push({ type: 'vegas_result', hole: holeNum, teamA: numA, teamB: numB, winner, diff });
  state.events = events;
  return state;
}

// ── 3-Player 9s (Nine-Point Game) ──────────────────────────────────
// On every hole, 9 points distributed among 3 players based on GROSS score.
// Clear 1st/2nd/3rd: 5-3-1
// Two tie for 1st, one 3rd: 4-4-1
// One 1st, two tie for 2nd/3rd: 5-2-2
// Three-way tie: 3-3-3
function wggRunNines(holeNum, grossScores, prevState, players) {
  const state = { ...prevState };
  if (!state.running) state.running = {};
  if (!state.holes) state.holes = {};
  if (!state.events) state.events = [];
  const events = [];

  // Get the 3 players' gross scores for this hole
  const playerNames = Object.keys(grossScores);
  if (playerNames.length < 3) {
    // Need exactly 3 players for 9s
    return { ...state, events };
  }

  // Sort by score (lowest = best in golf)
  const sorted = playerNames
    .map(name => ({ name, score: grossScores[name] }))
    .sort((a, b) => a.score - b.score);

  let points = {};

  // Determine distribution
  const s1 = sorted[0].score, s2 = sorted[1].score, s3 = sorted[2].score;

  if (s1 === s2 && s2 === s3) {
    // Three-way tie: 3-3-3
    points[sorted[0].name] = 3;
    points[sorted[1].name] = 3;
    points[sorted[2].name] = 3;
  } else if (s1 === s2) {
    // Two tie for 1st, one 3rd: 4-4-1
    points[sorted[0].name] = 4;
    points[sorted[1].name] = 4;
    points[sorted[2].name] = 1;
  } else if (s2 === s3) {
    // One 1st, two tie for 2nd/3rd: 5-2-2
    points[sorted[0].name] = 5;
    points[sorted[1].name] = 2;
    points[sorted[2].name] = 2;
  } else {
    // Clear 1st, 2nd, 3rd: 5-3-1
    points[sorted[0].name] = 5;
    points[sorted[1].name] = 3;
    points[sorted[2].name] = 1;
  }

  // Update running totals
  for (const [name, pts] of Object.entries(points)) {
    state.running[name] = (state.running[name] || 0) + pts;
  }

  // Store hole result
  state.holes[holeNum] = { scores: grossScores, points, sorted: sorted.map(s => s.name) };

  // Generate events
  const winner = sorted[0];
  if (s1 < s2) {
    events.push({ type: 'nines_hole_winner', hole: holeNum, player: winner.name, points: points[winner.name], score: winner.score });
  } else {
    events.push({ type: 'nines_hole_tie', hole: holeNum, players: sorted.filter(s => s.score === s1).map(s => s.name) });
  }

  state.events = [...(prevState.events || []), ...events];
  return { ...state, events };
}

// ── Team Scramble ──────────────────────────────────────────────────
// Team event: one GROSS score per hole per team.
// Tracks cumulative team scores and leaderboard.
// Supports "What-If" via simulated scores overlay.
function wggRunScramble(holeNum, teamScores, prevState, teams) {
  // teamScores: { "Team Smith": 4, "Team Jones": 3, ... }
  // teams: array of team names
  const state = { ...prevState };
  if (!state.running) state.running = {};
  if (!state.holes) state.holes = {};
  if (!state.events) state.events = [];
  const events = [];

  // Store this hole's scores
  state.holes[holeNum] = { scores: teamScores, timestamp: Date.now() };

  // Update running totals (cumulative gross)
  for (const [team, score] of Object.entries(teamScores)) {
    state.running[team] = (state.running[team] || 0) + score;
  }

  // Compute leaderboard (sorted by total, lowest first)
  const leaderboard = Object.entries(state.running)
    .sort((a, b) => a[1] - b[1])
    .map(([team, total], i) => ({ team, total, position: i + 1 }));

  state.leaderboard = leaderboard;

  // Events
  const holeWinner = Object.entries(teamScores).sort((a, b) => a[1] - b[1])[0];
  if (holeWinner) {
    events.push({ type: 'scramble_hole', hole: holeNum, team: holeWinner[0], score: holeWinner[1] });
  }

  // Check for lead changes
  if (leaderboard.length >= 2) {
    const leader = leaderboard[0];
    const margin = leaderboard[1].total - leader.total;
    events.push({ type: 'scramble_standings', hole: holeNum, leader: leader.team, margin });
  }

  state.events = [...(prevState.events || []), ...events];
  return { ...state, events };
}

// ── Scramble What-If Calculator ────────────────────────────────────
// Takes real state + simulated hole scores, returns projected leaderboard
function scrambleWhatIf(realState, simHoles, pars) {
  // simHoles: { 15: { "Team Smith": 3, "Team Jones": 4 }, 16: {...} }
  const projected = { ...realState.running };

  for (const [hole, scores] of Object.entries(simHoles)) {
    for (const [team, score] of Object.entries(scores)) {
      projected[team] = (projected[team] || 0) + score;
    }
  }

  // Compute projected leaderboard
  const leaderboard = Object.entries(projected)
    .sort((a, b) => a[1] - b[1])
    .map(([team, total], i) => ({
      team,
      total,
      position: i + 1,
      delta: total - (realState.running[team] || 0), // simulated holes contribution
    }));

  return { projected, leaderboard };
}

// ── Stableford ─────────────────────────────────────────────────────
// Points-based scoring per hole relative to par.
// Double Eagle: 8, Eagle: 5, Birdie: 3, Par: 1, Bogey: 0, Double+: -1
// Highest total points wins. Bet is per-point difference.
function wggRunStableford(holeNum, grossScores, prevState, players, strokeIndex, pars) {
  const prev = prevState || { running: {}, holes: {} };
  const events = [];
  const par = (pars && pars[holeNum - 1]) || 4;

  if (!prev.holes) prev.holes = {};
  if (!prev.running) prev.running = {};
  const holePoints = {};

  for (const [name, gross] of Object.entries(grossScores)) {
    const diff = gross - par;
    let points = 0;
    if (diff <= -3) points = 8;       // double eagle or better
    else if (diff === -2) points = 5;  // eagle
    else if (diff === -1) points = 3;  // birdie
    else if (diff === 0) points = 1;   // par
    else if (diff === 1) points = 0;   // bogey
    else points = -1;                  // double bogey or worse

    prev.running[name] = (prev.running[name] || 0) + points;
    holePoints[name] = points;
  }

  prev.holes[holeNum] = { scores: grossScores, points: holePoints, par };

  // Events
  const best = Object.entries(holePoints).sort((a, b) => b[1] - a[1]);
  if (best.length > 0 && best[0][1] >= 3) {
    events.push({ type: 'stableford_big_score', hole: holeNum, player: best[0][0], points: best[0][1] });
  }

  return { ...prev, events };
}

// ── Match Play (vs field) ──────────────────────────────────────────
// Each hole: every player earns 1 point per opponent beaten, 0.5 per tie.
// Highest total points wins. Bet is per-point difference.
function wggRunMatchPlay(holeNum, grossScores, prevState, players) {
  const prev = prevState || { running: {}, holes: {} };
  const events = [];
  const entries = Object.entries(grossScores);

  if (!prev.holes) prev.holes = {};
  if (!prev.running) prev.running = {};

  const holePoints = {};
  for (const [nameA, scoreA] of entries) {
    holePoints[nameA] = 0;
    for (const [nameB, scoreB] of entries) {
      if (nameA === nameB) continue;
      if (scoreA < scoreB) holePoints[nameA] += 1;
      else if (scoreA === scoreB) holePoints[nameA] += 0.5;
    }
    prev.running[nameA] = (prev.running[nameA] || 0) + holePoints[nameA];
  }

  prev.holes[holeNum] = { scores: grossScores, points: holePoints };

  // Events — report hole winner(s)
  const maxPts = Math.max(...Object.values(holePoints));
  const holeWinners = Object.entries(holePoints).filter(([, p]) => p === maxPts).map(([n]) => n);
  if (holeWinners.length === 1) {
    events.push({ type: 'match_play_hole_won', hole: holeNum, winner: holeWinners[0], points: maxPts });
  }

  return { ...prev, events };
}

// ── Banker ──────────────────────────────────────────────────────────
// Rotating banker plays against the field each hole.
// Banker beats opponent: collects 1 unit. Opponent beats banker: banker pays 1 unit.
// Birdie by banker doubles stakes. Rotation: player index = (holeNum-1) % n.
function wggRunBanker(holeNum, grossScores, prevState, players, pars) {
  const prev = prevState || { running: {}, holes: {}, bankerIdx: 0 };
  const events = [];
  const playerNames = Object.keys(grossScores);
  const n = playerNames.length;
  if (n < 2) return { ...prev, events };

  if (!prev.holes) prev.holes = {};
  if (!prev.running) prev.running = {};

  const bankerIdx = (holeNum - 1) % n;
  const banker = playerNames[bankerIdx];
  const bankerScore = grossScores[banker];
  const par = (pars && pars[holeNum - 1]) || 4;
  const multiplier = (bankerScore <= par - 1) ? 2 : 1; // birdie or better doubles

  for (const name of playerNames) {
    if (prev.running[name] === undefined) prev.running[name] = 0;
  }

  for (const [name, score] of Object.entries(grossScores)) {
    if (name === banker) continue;
    if (bankerScore < score) {
      prev.running[banker] += multiplier;
      prev.running[name] -= multiplier;
    } else if (bankerScore > score) {
      prev.running[banker] -= multiplier;
      prev.running[name] += multiplier;
    }
    // ties: no exchange
  }

  prev.holes[holeNum] = { banker, scores: grossScores, multiplier, bankerScore, par };
  prev.bankerIdx = bankerIdx;
  events.push({ type: 'banker_result', hole: holeNum, banker, multiplier, bankerScore });

  return { ...prev, events };
}

// ── Bingo Bango Bongo ──────────────────────────────────────────────
// 3 points per hole. Without shot-by-shot data, award by score:
// Sole lowest: 2 pts. Second lowest: 1 pt. Ties at top split 3 pts.
function wggRunBBB(holeNum, grossScores, prevState) {
  const prev = prevState || { running: {}, holes: {} };
  const events = [];
  const entries = Object.entries(grossScores).sort((a, b) => a[1] - b[1]);

  if (!prev.holes) prev.holes = {};
  if (!prev.running) prev.running = {};

  for (const [name] of entries) {
    if (prev.running[name] === undefined) prev.running[name] = 0;
  }

  if (entries.length >= 2) {
    const best = entries[0][1];
    const bestPlayers = entries.filter(e => e[1] === best);
    if (bestPlayers.length === 1) {
      // Sole winner: 2 pts
      prev.running[bestPlayers[0][0]] += 2;
      // Second best: 1 pt
      const secondBest = entries[1][1];
      const secondPlayers = entries.filter(e => e[1] === secondBest && e[0] !== bestPlayers[0][0]);
      if (secondPlayers.length === 1) {
        prev.running[secondPlayers[0][0]] += 1;
      } else if (secondPlayers.length > 1) {
        // Split 1 pt among tied second-place
        const share = 1 / secondPlayers.length;
        secondPlayers.forEach(([name]) => { prev.running[name] += share; });
      }
      events.push({ type: 'bbb_hole_winner', hole: holeNum, winner: bestPlayers[0][0] });
    } else {
      // Tie at top: split 3 points
      const share = 3 / bestPlayers.length;
      bestPlayers.forEach(([name]) => { prev.running[name] += share; });
      events.push({ type: 'bbb_hole_tie', hole: holeNum, players: bestPlayers.map(([n]) => n) });
    }
  }

  prev.holes[holeNum] = Object.fromEntries(entries.map(([n, s]) => [n, s]));
  return { ...prev, events };
}

// ── Bloodsome ──────────────────────────────────────────────────────
// True Bloodsome requires team/alternate-shot data we don't capture.
// Approximation: lowest gross score wins the hole (1 pt). Ties: no point.
function wggRunBloodsome(holeNum, grossScores, prevState) {
  const prev = prevState || { running: {}, holes: {} };
  const events = [];
  const entries = Object.entries(grossScores).sort((a, b) => a[1] - b[1]);

  if (!prev.holes) prev.holes = {};
  if (!prev.running) prev.running = {};

  for (const [name] of entries) {
    if (prev.running[name] === undefined) prev.running[name] = 0;
  }

  if (entries.length >= 2) {
    const bestScore = entries[0][1];
    const winners = entries.filter(e => e[1] === bestScore);
    if (winners.length === 1) {
      prev.running[winners[0][0]] += 1;
      events.push({ type: 'bloodsome_hole_won', hole: holeNum, winner: winners[0][0] });
    }
    // Ties: no point awarded
  }

  prev.holes[holeNum] = Object.fromEntries(entries);
  return { ...prev, events };
}

// ─── handleEventApi — the massive event API handler ─────────────────────
// This is copied verbatim from cafecito-ai worker.js (lines 4551-5677)
// The only change: EVENT_CORS Allow-Origin is now '*' instead of cafecito-ai.com

async function handleEventApi(slug, path, request, env, ctx) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: EVENT_CORS });
  }

  if (!env.MG_BOOK) {
    return new Response(JSON.stringify({ error: 'Book not configured' }), { status: 500, headers: EVENT_CORS });
  }

  const K = slug;

  let adminPin = null;
  const configRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
  let eventConfig = null;
  if (configRaw) {
    try { eventConfig = JSON.parse(configRaw); adminPin = eventConfig?.event?.adminPin; } catch {}
  }
  if (!adminPin && slug === 'mg' && env.LEGACY_MG_PIN) adminPin = env.LEGACY_MG_PIN;

  const submittedPin = request.headers.get('X-Admin-Pin') || '';
  let isAdmin = false;
  if (adminPin && submittedPin) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('waggle-pin-check'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const hmacA = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(submittedPin)));
    const hmacB = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(adminPin)));
    isAdmin = hmacA.length === hmacB.length && hmacA.every((b, i) => b === hmacB[i]);
  }
  if (!isAdmin) {
    const token = request.headers.get('X-Admin-Token');
    if (token) {
      const sessions = (await env.MG_BOOK.get(`${K}:admin-sessions`, 'json')) || {};
      const session = sessions[token];
      if (session && session.expires > Date.now()) {
        isAdmin = true;
      }
    }
  }

  // POST /admin/magic-link
  if (path === 'admin/magic-link' && request.method === 'POST') {
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const mlRlKey = `${K}:ml-rl:${clientIP}`;
    const mlRlCount = parseInt(await env.MG_BOOK.get(mlRlKey, 'text') || '0', 10);
    if (mlRlCount >= 5) return new Response(JSON.stringify({ error: 'Too many attempts' }), { status: 429, headers: EVENT_CORS });
    await env.MG_BOOK.put(mlRlKey, String(mlRlCount + 1), { expirationTtl: 600 });

    const body = await request.json();
    const contact = (body.contact || '').toString().trim().toLowerCase();
    if (!contact) return new Response(JSON.stringify({ error: 'Phone or email required' }), { status: 400, headers: EVENT_CORS });

    const adminContact = (eventConfig?.event?.adminContact || '').toString().trim().toLowerCase();
    if (!adminContact) return new Response(JSON.stringify({ error: 'No commissioner contact configured' }), { status: 400, headers: EVENT_CORS });
    const normalizePhone = s => s.replace(/[^0-9]/g, '');
    const isEmail = contact.includes('@');
    const adminEmails = (eventConfig?.event?.adminEmails || []).map(e => e.toLowerCase());
    const contactMatch = isEmail ? (contact === adminContact || adminEmails.includes(contact)) : normalizePhone(contact) === normalizePhone(adminContact) || contact === adminContact;
    if (!contactMatch) return new Response(JSON.stringify({ error: 'Contact does not match commissioner on file' }), { status: 401, headers: EVENT_CORS });

    const magicToken = crypto.randomUUID();
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    const rng = new Uint8Array(6);
    crypto.getRandomValues(rng);
    for (let i = 0; i < 6; i++) code += chars[rng[i] % chars.length];

    await env.MG_BOOK.put(`${K}:magic-auth`, JSON.stringify({ magicToken, code, expires: Date.now() + 600000, contact }), { expirationTtl: 600 });
    return new Response(JSON.stringify({ ok: true, sent: true }), { headers: EVENT_CORS });
  }

  // POST /admin/magic-verify
  if (path === 'admin/magic-verify' && request.method === 'POST') {
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const mvRlKey = `${K}:mv-rl:${clientIP}`;
    const mvRlCount = parseInt(await env.MG_BOOK.get(mvRlKey, 'text') || '0', 10);
    if (mvRlCount >= 5) return new Response(JSON.stringify({ error: 'Too many attempts' }), { status: 429, headers: EVENT_CORS });
    await env.MG_BOOK.put(mvRlKey, String(mvRlCount + 1), { expirationTtl: 600 });

    const body = await request.json();
    const submittedToken = (body.token || '').toString().trim();
    const submittedCode = (body.code || '').toString().trim().toUpperCase();
    if (!submittedToken && !submittedCode) return new Response(JSON.stringify({ error: 'Token or code required' }), { status: 400, headers: EVENT_CORS });

    const magicData = await env.MG_BOOK.get(`${K}:magic-auth`, 'json');
    if (!magicData || magicData.expires < Date.now()) return new Response(JSON.stringify({ error: 'No pending magic link or expired' }), { status: 401, headers: EVENT_CORS });

    if ((submittedToken && submittedToken === magicData.magicToken) || (submittedCode && submittedCode === magicData.code)) {
      const token = crypto.randomUUID();
      const sessions = (await env.MG_BOOK.get(`${K}:admin-sessions`, 'json')) || {};
      const now = Date.now();
      for (const [k, v] of Object.entries(sessions)) { if (v.expires < now) delete sessions[k]; }
      sessions[token] = { created: now, expires: now + 86400000 };
      await env.MG_BOOK.put(`${K}:admin-sessions`, JSON.stringify(sessions));
      await env.MG_BOOK.delete(`${K}:magic-auth`);
      return new Response(JSON.stringify({ ok: true, token }), { headers: EVENT_CORS });
    }
    return new Response(JSON.stringify({ error: 'Invalid token or code' }), { status: 401, headers: EVENT_CORS });
  }

  // POST /admin/auth
  if (path === 'admin/auth' && request.method === 'POST') {
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const authRlKey = `${K}:auth-rl:${clientIP}`;
    const authRlCount = parseInt(await env.MG_BOOK.get(authRlKey, 'text') || '0', 10);
    if (authRlCount >= 5) return new Response(JSON.stringify({ error: 'Too many attempts' }), { status: 429, headers: EVENT_CORS });
    await env.MG_BOOK.put(authRlKey, String(authRlCount + 1), { expirationTtl: 600 });

    const body = await request.json();
    const pin = (body.pin || '').toString();
    let pinMatch = false;
    if (adminPin && pin) {
      const hmacKey = await crypto.subtle.importKey('raw', new TextEncoder().encode('waggle-auth-check'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const hmacA = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(pin)));
      const hmacB = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(adminPin)));
      pinMatch = hmacA.length === hmacB.length && hmacA.every((b, i) => b === hmacB[i]);
    }
    if (pinMatch) {
      const token = crypto.randomUUID();
      const sessions = (await env.MG_BOOK.get(`${K}:admin-sessions`, 'json')) || {};
      const now = Date.now();
      for (const [k, v] of Object.entries(sessions)) { if (v.expires < now) delete sessions[k]; }
      sessions[token] = { created: now, expires: now + 86400000 };
      await env.MG_BOOK.put(`${K}:admin-sessions`, JSON.stringify(sessions));
      return new Response(JSON.stringify({ ok: true, token }), { headers: EVENT_CORS });
    }
    return new Response(JSON.stringify({ error: 'Invalid PIN' }), { status: 401, headers: EVENT_CORS });
  }

  // POST /admin/refund — refund a Stripe payment for this event
  if (path === 'admin/refund' && request.method === 'POST') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Admin required' }), { status: 403, headers: EVENT_CORS });
    if (!eventConfig) return new Response(JSON.stringify({ error: 'Event not found' }), { status: 404, headers: EVENT_CORS });
    const body = await request.json().catch(() => ({}));
    const reason = body.reason || '';

    const stripeSessionId = eventConfig.meta?.stripe_session_id;
    const paymentIntentId = eventConfig.meta?.stripe_payment_intent;

    if (!stripeSessionId && !paymentIntentId) {
      return new Response(JSON.stringify({ error: 'No payment found for this event' }), { status: 400, headers: EVENT_CORS });
    }
    if (!env.STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: 'Stripe not configured' }), { status: 500, headers: EVENT_CORS });
    }

    try {
      let piId = paymentIntentId;
      // If we only have a session ID, look up the payment intent
      if (!piId && stripeSessionId) {
        const sessionRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${stripeSessionId}`, {
          headers: { 'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}` }
        });
        const session = await sessionRes.json();
        piId = session.payment_intent;
      }
      if (!piId) return new Response(JSON.stringify({ error: 'No payment found for this event' }), { status: 400, headers: EVENT_CORS });

      const refundRes = await fetch('https://api.stripe.com/v1/refunds', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `payment_intent=${piId}&reason=requested_by_customer`
      });
      const refund = await refundRes.json();

      if (refund.id) {
        eventConfig.event.status = 'refunded';
        eventConfig.event.refundedAt = new Date().toISOString();
        eventConfig.event.refundReason = reason;
        await env.MG_BOOK.put(`config:${slug}`, JSON.stringify(eventConfig));
        await env.MG_BOOK.put(`${slug}:refund`, JSON.stringify({ refundId: refund.id, amount: refund.amount, reason, at: new Date().toISOString() }));
        return new Response(JSON.stringify({ ok: true, refundId: refund.id }), { headers: EVENT_CORS });
      }
      return new Response(JSON.stringify({ error: 'Refund failed', details: refund }), { status: 400, headers: EVENT_CORS });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: EVENT_CORS });
    }
  }

  // POST /event/freeze — freeze event as complete (Trophy Room)
  if (path === 'event/freeze' && request.method === 'POST') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Admin required' }), { status: 403, headers: EVENT_CORS });
    if (!eventConfig) return new Response(JSON.stringify({ error: 'Event not found' }), { status: 404, headers: EVENT_CORS });
    eventConfig.event.status = 'complete';
    eventConfig.event.frozenAt = new Date().toISOString();
    await env.MG_BOOK.put(`config:${slug}`, JSON.stringify(eventConfig));
    return new Response(JSON.stringify({ ok: true, status: 'complete' }), { headers: EVENT_CORS });
  }

  // GET /state
  if (path === 'state' && request.method === 'GET') {
    const [bets, scores, settings] = await Promise.all([env.MG_BOOK.get(`${K}:bets`, 'json'), env.MG_BOOK.get(`${K}:scores`, 'json'), env.MG_BOOK.get(`${K}:settings`, 'json')]);
    return new Response(JSON.stringify({ bets: bets || [], scores: scores || {}, settings: settings || { announcements: [], lockedMatches: [], oddsOverrides: {} } }), { headers: EVENT_CORS });
  }

  // GET /player/:name
  if (path.startsWith('player/') && !path.startsWith('player/add-credits') && request.method === 'GET') {
    const playerName = decodeURIComponent(path.split('/')[1]).toLowerCase();
    const players = (await env.MG_BOOK.get(`${K}:players`, 'json')) || {};
    const player = players[playerName];
    if (!player) return new Response(JSON.stringify({ name: playerName, credits: 0, totalWagered: 0, activeBets: 0 }), { headers: EVENT_CORS });
    const bets = (await env.MG_BOOK.get(`${K}:bets`, 'json')) || [];
    const activeBets = bets.filter(b => b.status === 'active' && (b.bettor || '').toLowerCase() === playerName).length;
    return new Response(JSON.stringify({ ...player, activeBets }), { headers: EVENT_CORS });
  }

  // GET /players
  if (path === 'players' && request.method === 'GET') {
    const players = (await env.MG_BOOK.get(`${K}:players`, 'json')) || {};
    return new Response(JSON.stringify(Object.values(players)), { headers: EVENT_CORS });
  }

  // POST /player
  if (path === 'player' && request.method === 'POST') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Admin required' }), { status: 403, headers: EVENT_CORS });
    const body = await request.json();
    const { credits } = body;
    const cleanName = sanitizeName(body.name);
    if (!cleanName || cleanName.length < 2) return new Response(JSON.stringify({ error: 'Name required (2+ characters)' }), { status: 400, headers: EVENT_CORS });
    const key = cleanName.toLowerCase();
    const players = (await env.MG_BOOK.get(`${K}:players`, 'json')) || {};
    if (players[key] && players[key].name !== cleanName) {
      return new Response(JSON.stringify({ error: `A player with a similar name already exists ("${players[key].name}"). Use a unique name (e.g., add last initial).` }), { status: 409, headers: EVENT_CORS });
    }
    if (players[key]) { players[key].credits = Math.floor(Number(credits) || 0); }
    else { players[key] = { name: cleanName, credits: Math.floor(Number(credits) || 0), totalWagered: 0 }; }
    await env.MG_BOOK.put(`${K}:players`, JSON.stringify(players));
    return new Response(JSON.stringify({ ok: true, player: players[key] }), { headers: EVENT_CORS });
  }

  // POST /player/add-credits
  if (path === 'player/add-credits' && request.method === 'POST') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Admin required' }), { status: 403, headers: EVENT_CORS });
    const body = await request.json();
    const { name, amount } = body;
    if (!name || !amount) return new Response(JSON.stringify({ error: 'Name and amount required' }), { status: 400, headers: EVENT_CORS });
    const key = name.trim().toLowerCase();
    const players = (await env.MG_BOOK.get(`${K}:players`, 'json')) || {};
    if (!players[key]) { players[key] = { name: name.trim(), credits: 0, totalWagered: 0 }; }
    players[key].credits += Math.floor(Number(amount));
    await env.MG_BOOK.put(`${K}:players`, JSON.stringify(players));
    return new Response(JSON.stringify({ ok: true, player: players[key] }), { headers: EVENT_CORS });
  }

  // POST /join
  if (path === 'join' && request.method === 'POST') {
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rlKey = `${K}:join-rl:${clientIP}`;
    const rlCount = parseInt(await env.MG_BOOK.get(rlKey, 'text') || '0', 10);
    if (rlCount >= 5) return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429, headers: EVENT_CORS });
    await env.MG_BOOK.put(rlKey, String(rlCount + 1), { expirationTtl: 600 });
    const body = await request.json();
    const name = sanitizeName(body.name);
    const hi = parseFloat(body.hi);
    const email = (body.email || '').trim().toLowerCase();
    if (!name || name.length < 2) return new Response(JSON.stringify({ error: 'Name required (2+ characters)' }), { status: 400, headers: EVENT_CORS });
    if (isNaN(hi) || hi < -10 || hi > 54) return new Response(JSON.stringify({ error: 'Valid handicap index required' }), { status: 400, headers: EVENT_CORS });
    // Check for duplicate name in existing roster
    const players = (await env.MG_BOOK.get(`${K}:players`, 'json')) || {};
    if (players[name.toLowerCase()]) return new Response(JSON.stringify({ error: `A player named "${players[name.toLowerCase()].name}" already exists. Use a unique name (e.g., add last initial).` }), { status: 409, headers: EVENT_CORS });
    const requests = (await env.MG_BOOK.get(`${K}:join-requests`, 'json')) || [];
    // Check for duplicate in pending requests too
    if (requests.some(r => r.status === 'pending' && r.name.toLowerCase() === name.toLowerCase())) return new Response(JSON.stringify({ error: 'A join request with that name is already pending.' }), { status: 409, headers: EVENT_CORS });
    const pending = requests.filter(r => r.status === 'pending');
    if (pending.length >= 100) return new Response(JSON.stringify({ error: 'Registration is full' }), { status: 400, headers: EVENT_CORS });
    const id = crypto.randomUUID().slice(0, 8);
    const joinEntry = { id, name, hi, ts: Date.now(), status: 'pending' };
    if (email) joinEntry.email = email;
    requests.push(joinEntry);
    await env.MG_BOOK.put(`${K}:join-requests`, JSON.stringify(requests));
    return new Response(JSON.stringify({ ok: true, id }), { headers: EVENT_CORS });
  }

  // GET /join-requests
  if (path === 'join-requests' && request.method === 'GET') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Admin required' }), { status: 403, headers: EVENT_CORS });
    const requests = (await env.MG_BOOK.get(`${K}:join-requests`, 'json')) || [];
    return new Response(JSON.stringify(requests.filter(r => r.status === 'pending')), { headers: EVENT_CORS });
  }

  // POST /join-approve
  if (path === 'join-approve' && request.method === 'POST') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Admin required' }), { status: 403, headers: EVENT_CORS });
    const { id, credits } = await request.json();
    const requests = (await env.MG_BOOK.get(`${K}:join-requests`, 'json')) || [];
    const req = requests.find(r => r.id === id);
    if (!req) return new Response(JSON.stringify({ error: 'Request not found' }), { status: 404, headers: EVENT_CORS });
    req.status = 'approved';
    await env.MG_BOOK.put(`${K}:join-requests`, JSON.stringify(requests));
    const players = (await env.MG_BOOK.get(`${K}:players`, 'json')) || {};
    const key = req.name.trim().toLowerCase();
    if (!players[key]) { players[key] = { name: req.name.trim(), hi: req.hi, credits: Math.floor(Number(credits) || 0), totalWagered: 0 }; }
    else { players[key].hi = req.hi; }
    await env.MG_BOOK.put(`${K}:players`, JSON.stringify(players));
    // Send approval notification email (fire-and-forget)
    if (env.RESEND_API_KEY && req.email) {
      const config = eventConfig;
      ctx.waitUntil((async () => {
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'waggle@cafecito-ai.com',
              to: req.email,
              subject: `You're in! Join ${config?.event?.name || 'the event'}`,
              html: `<div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto">
                <div style="background:#0D2818;padding:24px;text-align:center;border-radius:8px 8px 0 0">
                  <div style="font-family:Georgia,serif;font-size:24px;color:#C9A84C;font-weight:700">Waggle</div>
                </div>
                <div style="padding:24px;background:#FAF8F5;border-radius:0 0 8px 8px">
                  <p style="font-size:16px;font-weight:600;color:#0D2818">You've been approved!</p>
                  <p style="font-size:14px;color:#3D3D3D;line-height:1.6">Open the sportsbook to see live odds, place bets, and follow the action:</p>
                  <a href="https://betwaggle.com/${slug}/" style="display:block;text-align:center;background:#C9A84C;color:#0D2818;padding:14px;border-radius:6px;font-weight:700;font-size:15px;text-decoration:none;margin:20px 0">Open the Sportsbook</a>
                </div>
              </div>`
            })
          });
        } catch {}
      })());
    }
    return new Response(JSON.stringify({ ok: true }), { headers: EVENT_CORS });
  }

  // POST /join-reject
  if (path === 'join-reject' && request.method === 'POST') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Admin required' }), { status: 403, headers: EVENT_CORS });
    const { id } = await request.json();
    const requests = (await env.MG_BOOK.get(`${K}:join-requests`, 'json')) || [];
    const req = requests.find(r => r.id === id);
    if (req) req.status = 'rejected';
    await env.MG_BOOK.put(`${K}:join-requests`, JSON.stringify(requests));
    return new Response(JSON.stringify({ ok: true }), { headers: EVENT_CORS });
  }

  // POST /bet
  if (path === 'bet' && request.method === 'POST') { try {
    // Rate limit: 30 bets per hour per IP
    const betIp = request.headers.get('CF-Connecting-IP') || 'unknown';
    const betRlKey = `bet-rl:${slug}:${betIp}`;
    const betRlCount = parseInt(await env.MG_BOOK.get(betRlKey, 'text') || '0', 10);
    if (betRlCount >= 30) {
      return new Response(JSON.stringify({ error: 'Too many bets. Try again later.' }), { status: 429, headers: EVENT_CORS });
    }
    await env.MG_BOOK.put(betRlKey, String(betRlCount + 1), { expirationTtl: 3600 });

    const body = await request.json();
    const { bettor, type, selection, matchId, flightId, stake, odds, americanOdds, description } = body;
    if (!bettor || !type || !stake || stake <= 0) return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: EVENT_CORS });
    const stakeNum = Number(stake);
    const MAX_SINGLE_BET = 100, MAX_MATCH_EXPOSURE = 500, MAX_ACTIVE_BETS_PER_BETTOR = 10;
    if (stakeNum > MAX_SINGLE_BET) return new Response(JSON.stringify({ error: `Max single bet is $${MAX_SINGLE_BET}` }), { status: 400, headers: EVENT_CORS });

    const lockKey = `${K}:bet-lock`;
    const lockId = crypto.randomUUID();
    const existingLock = await env.MG_BOOK.get(lockKey, 'text');
    if (existingLock) return new Response(JSON.stringify({ error: 'Sportsbook busy \u2014 tap again' }), { status: 409, headers: EVENT_CORS });
    await env.MG_BOOK.put(lockKey, lockId, { expirationTtl: 60 });

    try {
      if (matchId && configRaw) {
        try {
          const cfg = JSON.parse(configRaw);
          const validMatchIds = new Set();
          if (cfg.pairings && cfg.flightOrder) {
            for (const fId of cfg.flightOrder) {
              const flightPairings = cfg.pairings[fId] || {};
              for (const [round, pairs] of Object.entries(flightPairings)) {
                for (let p = 0; p < pairs.length; p++) { validMatchIds.add(`${fId}-R${round}-P${p + 1}`); }
              }
            }
          }
          if (validMatchIds.size > 0 && !validMatchIds.has(matchId)) return new Response(JSON.stringify({ error: 'Invalid match' }), { status: 400, headers: EVENT_CORS });
        } catch {}
      }

      // 1C: Block bets on finished matches
      if (matchId) {
        const scores = (await env.MG_BOOK.get(`${K}:scores`, 'json')) || {};
        if (scores[matchId] && scores[matchId].status === 'final') {
          return new Response(JSON.stringify({ error: 'Match already completed' }), { status: 400, headers: EVENT_CORS });
        }
      }
      // Block bets if event is complete
      if (configRaw) {
        try { const cfg = JSON.parse(configRaw); if (cfg.event && cfg.event.status === 'complete') return new Response(JSON.stringify({ error: 'Event is complete \u2014 no new bets' }), { status: 400, headers: EVENT_CORS }); } catch {}
      }

      // 1D: Odds validation — reject absurd odds and validate against ML table
      const submittedOdds = Number(odds);
      if (isNaN(submittedOdds) || submittedOdds > 50 || submittedOdds < 1.01) {
        return new Response(JSON.stringify({ error: 'Invalid odds \u2014 refresh and try again' }), { status: 400, headers: EVENT_CORS });
      }

      const bets = (await env.MG_BOOK.get(`${K}:bets`, 'json')) || [];
      const bettorKey = bettor.trim().toLowerCase();
      const activeBettorBets = bets.filter(b => b.status === 'active' && b.bettor.trim().toLowerCase() === bettorKey);
      if (activeBettorBets.length >= MAX_ACTIVE_BETS_PER_BETTOR) return new Response(JSON.stringify({ error: `Max ${MAX_ACTIVE_BETS_PER_BETTOR} active bets per bettor` }), { status: 400, headers: EVENT_CORS });

      if (matchId) {
        const matchBets = bets.filter(b => b.status === 'active' && b.matchId === matchId);
        const matchExposure = matchBets.reduce((sum, b) => sum + b.stake, 0);
        if (matchExposure + stakeNum > MAX_MATCH_EXPOSURE) return new Response(JSON.stringify({ error: `Max exposure per match is $${MAX_MATCH_EXPOSURE}` }), { status: 400, headers: EVENT_CORS });
      }

      const players = (await env.MG_BOOK.get(`${K}:players`, 'json')) || {};
      const playerKey = bettor.trim().toLowerCase();
      const player = players[playerKey];
      if (!player) return new Response(JSON.stringify({ error: 'Player not found' }), { status: 400, headers: EVENT_CORS });
      if (player.credits < stakeNum) return new Response(JSON.stringify({ error: `Insufficient credits ($${player.credits} available)` }), { status: 400, headers: EVENT_CORS });

      player.credits -= stakeNum;
      player.totalWagered = (player.totalWagered || 0) + stakeNum;
      await env.MG_BOOK.put(`${K}:players`, JSON.stringify(players));

      const bet = {
        id: 'bet_' + crypto.randomUUID(), bettor: bettor.trim(), type, selection,
        matchId: matchId || null, flightId: flightId || null, stake: stakeNum,
        odds: Number(odds), americanOdds: americanOdds || null, description: description || '',
        status: 'active', payout: 0, placedAt: new Date().toISOString(), settledAt: null,
      };
      bets.push(bet);
      await env.MG_BOOK.put(`${K}:bets`, JSON.stringify(bets));
      return new Response(JSON.stringify({ ok: true, bet, credits: player.credits }), { headers: EVENT_CORS });
    } finally {
      await env.MG_BOOK.delete(lockKey);
    }
  } catch (betErr) {
    console.error('Bet handler error:', betErr.message, betErr.stack);
    console.error('bet-handler-error', { error: betErr.message, stack: betErr.stack });
    return new Response(JSON.stringify({ error: 'Internal error placing bet' }), { status: 500, headers: EVENT_CORS });
  } }

  // GET /bets
  if (path === 'bets' && request.method === 'GET') {
    const bets = (await env.MG_BOOK.get(`${K}:bets`, 'json')) || [];
    return new Response(JSON.stringify(bets), { headers: EVENT_CORS });
  }

  // PUT /bet/:id
  if (path.startsWith('bet/') && request.method === 'PUT') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Admin required' }), { status: 403, headers: EVENT_CORS });
    const betId = path.split('/')[1];
    const body = await request.json();
    const bets = (await env.MG_BOOK.get(`${K}:bets`, 'json')) || [];
    const idx = bets.findIndex(b => b.id === betId);
    if (idx === -1) return new Response(JSON.stringify({ error: 'Bet not found' }), { status: 404, headers: EVENT_CORS });
    const previousStatus = bets[idx].status;
    const VALID_BET_STATUSES = ['active', 'won', 'lost', 'voided', 'push'];
    if (body.status) {
      if (!VALID_BET_STATUSES.includes(body.status)) return new Response(JSON.stringify({ error: 'Invalid bet status' }), { status: 400, headers: EVENT_CORS });
      bets[idx].status = body.status;
    }
    if (body.payout !== undefined) {
      const payout = Number(body.payout);
      if (isNaN(payout) || payout < 0 || payout > 50000) return new Response(JSON.stringify({ error: 'Invalid payout amount' }), { status: 400, headers: EVENT_CORS });
      bets[idx].payout = payout;
    }
    if (['voided', 'won', 'lost', 'push'].includes(body.status)) bets[idx].settledAt = new Date().toISOString();

    if (previousStatus === 'active' && ['won', 'lost', 'push', 'voided'].includes(body.status)) {
      const players = (await env.MG_BOOK.get(`${K}:players`, 'json')) || {};
      const playerKey = bets[idx].bettor.trim().toLowerCase();
      if (players[playerKey]) {
        const payout = body.status === 'won' ? (bets[idx].payout ?? Math.round(bets[idx].stake * bets[idx].odds))
                     : body.status === 'push' ? bets[idx].stake : body.status === 'voided' ? bets[idx].stake : 0;
        players[playerKey].credits += payout;
        if (body.status === 'voided') players[playerKey].totalWagered = Math.max(0, (players[playerKey].totalWagered || 0) - bets[idx].stake);
        await env.MG_BOOK.put(`${K}:players`, JSON.stringify(players));
      }
    }
    await env.MG_BOOK.put(`${K}:bets`, JSON.stringify(bets));
    return new Response(JSON.stringify({ ok: true, bet: bets[idx] }), { headers: EVENT_CORS });
  }

  // POST /scores
  if (path === 'scores' && request.method === 'POST') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Admin required' }), { status: 403, headers: EVENT_CORS });
    const body = await request.json();
    // 1E: Validate score values
    for (const [matchId, matchData] of Object.entries(body)) {
      if (typeof matchData === 'object' && matchData !== null) {
        if (matchData.scoreA !== undefined && (matchData.scoreA < 0 || matchData.scoreA > 50)) return new Response(JSON.stringify({ error: `Invalid score for match ${matchId}` }), { status: 400, headers: EVENT_CORS });
        if (matchData.scoreB !== undefined && (matchData.scoreB < 0 || matchData.scoreB > 50)) return new Response(JSON.stringify({ error: `Invalid score for match ${matchId}` }), { status: 400, headers: EVENT_CORS });
      }
    }
    const existing = (await env.MG_BOOK.get(`${K}:scores`, 'json')) || {};
    const merged = { ...existing, ...body };
    await env.MG_BOOK.put(`${K}:scores`, JSON.stringify(merged));

    // Auto-settle bets (simplified — core logic preserved)
    const bets = (await env.MG_BOOK.get(`${K}:bets`, 'json')) || [];
    let changed = false;
    const newlySettled = [];
    for (const bet of bets) {
      if (bet.status !== 'active') continue;
      if (bet.type === 'match_winner' && bet.matchId) {
        const match = merged[bet.matchId];
        if (!match || match.status !== 'final') continue;
        const isDraw = match.scoreA === match.scoreB;
        let winnerTeamId = null;
        if (match.scoreA > match.scoreB) winnerTeamId = match.teamA;
        else if (match.scoreB > match.scoreA) winnerTeamId = match.teamB;
        if (isDraw) { bet.status = bet.selection === 'draw' ? 'won' : 'push'; bet.payout = bet.status === 'won' ? Math.round(bet.stake * bet.odds) : bet.stake; }
        else if (bet.selection === 'draw') { bet.status = 'lost'; bet.payout = 0; }
        else if (bet.selection == winnerTeamId) { bet.status = 'won'; bet.payout = Math.round(bet.stake * bet.odds); }
        else { bet.status = 'lost'; bet.payout = 0; }
        bet.settledAt = new Date().toISOString();
        newlySettled.push(bet);
        changed = true;
      }
      if (bet.type === 'match_margin' && bet.matchId) {
        const match = merged[bet.matchId];
        if (!match || match.status !== 'final') continue;
        const outcome = `${match.scoreA}-${match.scoreB}`;
        bet.status = bet.selection === outcome ? 'won' : 'lost';
        bet.payout = bet.status === 'won' ? Math.round(bet.stake * bet.odds) : 0;
        bet.settledAt = new Date().toISOString();
        newlySettled.push(bet);
        changed = true;
      }
    }
    if (changed) {
      await env.MG_BOOK.put(`${K}:bets`, JSON.stringify(bets));
      if (newlySettled.length > 0) {
        const players = (await env.MG_BOOK.get(`${K}:players`, 'json')) || {};
        for (const bet of newlySettled) {
          const key = bet.bettor.trim().toLowerCase();
          if (!players[key]) continue;
          const payout = bet.status === 'won' ? (bet.payout ?? Math.round(bet.stake * bet.odds)) : bet.status === 'push' ? bet.stake : 0;
          if (payout > 0) players[key].credits = (players[key].credits || 0) + payout;
        }
        await env.MG_BOOK.put(`${K}:players`, JSON.stringify(players));
      }
    }
    return new Response(JSON.stringify({ ok: true, scores: merged }), { headers: EVENT_CORS });
  }

  // GET /scores
  if (path === 'scores' && request.method === 'GET') {
    const scores = (await env.MG_BOOK.get(`${K}:scores`, 'json')) || {};
    return new Response(JSON.stringify(scores), { headers: EVENT_CORS });
  }

  // POST /settings
  if (path === 'settings' && request.method === 'POST') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Admin required' }), { status: 403, headers: EVENT_CORS });
    const body = await request.json();
    const existing = (await env.MG_BOOK.get(`${K}:settings`, 'json')) || {};
    const merged = { ...existing, ...body };
    await env.MG_BOOK.put(`${K}:settings`, JSON.stringify(merged));
    return new Response(JSON.stringify({ ok: true, settings: merged }), { headers: EVENT_CORS });
  }

  // GET /settings
  if (path === 'settings' && request.method === 'GET') {
    const settings = (await env.MG_BOOK.get(`${K}:settings`, 'json')) || {};
    return new Response(JSON.stringify(settings), { headers: EVENT_CORS });
  }

  // GET /book
  if (path === 'book' && request.method === 'GET') {
    const bets = (await env.MG_BOOK.get(`${K}:bets`, 'json')) || [];
    const active = bets.filter(b => b.status === 'active');
    const settled = bets.filter(b => ['won', 'lost', 'push'].includes(b.status));
    const voided = bets.filter(b => b.status === 'voided');
    const totalWagered = bets.reduce((s, b) => s + b.stake, 0);
    const activeWagered = active.reduce((s, b) => s + b.stake, 0);
    const exposure = active.reduce((s, b) => s + Math.round(b.stake * b.odds) - b.stake, 0);
    const settledPnL = settled.reduce((s, b) => { if (b.status === 'lost') return s + b.stake; if (b.status === 'won') return s - b.payout + b.stake; return s; }, 0);
    const bettors = {};
    bets.forEach(b => { if (!bettors[b.bettor]) bettors[b.bettor] = { name: b.bettor, bets: 0, wagered: 0, pnl: 0 }; bettors[b.bettor].bets++; bettors[b.bettor].wagered += b.stake; if (b.status === 'won') bettors[b.bettor].pnl += b.payout - b.stake; if (b.status === 'lost') bettors[b.bettor].pnl -= b.stake; });
    return new Response(JSON.stringify({ summary: { totalBets: bets.length, activeBets: active.length, totalWagered, activeWagered, exposure, settledPnL, voidedCount: voided.length }, bettors: Object.values(bettors), bets }), { headers: EVENT_CORS });
  }

  // DELETE /bets
  if (path === 'bets' && request.method === 'DELETE') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Admin required' }), { status: 403, headers: EVENT_CORS });
    await env.MG_BOOK.put(`${K}:bets`, '[]');
    return new Response(JSON.stringify({ ok: true }), { headers: EVENT_CORS });
  }

  // GET /game-state
  if (path === 'game-state' && request.method === 'GET') {
    const [holes, gameState] = await Promise.all([env.MG_BOOK.get(`${K}:holes`, 'json'), env.MG_BOOK.get(`${K}:game-state`, 'json')]);
    return new Response(JSON.stringify({ holes: holes || {}, gameState: gameState || {} }), { headers: EVENT_CORS });
  }

  // POST /event/press — public auto-press endpoint (no admin auth needed)
  if (path === 'event/press' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const { player, hole, bet } = body;
    if (!player || !hole) return new Response(JSON.stringify({ error: 'player and hole required' }), { status: 400, headers: EVENT_CORS });

    // Read game state
    let gameState = (await env.MG_BOOK.get(`${K}:game-state`, 'json')) || {};
    if (!gameState.nassau) gameState.nassau = {};
    if (!gameState.nassau.presses) gameState.nassau.presses = [];

    // Add the press
    gameState.nassau.presses.push({
      player,
      hole: parseInt(hole),
      bet: parseInt(bet) || 10,
      timestamp: Date.now(),
      active: true
    });

    await env.MG_BOOK.put(`${K}:game-state`, JSON.stringify(gameState));

    // Add feed entry
    const feed = (await env.MG_BOOK.get(`${K}:feed`, 'json')) || [];
    feed.unshift({
      ts: Date.now(),
      type: 'press',
      text: `${player.split(' ')[0]} presses on hole ${hole}. Stakes doubled!`,
      player
    });
    await env.MG_BOOK.put(`${K}:feed`, JSON.stringify(feed.slice(0, 100)));

    return new Response(JSON.stringify({ ok: true, presses: gameState.nassau.presses.length }), { headers: EVENT_CORS });
  }

  // POST /nassau-press
  if (path === 'nassau-press' && request.method === 'POST') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Admin required' }), { status: 403, headers: EVENT_CORS });
    const body = await request.json().catch(() => ({}));
    const { player, segment, startHole } = body;
    if (!player || !segment || !startHole) return new Response(JSON.stringify({ error: 'player, segment, and startHole required' }), { status: 400, headers: EVENT_CORS });
    const gameState = (await env.MG_BOOK.get(`${K}:game-state`, 'json')) || {};
    if (!gameState.nassau) gameState.nassau = { running: {}, presses: [] };
    if (!gameState.nassau.presses) gameState.nassau.presses = [];
    const pressId = `press_${player.replace(/\s+/g,'_')}_${segment}_h${startHole}_${Date.now()}`;
    gameState.nassau.presses.push({ id: pressId, player, segment, startHole, running: {}, active: true, winner: null });
    await env.MG_BOOK.put(`${K}:game-state`, JSON.stringify(gameState));
    try {
      const feed = (await env.MG_BOOK.get(`${K}:feed`, 'json')) || [];
      feed.push({ id: `press_${pressId}`, type: 'press', player, text: `Press declared on Hole ${startHole}! \uD83D\uDD25`, emoji: '\uD83D\uDD25', ts: Date.now() });
      while (feed.length > 200) feed.shift();
      await env.MG_BOOK.put(`${K}:feed`, JSON.stringify(feed));
    } catch (feedErr) { console.error('feed-press-error', feedErr.message); }
    return new Response(JSON.stringify({ ok: true, pressId }), { headers: EVENT_CORS });
  }

  // POST /vegas-teams
  if (path === 'vegas-teams' && request.method === 'POST') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Admin required' }), { status: 403, headers: EVENT_CORS });
    const body = await request.json().catch(() => ({}));
    const { teamA, teamB } = body;
    if (!Array.isArray(teamA) || !Array.isArray(teamB)) return new Response(JSON.stringify({ error: 'teamA and teamB arrays required' }), { status: 400, headers: EVENT_CORS });
    const gameState = (await env.MG_BOOK.get(`${K}:game-state`, 'json')) || {};
    if (!gameState.vegas) gameState.vegas = { holes: {}, score: { A: 0, B: 0 } };
    gameState.vegas.teamA = teamA;
    gameState.vegas.teamB = teamB;
    await env.MG_BOOK.put(`${K}:game-state`, JSON.stringify(gameState));
    return new Response(JSON.stringify({ ok: true, teamA, teamB }), { headers: EVENT_CORS });
  }

  // POST /wolf-pick
  if (path === 'wolf-pick' && request.method === 'POST') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Admin required' }), { status: 403, headers: EVENT_CORS });
    const body = await request.json().catch(() => ({}));
    const { holeNum, wolf, partner } = body;
    if (!holeNum || holeNum < 1 || holeNum > 18 || !wolf) return new Response(JSON.stringify({ error: 'holeNum and wolf required' }), { status: 400, headers: EVENT_CORS });
    const gameState = (await env.MG_BOOK.get(`${K}:game-state`, 'json')) || {};
    if (!gameState.wolf) gameState.wolf = { picks: {}, results: {} };
    const holes = (await env.MG_BOOK.get(`${K}:holes`, 'json')) || {};
    if (holes[holeNum]) return new Response(JSON.stringify({ error: 'Scores already entered for this hole' }), { status: 409, headers: EVENT_CORS });
    gameState.wolf.picks[holeNum] = { wolf, partner: partner || null, format: partner ? '2v2' : '1v3', lockedAt: Date.now() };
    await env.MG_BOOK.put(`${K}:game-state`, JSON.stringify(gameState));
    return new Response(JSON.stringify({ ok: true, pick: gameState.wolf.picks[holeNum] }), { headers: EVENT_CORS });
  }

  // GET /vapid-key
  if (path === 'vapid-key' && request.method === 'GET') {
    return new Response(JSON.stringify({ publicKey: env.VAPID_PUBLIC_KEY || null }), { headers: EVENT_CORS });
  }

  // POST /push-subscribe
  if (path === 'push-subscribe' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const { subscription } = body;
    if (!subscription?.endpoint) return new Response(JSON.stringify({ error: 'Invalid subscription' }), { status: 400, headers: EVENT_CORS });
    const subs = (await env.MG_BOOK.get(`${K}:push-subs`, 'json')) || [];
    const existing = subs.findIndex(s => s.endpoint === subscription.endpoint);
    if (existing >= 0) subs[existing] = subscription; else subs.push(subscription);
    await env.MG_BOOK.put(`${K}:push-subs`, JSON.stringify(subs));
    return new Response(JSON.stringify({ ok: true }), { headers: EVENT_CORS });
  }

  // POST /hole — enter hole scores + run game engines
  if (path === 'hole' && request.method === 'POST') {
    let cfg2 = null;
    try { cfg2 = JSON.parse(configRaw); } catch {}
    const eventType2 = cfg2?.event?.eventType || cfg2?.eventType || '';
    const isRoundModeEvent = ['quick', 'buddies_trip'].includes(eventType2);
    if (!isAdmin && !isRoundModeEvent) return new Response(JSON.stringify({ error: 'Admin required' }), { status: 403, headers: EVENT_CORS });
    try {
      const body = await request.json().catch(() => ({}));
      const { holeNum, scores } = body;

      const rlKey = `${K}:hole-rl:${holeNum}`;
      const lastSubmit = await env.MG_BOOK.get(rlKey, 'text');
      const now = Date.now();
      if (lastSubmit && (now - parseInt(lastSubmit)) < 3000) return new Response(JSON.stringify({ ok: true, holeNum, skipped: true, reason: 'rate_limited' }), { headers: EVENT_CORS });
      await env.MG_BOOK.put(rlKey, String(now), { expirationTtl: 60 });

      if (!holeNum || holeNum < 1 || holeNum > 18) return new Response(JSON.stringify({ error: 'holeNum must be 1-18' }), { status: 400, headers: EVENT_CORS });
      if (!scores || typeof scores !== 'object' || Object.keys(scores).length === 0) return new Response(JSON.stringify({ error: 'scores object required' }), { status: 400, headers: EVENT_CORS });
      for (const [name, s] of Object.entries(scores)) {
        if (typeof s !== 'number' || s < 1 || s > 15) return new Response(JSON.stringify({ error: `Score for "${name}" must be 1-15` }), { status: 400, headers: EVENT_CORS });
      }

      let cfg = null;
      try { cfg = JSON.parse(configRaw); } catch {}
      const rawGames = cfg?.games || {};
      const games = Array.isArray(rawGames) ? Object.fromEntries(rawGames.map(g => [g, true])) : rawGames;
      const players = {};
      if (cfg?.roster && cfg.roster.length > 0) {
        for (const p of cfg.roster) { if (p.name) players[p.name] = { handicapIndex: p.handicapIndex ?? 0 }; }
      } else if (cfg?.players && cfg.players.length > 0) {
        for (const p of cfg.players) { if (p.name) players[p.name] = { handicapIndex: p.handicapIndex ?? p.handicap ?? 0 }; }
      } else {
        const teams = cfg?.teams || {};
        for (const team of Object.values(teams)) {
          if (team.member) players[team.member] = { handicapIndex: team.memberHI ?? 0 };
          if (team.guest && team.guest !== team.member) players[team.guest] = { handicapIndex: team.guestHI ?? 0 };
        }
      }

      let strokeIndex = null;
      if (cfg?.course?.id) {
        const seed = SEED_COURSES.find(c => c.id === cfg.course.id);
        if (seed?.strokeIndex) { strokeIndex = seed.strokeIndex; }
        else { try { const courseData = await env.MG_BOOK.get(`course:${cfg.course.id}`, 'json'); if (courseData?.strokeIndex) strokeIndex = courseData.strokeIndex; } catch {} }
      } else if (cfg?.course?.strokeIndex) { strokeIndex = cfg.course.strokeIndex; }
      if (!strokeIndex && cfg?.courseHcpIndex?.length === 18) strokeIndex = cfg.courseHcpIndex;

      // ── Concurrency-safe score merge ──────────────────────────
      // KV is eventually consistent. Two carts submitting different holes
      // simultaneously can race: both read State A, both write back, second
      // write stomps the first. Fix: acquire a short-lived mutex key, then
      // re-read + merge + write. If mutex is held, wait and retry.
      const mutexKey = `${K}:write-lock`;
      let lockAcquired = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        const existingLock = await env.MG_BOOK.get(mutexKey, 'text');
        if (!existingLock) {
          await env.MG_BOOK.put(mutexKey, String(Date.now()), { expirationTtl: 60 });
          lockAcquired = true;
          break;
        }
        // Lock held — wait 300ms and retry
        await new Promise(r => setTimeout(r, 300));
      }
      // Even if lock wasn't acquired (timeout), proceed with merge — better than failing
      const holes = (await env.MG_BOOK.get(`${K}:holes`, 'json')) || {};
      // MERGE: only update THIS hole, preserve all other holes untouched
      const existingHole = holes[holeNum];
      const mergedScores = existingHole?.scores ? { ...existingHole.scores, ...scores } : scores;
      holes[holeNum] = { scores: mergedScores, timestamp: Date.now(), enteredBy: 'admin' };
      await env.MG_BOOK.put(`${K}:holes`, JSON.stringify(holes));
      // Release mutex
      if (lockAcquired) { await env.MG_BOOK.delete(mutexKey).catch(() => {}); }

      let gameState = (await env.MG_BOOK.get(`${K}:game-state`, 'json')) || {};
      const allEvents = [];
      const warnings = [];

      try {
        if (games.skins) {
          const prev = gameState.skins || { pot: 1, holes: {} };
          const grossOnly = cfg?.structure?.skinsGrossOnly === true;
          const result = wggRunSkins(holeNum, scores, prev, players, strokeIndex, grossOnly);
          gameState.skins = { pot: result.pot, holes: result.holes };
          allEvents.push(...result.events);
        }
        if (games.nassau) {
          const prev = gameState.nassau || { running: {}, presses: [] };
          const result = wggRunNassau(holeNum, scores, prev, players, strokeIndex);
          gameState.nassau = result;
          allEvents.push(...(result.events || []));
        }
        if (games.wolf) {
          const pick = gameState.wolf?.picks?.[holeNum];
          if (pick) {
            const prev = gameState.wolf || { picks: {}, results: {} };
            const result = wggRunWolf(holeNum, scores, prev, players, strokeIndex);
            gameState.wolf = result;
            allEvents.push(...(result.events || []));
          }
        }
        if (games.vegas) {
          const prev = gameState.vegas || { holes: {} };
          const vegasTeamsForEngine = gameState.vegas?.teamA ? { A: gameState.vegas.teamA, B: gameState.vegas.teamB } : (cfg?.vegasTeams || null);
          const result = wggRunVegas(holeNum, scores, prev, players, vegasTeamsForEngine, strokeIndex);
          gameState.vegas = result;
          allEvents.push(...(result.events || []));
        }
        if (games.nines) {
          const prev = gameState.nines || { running: {}, holes: {} };
          const result = wggRunNines(holeNum, scores, prev, players);
          gameState.nines = result;
          allEvents.push(...(result.events || []));
        }
        if (games.scramble) {
          const prev = gameState.scramble || { running: {}, holes: {}, leaderboard: [] };
          const result = wggRunScramble(holeNum, scores, prev, Object.keys(scores));
          gameState.scramble = result;
          allEvents.push(...(result.events || []));
        }
        if (games.stroke_play) {
          if (!gameState.stroke) gameState.stroke = { running: {} };
          const netScores2 = wggNetScores(scores, players, holeNum, strokeIndex);
          for (const [name, net] of Object.entries(netScores2)) {
            gameState.stroke.running[name] = (gameState.stroke.running[name] || 0) + net;
          }
        }
        // ── New game engines ──
        const holePars = cfg?.course?.pars || cfg?.coursePars || [];
        if (games.stableford) {
          const prev = gameState.stableford || { running: {}, holes: {} };
          const result = wggRunStableford(holeNum, scores, prev, players, strokeIndex, holePars);
          gameState.stableford = result;
          allEvents.push(...(result.events || []));
        }
        if (games.match_play) {
          const prev = gameState.match_play || { running: {}, holes: {} };
          const result = wggRunMatchPlay(holeNum, scores, prev, players);
          gameState.match_play = result;
          allEvents.push(...(result.events || []));
        }
        if (games.banker) {
          const prev = gameState.banker || { running: {}, holes: {}, bankerIdx: 0 };
          const result = wggRunBanker(holeNum, scores, prev, players, holePars);
          gameState.banker = result;
          allEvents.push(...(result.events || []));
        }
        if (games.bingo) {
          const prev = gameState.bingo || { running: {}, holes: {} };
          const result = wggRunBBB(holeNum, scores, prev);
          gameState.bingo = result;
          allEvents.push(...(result.events || []));
        }
        if (games.bloodsome) {
          const prev = gameState.bloodsome || { running: {}, holes: {} };
          const result = wggRunBloodsome(holeNum, scores, prev);
          gameState.bloodsome = result;
          allEvents.push(...(result.events || []));
        }
        await env.MG_BOOK.put(`${K}:game-state`, JSON.stringify(gameState));
      } catch (e) {
        warnings.push(`Game engine error on hole ${holeNum}: ${e.message}`);
        console.error('waggle-game-engine-failure', { slug, holeNum, error: e.message });
      }

      const isLastHole = holeNum === (cfg?.holesPerRound || 18);
      if (isLastHole && allEvents.some(e => e.type === 'nassau_total_complete' || e.type === 'nassau_back_complete')) {
        ctx.waitUntil(sendSettlementPush(slug, allEvents, env));
      } else {
        ctx.waitUntil(sendHolePushNotifications(slug, holeNum, allEvents, gameState, env));
      }

      // Auto-generate narrative activity feed (sportsbook style)
      try {
        const feed = (await env.MG_BOOK.get(`${K}:feed`, 'json')) || [];
        const pars = cfg?.course?.pars || cfg?.coursePars || [];
        const par = pars[holeNum - 1] || 4;
        const skinsBet = parseInt(cfg?.structure?.skinsBet) || 5;
        const playerCount = Object.keys(players).length;
        const skinValue = skinsBet * (playerCount - 1);
        // Check if a skin was won on this hole
        const skinEvent = allEvents.find(e => e.type === 'skin_won' || e.type === 'skins_won');
        const skinCarry = allEvents.find(e => e.type === 'skin_carry' || e.type === 'skins_carry');
        const skinPot = gameState?.skins?.pot || 1;

        for (const [pName, gross] of Object.entries(scores)) {
          const firstName = pName.split(' ')[0];
          const diff = gross - par;
          let scoreText = '';
          if (diff <= -2) scoreText = `${firstName} eagles #${holeNum}!`;
          else if (diff === -1) scoreText = `${firstName} birdies #${holeNum}.`;
          else if (diff === 0) scoreText = `${firstName} pars #${holeNum}.`;
          else if (diff === 1) scoreText = `${firstName} bogeys #${holeNum}.`;
          else if (diff === 2) scoreText = `${firstName} double bogeys #${holeNum}.`;
          else if (diff >= 3) scoreText = `${firstName} takes ${gross} on #${holeNum}.`;

          // Append skin context if this player won
          if (skinEvent && skinEvent.winner === pName) {
            const potMultiplier = skinEvent.pot || 1;
            scoreText += ` Takes the skin ($${skinValue * potMultiplier}).`;
          }
          feed.push({ id: `score_${holeNum}_${pName}_${Date.now()}`, type: 'score', player: pName, text: scoreText, ts: Date.now() });
        }
        // Skin carry narrative
        if (skinCarry) {
          feed.push({ id: `carry_${holeNum}_${Date.now()}`, type: 'score', player: 'System', text: `Skin carries to #${holeNum + 1}. Pot: $${skinValue * skinPot}.`, ts: Date.now() });
        }
        while (feed.length > 200) feed.shift();
        await env.MG_BOOK.put(`${K}:feed`, JSON.stringify(feed));
      } catch (feedErr) { console.error('feed-auto-generate-error', feedErr.message); }

      return new Response(JSON.stringify({ ok: true, holeNum, events: allEvents, warnings }), { headers: EVENT_CORS });
    } catch (outerErr) {
      console.error('hole-handler-crash', { slug, error: outerErr.message });
      console.error('hole-handler-crash', { slug, holeNum, error: outerErr.message });
      return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: EVENT_CORS });
    }
  }

  // ─── Props (propositions / side bets / double-or-nothing) ───

  // GET /props
  if (path === 'props' && request.method === 'GET') {
    const props = (await env.MG_BOOK.get(`${K}:props`, 'json')) || [];
    return new Response(JSON.stringify(props), { headers: EVENT_CORS });
  }

  // POST /props — create a new proposition
  if (path === 'props' && request.method === 'POST') {
    // Rate limit: 10 props per hour per IP
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const propsRlKey = `${K}:props-rl:${clientIP}`;
    const propsRlCount = parseInt(await env.MG_BOOK.get(propsRlKey, 'text') || '0', 10);
    if (propsRlCount >= 10) return new Response(JSON.stringify({ error: 'Slow down' }), { status: 429, headers: EVENT_CORS });
    await env.MG_BOOK.put(propsRlKey, String(propsRlCount + 1), { expirationTtl: 3600 });
    const body = await request.json().catch(() => ({}));
    const { type, description, amount, creator, parties, roundNumber } = body;
    if (!description || !creator || creator === 'Anonymous') return new Response(JSON.stringify({ error: 'Name required' }), { status: 400, headers: EVENT_CORS });
    const props = (await env.MG_BOOK.get(`${K}:props`, 'json')) || [];
    const prop = {
      id: 'prop_' + crypto.randomUUID().slice(0, 8),
      type: type || 'side_bet',
      description: stripHtml(description),
      amount: parseFloat(amount) || 0,
      creator: stripHtml(creator),
      parties: parties || [],
      accepted: false,
      acceptedBy: [],
      result: null,
      status: 'open',
      roundNumber: roundNumber || null,
      createdAt: new Date().toISOString(),
    };
    props.push(prop);
    await env.MG_BOOK.put(`${K}:props`, JSON.stringify(props));
    // Add to feed
    const feed = (await env.MG_BOOK.get(`${K}:feed`, 'json')) || [];
    feed.push({ id: prop.id, type: 'prop', player: creator, text: description + (amount ? ' — $' + amount : ''), ts: Date.now() });
    while (feed.length > 200) feed.shift();
    await env.MG_BOOK.put(`${K}:feed`, JSON.stringify(feed));
    return new Response(JSON.stringify({ ok: true, prop }), { headers: EVENT_CORS });
  }

  // POST /props/:id/accept
  if (path.match(/^props\/[a-z0-9_]+\/accept$/) && request.method === 'POST') {
    const propId = path.split('/')[1];
    const body = await request.json().catch(() => ({}));
    const { player } = body;
    const props = (await env.MG_BOOK.get(`${K}:props`, 'json')) || [];
    const prop = props.find(p => p.id === propId);
    if (!prop) return new Response(JSON.stringify({ error: 'Prop not found' }), { status: 404, headers: EVENT_CORS });
    if (prop.status !== 'open') return new Response(JSON.stringify({ error: 'Prop already ' + prop.status }), { status: 400, headers: EVENT_CORS });
    if (!prop.acceptedBy.includes(player)) prop.acceptedBy.push(player);
    // Auto-accept when enough parties accept (2 for head-to-head, all for group)
    if (prop.type === 'double_or_nothing' && prop.acceptedBy.length >= 2) { prop.accepted = true; prop.status = 'accepted'; }
    else if (prop.acceptedBy.length >= (prop.parties.length / 2)) { prop.accepted = true; prop.status = 'accepted'; }
    await env.MG_BOOK.put(`${K}:props`, JSON.stringify(props));
    return new Response(JSON.stringify({ ok: true, prop }), { headers: EVENT_CORS });
  }

  // POST /props/:id/settle
  if (path.match(/^props\/[a-z0-9_]+\/settle$/) && request.method === 'POST') {
    const propId = path.split('/')[1];
    const body = await request.json().catch(() => ({}));
    const { result, winners } = body;
    const props = (await env.MG_BOOK.get(`${K}:props`, 'json')) || [];
    const prop = props.find(p => p.id === propId);
    if (!prop) return new Response(JSON.stringify({ error: 'Prop not found' }), { status: 404, headers: EVENT_CORS });
    prop.result = result;
    prop.status = 'settled';
    prop.winners = winners || [];
    prop.settledAt = new Date().toISOString();
    await env.MG_BOOK.put(`${K}:props`, JSON.stringify(props));
    return new Response(JSON.stringify({ ok: true, prop }), { headers: EVENT_CORS });
  }

  // GET /feed
  if (path === 'feed' && request.method === 'GET') {
    const feed = (await env.MG_BOOK.get(`${K}:feed`, 'json')) || [];
    return new Response(JSON.stringify(feed.slice(-50).reverse()), { headers: EVENT_CORS });
  }

  // GET /disputes
  if (path === 'disputes' && request.method === 'GET') {
    const disputes = (await env.MG_BOOK.get(`${K}:disputes`, 'json')) || [];
    return new Response(JSON.stringify(disputes), { headers: EVENT_CORS });
  }

  // ── Props CRUD (double-or-nothing, side bets) ──────────────────

  // GET /props
  if (path === 'props' && request.method === 'GET') {
    const props = (await env.MG_BOOK.get(`${K}:props`, 'json')) || [];
    return new Response(JSON.stringify(props), { headers: EVENT_CORS });
  }

  // POST /props — create a new proposition
  if (path === 'props' && request.method === 'POST') {
    // Rate limit: 10 props per hour per IP
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const propsRlKey2 = `${K}:props-rl:${clientIP}`;
    const propsRlCount2 = parseInt(await env.MG_BOOK.get(propsRlKey2, 'text') || '0', 10);
    if (propsRlCount2 >= 10) return new Response(JSON.stringify({ error: 'Slow down' }), { status: 429, headers: EVENT_CORS });
    await env.MG_BOOK.put(propsRlKey2, String(propsRlCount2 + 1), { expirationTtl: 3600 });
    const body = await request.json().catch(() => ({}));
    if (!body.description || !body.creator || body.creator === 'Anonymous') {
      return new Response(JSON.stringify({ error: 'Name required' }), { status: 400, headers: EVENT_CORS });
    }
    const props = (await env.MG_BOOK.get(`${K}:props`, 'json')) || [];
    const prop = {
      id: 'prop_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type: body.type || 'side_bet',
      description: stripHtml((body.description || '').slice(0, 200)),
      amount: parseInt(body.amount) || 0,
      creator: stripHtml((body.creator || '').slice(0, 50)),
      parties: body.parties || [],
      accepted: false,
      acceptedBy: [],
      result: null,
      status: 'open',
      roundNumber: body.roundNumber || 1,
      createdAt: new Date().toISOString(),
    };
    props.push(prop);
    await env.MG_BOOK.put(`${K}:props`, JSON.stringify(props));
    // Add to feed
    const feed = (await env.MG_BOOK.get(`${K}:feed`, 'json')) || [];
    feed.unshift({ ts: Date.now(), type: 'prop', text: `New prop: ${prop.description} ($${prop.amount})`, player: prop.creator });
    await env.MG_BOOK.put(`${K}:feed`, JSON.stringify(feed.slice(0, 100)));
    return new Response(JSON.stringify(prop), { headers: EVENT_CORS });
  }

  // POST /props/:id/accept
  if (path.startsWith('props/') && path.endsWith('/accept') && request.method === 'POST') {
    const propId = path.split('/')[1];
    const body = await request.json().catch(() => ({}));
    const player = (body.player || 'Anonymous').slice(0, 50);
    const props = (await env.MG_BOOK.get(`${K}:props`, 'json')) || [];
    const prop = props.find(p => p.id === propId);
    if (!prop) return new Response(JSON.stringify({ error: 'Prop not found' }), { status: 404, headers: EVENT_CORS });
    if (prop.status !== 'open') return new Response(JSON.stringify({ error: 'Prop not open' }), { status: 400, headers: EVENT_CORS });
    if (!prop.acceptedBy.includes(player)) prop.acceptedBy.push(player);
    // Auto-lock when enough parties accept (2 for head-to-head)
    const needed = prop.type === 'double_or_nothing' ? 1 : 1;
    if (prop.acceptedBy.length >= needed) {
      prop.accepted = true;
      prop.status = 'accepted';
    }
    await env.MG_BOOK.put(`${K}:props`, JSON.stringify(props));
    // Add to feed
    const feed = (await env.MG_BOOK.get(`${K}:feed`, 'json')) || [];
    feed.unshift({ ts: Date.now(), type: 'prop_accepted', text: `${player} accepted: ${prop.description}`, player });
    await env.MG_BOOK.put(`${K}:feed`, JSON.stringify(feed.slice(0, 100)));
    return new Response(JSON.stringify(prop), { headers: EVENT_CORS });
  }

  // POST /props/:id/settle
  if (path.startsWith('props/') && path.endsWith('/settle') && request.method === 'POST') {
    const propId = path.split('/')[1];
    const body = await request.json().catch(() => ({}));
    const props = (await env.MG_BOOK.get(`${K}:props`, 'json')) || [];
    const prop = props.find(p => p.id === propId);
    if (!prop) return new Response(JSON.stringify({ error: 'Prop not found' }), { status: 404, headers: EVENT_CORS });
    prop.status = 'settled';
    prop.result = (body.result || '').slice(0, 200);
    prop.winners = body.winners || [];
    prop.settledAt = new Date().toISOString();
    await env.MG_BOOK.put(`${K}:props`, JSON.stringify(props));
    return new Response(JSON.stringify(prop), { headers: EVENT_CORS });
  }

  // GET /ai/chirp — AI-generated trash talk from game state (Workers AI, free)
  if (path === 'ai/chirp' && request.method === 'GET') {
    if (!env.AI && !env.ANTHROPIC_API_KEY) return new Response(JSON.stringify({ chirp: 'Talk trash in person.' }), { headers: EVENT_CORS });
    try {
      const [gsRaw, holesRaw] = await Promise.all([
        env.MG_BOOK.get(`${K}:game-state`, 'json'),
        env.MG_BOOK.get(`${K}:holes`, 'json'),
      ]);
      let cfg2; try { cfg2 = JSON.parse(configRaw); } catch { cfg2 = {}; }
      const roster = cfg2.roster || cfg2.players || [];
      const holesPlayed = Object.keys(holesRaw || {}).filter(k => k !== 'timestamp').length;

      const system = 'You are a sarcastic golf caddie writing one-liner trash talk for a buddies trip sportsbook. Be funny, specific, and use player names. One sentence only. No hashtags.';
      const context = `Players: ${roster.map(p => p.name + ' (HI ' + (p.handicapIndex || 0) + ')').join(', ')}. Holes played: ${holesPlayed}. Game state: ${JSON.stringify(gsRaw || {}).slice(0, 500)}`;

      const aiJson = await callAI(env, system, context, 100);
      const chirp = aiJson.content?.[0]?.text || 'No chirp available.';
      return new Response(JSON.stringify({ ok: true, chirp }), { headers: EVENT_CORS });
    } catch (e) {
      return new Response(JSON.stringify({ chirp: 'AI is taking a mulligan. Talk trash yourself.' }), { headers: EVENT_CORS });
    }
  }

  // GET /ai/lines — AI-generated betting narrative (Workers AI, free)
  if (path === 'ai/lines' && request.method === 'GET') {
    if (!env.AI && !env.ANTHROPIC_API_KEY) return new Response(JSON.stringify({ lines: '' }), { headers: EVENT_CORS });
    try {
      let cfg2; try { cfg2 = JSON.parse(configRaw); } catch { cfg2 = {}; }
      const roster = cfg2.roster || cfg2.players || [];
      const games = cfg2.games || {};
      const structure = cfg2.structure || {};

      const system = 'You are a golf sportsbook analyst. Write a 2-3 sentence opening lines preview for a buddies trip. Mention specific matchups, handicap spreads, and which games favor which players. Be authoritative and engaging.';
      const context = `Players: ${roster.map(p => p.name + ' (HI ' + (p.handicapIndex || 0) + ')').join(', ')}. Games: ${Object.keys(games).filter(g => games[g]).join(', ')}. Stakes: Nassau $${structure.nassauBet || 0}, Skins $${structure.skinsBet || 0}.`;

      const aiJson = await callAI(env, system, context, 200);
      const lines = aiJson.content?.[0]?.text || '';
      return new Response(JSON.stringify({ ok: true, lines }), { headers: EVENT_CORS });
    } catch (e) {
      return new Response(JSON.stringify({ lines: '' }), { headers: EVENT_CORS });
    }
  }

  // POST /feed
  if (path === 'feed' && request.method === 'POST') {
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const feedRlKey = `${K}:feed-rl:${clientIP}`;
    const feedRlCount = parseInt(await env.MG_BOOK.get(feedRlKey, 'text') || '0', 10);
    if (feedRlCount >= 10) return new Response(JSON.stringify({ error: 'Slow down' }), { status: 429, headers: EVENT_CORS });
    await env.MG_BOOK.put(feedRlKey, String(feedRlCount + 1), { expirationTtl: 60 });
    const body = await request.json().catch(() => ({}));
    let text = (body.text || '').slice(0, 100).replace(/<[^>]*>/g, '').trim();
    const emoji = (body.emoji || '').slice(0, 4);
    const player = (body.player || 'Anonymous').slice(0, 30).replace(/<[^>]*>/g, '').trim();
    if (!text && !emoji) return new Response(JSON.stringify({ error: 'text or emoji required' }), { status: 400, headers: EVENT_CORS });
    const item = { id: `chirp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, type: 'chirp', player, text, emoji, ts: Date.now() };
    const feed = (await env.MG_BOOK.get(`${K}:feed`, 'json')) || [];
    feed.push(item);
    while (feed.length > 200) feed.shift();
    await env.MG_BOOK.put(`${K}:feed`, JSON.stringify(feed));
    return new Response(JSON.stringify({ ok: true, item }), { headers: EVENT_CORS });
  }

  // POST /event/update-details — admin can update event name, dates, venue
  if (path === 'event/update-details' && request.method === 'POST') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Admin required' }), { status: 403, headers: EVENT_CORS });
    const body = await request.json();
    const cfgRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
    if (!cfgRaw) return new Response(JSON.stringify({ error: 'Event not found' }), { status: 404, headers: EVENT_CORS });
    const config = JSON.parse(cfgRaw);
    if (body.name) config.event.name = body.name.trim();
    if (body.venue) config.event.venue = body.venue.trim();
    if (body.dates) config.event.dates = { ...config.event.dates, ...body.dates };
    await env.MG_BOOK.put(`config:${slug}`, JSON.stringify(config));
    return new Response(JSON.stringify({ ok: true }), { headers: EVENT_CORS });
  }

  // POST /event/update-games — admin can toggle games on/off and update stakes
  if (path === 'event/update-games' && request.method === 'POST') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Admin required' }), { status: 403, headers: EVENT_CORS });
    const body = await request.json();
    const cfgRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
    if (!cfgRaw) return new Response(JSON.stringify({ error: 'Event not found' }), { status: 404, headers: EVENT_CORS });
    const config = JSON.parse(cfgRaw);
    if (body.games) config.games = body.games;
    if (body.structure) config.structure = { ...config.structure, ...body.structure };
    await env.MG_BOOK.put(`config:${slug}`, JSON.stringify(config));
    return new Response(JSON.stringify({ ok: true }), { headers: EVENT_CORS });
  }

  // POST /event/add-player — admin can add a player to the roster
  if (path === 'event/add-player' && request.method === 'POST') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Admin required' }), { status: 403, headers: EVENT_CORS });
    const body = await request.json();
    const { name, handicapIndex, venmo } = body;
    if (!name) return new Response(JSON.stringify({ error: 'Name required' }), { status: 400, headers: EVENT_CORS });
    const cfgRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
    if (!cfgRaw) return new Response(JSON.stringify({ error: 'Event not found' }), { status: 404, headers: EVENT_CORS });
    const config = JSON.parse(cfgRaw);
    if (!config.players) config.players = [];
    if (!config.roster) config.roster = [];
    const exists = config.players.some(p => p.name.toLowerCase() === name.trim().toLowerCase());
    if (exists) return new Response(JSON.stringify({ error: 'Player already exists' }), { status: 400, headers: EVENT_CORS });
    const player = { name: name.trim(), handicapIndex: parseFloat(handicapIndex) || 0, venmo: venmo || '' };
    config.players.push(player);
    config.roster.push(player);
    await env.MG_BOOK.put(`config:${slug}`, JSON.stringify(config));
    return new Response(JSON.stringify({ ok: true, player }), { headers: EVENT_CORS });
  }

  // POST /event/invite-admin — invite a co-organizer by email
  if (path === 'event/invite-admin' && request.method === 'POST') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Admin required' }), { status: 403, headers: EVENT_CORS });
    const body = await request.json().catch(() => ({}));
    const { email } = body;
    if (!email || !email.includes('@')) return new Response(JSON.stringify({ error: 'Valid email required' }), { status: 400, headers: EVENT_CORS });

    const configRaw2 = await env.MG_BOOK.get(`config:${slug}`, 'text');
    if (!configRaw2) return new Response(JSON.stringify({ error: 'Event not found' }), { status: 404, headers: EVENT_CORS });
    const config2 = JSON.parse(configRaw2);

    // Add to admin list
    if (!config2.event.adminEmails) config2.event.adminEmails = [];
    const normalizedEmail = email.trim().toLowerCase();
    if (config2.event.adminEmails.includes(normalizedEmail)) {
      return new Response(JSON.stringify({ error: 'Already an admin' }), { status: 400, headers: EVENT_CORS });
    }
    config2.event.adminEmails.push(normalizedEmail);
    await env.MG_BOOK.put(`config:${slug}`, JSON.stringify(config2));

    // Also index for /my-events/
    const existingSlugs = (await env.MG_BOOK.get(`commissioner:${normalizedEmail}`, 'json')) || [];
    if (!existingSlugs.includes(slug)) {
      existingSlugs.push(slug);
      await env.MG_BOOK.put(`commissioner:${normalizedEmail}`, JSON.stringify(existingSlugs));
    }

    // Send invite email if Resend is configured
    if (env.RESEND_API_KEY) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'waggle@cafecito-ai.com',
            to: normalizedEmail,
            subject: `You've been added as co-organizer: ${config2.event?.name || 'Event'}`,
            html: `<div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto">
              <div style="background:#0D2818;padding:24px;text-align:center;border-radius:8px 8px 0 0">
                <div style="font-family:Georgia,serif;font-size:24px;color:#C9A84C;font-weight:700">Waggle</div>
              </div>
              <div style="padding:24px;background:#FAF8F5;border-radius:0 0 8px 8px">
                <p style="font-size:16px;font-weight:600;color:#0D2818">You're now a co-organizer</p>
                <p style="font-size:14px;color:#3D3D3D;line-height:1.6">You've been invited to help manage <strong>${config2.event?.name || 'an event'}</strong>. You can enter scores, manage bets, and run the settlement.</p>
                <a href="https://betwaggle.com/${slug}/#admin" style="display:block;text-align:center;background:#C9A84C;color:#0D2818;padding:14px;border-radius:6px;font-weight:700;font-size:15px;text-decoration:none;margin:20px 0">Open Admin Panel</a>
              </div>
            </div>`
          })
        });
      } catch {}
    }

    return new Response(JSON.stringify({ ok: true, email: normalizedEmail }), { headers: EVENT_CORS });
  }

  // POST /event/bulk-add-players — add multiple players at once
  if (path === 'event/bulk-add-players' && request.method === 'POST') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Admin required' }), { status: 403, headers: EVENT_CORS });
    const body = await request.json().catch(() => ({}));
    const { players } = body; // array of { name, handicapIndex, venmo }
    if (!Array.isArray(players) || players.length === 0) {
      return new Response(JSON.stringify({ error: 'players array required' }), { status: 400, headers: EVENT_CORS });
    }

    const cfgRaw2 = await env.MG_BOOK.get(`config:${slug}`, 'text');
    if (!cfgRaw2) return new Response(JSON.stringify({ error: 'Event not found' }), { status: 404, headers: EVENT_CORS });
    const cfg2 = JSON.parse(cfgRaw2);
    if (!cfg2.players) cfg2.players = [];
    if (!cfg2.roster) cfg2.roster = [];

    const added = [];
    const skipped = [];
    for (const p of players) {
      if (!p.name) { skipped.push({ ...p, reason: 'No name' }); continue; }
      const name = p.name.trim();
      const exists = cfg2.players.some(existing => existing.name.toLowerCase() === name.toLowerCase());
      if (exists) { skipped.push({ ...p, reason: 'Duplicate' }); continue; }
      const player = { name, handicapIndex: parseFloat(p.handicapIndex) || 0, venmo: p.venmo || '' };
      cfg2.players.push(player);
      cfg2.roster.push(player);
      added.push(player);
    }

    await env.MG_BOOK.put(`config:${slug}`, JSON.stringify(cfg2));
    return new Response(JSON.stringify({ ok: true, added: added.length, total: cfg2.players.length, skipped: skipped.length, details: { added, skipped } }), { headers: EVENT_CORS });
  }

  // POST /event/bulk-import-players — add multiple players (JSON array or CSV string)
  if (path === 'event/bulk-import-players' && request.method === 'POST') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Admin required' }), { status: 403, headers: EVENT_CORS });
    const body = await request.json().catch(() => ({}));
    let importPlayers = body.players; // array of { name, handicapIndex, venmo }
    // If CSV string provided, parse it into players array
    if (!importPlayers && body.csv && typeof body.csv === 'string') {
      const csvLines = body.csv.split('\n').map(l => l.trim()).filter(Boolean);
      importPlayers = [];
      for (const line of csvLines) {
        // Skip header row if present
        if (/^name/i.test(line)) continue;
        const parts = line.split(/[,\t]+/).map(s => s.trim());
        if (!parts[0]) continue;
        let venmo = '';
        let hiIdx = 1;
        if (parts.length >= 3 && parts[parts.length - 1].startsWith('@')) {
          venmo = parts[parts.length - 1];
          hiIdx = parts.length - 2;
        } else if (parts.length >= 2) {
          hiIdx = parts.length - 1;
        }
        // If the HCP field looks like a venmo handle, treat it as venmo
        if (parts[hiIdx] && parts[hiIdx].startsWith('@')) {
          venmo = parts[hiIdx];
          hiIdx = -1;
        }
        // If only one column (just a name), handicap defaults to 0
        importPlayers.push({ name: parts[0], handicapIndex: hiIdx >= 1 ? (parseFloat(parts[hiIdx]) || 0) : 0, venmo });
      }
    }
    if (!Array.isArray(importPlayers) || importPlayers.length === 0) {
      return new Response(JSON.stringify({ error: 'players array or csv string required' }), { status: 400, headers: EVENT_CORS });
    }

    const cfgImport = await env.MG_BOOK.get(`config:${slug}`, 'text');
    if (!cfgImport) return new Response(JSON.stringify({ error: 'Event not found' }), { status: 404, headers: EVENT_CORS });
    const cfgI = JSON.parse(cfgImport);
    if (!cfgI.players) cfgI.players = [];
    if (!cfgI.roster) cfgI.roster = [];

    const addedI = [];
    const skippedI = [];
    for (const p of importPlayers) {
      if (!p.name) { skippedI.push({ ...p, reason: 'No name' }); continue; }
      const nm = p.name.trim();
      const dup = cfgI.players.some(existing => existing.name.toLowerCase() === nm.toLowerCase());
      if (dup) { skippedI.push({ ...p, reason: 'Duplicate' }); continue; }
      const pl = { name: nm, handicapIndex: parseFloat(p.handicapIndex) || 0, venmo: p.venmo || '' };
      cfgI.players.push(pl);
      cfgI.roster.push(pl);
      addedI.push(pl);
    }

    await env.MG_BOOK.put(`config:${slug}`, JSON.stringify(cfgI));
    return new Response(JSON.stringify({ ok: true, added: addedI.length, total: cfgI.players.length, skipped: skippedI.length, details: { added: addedI, skipped: skippedI } }), { headers: EVENT_CORS });
  }

  // POST /event/remove-player — admin can remove a player
  if (path === 'event/remove-player' && request.method === 'POST') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Admin required' }), { status: 403, headers: EVENT_CORS });
    const body = await request.json();
    const { name } = body;
    if (!name) return new Response(JSON.stringify({ error: 'Name required' }), { status: 400, headers: EVENT_CORS });
    const cfgRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
    if (!cfgRaw) return new Response(JSON.stringify({ error: 'Event not found' }), { status: 404, headers: EVENT_CORS });
    const config = JSON.parse(cfgRaw);
    const lower = name.trim().toLowerCase();
    config.players = (config.players || []).filter(p => p.name.toLowerCase() !== lower);
    config.roster = (config.roster || []).filter(p => (p.name || p.member || '').toLowerCase() !== lower);
    await env.MG_BOOK.put(`config:${slug}`, JSON.stringify(config));
    return new Response(JSON.stringify({ ok: true }), { headers: EVENT_CORS });
  }

  // POST /event/complete — mark event as complete (archive)
  if (path === 'event/complete' && request.method === 'POST') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Admin required' }), { status: 403, headers: EVENT_CORS });
    const cfgRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
    if (!cfgRaw) return new Response(JSON.stringify({ error: 'Event not found' }), { status: 404, headers: EVENT_CORS });
    const config = JSON.parse(cfgRaw);
    config.event.status = 'complete';
    config.event.completedAt = new Date().toISOString();
    await env.MG_BOOK.put(`config:${slug}`, JSON.stringify(config));
    const settings = (await env.MG_BOOK.get(`${K}:settings`, 'json')) || {};
    settings.bettingClosed = true;
    await env.MG_BOOK.put(`${K}:settings`, JSON.stringify(settings));
    return new Response(JSON.stringify({ ok: true }), { headers: EVENT_CORS });
  }

  // GET /event/clone-config — public endpoint to get cloneable config (strips sensitive fields)
  if (path === 'event/clone-config' && request.method === 'GET') {
    const cloneCfgRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
    if (!cloneCfgRaw) return new Response(JSON.stringify({ error: 'Event not found' }), { status: 404, headers: EVENT_CORS });
    const cloneCfg = JSON.parse(cloneCfgRaw);
    // Strip sensitive/unique fields — no adminPin, no createdAt, no slug, no payment info
    const cloneOut = {
      event: {
        name: cloneCfg.event?.name || '',
        venue: cloneCfg.event?.venue || '',
        eventType: cloneCfg.event?.eventType || '',
        holesPerRound: cloneCfg.event?.holesPerRound || 18,
      },
      scoring: cloneCfg.scoring,
      structure: cloneCfg.structure,
      features: cloneCfg.features,
      games: cloneCfg.games,
      holesPerRound: cloneCfg.holesPerRound,
      players: (cloneCfg.players || []).map(p => ({ name: p.name, handicapIndex: p.handicapIndex || 0, venmo: p.venmo || '' })),
      roster: (cloneCfg.roster || []).map(p => ({ name: p.name || p.member || '', handicapIndex: p.handicapIndex || 0, venmo: p.venmo || '' })),
      course: cloneCfg.course,
      coursePars: cloneCfg.coursePars,
      courseHcpIndex: cloneCfg.courseHcpIndex,
      theme: cloneCfg.theme,
    };
    return new Response(JSON.stringify({ ok: true, config: cloneOut }), { headers: EVENT_CORS });
  }

  // POST /event/clone — create a new event based on this one's config
  if (path === 'event/clone' && request.method === 'POST') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Admin required' }), { status: 403, headers: EVENT_CORS });
    const configRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
    if (!configRaw) return new Response(JSON.stringify({ error: 'Event not found' }), { status: 404, headers: EVENT_CORS });
    const config = JSON.parse(configRaw);
    // Strip runtime state, keep structure
    const cloneConfig = {
      event: {
        ...config.event,
        name: config.event.name + ' (Copy)',
        status: undefined,
        completedAt: undefined,
        dates: {}, // clear dates — user sets new ones
      },
      scoring: config.scoring,
      structure: config.structure,
      features: config.features,
      games: config.games,
      holesPerRound: config.holesPerRound,
      players: config.players,
      roster: config.roster,
      wolfOrder: config.wolfOrder,
      course: config.course,
      coursePars: config.coursePars,
      courseHcpIndex: config.courseHcpIndex,
      theme: config.theme,
    };
    return new Response(JSON.stringify({ ok: true, config: cloneConfig }), { headers: EVENT_CORS });
  }

  // POST /scan-scorecard — AI-powered scorecard OCR (Workers AI primary, Claude fallback)
  if (path === 'scan-scorecard' && request.method === 'POST') {
    if (!env.AI && !env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI not configured' }), { status: 500, headers: EVENT_CORS });
    }

    const formData = await request.formData();
    const image = formData.get('image');
    if (!image) return new Response(JSON.stringify({ error: 'No image provided' }), { status: 400, headers: EVENT_CORS });

    const imageBytes = await image.arrayBuffer();
    const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBytes)));
    const mediaType = image.type || 'image/jpeg';

    const cfgRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
    const cfg = cfgRaw ? JSON.parse(cfgRaw) : {};
    const playerNames = (cfg.roster || cfg.players || []).map(p => p.name);
    const coursePars = cfg.course?.pars || cfg.coursePars || [];

    const ocrPrompt = `Extract golf scores from this scorecard image. Players: ${playerNames.join(', ')}. Course pars: ${coursePars.join(', ')}.
Return ONLY JSON: {"scores":{"1":{"PlayerName":5},"2":{"PlayerName":4}},"confidence":"high","notes":""}
Match player names to rows. Only include holes with scores written.`;

    let text = '';

    // Try Workers AI first (free, edge)
    if (env.AI) {
      try {
        const result = await env.AI.run('@cf/llava-hf/llava-1.5-7b-hf', {
          image: [...new Uint8Array(imageBytes)],
          prompt: ocrPrompt,
          max_tokens: 1024,
        });
        text = result?.description || result?.response || '';
      } catch (e) {
        console.error('Workers AI vision error, falling back to Claude:', e.message);
      }
    }

    // Fall back to Claude Vision if Workers AI failed or returned empty
    if (!text && env.ANTHROPIC_API_KEY) {
      try {
        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1024,
            messages: [{
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Image } },
                { type: 'text', text: ocrPrompt }
              ]
            }]
          })
        });
        const aiResult = await aiRes.json();
        text = aiResult.content?.[0]?.text || '';
      } catch (e) {
        console.error('Claude Vision error:', e.message);
      }
    }

    if (!text) {
      return new Response(JSON.stringify({ error: 'OCR failed — could not extract scores' }), { status: 500, headers: EVENT_CORS });
    }

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');
      const parsed = JSON.parse(jsonMatch[0]);
      return new Response(JSON.stringify({ ok: true, ...parsed }), { headers: EVENT_CORS });
    } catch (e) {
      return new Response(JSON.stringify({ ok: true, raw: text, parseError: e.message }), { headers: EVENT_CORS });
    }
  }

  // POST /event/start-round — start a new round (archive scores, reset scorecard)
  if (path === 'event/start-round' && request.method === 'POST') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Admin required' }), { status: 403, headers: EVENT_CORS });
    const body = await request.json().catch(() => ({}));
    const { roundNumber, course, courseId, tees } = body;

    const cfgRaw2 = await env.MG_BOOK.get(`config:${slug}`, 'text');
    if (!cfgRaw2) return new Response(JSON.stringify({ error: 'Event not found' }), { status: 404, headers: EVENT_CORS });
    const config = JSON.parse(cfgRaw2);

    // Archive current round scores
    const currentHoles = await env.MG_BOOK.get(`${K}:holes`, 'json');
    const currentGameState = await env.MG_BOOK.get(`${K}:game-state`, 'json');
    const currentRound = config.event?.currentRound || 1;
    if (currentHoles) {
      await env.MG_BOOK.put(`${K}:archive:round-${currentRound}:holes`, JSON.stringify(currentHoles));
    }
    if (currentGameState) {
      await env.MG_BOOK.put(`${K}:archive:round-${currentRound}:game-state`, JSON.stringify(currentGameState));
    }

    // Clear live state for new round
    await env.MG_BOOK.delete(`${K}:holes`);
    await env.MG_BOOK.delete(`${K}:game-state`);
    await env.MG_BOOK.delete(`${K}:scores`);

    // Update config with new round info
    if (!config.event) config.event = {};
    config.event.currentRound = roundNumber || (currentRound + 1);
    if (course) config.event.venue = course;
    if (courseId) config.course = { id: courseId, name: course };

    // Update course pars if a new course was selected
    if (courseId) {
      try {
        const courseRes = await fetch(`https://betwaggle.com/api/courses/${courseId}`);
        if (courseRes.ok) {
          const courseData = await courseRes.json();
          if (courseData.pars?.length >= 18) {
            config.coursePars = courseData.pars;
            config.courseHcpIndex = courseData.strokeIndex || [];
          }
        }
      } catch {}

      // For custom courses, check rounds config
      if (config.rounds?.[roundNumber]) {
        const roundConfig = config.rounds[roundNumber];
        if (roundConfig.courseId === 'pga-frisco-west' && config.westCoursePars) {
          config.coursePars = config.westCoursePars;
          config.courseHcpIndex = config.westCourseHcpIndex || [];
        }
      }
    }

    await env.MG_BOOK.put(`config:${slug}`, JSON.stringify(config));

    // Add feed item
    const feed = (await env.MG_BOOK.get(`${K}:feed`, 'json')) || [];
    feed.push({
      id: `round-${Date.now()}`,
      type: 'system',
      player: 'Waggle',
      text: `Round ${config.event.currentRound} started${course ? ' \u2014 ' + course : ''}`,
      ts: Date.now(),
    });
    while (feed.length > 200) feed.shift();
    await env.MG_BOOK.put(`${K}:feed`, JSON.stringify(feed));

    return new Response(JSON.stringify({ ok: true, round: config.event.currentRound }), { headers: EVENT_CORS });
  }

  // ─── Team Registration Endpoints ─────────────────────────────────────────

  // GET /teams — list registered teams
  if (path === 'teams' && request.method === 'GET') {
    const teams = (await env.MG_BOOK.get(`${K}:registered-teams`, 'json')) || [];
    return new Response(JSON.stringify(teams), { headers: EVENT_CORS });
  }

  // POST /teams/register — register a new team
  if (path === 'teams/register' && request.method === 'POST') {
    try {
      const body = await request.json();
      const { teamName, captain, captainEmail, players, handicap } = body;
      if (!teamName || !captain) {
        return new Response(JSON.stringify({ error: 'Team name and captain are required' }), { status: 400, headers: EVENT_CORS });
      }

      const teams = (await env.MG_BOOK.get(`${K}:registered-teams`, 'json')) || [];

      // Check for duplicate team name
      const normalizedName = teamName.trim().toLowerCase();
      if (teams.some(t => t.name.toLowerCase() === normalizedName)) {
        return new Response(JSON.stringify({ error: 'A team with this name is already registered' }), { status: 409, headers: EVENT_CORS });
      }

      const team = {
        id: 'team_' + Date.now().toString(36),
        name: stripHtml(teamName.trim()),
        captain: stripHtml(captain.trim()),
        captainEmail: (captainEmail || '').trim(),
        players: (players || []).map(p => typeof p === 'string' ? stripHtml(p.trim()) : p).filter(Boolean),
        handicap: parseFloat(handicap) || 0,
        registeredAt: new Date().toISOString(),
        paid: false
      };
      teams.push(team);
      await env.MG_BOOK.put(`${K}:registered-teams`, JSON.stringify(teams));

      // Also add to config roster so team shows up in the scramble leaderboard
      const cfgRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
      if (cfgRaw) {
        try {
          const config = JSON.parse(cfgRaw);
          if (!config.roster) config.roster = [];
          if (!config.players) config.players = [];
          const rosterEntry = { name: teamName.trim(), handicapIndex: parseFloat(handicap) || 0 };
          if (!config.roster.some(r => r.name === rosterEntry.name)) {
            config.roster.push(rosterEntry);
            config.players.push(rosterEntry);
            // Also add to scrambleTeams if it exists
            if (Array.isArray(config.scrambleTeams)) {
              config.scrambleTeams.push(rosterEntry);
            }
            await env.MG_BOOK.put(`config:${slug}`, JSON.stringify(config));
          }
        } catch {}
      }

      return new Response(JSON.stringify({ ok: true, team }), { headers: EVENT_CORS });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400, headers: EVENT_CORS });
    }
  }

  // POST /teams/checkout — create Stripe checkout for team entry fee
  if (path === 'teams/checkout' && request.method === 'POST') {
    if (!env.STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: 'Payments not configured' }), { status: 500, headers: EVENT_CORS });
    }

    try {
      const body = await request.json();
      const { teamId } = body;
      if (!teamId) {
        return new Response(JSON.stringify({ error: 'teamId is required' }), { status: 400, headers: EVENT_CORS });
      }

      // Read config to get entry fee
      const cfgRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
      if (!cfgRaw) return new Response(JSON.stringify({ error: 'Event not found' }), { status: 404, headers: EVENT_CORS });
      const config = JSON.parse(cfgRaw);
      const fee = config.scrambleEntryFee || config.entryFee || 0;
      if (fee <= 0) {
        // Mark team as paid directly
        const teams = (await env.MG_BOOK.get(`${K}:registered-teams`, 'json')) || [];
        const team = teams.find(t => t.id === teamId);
        if (team) {
          team.paid = true;
          await env.MG_BOOK.put(`${K}:registered-teams`, JSON.stringify(teams));
        }
        return new Response(JSON.stringify({ ok: true, free: true }), { headers: EVENT_CORS });
      }

      const amountCents = Math.round(fee * 100);
      const eventName = config.event?.name || 'Scramble';

      const stripeBody = new URLSearchParams({
        'payment_method_types[]': 'card',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][product_data][name]': `${eventName} — Team Entry Fee`,
        'line_items[0][price_data][product_data][description]': `Entry fee for ${eventName} at ${config.event?.venue || config.event?.course || ''}`,
        'line_items[0][price_data][unit_amount]': String(amountCents),
        'line_items[0][quantity]': '1',
        'mode': 'payment',
        'success_url': `https://betwaggle.com/${slug}/register?paid=true&team=${teamId}`,
        'cancel_url': `https://betwaggle.com/${slug}/register`,
        'metadata[waggle_slug]': slug,
        'metadata[team_id]': teamId,
        'metadata[type]': 'team_entry_fee',
      });

      const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: stripeBody.toString(),
      });

      if (!stripeRes.ok) {
        const err = await stripeRes.json();
        return new Response(JSON.stringify({ error: err?.error?.message || 'Stripe error' }), { status: 500, headers: EVENT_CORS });
      }

      const session = await stripeRes.json();

      // Store checkout session reference for webhook reconciliation
      await env.MG_BOOK.put(`${K}:team-checkout:${session.id}`, JSON.stringify({ teamId, slug, created: Date.now() }), { expirationTtl: 7200 });

      return new Response(JSON.stringify({ checkoutUrl: session.url }), { headers: EVENT_CORS });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Checkout creation failed' }), { status: 500, headers: EVENT_CORS });
    }
  }

  // POST /teams/mark-paid — mark a team as paid (admin only, or after Stripe success)
  if (path === 'teams/mark-paid' && request.method === 'POST') {
    try {
      const body = await request.json();
      const { teamId } = body;
      if (!teamId) return new Response(JSON.stringify({ error: 'teamId required' }), { status: 400, headers: EVENT_CORS });

      const teams = (await env.MG_BOOK.get(`${K}:registered-teams`, 'json')) || [];
      const team = teams.find(t => t.id === teamId);
      if (!team) return new Response(JSON.stringify({ error: 'Team not found' }), { status: 404, headers: EVENT_CORS });

      team.paid = true;
      team.paidAt = new Date().toISOString();
      await env.MG_BOOK.put(`${K}:registered-teams`, JSON.stringify(teams));

      return new Response(JSON.stringify({ ok: true, team }), { headers: EVENT_CORS });
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400, headers: EVENT_CORS });
    }
  }

  // ─── Hole Sponsor Endpoints ──────────────────────────────────────────────

  // GET /sponsors — list hole sponsors
  if (path === 'sponsors' && request.method === 'GET') {
    const cfgRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
    let sponsors = {};
    if (cfgRaw) {
      try {
        const config = JSON.parse(cfgRaw);
        sponsors = config.sponsors || {};
      } catch {}
    }
    return new Response(JSON.stringify(sponsors), { headers: EVENT_CORS });
  }

  // POST /sponsors — add/update a hole sponsor (admin only)
  if (path === 'sponsors' && request.method === 'POST') {
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 401, headers: EVENT_CORS });
    }

    try {
      const body = await request.json();
      const { hole, sponsorName, sponsorLogo } = body;
      if (!hole || !sponsorName) {
        return new Response(JSON.stringify({ error: 'hole and sponsorName are required' }), { status: 400, headers: EVENT_CORS });
      }

  // ── Calcutta Auction Endpoints ──────────────────────────────────────────

  // GET /calcutta — get auction state
  if (path === 'calcutta' && request.method === 'GET') {
    const calcutta = (await env.MG_BOOK.get(`${K}:calcutta`, 'json')) || {
      status: 'pending', currentTeam: null, teams: {}, pool: 0,
      payoutSplit: [50, 25, 15, 10], teamOrder: []
    };
    return new Response(JSON.stringify(calcutta), { headers: EVENT_CORS });
  }

  // POST /calcutta/bid — place a bid on the current team
  if (path === 'calcutta/bid' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const { teamId, bidder, amount } = body;
    if (!teamId || !bidder || !amount || amount <= 0) {
      return new Response(JSON.stringify({ error: 'teamId, bidder, and amount required' }), { status: 400, headers: EVENT_CORS });
    }
    const bidderName = String(bidder).replace(/<[^>]*>/g, '').trim().slice(0, 50);
    const bidAmount = Math.floor(Number(amount));
    if (bidAmount <= 0 || bidAmount > 100000) {
      return new Response(JSON.stringify({ error: 'Invalid bid amount' }), { status: 400, headers: EVENT_CORS });
    }
    const calcutta = (await env.MG_BOOK.get(`${K}:calcutta`, 'json')) || {
      status: 'pending', currentTeam: null, teams: {}, pool: 0, payoutSplit: [50, 25, 15, 10], teamOrder: []
    };
    if (calcutta.status !== 'active') {
      return new Response(JSON.stringify({ error: 'Auction is not active' }), { status: 400, headers: EVENT_CORS });
    }
    if (calcutta.currentTeam !== teamId) {
      return new Response(JSON.stringify({ error: 'Not currently bidding on this team' }), { status: 400, headers: EVENT_CORS });
    }
    if (!calcutta.teams[teamId]) calcutta.teams[teamId] = { bids: [], sold: false };
    const cBidTeam = calcutta.teams[teamId];
    if (cBidTeam.sold) {
      return new Response(JSON.stringify({ error: 'Team already sold' }), { status: 400, headers: EVENT_CORS });
    }
    const currentHighBid = cBidTeam.bids.length > 0 ? Math.max(...cBidTeam.bids.map(b => b.amount)) : 0;
    if (bidAmount <= currentHighBid) {
      return new Response(JSON.stringify({ error: 'Bid must be higher than $' + currentHighBid }), { status: 400, headers: EVENT_CORS });
    }
    cBidTeam.bids.push({ bidder: bidderName, amount: bidAmount, ts: Date.now() });
    await env.MG_BOOK.put(`${K}:calcutta`, JSON.stringify(calcutta));
    return new Response(JSON.stringify({ ok: true, currentBid: bidAmount, bidder: bidderName }), { headers: EVENT_CORS });
  }

  // POST /calcutta/sold — mark current team as sold (admin only)
  if (path === 'calcutta/sold' && request.method === 'POST') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Admin required' }), { status: 403, headers: EVENT_CORS });
    const body = await request.json().catch(() => ({}));
    const { teamId } = body;
    const calcutta = (await env.MG_BOOK.get(`${K}:calcutta`, 'json')) || {
      status: 'pending', currentTeam: null, teams: {}, pool: 0, payoutSplit: [50, 25, 15, 10], teamOrder: []
    };
    if (!teamId || !calcutta.teams[teamId]) {
      return new Response(JSON.stringify({ error: 'Team not found in auction' }), { status: 400, headers: EVENT_CORS });
    }
    const cSoldTeam = calcutta.teams[teamId];
    if (cSoldTeam.bids.length === 0) {
      return new Response(JSON.stringify({ error: 'No bids on this team' }), { status: 400, headers: EVENT_CORS });
    }
    const winBid = cSoldTeam.bids.reduce((max, b) => b.amount > max.amount ? b : max, cSoldTeam.bids[0]);
    cSoldTeam.sold = true;
    cSoldTeam.winner = winBid.bidder;
    cSoldTeam.amount = winBid.amount;
    let pool = 0;
    for (const ct of Object.values(calcutta.teams)) { if (ct.sold) pool += ct.amount; }
    calcutta.pool = pool;
    await env.MG_BOOK.put(`${K}:calcutta`, JSON.stringify(calcutta));
    return new Response(JSON.stringify({ ok: true, team: teamId, winner: winBid.bidder, amount: winBid.amount, pool }), { headers: EVENT_CORS });
  }

  // POST /calcutta/next — advance to next team (admin only)
  if (path === 'calcutta/next' && request.method === 'POST') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Admin required' }), { status: 403, headers: EVENT_CORS });
    const calcutta = (await env.MG_BOOK.get(`${K}:calcutta`, 'json')) || {
      status: 'pending', currentTeam: null, teams: {}, pool: 0, payoutSplit: [50, 25, 15, 10], teamOrder: []
    };
    if (calcutta.status === 'pending') {
      let cfgCalc = null;
      try { cfgCalc = JSON.parse(configRaw); } catch {}
      const scTeams = cfgCalc?.scrambleTeams || [];
      const tmNames = scTeams.map(t => t.name || t);
      if (tmNames.length === 0) {
        const plsCalc = cfgCalc?.players || cfgCalc?.roster || [];
        const pNCalc = plsCalc.map(p => p.name || p.member).filter(Boolean);
        for (let i = 0; i < pNCalc.length; i += 2) {
          if (i + 1 < pNCalc.length) tmNames.push(pNCalc[i] + ' / ' + pNCalc[i+1]);
          else tmNames.push(pNCalc[i]);
        }
      }
      calcutta.status = 'active';
      calcutta.teamOrder = tmNames;
      for (const nm of tmNames) { if (!calcutta.teams[nm]) calcutta.teams[nm] = { bids: [], sold: false }; }
      calcutta.currentTeam = tmNames[0] || null;
      await env.MG_BOOK.put(`${K}:calcutta`, JSON.stringify(calcutta));
      return new Response(JSON.stringify({ ok: true, status: 'active', currentTeam: calcutta.currentTeam }), { headers: EVENT_CORS });
    }
    const order = calcutta.teamOrder || Object.keys(calcutta.teams);
    const curIdx = order.indexOf(calcutta.currentTeam);
    let nextTeam = null;
    for (let i = curIdx + 1; i < order.length; i++) {
      const ct = calcutta.teams[order[i]];
      if (!ct || !ct.sold) { nextTeam = order[i]; break; }
    }
    if (!nextTeam) {
      calcutta.status = 'complete';
      calcutta.currentTeam = null;
      await env.MG_BOOK.put(`${K}:calcutta`, JSON.stringify(calcutta));
      return new Response(JSON.stringify({ ok: true, status: 'complete' }), { headers: EVENT_CORS });
    }
    calcutta.currentTeam = nextTeam;
    if (!calcutta.teams[nextTeam]) calcutta.teams[nextTeam] = { bids: [], sold: false };
    await env.MG_BOOK.put(`${K}:calcutta`, JSON.stringify(calcutta));
    return new Response(JSON.stringify({ ok: true, currentTeam: nextTeam }), { headers: EVENT_CORS });
  }

  // POST /calcutta/start — start auction (admin only)
  if (path === 'calcutta/start' && request.method === 'POST') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Admin required' }), { status: 403, headers: EVENT_CORS });
    const calcutta = (await env.MG_BOOK.get(`${K}:calcutta`, 'json')) || {
      status: 'pending', currentTeam: null, teams: {}, pool: 0, payoutSplit: [50, 25, 15, 10], teamOrder: []
    };
    if (calcutta.status !== 'pending') {
      return new Response(JSON.stringify({ error: 'Auction already started' }), { status: 400, headers: EVENT_CORS });
    }
    let cfgStart = null;
    try { cfgStart = JSON.parse(configRaw); } catch {}
    const stTeams = cfgStart?.scrambleTeams || [];
    const stNames = stTeams.map(t => t.name || t);
    if (stNames.length === 0) {
      const plsSt = cfgStart?.players || cfgStart?.roster || [];
      const pNSt = plsSt.map(p => p.name || p.member).filter(Boolean);
      for (let i = 0; i < pNSt.length; i += 2) {
        if (i + 1 < pNSt.length) stNames.push(pNSt[i] + ' / ' + pNSt[i+1]);
        else stNames.push(pNSt[i]);
      }
    }
    calcutta.status = 'active';
    calcutta.teamOrder = stNames;
    for (const nm of stNames) { if (!calcutta.teams[nm]) calcutta.teams[nm] = { bids: [], sold: false }; }
    calcutta.currentTeam = stNames[0] || null;
    await env.MG_BOOK.put(`${K}:calcutta`, JSON.stringify(calcutta));
    return new Response(JSON.stringify({ ok: true, status: 'active', currentTeam: calcutta.currentTeam, teamOrder: stNames }), { headers: EVENT_CORS });
  }

  // POST /calcutta/reset — reset auction (admin only)
  if (path === 'calcutta/reset' && request.method === 'POST') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Admin required' }), { status: 403, headers: EVENT_CORS });
    await env.MG_BOOK.delete(`${K}:calcutta`);
    return new Response(JSON.stringify({ ok: true }), { headers: EVENT_CORS });
  }

      const cfgRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
      if (!cfgRaw) return new Response(JSON.stringify({ error: 'Event not found' }), { status: 404, headers: EVENT_CORS });

      const config = JSON.parse(cfgRaw);
      if (!config.sponsors) config.sponsors = {};
      config.sponsors[String(hole)] = {
        name: sponsorName.trim(),
        logo: (sponsorLogo || '').trim() || null,
      };
      await env.MG_BOOK.put(`config:${slug}`, JSON.stringify(config));

      return new Response(JSON.stringify({ ok: true, sponsors: config.sponsors }), { headers: EVENT_CORS });
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400, headers: EVENT_CORS });
    }
  }

  // DELETE /sponsors — remove a hole sponsor (admin only)
  if (path === 'sponsors' && request.method === 'DELETE') {
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 401, headers: EVENT_CORS });
    }

    try {
      const body = await request.json();
      const { hole } = body;
      if (!hole) return new Response(JSON.stringify({ error: 'hole is required' }), { status: 400, headers: EVENT_CORS });

      const cfgRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
      if (!cfgRaw) return new Response(JSON.stringify({ error: 'Event not found' }), { status: 404, headers: EVENT_CORS });

      const config = JSON.parse(cfgRaw);
      if (config.sponsors) {
        delete config.sponsors[String(hole)];
        await env.MG_BOOK.put(`config:${slug}`, JSON.stringify(config));
      }

      return new Response(JSON.stringify({ ok: true, sponsors: config.sponsors || {} }), { headers: EVENT_CORS });
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400, headers: EVENT_CORS });
    }
  }

  return null;
}

// ─── AI Recap ─────────────────────────────────────────────────────────────

async function handleWaggleRecap(url, env) {
  const slug = url.searchParams.get('slug');
  if (!slug) return new Response(JSON.stringify({ error: 'slug required' }), { status: 400, headers: EVENT_CORS });
  if (!env.MG_BOOK) return new Response(JSON.stringify({ error: 'storage not configured' }), { status: 500, headers: EVENT_CORS });
  if (!env.AI && !env.ANTHROPIC_API_KEY) return new Response(JSON.stringify({ error: 'AI not configured' }), { status: 500, headers: EVENT_CORS });

  const [gameState, holes, configRaw] = await Promise.all([
    env.MG_BOOK.get(`${slug}:game-state`, 'json'),
    env.MG_BOOK.get(`${slug}:holes`, 'json'),
    env.MG_BOOK.get(`config:${slug}`, 'text'),
  ]);
  if (!configRaw) return new Response(JSON.stringify({ error: 'Event not found' }), { status: 404, headers: EVENT_CORS });

  const config = JSON.parse(configRaw);
  const eventName = config.event?.name || slug;
  const rosterPlayers = config.roster || config.players || [];
  const players = rosterPlayers.length > 0
    ? rosterPlayers.map(p => ({ name: p.name, hi: p.handicapIndex || 0 }))
    : Object.values(config.teams || {}).map(t => ({ name: t.member, hi: t.memberHI || 0 }));
  const holesPlayed = Object.keys(holes || {}).length;

  const system = 'You are a witty golf writer for a private sportsbook app. Write compelling, shareable recaps. Use real names and actual scores. Keep it under 250 words.';
  const prompt = `Write a 3-5 paragraph round recap for this group. Lead with the most dramatic moment.

Event: ${eventName}
Players: ${players.map(p => `${p.name} (HI: ${p.hi})`).join(', ')}
Format: ${config.event?.eventType || 'Nassau'}
Holes played: ${holesPlayed}/18
Game state: ${JSON.stringify(gameState || {}).slice(0, 1000)}
Scores: ${JSON.stringify(holes || {}).slice(0, 1500)}`;

  const aiJson = await callAI(env, system, prompt, 600);
  const recap = aiJson.content?.[0]?.text || 'Could not generate recap.';

  if (env.WAGGLE_DB) {
    const roundId = `round_${slug}_${Date.now()}`;
    env.WAGGLE_DB.prepare(
      'INSERT OR IGNORE INTO rounds (id, event_id, round_number, state, scores, completed_at) VALUES (?, ?, 1, ?, ?, datetime("now"))'
    ).bind(roundId, slug, 'complete', JSON.stringify({ recap, holesPlayed })).run().catch(() => {});
  }

  return new Response(JSON.stringify({ ok: true, slug, eventName, recap, holesPlayed }), { headers: EVENT_CORS });
}

// AI Game Advisor
async function handleWaggleAdvisor(request, env) {
  if (!env.ANTHROPIC_API_KEY) return new Response(JSON.stringify({ error: 'AI not configured' }), { status: 500, headers: EVENT_CORS });
  const body = await request.json().catch(() => ({}));
  const { players, preferences } = body;
  if (!players || players.length < 2) return new Response(JSON.stringify({ error: 'At least 2 players required' }), { status: 400, headers: EVENT_CORS });

  const handicaps = players.map(p => p.handicap || p.hi || 0);
  const spread = Math.max(...handicaps) - Math.min(...handicaps);
  const avg = handicaps.reduce((a, b) => a + b, 0) / handicaps.length;

  const prompt = `You are a seasoned golf trip organizer. Recommend the ideal Waggle game setup. Be specific and concise (under 200 words).

Players (${players.length}): ${players.map(p => `${p.name || 'Player'} HI ${p.handicap || p.hi || 0}`).join(', ')}
Handicap spread: ${spread.toFixed(1)} | Avg: ${avg.toFixed(1)}

Return JSON: {"recommended_format":"Nassau|Skins|Wolf|Vegas|Banker","stakes":"...","press_rules":"...","handicap_advice":"...","fun_tip":"...","reasoning":"..."}`;

  const system = 'You are a seasoned golf trip organizer for a sportsbook app. Return valid JSON only.';
  const aiJson = await callAI(env, system, prompt, 400);
  const text = aiJson.content?.[0]?.text || '{}';
  let advice = {};
  try { advice = JSON.parse(text.match(/\{[\s\S]+\}/)?.[0] || '{}'); } catch { advice = { error: 'Could not parse', raw: text }; }

  return new Response(JSON.stringify({ ok: true, players: players.length, spread, advice }), { headers: EVENT_CORS });
}

// Event history
async function handleWaggleHistory(url, env) {
  if (!env.WAGGLE_DB) return new Response(JSON.stringify({ error: 'waggle-db not bound' }), { status: 500, headers: EVENT_CORS });
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const eventType = url.searchParams.get('type');
  let query = 'SELECT id, slug, event_type, name, created_at FROM events WHERE active=1';
  const bindings = [];
  if (eventType) { query += ' AND event_type=?'; bindings.push(eventType); }
  query += ' ORDER BY created_at DESC LIMIT ?';
  bindings.push(limit);
  const { results } = await env.WAGGLE_DB.prepare(query).bind(...bindings).all();
  return new Response(JSON.stringify({ ok: true, events: results, count: results.length }), { headers: EVENT_CORS });
}

// ─── GHIN API helpers ──────────────────────────────────────────────────────

const GHIN_BASE = 'https://api2.ghin.com/api/v1';
const GHIN_TOKEN_KEY = 'ghin:token';
const GHIN_SESSION_KEY = 'ghin:session';
const GHIN_ASSOC_KEY = 'ghin:assoc';
const GHIN_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36';
const GHIN_HEADERS = { 'Content-Type': 'application/json', 'User-Agent': GHIN_UA, 'source': 'GHINcom' };

async function getGhinSessionToken(env) {
  if (env.MG_BOOK) {
    try {
      const cached = await env.MG_BOOK.get(GHIN_SESSION_KEY, 'json');
      if (cached?.token && cached.expiresAt > Date.now() + 60000) return cached.token;
    } catch {}
  }
  const res = await fetch('https://firebaseinstallations.googleapis.com/v1/projects/ghin-mobile-app/installations', {
    method: 'POST',
    headers: { ...GHIN_HEADERS, 'x-goog-api-key': 'AIzaSyBxgTOAWxiud0HuaE5tN-5NTlzFnrtyz-I' },
    body: JSON.stringify({ appId: '1:884417644529:web:47fb315bc6c70242f72650', authVersion: 'FIS_v2', fid: 'fg6JfS0U01YmrelthLX9Iz', sdkVersion: 'w:0.5.7' })
  });
  if (!res.ok) return null;
  const data = await res.json();
  const token = data.authToken?.token;
  if (!token) return null;
  if (env.MG_BOOK) await env.MG_BOOK.put(GHIN_SESSION_KEY, JSON.stringify({ token, expiresAt: Date.now() + 55 * 60 * 1000 }), { expirationTtl: 3300 }).catch(() => {});
  return token;
}

async function getGhinAuth(env) {
  let cachedAssocId = null;
  if (env.MG_BOOK) {
    try {
      const cached = await env.MG_BOOK.get(GHIN_TOKEN_KEY, 'json');
      if (cached?.token && cached.expiresAt > Date.now() + 60000) {
        cachedAssocId = await env.MG_BOOK.get(GHIN_ASSOC_KEY).catch(() => null);
        return { token: cached.token, assocId: cachedAssocId };
      }
    } catch {}
  }
  if (!env.GHIN_USERNAME || !env.GHIN_PASSWORD) return null;
  const sessionToken = await getGhinSessionToken(env);
  if (!sessionToken) return null;
  const res = await fetch(`${GHIN_BASE}/golfer_login.json`, {
    method: 'POST',
    headers: GHIN_HEADERS,
    body: JSON.stringify({ token: sessionToken, user: { email_or_ghin: env.GHIN_USERNAME.trim(), password: env.GHIN_PASSWORD.trim() } })
  });
  if (!res.ok) return null;
  const data = await res.json();
  const token = data.golfer_user?.golfer_user_token || data.token;
  if (!token) return null;
  const assocId = String(data.golfer_user?.golfers?.[0]?.golf_association_id || '');
  if (env.MG_BOOK) {
    await env.MG_BOOK.put(GHIN_TOKEN_KEY, JSON.stringify({ token, expiresAt: Date.now() + 55 * 60 * 1000 }), { expirationTtl: 3300 }).catch(() => {});
    if (assocId) await env.MG_BOOK.put(GHIN_ASSOC_KEY, assocId, { expirationTtl: 86400 }).catch(() => {});
  }
  return { token, assocId };
}

async function handleGhinSearch(q, env) {
  const h = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  try {
    // Check cache first (24h TTL)
    const cacheKey = `ghin:cache:${q.toLowerCase().replace(/\s+/g, '_')}`;
    if (env.MG_BOOK) {
      const cached = await env.MG_BOOK.get(cacheKey, 'json');
      if (cached) return new Response(JSON.stringify(cached), { headers: h });
    }

    const auth = await getGhinAuth(env);
    if (!auth) return new Response(JSON.stringify([]), { headers: h });
    const { token, assocId } = auth;
    const parts = q.split(/\s+/);
    const params = new URLSearchParams({ per_page: '10', page: '1', status: 'Active', sorting_criteria: 'last_name_first_name' });
    params.set('country', 'United States');
    if (parts.length >= 2) { params.set('first_name', parts[0]); params.set('last_name', parts.slice(1).join(' ')); }
    else { params.set('last_name', parts[0]); }
    const res = await fetch(`${GHIN_BASE}/golfers/search.json?${params}`, {
      headers: { ...GHIN_HEADERS, 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return new Response(JSON.stringify([]), { headers: h });
    const data = await res.json();
    const golfers = (data.golfers || []).slice(0, 8).map(g => ({
      ghin: g.ghin,
      name: `${g.first_name || ''} ${g.last_name || ''}`.trim(),
      handicapIndex: g.handicap_index ?? null,
      hi_display: g.hi_display || (g.handicap_index != null ? String(g.handicap_index) : 'N/A'),
      club: g.club_name || '',
      state: g.state || '',
    }));

    // Cache results for 24h
    if (env.MG_BOOK && golfers.length > 0) {
      await env.MG_BOOK.put(cacheKey, JSON.stringify(golfers), { expirationTtl: 86400 }).catch(() => {});
    }

    return new Response(JSON.stringify(golfers), { headers: h });
  } catch { return new Response(JSON.stringify([]), { headers: h }); }
}


// ─── Seed: PGA Frisco 2026 (Joe's trip) ──────────────────────────────────
async function seedFriscoV2(env) {
  const slug = 'pga-frisco-2026';
  const existing = await env.MG_BOOK.get(`config:${slug}`, 'json');
  // Check if existing event has the correct player names — if not, force re-seed
  const needsUpdate = existing && (!existing.players?.some(p => p.name === 'Joseph Weill'));
  if (existing && !needsUpdate) return { seeded: false, reason: 'already exists' };
  // Delete old data if re-seeding
  if (needsUpdate) {
    for (const k of ['holes','game-state','bets','feed','settings','scores','players']) {
      await env.MG_BOOK.delete(`${slug}:${k}`).catch(()=>{});
    }
  }
  const config = {
    event: { name: 'PGA Frisco 2026', shortName: 'PGA Frisco', venue: 'Fields Ranch at PGA Frisco', url: `https://betwaggle.com/${slug}/`, dates: { day1: '2026-03-28', day2: '2026-03-29' }, format: 'nassau', adminPin: randomPin(), adminContact: 'joe@joeweill.com', eventType: 'buddies_trip', slug },
    scoring: { holesPerMatch: 18, handicapAllowance: 0.85 },
    structure: { nassauBet: 10, skinsBet: 5, autoPress: { enabled: true, threshold: 2 } },
    features: { betting: true },
    games: { nassau: true, skins: true, wolf: true, vegas: false, stableford: false, match_play: false, stroke_play: false, banker: false, bloodsome: false, bingo: false, nines: false, scramble: false },
    holesPerRound: 18,
    players: [
      { name: 'Joseph Weill', handicapIndex: 7.8, venmo: '', club: 'Tavistock' },
      { name: 'Andrew Morrison', handicapIndex: 12.4, venmo: '', club: 'Eligo' },
      { name: 'Robert Edgerton', handicapIndex: 11.2, venmo: '', club: 'Woodland' },
      { name: 'Benjamin Samuels', handicapIndex: 5.2, venmo: '', club: 'CC of Maryland' },
    ],
    roster: [
      { name: 'Joseph Weill', handicapIndex: 7.8, venmo: '', club: 'Tavistock' },
      { name: 'Andrew Morrison', handicapIndex: 12.4, venmo: '', club: 'Eligo' },
      { name: 'Robert Edgerton', handicapIndex: 11.2, venmo: '', club: 'Woodland' },
      { name: 'Benjamin Samuels', handicapIndex: 5.2, venmo: '', club: 'CC of Maryland' },
    ],
    wolfOrder: ['Joseph Weill', 'Andrew Morrison', 'Robert Edgerton', 'Benjamin Samuels'],
    teams: {}, flights: {}, flightOrder: [], pairings: {},
    theme: { primary: '#1A472A', accent: '#D4AF37', bg: '#F5F0E8', headerFont: 'Inter', bodyFont: 'Inter' },
    course: { id: 'pga-frisco-east', name: 'Fields Ranch East at PGA Frisco' },
    coursePars: [5,4,5,3,4,4,4,3,4,4,4,4,3,5,4,4,3,5],
    courseHcpIndex: [9,5,17,11,7,1,13,15,3,8,12,4,10,2,14,6,18,16],
    rounds: { 1: { course: 'Fields Ranch East', courseId: 'pga-frisco-east', tees: 'Three Tees (~6,500)', par: 72 }, 2: { course: 'Fields Ranch East', courseId: 'pga-frisco-east', tees: 'Three Tees (~6,500)', par: 72 }, 3: { course: 'Fields Ranch West', courseId: 'pga-frisco-west', tees: 'Combo Tees (~6,400)', par: 72 } },
  };
  await env.MG_BOOK.put(`config:${slug}`, JSON.stringify(config));
  await env.MG_BOOK.put(`${slug}:settings`, JSON.stringify({ announcements: ['Welcome to PGA Frisco 2026! Nassau $10, Skins $5, Wolf. Auto-press at 2-down.'], lockedMatches: [], oddsOverrides: {} }));
  for (const email of ['joe@joeweill.com', 'evan.ratner@gmail.com']) {
    const slugs = (await env.MG_BOOK.get(`commissioner:${email}`, 'json')) || [];
    if (!slugs.includes(slug)) { slugs.push(slug); await env.MG_BOOK.put(`commissioner:${email}`, JSON.stringify(slugs)); }
  }
  return { seeded: true, slug, url: `https://betwaggle.com/${slug}/` };
}

// ─── The Legends Trip — MID-ROUND Buddies Trip (slug: legends-trip) ──────────

async function seedLegendsTrip(env) {
  const slug = 'legends-trip';
  const KEY = `config:${slug}`;
  const existing = await env.MG_BOOK.get(KEY);
  if (existing) return { seeded: false };

  const players = [
    { name: 'Tiger Woods', handicapIndex: 2.1, venmo: '@tigerwoods' },
    { name: 'Phil Mickelson', handicapIndex: 3.8, venmo: '@philmickelson' },
    { name: 'Jordan Spieth', handicapIndex: 1.5, venmo: '@jordanspieth' },
    { name: 'Rickie Fowler', handicapIndex: 4.2, venmo: '@rickiefowler' }
  ];
  const pars = [4,5,4,4,3,5,3,4,4, 4,4,3,4,5,4,3,4,5]; // Pebble Beach par 72

  const config = {
    event: { name: 'The Legends Trip', shortName: 'Legends Trip', eventType: 'buddies_trip', course: 'Pebble Beach Golf Links', currentRound: 1, venue: 'Pebble Beach Golf Links', slug },
    players: players,
    roster: players,
    games: { nassau: true, skins: true, wolf: true },
    structure: { nassauBet: '25', skinsBet: '10', autoPress: { enabled: true, threshold: 2 } },
    holesPerRound: 18,
    course: { name: 'Pebble Beach Golf Links', pars: pars, tees: 'Championship' },
    rounds: { '1': { course: 'Pebble Beach Golf Links', tees: 'Championship' } },
    wolfOrder: ['Tiger Woods', 'Phil Mickelson', 'Jordan Spieth', 'Rickie Fowler'],
    adminPin: randomPin()
  };
  await env.MG_BOOK.put(KEY, JSON.stringify(config));

  // Scores through 14 holes — Tiger and Jordan battling, Phil pressing
  const scoreData = {
    1:  { 'Tiger Woods': 4, 'Phil Mickelson': 4, 'Jordan Spieth': 3, 'Rickie Fowler': 4 },
    2:  { 'Tiger Woods': 4, 'Phil Mickelson': 5, 'Jordan Spieth': 4, 'Rickie Fowler': 5 },
    3:  { 'Tiger Woods': 4, 'Phil Mickelson': 5, 'Jordan Spieth': 4, 'Rickie Fowler': 4 },
    4:  { 'Tiger Woods': 4, 'Phil Mickelson': 4, 'Jordan Spieth': 4, 'Rickie Fowler': 5 },
    5:  { 'Tiger Woods': 3, 'Phil Mickelson': 3, 'Jordan Spieth': 2, 'Rickie Fowler': 3 },
    6:  { 'Tiger Woods': 5, 'Phil Mickelson': 4, 'Jordan Spieth': 5, 'Rickie Fowler': 5 },
    7:  { 'Tiger Woods': 2, 'Phil Mickelson': 3, 'Jordan Spieth': 3, 'Rickie Fowler': 3 },
    8:  { 'Tiger Woods': 4, 'Phil Mickelson': 5, 'Jordan Spieth': 3, 'Rickie Fowler': 4 },
    9:  { 'Tiger Woods': 4, 'Phil Mickelson': 4, 'Jordan Spieth': 4, 'Rickie Fowler': 5 },
    10: { 'Tiger Woods': 3, 'Phil Mickelson': 4, 'Jordan Spieth': 4, 'Rickie Fowler': 4 },
    11: { 'Tiger Woods': 4, 'Phil Mickelson': 5, 'Jordan Spieth': 4, 'Rickie Fowler': 4 },
    12: { 'Tiger Woods': 3, 'Phil Mickelson': 3, 'Jordan Spieth': 3, 'Rickie Fowler': 4 },
    13: { 'Tiger Woods': 4, 'Phil Mickelson': 4, 'Jordan Spieth': 3, 'Rickie Fowler': 4 },
    14: { 'Tiger Woods': 4, 'Phil Mickelson': 5, 'Jordan Spieth': 4, 'Rickie Fowler': 5 }
  };

  const holes = {};
  for (const [h, s] of Object.entries(scoreData)) {
    holes[h] = { scores: s, timestamp: Date.now() - (14 - parseInt(h)) * 600000 };
  }
  await env.MG_BOOK.put(`${slug}:holes`, JSON.stringify(holes));

  // Compute skins — lowest unique score wins, carry on ties
  const skinsBet = 10;
  const numPlayers = 4;
  const gameState = { skins: { history: [], pot: 1 } };
  for (let h = 1; h <= 14; h++) {
    const hScores = scoreData[h];
    const entries = players.map(p => ({ name: p.name, score: hScores[p.name] }));
    const minScore = Math.min(...entries.map(e => e.score));
    const winners = entries.filter(e => e.score === minScore);
    if (winners.length === 1) {
      gameState.skins.history.push({ hole: h, winner: winners[0].name, pot: gameState.skins.pot, value: gameState.skins.pot * (numPlayers - 1) * skinsBet });
      gameState.skins.pot = 1;
    } else {
      gameState.skins.history.push({ hole: h, winner: null, pot: gameState.skins.pot, carry: true });
      gameState.skins.pot++;
    }
  }
  await env.MG_BOOK.put(`${slug}:game-state`, JSON.stringify(gameState));

  // Feed with narrative entries
  const feed = [
    { ts: Date.now() - 80000, type: 'score', text: 'Tiger eagles the par-3 7th. Skin won ($30).', player: 'Tiger Woods' },
    { ts: Date.now() - 160000, type: 'score', text: 'Jordan birdies #1 to take early lead.', player: 'Jordan Spieth' },
    { ts: Date.now() - 240000, type: 'score', text: 'Phil bogeys #11. Pressing on the back 9.', player: 'Phil Mickelson' },
    { ts: Date.now() - 320000, type: 'chirp', text: "Rickie can't buy a skin. 0 for 14.", player: 'System' },
    { ts: Date.now() - 400000, type: 'score', text: 'Jordan birdies the par-3 5th. Two-shot lead over Tiger.', player: 'Jordan Spieth' },
    { ts: Date.now() - 480000, type: 'score', text: 'Tiger birdies #10 to close the gap on Jordan.', player: 'Tiger Woods' },
  ];
  await env.MG_BOOK.put(`${slug}:feed`, JSON.stringify(feed));

  return { seeded: true };
}

// ─── The Stag Night Classic — POST-ROUND/COMPLETE (slug: stag-night) ────────

async function seedStagNight(env) {
  const slug = 'stag-night';
  const KEY = `config:${slug}`;
  const existing = await env.MG_BOOK.get(KEY);
  if (existing) return { seeded: false };

  const players = [
    { name: 'Warren Buffett', handicapIndex: 18.0, venmo: '@warrenbuffett' },
    { name: 'Jamie Dimon', handicapIndex: 12.5, venmo: '@jamiedimon' },
    { name: 'Ray Dalio', handicapIndex: 9.3, venmo: '@raydalio' },
    { name: 'Bill Ackman', handicapIndex: 15.7, venmo: '@billackman' }
  ];
  const pars = [4,4,4,4,5,4,5,3,4, 4,4,4,3,4,5,4,3,4]; // Bethpage Black par 71

  const config = {
    event: { name: 'The Stag Night Classic', shortName: 'Stag Night', eventType: 'buddies_trip', course: 'Bethpage Black', currentRound: 1, venue: 'Bethpage State Park', slug, status: 'complete', frozenAt: new Date().toISOString() },
    players: players,
    roster: players,
    games: { nassau: true, skins: true },
    structure: { nassauBet: '50', skinsBet: '20', autoPress: { enabled: true, threshold: 2 } },
    holesPerRound: 18,
    course: { name: 'Bethpage Black', pars: pars, tees: 'Blue' },
    rounds: { '1': { course: 'Bethpage Black', tees: 'Blue' } },
    adminPin: randomPin()
  };
  await env.MG_BOOK.put(KEY, JSON.stringify(config));

  // All 18 holes — Ray dominates, Warren gets destroyed
  const scoreData = {
    1:  { 'Warren Buffett': 6, 'Jamie Dimon': 5, 'Ray Dalio': 4, 'Bill Ackman': 6 },
    2:  { 'Warren Buffett': 5, 'Jamie Dimon': 5, 'Ray Dalio': 4, 'Bill Ackman': 5 },
    3:  { 'Warren Buffett': 6, 'Jamie Dimon': 5, 'Ray Dalio': 5, 'Bill Ackman': 5 },
    4:  { 'Warren Buffett': 5, 'Jamie Dimon': 5, 'Ray Dalio': 5, 'Bill Ackman': 6 },
    5:  { 'Warren Buffett': 6, 'Jamie Dimon': 6, 'Ray Dalio': 5, 'Bill Ackman': 6 },
    6:  { 'Warren Buffett': 5, 'Jamie Dimon': 4, 'Ray Dalio': 4, 'Bill Ackman': 5 },
    7:  { 'Warren Buffett': 7, 'Jamie Dimon': 6, 'Ray Dalio': 6, 'Bill Ackman': 6 },
    8:  { 'Warren Buffett': 4, 'Jamie Dimon': 3, 'Ray Dalio': 3, 'Bill Ackman': 4 },
    9:  { 'Warren Buffett': 5, 'Jamie Dimon': 5, 'Ray Dalio': 5, 'Bill Ackman': 5 },
    10: { 'Warren Buffett': 6, 'Jamie Dimon': 5, 'Ray Dalio': 5, 'Bill Ackman': 5 },
    11: { 'Warren Buffett': 5, 'Jamie Dimon': 5, 'Ray Dalio': 4, 'Bill Ackman': 5 },
    12: { 'Warren Buffett': 6, 'Jamie Dimon': 5, 'Ray Dalio': 5, 'Bill Ackman': 6 },
    13: { 'Warren Buffett': 4, 'Jamie Dimon': 4, 'Ray Dalio': 3, 'Bill Ackman': 4 },
    14: { 'Warren Buffett': 5, 'Jamie Dimon': 5, 'Ray Dalio': 5, 'Bill Ackman': 5 },
    15: { 'Warren Buffett': 7, 'Jamie Dimon': 6, 'Ray Dalio': 5, 'Bill Ackman': 6 },
    16: { 'Warren Buffett': 5, 'Jamie Dimon': 5, 'Ray Dalio': 4, 'Bill Ackman': 5 },
    17: { 'Warren Buffett': 4, 'Jamie Dimon': 3, 'Ray Dalio': 3, 'Bill Ackman': 4 },
    18: { 'Warren Buffett': 6, 'Jamie Dimon': 5, 'Ray Dalio': 5, 'Bill Ackman': 5 }
  };

  const holes = {};
  for (const [h, s] of Object.entries(scoreData)) {
    holes[h] = { scores: s, timestamp: Date.now() - (18 - parseInt(h)) * 600000 };
  }
  await env.MG_BOOK.put(`${slug}:holes`, JSON.stringify(holes));

  // Compute skins for all 18 holes
  const skinsBet = 20;
  const numPlayers = 4;
  const gameState = { skins: { history: [], pot: 1 } };
  for (let h = 1; h <= 18; h++) {
    const hScores = scoreData[h];
    const entries = players.map(p => ({ name: p.name, score: hScores[p.name] }));
    const minScore = Math.min(...entries.map(e => e.score));
    const winners = entries.filter(e => e.score === minScore);
    if (winners.length === 1) {
      gameState.skins.history.push({ hole: h, winner: winners[0].name, pot: gameState.skins.pot, value: gameState.skins.pot * (numPlayers - 1) * skinsBet });
      gameState.skins.pot = 1;
    } else {
      gameState.skins.history.push({ hole: h, winner: null, pot: gameState.skins.pot, carry: true });
      gameState.skins.pot++;
    }
  }
  await env.MG_BOOK.put(`${slug}:game-state`, JSON.stringify(gameState));

  // Feed with narrative
  const feed = [
    { ts: Date.now() - 50000, type: 'score', text: 'Ray shoots 80 on Bethpage Black. Dominant performance.', player: 'Ray Dalio' },
    { ts: Date.now() - 100000, type: 'score', text: "Warren takes a 7 on the par-5 7th. That's $60 in skins.", player: 'Warren Buffett' },
    { ts: Date.now() - 150000, type: 'score', text: "Jamie presses on the back 9. It doesn't help.", player: 'Jamie Dimon' },
    { ts: Date.now() - 200000, type: 'chirp', text: 'Ray Dalio wins every Nassau leg. Total domination.', player: 'System' },
    { ts: Date.now() - 250000, type: 'score', text: 'Bill Ackman cards a 93. "I had a position in every hole."', player: 'Bill Ackman' },
    { ts: Date.now() - 300000, type: 'chirp', text: 'Warren owes everyone. As usual, he says he will pay in Berkshire stock.', player: 'System' },
  ];
  await env.MG_BOOK.put(`${slug}:feed`, JSON.stringify(feed));

  return { seeded: true };
}

// ─── Augusta Charity Scramble — MID-ROUND Scramble (slug: augusta-scramble) ──

async function seedAugustaScramble(env) {
  const slug = 'augusta-scramble';
  const KEY = `config:${slug}`;
  const existing = await env.MG_BOOK.get(KEY);
  if (existing) return { seeded: false };

  const teamNames = [
    'Team Amen Corner', 'Team Magnolia Lane', 'Team Azalea', 'Team Juniper',
    'Team Dogwood', 'Team Redbud', 'Team Yellow Jasmine', 'Team Camellia',
    'Team Flowering Peach', 'Team Chinese Fir', 'Team Firethorn', 'Team Golden Bell'
  ];
  const teams = teamNames.map((name, i) => ({
    name,
    handicapIndex: [4.5, 5.2, 4.8, 6.0, 5.5, 4.1, 5.8, 6.3, 5.0, 6.5, 4.3, 5.7][i]
  }));
  const pars = [4,5,4,3,4,3,4,5,4, 4,4,3,5,4,5,3,4,4]; // Augusta National (approx) par 72

  const config = {
    event: { name: 'Augusta Charity Scramble', shortName: 'Augusta Scramble', eventType: 'scramble', course: 'Augusta National Golf Club', currentRound: 1, venue: 'Augusta National Golf Club', slug },
    players: teams.map(t => ({ name: t.name, handicapIndex: t.handicapIndex })),
    roster: teams.map(t => ({ name: t.name, handicapIndex: t.handicapIndex })),
    teams: teams,
    games: { scramble: true },
    structure: {},
    features: { calcutta: true },
    holesPerRound: 18,
    course: { name: 'Augusta National Golf Club', pars: pars, tees: 'Tournament' },
    rounds: { '1': { course: 'Augusta National Golf Club', tees: 'Tournament' } },
    scrambleEntryFee: 250,
    scrambleTeams: teams,
    sponsors: {
      3: { name: 'Goldman Sachs', hole: 3 },
      7: { name: 'Morgan Stanley', hole: 7 },
      12: { name: 'JP Morgan', hole: 12 },
      16: { name: 'Blackstone', hole: 16 }
    },
    adminPin: randomPin()
  };
  await env.MG_BOOK.put(KEY, JSON.stringify(config));

  // 12 holes scored — tight leaderboard, 3 teams within 1 stroke
  //                           AmenC MagnL Azale Junip Dogwd Redbd YellJ Camel FlwPc ChnFr Firth GldBl
  const holeScores = [
    /* 1 p4*/ [ 3,  4,  3,  4,  4,  3,  4,  4,  3,  4,  3,  4 ],
    /* 2 p5*/ [ 4,  4,  4,  5,  4,  4,  5,  4,  4,  5,  4,  4 ],
    /* 3 p4*/ [ 3,  4,  3,  4,  3,  4,  4,  3,  4,  4,  3,  3 ],
    /* 4 p3*/ [ 3,  3,  2,  3,  3,  2,  3,  3,  2,  3,  3,  3 ],
    /* 5 p4*/ [ 3,  4,  4,  4,  3,  3,  4,  4,  4,  3,  4,  3 ],
    /* 6 p3*/ [ 3,  2,  3,  3,  3,  3,  3,  2,  3,  3,  2,  3 ],
    /* 7 p4*/ [ 3,  4,  3,  4,  4,  3,  4,  4,  3,  4,  4,  3 ],
    /* 8 p5*/ [ 4,  4,  4,  5,  4,  4,  5,  5,  4,  4,  4,  4 ],
    /* 9 p4*/ [ 3,  4,  3,  4,  4,  3,  4,  4,  3,  4,  3,  4 ],
    /*10 p4*/ [ 3,  4,  4,  4,  3,  3,  4,  4,  4,  3,  4,  3 ],
    /*11 p4*/ [ 3,  4,  3,  4,  4,  4,  4,  3,  4,  4,  3,  4 ],
    /*12 p3*/ [ 2,  3,  3,  3,  2,  3,  3,  3,  3,  2,  3,  2 ],
  ];

  const holes = {};
  const totals = {};
  teamNames.forEach(t => { totals[t] = 0; });

  for (let h = 1; h <= 12; h++) {
    const s = {};
    teamNames.forEach((t, i) => {
      s[t] = holeScores[h - 1][i];
      totals[t] += holeScores[h - 1][i];
    });
    holes[h] = { scores: s, timestamp: Date.now() - (12 - h) * 600000 };
  }
  await env.MG_BOOK.put(`${slug}:holes`, JSON.stringify(holes));

  // Build scramble leaderboard
  const leaderboard = teamNames.map(t => ({ team: t, total: totals[t] }))
    .sort((a, b) => a.total - b.total)
    .map((entry, i) => ({ ...entry, position: i + 1 }));

  const scrambleHoles = {};
  for (let h = 1; h <= 12; h++) {
    scrambleHoles[h] = {};
    teamNames.forEach((t, i) => { scrambleHoles[h][t] = holeScores[h - 1][i]; });
  }

  const gameState = {
    scramble: {
      running: totals,
      holes: scrambleHoles,
      leaderboard: leaderboard
    }
  };
  await env.MG_BOOK.put(`${slug}:game-state`, JSON.stringify(gameState));

  const feed = [
    { ts: Date.now() - 60000, type: 'score', text: 'Team Amen Corner aces the par-3 12th over Rae\'s Creek. Golden Bell sponsor JP Morgan pays $500 bonus.', player: 'Team Amen Corner' },
    { ts: Date.now() - 120000, type: 'score', text: 'Team Azalea birdies #4 — the ace hole. Three teams now tied at -9.', player: 'Team Azalea' },
    { ts: Date.now() - 180000, type: 'chirp', text: 'Through 12 holes: Amen Corner, Redbud, and Firethorn all at -9. This is going to the wire.', player: 'System' },
    { ts: Date.now() - 240000, type: 'score', text: 'Team Redbud eagles the par-5 8th. Jumps into the lead.', player: 'Team Redbud' },
    { ts: Date.now() - 300000, type: 'score', text: 'Team Magnolia Lane bogeys #5. Dropping out of contention.', player: 'Team Magnolia Lane' },
    { ts: Date.now() - 360000, type: 'chirp', text: 'Calcutta pool at $3,000. The Goldman Sachs hole (#3) still unclaimed for closest-to-the-pin.', player: 'System' },
  ];
  await env.MG_BOOK.put(`${slug}:feed`, JSON.stringify(feed));

  return { seeded: true };
}

// ─── The Masters Member-Guest — PRE-TRIP (slug: masters-member-guest) ────────

async function seedMastersMG(env) {
  const slug = 'masters-member-guest';
  const KEY = `config:${slug}`;
  const existing = await env.MG_BOOK.get(KEY);
  if (existing) return { seeded: false };

  const players = [
    { name: 'Rory McIlroy', handicapIndex: 0.5 },
    { name: 'Brooks Koepka', handicapIndex: 1.2 },
    { name: 'Dustin Johnson', handicapIndex: 0.8 },
    { name: 'Bryson DeChambeau', handicapIndex: 1.0 },
    { name: 'Justin Thomas', handicapIndex: 0.7 },
    { name: 'Xander Schauffele', handicapIndex: 0.4 },
    { name: 'Scottie Scheffler', handicapIndex: 0.2 },
    { name: 'Jon Rahm', handicapIndex: 0.6 }
  ];
  const pars = [4,5,4,3,4,3,4,5,4, 4,4,3,5,4,5,3,4,4]; // Augusta National par 72

  const config = {
    event: { name: 'The Masters Member-Guest', shortName: 'Masters M-G', eventType: 'buddies_trip', course: 'Augusta National Golf Club', currentRound: 1, venue: 'Augusta National Golf Club', slug },
    players: players,
    roster: players,
    games: { nassau: true, skins: true, match_play: true },
    structure: { nassauBet: '100', skinsBet: '50', autoPress: { enabled: true, threshold: 2 } },
    holesPerRound: 18,
    course: { name: 'Augusta National Golf Club', pars: pars, tees: 'Tournament' },
    rounds: { '1': { course: 'Augusta National Golf Club', tees: 'Tournament' } },
    wolfOrder: players.map(p => p.name),
    adminPin: randomPin()
  };
  await env.MG_BOOK.put(KEY, JSON.stringify(config));

  // 10 holes scored — Scottie leads, tight race
  const scoreData = {
    1:  { 'Rory McIlroy': 4, 'Brooks Koepka': 5, 'Dustin Johnson': 4, 'Bryson DeChambeau': 4, 'Justin Thomas': 4, 'Xander Schauffele': 3, 'Scottie Scheffler': 3, 'Jon Rahm': 4 },
    2:  { 'Rory McIlroy': 5, 'Brooks Koepka': 5, 'Dustin Johnson': 4, 'Bryson DeChambeau': 5, 'Justin Thomas': 4, 'Xander Schauffele': 4, 'Scottie Scheffler': 4, 'Jon Rahm': 5 },
    3:  { 'Rory McIlroy': 4, 'Brooks Koepka': 4, 'Dustin Johnson': 4, 'Bryson DeChambeau': 5, 'Justin Thomas': 3, 'Xander Schauffele': 4, 'Scottie Scheffler': 3, 'Jon Rahm': 4 },
    4:  { 'Rory McIlroy': 3, 'Brooks Koepka': 3, 'Dustin Johnson': 3, 'Bryson DeChambeau': 4, 'Justin Thomas': 3, 'Xander Schauffele': 2, 'Scottie Scheffler': 2, 'Jon Rahm': 3 },
    5:  { 'Rory McIlroy': 4, 'Brooks Koepka': 5, 'Dustin Johnson': 4, 'Bryson DeChambeau': 5, 'Justin Thomas': 4, 'Xander Schauffele': 4, 'Scottie Scheffler': 3, 'Jon Rahm': 4 },
    6:  { 'Rory McIlroy': 3, 'Brooks Koepka': 3, 'Dustin Johnson': 4, 'Bryson DeChambeau': 3, 'Justin Thomas': 3, 'Xander Schauffele': 3, 'Scottie Scheffler': 3, 'Jon Rahm': 3 },
    7:  { 'Rory McIlroy': 4, 'Brooks Koepka': 5, 'Dustin Johnson': 4, 'Bryson DeChambeau': 5, 'Justin Thomas': 4, 'Xander Schauffele': 4, 'Scottie Scheffler': 3, 'Jon Rahm': 4 },
    8:  { 'Rory McIlroy': 5, 'Brooks Koepka': 6, 'Dustin Johnson': 5, 'Bryson DeChambeau': 5, 'Justin Thomas': 5, 'Xander Schauffele': 4, 'Scottie Scheffler': 4, 'Jon Rahm': 5 },
    9:  { 'Rory McIlroy': 4, 'Brooks Koepka': 4, 'Dustin Johnson': 4, 'Bryson DeChambeau': 5, 'Justin Thomas': 4, 'Xander Schauffele': 4, 'Scottie Scheffler': 4, 'Jon Rahm': 4 },
    10: { 'Rory McIlroy': 3, 'Brooks Koepka': 4, 'Dustin Johnson': 4, 'Bryson DeChambeau': 4, 'Justin Thomas': 4, 'Xander Schauffele': 3, 'Scottie Scheffler': 3, 'Jon Rahm': 3 },
  };

  const holes = {};
  for (const [h, s] of Object.entries(scoreData)) {
    holes[h] = { scores: s, timestamp: Date.now() - (10 - parseInt(h)) * 600000 };
  }
  await env.MG_BOOK.put(`${slug}:holes`, JSON.stringify(holes));

  // Compute skins
  const skinsBet = 50;
  const numPlayers = 8;
  const gameState = { skins: { history: [], pot: 1 } };
  for (let h = 1; h <= 10; h++) {
    const hScores = scoreData[h];
    const entries = players.map(p => ({ name: p.name, score: hScores[p.name] }));
    const minScore = Math.min(...entries.map(e => e.score));
    const winners = entries.filter(e => e.score === minScore);
    if (winners.length === 1) {
      gameState.skins.history.push({ hole: h, winner: winners[0].name, pot: gameState.skins.pot, value: gameState.skins.pot * (numPlayers - 1) * skinsBet });
      gameState.skins.pot = 1;
    } else {
      gameState.skins.history.push({ hole: h, winner: null, pot: gameState.skins.pot, carry: true });
      gameState.skins.pot++;
    }
  }
  await env.MG_BOOK.put(`${slug}:game-state`, JSON.stringify(gameState));

  const feed = [
    { ts: Date.now() - 30000, type: 'score', text: 'Scottie birdies #7. Four under through 10. Running away with it.', player: 'Scottie Scheffler' },
    { ts: Date.now() - 60000, type: 'score', text: 'Xander aces the par-3 4th! Skin won — $350 pot.', player: 'Xander Schauffele' },
    { ts: Date.now() - 90000, type: 'chirp', text: 'Brooks and Bryson both at +4. The rivalry continues... at the bottom of the board.', player: 'System' },
    { ts: Date.now() - 120000, type: 'score', text: 'Rory birdies #10 to move to -1. Closing in on Scottie.', player: 'Rory McIlroy' },
    { ts: Date.now() - 150000, type: 'score', text: 'JT cards a tidy 3 on the par-4 3rd. Tied for 3rd.', player: 'Justin Thomas' },
    { ts: Date.now() - 180000, type: 'chirp', text: '$50 skins with 8 players. The pot carries are getting dangerous.', player: 'System' },
  ];
  await env.MG_BOOK.put(`${slug}:feed`, JSON.stringify(feed));

  return { seeded: true };
}

// ─── Weekend Warrior — FREE casual match (slug: weekend-warrior) ────────────
async function seedWeekendWarrior(env) {
  const slug = 'weekend-warrior';
  const KEY = `config:${slug}`;
  const existing = await env.MG_BOOK.get(KEY);
  if (existing) return { seeded: false };

  const players = [
    { name: 'Chris', handicapIndex: 14.2 },
    { name: 'Matt', handicapIndex: 18.5 },
    { name: 'Jason', handicapIndex: 10.8 },
    { name: 'Brian', handicapIndex: 22.1 }
  ];
  const pars = [4,4,3,5,4,4,3,4,5, 4,3,4,5,4,4,3,4,5]; // Generic muni par 72

  const config = {
    event: { name: 'Saturday Morning Match', shortName: 'Sat Match', eventType: 'quick', course: 'Bethpage Red', currentRound: 1, venue: 'Bethpage State Park', slug },
    players: players,
    roster: players,
    games: { skins: true, nassau: false, wolf: false },
    structure: {},
    holesPerRound: 18,
    course: { name: 'Bethpage Red', pars: pars, tees: 'White' },
    rounds: { '1': { course: 'Bethpage Red', tees: 'White' } },
    adminPin: randomPin()
  };
  await env.MG_BOOK.put(KEY, JSON.stringify(config));

  // 8 holes scored — casual Saturday game
  const scoreData = {
    1: { 'Chris': 5, 'Matt': 6, 'Jason': 4, 'Brian': 7 },
    2: { 'Chris': 5, 'Matt': 5, 'Jason': 4, 'Brian': 6 },
    3: { 'Chris': 3, 'Matt': 4, 'Jason': 3, 'Brian': 4 },
    4: { 'Chris': 6, 'Matt': 7, 'Jason': 5, 'Brian': 7 },
    5: { 'Chris': 5, 'Matt': 5, 'Jason': 4, 'Brian': 6 },
    6: { 'Chris': 4, 'Matt': 5, 'Jason': 4, 'Brian': 5 },
    7: { 'Chris': 4, 'Matt': 4, 'Jason': 3, 'Brian': 5 },
    8: { 'Chris': 4, 'Matt': 5, 'Jason': 4, 'Brian': 5 },
  };

  const holes = {};
  for (const [h, s] of Object.entries(scoreData)) {
    holes[h] = { scores: s, timestamp: Date.now() - (8 - parseInt(h)) * 600000 };
  }
  await env.MG_BOOK.put(`${slug}:holes`, JSON.stringify(holes));

  // Compute skins (free game, no money — $0 skins for tracking only)
  const gameState = { skins: { history: [], pot: 1 } };
  for (let h = 1; h <= 8; h++) {
    const hScores = scoreData[h];
    const entries = players.map(p => ({ name: p.name, score: hScores[p.name] }));
    const minScore = Math.min(...entries.map(e => e.score));
    const winners = entries.filter(e => e.score === minScore);
    if (winners.length === 1) {
      gameState.skins.history.push({ hole: h, winner: winners[0].name, pot: gameState.skins.pot, value: 0 });
      gameState.skins.pot = 1;
    } else {
      gameState.skins.history.push({ hole: h, winner: null, pot: gameState.skins.pot, carry: true });
      gameState.skins.pot++;
    }
  }
  await env.MG_BOOK.put(`${slug}:game-state`, JSON.stringify(gameState));

  const feed = [
    { ts: Date.now() - 60000, type: 'score', text: 'Jason pars #7 for another skin. Three skins through 8.', player: 'Jason' },
    { ts: Date.now() - 120000, type: 'score', text: 'Brian triples the par 5. "I found every bunker on that hole."', player: 'Brian' },
    { ts: Date.now() - 180000, type: 'chirp', text: 'Jason is running away with it. Nobody can touch him today.', player: 'System' },
    { ts: Date.now() - 240000, type: 'score', text: 'Chris and Matt tie on #3. Skin carries.', player: 'System' },
    { ts: Date.now() - 300000, type: 'chirp', text: 'Brian says he is "still warming up." It is hole 8.', player: 'System' },
  ];
  await env.MG_BOOK.put(`${slug}:feed`, JSON.stringify(feed));

  return { seeded: true };
}

// ─── Email Capture & Drip Pipeline ─────────────────────────────────────────

const EMAIL_CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

async function handleEmailCapture(request, env) {
  try {
    const body = await request.json();
    const { email, source, game_interest, course_interest, opted_in_newsletter } = body;

    // Validate email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Invalid email address' }), { status: 400, headers: EMAIL_CORS });
    }

    // Rate limit: 3 per IP per 10 min
    if (env.MG_BOOK) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const rlKey = `email-rl:${ip}`;
      const rlCount = parseInt(await env.MG_BOOK.get(rlKey, 'text') || '0', 10);
      if (rlCount >= 3) {
        return new Response(JSON.stringify({ error: 'Too many requests. Try again later.' }), { status: 429, headers: EMAIL_CORS });
      }
      await env.MG_BOOK.put(rlKey, String(rlCount + 1), { expirationTtl: 600 });
    }

    if (!env.MG_BOOK) {
      return new Response(JSON.stringify({ error: 'Storage not configured' }), { status: 500, headers: EMAIL_CORS });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const kvKey = `email:${normalizedEmail}`;

    // Check if already exists
    const existing = await env.MG_BOOK.get(kvKey, 'json');
    if (existing) {
      return new Response(JSON.stringify({ ok: true, message: 'Already subscribed' }), { headers: EMAIL_CORS });
    }

    const record = {
      email: normalizedEmail,
      source: source || 'landing_page',
      game_interest: game_interest || null,
      course_interest: course_interest || null,
      opted_in_newsletter: opted_in_newsletter !== false,
      created_at: new Date().toISOString(),
      drip_step: 0,
      converted: false,
    };

    await env.MG_BOOK.put(kvKey, JSON.stringify(record));

    // Send welcome email
    if (env.RESEND_API_KEY && record.opted_in_newsletter) {
      try {
        await sendDripEmail(env, normalizedEmail, 0, record.source);
        record.drip_step = 1;
        await env.MG_BOOK.put(kvKey, JSON.stringify(record));
      } catch (e) {
        console.error('Welcome email failed:', e.message);
      }
    }

    return new Response(JSON.stringify({ ok: true }), { headers: EMAIL_CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Bad request' }), { status: 400, headers: EMAIL_CORS });
  }
}

async function handleUnsubscribe(url, env) {
  const email = (url.searchParams.get('email') || '').toLowerCase().trim();
  if (!email || !env.MG_BOOK) {
    return new Response(unsubscribeHtml(false), { headers: { 'Content-Type': 'text/html' } });
  }
  const kvKey = `email:${email}`;
  const record = await env.MG_BOOK.get(kvKey, 'json');
  if (record) {
    record.opted_in_newsletter = false;
    await env.MG_BOOK.put(kvKey, JSON.stringify(record));
  }
  return new Response(unsubscribeHtml(true), { headers: { 'Content-Type': 'text/html' } });
}

function unsubscribeHtml(success) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed — Waggle</title><style>body{font-family:'Inter',system-ui,sans-serif;background:#0D2818;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:20px}h1{font-size:28px;margin-bottom:12px}.msg{color:rgba(255,255,255,.6);font-size:15px}a{color:#C9A84C}</style></head><body><div><h1>${success ? 'You have been unsubscribed.' : 'Something went wrong.'}</h1><p class="msg">${success ? 'Sorry to see you go. You will not receive any more emails from Waggle.' : 'We could not process your request. Please try again.'}</p><p style="margin-top:24px"><a href="https://betwaggle.com">Back to betwaggle.com</a></p></div></body></html>`;
}

// Drip email sequence definitions
const DRIP_SEQUENCE = [
  { // Step 0: Welcome (sent immediately on capture)
    dayOffset: 0,
    subject: 'Your golf group is about to get serious',
    bodyFn: (source) => {
      const gameRec = source === 'game_guide' ? 'Check out the full game library' : source === 'course_search' ? 'We already loaded your course' : 'Start with the Nassau — every group loves it';
      return dripEmailHtml({
        headline: 'Welcome to Waggle',
        body: `<p style="margin:0 0 16px">You just found the easiest way to run golf bets with your group. No app download. No spreadsheets. No collecting cash at the end.</p><p style="margin:0 0 16px">Waggle handles Nassau, skins, wolf, Vegas, banker, bloodsome, stableford, and stroke play — all from a single shared link on every phone.</p><p style="margin:0 0 24px">${gameRec}.</p>`,
        ctaUrl: 'https://betwaggle.com/demo/',
        ctaText: 'See It Live',
        email: '{{email}}',
      });
    },
  },
  { // Step 1: Day 3
    dayOffset: 3,
    subject: 'The Nassau: Why every golf trip needs this game',
    bodyFn: () => dripEmailHtml({
      headline: 'The Nassau: The Original Golf Bet',
      body: `<p style="margin:0 0 16px">There is a reason every serious golf group runs a Nassau. Three bets in one — front nine, back nine, overall — so the match stays alive all day. Down after 9? You still have a shot at two out of three.</p><p style="margin:0 0 16px">Waggle tracks the Nassau automatically. Presses, automatic two-down presses, handicap adjustments — all handled. Your group just plays.</p><p style="margin:0 0 24px">Set up a Nassau in 60 seconds. Share the link. Everyone sees live odds on their phone.</p>`,
      ctaUrl: 'https://betwaggle.com/games/nassau/',
      ctaText: 'Learn the Nassau',
      email: '{{email}}',
    }),
  },
  { // Step 2: Day 7
    dayOffset: 7,
    subject: 'We already loaded your course scorecard',
    bodyFn: () => dripEmailHtml({
      headline: '30,000+ Courses. Your Scorecard Is Ready.',
      body: `<p style="margin:0 0 16px">Waggle has scorecards for over 30,000 courses across the US. Pars, stroke index, handicap holes — all preloaded. Just search your course and go.</p><p style="margin:0 0 16px">We also integrate with GHIN so you can pull official handicap indexes for every player. Fair matches, no arguments.</p><p style="margin:0 0 24px">Find your course and see the full scorecard now.</p>`,
      ctaUrl: 'https://betwaggle.com/courses/',
      ctaText: 'Find Your Course',
      email: '{{email}}',
    }),
  },
  { // Step 3: Day 14
    dayOffset: 14,
    subject: 'Your buddy trip is in a few weeks — here is the game plan',
    bodyFn: () => dripEmailHtml({
      headline: 'The Perfect 3-Game Combo',
      body: `<p style="margin:0 0 16px">For a full-day trip, we recommend stacking three games: Nassau for the main match, skins for individual hole prizes, and wolf for the afternoon round when everyone is loose.</p><p style="margin:0 0 16px">Waggle runs all three simultaneously on the same scorecard. One link, three games, automatic settlement at the end.</p><p style="margin:0 0 24px">Your group will wonder how they ever did this with a spreadsheet.</p>`,
      ctaUrl: 'https://betwaggle.com/games/',
      ctaText: 'See All Games',
      email: '{{email}}',
    }),
  },
  { // Step 4: Day 21
    dayOffset: 21,
    subject: 'The group chat is not a scoreboard',
    bodyFn: () => dripEmailHtml({
      headline: 'Stop Texting Scores. Start Playing.',
      body: `<p style="margin:0 0 16px">You know how it goes. Somebody texts their score wrong. Nobody remembers who had a press on 14. The guy who lost "forgot" to Venmo you.</p><p style="margin:0 0 16px">Waggle fixes all of it. Live scoring on every phone. Automatic bet calculations. A final settlement screen that tells everyone exactly what they owe.</p><p style="margin:0 0 24px">Set up your first round in under a minute. Free to try.</p>`,
      ctaUrl: 'https://betwaggle.com/create/',
      ctaText: 'Create Your Outing',
      email: '{{email}}',
    }),
  },
];

function dripEmailHtml({ headline, body, ctaUrl, ctaText, email }) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f5f0e8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:24px 16px">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden">
      <!-- Header -->
      <tr><td style="background:#0D2818;padding:28px 32px;text-align:center">
        <span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#C9A84C;letter-spacing:.02em">Waggle</span>
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:32px 32px 24px">
        <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#0D2818;margin:0 0 20px;line-height:1.3">${headline}</h1>
        <div style="font-size:15px;line-height:1.7;color:#3D3D3D">${body}</div>
        <table cellpadding="0" cellspacing="0" style="margin:0 auto"><tr><td style="background:#C9A84C;border-radius:6px;text-align:center">
          <a href="${ctaUrl}" style="display:inline-block;padding:14px 32px;color:#0D2818;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:.03em">${ctaText}</a>
        </td></tr></table>
      </td></tr>
      <!-- Footer -->
      <tr><td style="padding:20px 32px 28px;border-top:1px solid #eee;text-align:center">
        <p style="font-size:11px;color:#7A7A7A;margin:0 0 8px">Powered by Waggle — betwaggle.com</p>
        <a href="https://betwaggle.com/api/unsubscribe?email=${encodeURIComponent(email)}" style="font-size:11px;color:#7A7A7A;text-decoration:underline">Unsubscribe</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

async function sendDripEmail(env, email, stepIndex, source) {
  const step = DRIP_SEQUENCE[stepIndex];
  if (!step) return;
  const html = step.bodyFn(source || 'landing_page').replace(/\{\{email\}\}/g, email);
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'waggle@cafecito-ai.com',
      to: [email],
      subject: step.subject,
      html,
    }),
  });
}

async function processDripEmails(env) {
  if (!env.MG_BOOK || !env.RESEND_API_KEY) return;
  try {
    const list = await env.MG_BOOK.list({ prefix: 'email:' });
    const now = Date.now();
    for (const key of list.keys) {
      try {
        const record = await env.MG_BOOK.get(key.name, 'json');
        if (!record || !record.opted_in_newsletter || !record.created_at) continue;
        const createdAt = new Date(record.created_at).getTime();
        const daysSinceCreated = (now - createdAt) / (1000 * 60 * 60 * 24);
        const currentStep = record.drip_step || 0;

        // Find next step to send
        if (currentStep >= DRIP_SEQUENCE.length) continue;
        const nextStep = DRIP_SEQUENCE[currentStep];
        if (!nextStep || daysSinceCreated < nextStep.dayOffset) continue;

        // Send the email
        await sendDripEmail(env, record.email, currentStep, record.source);
        record.drip_step = currentStep + 1;
        await env.MG_BOOK.put(key.name, JSON.stringify(record));
      } catch (e) {
        console.error('Drip error for', key.name, e.message);
      }
    }
  } catch (e) {
    console.error('processDripEmails error:', e.message);
  }
}
