# Protected EdgeIQ UI-only preview

Approved design base: c80c25dec78e8f1b10d701fcedfebc2f3758c9b2.
Branch: preview/edgeiq-ui-c80c25d. This branch must not be merged to main or
promoted to Production. The original feature branch and unfinished notes remain
untouched. No Python/backend hosting or live integration is included.

## Release artifact and credential boundary

`npm run build:ui-preview` builds the approved React interface with an explicit
UI-only compile flag. OperatorGate is bypassed only in this static mode because
hosted access must be enforced independently by Vercel Authentication. This is
not a replacement for the normal operator gate, and the artifact cannot be
published until the actual project preview-auth policy is verified.

The artifact in `.vercel/output` uses Build Output API v3 with static files only,
zero functions and unconditional503 API routing before filesystem/SPA fallback.
The API source files in Git are not part of this artifact. Publish only with the
explicit prebuilt Preview deployment path; never deploy the source normally.
API routes, Python files, provider secret stores and broker account records are
not published. No environment-variable values are fetched from Vercel.

Every fetch in UI-only mode returns an explicit503 unavailable response locally
without contacting a server. The shared poller never reports connected or starts
polling. CSP independently disallows network connections, workers, object embeds
and unsafe script evaluation. Existing JSON validators initialize only when
needed, keeping unavailable research views compatible with CSP. Normal builds
retain operator authentication and financial validation.

The build rejects Production targets, VITE-prefixed secret variables, forbidden
static artifacts and configured secret literals/high-confidence key signatures
in built files. The manifest records the approved base, exact commit, zero
functions and no active services. Sensitive report/env/test/backend data remains
outside the published static directory. No sample prices, financial statements,
AI briefings or account values are substituted.

Git-triggered deployments are explicitly disabled in this branch and its ignored
build command exits without publishing, so pushing the branch/PR cannot publish
an unverified preview. This is version-controlled branch configuration, not a
change to project Production settings. Manual prebuilt deployment is allowed
only after current authenticated project metadata verifies the exact repository
and project, preview SSO protection, and the existing Production pointer.

## Verification and deployment procedure

1. Verify CLI login and GET the exact Git-linked `trade-hub-1` project. Do not read
   secret values. Require a protection policy covering every Preview URL and no
   applicable protection exceptions; record the Production id/SHA before release.
2. Run the full existing tests plus preview-specific regressions; build the static
   artifact; verify no `.vercel/output/functions` and no secret-bearing files.
3. Check all seven workspaces on localhost with the artifact's CSP, desktop and
   mobile navigation, no browser errors, no external/API requests and API503.
4. Commit/push only this branch and create a PR; do not merge. Rebuild after commit
   so `ui-preview-manifest.json` identifies the exact release revision.
5. Deploy using Vercel CLI `deploy --prebuilt --target=preview` against the verified
   local project link. Never use --prod, promote, alias, temporary or unclaimed
   deployment modes. Do not change shared environment variables.
6. Before providing a working URL, confirm fresh anonymous requests redirect to
   Vercel login (including API paths), and verify the UI through an authorized
   browser/bypass-header test. Never place a bypass secret in a URL, source, logs
   or public report. Verify all workspaces, mobile/CSP/error behavior, manifest,
   disabled API endpoints and zero functions from deployment metadata.
7. Re-read the Production pointer/SHA and confirm unchanged. Stop only the local
   temporary artifact server created for this review. Keep integrations disabled.

If protection, artifact isolation or authenticated verification cannot be proven,
do not deploy or describe the preview as verified. Report the exact blocker.

The emergency production provider-key patch is separate on
`fix/provider-key-containment`, based solely on Production main74fa880. This
preview does not contain or deploy that hotfix, revoke the exposed key, alter
production aliases, or resolve the existing production exposure.

Pre-deployment evidence: current authenticated Vercel project lookup matches
`lamb01985/trade-hub-1`, production branch main, SSO policy
`all_except_custom_domains`, zero protection exceptions, and production revision
74fa880. No environment values were retrieved. All259 tests passed; the static
build passed; real localhost desktop/mobile checks passed all seven workspaces
under CSP with no browser errors and no API/external requests. EGM independent
review found no Blocker/Major under the strict prebuilt Preview procedure; final
artifact must be rebuilt from the committed revision and checked after hosting.
