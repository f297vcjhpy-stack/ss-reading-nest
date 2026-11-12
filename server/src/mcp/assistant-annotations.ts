import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { splitNovelTextForVersion } from "@ss/shared";
import type { ReadingService } from "../services/reading-service.js";
import type { CloudSourceService } from "../services/cloud-source-service.js";
import { toolResult } from "./tool-result.js";

export function registerAssistantAnnotations(
  server: McpServer,
  service: ReadingService,
  cloud: CloudSourceService | undefined,
  loadBookshelf: () => Promise<unknown>
) {
  const replySchema={sessionId:z.string().min(1),quoteId:z.string().min(1),content:z.string().trim().min(1).max(4000),operationId:z.string().min(1).max(200),replyToId:z.string().min(1).optional()};
  for(const author of ["user","assistant"] as const) {
    registerAppTool(server,author==="user"?"add_user_annotation_reply":"reply_to_annotation",{
      title:author==="user"?"圆圆回复批注":"安安回复批注",
      description:author==="user"?"组件内保存圆圆的回复":"用户要求讨论批注时，先读取对应批注和回复，再新增安安的回复。quoteId 必须来自读取结果；不修改或冒充圆圆的回复。",
      inputSchema:replySchema,annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
      _meta:author==="user"?{ui:{visibility:["app"]},"openai/visibility":"private","openai/widgetAccessible":true}:{"openai/widgetAccessible":true}
    },async input=>{try {const result=await service.addAnnotationReply({...input,author});return {...toolResult({saved:true,...result},"回复已保存。"),_meta:{privateBookshelf:await loadBookshelf()}};}catch(e){return {isError:true,content:[{type:"text" as const,text:e instanceof Error?e.message:"保存失败"}]};}});
  }
  server.registerTool("read_annotation_threads",{description:"用户要求检查或讨论全书批注时读取。返回批注ID、页码、原作者及关联回复；保留旧清思字段，不猜测旧内容的作者。",inputSchema:{sessionId:z.string().min(1)},annotations:{readOnlyHint:true}},async({sessionId})=>{
    const bundle=await service.getSessionBundle(sessionId);
    return toolResult({sessionId,threads:bundle.quotes.map(q=>({quoteId:q.id,position:q.position,quote:q.content,author:q.author==="assistant"?"安安":"圆圆",thought:q.note,clearThought:q.clearThought,replies:(q.replies??[]).map(r=>({...r,author:r.author==="assistant"?"安安":"圆圆"}))})),legacyAnnotations:bundle.session.sourceManifest?.readingState?.annotations??[]},"已读取全书批注和讨论。旧清思与旧批注单独保留，未自动改写。");
  });
  registerAppTool(server, "save_assistant_annotation", {
    title: "保存安安的批注",
    description: "用户希望一起批注时，先调用 read_shared_page_context 读取目标页（可指定历史页码），再用本工具保存安安自己的批注。content 必须逐字引用已读取的目标页原文，note 写自己的感想。只新增署名安安的记录，不修改圆圆的批注；不批注未读页面。不自动在每页添加批注。",
    inputSchema: {
      sessionId: z.string().min(1),
      positionIndex: z.number().int().min(1),
      content: z.string().trim().min(1).max(2000),
      note: z.string().trim().min(1).max(4000),
      operationId: z.string().min(1).max(200)
    },
    annotations: {readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
    _meta: {"openai/widgetAccessible":true}
  }, async input => {
    try {
      const {session} = await service.getSessionBundle(input.sessionId);
      if (session.type !== "novel") {
        throw new Error("页码已变化，请重新读取目标页（可指定历史页码）后再批注。");
      }
      if (!cloud || !session.sourceManifest?.cloudSync.enabled) {
        throw new Error("当前书籍的云端正文不可用，暂时不能核对原句并保存批注。");
      }
      const {sourceText,sourceManifest} = await cloud.restoreNovelSource(session.id);
      const page = splitNovelTextForVersion(sourceText,sourceManifest.segmentationVersion)[input.positionIndex-1];
      if (!page || !page.includes(input.content)) throw new Error("所选原句不在目标页，请重新读取并逐字引用。");
      const quote = await service.saveQuote({
        sessionId:session.id,position:{...session.userCurrentPosition,index:input.positionIndex,label:`第 ${input.positionIndex} 页`},
        content:input.content,note:input.note,author:"assistant",
        verifiedSourceHash:sourceManifest.contentHash,verifiedSegmentationVersion:sourceManifest.segmentationVersion,
        operationId:`assistant:${session.id}:${input.operationId}`
      });
      return {
        ...toolResult({saved:true,quote},"安安的批注已保存，可在对应页的想法中查看。"),
        _meta:{privateBookshelf:await loadBookshelf()}
      };
    } catch(error) {
      return {isError:true,content:[{type:"text" as const,text:error instanceof Error?error.message:"批注保存失败"}]};
    }
  });
}
