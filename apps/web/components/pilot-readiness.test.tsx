import {act,cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {PilotReadiness} from "./pilot-readiness";
const release={gitSha:"a".repeat(40),colorEngineVersion:"color-engine/1.1.0",catalogs:[],migrationHead:"20261019125352",buildVersion:"pilot.0.10.0"};
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
async function prepared(){
 vi.useFakeTimers();const fetcher=vi.fn(async(url:RequestInfo|URL)=>url==="/api/session"?Response.json({code:"UNAUTHORIZED"},{status:401}):Response.json({data:{release}}));vi.stubGlobal("fetch",fetcher);
 await act(async()=>{render(<PilotReadiness/>);});
 fireEvent.change(screen.getByLabelText("Yorum",{exact:true}),{target:{value:"Synthetic professional review"}});
 fireEvent.change(screen.getByLabelText("Hedef seçiminin açıklığı",{exact:true}),{target:{value:"4"}});fireEvent.click(screen.getByRole("checkbox"));return fetcher;
}
it("retains an unfinished review after successful periodic authorization against the same release",async()=>{
 const fetcher=await prepared();await act(async()=>{await vi.advanceTimersByTimeAsync(60000);});expect(fetcher.mock.calls.filter(([url])=>url==="/api/pilot/status")).toHaveLength(2);
 expect(screen.getByLabelText("Yorum",{exact:true})).toHaveValue("Synthetic professional review");expect(screen.getByLabelText("Hedef seçiminin açıklığı",{exact:true})).toHaveValue("4");expect(screen.getByRole("checkbox")).toBeChecked();
});
it("clears review and consent when revalidation denies access, including after later recovery",async()=>{
 const fetcher=await prepared();fetcher.mockResolvedValueOnce(Response.json({code:"FORBIDDEN"},{status:403}));await act(async()=>{await vi.advanceTimersByTimeAsync(60000);});
 expect(screen.queryByLabelText("Yorum",{exact:true})).not.toBeInTheDocument();await act(async()=>{await vi.advanceTimersByTimeAsync(60000);});expect(screen.getByLabelText("Yorum",{exact:true})).toHaveValue("");expect(screen.getByRole("checkbox")).not.toBeChecked();
});
it("does not carry scores into a different catalog or release context",async()=>{
 const fetcher=await prepared();fetcher.mockResolvedValueOnce(Response.json({data:{release:{...release,publishedCatalogs:[{version:2}]}}}));await act(async()=>{await vi.advanceTimersByTimeAsync(60000);});
 expect(screen.getByLabelText("Yorum",{exact:true})).toHaveValue("");expect(screen.getByLabelText("Hedef seçiminin açıklığı",{exact:true})).toHaveValue("");expect(screen.getByRole("checkbox")).not.toBeChecked();
});
