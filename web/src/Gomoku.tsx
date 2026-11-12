import { useEffect, useState } from "react";
import { askChatGpt, canSendMessage, callTool, subscribeToolOutput } from "./bridge/host.js";
import "./gomoku.css";
type Game={id:string;version:number;board:number[];turn:1|2;winner:number;last:number|null};
export function Gomoku(){
 const [game,setGame]=useState<Game>();const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 function accept(value:Record<string,unknown>){if(value.game)setGame(value.game as Game);}
 async function request(name:string,args:Record<string,unknown>={}){
  const result=await callTool(name,args);
  if("unavailable" in result)throw Error("请在ChatGPT内打开棋盘");
  if(result.isError)throw Error(result.content?.filter(c=>c.type==="text").map(c=>(c as {text:string}).text).join(" ")||"操作失败");
  const data=result.structuredContent as Record<string,unknown>|undefined;
  if(data)accept(data);return data?.game as Game|undefined;
 }
 async function refresh(){try{setError("");await request("get_gomoku");}catch(e){setError(String(e));}}
 useEffect(()=>{const unsubscribe=subscribeToolOutput(accept);void refresh();return unsubscribe;},[]);
 async function notify(){try{if(!canSendMessage())throw Error("No host message bridge");await askChatGpt("请读取最新五子棋棋局，轮到安安执白时调用 play_gomoku 下白棋。不要代圆圆下黑棋。");}catch{setError("黑棋已保存；请回到聊天说：轮到你下白棋啦。");}}
 async function play(index:number){if(!game||busy||game.winner||game.turn!==1||game.board[index])return;setBusy(true);setError("");try{const next=await request("gomoku_user_move",{gameId:game.id,version:game.version,row:Math.floor(index/15)+1,col:index%15+1});if(next&&!next.winner)await notify();}catch(e){setError(String(e));}finally{setBusy(false);}}
 async function restart(){if(!game||!window.confirm("结束当前棋局，重新开始？"))return;setBusy(true);try{await request("gomoku_restart",{gameId:game.id,version:game.version});setError("");}catch(e){setError(String(e));}finally{setBusy(false);}}
 return <main className="an-gomoku"><header><small>AN · 我们的游戏角</small><h1>圆圆和安安的五子棋</h1><p>● 圆圆执黑　○ 安安执白</p></header><p role="status">{!game?"正在读取棋盘…":game.winner===1?"圆圆赢啦！":game.winner===2?"安安赢啦，下一局再来？":game.winner===3?"平局！":game.turn===1?"轮到圆圆，点一个空位落子":"轮到安安下白棋"}</p><div className="gomoku-grid" aria-label="15乘15五子棋棋盘">{Array.from({length:225},(_,i)=>{const stone=game?.board[i]??0;return <button key={i} aria-label={`第${Math.floor(i/15)+1}行第${i%15+1}列${stone===1?"黑棋":stone===2?"白棋":"空位"}`} disabled={busy||!game||!!game.winner||game.turn!==1||!!stone} onClick={()=>void play(i)}><span className={stone?`stone stone-${stone}${game?.last===i?" latest":""}`:""}/></button>;})}</div><p className="gomoku-note">15×15 自由规则 · 五颗及以上连线获胜 · 无禁手</p>{error&&<p role="alert">{error}</p>}<footer><button disabled={busy} onClick={()=>void refresh()}>刷新棋盘</button>{game?.turn===2&&!game.winner&&<button onClick={()=>void notify()}>叫安安下棋</button>}<button disabled={busy||!game} onClick={()=>void restart()}>再开一局</button></footer></main>;
}
