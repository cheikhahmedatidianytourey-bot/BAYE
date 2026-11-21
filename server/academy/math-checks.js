// Deterministic, bounded checks for elementary Goldbach examples.
// This verifies finite arithmetic instances only; it cannot prove the conjecture.
function isPrime(n) {
  if (!Number.isSafeInteger(n) || n < 2) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let d = 3; d * d <= n; d += 2) {
    if (n % d === 0) return false;
  }
  return true;
}

export function verifyGoldbachExample(prompt) {
  if (typeof prompt !== 'string' || !/goldbach/i.test(prompt)) return null;
  const matches = [...prompt.matchAll(/\b(?:n\s*=\s*)?(\d{2,7})\b/gi)];
  const candidate = matches
    .map(match => Number(match[1]))
    .find(value => Number.isSafeInteger(value) && value > 2 && value % 2 === 0 && value <= 2_000_000);
  if (!candidate) {
    return {
      checker: 'baye-deterministic-goldbach-v1',
      status: 'not_run',
      reason: 'Aucun entier pair explicite compris entre 4 et 2 000 000 n’a été identifié.',
      provesConjecture: false
    };
  }

  const pairs = [];
  for (let p = 2; p <= candidate / 2; p++) {
    if (isPrime(p) && isPrime(candidate - p)) pairs.push([p, candidate - p]);
  }
  return {
    checker: 'baye-deterministic-goldbach-v1',
    status: 'finite_instance_checked',
    n: candidate,
    representationCount: pairs.length,
    pairs,
    method: 'Énumération exhaustive des p premiers avec 2 ≤ p ≤ n/2 et test de primalité par division.',
    scope: 'Vérifie uniquement cet entier pair, pas tous les entiers pairs.',
    provesConjecture: false
  };
}
