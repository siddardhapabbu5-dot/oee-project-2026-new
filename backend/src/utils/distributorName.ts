/** Normalize day-book party names so the same distributor is not stored twice. */

export function titleCaseName(s: string) {
  return s
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => {
      if (/^m\/s\.?$/i.test(w)) return 'M/s';
      if (/^[A-Z0-9]{2,4}$/i.test(w) && /\d/.test(w)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

function tokens(s: string) {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\bGARU\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripNoise(s: string) {
  return s
    .replace(/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\s*/g, '')
    .replace(/\b\d{1,2}\s*[/-]\s*\d{1,2}\s*[/-]\s*\d{2,4}\b/g, ' ')
    .replace(/\bfree\s+cases?\b/gi, ' ')
    .replace(/^\s*retail\s+/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ALIASES: Array<{ match: RegExp; key: string; display: string }> = [
  { match: /^good\s*w[ei]ll/i, key: 'GOODWILL FOODS AND BEVERAGES', display: 'Goodwill Foods And Beverages' },
  { match: /^crestal|^cristel/i, key: 'CRISTEL WATER', display: 'Cristel Water' },
  { match: /^bonam\s*rinu|^bonam\s*srinu|^bonamsrinu/i, key: 'BONAM SRINU', display: 'Bonam Srinu' },
  { match: /^hari\s*haran|^hariharan/i, key: 'HARIHARAN', display: 'Hariharan' },
  { match: /^mori\s*padu|^moripodu|^morupadu/i, key: 'MORIPODU', display: 'Moripodu' },
  { match: /^nanduri/i, key: 'NANDURI PAPA RAYADU', display: 'Nanduri Papa Rayadu' },
  { match: /^mangana|^mangina/i, key: 'MANGINA VENKATESWARA RAO', display: 'Mangina Venkateswara Rao' },
  { match: /^grandhi venkat|^grandi venkat/i, key: 'GRANDHI VENKATESWARAO', display: 'Grandhi Venkateswarao' },
  { match: /^sdt[-\s]*shakt/i, key: 'SDT SHAKTI', display: 'SDT Shakti' },
  { match: /^chakalapalam/i, key: 'CHAKALAPALAM KALYANAMANDAPAM', display: 'Chakalapalam Kalyanamandapam' },
  { match: /^undavalli hari/i, key: 'UNDAVALLI HARI KRISHNA', display: 'Undavalli Hari Krishna' },
  { match: /^kancharala bobby/i, key: 'KANCHARALA BOBBY', display: 'Kancharala Bobby' },
  { match: /^javvada srinivas/i, key: 'JAVVADA SRINIVAS', display: 'Javvada Srinivas' },
  { match: /^nagendra agencies/i, key: 'NAGENDRA AGENCIES', display: 'Nagendra Agencies' },
  { match: /^ganesh/i, key: 'GANESH', display: 'Ganesh' },
  { match: /^balu/i, key: 'BALU', display: 'Balu' },
  { match: /^rox/i, key: 'ROX WATER', display: 'Rox Water' },
  { match: /^bhagavan sir/i, key: 'BHAGAVAN SIR', display: 'Bhagavan Sir' },
  { match: /^(retail\s+)?villa subbarao/i, key: 'VILLA SUBBARAO', display: 'Villa Subbarao' },
  { match: /^rangaraju/i, key: 'RANGARAJU', display: 'Rangaraju' },
  { match: /^edukondalu/i, key: 'EDUKONDALU', display: 'Edukondalu' },
  { match: /^paiboina yesu babu/i, key: 'PAIBOINA YESU BABU', display: 'Paiboina Yesu Babu' },
  { match: /^[vu]allisi srinu/i, key: 'VULLISI SRINU', display: 'Vullisi Srinu Garu' },
  { match: /^bhanu badri|^badri bhanu/i, key: 'BADRI BHANU PRASANTH', display: 'Badri Bhanu Prasanth' },
];

export function canonicalDistributorKey(name: string) {
  const cleaned = stripNoise(name);
  const token = tokens(cleaned);
  for (const a of ALIASES) {
    if (a.match.test(cleaned) || a.match.test(token)) return a.key;
  }
  return token;
}

export function displayDistributorName(name: string) {
  const cleaned = stripNoise(name);
  const token = tokens(cleaned);
  for (const a of ALIASES) {
    if (a.match.test(cleaned) || a.match.test(token)) return a.display;
  }
  return titleCaseName(cleaned.replace(/\bgaru\b/gi, 'Garu'));
}

export function cleanDistributorArea(area?: string | null) {
  if (!area) return null;
  let s = area
    .replace(/\d+\s*\/\s*-?\s*\d+/g, ' ')
    .replace(/\b\d{1,2}\s*[/-]\s*\d{1,2}\s*[/-]\s*\d{2,4}\b/g, ' ')
    .replace(/[,;]+/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/^,|,$/g, '')
    .trim();
  if (!s) return null;
  s = s
    .replace(/\bbhimavarm\b/gi, 'Bhimavaram')
    .replace(/\btadapalligudam\b/gi, 'Tadapalli Gudam')
    .replace(/\btadaplli gudam\b/gi, 'Tadapalli Gudam')
    .replace(/\bt\.?\s*p\.?\s*gudam\b/gi, 'Tadapalli Gudam')
    .replace(/\batthli\b/gi, 'Attili')
    .replace(/\bathili\b/gi, 'Attili')
    .replace(/\brajahnmundry\b/gi, 'Rajahmundry')
    .replace(/\bkakka\b/gi, 'Kalla')
    .replace(/\bakivudu\b/gi, 'Akivedu')
    .replace(/\bdwraka tirmula\b/gi, 'Dwaraka Tirumala');
  const place = s.split(',')[0].trim();
  if (!place || place.length < 2) return null;
  return titleCaseName(place);
}
