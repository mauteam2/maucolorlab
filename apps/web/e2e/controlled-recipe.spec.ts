import {test} from "@playwright/test";
import {controlledRecipeJourney} from "./controlled-recipe-flow";
test("controlled professional recipe keeps exact arithmetic, immutable history, current safety and real tenant isolation",async({page,browser},info)=>{await controlledRecipeJourney(page,browser,info);});
