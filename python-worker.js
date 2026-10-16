// Execution stays inside a disposable browser worker, never on the hosting server.
const INDEX='https://cdn.jsdelivr.net/pyodide/v314.0.7/full/';
let runtime;
let pending;
async function ready(){
 if(!pending)pending=(async()=>{
  postMessage({type:'status',text:'Python 실행 환경을 내려받고 있어요…'});
  const {loadPyodide}=await import(INDEX+'pyodide.mjs');
  runtime=await loadPyodide({indexURL:INDEX});
  postMessage({type:'status',text:'표를 다룰 도구를 준비하고 있어요…'});
  await runtime.loadPackage('pandas');
  return runtime;
 })();
 return pending;
}
self.onmessage=async({data})=>{
 try{
  const py=await ready();
  const folder='/attempt-'+data.id;
  py.FS.mkdirTree(folder);py.FS.chdir(folder);
  for(const [name,value] of Object.entries(data.files)){
   if(!/^[a-zA-Z0-9_./-]+$/.test(name)||name.split('/').some(x=>!x||x==='..'||x==='.')||name.startsWith('/'))throw Error('자료 파일 경로를 확인하세요.');
   const parent=name.includes('/')?name.slice(0,name.lastIndexOf('/')):null;
   if(parent)py.FS.mkdirTree(parent);
   py.FS.writeFile(name,value);
  }
  py.FS.writeFile('main.py',data.source);
  py.FS.writeFile('rich_runner.py',data.runner);
  postMessage({type:'running',text:'코드를 실행하고 있어요…'});
  // Reuse the app's actual table/plot collector, with an isolated namespace per run.
  const result=await py.runPythonAsync(`
import contextlib, io, json, runpy, traceback
_out=io.StringIO()
_err=io.StringIO()
_success=True
_namespace={}
with contextlib.redirect_stdout(_out), contextlib.redirect_stderr(_err):
    try:
        _namespace=runpy.run_path('rich_runner.py', run_name='__main__')
    except BaseException:
        _success=False
        traceback.print_exc()
try:
    # These lessons ask for result; do not expose the original df as its answer.
    _artifacts=_namespace['artifacts']
    _artifacts[:]=[a for a in _artifacts if a['kind']!='table']
    _namespace['seen_tables'].clear()
    _namespace['capture_table'](_namespace['scope'].get('result'),'결과 표')
except (KeyError, TypeError):
    _artifacts=[]
json.dumps({'success':_success, 'stdout':_out.getvalue()[:65536], 'stderr':_err.getvalue()[:65536], 'artifacts':_artifacts})
`);
  postMessage({type:'result',id:data.id,...JSON.parse(result)});
 }catch(error){postMessage({type:'result',id:data.id,success:false,stdout:'',stderr:String(error),artifacts:[]});}
};
