'use strict';

// Keep the approved text and buttons in one auditable source.
const codes = Object.freeze({
    buyer_win_initial: 'UL_0880',
    buyer_win_additional: 'UL_0881',
    vendor_win: 'UL_0882',
    vendor_shipping_registered: 'UL_0883',
    vendor_payment_reported: 'UL_0883',
    vendor_card_requested: 'UL_0883',
    buyer_payment_confirmed: 'UK_9278'
});
const templates = Object.fromEntries(Object.entries(codes).map(([key, code]) => {
    const spec = require(`./docs/approved-alimtalk/${code}.json`);
    return [key, {
        code, subject: spec.title, content: spec.content,
        button: { button: spec.buttons.map(button => ({
            name: button.name, linkType: button.type,
            linkTypeName: button.type === 'AC' ? '채널 추가' : '웹링크',
            ...(button.mobileUrl ? { linkMo: button.mobileUrl, linkPc: button.pcUrl } : {})
        })) }
    }];
}));
module.exports = { codes, templates };
