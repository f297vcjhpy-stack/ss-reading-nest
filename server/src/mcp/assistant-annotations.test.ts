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
 await service.saveQuote({sessionId:session.id,content:"第一句话。",note:"圆圆原来的感想",position:bundle.session.userCurrentPosition});
 const server=new McpServer({name:"test",version:"1"});
 registerAssistantAnnotations(server,service,cloud,()=>service.getBookshelfSnapshot(false));
 const client=new Client({name:"test-client",version:"1"});
 const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(b);await client.connect(a);
 try{
  const list=await client.listTools();expect(list.tools.map(t=>t.name)).toEqual(["save_assistant_annotation"]);
  expect(list.tools[0]._meta?.["openai/visibility"]).not.toBe("private");
  const args={sessionId:session.id,positionIndex:1,content:"第一句话。",note:"安安的感想",operationId:"first-note"};
  const saved=await client.callTool({name:"save_assistant_annotation",arguments:args});
  expect(saved.isError).not.toBe(true);
  expect(saved.structuredContent).toMatchObject({saved:true,quote:{author:"assistant",note:"安安的感想"}});
  expect(saved.structuredContent).not.toHaveProperty("bookshelfSessions");
  expect(saved._meta).toHaveProperty("privateBookshelf");
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
