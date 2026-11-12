import {it,expect} from "vitest";
import {mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {InMemoryTransport} from "@modelcontextprotocol/sdk/inMemory.js";
import {JsonReadingRepository} from "../repositories/json-reading-repository.js";
import {ReadingService} from "../services/reading-service.js";
import {CloudSourceService} from "../services/cloud-source-service.js";
import {MemorySourceObjectStorage} from "../storage/memory-source-object-storage.js";
import {registerAssistantAnnotations} from "./assistant-annotations.js";

it("exposes assistant-only creation, verifies source and persists author without overwriting user notes",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"an-annotation-"));
 const repo=new JsonReadingRepository(join(dir,"state.json"));
 const service=new ReadingService(repo);
 const session=await service.startSession("测试共读","novel");
 const cloud=new CloudSourceService(repo,new MemorySourceObjectStorage());
 await cloud.uploadNovelSource({sessionId:session.id,sourceText:"第一句话。第二句话。",sourceKind:"pasted_text"});
 const bundle=await service.getSessionBundle(session.id);
 await service.markAssistantReadPage(session.id,1,bundle.session.sourceManifest!.contentHash,bundle.session.sourceManifest!.segmentationVersion);
 await service.saveQuote({sessionId:session.id,content:"第一句话。",note:"圆圆原来的感想",position:bundle.session.userCurrentPosition});
 const server=new McpServer({name:"test",version:"1"});
 registerAssistantAnnotations(server,service,cloud,()=>service.getBookshelfSnapshot(false));
 const client=new Client({name:"test-client",version:"1"});
 const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(b);await client.connect(a);
 try{
  const list=await client.listTools();expect(list.tools.map(t=>t.name)).toContain("save_assistant_annotation");
  expect(list.tools.find(t=>t.name==="reply_to_annotation")?._meta?.["openai/visibility"]).not.toBe("private");
  const args={sessionId:session.id,positionIndex:1,content:"第一句话。",note:"安安的感想",operationId:"first-note"};
  const saved=await client.callTool({name:"save_assistant_annotation",arguments:args});
  expect(saved.isError).not.toBe(true);
  expect(saved.structuredContent).toMatchObject({saved:true,quote:{author:"assistant",note:"安安的感想"}});
  expect(saved.structuredContent).not.toHaveProperty("bookshelfSessions");
  expect(saved._meta).toHaveProperty("privateBookshelf");
  const quoteId=(saved.structuredContent as any).quote.id;
  const replyArgs={sessionId:session.id,quoteId,content:"圆圆的回复",operationId:"reply-one"};
  const reply=await client.callTool({name:"add_user_annotation_reply",arguments:replyArgs});
  expect(reply.structuredContent).toMatchObject({reply:{author:"user",quoteId,content:"圆圆的回复"}});
  await client.callTool({name:"add_user_annotation_reply",arguments:replyArgs});
  const replyId=(reply.structuredContent as any).reply.id;
  expect((await client.callTool({name:"reply_to_annotation",arguments:{...replyArgs,content:"安安回应",operationId:"reply-two",replyToId:replyId}})).isError).not.toBe(true);
  const threads=await client.callTool({name:"read_annotation_threads",arguments:{sessionId:session.id}});
  const thread=(threads.structuredContent as any).threads.find((t:any)=>t.quoteId===quoteId);
  expect(thread.replies.map((r:any)=>r.author)).toEqual(["圆圆","安安"]);
  expect((await new JsonReadingRepository(join(dir,"state.json")).read()).quotes.find(q=>q.id===quoteId)?.replies).toHaveLength(2);

  await client.callTool({name:"save_assistant_annotation",arguments:args});
  const readback=await new JsonReadingRepository(join(dir,"state.json")).read();
  expect(readback.quotes).toHaveLength(2);
  expect(readback.quotes[0].note).toBe("圆圆原来的感想");
  expect(readback.quotes[0].author).toBeUndefined();
  expect(readback.quotes[1].author).toBe("assistant");
  const bad=await client.callTool({name:"save_assistant_annotation",arguments:{...args,content:"这句原文不存在。",operationId:"bad"}});
  expect(bad.isError).toBe(true);
  const wrong=await client.callTool({name:"save_assistant_annotation",arguments:{...args,positionIndex:2,operationId:"wrong-page"}});
  expect(wrong.isError).toBe(true);
  expect((await repo.read()).quotes).toHaveLength(2);
 }finally{await client.close();await server.close();}
});

it("reads index 3, saves and reads it back while user progress remains index 2",async()=>{
 const {registerReadingTools}=await import("./register-tools.js");
 const dir=await mkdtemp(join(tmpdir(),"an-history-"));
 const repo=new JsonReadingRepository(join(dir,"state.json"));const service=new ReadingService(repo);
 const session=await service.startSession("历史页测试","novel");
 const cloud=new CloudSourceService(repo,new MemorySourceObjectStorage());
 await cloud.uploadNovelSource({sessionId:session.id,sourceText:["甲".repeat(1000),"乙".repeat(1000),"第三页原句。"+"丙".repeat(1000),"丁".repeat(1000)].join("\n\n"),sourceKind:"pasted_text"});
 await repo.mutate(db=>{db.sessions[0].userCurrentPosition={kind:"paragraph",index:2,total:4,label:"第 2 页"};});
 const server=new McpServer({name:"history-test",version:"1"});registerReadingTools(server,service,cloud);
 const client=new Client({name:"test-client",version:"1"});const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(b);await client.connect(a);
 const args={sessionId:session.id,positionIndex:3,content:"第三页原句。",note:"历史页批注",operationId:"history-3"};
 try{
  expect((await client.callTool({name:"save_assistant_annotation",arguments:args})).isError).toBe(true);
  const read=await client.callTool({name:"read_shared_page_context",arguments:{sessionId:session.id,positionIndex:3}});
  expect((read.structuredContent as any).sharedPage.currentText).toContain("第三页原句。");
  // New service/request instance must retain evidence of the prior read.
  const saved=await client.callTool({name:"save_assistant_annotation",arguments:args});expect(saved.isError).not.toBe(true);
  await client.callTool({name:"save_assistant_annotation",arguments:args});
  expect((await repo.read()).quotes).toHaveLength(1);
  expect((await client.callTool({name:"save_assistant_annotation",arguments:{...args,note:"不同批注"}})).isError).toBe(true);
  const reread=await client.callTool({name:"read_shared_page_context",arguments:{sessionId:session.id,positionIndex:3}});
  expect((reread.structuredContent as any).sharedPage.savedThoughts).toContainEqual(expect.objectContaining({quote:"第三页原句。",author:"安安",thought:"历史页批注"}));
  const savedQuoteId=(saved.structuredContent as any).quote.id;
  await client.callTool({name:"add_user_annotation_reply",arguments:{sessionId:session.id,quoteId:savedQuoteId,content:"针对历史页的回复",operationId:"history-reply"}});
  const withReplies=await client.callTool({name:"read_shared_page_context",arguments:{sessionId:session.id,positionIndex:3}});
  expect((withReplies.structuredContent as any).sharedPage.savedThoughts[0]).toMatchObject({quoteId:savedQuoteId,replies:[{quoteId:savedQuoteId,author:"圆圆",content:"针对历史页的回复"}]});
  expect((await repo.read()).sessions[0].userCurrentPosition).toEqual({kind:"paragraph",index:2,total:4,label:"第 2 页"});
  await cloud.uploadNovelSource({sessionId:session.id,sourceText:"第三页原句。新版正文",sourceKind:"pasted_text"});
  expect((await client.callTool({name:"save_assistant_annotation",arguments:{...args,positionIndex:1,operationId:"new-version"}})).isError).toBe(true);
 }finally{await client.close();await server.close();}
});
