import {test,expect} from "@playwright/test";
import type {ServerMessage,Snapshot} from "../client/src/protocol";
test("Cinderborn: mobile Embers, eight keys, real Ascension kit, Living Sun and repeatable duels",async({page},info)=>{
 test.setTimeout(150000);let state:Snapshot|null=null,id=0;const observed:Snapshot[]=[],errors:string[]=[];
 page.on("pageerror",e=>errors.push(e.message));page.on("websocket",socket=>socket.on("framereceived",({payload})=>{const m=JSON.parse(String(payload)) as ServerMessage;if(m.type==="welcome"){id=m.id;state=m.state;}if(m.type==="state")state=m.state;if(m.type==="welcome"||m.type==="state"){observed.push(m.state);if(observed.length>400)observed.shift();}if(m.type==="error")errors.push(m.code);}));
 const own=()=>state!.players.find(p=>p.id===id)!;const ready=async()=>{await expect.poll(()=>state?.phase).toBe("active");};const gcd=async()=>{await expect.poll(()=>own().private!.gcd_until<=state!.tick).toBe(true);};
 await page.goto("/");await page.getByRole("button",{name:"Cinderborn duel · Play now",exact:true}).click();await ready();
 await expect(page.locator('.actor-label[data-model="elemental"]')).toHaveCount(2,{timeout:15000});
 await expect(page.locator("button.ability")).toHaveCount(7);await expect(page.locator('[data-slot="7"]')).toHaveCount(0);
 const first=state!.round;await page.getByRole("button",{name:"Easy",exact:true}).click();await expect.poll(()=>state!.round).toBeGreaterThan(first);await ready();await page.keyboard.press("Tab");
 const start=state!.tick,round=state!.round,origin={...own().pos};await page.keyboard.down("KeyD");await page.keyboard.press("Digit1");await page.keyboard.press("KeyQ");
 await expect.poll(()=>observed.some(s=>s.round===round&&s.tick>=start&&s.players.some(p=>p.id===id&&p.casting?.ability==="cinder_dart"&&p.shield>0))).toBe(true);
 await expect.poll(()=>Math.abs(own().pos.x-origin.x)+Math.abs(own().pos.z-origin.z)).toBeGreaterThan(300);await page.keyboard.up("KeyD");
 await expect.poll(()=>observed.some(s=>s.round===round&&s.events.some(e=>e.source===id&&e.ability==="cinder_dart"&&e.tick>=start&&(e.kind==="hit"||e.kind==="crit")))).toBe(true);await gcd();
 // A new round restores charges and removes motion before proving a committed cast.
 const restart=state!.round;await page.getByRole("button",{name:"Restart duel",exact:true}).click();await expect.poll(()=>state!.round).toBeGreaterThan(restart);await ready();await page.keyboard.press("Tab");
 let castRound=state!.round;const castTick=state!.tick;await page.evaluate(()=>{const bar=document.querySelector("#cast-time")!;new MutationObserver(()=>{if(bar.textContent?.includes("1.5s")&&!bar.hasAttribute("data-saw-furnace"))bar.setAttribute("data-saw-furnace","true");}).observe(bar,{childList:true,subtree:true});});await page.keyboard.press("Digit4");await page.keyboard.press("Digit2");
 await expect.poll(()=>observed.some(s=>s.round===castRound&&s.tick>=castTick&&s.players.some(p=>p.id===id&&p.casting?.ability==="flare_lance"&&p.private!.charges.flashkindle?.count===1))).toBe(true);
 await expect(page.locator("#cast-time")).toHaveAttribute("data-saw-furnace","true");await page.screenshot({path:info.outputPath("cinderborn-cast.png")});
 await expect.poll(()=>own().private!.embers).toBe(3);await expect(page.locator('[data-slot="2"]')).toHaveClass(/proc-ready/);await expect(page.locator("#proc-banner")).toContainText("EMBERS");await gcd();
 await page.screenshot({path:info.outputPath("cinderborn-embers.png")});await page.keyboard.press("Digit3");await expect.poll(()=>own().private!.embers<3).toBe(true);
 // Prove Ascension against a fresh opponent: the base-finisher check already spent its health.
 const ascensionRound=state!.round;await page.getByRole("button",{name:"Restart duel",exact:true}).click();await expect.poll(()=>state!.round).toBeGreaterThan(ascensionRound);await ready();await page.keyboard.press("Tab");castRound=state!.round;
 // Earn the meter through ordinary pressure; do not inject energy or stats.
 for(let casts=0;casts<28&&own().private!.energy<100;casts++){
  await gcd();await expect.poll(()=>own().casting).toBeNull();const tick=state!.tick;await page.keyboard.press("Digit1");
  await expect.poll(()=>observed.some(s=>s.round===castRound&&s.events.some(e=>e.source===id&&e.ability==="cinder_dart"&&e.tick>=tick&&(e.kind==="hit"||e.kind==="crit")))).toBe(true);
 }
 expect(own().private!.energy).toBe(100);await page.keyboard.press("KeyR");await expect.poll(()=>own().form).toBe("spellstorm");
 await expect(page.getByRole("button",{name:"1: Infernal Jet",exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"4: Living Sun",exact:true})).toBeVisible();
 await gcd();await page.keyboard.press("Digit4");await expect.poll(()=>own().sun?.charges).toBe(3);await expect(page.locator("#proc-banner")).toContainText("LIVING SUN");
 await expect.poll(()=>own().casting).toBeNull();await gcd();const echoTick=state!.tick;await page.keyboard.press("Digit3");
 await expect.poll(()=>observed.some(s=>s.round===castRound&&s.events.some(e=>e.source===id&&e.kind==="echo"&&e.tick>=echoTick))).toBe(true);
 await page.screenshot({path:info.outputPath("cinderborn-ascendant.png")});
 const reset=state!.round;await page.getByRole("button",{name:"Restart duel",exact:true}).click();await expect.poll(()=>state!.round).toBeGreaterThan(reset);await ready();
 expect(own().sun).toBeNull();expect(own().private!.embers).toBe(0);await page.keyboard.press("Tab");const meteorRound=state!.round,meteorTick=state!.tick;await page.keyboard.press("KeyE");
 await expect.poll(()=>observed.some(s=>s.round===meteorRound&&s.areas.some(a=>a.owner===id&&a.ability==="crownfall"&&a.started>=meteorTick))).toBe(true);
 await expect.poll(()=>state!.burns.some(b=>b.owner===id&&b.ability==="crownfall")).toBe(true);await expect(page.locator("#target-ignite")).toContainText("IGNITE");await page.screenshot({path:info.outputPath("cinderborn-meteor.png")});
 await page.locator("#leave").click();await expect(page.locator("#front")).toBeVisible();expect(errors).toEqual([]);
});
