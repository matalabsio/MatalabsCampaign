export const adminPage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MATA — Analytics</title><link rel="stylesheet" href="/admin.css"></head>
<body><main><h1>Presentation analytics</h1>
<p>Active viewing time excludes hidden or unfocused tabs. Browser identifiers are not verified people. No location is collected.</p>
<form id="login"><label>Reporting password <input id="password" type="password" autocomplete="current-password" required></label>
<label>Period <select id="days"><option value="1">Today / last 24 hours</option><option value="7" selected>Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label>
<button>Load report</button><button type="button" id="logout">Clear report</button></form>
<p id="status" role="status"></p><section id="report" hidden>
<h2 id="summary"></h2><h3>Viewing time by slide</h3><div id="slides"></div><h3>Link clicks</h3><div id="clicks"></div>
<h3>Latest 100 sessions</h3><p>Times are shown in Asia/Kolkata. IP addresses are cleared after 7 days. Sessions expire from reports after 90 days.</p>
<div class="scroll"><table><thead><tr><th>Opened</th><th>Unlocked</th><th>Last seen</th><th>Viewing</th><th>Elapsed</th><th>IP</th><th>Share tag</th><th>Details</th></tr></thead><tbody id="sessions"></tbody></table></div>
<h3>Session details</h3><pre id="detail">Select a session.</pre></section></main><script src="/admin.js" defer></script></body></html>`;
export const adminStyles = `*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#182240;font:16px system-ui}main{max-width:1250px;margin:auto;padding:32px 20px}h1{color:#0b1b5c}p{line-height:1.6}form{display:flex;gap:16px;flex-wrap:wrap;align-items:end;background:white;padding:20px;border-radius:12px}label{display:grid;gap:8px}input,select,button{font:inherit;padding:10px;border:1px solid #bac3d5;border-radius:6px}button{cursor:pointer;background:#0b1b5c;color:white}button:disabled{opacity:.5}table{border-collapse:collapse;background:white;width:100%}td,th{padding:12px;text-align:left;border-bottom:1px solid #dbe0ea;white-space:nowrap}.scroll{overflow:auto}pre{background:white;padding:20px;white-space:pre-wrap;overflow-wrap:anywhere}#status{min-height:26px}`;
export const adminScript = `
const $ = id => document.getElementById(id);
let password = '';
const time = value => new Date(value).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'});
const duration = value => (Number(value)/1000).toFixed(1)+'s';
function text(id, value) { $(id).textContent = value; }
function list(id, rows) { $(id).replaceChildren(...rows.map(value => { const p=document.createElement('p');p.textContent=value;return p; })); }
async function get(path) {
  const response=await fetch(path,{headers:{Authorization:'Bearer '+password},cache:'no-store',credentials:'omit'});
  const data=await response.json();if(!response.ok) throw Error(data.error || 'Unable to load report');return data;
}
$('login').addEventListener('submit',async event=>{
  event.preventDefault();password=$('password').value; text('status','Loading…');
  try {
    const data=await get('/report?days='+$('days').value);
    text('summary',data.siteId+': '+data.summary.sessions+' sessions · '+data.summary.browsers+' browser profiles · '+duration(data.summary.viewing_ms)+' viewing time');
    list('slides',data.slides.map(row=>'Slide '+(row.slide+1)+': '+duration(row.viewing_ms)));
    list('clicks',data.clicks.map(row=>'Link '+row.link_id+': '+row.clicks+' clicks'));
    $('sessions').replaceChildren(...data.sessions.map(row=>{
      const tr=document.createElement('tr');
      for(const value of [time(row.opened_at),time(row.unlocked_at),time(row.last_seen_at),duration(row.viewing_ms),duration(row.elapsed_ms),row.ip_address||'—',row.share_tag||'—']) {
        const td=document.createElement('td');td.textContent=value;tr.append(td);
      }
      const td=document.createElement('td'),button=document.createElement('button');button.textContent='View';
      button.addEventListener('click',async()=>{try{text('detail',JSON.stringify(await get('/report/session?id='+row.id),null,2));}catch(e){text('status',e.message);}});
      td.append(button);tr.append(td);return tr;
    }));
    $('report').hidden=false;text('status','Report loaded. Refresh with Load report.');
  } catch(e) {$('report').hidden=true;text('status',e.message);}
});
$('logout').addEventListener('click',()=>{password='';$('password').value='';$('report').hidden=true;$('sessions').replaceChildren();text('detail','Select a session.');text('status','Report cleared.');});
`;
