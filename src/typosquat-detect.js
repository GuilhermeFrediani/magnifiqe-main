/**
 * Typosquat Detection Tool
 * Detects typosquatting in npm package names using Levenshtein distance
 * and metadata heuristics.
 */

// Keyboard neighbor map for substitution detection
const KEYBOARD_NEIGHBORS = {
  a: 'sqwz',
  b: 'vghn',
  c: 'xdfv',
  d: 'sfcxer',
  e: 'dwrs',
  f: 'dgcvrt',
  g: 'fhbvty',
  h: 'gjbnyu',
  i: 'uojk',
  j: 'hknmui',
  k: 'jlmio',
  l: 'kop',
  m: 'njk',
  n: 'bhjm',
  o: 'iplk',
  p: 'ol',
  q: 'wa',
  r: 'edft',
  s: 'awedx',
  t: 'rfgy',
  u: 'yhji',
  v: 'cfgb',
  w: 'qase',
  x: 'zsdc',
  y: 'tghu',
  z: 'xsa',
  '0': '19',
  '1': '02',
  '2': '13',
  '3': '24',
  '4': '35',
  '5': '46',
  '6': '57',
  '7': '68',
  '8': '79',
  '9': '80',
};

// Common typosquatting suffixes
const SUSPICIOUS_SUFFIXES = ['-cli', '-util', '-pro', '-dev', '-tools', '-lib', '-core', '-plus'];

/**
 * Calculate Levenshtein distance between two strings.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[a.length][b.length];
}

/**
 * Generate typosquatting candidates from a package name.
 * @param {string} name
 * @returns {Array<{ name: string, method: string }>}
 */
export function generateCandidates(name) {
  const candidates = [];
  const seen = new Set();
  
  const addCandidate = (candidateName, method) => {
    if (candidateName && candidateName !== name && !seen.has(candidateName)) {
      seen.add(candidateName);
      candidates.push({ name: candidateName, method });
    }
  };

  // 1. Omission: remove one character
  for (let i = 0; i < name.length; i++) {
    addCandidate(name.slice(0, i) + name.slice(i + 1), 'omission');
  }

  // 2. Transposition: swap adjacent characters
  for (let i = 0; i < name.length - 1; i++) {
    if (name[i] !== name[i + 1]) {
      const swapped = name.slice(0, i) + name[i + 1] + name[i] + name.slice(i + 2);
      addCandidate(swapped, 'transposition');
    }
  }

  // 3. Substitution: replace character with keyboard neighbor
  for (let i = 0; i < name.length; i++) {
    const char = name[i].toLowerCase();
    const neighbors = KEYBOARD_NEIGHBORS[char] || '';
    for (const neighbor of neighbors) {
      const substituted = name.slice(0, i) + neighbor + name.slice(i + 1);
      addCandidate(substituted, 'substitution');
    }
  }

  // 4. Insertion: add an extra character
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  for (let i = 0; i <= name.length; i++) {
    for (const char of chars) {
      const inserted = name.slice(0, i) + char + name.slice(i);
      if (inserted !== name) {
        addCandidate(inserted, 'insertion');
        break; // Only one insertion per position to keep it reasonable
      }
    }
  }

  // 5. Separator: change - to _ or remove -
  if (name.includes('-')) {
    addCandidate(name.replace(/-/g, '_'), 'separator');
    addCandidate(name.replace(/-/g, ''), 'separator');
  } else if (name.includes('_')) {
    addCandidate(name.replace(/_/g, '-'), 'separator');
  }

  return candidates;
}

/**
 * Calculate risk score for a candidate.
 * @param {string} original
 * @param {string} candidate
 * @param {string} method
 * @returns {{ score: number, risk: string }}
 */
export function scoreCandidate(original, candidate, method) {
  let score = 0;
  
  // Levenshtein distance (weight: 40%, adjusted for name length)
  const distance = levenshteinDistance(original, candidate);
  const maxLength = Math.max(original.length, candidate.length);
  
  // For short names (<=7 chars), distance-1 is very suspicious
  // For longer names, reduce score slightly to avoid false positives
  if (maxLength <= 7) {
    if (distance <= 1) score += 40;
    else if (distance === 2) score += 30;
    else if (distance <= 3) score += 15;
    else score += 5;
  } else {
    // For longer names (8+ chars), reduce distance-1 score
    if (distance === 1) score += 30;  // Still significant but not as alarming
    else if (distance === 2) score += 25;
    else if (distance <= 3) score += 15;
    else score += 5;
  }

  // Length ratio (weight: 30%)
  const lengthRatio = Math.min(original.length, candidate.length) / 
                      Math.max(original.length, candidate.length);
  score += lengthRatio * 30;

  // Suspicious suffixes (weight: 20%)
  for (const suffix of SUSPICIOUS_SUFFIXES) {
    if (candidate.endsWith(suffix)) {
      score += 15;
      break;
    }
  }

  // Method-specific bonus (weight: 10%)
  const methodScores = {
    omission: 10,
    transposition: 10,
    substitution: 8,
    separator: 7,
    insertion: 5,
  };
  score += methodScores[method] || 0;

  // Determine risk level
  let risk;
  if (score >= 70) risk = 'high';
  else if (score >= 40) risk = 'medium';
  else risk = 'low';

  return { score, risk };
}

/**
 * Detect typosquatting in an npm package name.
 * @param {string} packageName
 * @returns {{ verdict: string, package: string, candidates: Array, recommendation: string }}
 */
export function detectTyposquat(packageName) {
  if (!packageName || typeof packageName !== 'string') {
    return {
      verdict: 'PASS',
      package: packageName || '',
      candidates: [],
      recommendation: 'Invalid package name provided.',
    };
  }

  const candidates = generateCandidates(packageName);
  
  // Score and filter candidates
  const scoredCandidates = candidates
    .map(c => {
      const { score, risk } = scoreCandidate(packageName, c.name, c.method);
      const distance = levenshteinDistance(packageName, c.name);
      return { ...c, distance, score, risk };
    })
    .filter(c => c.score >= 40 && c.distance <= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20); // Limit to top 20

  // Determine verdict
  let verdict;
  const highRiskCount = scoredCandidates.filter(c => c.risk === 'high').length;
  const mediumRiskCount = scoredCandidates.filter(c => c.risk === 'medium').length;

  if (highRiskCount > 0) {
    verdict = 'HALT';
  } else if (mediumRiskCount > 0) {
    verdict = 'WARN';
  } else {
    verdict = 'PASS';
  }

  // Generate recommendation
  let recommendation;
  if (verdict === 'HALT') {
    const highExamples = scoredCandidates
      .filter(c => c.risk === 'high')
      .slice(0, 3)
      .map(c => `"${c.name}" (${c.method})`);
    recommendation = `High risk of typosquatting detected. Similar packages: ${highExamples.join(', ')}. Consider using a more unique name.`;
  } else if (verdict === 'WARN') {
    const mediumExamples = scoredCandidates
      .filter(c => c.risk === 'medium')
      .slice(0, 3)
      .map(c => `"${c.name}" (${c.method})`);
    recommendation = `Potential typosquatting risk. Similar packages: ${mediumExamples.join(', ')}. Review these packages before proceeding.`;
  } else {
    recommendation = 'No significant typosquatting risks detected. Package name appears unique.';
  }

  return {
    verdict,
    package: packageName,
    candidates: scoredCandidates,
    recommendation,
  };
}
