// Deterministic, bounded checks for elementary Goldbach examples.
// This verifies finite arithmetic instances only; it cannot prove the conjecture.
function buildPrimeSieve(limit) {
  const prime = new Uint8Array(limit + 1);
  prime.fill(1);
  prime[0] = 0;
  prime[1] = 0;
  for (let p = 2; p * p <= limit; p++) {
    if (!prime[p]) continue;
    for (let multiple = p * p; multiple <= limit; multiple += p) prime[multiple] = 0;
  }
  return prime;
}

export function verifyGoldbachExample(prompt) {
  if (typeof prompt !== 'string' || !/goldbach/i.test(prompt)) return null;
  const matches = [...prompt.matchAll(/\b(?:n\s*=\s*)?(\d{2,7})\b/gi)];
  const candidate = matches
    .map(match => Number(match[1]))
    .find(value => Number.isSafeInteger(value) && value > 2 && value % 2 === 0 && value <= 100_000);
  if (!candidate) {
    return {
      checker: 'baye-deterministic-goldbach-v1',
      status: 'not_run',
      reason: 'Aucun entier pair explicite compris entre 4 et 100 000 n’a été identifié.',
      provesConjecture: false
    };
  }

  const prime = buildPrimeSieve(candidate);
  const pairs = [];
  for (let p = 2; p <= candidate / 2; p++) {
    if (prime[p] && prime[candidate - p]) pairs.push([p, candidate - p]);
  }
  return {
    checker: 'baye-deterministic-goldbach-v1',
    status: 'finite_instance_checked',
    n: candidate,
    representationCount: pairs.length,
    pairs,
    method: 'Crible d’Ératosthène puis énumération exhaustive de p + q = n avec p ≤ q.',
    scope: 'Vérifie uniquement cet entier pair, pas tous les entiers pairs.',
    provesConjecture: false
  };
}
