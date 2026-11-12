import { expect,it } from "vitest";
import { move,newGame } from "./gomoku.js";
it("rejects invalid turns, coordinates and occupied intersections without changing the original",()=>{const g=newGame();expect(()=>move(g,1,1,2)).toThrow();expect(()=>move(g,0,1,1)).toThrow();expect(()=>move(g,1.5,1,1)).toThrow();const n=move(g,1,1,1);expect(g.board[0]).toBe(0);expect(n.version).toBe(1);expect(()=>move(n,1,1,2)).toThrow();});
it.each([[0,1],[1,0],[1,1],[1,-1]])("recognizes wins in direction %j %j",(dr,dc)=>{let g=newGame();for(let i=0;i<5;i++){g=move(g,5+dr*i,8+dc*i,1);if(i<4)g=move(g,15,i+1,2);}expect(g.winner).toBe(1);expect(()=>move(g,2,2,2)).toThrow("已结束");});
it("does not wrap across edges",()=>{const g=newGame();g.board[13]=g.board[14]=g.board[15]=g.board[16]=1;expect(move(g,2,3,1).winner).toBe(0);});
it("accepts overlines under freestyle rules",()=>{const g=newGame();for(const c of [1,2,3,5,6])g.board[c-1]=1;expect(move(g,1,4,1).winner).toBe(1);});
