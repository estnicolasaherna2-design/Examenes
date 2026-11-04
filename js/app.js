
const $ = id => document.getElementById(id);
const STORE = {profile:"examLab.profile",history:"examLab.history",settings:"examLab.settings"};
let catalog=[],activeExam=null,questions=[],current=0,answers={},examStartedAt=null;
const defaultSettings={defaultCount:10,shuffle:true,showTimer:false,passMark:70};
function readStore(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
function writeStore(key,value){localStorage.setItem(key,JSON.stringify(value))}
function settings(){return {...defaultSettings,...readStore(STORE.settings,{})}}
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function navigate(page){
 document.querySelectorAll(".nav").forEach(n=>n.classList.toggle("active",n.dataset.page===page));
 document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
 $("page-"+page).classList.remove("hidden");
 const names={dashboard:"Dashboard",certifications:"Certificaciones",profile:"Perfil",history:"Historial de exámenes",settings:"Configuración"};
 $("breadcrumb").textContent=names[page]||"Exam Lab";
 if(page==="dashboard")renderDashboard();
 if(page==="certifications")renderCertifications();
 if(page==="profile")renderProfile();
 if(page==="history")renderHistory();
 if(page==="settings")renderSettings();
}
async function init(){
 try{
  const r=await fetch("data/catalog.json");if(!r.ok)throw new Error("No se pudo leer data/catalog.json");
  catalog=await r.json();renderDashboard();navigate("dashboard");
 }catch(e){$("app-error").classList.remove("hidden");$("app-error").textContent=e.message+". Ejecuta la aplicación mediante un servidor local; no abras index.html directamente con file://."}
}
function examCard(exam){
 return `<article class="card exam-card"><div class="exam-top"><span class="exam-code">${escapeHtml(exam.id)}</span><span class="pill">${escapeHtml(exam.level||"Certificación")}</span></div><h3>${escapeHtml(exam.name)}</h3><p>${escapeHtml(exam.description||"Banco de preguntas de práctica.")}</p><div class="exam-meta">Banco de preguntas JSON · Idioma español</div><div class="exam-actions"><button data-start="${escapeHtml(exam.id)}">Comenzar examen</button><button class="secondary" data-info="${escapeHtml(exam.id)}">Detalles</button></div></article>`;
}
function bindExamButtons(){document.querySelectorAll("[data-start]").forEach(b=>b.onclick=()=>configureExam(b.dataset.start));document.querySelectorAll("[data-info]").forEach(b=>b.onclick=()=>{const e=catalog.exams.find(x=>x.id===b.dataset.info);alert(`${e.id} · ${e.name}\n${e.description}`)})}
function renderDashboard(){
 const h=readStore(STORE.history,[]),avg=h.length?Math.round(h.reduce((s,x)=>s+x.percent,0)/h.length):0;
 $("stat-exams").textContent=h.length;$("stat-average").textContent=avg+"%";$("stat-best").textContent=(h.length?Math.max(...h.map(x=>x.percent)):0)+"%";$("stat-available").textContent=catalog.exams.filter(e=>e.active).length;
 $("dashboard-exams").innerHTML=catalog.exams.filter(e=>e.active).slice(0,2).map(examCard).join("");bindExamButtons();
 const recent=h.slice(-4).reverse();$("dashboard-history").innerHTML=recent.length?recent.map(x=>`<tr><td>${escapeHtml(x.examId)}</td><td>${escapeHtml(x.dateLabel)}</td><td class="score">${x.percent}%</td><td>${x.correct}/${x.total}</td></tr>`).join(""):`<tr><td colspan="4" class="empty">Aún no tienes intentos registrados.</td></tr>`;
}
function renderCertifications(){$("certification-list").innerHTML=catalog.exams.filter(e=>e.active).map(examCard).join("");bindExamButtons()}
function renderProfile(){
 const p=readStore(STORE.profile,{name:"Estudiante",email:""}),h=readStore(STORE.history,[]);
 $("profile-name").value=p.name||"";$("profile-email").value=p.email||"";
 $("profile-total").textContent=h.length;$("profile-average").textContent=(h.length?Math.round(h.reduce((s,x)=>s+x.percent,0)/h.length):0)+"%";
}
function renderHistory(){
 const h=readStore(STORE.history,[]).slice().reverse();
 $("history-rows").innerHTML=h.length?h.map(x=>`<tr><td>${escapeHtml(x.dateLabel)}</td><td>${escapeHtml(x.examId)}</td><td>${x.total}</td><td>${x.correct}</td><td class="score">${x.percent}%</td><td>${x.percent>=settings().passMark?"Aprobado":"Por mejorar"}</td></tr>`).join(""):`<tr><td colspan="6" class="empty">No hay exámenes completados todavía.</td></tr>`;
}
function renderSettings(){const s=settings();$("setting-count").value=s.defaultCount;$("setting-shuffle").checked=s.shuffle;$("setting-timer").checked=s.showTimer;$("setting-pass").value=s.passMark}
function configureExam(id){
 activeExam=catalog.exams.find(e=>e.id===id);if(!activeExam)return;
 $("modal-title").textContent=`Configurar ${id}`;$("modal-description").textContent=activeExam.name;
 $("exam-count").value=settings().defaultCount;$("exam-modal").classList.remove("hidden");
 $("launch-exam").onclick=()=>launchExam(Number($("exam-count").value));
}
async function launchExam(count){
 try{
  const r=await fetch(activeExam.questionFile);if(!r.ok)throw new Error("No se pudo cargar el banco JSON");
  const data=await r.json();let bank=data.questions||[];
  if(!bank.length)throw new Error("El banco de preguntas está vacío.");
  if(settings().shuffle)bank=bank.slice().sort(()=>Math.random()-.5);
  questions=bank.slice(0,Math.min(count,bank.length));current=0;answers={};examStartedAt=Date.now();
  $("exam-modal").classList.add("hidden");$("exam-screen").classList.remove("hidden");renderQuestion();
 }catch(e){alert(e.message)}
}
function renderQuestion(){
 const q=questions[current];$("quiz-exam").textContent=activeExam.id;$("quiz-counter").textContent=`Pregunta ${current+1} de ${questions.length}`;$("quiz-progress").style.width=`${current/questions.length*100}%`;
 $("quiz-type").textContent=({multiple:"Selección múltiple",boolean:"Verdadero o falso",picklist:"Pick list",drag:"Relacionar elementos",hotspot:"Hotspot"})[q.type]||q.type;
 $("quiz-question").textContent=q.question;const a=$("quiz-answer");a.innerHTML="";
 if(q.type==="multiple"||q.type==="boolean"){
  const opts=q.type==="boolean"?[{label:"Verdadero",value:true},{label:"Falso",value:false}]:q.options.map(x=>({label:x,value:x}));
  opts.forEach(o=>{const l=document.createElement("label");l.className="option";const inp=document.createElement("input");inp.type="radio";inp.name="response";inp.checked=answers[q.id]===o.value;inp.onchange=()=>answers[q.id]=o.value;const span=document.createElement("span");span.textContent=o.label;l.append(inp,span);a.append(l)});
 }else if(q.type==="picklist"){
  const s=document.createElement("select");s.className="pick-select";s.innerHTML='<option value="">Selecciona una respuesta...</option>';q.options.forEach(o=>{const op=document.createElement("option");op.value=o;op.textContent=o;s.append(op)});s.value=answers[q.id]??"";s.onchange=()=>answers[q.id]=s.value;a.append(s);
 }else if(q.type==="drag"){
  const grid=document.createElement("div");grid.className="match-grid";const choices=q.pairs.map(p=>p.right).slice().sort(()=>Math.random()-.5);
  q.pairs.forEach(p=>{const item=document.createElement("div");item.className="match-item";const label=document.createElement("b");label.textContent=p.left;const s=document.createElement("select");s.innerHTML='<option value="">Selecciona correspondencia...</option>';choices.forEach(v=>{const op=document.createElement("option");op.value=v;op.textContent=v;s.append(op)});s.value=(answers[q.id]||{})[p.left]||"";s.onchange=()=>answers[q.id]={...(answers[q.id]||{}),[p.left]:s.value};item.append(label,s);grid.append(item)});a.append(grid);
 }else if(q.type==="hotspot"){
  const wrap=document.createElement("div");wrap.className="hotspot";const labels=q.diagram?.labels||["Zona A","Zona B","Zona C"];
  wrap.innerHTML=`<svg viewBox="0 0 700 250" aria-label="Diagrama interactivo"><rect x="5" y="5" width="690" height="240" rx="15" fill="#edf1f8" stroke="#b8c2d4"/>${labels.map((t,i)=>`<rect x="${35+i*220}" y="85" width="180" height="95" rx="10" fill="#dce5f7"/><text x="${125+i*220}" y="138" text-anchor="middle" font-size="18" fill="#263653">${escapeHtml(t)}</text>`).join("")}</svg>`;
  const svg=wrap.querySelector("svg");(q.zones||[]).forEach(z=>{const r=document.createElementNS("http://www.w3.org/2000/svg","rect");r.setAttribute("x",z.x/100*700);r.setAttribute("y",z.y/100*250);r.setAttribute("width",z.w/100*700);r.setAttribute("height",z.h/100*250);r.setAttribute("rx","8");r.setAttribute("class","zone"+(answers[q.id]===z.id?" selected":""));r.onclick=()=>{answers[q.id]=z.id;renderQuestion()};svg.append(r)});a.append(wrap);const help=document.createElement("p");help.className="muted";help.textContent="Selecciona la zona del diagrama que consideres correcta.";a.append(help);
 }
 $("quiz-prev").disabled=current===0;$("quiz-next").textContent=current===questions.length-1?"Finalizar examen":"Siguiente";
}
function correct(q){
 const v=answers[q.id];if(q.type==="drag")return !!v&&q.pairs.every(p=>v[p.left]===p.right)&&new Set(q.pairs.map(p=>v[p.left])).size===q.pairs.length;
 return v===q.answer;
}
function answerLabel(q,v){
 if(v===undefined||v===null||v==="")return "Sin responder";
 if(q.type==="boolean")return v?"Verdadero":"Falso";
 if(q.type==="hotspot")return q.zones.find(z=>z.id===v)?.label||v;
 if(q.type==="drag")return q.pairs.map(p=>`${p.left} → ${v[p.left]||"Sin asignar"}`).join(" · ");
 return String(v);
}
function finishExam(){
 const right=questions.filter(correct).length,percent=Math.round(right/questions.length*100),date=new Date();
 const record={examId:activeExam.id,date:date.toISOString(),dateLabel:date.toLocaleString("es-CO"),total:questions.length,correct:right,percent,durationSeconds:Math.round((Date.now()-examStartedAt)/1000)};
 const h=readStore(STORE.history,[]);h.push(record);writeStore(STORE.history,h);
 $("exam-screen").classList.add("hidden");$("result-screen").classList.remove("hidden");$("result-score").textContent=percent+"%";$("result-summary").textContent=`${right} de ${questions.length} respuestas correctas · ${record.durationSeconds} segundos`;
 $("result-reviews").innerHTML=questions.map((q,i)=>{const ok=correct(q),answer=answerLabel(q,answers[q.id]),rightAnswer=q.type==="drag"?q.pairs.map(p=>`${p.left} → ${p.right}`).join(" · "):q.type==="boolean"?(q.answer?"Verdadero":"Falso"):q.type==="hotspot"?(q.zones.find(z=>z.id===q.answer)?.label||q.answer):q.answer;return `<article class="review ${ok?"good":"bad"}"><b>${i+1}. ${escapeHtml(q.question)}</b><p><strong style="color:${ok?"var(--green)":"var(--red)"}">${ok?"Correcta":"Incorrecta"}</strong></p><p><b>Tu respuesta:</b> ${escapeHtml(answer)}</p><p><b>Respuesta correcta:</b> ${escapeHtml(rightAnswer)}</p><div class="explain"><b>Explicación:</b> ${escapeHtml(q.explanation)}</div></article>`}).join("");
}
document.querySelectorAll(".nav").forEach(n=>n.onclick=()=>navigate(n.dataset.page));
$("modal-close").onclick=()=>$("exam-modal").classList.add("hidden");$("exam-cancel").onclick=()=>$("exam-modal").classList.add("hidden");
$("quiz-prev").onclick=()=>{if(current>0){current--;renderQuestion()}};$("quiz-next").onclick=()=>{if(current<questions.length-1){current++;renderQuestion()}else finishExam()};
$("quiz-exit").onclick=()=>{if(confirm("¿Salir del examen? Se perderán las respuestas de este intento.")){$("exam-screen").classList.add("hidden");navigate("certifications")}};
$("result-home").onclick=()=>{$("result-screen").classList.add("hidden");navigate("dashboard")};
$("profile-save").onclick=()=>{writeStore(STORE.profile,{name:$("profile-name").value.trim()||"Estudiante",email:$("profile-email").value.trim()});alert("Perfil guardado en este navegador.")};
$("settings-save").onclick=()=>{writeStore(STORE.settings,{defaultCount:Number($("setting-count").value),shuffle:$("setting-shuffle").checked,showTimer:$("setting-timer").checked,passMark:Number($("setting-pass").value)});alert("Configuración guardada.")};
$("history-clear").onclick=()=>{if(confirm("¿Eliminar todo el historial guardado en este navegador?")){writeStore(STORE.history,[]);renderHistory();renderDashboard()}};
init();
