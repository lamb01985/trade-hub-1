# Production provider credential containment — approval required

Base: current remote main `74fa8802c1272d21469416c2e5751bf3bc926ba6`.
Isolated branch: `fix/provider-key-containment`.
This patch does not include EdgeIQ, Thesis, Python, UI or deployment changes.

## Exposure

The production GET ws-auth handler directly calls requireApiKey and returns
`{apiKey}` with no caller authentication. The browser stores that key for a
provider WebSocket authentication frame. Anyone can call that route. The audit
confirmed anonymous HTTP200 credential delivery without displaying/saving the
value. Treat the credential as compromised; the patch does not revoke old copies.

## Minimal patch

- ws-auth always returns a static HTTP410 retirement response, with private,
  browser/CDN/Vercel no-store headers. No method, cookie, origin or missing env
  configuration can cause a provider-key read or delivery.
- REST responses remain available. Existing single/multi hooks already poll
  REST when the socket is disconnected. Direct browser WebSocket delivery and
  its quote stream are intentionally retired; fields available only through the
  socket will remain unavailable until the separately reviewed relay is deployed.
- Related credential paths: REST upstream bodies previously passed through raw,
  and proxy exception messages could echo a credential-bearing URL. The patch
  redacts literal/URL-encoded key echoes and credential fields, suppresses raw
  exception text, rejects caller key overrides, canonical-path escapes and
  redirects, and marks proxy responses no-store. Normal JSON market values stay
  intact. No new provider call, quota or subscription was introduced.

The server route inventory was inspected. No other direct unauthenticated
`process.env` credential-return handler was found. Schwab access/session/refresh
material is held server-side, with signed-session/debug guards on relevant
routes. This is not an exhaustive live/billing/OAuth test: notification and AI
endpoints still lack the broader operator protections present only in local
security work, and upstream messaging-error/log handling needs its own scoped
hardening. Do not claim that this emergency patch completes all security work.
No live notification/AI/provider analysis request was made during validation.

## Validation

80 tests passed across9 files, including16 new emergency regression cases;
production build passed with the existing chunk warning. Synthetic keys only.
Coverage: all tombstone methods/configurations, apparent cookies/origin,
no-store headers, no upstream calls, nested/encoded credential echoes, preserved
market observations, fetch-error/non-JSON suppression, URL escapes and key
injection. The patch has not been deployed and no credential was rotated.

## Exact production action — do not run until approved

1. Confirm remote main still equals the reviewed base. Review only this isolated
   diff; never merge the EdgeIQ development branches for containment.
2. Restore authorized Vercel access and identify the original `trade-hub-1`
   project. Verify the linked repository, production branch/domain and protection.
3. Build/deploy this exact hotfix revision as a protected Vercel Preview. Confirm
   anonymous/bypassed-private HTTP410 on ws-auth, no response credentials and
   healthy JSON REST shape using approved provider budget/access only.
4. After explicit production approval, deploy the reviewed hotfix revision to
   that project's Production environment or fast-forward/cherry-pick only the
   reviewed hotfix commit onto main through the approved emergency PR procedure.
   These are alternative release paths; do not merge unfinished feature history.
5. Verify every active production alias and the immutable deployment, confirm the
   exact Git SHA, no-store headers, no key in response/body/bundle/log output and
   expected REST-only degradation. Do not roll back to the vulnerable build.

Vercel Authentication on immutable Preview URLs does not secure the public
production alias. Restrict/retire the route itself. WAF/whole-project protection
can provide owner-approved immediate containment if deployment access is delayed.

## Safe credential rotation and post-fix verification

- Never paste, print, screenshot, commit or send a key through chat/CLI arguments.
- Inventory every consumer/environment using the exposed key, including original
  Vercel Production/Preview, old immutable deployments, Python/AWS and external
  jobs. Confirm account ownership and provider revocation behavior privately.
- Block public key delivery first. Create a replacement key in the provider
  dashboard only after explicit authorization; store it in the approved secret
  manager. Do not put the replacement into any vulnerable older build/profile.
- Revoke the compromised key promptly. Do not use it for smoke tests or rollback.
  A brief market-data outage is preferable to reusing it after containment.
- Update server-only key references for patched/approved consumers, preserve the
  shared account budget, then redeploy/restart those exact reviewed revisions.
  Preview-only UI needs no provider key. Do not change broker/Claude credentials
  without evidence and separate approval.
- Verify old-key rejection using a provider-supported private dashboard/revocation
  check; do not fetch the old public endpoint to recover it. Verify the replacement
  only through the budgeted server relay and emit status/identity/timestamps, not
  raw credential-bearing requests or errors.
- In fresh/incognito and previously open browsers, check GET/HEAD/POST ws-auth:
  fixed410, no credential fields, private/no-store at all CDN layers. Force a
  reload/close old tabs: an existing tab may still hold the compromised key.
- Check public preview/production aliases and old deployments; new keys must never
  be supplied to old key-return builds. Old deployment snapshots may still have
  the revoked value, which must remain unusable. Review provider/Vercel audit logs
  for unauthorized usage without copying credential-bearing URL details.
- Keep a rollback artifact containing this tombstone. Revert functionality only
  within a secure revision; do not restore credential delivery or the old key.

Remaining risk: the existing production REST proxy is still anonymous. This patch prevents key delivery and credential echo/redirect leakage; it does not establish operator authorization or strict account-wide admission. A rotated key must remain server-only, and owner-approved access restriction/budget hardening is still required to prevent unauthenticated quota abuse.
