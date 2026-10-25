# R2 media migration

Risk: **Release** (persistence and public media responses). No auction, winner,
payment, shipping or settlement records are migrated by the copy tool.

## Layout and access

- One **private** R2 Standard bucket, `creo-media`; public access remains disabled.
- Keys retain source namespaces (`auction-entry-photos/…`, `broadcast-assets/…`,
  `auction-captures/…`, `banner/…`, `allow_anon_all/…`, `auction-photos/…`).
- Repo-bundled images/video use `site-assets/<sha256>/<relative public path>`.
  A changed deployment asset cannot accidentally resolve to an older version.
- Entry photo records retain `/__entry_photo__/…` references. Existing signed
  application URLs and buyer links are unchanged. R2 URL signing happens locally.
- Public legacy URLs are translated only in JSON responses, only for this
  Supabase project's previously public namespaces. DB source URLs are not rewritten.
- Capture share tokens are checked before redirecting to R2. GET redirects keep
  Range headers; HEAD uses a separately signed HEAD request.
- R2 credentials belong only in Render secrets or an ignored local env file.
  No credential or signed URL belongs in the migration journal.

## Cloudflare prerequisites

1. Verify account email and activate R2. The account owner completes any payment
   method, subscription or terms steps.
2. Create the private Standard bucket. Do not enable `r2.dev` or a public domain
   for the shared bucket (it also contains private buyer/vendor photos).
3. Create a token limited to Object Read & Write for this bucket. Credential
   creation requires the account owner's action-time authorization.
4. Configure CORS for the actual website origins, GET and HEAD, allowing Range
   and exposing Content-Length, Content-Range, Accept-Ranges and ETag. This is
   necessary for cross-origin canvas/download tools as well as normal media.
5. Review/update the public privacy notice with the actual selected storage
   jurisdiction before transferring user uploads. Do not invent a storage country.

## Inventory, copy, verify

The tool defaults to read-only inventory. `--apply` copies without deleting or
overwriting originals, compares every destination byte using SHA-256, and emits
an append-only JSONL journal and a completed summary. Repeating a completed or
interrupted copy is safe for identical objects. A different existing destination
is a conflict and stops the copy; it is never silently replaced.

Run against the deployment's exact commit and persistent data directories:

```sh
node tools/migrate-media-r2.cjs --output /var/data/r2-audit/supabase-inventory
node tools/migrate-media-r2.cjs --apply --output /var/data/r2-audit/supabase-copy
node tools/migrate-media-r2.cjs --verify --output /var/data/r2-audit/supabase-verify
node tools/migrate-media-r2.cjs --source site --apply --output /var/data/r2-audit/site
node tools/migrate-media-r2.cjs --source broadcast-disk --directory /actual/broadcast-assets --apply --output /var/data/r2-audit/broadcast
node tools/migrate-media-r2.cjs --source capture-disk --directory /actual/capture-media --apply --output /var/data/r2-audit/capture
```

Missing legacy buckets are reported. Other, unrecognized buckets must be reviewed
before declaring all media migrated. Inventory database-embedded data URLs and
external URLs separately: the tool does not modify arbitrary DB records, download
third-party photos, or claim they were moved. The legacy CDCUP browser upload path
retains Supabase and its existing inline fallback until its vendor authentication
and record flow are migrated separately. Do not redirect it to the operator-only
broadcast upload API: those vendor pages do not have an operator session.

Avoid upload/delete/re-capture activity during the final inventory and verification:
Supabase offset pagination is not a snapshot, and capture object paths are mutable.
Repeat final verification before cutover. Review differences rather than overwriting.

## Activation and rollback

- Default `CREO_MEDIA_STORAGE=supabase`: original adapters, no R2 requests.
- `r2-read`: use verified R2 copies for reads, retain legacy writes. This is a
  rollout/rollback mode; credentials remain necessary to read R2-only uploads.
- `r2`: new uploads go to R2. `CREO_MEDIA_LEGACY_FALLBACK=true` keeps old missing
  objects readable. Permission errors/outages do not silently become legacy reads.
- Keep fallback until full inventories and browser checks pass. Repo assets always
  retain local fallback so a missing decorative asset cannot stop a broadcast.
- **After any R2-only write, do not roll back to old code or `supabase` mode:** it
  would hide those new objects. Use this release's `r2-read` mode instead. Before
  fully returning to old code, copy new R2 objects back and verify them separately.
- Capture writes during `r2-read` mark their authoritative legacy backend so an
  older R2 copy cannot shadow the new capture. Reconcile these captures before a
  subsequent all-R2 cutover.
- Retain originals. There is no source purge command in this release.

## Release evidence required

- Focused tests: immutable duplicates/concurrency, failure/retry, restart, expired
  and tampered URLs, namespace isolation, HEAD/Range, migration corruption and paging.
- `npm run check`, `npm test`, desktop unittest discovery, UTF-8 and diff checks.
- Local actual buyer photo viewer and broadcast-media rendering using isolated data.
- Real R2 signed GET/HEAD/Range/CORS test, existing buyer photo/parent photo read,
  public banner and capture read, unauthorized route denial after activation.
- Read-only production `/health` and static checks. Do not report full cutover
  until bucket provisioning, copy, verification and production configuration finish.

Known remaining work is recorded in the task response/audit. Do not treat this
runbook, isolated tests or an inventory-only summary as proof of production migration.
