import { render,screen,fireEvent,waitFor } from "@testing-library/react";
import { expect,it,vi } from "vitest";
import { EscapeRoom } from "./EscapeRoom.js";
const bridge=vi.hoisted(()=>({callTool:vi.fn(),askChatGpt:vi.fn()}));
vi.mock("./bridge/host.js",()=>({...bridge,canSendMessage:()=>true}));
it("reveals the user clue on inspection and shares it only after a separate click",async()=>{
 bridge.callTool.mockResolvedValue({structuredContent:{escape:{id:"room",version:0,stage:0,clue:"月桂＝3，玫瑰＝5",escaped:false,lever:false,attempts:0}}});render(<EscapeRoom/>);
 await screen.findByText("机关进度 0/2 · 两侧线索需要合作");expect(screen.queryByText("月桂＝3，玫瑰＝5")).toBeNull();
 fireEvent.click(screen.getByText("检查花柜与花盆"));expect(screen.getByText("月桂＝3，玫瑰＝5")).toBeInTheDocument();expect(bridge.askChatGpt).not.toHaveBeenCalled();
 fireEvent.click(screen.getByText("把这条线索告诉安安"));await waitFor(()=>expect(bridge.askChatGpt).toHaveBeenCalledOnce());
});
