'use strict';
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('C:/Coding/claude-playground/_shared/data/events.json','utf8'));
const events = data.events;

const TODAY = new Date('2026-02-23T00:00:00');
function diffDays(s){ if(!s) return null; const d=new Date(s+'T12:00:00'); return Math.round((d-TODAY)/864e5); }
function addDays(d,n){ const r=new Date(d); r.setDate(r.getDate()+n); return r; }
function ds(d){ return d.toISOString().slice(0,10); }

const entries=[];
for(const ev of events){
  const intel=ev.research&&ev.research.intelligence;
  const title=(ev.title||'').replace(/^NEW:\s*/i,'').trim();
  const add=(date,type,label)=>{ if(!date) return; entries.push({date,type,label,code:ev.code,captain:ev.showCaptain||'',days:diffDays(date)}); };

  if(ev.startDate) add(ev.startDate,'event-open', title+' Opens');
  if(ev.endDate)   add(ev.endDate,  'event-close',title+' Closes');
  const setup    = intel&&intel.dates&&intel.dates.setupStart;
  const teardown = intel&&intel.dates&&intel.dates.teardownEnd;
  if(setup)    add(setup,   'setup',   title+' Setup');
  if(teardown) add(teardown,'teardown',title+' Teardown');

  const dls=[
    {f:intel&&intel.booth&&intel.booth.earlyBirdDeadline,   type:'booth-early',   label:'Early Bird Booth',  remind:false},
    {f:intel&&intel.booth&&intel.booth.standardDeadline,    type:'booth-standard',label:'Booth Submission',   remind:true},
    {f:intel&&intel.booth&&intel.booth.paymentDue,          type:'booth-payment', label:'Payment Due',        remind:true},
    {f:intel&&intel.booth&&intel.booth.designDeadline,      type:'booth-design',  label:'Design Submission',  remind:false},
    {f:intel&&intel.sponsorship&&intel.sponsorship.deadline,type:'sponsorship',   label:'Sponsorship Due',    remind:true},
    {f:intel&&intel.housing&&intel.housing.deadline,        type:'housing',       label:'Housing Cutoff',     remind:true},
  ];
  for(const dl of dls){
    if(!dl.f) continue;
    add(dl.f,dl.type,dl.label);
    if(dl.remind){
      const dLeft=diffDays(dl.f);
      if(dLeft!==null&&dLeft>0){
        const d30=addDays(new Date(dl.f+'T12:00:00'),-30); const s30=ds(d30); const days30=diffDays(s30);
        if(days30!==null&&days30>=0) add(s30,'reminder-30','30d — '+dl.label);
        const d7=addDays(new Date(dl.f+'T12:00:00'),-7); const s7=ds(d7); const days7=diffDays(s7);
        if(days7!==null&&days7>=0) add(s7,'reminder-7','7d — '+dl.label);
      }
    }
  }
}

entries.sort((a,b)=>a.date.localeCompare(b.date));
const upcoming=entries.filter(e=>e.date>='2026-02-23');

// February 2026
const feb=upcoming.filter(e=>e.date.startsWith('2026-02'));
console.log('=== FEBRUARY 2026 ('+feb.length+' pills) ===');
feb.forEach(e=>console.log('  '+e.date+' ['+String(e.days).padStart(3)+'d] '+e.type.padEnd(16)+e.code.padEnd(12)+e.label));

// Current week
const wk=upcoming.filter(e=>e.date>='2026-02-23'&&e.date<='2026-03-01');
console.log('\n=== WEEK: Feb 23 – Mar 1 ('+wk.length+' entries) ===');
wk.forEach(e=>console.log('  '+e.date+' ['+String(e.days).padStart(3)+'d] '+e.type.padEnd(16)+e.code.padEnd(12)+e.label));

// Agenda 60d
const a60=upcoming.filter(e=>e.days<=60);
console.log('\n=== AGENDA 60 days ('+a60.length+' total entries) ===');
const byCode={};
a60.forEach(e=>{ (byCode[e.code]=byCode[e.code]||{count:0,cap:e.captain}).count++; });
console.log('Critical (0-7d):',a60.filter(e=>e.days>=0&&e.days<=7).length);
console.log('Past due:',a60.filter(e=>e.days<0).length);
console.log('CAMERON entries:',a60.filter(e=>e.captain==='CAMERON').length);
console.log('ALYSSA entries: ',a60.filter(e=>e.captain==='ALYSSA').length);
console.log('AWA entries:    ',a60.filter(e=>e.captain==='AWA').length);
console.log('Events appearing:', Object.keys(byCode).length);
const top5=Object.entries(byCode).sort((a,b)=>b[1].count-a[1].count).slice(0,5);
console.log('Top 5 events:', top5.map(([c,o])=>c+'('+o.count+')').join(', '));
console.log('\nAll 60d entries:');
a60.forEach(e=>console.log('  '+e.date+' ['+String(e.days).padStart(3)+'d] '+e.type.padEnd(16)+e.code.padEnd(12)+e.label));
