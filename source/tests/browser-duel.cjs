const assert=require("node:assert/strict");
const {pathToFileURL}=require("node:url");
const {chromium}=require("playwright");

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",args:["--enable-unsafe-swiftshader"]});
  try {
    const page=await browser.newPage({viewport:{width:1024,height:768}});
    const errors=[]; page.on("pageerror",e=>errors.push(e.message));
    await page.goto(pathToFileURL(process.argv[2]).href);
    // A player may arm the paddle as soon as the arena lobby opens.
    await page.keyboard.press("7");
    assert.match(await page.locator("#input-status").innerText(),/P1/);
    await page.keyboard.press("l");  // A paddle armed before the page loaded starts with a shot.
    assert.match(await page.locator("#input-status").innerText(),/P2/);
    await page.locator('[data-mode="duel"]').click();
    assert.ok(await page.locator("#difficulty").isHidden());
    await page.locator('[data-dialog="connect"]').click();
    for (const key of ["7","8","w","w","u","1","6"]) await page.keyboard.press(key);
    assert.match(await page.locator("#paddle-0").innerText(),/挥拍 2 次　按键 1 次/);
    assert.match(await page.locator("#paddle-1").innerText(),/挥拍 2 次　按键 1 次/);
    await page.locator("#close").click(); await page.locator("#play").click();
    await page.waitForFunction(()=>document.querySelector("#cue").textContent==="P1发球");
    await page.keyboard.press("k"); // Wrong side must not serve.
    await page.waitForTimeout(120);
    assert.equal(await page.locator("#cue").textContent(),"P1发球");
    await page.keyboard.press("t");
    await page.waitForFunction(()=>document.querySelector("#rally").textContent.includes("1 拍"));
    await page.waitForFunction(()=>document.querySelector("#cue").textContent.includes("P2 · 现在挥拍"));
    await page.keyboard.press("k");
    await page.waitForFunction(()=>document.querySelector("#rally").textContent.includes("2 拍"));
    await page.locator("#pause").click(); await page.locator("#resume").click();
    await page.waitForFunction(()=>document.querySelector("#cpu").textContent==="1");
    await page.waitForFunction(()=>document.querySelector("#cue").textContent==="P2发球");
    await page.keyboard.press("k"); await page.waitForFunction(()=>document.querySelector("#rally").textContent.includes("1 拍"));
    await page.locator("#pause").click(); await page.locator("#back").click();
    await page.locator('[data-mode="solo"]').click(); await page.locator("#play").click(); await page.keyboard.press("Space");
    await page.waitForFunction(()=>document.querySelector("#rally").textContent.includes("1 拍"));
    assert.deepEqual(errors,[]);
    console.log("Bundled HTML, two player inputs and independent counts, P1 serve/P2 return, scoring, P2 serve, pause/resume and solo keyboard passed.");
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
