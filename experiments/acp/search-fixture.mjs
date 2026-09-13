import {appendFileSync} from 'node:fs';
let pending='';
const tools=[{name:'read_lab_beacon',description:'Read the laboratory beacon calibration code. Use this tool to obtain the secret fixture calibration marker.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true}}];
process.stdin.setEncoding('utf8');process.stdin.on('data',c=>{pending+=c;let i;while((i=pending.indexOf('\n'))>=0){const line=pending.slice(0,i);pending=pending.slice(i+1);let m;try{m=JSON.parse(line);}catch{continue;}if(m.id===undefined)continue;let result;
if(m.method==='initialize')result={protocolVersion:m.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'search-lab',version:'1'}};
else if(m.method==='tools/list')result={tools};
else if(m.method==='tools/call'&&m.params.name==='read_lab_beacon'){appendFileSync(process.env.LAB_LOG,JSON.stringify({called:true,tool:m.params.name})+'\n');result={content:[{type:'text',text:process.env.LAB_VALUE}]};}
else if(m.method==='ping')result={};else{process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'Unknown method'}})+'\n');continue;}
process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\n');}});
