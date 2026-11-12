export type EscapeState={id:string;version:number;stage:number;digits:number[];order:number[];lever:boolean;escaped:boolean;attempts:number};
export function createEscape():EscapeState {
 const pool=[1,2,3,4,5,6,7,8,9];
 const random=(max:number)=>{const n=new Uint32Array(1);crypto.getRandomValues(n);return n[0]!%max;};
 const digits=Array.from({length:8},()=>pool.splice(random(pool.length),1)[0]!);
 const order=[0,1,2,3];for(let i=3;i>0;i--){const j=random(i+1);[order[i],order[j]]=[order[j]!,order[i]!];}
 return {id:crypto.randomUUID(),version:0,stage:0,digits,order,lever:false,escaped:false,attempts:0};
}
const flowers=["月桂","玫瑰","铃兰","雏菊"];
const directions=["北","东","南","西"];
export function assistantView(s:EscapeState){return {id:s.id,version:s.version,stage:s.stage,lever:s.lever,escaped:s.escaped,clue:s.escaped?"门已开启，我们可以一起离开温室。":s.stage===0?`你在温室外侧看见操作说明：花柜密码的顺序是 ${s.order.map(i=>flowers[i]).join(" → ")}。你看不到花朵对应的数字，请和圆圆交换线索，不猜答案。`:s.stage===1?`你的灯塔窗上刻着方向顺序：${s.order.map(i=>directions[(i+1)%4]).join(" → ")}。圆圆能看见方向对应的数字，你看不到。`:s.lever?"你已经拉住外侧拉杆，请圆圆按门上的离开按钮。":"两个机关已解开。圆圆在门内，你在门外；现在需要你拉住外侧拉杆（escape_pull_lever），再让圆圆推门。"};}
export function userView(s:EscapeState){return {id:s.id,version:s.version,stage:s.stage,lever:s.lever,escaped:s.escaped,attempts:s.attempts,clue:s.escaped?"晨光落在花店门口。我们一起走出了温室。":s.stage===0?`你检查了花柜：${flowers.map((f,i)=>`${f}＝${s.digits[i]}`).join("，")}。柜门需要四位密码，旁边写着：顺序在窗外的人手里。`:s.stage===1?`柜子打开了，你拿出一张方向卡：${directions.map((d,i)=>`${d}＝${s.digits[i+4]}`).join("，")}。窗边的指示灯需要四位密码，方向顺序在安安那侧。`:s.lever?"门外的拉杆已经被安安拉住了。现在可以推门！":"两个机关都打开了，但门仍扣着。请安安先拉住门外的拉杆。"};}
export function applyEscape(s:EscapeState,action:"code"|"lever"|"exit",code=""){
 if(s.escaped)throw Error("我们已经通关啦");const n=structuredClone(s);n.version++;
 if(action==="code"){
  if(s.stage>=2)throw Error("密码机关已全部解开");
  if(!/^\d{4}$/.test(code))throw Error("请输入四位数字");
  const expected=s.order.map(i=>s.digits[s.stage===0?i:4+(i+1)%4]).join("");n.attempts++;
  if(code===expected)n.stage++;
  return {state:n,message:code===expected?"机关打开了！":"密码不对，线索和进度都还在，再核对一下顺序。"};
 }
 if(s.stage!==2)throw Error("请先解开两个密码机关");
 if(action==="lever") {n.lever=true;return {state:n,message:"安安已拉住外侧拉杆"};}
 if(!s.lever)throw Error("先请安安拉住门外的拉杆");n.escaped=true;return {state:n,message:"我们一起通关啦！"};
}
export class EscapeStore{
 constructor(private db:D1Database){}
 async get():Promise<EscapeState>{await this.db.prepare("CREATE TABLE IF NOT EXISTS an_escape (slot INTEGER PRIMARY KEY CHECK(slot=1),version INTEGER NOT NULL,data TEXT NOT NULL)").run();await this.db.prepare("INSERT OR IGNORE INTO an_escape (slot,version,data) VALUES (1,0,?)").bind(JSON.stringify(createEscape())).run();return JSON.parse((await this.db.prepare("SELECT data FROM an_escape WHERE slot=1").first<{data:string}>())!.data);}
 async act(id:string,version:number,action:"code"|"lever"|"exit",code?:string){const old=await this.get();if(old.id!==id||old.version!==version)throw Error("进度已更新，请刷新后重试");const result=applyEscape(old,action,code);const saved=await this.db.prepare("UPDATE an_escape SET data=?,version=? WHERE slot=1 AND version=?").bind(JSON.stringify(result.state),result.state.version,old.version).run();if(saved.meta.changes!==1)throw Error("进度已更新，请刷新后重试");return result;}
}
