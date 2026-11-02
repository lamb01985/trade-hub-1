# Protected preview operator-authentication repair

## Diagnosis

Canonical project trade-hub-1 / prj_QpHmjZ78bqsJNACjYh4HySRR4z4T, branch integration/tradehub-canonical-release. Original preview: https://trade-hub-1-27dofny6y-sarah-lambertsons-projects.vercel.app . Production was not changed.

Authenticated Vercel runtime logs confirmed HTTP **500** for /api/intelligence/session and /api/intelligence/login with **ERR_IMPORT_ATTRIBUTE_MISSING** for python-market-intelligence-v1.schema.json. The handler eagerly imported reports.js, which imported reportContract.js and its JSON schemas without native ESM import attributes. The consolidation's explicit ESM packaging exposed this cold-start defect. It failed before password, CSRF or session logic could run; an existing local password could not remedy it. A native Node import reproduced the defect independently of Vite's transforming test runtime.

Preview environment-name metadata also confirms:

| Configuration | Presence | Requirement |
|---|---|---|
| TRADEHUB_OPERATOR_ID | Absent | Owner-selected preview operator identifier |
| TRADEHUB_OPERATOR_PASSWORD_HASH | Absent | Owner-generated scrypt password verifier |
| TRADEHUB_APP_ORIGIN | Absent | Exact HTTPS origin used in the browser |
| KV_REST_API_URL | Present | Existing Redis REST URL |
| KV_REST_API_TOKEN | Present | Existing write-capable Redis REST token |

Presence is not a successful Redis connectivity/read/write test. Existing secret values were not printed, changed or copied. The preview has no existing automation-bypass credential in project metadata; none was created. Vercel SSO remains all_except_custom_domains. SSO and the application login are separate gates; a Vercel sign-in does not create an operator session.

Local read-only launcher authentication is process-local and ephemeral: it inserts a loopback-only in-memory session. It does not prove a configured hosted password or persistent Redis session. Hosted code fails closed outside the explicitly restricted development mode.

## Smallest code fix

Move the reports.js import from module scope into the already authenticated and quota-admitted latest-report action. Session/login/logout no longer depend on report schemas. Password hashing, session authorization, Redis persistence, CSRF comparison, cookie attributes and Vercel protection are unchanged. Reporting's native schema-import compatibility is outside this auth-only repair and is not claimed fixed.

## Validation

359 tests pass across 54 files; production build passes. Six added auth regressions cover native ESM cold start, anonymous provider denial, wrong password rejection, synthetic valid hosted login, persisted session across fresh modules/refresh checks, exact-origin CSRF checks, logout invalidation and storage failure. The synthetic hosted tests mock Redis and provider I/O; they do not use an owner's credential or write to the existing live Redis store. Existing operator-gate/security regressions also pass.

The cookie is host-only (no Domain), HttpOnly, Secure in hosted mode, SameSite=Strict, Path=/, with an eight-hour TTL. Only a SHA-256 digest of the opaque cookie ID is used as the Redis session key. JSON auth responses contain only authenticated state or safe error codes, not a cookie or password. Responses are private/no-store. Login/logout require exact Origin equality with TRADEHUB_APP_ORIGIN; do not set a wildcard, request-derived host, production origin or HTTP origin for preview.

## Owner-only setup

Use the existing **trade-hub-1** project's Settings → Environment Variables. Scope additions to **Preview**, preferably the **integration/tradehub-canonical-release** branch. Leave Production and existing variables unchanged. Do not prefix any of these with VITE_.

1. Set TRADEHUB_OPERATOR_ID to an owner-selected preview operator identifier.
2. Set TRADEHUB_OPERATOR_PASSWORD_HASH to a verifier generated from an owner-controlled password. Required format is exactly `32 lowercase hex salt characters:128 lowercase hex scrypt result characters`. Algorithm: Node crypto.scrypt(password, saltHexString, 64) using defaults N=16384, r=8, p=1; the salt is the UTF-8 hex string, not decoded salt bytes. A plaintext password, a bcrypt hash or the local launcher's temporary session is not valid.
3. Set TRADEHUB_APP_ORIGIN to `https://trade-hub-1-git-integration-t-fd326f-sarah-lambertsons-projects.vercel.app` (no trailing slash). This is the existing branch preview alias verified in canonical-project metadata. Use that same alias in the browser. A stable alias avoids an origin mismatch when redeployment changes the immutable deployment URL.
4. Retain the existing KV_REST_API_URL and KV_REST_API_TOKEN. If login then returns access_store_unconfigured or service_unavailable, verify their Preview scope and Redis access securely with the owner; do not substitute the read-only token, disable persistence or fall back to hosted memory.
5. Environment updates apply to a **new preview deployment**. Redeploy this branch as Preview in the existing project and repoint only the stable preview alias to that deployment. Never choose Production or promote the deployment. Open the stable alias after signing in through Vercel SSO.

Optional secure verifier generation, run **by the owner** in the candidate worktree. This reads a hidden password and writes a new mode-0600 ignored file; it never prints the password or hash. It will not overwrite an existing file. No hash generator was run against an owner credential during this task.

```sh
python3 - <<'PY'
import getpass, hashlib, os, secrets
from pathlib import Path
password = getpass.getpass('Preview operator password: ')
confirm = getpass.getpass('Confirm password: ')
if not password or password != confirm:
    raise SystemExit('Passwords must be nonempty and match')
if len(password.encode()) > 256:
    raise SystemExit('Password must be at most 256 UTF-8 bytes')
salt = secrets.token_hex(16)
verifier = salt + ':' + hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=64, maxmem=64*1024*1024).hex()
Path('.local').mkdir(mode=0o700, exist_ok=True)
fd = os.open('.local/preview-operator-verifier.txt', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as output:
    output.write(verifier)
print('Verifier saved in ignored .local/preview-operator-verifier.txt; transfer securely to the Preview variable, never Git or chat.')
PY
```

## Owner acceptance after configuration

Use browser DevTools Network status codes without copying cookies/passwords into screenshots, logs or chat. After Vercel SSO: session must return 200/authenticated:false, and desk/provider requests must reject anonymous access with 401. A valid operator login must return 200 and issue the protected cookie; refresh must retain the authenticated application. Wrong/missing Origin POST login/logout must return 403 (automated synthetic tests already verify this). Massive requests after login must return actual normalized observations or explicit entitlement/provider errors, never credentials. Logout must invalidate the server-side session; refresh and reuse of that former session must no longer authorize data access. Do not claim real-owner login acceptance until the owner completes this sequence.

If the exact Origin is not configured, login fails 403 origin_not_allowed. Once Origin is configured, missing/malformed verifier or operator ID produces 503 operator_login_unconfigured (provided Redis quota access succeeds). Wrong passwords produce 401 invalid_login. A Redis failure produces a closed 503. Vercel SSO redirects occur before the application and must not be mistaken for these app responses.
