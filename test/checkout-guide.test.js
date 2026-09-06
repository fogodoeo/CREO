const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('buyer and vendor guide uses external YouTube navigation without video embeds',()=>{
 const helper=fs.readFileSync('public/checkout-actions.js','utf8');
 assert.match(helper,/https:\/\/www.youtube.com\/shorts\/CEhm37HkDqQ/);
 assert.match(helper,/noopener noreferrer/);
 for(const p of ['public/buyer-shipping.html','public/vendor-checkout.html']){const s=fs.readFileSync(p,'utf8');assert.match(s,/checkout-actions.js/);assert.doesNotMatch(s,/checkout-mobile-v1.mp4|createElement\('video'\)/)}
});
