(() => {
 'use strict';
 // Legacy form rows already have visible labels; bind them to native inputs.
 let sequence=0;
 function labels(){
  for(const field of document.querySelectorAll('.field')){
   const label=field.querySelector('label'),input=field.querySelector('input:not([type=hidden]),select,textarea');
   if(!label||!input||label.control||label.contains(input))continue;
   if(!input.id)input.id='studio-field-'+(++sequence);label.htmlFor=input.id;
  }
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',labels);else labels();
})();
