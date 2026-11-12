import { render,screen,fireEvent,waitFor } from "@testing-library/react";
import { expect,it,vi } from "vitest";
import { Gomoku } from "./Gomoku.js";
const bridge=vi.hoisted(()=>({callTool:vi.fn(),askChatGpt:vi.fn()}));
vi.mock("./bridge/host.js",()=>({...bridge,canSendMessage:()=>true,subscribeToolOutput:()=>()=>{}}));
it("loads persisted board, saves a black move, then asks the assistant for white",async()=>{
 const game={id:"test",version:4,board:Array(225).fill(0),turn:1,winner:0,last:null};
 bridge.callTool.mockResolvedValueOnce({structuredContent:{game}}).mockResolvedValueOnce({structuredContent:{game:{...game,version:5,turn:2,board:[1,...Array(224).fill(0)]}}});
 render(<Gomoku/>);await screen.findByText("轮到圆圆，点一个空位落子");
 fireEvent.click(screen.getByRole("button",{name:"第1行第1列空位"}));
 await waitFor(()=>expect(bridge.callTool).toHaveBeenCalledWith("gomoku_user_move",{gameId:"test",version:4,row:1,col:1}));
 await waitFor(()=>expect(bridge.askChatGpt).toHaveBeenCalledTimes(1));
 expect(screen.getByRole("button",{name:"第2行第2列空位"})).toBeDisabled();
});
