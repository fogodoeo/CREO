'use strict';
const {vendorContact}=require('./public/checkout-inquiry');

// A collection follows the original durable business identity, never a reused
// auction vendor ID or a name match. Legacy snapshots without it stay unlinked.
async function collectionInquiries(records,directory){
 const {profiles}=await directory.read();
 const byId=new Map(profiles.filter(profile=>profile.members?.length).map(profile=>[profile.id,profile.info]));
 return records.map(record=>vendorContact(byId.get(record.vendorSource?.directoryId)));
}
module.exports={collectionInquiries};
