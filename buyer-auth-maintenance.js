'use strict';

// This worker only calls the auth module's bounded expired-state/session sweep.
function createBuyerAuthMaintenance({cleanup,logger=console,schedule=setInterval,cancel=clearInterval}={}) {
 let timer=null,pending=null,stopped=false;
 function run(){
  if(stopped)return Promise.resolve();
  if(pending)return pending;
  pending=Promise.resolve().then(cleanup).catch(error=>{logger.warn?.('[buyer-auth] expired login cleanup failed',error.message)}).finally(()=>{pending=null;});
  return pending;
 }
 return {
  start(){if(timer||stopped)return;timer=schedule(run,60_000);timer.unref?.();void run();},
  run,
  async stop(){stopped=true;if(timer)cancel(timer);timer=null;await pending;}
 };
}
module.exports={createBuyerAuthMaintenance};
