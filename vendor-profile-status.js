'use strict';
function profileStatus(vendor, role = 'owner', requests = []) {
 const missing = [];
 if (!String(vendor?.phone || '').trim()) missing.push('contact');
 if (['bankName','bankAccount','bankHolder'].some(k => !String(vendor?.[k] || '').trim())) missing.push('bank');
 const logoMissing = !vendor?.logoUrl;
 const addressMissing = !String(vendor?.address || '').trim();
 return { required: missing, logoMissing, addressMissing, setupRequired: role === 'owner' && missing.length > 0,
  profileAttention: role === 'owner' && (missing.length > 0 || logoMissing || addressMissing || requests.length > 0),
  approvalCount: role === 'owner' ? requests.length : 0 };
}
module.exports = { profileStatus };
