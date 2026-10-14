'use strict';

const { normalizePhone } = require('./band-membership');

function nameKey(value) {
    return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

// Only the current channel's unique, active business can supply a missing
// buyer contact. This is used at sale time, never to reassign historical sales.
function registeredVendorBuyerPhone(item, vendors = []) {
    const name = nameKey(item?.winnerName || item?.winnerAlias);
    if (!name) return '';
    const matches = vendors.filter(vendor => vendor && vendor.active !== false && !vendor.deletedAt
        && (!vendor.channelId || !item?.channelId || vendor.channelId === item.channelId)
        && nameKey(vendor.name) === name);
    if (matches.length !== 1) return '';
    // Use the business notification number, not a public inquiry/staff number.
    return normalizePhone(matches[0].phone);
}

module.exports = { registeredVendorBuyerPhone };
