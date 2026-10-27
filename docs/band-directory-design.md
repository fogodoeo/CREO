# BAND member directory

The private member screen at `/band-members.html` reuses the existing BAND monitor's dark surfaces, mint primary action, blue links, typography and 1180px content width. No new brand palette is introduced. The two main groups are bot state and searchable members; member evidence is progressively disclosed with native `details`.

All controls have native labels, visible keyboard focus and 44px targets. Inputs stay at 16px. At narrow widths, member contact data and evidence stack without truncation. Dynamic loading, empty, signed-out and failure states use a stable status region. No motion is added.

Private member data is delivered only by the operator-authenticated directory API, never embedded in the public HTML or health endpoint. The worker token cannot read the operator's searchable member list. The phone source remains visible so operators can distinguish profile, application answer and verified disclosure.

The separate worker checks applications every three seconds. The main service sends a five-minute health request to keep the free worker reachable. Canonical member records, approval claims and encrypted refreshed sessions are stored on the main service's persistent disk. Existing Supabase membership records for other bands remain separate.
