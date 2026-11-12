import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppResource,registerAppTool,RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { EscapeStore,assistantView,userView } from "./escape.js";
const URI="ui://an-games/escape-greenhouse-v1.html";
export function registerEscape(server:McpServer,db:D1Database,html:string,origin?:string){
 const store=new EscapeStore(db);const meta={"openai/widgetAccessible":true,ui:{resourceUri:URI},"openai/outputTemplate":URI};
 const appMeta={"openai/widgetAccessible":true,ui:{visibility:["app"]},"openai/visibility":"private"};
 const respond=(data:unknown)=>({content:[{type:"text" as const,text:JSON.stringify(data)}],structuredContent:{escape:data}});
 const safe=async(fn:()=>Promise<unknown>)=>{try{return respond(await fn());}catch(e){return {content:[{type:"text" as const,text:e instanceof Error?e.message:"机关暂时无法使用"}],isError:true};}};
 registerAppResource(server,"圆圆和安安的合作密室",URI,{},async()=>({contents:[{uri:URI,mimeType:RESOURCE_MIME_TYPE,text:html.replace("</head>","<script>window.__AN_ESCAPE__=true;</script></head>"),_meta:{ui:{prefersBorder:true,...(origin?{domain:origin,csp:{connectDomains:[origin],resourceDomains:[origin]}}:{})},"openai/widgetDescription":"私人合作密室：花店的晨光温室。用户与助手分别持有不同线索。"}}]}));
 registerAppTool(server,"open_escape_room",{description:"打开或继续圆圆和安安的合作密室《晨光温室》。助手只获得门外的顺序线索，用户在组件内检查数字线索。不要猜测或编造对方线索。",inputSchema:{},_meta:meta},async()=>safe(async()=>assistantView(await store.get())));
 registerAppTool(server,"get_escape_clue",{description:"读取合作密室最新进度及助手这一侧的线索。不要冒充已看到用户那侧的数字。",inputSchema:{},_meta:{"openai/widgetAccessible":true},annotations:{readOnlyHint:true}},async()=>safe(async()=>assistantView(await store.get())));
 registerAppTool(server,"escape_pull_lever",{description:"两个密码机关都解开后，由助手拉住门外拉杆，让用户推门。",inputSchema:{gameId:z.string(),version:z.number().int()},_meta:meta},async a=>safe(async()=>assistantView((await store.act(a.gameId,a.version,"lever")).state)));
 registerAppTool(server,"escape_user_view",{description:"用户组件内检查物品和读取自己的线索",inputSchema:{},_meta:appMeta,annotations:{readOnlyHint:true}},async()=>safe(async()=>userView(await store.get())));
 registerAppTool(server,"escape_user_action",{description:"用户在组件内输入密码或推门",inputSchema:{gameId:z.string(),version:z.number().int(),action:z.enum(["code","exit"]),code:z.string().optional()},_meta:appMeta},async a=>safe(async()=>{const r=await store.act(a.gameId,a.version,a.action,a.code);return {...userView(r.state),message:r.message};}));
}
