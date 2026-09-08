const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('vendor header hides operator labels without removing live update targets',()=>{
 const s=fs.readFileSync('public/vendor-checkout.html','utf8');
 const css=fs.readFileSync('public/checkout-layout.css','utf8');
 assert.match(s,/checkout-layout\.css/);
 assert.match(css,/\.brand-right[^}]*display:none!important/);
 for(const id of ['sync','channel','vendor-event'])assert.ok(s.includes('id="'+id+'"'));
});
test('buyer and vendor guide uses external YouTube navigation without video embeds',()=>{
 const helper=fs.readFileSync('public/checkout-actions.js','utf8');
 assert.match(helper,/https:\/\/www.youtube.com\/shorts\/CEhm37HkDqQ/);
 assert.match(helper,/noopener noreferrer/);
 for(const p of ['public/buyer-shipping.html','public/vendor-checkout.html']){const s=fs.readFileSync(p,'utf8');assert.match(s,/checkout-actions.js/);assert.doesNotMatch(s,/checkout-mobile-v1.mp4|createElement\('video'\)/)}
});
