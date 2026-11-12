import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { GomokuStore, type Game } from "./gomoku.js";
const URI="ui://an-games/gomoku-v1.html";
export function registerGomoku(server:McpServer, db:D1Database, html:string, origin?:string) {
  const store=new GomokuStore(db);
  const result=(game:Game)=>({content:[{type:"text" as const,text:JSON.stringify({game,rules:"15×15自由五子棋，五颗及以上连线获胜，无禁手。圆圆执黑1，安安执白2。助手只落白棋，按最新棋局版本操作。"})}],structuredContent:{game}});
  const safe=(fn:()=>Promise<Game>)=>fn().then(result).catch((e)=>({content:[{type:"text" as const,text:e instanceof Error?e.message:"游戏操作失败"}],isError:true}));
  const meta={"openai/widgetAccessible":true,ui:{resourceUri:URI},"openai/outputTemplate":URI};
  registerAppResource(server,"圆圆和安安的五子棋",URI,{},async()=>({contents:[{uri:URI,mimeType:RESOURCE_MIME_TYPE,text:html.replace("</head>","<script>window.__AN_GOMOKU__=true;</script></head>"),_meta:{ui:{prefersBorder:true,...(origin?{domain:origin,csp:{connectDomains:[origin],resourceDomains:[origin]}}:{})},"openai/widgetDescription":"圆圆执黑、安安执白的私人五子棋棋盘"}}]}));
  registerAppTool(server,"open_gomoku",{description:"打开或继续圆圆和安安的五子棋，不重置棋局。",inputSchema:{},_meta:meta,annotations:{readOnlyHint:true}},async()=>safe(()=>store.get()));
  registerAppTool(server,"get_gomoku",{description:"读取最新五子棋状态。落子前先确认当前版本和轮次。",inputSchema:{},_meta:{"openai/widgetAccessible":true},annotations:{readOnlyHint:true}},async()=>safe(()=>store.get()));
  registerAppTool(server,"play_gomoku",{description:"安安下白棋。row/col为1到15，version与gameId必须来自最新棋局。只在轮到白棋时调用。",inputSchema:{gameId:z.string(),version:z.number().int(),row:z.number().int().min(1).max(15),col:z.number().int().min(1).max(15)},_meta:meta},async a=>safe(()=>store.play(a.gameId,a.version,a.row,a.col,2)));
  registerAppTool(server,"gomoku_user_move",{description:"用户在棋盘点击下黑棋",inputSchema:{gameId:z.string(),version:z.number().int(),row:z.number().int().min(1).max(15),col:z.number().int().min(1).max(15)},_meta:{"openai/widgetAccessible":true,ui:{visibility:["app"]},"openai/visibility":"private"}},async a=>safe(()=>store.play(a.gameId,a.version,a.row,a.col,1)));
  registerAppTool(server,"gomoku_restart",{description:"用户明确要求再开一局时重置棋局",inputSchema:{gameId:z.string(),version:z.number().int()},_meta:meta,annotations:{destructiveHint:true}},async a=>safe(()=>store.restart(a.gameId,a.version)));
}
