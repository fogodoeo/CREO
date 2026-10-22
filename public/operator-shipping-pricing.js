(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./checkout-rules'));
    else root.CreoOperatorShippingPricing = factory(root.CreoCheckoutRules);
})(typeof window !== 'undefined' ? window : globalThis, function (Checkout) {
    'use strict';
    // Use the checkout allocation, including each saved quote, instead of dividing
    // a buyer's shipping fee by the number of items sold by each vendor.
    function calculate(items, channel, data) {
        const shipments = items.map(item => item._checkoutShipment).filter(Boolean);
        const latest = Checkout.newestShipment(shipments);
        const carrier = latest?.destinationType || ({'파르게':'parge','도도시':'dodosi'})[latest?.carrier];
        const label = ({parge:'파르게',dodosi:'도도시'})[carrier];
        const rates = Object.entries(data[label]?.regions || {}).map(([region, shops]) => ({region, shops:shops.map(shop => ({name:shop.shop,baseCost:Number(shop.cost)||0}))}));
        let selection = latest?.destinationType ? latest : null;
        if (!selection && latest && label && (channel.shippingDefaults?.enabledCarriers || ['parge']).includes(carrier)) {
            const compact=value=>String(value||'').replace(/[\s()·]/g,'');
            const matches=rates.flatMap(group=>group.shops.filter(shop=>[shop.name,group.region+shop.name].some(value=>compact(value)===compact(latest.address))).map(shop=>({region:group.region,shop:shop.name})));
            selection={destinationType:carrier,destinationId:carrier,pargeRegion:matches.length===1?matches[0].region:'',pargeShop:matches.length===1?matches[0].shop:''};
        }
        const shipping = Checkout.allocateShipping(items, selection, channel, rates, shipments);
        for (const item of items) {
            const saved = item._checkoutShipment;
            if (saved?.buyerSubmittedAt) shipping.allocations.set(item.id, Math.max(0, Number(saved.cost)||0));
        }
        const companies = {};
        for (const item of items) {
            const company = String(item.company || '').trim();
            companies[company] = (companies[company] || 0) + (shipping.allocations.get(item.id) || 0);
        }
        return {companies, total:Object.values(companies).reduce((sum, cost)=>sum+cost,0)};
    }
    return {calculate};
});
