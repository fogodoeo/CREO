'use strict';

// Browser and server must calculate shipping and payment state from exactly the
// same implementation. The public module is safe to ship because it contains
// only deterministic rules and no credentials or persisted customer data.
module.exports = require('./public/checkout-rules');
