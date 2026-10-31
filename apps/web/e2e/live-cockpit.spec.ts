import { test } from "@playwright/test";
import { controlledRecipeJourney } from "./controlled-recipe-flow";
test("authenticated Live cockpit uses real controlled ROOT execution, timers and safety",async({page,browser},info)=>{
 await controlledRecipeJourney(page,browser,info,undefined,{liveCockpit:true});
});
