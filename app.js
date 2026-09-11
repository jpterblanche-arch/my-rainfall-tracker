const KEY = 'my-rainfall-tracker-records-v2-clean';
const SUPABASE_URL = 'https://fevtbnljejxajqjackzp.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_taDB6yP24Hfv3yak3dzvDw_4npv4umc';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let page = 'dashboard', editing = null, session = null;
const pages = [['dashboard','Dashboard'],['record','Record Rainfall'],['history','History'],['monthly','Monthly Analysis'],['yearly','Yearly Analysis'],['compare','Compare Years'],['import','Import / Export'],['settings','Settings']];
const $ = s => document.querySelector(s), money = n => `${Number(n||0).toFixed(1)} mm`;
const read = () => JSON.parse(localStorage.getItem(KEY) || '[]').sort((a,b)=>b.date.localeCompare(a.date));
async function loadFromSupabase(){
  const {data,error} = await db.from('rainfall').select('*').order('date',{ascending:false});
  if(error) throw error;

  const local = read();

  if(!data.length && local.length){
    const payload = local.map(r => ({
      date: r.date,
      rainfall_mm: Number(r.rainfall_mm),
      notes: r.notes || ''
    }));

    const {error:insertError} = await db.from('rainfall').insert(payload);
    if(insertError) throw insertError;

    const {data:reloaded,error:reloadError} =
      await db.from('rainfall').select('*').order('date',{ascending:false});

    if(reloadError) throw reloadError;

    localStorage.setItem(KEY, JSON.stringify(reloaded || []));
    return reloaded || [];
  }

  localStorage.setItem(KEY, JSON.stringify(data || []));
  return data || [];
}

async function save(rows){
  const old = read();
  localStorage.setItem(KEY, JSON.stringify(rows));

  if(!session) return;

  const oldByDate = new Map(old.map(r => [r.date,r]));
  const newByDate = new Map(rows.map(r => [r.date,r]));

  const deleted = old.filter(r => !newByDate.has(r.date));
  const added = rows.filter(r => !oldByDate.has(r.date));
  const updated = rows.filter(r => {
    const o = oldByDate.get(r.date);
    return o &&
      (Number(o.rainfall_mm) !== Number(r.rainfall_mm) ||
       String(o.notes || '') !== String(r.notes || ''));
  });

  for(const r of deleted){
    const {error} = await db.from('rainfall').delete().eq('date',r.date);
    if(error) throw error;
  }

  if(added.length){
    const payload = added.map(r => ({
      date:r.date,
      rainfall_mm:Number(r.rainfall_mm),
      notes:r.notes || ''
    }));

    const {error} = await db.from('rainfall').insert(payload);
    if(error) throw error;
  }

  for(const r of updated){
    const {error} = await db.from('rainfall')
      .update({
        date:r.date,
        rainfall_mm:Number(r.rainfall_mm),
        notes:r.notes || ''
      })
      .eq('date',r.date);

    if(error) throw error;
  }

  localStorage.setItem(KEY, JSON.stringify(rows));
}function showLogin(errorText=''){
  $('#nav').innerHTML='';
  $('#page-title').textContent='Sign in';
  $('#content').innerHTML=`
    <div class="panel" style="max-width:520px;margin:40px auto">
      <h2>My Rainfall Tracker</h2>
      <p class="sub">Sign in to access your rainfall records.</p>
      <form class="form" id="login-form">
        <label class="field">
          Email
          <input required type="email" name="email" autocomplete="email">
        </label>
        <label class="field">
          Password
          <input required type="password" name="password" autocomplete="current-password">
        </label>
        <button class="primary">Sign in</button>
      </form>
      ${errorText ? `<div class="error" style="margin-top:14px">${esc(errorText)}</div>` : ''}
    </div>`;

  $('#login-form').onsubmit=async e=>{
    e.preventDefault();

    const v=Object.fromEntries(new FormData(e.target));
    const button=e.target.querySelector('button');

    button.disabled=true;

    const {error}=await db.auth.signInWithPassword({
      email:v.email,
      password:v.password
    });

    if(error) showLogin(error.message);
  };
}async function startApp(){
  const {data,error}=await db.auth.getSession();

  if(error){
    showLogin(error.message);
    return;
  }

  session=data.session;

  if(!session){
    showLogin();
    return;
  }

  try{
    await loadFromSupabase();
    nav();
    render();
  }catch(error){
    showLogin(`Could not load rainfall data: ${error.message}`);
  }
}
const rainy = rows => rows.filter(r=>Number(r.rainfall_mm)>=.1);
const monthName = i => new Date(2000,i,1).toLocaleString(undefined,{month:'short'});
const esc = s => String(s||'').replace(/[&<>"']/g, x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
function nav(){ $('#nav').innerHTML=pages.map(([id,name])=>`<button class="nav-link ${id===page?'active':''}" data-page="${id}">${name}</button>`).join(''); $('#page-title').textContent=pages.find(x=>x[0]===page)[1]; document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>go(b.dataset.page)); }
function go(p){page=p;editing=null; $('aside').classList.remove('open'); nav(); render();}
function sum(rows){return rows.reduce((n,r)=>n+Number(r.rainfall_mm),0)}
function byMonth(rows,y){return Array.from({length:12},(_,m)=>rows.filter(r=>r.date.startsWith(`${y}-${String(m+1).padStart(2,'0')}`)));}
function chart(values, labels){const max=Math.max(...values,1);return `<div class="chart">${values.map((v,i)=>`<div class="bar" style="height:${Math.max(v?6:1,v/max*100)}%" data-tip="${labels[i]}: ${money(v)}"></div>`).join('')}</div><div class="sub" style="display:flex;justify-content:space-between;margin-top:8px"><span>${labels[0]||''}</span><span>${labels.at(-1)||''}</span></div>`}
function empty(t='No rainfall records yet. Record rainfall or import a CSV file to begin.'){return `<div class="empty">${t}</div>`}
function dashboard(){const rows=read(), now=new Date(), y=now.getFullYear(), m=now.getMonth(), month=byMonth(rows,y)[m], yr=rows.filter(r=>r.date.startsWith(y+'-')), latest=rows[0]; const months=byMonth(rows,y).map(sum); const last12=Array.from({length:12},(_,i)=>{const d=new Date(y,m-11+i,1), key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;return sum(rows.filter(r=>r.date.startsWith(key)))}); const years=[...new Set(rows.map(r=>r.date.slice(0,4)))].sort(); return `<div class="cards"><div class="card"><label>THIS MONTH</label><div class="metric">${money(sum(month))}</div><div class="sub">${rainy(month).length} rainy days</div></div><div class="card"><label>HIGHEST DAILY</label><div class="metric">${money(Math.max(0,...month.map(r=>r.rainfall_mm)))}</div><div class="sub">This month</div></div><div class="card"><label>THIS YEAR</label><div class="metric">${money(sum(yr))}</div><div class="sub">${rainy(yr).length} rainy days</div></div><div class="card"><label>LATEST OBSERVATION</label><div class="metric">${latest?money(latest.rainfall_mm):'—'}</div><div class="sub">${latest?latest.date:'No records'}</div></div></div>${rows.length?`<div class="grid"><div class="panel"><h2>Monthly rainfall in ${y}</h2>${chart(months,Array.from({length:12},(_,i)=>monthName(i)))}</div><div class="panel"><h2>Current month details</h2><div class="list"><div class="list-row"><span>Average per rainy day</span><b>${money(rainy(month).length?sum(month)/rainy(month).length:0)}</b></div><div class="list-row"><span>Wettest month</span><b>${months.some(Boolean)?monthName(months.indexOf(Math.max(...months))):'—'}</b></div><div class="list-row"><span>Records stored</span><b>${rows.length}</b></div></div></div></div><div class="grid"><div class="panel"><h2>Rainfall over the previous 12 months</h2>${chart(last12,Array.from({length:12},(_,i)=>{const d=new Date(y,m-11+i,1);return d.toLocaleString(undefined,{month:'short'})}))}</div><div class="panel"><h2>Yearly totals</h2>${chart(years.map(yr=>sum(rows.filter(r=>r.date.startsWith(yr+'-')))),years)}</div></div>`:empty()}`}
function record(){const r=editing||{date:new Date().toISOString().slice(0,10),rainfall_mm:'',notes:''};return `<div class="panel"><h2>${editing?'Edit rainfall record':'Record rainfall'}</h2><p class="sub">One quick record for your home rain gauge.</p><form class="form" id="record-form"><label class="field">Date<input required type="date" name="date" value="${r.date}"></label><label class="field">Rainfall (mm)<input required type="number" name="rainfall_mm" min="0" step="0.1" placeholder="0.0" value="${r.rainfall_mm}"></label><label class="field">Notes <span class="sub">(optional)</span><textarea name="notes" placeholder="e.g. overnight thunderstorm">${esc(r.notes)}</textarea></label><div><button class="primary">${editing?'Save changes':'Save rainfall'}</button> ${editing?'<button type="button" class="secondary" id="cancel-edit">Cancel</button>':''}</div></form></div>`}
function filtered(){const f=$('#history-filters');let rows=read();if(!f)return rows;const x=Object.fromEntries(new FormData(f));return rows.filter(r=>(!x.search||`${r.date} ${r.notes}`.toLowerCase().includes(x.search.toLowerCase()))&&(!x.from||r.date>=x.from)&&(!x.to||r.date<=x.to)&&(!x.month||r.date.slice(5,7)===x.month)&&(!x.year||r.date.slice(0,4)===x.year));}
function history(){const years=[...new Set(read().map(r=>r.date.slice(0,4)))].sort().reverse();return `<div class="panel"><div class="toolbar"><h2>Rainfall history</h2><button class="secondary" id="export-filtered">Export filtered CSV</button></div><form class="filters" id="history-filters"><input name="search" placeholder="Search notes or date"><input name="from" type="date"><input name="to" type="date"><select name="month"><option value="">All months</option>${Array.from({length:12},(_,i)=>`<option value="${String(i+1).padStart(2,'0')}">${monthName(i)}</option>`)}</select><select name="year"><option value="">All years</option>${years.map(y=>`<option>${y}</option>`)}</select></form><div class="wide"><table><thead><tr><th>Date</th><th>Rainfall (mm)</th><th>Notes</th><th>Actions</th></tr></thead><tbody id="history-body"></tbody></table></div></div>`}
function drawHistory(){const rows=filtered();$('#history-body').innerHTML=rows.length?rows.map(r=>`<tr><td>${r.date}</td><td>${money(r.rainfall_mm)}</td><td>${esc(r.notes)}</td><td class="actions"><button class="link-btn" data-edit="${r.date}">Edit</button><button class="link-btn" data-delete="${r.date}">Delete</button></td></tr>`).join(''):'<tr><td colspan="4">No matching records.</td></tr>';document.querySelectorAll('[data-edit]').forEach(x=>x.onclick=async()=>{editing=read().find(r=>r.date===x.dataset.edit);page='record';nav();render()});document.querySelectorAll('[data-delete]').forEach(x=>x.onclick=async()=>{if(confirm(`Delete the record for ${x.dataset.delete}?`)){
  try{
    await save(read().filter(r=>r.date!==x.dataset.delete));
    drawHistory();
  }catch(error){
    alert(`Could not delete rainfall: ${error.message}`);
  }
}})}
function monthly(){const rows=read(), years=[...new Set(rows.map(r=>r.date.slice(0,4)))].sort().reverse(), y=years[0]||new Date().getFullYear();return `<div class="panel"><div class="toolbar"><h2>Monthly analysis</h2><select id="analysis-year">${(years.length?years:[y]).map(x=>`<option>${x}</option>`)}</select></div><div id="monthly-results"></div></div>`}
function drawMonthly(){const y=$('#analysis-year').value, all=read(), months=byMonth(all,y), values=months.map(sum), wet=Math.max(...values,0), dry=Math.min(...values);$('#monthly-results').innerHTML=`<div class="cards"><div class="card"><label>ANNUAL TOTAL</label><div class="metric">${money(sum(values))}</div></div><div class="card"><label>WETTEST MONTH</label><div class="metric">${wet?monthName(values.indexOf(wet)):'—'}</div></div><div class="card"><label>DRIEST MONTH</label><div class="metric">${monthName(values.indexOf(dry))}</div></div><div class="card"><label>RAINY DAYS</label><div class="metric">${rainy(months.flat()).length}</div></div></div><div class="grid"><div class="panel"><h2>Monthly rainfall</h2>${chart(values,Array.from({length:12},(_,i)=>monthName(i)))}</div><div class="panel"><h2>Summary</h2><div class="list"><div class="list-row"><span>Average monthly rainfall</span><b>${money(sum(values)/12)}</b></div><div class="list-row"><span>Maximum daily rainfall</span><b>${money(Math.max(0,...months.flat().map(r=>r.rainfall_mm)))}</b></div></div></div></div><div class="wide"><table class="stat-table"><thead><tr><th>Month</th><th>Rainfall (mm)</th><th>Rainy days</th><th>Maximum daily rainfall</th></tr></thead><tbody>${months.map((rs,i)=>`<tr><td>${monthName(i)}</td><td>${money(sum(rs))}</td><td>${rainy(rs).length}</td><td>${money(Math.max(0,...rs.map(r=>r.rainfall_mm)))}</td></tr>`).join('')}</tbody></table></div>`}
function yearly(){const rows=read(), years=[...new Set(rows.map(r=>r.date.slice(0,4)))].sort();if(!years.length)return empty();const metrics=years.map(y=>{const rs=rows.filter(r=>r.date.startsWith(y+'-')), ms=byMonth(rows,y).map(sum), max=Math.max(...ms);return [y,rs,ms,max]});return `<div class="panel"><h2>Yearly rainfall</h2>${chart(metrics.map(x=>sum(x[1])),years)}<div class="wide"><table class="stat-table"><thead><tr><th>Year</th><th>Annual rainfall</th><th>Rainy days</th><th>Wettest month</th><th>Maximum daily rainfall</th></tr></thead><tbody>${metrics.map(([y,rs,ms,max])=>`<tr><td>${y}</td><td>${money(sum(rs))}</td><td>${rainy(rs).length}</td><td>${monthName(ms.indexOf(max))}</td><td>${money(Math.max(0,...rs.map(r=>r.rainfall_mm)))}</td></tr>`).join('')}</tbody></table></div></div>`}
function compare(){const years=[...new Set(read().map(r=>r.date.slice(0,4)))].sort().reverse();if(years.length<2)return empty('At least two years of rainfall data are needed for a comparison.');return `<div class="panel"><div class="toolbar"><h2>Compare years</h2><div><select id="year-a">${years.map(y=>`<option>${y}</option>`)}</select> <select id="year-b">${years.map((y,i)=>`<option ${i===1?'selected':''}>${y}</option>`)}</select></div></div><div id="comparison"></div></div>`}
function drawCompare(){const a=$('#year-a').value,b=$('#year-b').value,rows=read(),ar=rows.filter(r=>r.date.startsWith(a+'-')),br=rows.filter(r=>r.date.startsWith(b+'-')),av=byMonth(rows,a).map(sum),bv=byMonth(rows,b).map(sum),at=sum(ar),bt=sum(br),diff=at-bt,pct=bt?diff/bt*100:null;$('#comparison').innerHTML=`<div class="cards"><div class="card"><label>${a} TOTAL</label><div class="metric">${money(at)}</div></div><div class="card"><label>${b} TOTAL</label><div class="metric">${money(bt)}</div></div><div class="card"><label>DIFFERENCE</label><div class="metric">${money(diff)}</div><div class="sub">${pct===null?'Percentage unavailable (comparison is zero)':pct.toFixed(1)+'%'}</div></div><div class="card"><label>RAINY DAYS</label><div class="metric">${rainy(ar).length} / ${rainy(br).length}</div><div class="sub">${a} / ${b}</div></div></div><div class="grid"><div class="panel"><h2>Monthly comparison</h2>${chart(av.map((x,i)=>Math.max(x,bv[i])),Array.from({length:12},(_,i)=>monthName(i)))}</div><div class="panel"><h2>Key comparison</h2><div class="list"><div class="list-row"><span>Wettest month</span><b>${monthName(av.indexOf(Math.max(...av)))} / ${monthName(bv.indexOf(Math.max(...bv)))}</b></div><div class="list-row"><span>Max daily rainfall</span><b>${money(Math.max(0,...ar.map(r=>r.rainfall_mm)))} / ${money(Math.max(0,...br.map(r=>r.rainfall_mm)))}</b></div></div></div></div><div class="sub">The chart shows the higher of each pair of monthly totals. Detailed values appear below.</div><div class="wide"><table class="stat-table"><thead><tr><th>Month</th><th>${a}</th><th>${b}</th><th>Difference</th></tr></thead><tbody>${av.map((x,i)=>`<tr><td>${monthName(i)}</td><td>${money(x)}</td><td>${money(bv[i])}</td><td>${money(x-bv[i])}</td></tr>`).join('')}</tbody></table></div>`}
function importer(){return `<div class="two"><div class="panel"><h2>Import rainfall data</h2><p class="sub">CSV headings: <code>date,rainfall_mm,notes</code></p><p class="sub">Duplicates, invalid dates, negative values, and invalid rainfall values are rejected.</p><div class="actions"><button class="primary" id="choose-file">Choose CSV file</button><button class="secondary" id="load-included">Load included rainfall history</button></div><div id="import-message" style="margin-top:14px"></div></div><div class="panel"><h2>Export data</h2><p class="sub">Download all stored rainfall records in a compatible CSV format.</p><button class="secondary" id="export-all">Export all records</button></div></div>`}
function settings(){return `<div class="panel">
    <h2>Settings</h2>
    <p class="sub">Rainy day threshold: <b>0.1 mm</b>. Rainfall intensity bands are ready for future use: 0, 0.1–5, 5–20, 20–50, and 50+ mm.</p>
    <p class="sub">Your rainfall records are securely stored in the Supabase cloud database and synchronised across your devices.</p>
    <button class="secondary" id="sign-out">Sign out</button>
  </div>`
}
function exportCsv(rows){const csv=['date,rainfall_mm,notes',...rows.map(r=>`${r.date},${r.rainfall_mm},"${String(r.notes||'').replaceAll('"','""')}"`)].join('\n'),a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='rainfall-records.csv';a.click();URL.revokeObjectURL(a.href)}
function bind(){if(page==='record'){$('#record-form').onsubmit=async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.target)), rows=read(), n=Number(v.rainfall_mm);if(!v.date||!Number.isFinite(n)||n<0)return message('Rainfall must be a valid value of 0 mm or more.',true);if(rows.some(r=>r.date===v.date)&&(!editing||editing.date!==v.date))return message('A rainfall record already exists for this date.',true);if(editing)rows.splice(rows.findIndex(r=>r.date===editing.date),1);
const newRecord={date:v.date,rainfall_mm:n,notes:v.notes.trim()};
if(editing&&editing.id)newRecord.id=editing.id;
rows.push(newRecord);
try{
  await save(rows);
  editing=null;
  message('Rainfall record saved.');
  e.target.reset();
}catch(error){
  message(`Could not save rainfall: ${error.message}`,true);
}};$('#cancel-edit')?.addEventListener('click',()=>go('history'))}if(page==='history'){$('#history-filters').oninput=drawHistory;$('#export-filtered').onclick=()=>exportCsv(filtered());drawHistory()}if(page==='monthly'){$('#analysis-year').onchange=drawMonthly;drawMonthly()}if(page==='compare'){$('#year-a').onchange=drawCompare;$('#year-b').onchange=drawCompare;drawCompare()}if(page==='import'){$('#choose-file').onclick=()=>$('#csv-file').click();$('#load-included').onclick=async()=>{try{const response=await fetch('Rainfall-import-v2.csv');if(!response.ok)throw new Error('included CSV was not found');completeImport(await response.text())}catch(error){$('#import-message').innerHTML=`<div class="error">Could not load the included rainfall history: ${esc(error.message)}</div>`}};$('#export-all').onclick=()=>exportCsv(read())}

if(page==='settings'){
  $('#sign-out').onclick=async()=>{
    await db.auth.signOut();
  };
}}
function message(t,bad=false){const old=$('#record-form')?.previousElementSibling;if(old?.classList.contains('notice')||old?.classList.contains('error'))old.remove();$('#record-form')?.insertAdjacentHTML('beforebegin',`<div class="${bad?'error':'notice'}">${t}</div>`)}
function render(){const views={dashboard,record,history,monthly,yearly,compare,import:importer,settings};$('#content').innerHTML=views[page]();bind()}
function parseCsvLine(line){const fields=[];let value='',quoted=false;for(let i=0;i<line.length;i++){const character=line[i];if(character==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++}else quoted=!quoted}else if(character===','&&!quoted){fields.push(value);value=''}else value+=character}if(quoted)return {error:'unclosed quoted field'};fields.push(value);return {fields}}
function parseImport(text){const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter((line,index)=>index===0||line.trim()!==''), rejected=[], parsed=[], existing=new Set(read().map(record=>record.date));const header=parseCsvLine(lines.shift()||'');if(header.error||header.fields.map(value=>value.trim().toLowerCase()).join(',')!=='date,rainfall_mm,notes')return {parsed,rejected:['Header must be exactly: date,rainfall_mm,notes']};for(let index=0;index<lines.length;index++){const row=parseCsvLine(lines[index]), rowNumber=index+2;if(row.error){rejected.push(`Row ${rowNumber}: ${row.error}`);continue}let fields=row.fields;if(fields.length===4&&fields[3]===''&&/^\d+$/.test(fields[1].trim())&&/^\d+$/.test(fields[2].trim()))fields=[fields[0],fields[1]+'.'+fields[2],''];const [date,rawRainfall,notes,...extra]=fields;if(extra.length||fields.length!==3){rejected.push(`Row ${rowNumber}: expected date,rainfall_mm,notes (or date,whole,decimal,)`);continue}if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){rejected.push(`Row ${rowNumber}: date must use YYYY-MM-DD`);continue}const dateValue=new Date(`${date}T00:00:00Z`);if(Number.isNaN(dateValue.getTime())||dateValue.toISOString().slice(0,10)!==date){rejected.push(`Row ${rowNumber}: invalid calendar date`);continue}const rainfall=Number(rawRainfall);if(rawRainfall.trim()===''||!Number.isFinite(rainfall)){rejected.push(`Row ${rowNumber}: rainfall_mm must be a number`);continue}if(rainfall<0){rejected.push(`Row ${rowNumber}: rainfall_mm cannot be negative`);continue}if(existing.has(date)){rejected.push(`Row ${rowNumber}: a record already exists for ${date}`);continue}parsed.push({date,rainfall_mm:rainfall,notes:notes||''});existing.add(date)}return {parsed,rejected}}
async function completeImport(text){
  const result=parseImport(text);

  try{
    if(result.parsed.length){
      await save([...read(),...result.parsed]);
    }

    $('#import-message').innerHTML=
      `<div class="${result.rejected.length?'error':'notice'}">
        Imported ${result.parsed.length} record(s).
        Rejected ${result.rejected.length} record(s)
        ${result.rejected.length
          ? ': '+result.rejected.slice(0,4).map(esc).join(' | ')
          : ''}
      </div>`;
  }catch(error){
    $('#import-message').innerHTML=
      `<div class="error">
        Import could not be saved: ${esc(error.message)}
      </div>`;
  }
} $('#csv-file').onchange=async event=>{completeImport(await event.target.files[0].text());event.target.value=''};$('#menu').onclick=()=>$('aside').classList.toggle('open'); db.auth.onAuthStateChange((event,newSession)=>{
  session=newSession;

  if(event==='SIGNED_IN'){
    startApp();
  }

  if(event==='SIGNED_OUT'){
    showLogin();
  }
});

startApp();
