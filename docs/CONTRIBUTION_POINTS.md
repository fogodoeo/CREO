# Vendor contribution points

One point represents 10,000 KRW. Team members contribute 100%; captains contribute 200%. A 100,000 KRW sale therefore contributes 10 or 20 points. Fractional points are preserved (15,000 KRW contributes 1.5 or 3 points).

For compatibility, persisted `contributionRate` and public `vendorContributionRate` retain their existing role codes: `0.5` means member and `1` means captain. They are legacy role codes, not the current multiplier. The shared ranking engine performs the conversion. Do not migrate existing `0.5` values to `1`, which would change members into captains.

P3 and server rankings derive scores from the current sold records. Reopening or passing an item removes its contribution, and closing it again recomputes it without accumulating events. Actual sale totals remain in KRW. Contribution scoreboards expose the unit `점`.

The P3 central result uses the `p3-effect` placement slot and the team totals use `p3-board`. The central result appears only for the active sold item and contains its vendor logo (or vendor name fallback), winner alias, numeric sale amount, contribution multiplier, and points.
