import { DatabaseSync } from "node:sqlite";
import { expect,it } from "vitest";
import { GomokuStore } from "./gomoku.js";
it("persists across store instances and rejects stale moves and reset requests",async()=>{
 const sql=new DatabaseSync(":memory:");
 const db={prepare(query:string){let values:any[]=[];return {bind(...v:any[]){values=v;return this;},async first(){return sql.prepare(query).get(...values)??null;},async run(){return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}};}};}} as unknown as D1Database;
 try{
  const store=new GomokuStore(db);const g=await store.get();
  const next=await store.play(g.id,g.version,8,8,1);
  expect((await new GomokuStore(db).get()).board[112]).toBe(1);
  await expect(store.play(g.id,g.version,9,9,1)).rejects.toThrow("已更新");
  const restarted=await store.restart(next.id,next.version);
  expect(restarted.board.every(v=>v===0)).toBe(true);
  expect(restarted.id).not.toBe(next.id);
  await expect(store.play(next.id,next.version,9,9,2)).rejects.toThrow("已更新");
  const simultaneous=await Promise.allSettled([store.play(restarted.id,restarted.version,1,1,1),store.play(restarted.id,restarted.version,1,2,1)]);
  expect(simultaneous.filter(r=>r.status==="fulfilled")).toHaveLength(1);
 }finally{sql.close();}
});
