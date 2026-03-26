// betwaggle.com — Standalone Waggle Worker
// Extracted from cafecito-ai monolith. All routes rewritten from /waggle/ to /

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // www redirect
    if (url.hostname === 'www.betwaggle.com') {
      return Response.redirect(`https://betwaggle.com${url.pathname}${url.search}`, 301);
    }

    // Health check
    if (url.pathname === '/health') {
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
        return new Response(JSON.stringify(courses), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch {
        return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
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

    // ===== UNSUBSCRIBE =====
    if (url.pathname === '/api/unsubscribe' && request.method === 'GET') {
      return handleUnsubscribe(url, env);
    }

    // ===== MULTI-TENANT EVENT API =====
    // /:slug/api/* — multi-tenant routes
    const waggleApiMatch = url.pathname.match(/^\/([a-z0-9_-]+)\/api\/(.*)/);
    if (waggleApiMatch && !['create', 'overview', 'tour', 'ads', 'gtm', 'affiliate', 'affiliates', 'marketing', 'go', 'success', 'courses', 'api', 'app', 'join', 'season', 'games'].includes(waggleApiMatch[1])) {
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

    // /:slug/ — serve the SPA with dynamic config
    const waggleSpaMatch = url.pathname.match(/^\/([a-z0-9_-]+)(\/.*)?$/);
    if (waggleSpaMatch && !url.pathname.includes('/api/') && !['join', 'create', 'overview', 'tour', 'ads', 'gtm', 'affiliate', 'affiliates', 'marketing', 'go', 'success', 'courses', 'api', 'app', 'season', 'games'].includes(waggleSpaMatch[1])) {
      const slug = waggleSpaMatch[1];
      // Serve static assets (JS/CSS/images) from /app/ (shared SPA code)
      const subPath = waggleSpaMatch[2] || '/';
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
        const configRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
        if (!configRaw) {
          return new Response(JSON.stringify({ error: 'Event not found' }), {
            status: 404, headers: { 'Content-Type': 'application/json' }
          });
        }
        try {
          const cfg = JSON.parse(configRaw);
          if (cfg.event) delete cfg.event.adminPin;
          return new Response(JSON.stringify(cfg), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }
          });
        } catch {
          return new Response(configRaw, {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }
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

    // /api/create-checkout — initiate Stripe payment before event creation
    if (url.pathname === '/api/create-checkout' && request.method === 'POST') {
      return handleCreateCheckout(request, env);
    }
    if (url.pathname === '/api/create-checkout' && request.method === 'OPTIONS') {
      return new Response(null, { headers: EVENT_CORS });
    }

    // /api/checkout-success — Stripe redirect after payment
    if (url.pathname === '/api/checkout-success' && request.method === 'GET') {
      return handleCheckoutSuccess(url, env);
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

    // /affiliate/ — affiliate link generator page (static)
    if (url.pathname === '/affiliate' || url.pathname === '/affiliate/') {
      const req = new Request(new URL('/affiliate/index.html', request.url), request);
      return env.ASSETS.fetch(req);
    }

    // /affiliate/generate — generate a referral link
    if (url.pathname === '/affiliate/generate' && request.method === 'GET') {
      return handleAffiliateGenerate(url);
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

    // / — landing page (static)
    if (url.pathname === '/' || url.pathname === '') {
      const landingReq = new Request(new URL('/index.html', request.url), request);
      return env.ASSETS.fetch(landingReq);
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

  // Cron handler: weekly digest + drip emails
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendWeeklyMarketingDigest(env));
    ctx.waitUntil(processDripEmails(env));
  },
};


// ─── Shared helpers ────────────────────────────────────────────────────────

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
          return new Response(JSON.stringify({
            name: `${g.first_name} ${g.last_name}`,
            handicapIndex: parseFloat(g.handicap_index) || 0,
            ghinNumber: g.ghin_number,
            club: g.club_name,
          }), { headers: EVENT_CORS });
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
          return new Response(JSON.stringify({
            name: (`${golfer.first_name || ''} ${golfer.last_name || ''}`).trim() || golfer.player_name || ghinNum,
            handicapIndex: parseFloat(golfer.handicap_index) || parseFloat(golfer.low_hi_display) || 0,
            ghinNumber: golfer.ghin_number || ghinNum,
            club: golfer.club_name || '',
          }), { headers: EVENT_CORS });
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
  { id: 'pebble-beach', name: 'Pebble Beach Golf Links', city: 'Pebble Beach', state: 'CA', slope: 145, rating: 74.7,
    par: [4,5,4,4,3,5,3,4,4,4,4,3,4,5,4,4,3,5],
    strokeIndex: [11,5,1,13,17,3,15,7,9,4,2,16,8,6,10,14,18,12] },
  { id: 'augusta-national', name: 'Augusta National Golf Club', city: 'Augusta', state: 'GA', slope: 137, rating: 76.2,
    par: [4,5,4,3,4,3,4,5,4,4,4,3,5,4,5,3,4,4],
    strokeIndex: [11,7,1,15,5,17,3,9,13,6,8,16,2,10,4,18,12,14] },
  { id: 'bethpage-black', name: 'Bethpage State Park (Black)', city: 'Farmingdale', state: 'NY', slope: 148, rating: 75.4,
    par: [4,4,3,5,4,4,3,5,4,4,3,4,5,3,4,4,3,4],
    strokeIndex: [7,1,15,5,9,11,17,3,13,4,16,2,6,18,8,10,14,12] },
  { id: 'torrey-pines-south', name: 'Torrey Pines Golf Course (South)', city: 'La Jolla', state: 'CA', slope: 144, rating: 76.1,
    par: [4,4,3,4,5,3,5,3,4,4,4,4,3,4,5,4,3,5],
    strokeIndex: [9,3,15,7,1,17,5,13,11,6,4,8,16,10,2,12,18,14] },
  { id: 'tpc-sawgrass', name: 'TPC Sawgrass (Stadium)', city: 'Ponte Vedra Beach', state: 'FL', slope: 147, rating: 76.8,
    par: [4,5,3,4,4,4,5,3,4,4,4,3,5,4,4,4,3,4],
    strokeIndex: [7,3,17,9,1,11,5,15,13,6,2,16,4,8,12,14,18,10] },
  { id: 'pinehurst-no2', name: 'Pinehurst Resort & Country Club (No. 2)', city: 'Pinehurst', state: 'NC', slope: 139, rating: 76.4,
    par: [4,4,4,4,4,3,4,3,4,4,4,3,4,4,5,4,3,4],
    strokeIndex: [5,1,9,13,3,17,7,15,11,4,2,16,8,10,6,12,18,14] },
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
      <td style="padding:10px 12px;font-weight:${i===0?700:500};color:#F9FAFB">${p.name}</td>
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
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0D2818;color:#F5F0E8;font-family:'Inter',sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:24px 16px}
.logo{width:48px;height:48px;border-radius:12px;margin-bottom:16px}
.event-name{font-family:'Playfair Display',serif;font-size:26px;font-weight:700;color:#D4AF37;text-align:center;line-height:1.2}
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
.success-title{font-family:'Playfair Display',serif;font-size:24px;color:#D4AF37;margin-bottom:8px}
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
  const err = document.getElementById('err');
  const btn = document.getElementById('btn-join');
  err.style.display = 'none';
  if (!name || name.length < 2) { err.textContent = 'Please enter your full name.'; err.style.display = 'block'; return; }
  if (isNaN(hi) || hi < -10 || hi > 54) { err.textContent = 'Please enter a valid handicap index.'; err.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = 'Joining...';
  try {
    const res = await fetch('/' + SLUG + '/api/join', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ name, hi })
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
document.getElementById('inp-hi').addEventListener('keydown', e => { if (e.key === 'Enter') submitJoin(); });
</script>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-store' } });
}

// ─── Stripe Payment Gate ───────────────────────────────────────────────

const WAGGLE_PRICES = { member_guest: 14900, trip: 3200, outing: 3200 };
const WAGGLE_LABELS = { member_guest: 'Waggle Member-Guest ($149)', trip: 'Waggle Buddies Trip ($32)', outing: 'Waggle Event ($32)' };

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

  const eventType = config.event?.format === 'round_robin_match_play' ? 'member_guest' : (config.event?.format || 'trip');
  const amount = WAGGLE_PRICES[eventType] ?? 3200;
  const label = WAGGLE_LABELS[eventType] ?? 'Waggle Event';

  const tempId = crypto.randomUUID();
  await env.MG_BOOK.put(`pending:${tempId}`, JSON.stringify(config), { expirationTtl: 7200 });

  const stripeBody = new URLSearchParams({
    'payment_method_types[]': 'card',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][product_data][name]': label,
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
  return new Response(JSON.stringify({ checkoutUrl: session.url }), { headers: EVENT_CORS });
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
  const result = await activateEvent(config, env);
  await env.MG_BOOK.delete(`pending:${tempId}`);

  const refCode = config.meta?.source?.ref || config.meta?.ref_code || '';
  if (refCode && env.WAGGLE_DB) {
    try {
      const eventType2 = config.event?.format === 'round_robin_match_play' ? 'member_guest' : 'trip';
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
        from: 'Waggle <events@betwaggle.com>',
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
      from: 'Waggle <events@betwaggle.com>',
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

  if (slug && env.MG_BOOK) {
    try {
      const raw = await env.MG_BOOK.get(`config:${slug}`, 'text');
      if (raw) {
        const cfg = JSON.parse(raw);
        eventName = cfg.event?.name || eventName;
        adminPin = cfg.event?.adminPin || '';
      }
    } catch (_) {}
  }

  if (!slug) {
    return Response.redirect('https://betwaggle.com/', 302);
  }

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
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
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
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --forest: #0D2818; --green: #1B4332; --green-mid: #2D6A4F; --sage: #52B788; --ivory: #F5F0E8; --gold: #C9A84C; --text: #1A1A1A; --muted: #6B7280; }
    body { font-family: 'Inter', sans-serif; background: var(--ivory); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; -webkit-font-smoothing: antialiased; }
    .card { background: #fff; border-radius: 16px; box-shadow: 0 2px 24px rgba(0,0,0,.08); padding: 48px 40px; width: 100%; max-width: 520px; text-align: center; }
    .check { width: 56px; height: 56px; background: var(--green-mid); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 28px; }
    .check svg { width: 26px; height: 26px; }
    h1 { font-family: 'Playfair Display', serif; font-size: 28px; font-weight: 700; color: var(--forest); margin-bottom: 10px; }
    .event-name { font-size: 15px; color: var(--muted); margin-bottom: 36px; }
    .share-label { font-size: 11px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--green-mid); margin-bottom: 10px; }
    .link-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .link-box { flex: 1; background: #F9FAFB; border: 1px solid #D1D5DB; border-radius: 8px; padding: 11px 14px; font-size: 14px; color: var(--forest); font-weight: 500; text-align: left; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .copy-btn { flex-shrink: 0; padding: 11px 18px; background: var(--green-mid); color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: 'Inter', sans-serif; transition: background .15s; white-space: nowrap; }
    .copy-btn:hover { background: var(--forest); }
    .copy-btn.copied { background: #059669; }
    .share-note { font-size: 12px; color: var(--muted); margin-bottom: 32px; line-height: 1.5; }
    .divider { border: none; border-top: 1px solid #E5E7EB; margin: 0 0 28px; }
    .steps { text-align: left; margin-bottom: 32px; }
    .steps-title { font-size: 12px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin-bottom: 14px; }
    .step { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px; font-size: 14px; color: var(--text); line-height: 1.5; }
    .step-num { flex-shrink: 0; width: 22px; height: 22px; background: var(--ivory); border: 1px solid #D1D5DB; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; color: var(--green-mid); margin-top: 1px; }
    ${adminPin ? `.pin-box { background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 10px; padding: 14px 18px; margin-bottom: 28px; font-size: 13px; color: var(--forest); text-align: left; } .pin-box strong { display: block; margin-bottom: 4px; } .pin-code { font-family: 'Courier New', monospace; font-size: 18px; font-weight: 700; letter-spacing: .12em; color: var(--green-mid); }` : ''}
    .btn-primary { display: block; background: var(--gold); color: var(--forest); font-size: 15px; font-weight: 600; padding: 15px 32px; border-radius: 8px; text-decoration: none; transition: background .2s; letter-spacing: .01em; }
    .btn-primary:hover { background: #d9b85c; }
    .btn-secondary { display: block; margin-top: 12px; font-size: 13px; color: var(--muted); text-decoration: none; text-align: center; }
    .btn-secondary:hover { color: var(--green-mid); }
  </style>
</head>
<body>
  <div class="card">
    <div class="check"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
    <h1>Your sportsbook is live.</h1>
    <p class="event-name">${eventName}</p>
    <p class="share-label">Share with your group</p>
    <div class="link-row">
      <div class="link-box" id="event-link">${eventUrl}</div>
      <button class="copy-btn" id="copy-btn" onclick="copyLink()">Copy</button>
    </div>
    <p class="share-note">Everyone opens this on their phone. No download needed.</p>
    <hr class="divider">
    ${adminPin ? `<div class="pin-box"><strong>Your admin PIN -- keep this safe</strong><div class="pin-code">${adminPin}</div><div style="font-size:12px;color:#6B7280;margin-top:6px">You'll need this to manage bets and settle the round.</div></div>` : ''}
    <div class="steps">
      <div class="steps-title">What to do next</div>
      <div class="step"><div class="step-num">1</div><div>Copy the link above and send it to your group in the chat</div></div>
      <div class="step"><div class="step-num">2</div><div>Open the event yourself first -- walk through setting your bets</div></div>
      <div class="step"><div class="step-num">3</div><div>On the first tee, everyone confirms their bets and tees off</div></div>
      <div class="step"><div class="step-num">4</div><div>After each hole, update scores -- settlements calculate automatically</div></div>
    </div>
    <a href="${eventUrl}" class="btn-primary">Open my event</a>
    <a href="https://betwaggle.com/" class="btn-secondary">Back to Waggle</a>
  </div>
  <script>
    function copyLink() {
      const link = document.getElementById('event-link').textContent.trim();
      const btn = document.getElementById('copy-btn');
      navigator.clipboard.writeText(link).then(function() {
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(function() { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
      }).catch(function() {
        prompt('Copy this link:', link);
      });
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
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}body{font-family:'Inter',sans-serif;background:#F5F0E8;color:#1A1A1A}a{color:inherit;text-decoration:none}.header{background:#0D2818;padding:20px 32px;display:flex;align-items:center;justify-content:space-between}.header-logo{display:flex;align-items:center;gap:10px;color:#fff;font-family:'Playfair Display',serif;font-size:18px;font-weight:700}.header-logo img{height:32px;border-radius:6px}.header-nav{display:flex;gap:20px;align-items:center}.header-nav a{color:rgba(255,255,255,0.7);font-size:13px;font-weight:500}.header-nav .cta{background:#C9A84C;color:#0D2818;padding:8px 16px;border-radius:8px;font-weight:700;font-size:13px}</style>
</head><body>
  <header class="header">
    <a href="/" class="header-logo"><img src="/logo.png" alt="Waggle"><span>Waggle</span></a>
    <nav class="header-nav"><a href="/courses/">Courses</a><a href="/create/?course=${courseId}" class="cta">Play Here</a></nav>
  </header>
  <div style="max-width:960px;margin:20px auto;padding:0 20px;font-size:13px;color:#7A7A7A"><a href="/" style="color:#2D6A4F;font-weight:600">Waggle</a> / <a href="/courses/" style="color:#2D6A4F;font-weight:600">Courses</a> / ${clubName}</div>
  <div style="max-width:960px;margin:16px auto 0;padding:0 20px">
    <div style="background:linear-gradient(135deg,#00261b,#0b3d2e);border-radius:16px;padding:40px 36px;color:#fff">
      <h1 style="font-family:'Playfair Display',serif;font-size:clamp(24px,4vw,36px);font-weight:700;line-height:1.15;margin-bottom:12px">${clubName}</h1>
      ${location ? `<div style="font-size:14px;color:rgba(255,255,255,0.6);margin-bottom:24px">${location}</div>` : ''}
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <a href="/create/?course=${courseId}" style="background:#C9A84C;color:#00261b;padding:14px 28px;border-radius:6px;font-weight:700;font-size:15px">Play Here \u2192</a>
        <a href="/courses/" style="background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.7);padding:14px 24px;border-radius:6px;font-weight:600;font-size:14px">\u2190 Back to Search</a>
      </div>
    </div>
  </div>
  <div style="max-width:960px;margin:32px auto 0;padding:0 20px">
    <h2 style="font-family:'Playfair Display',serif;font-size:22px;font-weight:700;color:#0D2818;margin-bottom:20px">Scorecard</h2>
    ${!refTee ? '<p style="color:#7A7A7A">No scorecard data available for this course.</p>' : `<p style="color:#7A7A7A;font-size:13px">Par ${refTee.front9.reduce((s,h) => s + (h.par||0), 0) + refTee.back9.reduce((s,h) => s + (h.par||0), 0)} \u00b7 ${validTees.length} tee${validTees.length !== 1 ? 's' : ''} available</p>`}
  </div>
  <footer style="text-align:center;padding:48px 20px 32px;color:#7A7A7A;font-size:13px">
    <p>Waggle by <a href="https://betwaggle.com/" style="color:#2D6A4F;font-weight:600">Waggle</a> \u00b7 <a href="/courses/" style="color:#2D6A4F;font-weight:600">Find a Course</a> \u00b7 <a href="/create/" style="color:#2D6A4F;font-weight:600">Create Event</a></p>
  </footer>
</body></html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=3600' }
  });
}

// ─── Stripe Webhook ───────────────────────────────────────────────────────

async function handleStripeWebhook(request, env) {
  if (env.STRIPE_WEBHOOK_SECRET) {
    const sig = request.headers.get('Stripe-Signature');
    if (!sig) return new Response('Missing signature', { status: 400 });
    const body = await request.text();
    const parts = Object.fromEntries(sig.split(',').map(p => { const [k,v] = p.split('='); return [k,v]; }));
    const timestamp = parts.t;
    const sigV1 = parts.v1;
    if (!timestamp || !sigV1) return new Response('Invalid signature format', { status: 400 });
    const payload = `${timestamp}.${body}`;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
    const expected = Array.from(mac).map(b => b.toString(16).padStart(2, '0')).join('');
    if (expected !== sigV1) return new Response('Invalid signature', { status: 400 });
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return new Response('Stale webhook', { status: 400 });
    var event = JSON.parse(body);
  } else {
    var event;
    try { event = await request.json(); } catch { return new Response('Bad request', { status: 400 }); }
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data?.object;
    const tempId = session?.metadata?.waggle_temp_id;
    if (tempId) {
      const configRaw = await env.MG_BOOK.get(`pending:${tempId}`, 'text');
      if (configRaw) {
        await activateEvent(JSON.parse(configRaw), env);
        await env.MG_BOOK.delete(`pending:${tempId}`);
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
  if (!Array.isArray(config.flightOrder)) config.flightOrder = Object.keys(config.flights || {});
  if (!config.flights) config.flights = {};
  if (!config.pairings) config.pairings = {};
  if (!config.structure) config.structure = {};
  if (!config.structure.roundDays) config.structure.roundDays = {};
  if (!config.structure.roundTimes) config.structure.roundTimes = {};

  await env.MG_BOOK.put(`config:${slug}`, JSON.stringify(config));

  if (env.WAGGLE_DB) {
    const id = `evt_${Date.now()}_${slug}`;
    const eventType = config.event?.eventType || 'unknown';
    const name = config.event?.name || slug;
    env.WAGGLE_DB.prepare(
      'INSERT OR IGNORE INTO events (id, slug, event_type, name, config, created_at) VALUES (?, ?, ?, ?, ?, datetime("now"))'
    ).bind(id, slug, eventType, name, JSON.stringify(config)).run().catch(() => {});
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
  const validPin = env.WAGGLE_MARKETING_PIN || 'waggle2026';
  if (pin !== validPin) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers });

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
        from: 'Waggle <noreply@betwaggle.com>',
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

function mktgAuth(pin, env) { return pin === (env.WAGGLE_MARKETING_PIN || 'waggle2026'); }

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

  if (posts.length === 0 || !env.ANTHROPIC_API_KEY) {
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
    const cr = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
    });
    const cd = await cr.json();
    const raw = cd.content?.[0]?.text || '';
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
  if (!env.ANTHROPIC_API_KEY) return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }), { status: 500, headers: ADS_JSON });
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
    const cr = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
    });
    const cd = await cr.json();
    const raw = cd.content?.[0]?.text || '';
    const match = raw.match(/\[[\s\S]*\]/);
    const variations = match ? JSON.parse(match[0]) : [];
    return new Response(JSON.stringify({ variations }), { headers: ADS_JSON });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'generation failed', detail: String(e) }), { status: 500, headers: ADS_JSON });
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
        from: 'Waggle Affiliates <events@betwaggle.com>',
        to: 'evan@cafecito-ai.com',
        subject: `Waggle Affiliate Payout Request: ${affiliate.name} \u2014 $${(owed / 100).toFixed(2)}`,
        html: `<p><strong>${affiliate.name}</strong> (code: ${code}) is requesting a payout of <strong>$${(owed / 100).toFixed(2)}</strong>.</p><p>PayPal: ${paypal_email || affiliate.paypal_email || '(not provided)'}</p>`
      }),
    }).catch(() => {});
  }
  return new Response(JSON.stringify({ ok: true, owed_cents: owed, message: 'Payout request sent. Expect payment within 3 business days.' }), { headers: AFFILIATE_CORS });
}

async function handleAffiliateAdmin(url, env) {
  if (!env.WAGGLE_DB) return new Response(JSON.stringify({ error: 'db not configured' }), { status: 500, headers: AFFILIATE_CORS });
  const pin = url.searchParams.get('pin');
  if (!pin || pin !== (env.ADMIN_PIN || 'waggle2026')) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: AFFILIATE_CORS });
  const affiliates = await env.WAGGLE_DB.prepare(`SELECT * FROM affiliates ORDER BY total_payout_cents DESC`).all();
  const referrals = await env.WAGGLE_DB.prepare(`SELECT * FROM referrals ORDER BY created_at DESC LIMIT 100`).all();
  return new Response(JSON.stringify({ ok: true, affiliates: affiliates.results, referrals: referrals.results }), { headers: AFFILIATE_CORS });
}

async function handleAffiliateMarkPaid(request, env) {
  if (!env.WAGGLE_DB) return new Response(JSON.stringify({ error: 'db not configured' }), { status: 500, headers: AFFILIATE_CORS });
  let body;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400, headers: AFFILIATE_CORS }); }
  const { code, amount_cents, pin } = body;
  if (!pin || pin !== (env.ADMIN_PIN || 'waggle2026')) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: AFFILIATE_CORS });
  if (!code || !amount_cents) return new Response(JSON.stringify({ error: 'code and amount_cents required' }), { status: 400, headers: AFFILIATE_CORS });
  await env.WAGGLE_DB.prepare(`UPDATE affiliates SET paid_out_cents = paid_out_cents + ? WHERE code = ?`).bind(amount_cents, code).run();
  await env.WAGGLE_DB.prepare(`UPDATE referrals SET status = 'paid' WHERE affiliate_code = ? AND status = 'pending'`).bind(code).run();
  return new Response(JSON.stringify({ ok: true, marked_paid_cents: amount_cents }), { headers: AFFILIATE_CORS });
}

async function handleAffiliatePage(url, env) {
  const code = url.searchParams.get('code') || '';
  // Simplified — the full affiliate page HTML is served from static assets
  // The API calls within the page use relative URLs which now point to betwaggle.com
  const req = new Request(new URL('/affiliate/index.html', url), { method: 'GET' });
  return env.ASSETS.fetch(req);
}

// ─── Serve dynamic event HTML ──────────────────────────────────────────

async function serveEventHtml(slug, request, env) {
  const configRaw = await env.MG_BOOK.get(`config:${slug}`, 'text');
  if (!configRaw) {
    return new Response(`<!DOCTYPE html><html><head><title>Event Not Found</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#F5F0E8;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;text-align:center;color:#1a1a1a}.logo{height:48px;margin-bottom:24px;opacity:0.6}h1{font-family:'Playfair Display',serif;font-size:28px;color:#1A472A;margin-bottom:12px}p{font-size:15px;color:#6B7280;margin-bottom:8px}.slug{font-weight:600;color:#1a1a1a}a.btn{display:inline-block;margin-top:20px;background:#1A472A;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px}a.btn:hover{background:#2D6A3E}</style></head>
<body>
<img src="/logo.png" alt="Waggle" class="logo">
<h1>Event not found</h1>
<p>No event exists at <span class="slug">/${slug}</span></p>
<p>It may have ended or the link might be wrong.</p>
<a href="/" class="btn">Go to Waggle</a>
</body></html>`, { status: 404, headers: { 'Content-Type': 'text/html' } });
  }

  let config;
  try { config = JSON.parse(configRaw); } catch {
    return new Response('Invalid event config', { status: 500 });
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
  const ogDesc = `Live scores, betting odds & side action for ${eventName}. ${venue}.`;
  const themeColor = esc(config.theme?.primary || '#1A472A');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="theme-color" content="${themeColor}">
  <title>${eventName}</title>
  <meta property="og:title" content="${eventName}">
  <meta property="og:description" content="${ogDesc}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${eventUrl}">
  <meta property="og:site_name" content="Waggle">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${eventName}">
  <meta name="twitter:description" content="${ogDesc}">
  <meta name="description" content="${ogDesc}">
  <meta name="apple-mobile-web-app-title" content="${shortName}">
  <link rel="icon" type="image/svg+xml" href="/${slug}/icon-180.svg">
  <link rel="manifest" href="/${slug}/manifest.json">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
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
  ${slug === 'demo' ? `<div style="background:#D4AF37;color:#0D2818;text-align:center;font-size:12px;font-weight:700;padding:7px 12px;letter-spacing:0.5px">INTERACTIVE DEMO &nbsp;\u00b7&nbsp; <a href="/" style="color:#0D2818;text-decoration:underline">Create your own event \u2192</a></div>` : ''}
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

function wggRunSkins(holeNum, grossScores, prevState, players, strokeIndex) {
  const holes = { ...(prevState.holes || {}) };
  const events = [];
  const net = wggNetScores(grossScores, players, holeNum, strokeIndex);
  const netVals = Object.values(net);
  const minNet = Math.min(...netVals);
  const winners = Object.keys(net).filter(n => net[n] === minNet);
  const prevPot = prevState.pot || 1;

  if (winners.length === 1) {
    holes[holeNum] = { winner: winners[0], potWon: prevPot, net, gross: grossScores };
    events.push({ type: 'skin_won', hole: holeNum, winner: winners[0], pot: prevPot });
    return { pot: 1, holes, events };
  }
  holes[holeNum] = { winner: null, carried: true, potBefore: prevPot, net, gross: grossScores };
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
    const contactMatch = isEmail ? contact === adminContact : normalizePhone(contact) === normalizePhone(adminContact) || contact === adminContact;
    if (!contactMatch) return new Response(JSON.stringify({ error: 'Contact does not match commissioner on file' }), { status: 401, headers: EVENT_CORS });

    const magicToken = crypto.randomUUID();
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    const rng = new Uint8Array(6);
    crypto.getRandomValues(rng);
    for (let i = 0; i < 6; i++) code += chars[rng[i] % chars.length];

    await env.MG_BOOK.put(`${K}:magic-auth`, JSON.stringify({ magicToken, code, expires: Date.now() + 600000, contact }), { expirationTtl: 600 });
    return new Response(JSON.stringify({ ok: true, sent: true, code }), { headers: EVENT_CORS });
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
    const { name, credits } = body;
    if (!name) return new Response(JSON.stringify({ error: 'Name required' }), { status: 400, headers: EVENT_CORS });
    const key = name.trim().toLowerCase();
    const players = (await env.MG_BOOK.get(`${K}:players`, 'json')) || {};
    if (players[key]) { players[key].credits = Math.floor(Number(credits) || 0); }
    else { players[key] = { name: name.trim(), credits: Math.floor(Number(credits) || 0), totalWagered: 0 }; }
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
    const name = (body.name || '').trim();
    const hi = parseFloat(body.hi);
    if (!name || name.length < 2 || name.length > 100) return new Response(JSON.stringify({ error: 'Name required (2-100 characters)' }), { status: 400, headers: EVENT_CORS });
    if (isNaN(hi) || hi < -10 || hi > 54) return new Response(JSON.stringify({ error: 'Valid handicap index required' }), { status: 400, headers: EVENT_CORS });
    const requests = (await env.MG_BOOK.get(`${K}:join-requests`, 'json')) || [];
    const pending = requests.filter(r => r.status === 'pending');
    if (pending.length >= 100) return new Response(JSON.stringify({ error: 'Registration is full' }), { status: 400, headers: EVENT_CORS });
    const id = crypto.randomUUID().slice(0, 8);
    requests.push({ id, name, hi, ts: Date.now(), status: 'pending' });
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
  if (path === 'bet' && request.method === 'POST') {
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
    await env.MG_BOOK.put(lockKey, lockId, { expirationTtl: 5 });

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
  }

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

      const holes = (await env.MG_BOOK.get(`${K}:holes`, 'json')) || {};
      holes[holeNum] = { scores, timestamp: Date.now(), enteredBy: 'admin' };
      await env.MG_BOOK.put(`${K}:holes`, JSON.stringify(holes));

      let gameState = (await env.MG_BOOK.get(`${K}:game-state`, 'json')) || {};
      const allEvents = [];
      const warnings = [];

      try {
        if (games.skins) {
          const prev = gameState.skins || { pot: 1, holes: {} };
          const result = wggRunSkins(holeNum, scores, prev, players, strokeIndex);
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
        if (games.stroke_play) {
          if (!gameState.stroke) gameState.stroke = { running: {} };
          const netScores2 = wggNetScores(scores, players, holeNum, strokeIndex);
          for (const [name, net] of Object.entries(netScores2)) {
            gameState.stroke.running[name] = (gameState.stroke.running[name] || 0) + net;
          }
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

      // Auto-generate activity feed
      try {
        const feed = (await env.MG_BOOK.get(`${K}:feed`, 'json')) || [];
        const pars = cfg?.course?.pars || cfg?.coursePars || [];
        const par = pars[holeNum - 1] || 4;
        for (const [pName, gross] of Object.entries(scores)) {
          let scoreText = `${pName} scored ${gross} on Hole ${holeNum}`;
          let scoreEmoji = '';
          const diff = gross - par;
          if (diff <= -2) { scoreText = `${pName} eagled Hole ${holeNum}!`; scoreEmoji = '\uD83E\uDD85'; }
          else if (diff === -1) { scoreText = `${pName} birdied Hole ${holeNum}`; scoreEmoji = '\uD83D\uDC26'; }
          else if (diff === 0) { scoreText = `${pName} parred Hole ${holeNum}`; scoreEmoji = '\u2705'; }
          else if (diff === 1) { scoreText = `${pName} bogeyed Hole ${holeNum}`; scoreEmoji = '\uD83D\uDE1E'; }
          else if (diff === 2) { scoreText = `${pName} double bogeyed Hole ${holeNum}`; scoreEmoji = '\uD83D\uDCA5'; }
          else if (diff >= 3) { scoreText = `${pName} took a ${gross} on Hole ${holeNum}`; scoreEmoji = '\uD83D\uDC80'; }
          feed.push({ id: `score_${holeNum}_${pName}_${Date.now()}`, type: 'score', player: pName, text: scoreText, emoji: scoreEmoji, ts: Date.now() });
        }
        while (feed.length > 200) feed.shift();
        await env.MG_BOOK.put(`${K}:feed`, JSON.stringify(feed));
      } catch (feedErr) { console.error('feed-auto-generate-error', feedErr.message); }

      return new Response(JSON.stringify({ ok: true, holeNum, events: allEvents, warnings }), { headers: EVENT_CORS });
    } catch (outerErr) {
      console.error('hole-handler-crash', { slug, error: outerErr.message });
      return new Response(JSON.stringify({ error: 'Internal error', detail: outerErr.message }), { status: 500, headers: EVENT_CORS });
    }
  }

  // GET /feed
  if (path === 'feed' && request.method === 'GET') {
    const feed = (await env.MG_BOOK.get(`${K}:feed`, 'json')) || [];
    return new Response(JSON.stringify(feed.slice(-50).reverse()), { headers: EVENT_CORS });
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

  return null;
}

// ─── AI Recap ─────────────────────────────────────────────────────────────

async function handleWaggleRecap(url, env) {
  const slug = url.searchParams.get('slug');
  if (!slug) return new Response(JSON.stringify({ error: 'slug required' }), { status: 400, headers: EVENT_CORS });
  if (!env.MG_BOOK) return new Response(JSON.stringify({ error: 'storage not configured' }), { status: 500, headers: EVENT_CORS });
  if (!env.ANTHROPIC_API_KEY) return new Response(JSON.stringify({ error: 'AI not configured' }), { status: 500, headers: EVENT_CORS });

  const [gameState, holes, configRaw] = await Promise.all([
    env.MG_BOOK.get(`${slug}:game-state`, 'json'),
    env.MG_BOOK.get(`${slug}:holes`, 'json'),
    env.MG_BOOK.get(`config:${slug}`, 'text'),
  ]);
  if (!configRaw) return new Response(JSON.stringify({ error: 'Event not found' }), { status: 404, headers: EVENT_CORS });

  const config = JSON.parse(configRaw);
  const eventName = config.event?.name || slug;
  const players = Object.values(config.teams || {}).map(t => ({ name: t.member, hi: t.memberHI || 0 }));
  const bets = config.bets || {};
  const holesPlayed = Object.keys(holes || {}).length;

  const prompt = `You are a witty golf writer. Write a compelling, shareable 3-5 paragraph round recap for a group of golfers. Use their real names, actual scores, and the drama of the betting formats. Keep it under 250 words.

Event: ${eventName}
Players: ${players.map(p => `${p.name} (HI: ${p.hi})`).join(', ')}
Format: ${config.event?.eventType || 'Nassau'}
Holes played: ${holesPlayed}/18
Game state summary: ${JSON.stringify(gameState || {}).slice(0, 1000)}
Hole scores: ${JSON.stringify(holes || {}).slice(0, 1500)}

Write the recap now. Lead with the most dramatic moment.`;

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 600, messages: [{ role: 'user', content: prompt }] }),
  });
  const aiJson = await aiRes.json();
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

Players (${players.length}): ${players.map(p => `${p.name || 'Player'} HI ${p.handicap || 0}`).join(', ')}
Handicap spread: ${spread.toFixed(1)} | Avg: ${avg.toFixed(1)}

Return JSON: {"recommended_format":"Nassau|Skins|Wolf|Vegas|Banker","stakes":"...","press_rules":"...","handicap_advice":"...","fun_tip":"...","reasoning":"..."}`;

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
  });
  const aiJson = await aiRes.json();
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
    return new Response(JSON.stringify(golfers), { headers: h });
  } catch { return new Response(JSON.stringify([]), { headers: h }); }
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
      from: 'tips@betwaggle.com',
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
