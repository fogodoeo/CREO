# Packing label release — 2026-10-24

Scope: print.html shipping preview and optional sold_date bridge field, with matching local B1 renderer. Release risk because the web/desktop contract changes. No shipment, payment, bid, queue, or printer protocol changes.

- Only combined shipments have a 4-pixel outer border.
- Fixed vertical 파/도/직 indicators on the right; full carrier name outlined left of locality.
- Lot order/current lot highlight retained; count follows the companion list. Single labels omit duplicate lot/count.
- Destination and buyer remain one line, font fitted to available width.
- Date uses each item's stored broadcastDate (vendor-entry fallback), never updatedAt, current channel, or print date. Unknown date stays blank.
- Desktop bridge version 2 is required before sending to the printer, so an old process cannot silently omit date metadata.
- Desktop renderer updated in the local dc-monitor checkout; web deployment does not distribute or restart the desktop application.

Validation:
- `python -m unittest discover -p "test*.py"`: 282 passed.
- Final focused native renderer check after removing obsolete renderer: 18 passed.
- `npm test -- --test-concurrency=1`: 1,829 passed (includes latest remote promo commit).
- Initial parallel suite: 1,827/1,828 passed; unchanged buyer-library-entry async fixture timed out. Same source/test confirmed identical to HEAD; isolated rerun 8/8 and final serial suite passed. No unrelated product/test workaround added.
- Focused web packing/route/bundle/phone suite: 13 passed.
- `npm run check`, inline script parse, scoped `git diff --check`, strict UTF-8/replacement-character scan passed.
- Browser inspected all three carriers, combined and single labels using actual page styles/functions with fictitious data; screenshot stored under local outputs/preauction-label-30x50/web-verified.png.
- Native single/combined, route indicator, date transport, long text, unknown grouping, old queued-job wording tested without real printing.

Residual limits: no physical label printed. B1 Pro COM3 read-only device query timed out. Feed/retraction investigation is separate; printer commands remain unchanged. Numbering redesign is proposal-only.
