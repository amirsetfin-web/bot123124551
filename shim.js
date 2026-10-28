(()=>{const EX=window.claude;if(EX&&typeof EX.use==='function')return;
document.documentElement.classList.add('sa');
const LIST=[
{id:'groq',name:'Groq',tag:'رایگان · سریع',base:'https://api.groq.com/openai/v1',model:'llama-3.3-70b-versatile',nk:true,url:'https://console.groq.com/keys'},
{id:'cerebras',name:'Cerebras',tag:'رایگان · خیلی سریع',base:'https://api.cerebras.ai/v1',model:'llama-3.3-70b',nk:true,url:'https://cloud.cerebras.ai/'},
{id:'openrouter',name:'OpenRouter',tag:'مدل‌های رایگان',base:'https://openrouter.ai/api/v1',model:'meta-llama/llama-3.3-70b-instruct:free',nk:true,url:'https://openrouter.ai/keys'},
{id:'gemini',name:'Google Gemini',tag:'رایگان',base:'https://generativelanguage.googleapis.com/v1beta/openai',model:'gemini-2.5-flash',nk:true,url:'https://aistudio.google.com/apikey'},
{id:'mistral',name:'Mistral',tag:'رایگان (محدود)',base:'https://api.mistral.ai/v1',model:'mistral-small-latest',nk:true,url:'https://console.mistral.ai/api-keys'},
{id:'sambanova',name:'SambaNova',tag:'رایگان',base:'https://api.sambanova.ai/v1',model:'Meta-Llama-3.3-70B-Instruct',nk:true,url:'https://cloud.sambanova.ai/apis'},
{id:'deepseek',name:'DeepSeek',tag:'ارزان',base:'https://api.deepseek.com/v1',model:'deepseek-chat',nk:true,url:'https://platform.deepseek.com/api_keys'},
{id:'anthropic',name:'Claude (Anthropic)',tag:'پولی · بهترین کیفیت',type:'anthropic',base:'https://api.anthropic.com',model:'claude-sonnet-5-5',big:'claude-opus-5-5',nk:true,url:'https://console.anthropic.com/settings/keys'},
{id:'openai',name:'OpenAI',tag:'پولی',base:'https://api.openai.com/v1',model:'gpt-4.1-mini',nk:true,url:'https://platform.openai.com/api-keys'},
{id:'pollinations',name:'Pollinations',tag:'بدون کلید · آزمایشی',base:'https://text.pollinations.ai/openai',model:'openai',nk:false},
{id:'ollama',name:'Ollama',tag:'روی کامپیوتر خودت',base:'http://localhost:11434/v1',model:'qwen2.5:14b',nk:false}];
const KEYCFG='nova.provs',NOTOOLS=new Set(),COOL={};
const load=()=>{let s=null;try{s=JSON.parse(localStorage.getItem(KEYCFG))}catch(e){}
 if(!s||typeof s!=='object'){s={v:2,items:{},custom:[]};try{const o=JSON.parse(localStorage.getItem('nova.prov'));if(o&&o.base&&o.model)s.custom.push({id:'c'+Date.now(),type:'openai',name:o.name||'سفارشی',base:o.base,key:o.key||'',model:o.model,big:o.big||'',on:true})}catch(e){}}
 s.items=s.items||{};s.custom=s.custom||[];return s};
function providers(){const S=load();const a=LIST.map(L=>{const u=S.items[L.id]||{};const p={...L,key:u.key||'',model:u.model||L.model,big:u.big!==undefined&&u.big!==''?u.big:L.big||''};p.on=L.nk?!!p.key:u.on===true;return p});
 S.custom.forEach(c=>a.push({...c,nk:false,on:c.on!==false&&!!c.base&&!!c.model}));return a}
const active=()=>providers().filter(p=>p.on&&p.base&&p.model);
const toB64=b=>new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(b)});
const flat=m=>typeof m.content==='string'?m.content:(m.content||[]).map(b=>b.text||'').join('');
const hasImages=ms=>ms.some(m=>Array.isArray(m.content)&&m.content.some(b=>b.type==='image'));
async function* lines(resp){const rd=resp.body.getReader(),dec=new TextDecoder();let buf='';for(;;){const{done,value}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});const p=buf.split('\n');buf=p.pop();for(const l of p)yield l}}
function toOA(msgs,tools,strip){const out=[];for(const m of msgs){if(typeof m.content==='string'){out.push({role:m.role,content:m.content});continue}
 const parts=[],calls=[],res=[];for(const b of m.content||[]){if(b.type==='text')parts.push({type:'text',text:b.text});
  else if(b.type==='image'){if(strip)parts.push({type:'text',text:'[تصویر پیوست شد اما این مدل تصویر را پشتیبانی نمی‌کند]'});else parts.push({type:'image_url',image_url:{url:'data:'+b.source.media_type+';base64,'+b.source.data}})}
  else if(b.type==='tool_use')calls.push({id:b.id,type:'function',function:{name:b.name,arguments:JSON.stringify(b.input||{})}});
  else if(b.type==='tool_result')res.push({role:'tool',tool_call_id:b.tool_use_id,content:typeof b.content==='string'?b.content:JSON.stringify(b.content)})}
 if(m.role==='assistant'){const t=parts.map(p=>p.text||'').join('');out.push({role:'assistant',content:t||null,...(calls.length?{tool_calls:calls}:{})})}
 else{out.push(...res);if(parts.length)out.push({role:'user',content:parts.every(p=>p.type==='text')?parts.map(p=>p.text).join(''):parts})}}
 return{messages:out,...(tools.length?{tools:tools.map(t=>({type:'function',function:{name:t.name,description:t.description,parameters:t.input_schema||{type:'object',properties:{}}}}))}:{})}}
async function* oaEvents(resp){let next=0,textIdx=null,stop='end_turn';const tools={},byIdx={};
 for await(const ln of lines(resp)){if(!ln.startsWith('data:'))continue;const d=ln.slice(5).trim();if(!d||d==='[DONE]')continue;let j;try{j=JSON.parse(d)}catch(e){continue}
  const ch=j.choices&&j.choices[0];if(!ch)continue;const dl=ch.delta||{};
  if(typeof dl.content==='string'&&dl.content){if(textIdx===null){textIdx=next++;yield{type:'content_block_start',index:textIdx,content_block:{type:'text',text:''}}}yield{type:'content_block_delta',index:textIdx,delta:{type:'text_delta',text:dl.content}}}
  for(const tc of dl.tool_calls||[]){const ix=tc.index===undefined?0:tc.index;let k;if(tc.id){k='id:'+tc.id;byIdx[ix]=k}else k=byIdx[ix]||('i:'+ix);
   if(tools[k]===undefined){tools[k]=next++;yield{type:'content_block_start',index:tools[k],content_block:{type:'tool_use',id:tc.id||'call_'+Math.random().toString(36).slice(2),name:(tc.function&&tc.function.name)||'',input:{}}}}
   const a=tc.function&&tc.function.arguments;if(a)yield{type:'content_block_delta',index:tools[k],delta:{type:'input_json_delta',partial_json:typeof a==='string'?a:JSON.stringify(a)}}}
  if(ch.finish_reason)stop=ch.finish_reason==='tool_calls'?'tool_use':'end_turn'}
 if(Object.keys(tools).length)stop='tool_use';yield{type:'message_delta',delta:{stop_reason:stop}}}
async function* anthEvents(r){for await(const l of lines(r)){if(!l.startsWith('data: '))continue;try{yield JSON.parse(l.slice(6))}catch(e){}}}
const hdr=p=>p.type==='anthropic'?{'Content-Type':'application/json','x-api-key':p.key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'}:{'Content-Type':'application/json',...(p.key?{Authorization:'Bearer '+p.key}:{})};
const netErr=p=>({code:'net',message:/localhost|127\.0\.0\.1/.test(p.base)?'سرویس محلی روشن نیست یا CORS بسته است (Ollama را با OLLAMA_ORIGINS=* اجرا کن)':'به سرویس وصل نشد (اینترنت، فیلتر/VPN یا CORS)'});
const httpErr=(s,t)=>({code:s===401||s===403?'auth':s===429?'rate_limited':'error',status:s,message:s+': '+String(t).replace(/\s+/g,' ').slice(0,160)});
async function oaStream(msgs,tools,o,p){const model=(o.modelTier==='complex'&&p.big)||p.model;let useTools=tools.length&&!NOTOOLS.has(p.id+model),strip=false;
 for(let a=0;a<3;a++){let r;
  try{r=await fetch(p.base.replace(/\/$/,'')+'/chat/completions',{method:'POST',signal:o.signal,headers:hdr(p),body:JSON.stringify({model,stream:true,max_tokens:p.max||8192,...toOA(msgs,useTools?tools:[],strip)})})}
  catch(x){if(o.signal&&o.signal.aborted)throw x;throw netErr(p)}
  if(r.ok)return oaEvents(r);
  const t=await r.text().catch(()=>'');
  if((r.status===400||r.status===422)&&a<2){if(useTools&&/tool|function/i.test(t)){useTools=false;NOTOOLS.add(p.id+model);continue}if(!strip&&hasImages(msgs)){strip=true;continue}}
  throw httpErr(r.status,t)}}
async function anthStream(msgs,tools,o,p){const model=(o.modelTier==='complex'&&p.big)||p.model;let r;
 try{r=await fetch(p.base.replace(/\/$/,'')+'/v1/messages',{method:'POST',signal:o.signal,headers:hdr(p),body:JSON.stringify({model,max_tokens:16000,stream:true,messages:msgs,...(tools.length?{tools}:{})})})}
 catch(x){if(o.signal&&o.signal.aborted)throw x;throw netErr(p)}
 if(!r.ok)throw httpErr(r.status,await r.text().catch(()=>''));return anthEvents(r)}
const GREET=/^(سلام|درود|hi|hello|hey|هی|خوبی|چطوری|مرسی|ممنون|thanks|thank you|ok|اوکی)[\s!؟?.،]*$/i;
async function openEvents(msgs,tools,o){const act=active();
 if(act.length){const lastU=[...msgs].reverse().find(m=>m.role==='user'),isTool=!!(lastU&&Array.isArray(lastU.content)&&lastU.content.some(b=>b.type==='tool_result')),tail=lastU?flat(lastU).split('\n\n').pop().trim():'';
  const tl=(!isTool&&GREET.test(tail))?[]:tools;const now=Date.now();let order=act.filter(p=>!(COOL[p.id]>now));if(!order.length)order=act;const fails=[];let last;
  for(const p of order){try{const ev=await(p.type==='anthropic'?anthStream:oaStream)(msgs,tl,o,p);window.__novaProv=p.name;return ev}catch(e){if(o.signal&&o.signal.aborted)throw e;last=e;fails.push(p.name+' ← '+(e.message||e.code));if(e.code==='rate_limited'||e.code==='net'||(e.status&&e.status>=500)||e.status===402)COOL[p.id]=Date.now()+60000}}
  throw{code:last.code,message:fails.join(' | ')}}
 let r=null;try{r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},signal:o.signal,body:JSON.stringify({messages:msgs,tools,tier:o.modelTier})})}catch(x){if(o.signal&&o.signal.aborted)throw x}
 if(r&&r.ok)return anthEvents(r);
 if(r&&r.status!==404&&r.status!==405)throw httpErr(r.status,await r.text().catch(()=>''));
 return 'none'}
async function sample(input,o={}){
 const msgs=(typeof input==='string'?[{role:'user',content:input}]:input).map(m=>({role:m.role,content:m.content}));
 if(o.images&&o.images.length){const last=msgs[msgs.length-1];last.content=[...await Promise.all(o.images.map(async b=>({type:'image',source:{type:'base64',media_type:b.type||'image/png',data:await toB64(b)}}))),{type:'text',text:last.content}]}
 const tools=(o.tools||[]).map(t=>({name:t.name,description:t.description,input_schema:t.inputSchema||{type:'object',properties:{}}}));
 let full='';
 for(let turn=0;turn<50;turn++){
  const evs=await openEvents(msgs,tools,o);
  if(evs==='none'){const t='⚙️ برای شروع، یک هوش مصنوعی وصل کن: تنظیمات ← یکی از سرویس‌ها (مثلاً Groq که رایگان است) را انتخاب کن، کلید API را بگذار و «تست همهٔ سرویس‌ها» را بزن.\n\nاگر این فایل را داخل پیش‌نمایش اپ Claude باز کرده‌ای، آن را در Chrome یا Safari باز کن.';const b=document.getElementById('cfg');if(b)setTimeout(()=>b.click(),50);if(o.onText)o.onText({text:t,delta:t});return{text:t,truncated:false}}
  const blocks=[];let stop='';
  for await(const e of evs){
   if(e.type==='content_block_start')blocks[e.index]=e.content_block.type==='tool_use'?{...e.content_block,json:''}:{type:'text',text:''};
   else if(e.type==='content_block_delta'){const b=blocks[e.index];if(!b)continue;if(e.delta.type==='text_delta'){b.text+=e.delta.text;full+=e.delta.text;if(o.onText)o.onText({text:full,delta:e.delta.text})}else if(e.delta.type==='input_json_delta')b.json+=e.delta.partial_json}
   else if(e.type==='message_delta')stop=e.delta.stop_reason}
  if(stop!=='tool_use')break;
  const content=blocks.filter(b=>b&&(b.type==='tool_use'||b.text)).map(b=>b.type==='tool_use'?{type:'tool_use',id:b.id,name:b.name,input:(()=>{try{return b.json?JSON.parse(b.json):{}}catch(e){return{}}})()}:{type:'text',text:b.text});
  const results=[];
  for(const b of content.filter(b=>b.type==='tool_use')){const t=(o.tools||[]).find(t=>t.name===b.name);let out,err=false;try{if(!t)throw new Error('unknown tool '+b.name);out=await t.execute(b.input)}catch(x){out=String((x&&x.message)||x);err=true}results.push({type:'tool_result',tool_use_id:b.id,content:JSON.stringify(out),is_error:err})}
  msgs.push({role:'assistant',content},{role:'user',content:results});
  full+='\n\n'}
 if(!full.trim()){const t='⚠️ پاسخ خالی بود. مدل یا کلید را در تنظیمات بررسی کن.';if(o.onText)o.onText({text:t,delta:t});return{text:t,truncated:false}}
 return{text:full,truncated:false}}
sample.limits=async()=>({images:{maxCount:4}});
// ---- providers UI
async function probe(p){const url=p.type==='anthropic'?p.base.replace(/\/$/,'')+'/v1/models':p.base.replace(/\/$/,'')+'/models';
 if(!p.nk&&!p.key||(!p.nk)){ // keyless or custom: real tiny chat test
  try{const ev=await(p.type==='anthropic'?anthStream:oaStream)([{role:'user',content:'hi'}],[],{modelTier:'default'},p);let t='';for await(const e of ev)if(e.delta&&e.delta.text)t+=e.delta.text;return{ok:true,msg:'✓ آماده — '+(t.trim().slice(0,40)||'پاسخ دریافت شد'),ids:[]}}catch(e){return{ok:false,msg:'✗ '+(e.message||e.code),ids:[]}}}
 if(!p.key)return{ok:false,msg:'— کلید نگذاشته‌ای',ids:[],skip:true};
 let r;try{r=await fetch(url,{headers:hdr(p)})}catch(e){return{ok:false,msg:'✗ دسترسی ممکن نیست (اینترنت، فیلتر/VPN یا CORS)',ids:[]}}
 if(r.status===401||r.status===403)return{ok:false,msg:'✗ کلید نامعتبر است ('+r.status+')',ids:[]};
 if(!r.ok&&r.status!==404&&r.status!==405)return{ok:false,msg:'✗ خطا '+r.status,ids:[]};
 let ids=[];if(r.ok){const j=await r.json().catch(()=>({}));ids=(j.data||j.models||[]).map(x=>String(x.id||x.name||'').replace(/^models\//,'')).filter(x=>x&&!/whisper|embed|guard|tts|rerank|moderation|image|audio|orpheus/i.test(x))}
 if(ids.length&&!ids.includes(p.model))return{ok:false,warn:true,msg:'⚠️ اتصال و کلید درست است، ولی مدل «'+p.model+'» وجود ندارد. یکی را انتخاب کن:',ids:ids.slice(0,10)};
 return{ok:true,msg:'✓ آماده'+(r.ok?'':' (لیست مدل‌ها در دسترس نیست)'),ids:[]}}
function wire(){const box=document.getElementById('prov');if(!box)return;
 const st=document.createElement('style');st.textContent='.pr{border:1px solid var(--bd);border-radius:12px;padding:8px 10px;margin:8px 0}.pr .hd{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:14px;margin-bottom:4px}.pr .tg{color:var(--mt);font-size:12px}.pr a{color:var(--tx);font-size:12px}.pr .rs{font-size:12px;color:var(--mt);margin-top:4px;word-break:break-word}.mc{display:inline-block;margin:2px;padding:2px 8px;border:1px solid var(--bd);border-radius:8px;font-size:12px;direction:ltr;cursor:pointer}.pr label.ck{display:flex;gap:6px;align-items:center;font-size:13px}.pr .x{font-size:16px;padding:0 6px}.pr input[type=checkbox]{width:auto;margin:0}';document.head.append(st);
 const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
 const inp=(c,ph,v,type)=>{const i=el('input',c);i.placeholder=ph;i.value=v||'';if(type)i.type=type;i.autocomplete='off';return i};
 const collect=()=>{const items={},custom=[];box.querySelectorAll('.pr').forEach(r=>{const g=c=>{const e=r.querySelector('.'+c);return e?(e.type==='checkbox'?e.checked:e.value.trim()):''};if(r.dataset.c)custom.push({id:r.dataset.id,type:g('ty')||'openai',name:g('n')||'سفارشی',base:g('b'),key:g('k'),model:g('m'),big:'',on:true});else items[r.dataset.id]={key:g('k'),model:g('m'),on:g('on')===true}});try{localStorage.setItem(KEYCFG,JSON.stringify({v:2,items,custom}))}catch(e){}};
 const rowOf=p=>{const r=el('div','pr');r.dataset.id=p.id;if(p.custom)r.dataset.c='1';
  const hd=el('div','hd');
  if(p.custom){const n=inp('n','نام سرویس',p.name);n.style.width='45%';const ty=el('select','ty');[['openai','OpenAI-سازگار'],['anthropic','Anthropic']].forEach(([v,t])=>{const o=el('option',null,t);o.value=v;ty.append(o)});ty.value=p.type||'openai';ty.style.width='40%';const x=el('button','x','✕');x.onclick=()=>{r.remove();collect()};hd.append(n,ty,x);r.append(hd);r.append(inp('b','Base URL',p.base));}
  else{hd.append(el('b',null,p.name),el('span','tg',p.tag));if(p.url){const a=el('a',null,'🔑 گرفتن کلید');a.href=p.url;a.target='_blank';a.rel='noopener';hd.append(a)}r.append(hd)}
  if(p.custom||p.nk)r.append(inp('k','API Key'+(p.custom?' (اختیاری)':''),p.key,'password'));
  else{const l=el('label','ck');const c=el('input','on');c.type='checkbox';c.checked=!!p.on;l.append(c,el('span',null,'فعال'));r.append(l)}
  r.append(inp('m','Model',p.model));r.append(el('div','rs'));return r};
 const render=()=>{box.innerHTML='';box.append(el('h4',null,'🧠 هوش مصنوعی‌های تو'));box.append(el('p','tg','هر کدام کلید داشت فعال می‌شود. اگر یکی محدود یا قطع شد، خودکار سراغ بعدی می‌رود.'));
  providers().filter(p=>!p.type||LIST.some(L=>L.id===p.id)).forEach(p=>{if(LIST.some(L=>L.id===p.id))box.append(rowOf(p))});
  load().custom.forEach(c=>box.append(rowOf({...c,custom:true})));
  const add=el('button','newc','➕ افزودن سرویس سفارشی');add.style.cssText='background:var(--sf2);color:var(--tx)';add.onclick=()=>{box.insertBefore(rowOf({id:'c'+Date.now(),custom:true,type:'openai',name:'',base:'',key:'',model:''}),add);collect()};
  const all=el('button','newc','🔎 تست همهٔ سرویس‌ها');all.id='pall';all.onclick=async()=>{collect();all.disabled=true;const ps=providers();const rows=[...box.querySelectorAll('.pr')];
   await Promise.all(rows.map(async r=>{const p=ps.find(x=>x.id===r.dataset.id);const rs=r.querySelector('.rs');if(!p)return;rs.textContent='در حال تست…';const res=await probe(p);rs.textContent=res.msg;if(res.ids&&res.ids.length){const w=el('div');res.ids.forEach(id=>{const c=el('span','mc',id);c.onclick=()=>{r.querySelector('.m').value=id;collect();rs.textContent='مدل تنظیم شد: '+id};w.append(c)});rs.append(w)}}));all.disabled=false};
  box.append(add,all)};
 render();box.addEventListener('change',collect);box.addEventListener('input',collect)}
wire();
{const c=document.getElementById('cfg');if(c)c.addEventListener('click',()=>setTimeout(()=>{const d=document.getElementById('dlg');if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();if(d)d.scrollTop=0},40))}
window.__novaActive=()=>active().map(p=>p.id);
const NEW={use:async n=>n==='sample'?sample:n==='downloads'?{save:async({filename,data})=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data]));a.download=filename;a.click()}}:null};
try{window.claude=NEW}catch(e){}
})();
