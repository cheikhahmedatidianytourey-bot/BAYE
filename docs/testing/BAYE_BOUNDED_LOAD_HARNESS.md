# BAYE bounded load harness

This tool measures simple HTTP GET response latency and status distribution. It is not a full load-testing or capacity-certification suite.

## Safety defaults
- localhost only; no external target by default
- remote use is restricted to HTTPS hosts matching `staging.*` and requires `--allow-staging true`
- production-like hostnames are rejected
- hard limits: 10 concurrent workers, 1,000 requests, 60 seconds, 15-second timeout
- GET only, no payloads, no auth headers, no secrets or production traffic
- use synthetic isolated staging and review with the environment owner before remote tests

## Offline self-test
`node scripts/baye-load.mjs --self-test`

## Local probe
`node scripts/baye-load.mjs --target http://127.0.0.1:3000/health --concurrency 3 --requests 100 --duration 10 --output report.json`

## Staging probe (only after explicit staging approval)
`node scripts/baye-load.mjs --target https://staging.example.com/health --allow-staging true --concurrency 3 --requests 100 --duration 10`

Remote allowlisting is intentionally restrictive. The report includes latency percentiles, status counts, error count, request rate and test parameters. It does not inspect CPU/RAM, simulate user sessions, test security vulnerabilities, or evaluate AI output quality.
