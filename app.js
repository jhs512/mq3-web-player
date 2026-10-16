const $=s=>document.querySelector(s);
const catalog=await fetch('./catalog.json').then(r=>r.json());
let lesson;
const runner=await fetch('./rich_runner.py').then(r=>r.text());
let index=0,worker=null,busy=false,timer=null,id=0,active=null,initialized=false;
const editor=$('textarea');
const key=t=>`mq3-web:${lesson.id}:${lesson.revision}:${t.id}`;
const value=()=>window.molipCodeEditors?.getValue()??editor.value;
function save(){if(!initialized||!lesson)return;try{localStorage.setItem(key(lesson.tasks[index]),value())}catch{}}
editor.addEventListener('input',save);
function setCode(source){editor.value=source;editor.setAttribute('data-editor-value',source);editor.setAttribute('data-editor-reset',String(Date.now())+Math.random());window.molipCodeEditors?.sync()}
function text(tag,value,cls){const node=document.createElement(tag);node.textContent=value;if(cls)node.className=cls;return node}
function show(i){
 if(i<0||i>=lesson.tasks.length)return;
 if(busy)stop();
 save();index=i;const task=lesson.tasks[i];
 $('#tasks').value=String(i);$('#prev').disabled=i===0;$('#next').disabled=i===lesson.tasks.length-1;
 $('#position').textContent=`문제 ${i+1} / ${lesson.tasks.length}${task.required?'':' · 선택 도전'}`;
 const problem=$('#problem');problem.replaceChildren(text('h2',task.title));
 const goal=document.createElement('div');goal.innerHTML=task.goal_html;problem.append(goal);
 for(const [n,hint] of task.hints.entries()){
  const detail=document.createElement('details');detail.append(text('summary',`힌트 ${n+1}`),text('p',hint));problem.append(detail);
 }
 const answer=document.createElement('details');answer.append(text('summary','정답 코드 보기'),text('pre',task.solution));problem.append(answer);
 const files=document.createElement('details');files.append(text('summary','함께 제공한 자료'));
 for(const [name,content] of Object.entries(task.files)){files.append(text('h3',name),text('pre',content))}problem.append(files);
 let draft;try{draft=localStorage.getItem(key(task))}catch{}
 setCode(draft??task.starter_code);problem.scrollTop=0;initialized=true;
 $('#output').replaceChildren();status('코드 실행을 눌러 결과를 확인하세요.');
 history.replaceState(null,'',`?lesson=${encodeURIComponent(lesson.id)}#${i+1}`);
}
function status(message,error=false){$('#status').textContent=message;$('#status').classList.toggle('error',error)}
function controls(running){busy=running;$('#run').disabled=running;$('#stop').disabled=!running;$('#reset').disabled=running}
function stop(){worker?.terminate();worker=null;clearTimeout(timer);active=null;controls(false);status('실행을 멈췄어요. 다시 실행할 수 있어요.');}
function render(result){
 const output=$('#output');output.replaceChildren();
 if(result.stdout)output.append(text('pre',result.stdout));
 if(result.stderr)output.append(text('pre',result.stderr,'error'));
 for(const artifact of result.artifacts??[]){
  if(artifact.kind==='table'){
   const wrap=document.createElement('div');wrap.className='table-wrap';wrap.append(text('h3',artifact.title));const table=document.createElement('table');
   const head=document.createElement('tr');for(const c of artifact.columns)head.append(text('th',c));table.append(head);
   for(const row of artifact.rows){const tr=document.createElement('tr');for(const c of row)tr.append(text('td',c));table.append(tr)}wrap.append(table);output.append(wrap);
  }else if(artifact.kind==='image'&&artifact.data_url.startsWith('data:image/png;base64,')){const img=document.createElement('img');img.alt=artifact.title;img.src=artifact.data_url;output.append(img)}
 }
 status(result.success?'실행했어요. 바꾸기 전과 결과를 비교해 보세요.':'오류가 났어요. 메시지를 보고 다시 시도하세요.',!result.success);
}
function start(){
 if(busy||$('#lessons').disabled)return;save();controls(true);$('#output').replaceChildren();status('실행을 준비하고 있어요…');
 if(!worker){
  worker=new Worker('./python-worker.js',{type:'module'});
  worker.onmessage=({data})=>{
   if(data.type==='status'||data.type==='running'){
    status(data.text);
    if(data.type==='running'){clearTimeout(timer);timer=setTimeout(()=>{stop();status('실행 시간이 길어 멈췄어요. 반복 조건을 확인하세요.',true)},30000)}
   }else if(data.type==='result'&&data.id===active){clearTimeout(timer);active=null;controls(false);render(data)}
  };
  worker.onerror=()=>{stop();status('실행 환경 연결을 확인한 뒤 다시 실행하세요.',true)};
 }
 active=++id;
 timer=setTimeout(()=>{stop();status('환경 준비 시간이 길어 멈췄어요. 연결을 확인하고 다시 실행하세요.',true)},180000);
 worker.postMessage({id:active,source:value(),files:lesson.tasks[index].files,runner});
}
$('#prev').onclick=()=>show(index-1);$('#next').onclick=()=>show(index+1);$('#tasks').onchange=e=>show(Number(e.target.value));
$('#run').onclick=start;$('#stop').onclick=stop;$('#reset').onclick=()=>{setCode(lesson.tasks[index].starter_code);save()};
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();start()}});
async function loadLesson(id,position=0){
 const reference=catalog.find(c=>c.id===id)??catalog[0];
 const requested=reference.id;
 if(busy)stop();save();
 $('#lessons').disabled=true;
 $('#run').disabled=true;
 try{
  const response=await fetch('./'+reference.path);
  if(!response.ok)throw Error('수업을 불러오지 못했어요.');
  const content=await response.json();
  initialized=false;lesson=content;index=0;
  $('#lesson-title').textContent=lesson.title;
  $('#lessons').value=requested;$('#tasks').replaceChildren();
  for(const [i,task] of lesson.tasks.entries()){
   const option=text('option',`${i+1}. ${task.required?'':'도전 · '}${task.title}`);option.value=String(i);$('#tasks').append(option);
  }
  show(Math.max(0,Math.min(lesson.tasks.length-1,Number.isFinite(position)?position:0)));
 }catch(error){status(String(error),true)}finally{$('#lessons').disabled=false;$('#run').disabled=false}
}
$('#lessons').onchange=e=>loadLesson(e.target.value);
for(const entry of catalog){const option=text('option',entry.title);option.value=entry.id;$('#lessons').append(option)}
const initialLesson=new URLSearchParams(location.search).get('lesson');
await loadLesson(initialLesson,Number(location.hash.slice(1)||1)-1);
