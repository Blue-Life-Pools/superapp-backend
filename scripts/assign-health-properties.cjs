const baseUrl = process.env.API_URL || 'https://calculator-bluelife-backend.vercel.app';
const apply = process.argv.includes('--apply');

const ignoredWords = new Set([
  'the', 'at', 'apartments', 'apartment', 'homes', 'home', 'llc', 'pool',
  'pools', 'spa', 'swimming', 'amenity', 'office', 'main', 'back', 'front',
  'westside', 'cabana', 'lap', 'zero', 'entry', 'wading', 'clubhouse',
  'tennis', 'court', 'hill', 'seaglass', 'phase', 'one', 'two', 'three',
]);
const manualMatches = new Map(Object.entries({
  '7th and oaks pool': '7th & Oak',
  '7th and oaks spa': '7th & Oak',
  'addison at tampa oaks': 'The Addison Tampa',
  'aria': 'ARIA BRADENTON',
  'azalea apartments': 'AZALEA EAST TAMPA',
  'bayou point oficina': 'BAYOU POINT PINELLAS PARK',
  'belmont heights 2419': 'BELMONT HEIGHTS 1032 (2419)',
  'element on third': 'ELEMENTS ON THIRD',
  'element on third seaglass': 'ELEMENTS ON THIRD',
  'deeparth on the lake small pool': 'DEERPATH ON THE LAKE APARTMENTS',
  'gull harbor north': 'GULL HARBUOR',
  'gull harbor south': 'GULL HARBUOR',
  'keys at harbour island pool': 'THE KEYS IN HARBOUR ISLAND',
  'lestancia pool': "L'Estancia Apartments",
  'maa brandon back pool': 'MAA BRADON',
  'maa brandon office pool': 'MAA BRADON',
  'navara pool': 'NAVARA TAMPA',
  'navara the spa': 'NAVARA TAMPA',
  'orchard park': 'ORCHARD PARK APARMENTS',
  'palma ceia hyde park': 'PALMA CEIA',
  'parkway center pool': 'PARKWAY CENTER CDD',
  'parkway center spa': 'PARKWAY CENTER CDD',
  'pearce at pavilion spa': 'PEARCE AT PAVILLION',
  'preserve at mobbly bay': 'PRESERVE AT MOBBY BAY',
  'river tree landing': 'RIVERTREE LANDING',
  'sandanay village llc': 'SANDANAY ,STONEHENGE & CAMELOT APARTMENTS',
  'shade tree apartments': 'SHADETREE .',
  'skybeach hotel': 'SKY BEACH RESORT',
  'skybeach hotel spa': 'SKY BEACH RESORT',
  'the oceanaire south': 'THE OCEANEAIRE APARTMENTS',
  'the oceanaire apartments': 'THE OCEANEAIRE APARTMENTS',
  'tradition at palm aire cabana pool': 'THE CROSSING AT PALM AIRE-',
  'tradition at palm aire main pool': 'THE CROSSING AT PALM AIRE-',
  'tradition at palm aire spa': 'THE CROSSING AT PALM AIRE-',
  'tradition at palm aire westside pool': 'THE CROSSING AT PALM AIRE-',
  'windsor place at river ridge': 'HAMPTON / WINDSOR REC',
  'waterview at rocky point pool 2': 'WATERVIEW AT ROCKY POINT',
}));
const excludedAutomaticMatches = new Set([
  'deeparth on the lake small pool',
  'first avenue north apartments',
  'heron west',
  'lucerne tampa villas',
  'morgan creek apartments pool',
  'morgan creek wading pool',
  'park shore apartments',
  'serenity lakes',
  'story lake gibson',
]);

function key(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function words(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word && !ignoredWords.has(word));
}

function score(source, property) {
  const sourceWords = words(source);
  const propertyWords = words(property);
  if (!sourceWords.length || !propertyWords.length) return 0;
  const sourceSet = new Set(sourceWords);
  const propertySet = new Set(propertyWords);
  const intersection = [...sourceSet].filter((word) => propertySet.has(word)).length;
  const dice = (2 * intersection) / (sourceSet.size + propertySet.size);
  const sourceText = sourceWords.join(' ');
  const propertyText = propertyWords.join(' ');
  if (sourceText === propertyText) return 1;
  if (sourceText.includes(propertyText) || propertyText.includes(sourceText)) return Math.max(.9, dice);
  return dice;
}

function sourceName(ticket) {
  const raw = ticket.healthData?.Propiedad?.trim();
  if (raw) return raw;
  return String(ticket.subject || '')
    .replace(/^Health Department inspection\s*-\s*/i, '')
    .trim();
}

async function run() {
  const [ticketsResponse, propertiesResponse] = await Promise.all([
    fetch(`${baseUrl}/health-department/tickets`),
    fetch(`${baseUrl}/properties`),
  ]);
  if (!ticketsResponse.ok || !propertiesResponse.ok) throw new Error('Unable to load tickets or properties.');
  const tickets = await ticketsResponse.json();
  const properties = await propertiesResponse.json();
  const decisions = new Map();

  for (const ticket of tickets) {
    const source = sourceName(ticket);
    if (!source || /^property not assigned$/i.test(source)) {
      decisions.set(source, null);
      continue;
    }
    if (decisions.has(source)) continue;
    const sourceKey = key(source);
    const manualMatch = manualMatches.get(sourceKey);
    if (manualMatch) {
      decisions.set(source, manualMatch);
      continue;
    }
    if (excludedAutomaticMatches.has(sourceKey)) {
      decisions.set(source, null);
      continue;
    }
    const ranked = properties
      .map((property) => ({ property, score: score(source, property.name) }))
      .sort((a, b) => b.score - a.score || a.property.name.localeCompare(b.property.name));
    const best = ranked[0];
    const second = ranked[1];
    const confident = best.score >= .74 && (best.score === 1 || best.score - second.score >= .12);
    decisions.set(source, confident ? best.property.name : null);
  }

  const matchedTickets = tickets.filter((ticket) => decisions.get(sourceName(ticket)));
  const unmatchedNames = [...decisions].filter(([, property]) => !property).map(([source]) => source || '(blank)');
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    tickets: tickets.length,
    matchedTickets: matchedTickets.length,
    unmatchedTickets: tickets.length - matchedTickets.length,
    uniqueSourceNames: decisions.size,
    matchedSourceNames: decisions.size - unmatchedNames.length,
    unmatchedSourceNames: unmatchedNames.length,
  }, null, 2));
  console.log('\nMatches:');
  for (const [source, property] of [...decisions].filter(([, value]) => value).sort()) {
    console.log(`${source} => ${property}`);
  }
  console.log('\nUnmatched:');
  for (const source of unmatchedNames.sort()) console.log(source);

  if (!apply) return;
  let updated = 0;
  for (const ticket of tickets) {
    const propertyName = decisions.get(sourceName(ticket));
    if (!propertyName) continue;
    if ((ticket.propertyName || '') === propertyName) continue;
    const response = await fetch(`${baseUrl}/health-department/tickets/${encodeURIComponent(ticket.ticketNumber)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyName }),
    });
    if (!response.ok) throw new Error(`Unable to update ${ticket.ticketNumber}: ${response.status}`);
    updated++;
  }
  console.log(`\nUpdated tickets: ${updated}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
