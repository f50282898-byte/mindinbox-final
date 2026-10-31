/**
 * Comprehensive verification script for live Cloudflare Pages deployment.
 * Target: https://mindinbox-final.pages.dev
 */

const baseUrl = 'https://mindinbox-final.pages.dev';

async function testPages() {
  console.log('=== 1. Testing Pages ===');
  const pages = [
    '/',
    '/enter',
    '/journal',
    '/dialogue',
    '/quotes',
    '/wisdom',
    '/tracker',
    '/paths',
    '/pricing',
    '/account',
    '/privacy',
    '/terms',
    '/robots.txt',
    '/sitemap.xml'
  ];

  let passed = 0;
  for (const page of pages) {
    const res = await fetch(baseUrl + page);
    const ok = res.status === 200;
    if (ok) passed++;
    console.log(`[PAGE] ${page.padEnd(16)} -> HTTP ${res.status} ${ok ? '✅' : '❌'}`);
  }
  return passed === pages.length;
}

async function testApiEndpoints() {
  console.log('\n=== 2. Testing API Routes ===');
  let passed = 0;

  // 1. GET /api/ai
  {
    const res = await fetch(baseUrl + '/api/ai');
    const ok = res.status === 200;
    if (ok) passed++;
    const json = await res.json();
    console.log(`[API GET] /api/ai                -> HTTP ${res.status} ${ok ? '✅' : '❌'} (role: ${json.role}, personas: ${json.personas?.length})`);
  }

  // 2. POST /api/ai (SSE streaming with model chat reply)
  {
    const res = await fetch(baseUrl + '/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'أعطني حكمة في جملة واحدة عن الصبر.' }],
        role: 'chat'
      })
    });
    const text = await res.text();
    const ok = res.status === 200 && text.includes('data: {"type":"delta"');
    if (ok) passed++;
    console.log(`[API POST] /api/ai (SSE Chat)     -> HTTP ${res.status} ${ok ? '✅' : '❌'} (streamed deltas verified)`);
  }

  // 3. POST /api/dialogue (SSE streaming with multi-turn round)
  {
    const res = await fetch(baseUrl + '/api/dialogue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'round',
        question: 'ما هو أصل الطمأنينة؟',
        personas: ['plato', 'rumi'],
        transcript: [],
        round: 1
      })
    });
    const text = await res.text();
    const ok = res.status === 200 && text.includes('turn_start');
    if (ok) passed++;
    console.log(`[API POST] /api/dialogue (Round)  -> HTTP ${res.status} ${ok ? '✅' : '❌'} (turn_start verified)`);
  }

  // 4. POST /api/quotes/card
  {
    const res = await fetch(baseUrl + '/api/quotes/card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId: 'socrates-gadfly' })
    });
    const json = await res.json();
    const ok = res.status === 200 && json.ok === true && !!json.quote;
    if (ok) passed++;
    console.log(`[API POST] /api/quotes/card       -> HTTP ${res.status} ${ok ? '✅' : '❌'} (quote verified)`);
  }

  // 5. POST /api/signals
  {
    const res = await fetch(baseUrl + '/api/signals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: null, signals: [] })
    });
    const json = await res.json();
    const ok = res.status === 200 && json.ok === true;
    if (ok) passed++;
    console.log(`[API POST] /api/signals           -> HTTP ${res.status} ${ok ? '✅' : '❌'} (accepted: ${json.accepted})`);
  }

  return passed === 5;
}

async function main() {
  const pagesOk = await testPages();
  const apiOk = await testApiEndpoints();

  console.log('\n=== Summary ===');
  console.log(`Pages: ${pagesOk ? 'ALL PASS ✅' : 'FAIL ❌'}`);
  console.log(`API:   ${apiOk ? 'ALL PASS ✅' : 'FAIL ❌'}`);

  if (!pagesOk || !apiOk) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
