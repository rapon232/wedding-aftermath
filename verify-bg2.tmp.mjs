import fs from 'fs';
import { spawnServer } from './test/helpers.mjs';
import puppeteer from 'puppeteer-core';
const srv = await spawnServer({ SHARED_CODE:'LOVEWINS', SITE:'bg', EVENT_TZ:'Europe/Sofia' });
let fails=0; const check=(l,c,e='')=>{console.log(`${c?'✓':'✗'} ${l}${e?` (${e})`:''}`); if(!c)fails++;};
const browser = await puppeteer.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true, userDataDir: fs.mkdtempSync('/tmp/pptr-'), args:['--no-first-run','--disable-extensions']});
const page = await browser.newPage();
await page.setViewport({ width: 440, height: 900, deviceScaleFactor: 2 });
await page.goto(`${srv.base}/login.html`, { waitUntil:'networkidle0' }).catch(()=>{});
await page.evaluate(()=>document.fonts.ready);
await new Promise(r=>setTimeout(r,400));
// Is the Cyrillic title rendered in Playfair Display (not fallback serif)?
const titleFont = await page.evaluate(()=>{
  const em=[...document.querySelectorAll('.login-title em')][0];
  return getComputedStyle(em).fontFamily;
});
check('title font stack includes Playfair Display', /Playfair Display/.test(titleFont), titleFont);
const playfairLoaded = await page.evaluate(()=>[...document.fonts].some(f=>f.family.includes('Playfair')&&f.status==='loaded'));
check('Playfair Cyrillic font actually loaded', playfairLoaded);
await page.screenshot({ path:'/tmp/bg-login-fonts.png' });
// login flow: admin code → should land on gallery (bounce fix)
await page.type('#codeInput', srv.adminCode);
await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}).catch(()=>{}), page.click('#loginBtn')]);
await page.waitForSelector('#welcome', { timeout: 10000 });
await page.waitForFunction(()=>document.getElementById('welcome')?.textContent.length>0, {timeout:10000});
const url = page.url();
check('admin login lands on gallery (no bounce to login)', !url.includes('login'), url);
await browser.close(); srv.stop(); process.exit(fails?1:0);
