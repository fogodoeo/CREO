'use strict';
const crypto = require('node:crypto');
const D = require('./dodosi-routes');
const Phone = require('./public/mobile-phone');
const Sender = require('./public/parge-dispatch-core');
const text = v => String(v ?? '').trim();
function build(workspace, channelId, data, config, now = Date.now()) {
  const groups = new Map(), excluded = [], ids = new Map();
  for (const i of workspace.items || []) ids.set(i.id, (ids.get(i.id) || 0) + 1);
  for (const item of workspace.items || []) {
    if (item.channelId && item.channelId !== channelId || !['sold','낙찰'].includes(item.status)) continue;
    const skip = reason => excluded.push({ lot: text(item.name), reason });
    const rows = (workspace.shipments || []).filter(s => s.itemId === item.id && (!s.channelId || s.channelId === channelId));
    if (!item.id || ids.get(item.id) !== 1 || rows.length !== 1) { skip('배송 기록 확인 필요'); continue; }
    const s = rows[0];
    if (s.method === 'pickup' || !['dodosi','도도시'].includes(s.destinationType || s.destinationId || s.carrier)) continue;
    if (s.shippedAt || s.deliveredAt || ['shipped','delivered','cancelled'].includes(s.status)) continue;
    if (item.buyerSaleId && s.buyerSaleId && item.buyerSaleId !== s.buyerSaleId) { skip('재경매 전 배송 기록'); continue; }
    const phone = Phone.normalizeMobilePhone(s.recipientPhone || item.winnerPhone), buyer = Phone.normalizeMobilePhone(item.winnerPhone) || phone;
    const name = Phone.buyerDisplayName(s.recipientName || item.winnerName || item.winnerAlias);
    const target = D.match(data, s.pargeShop, s.pargeRegion);
    if (!phone || !name || !target) { skip('받는 분·연락처·정거샵 확인 필요'); continue; }
    const key = JSON.stringify([channelId,buyer,phone,name,target.id]);
    if (!groups.has(key)) groups.set(key,{ key, name, phone, shop:target.label, destinationId:target.id, quantity:0, paid:true, items:[] });
    const g = groups.get(key); g.quantity++; g.paid &&= s.paymentStatus === 'paid';
    g.items.push({ id:item.id, lot:text(item.name), shipmentId:s.id, buyerSaleId:item.buyerSaleId || '', revision:s.updatedAt || '', paymentStatus:s.paymentStatus });
  }
  return { groups:[...groups.values()].map(g => {
    g.items.sort((a,b)=>a.id.localeCompare(b.id));
    const id=crypto.createHash('sha256').update(JSON.stringify(g)).digest('hex');
    const route=data?.routes.find(r=>r.from===data.origin&&r.to===g.destinationId);
    const schedule=config?.auctionDate?D.outbound(data,config,{providerShopId:g.destinationId},'',now):{status:'review',reason:'auction_date'};
    const bookingKey=crypto.createHash('sha256').update(JSON.stringify([g.key,g.items.map(i=>[i.id,i.buyerSaleId]),data?.origin,schedule.dropoffDate,schedule.arrivalDate])).digest('hex');
    return {...g,id,bookingKey,schedule,basePrice:route?.quote?.total??null};
  }), excluded };
}
function sender(input) { return { name:Sender.senderName(input.name),phone:Sender.senderPhone(input.phone) }; }
module.exports={build,sender};
