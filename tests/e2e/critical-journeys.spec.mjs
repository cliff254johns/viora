import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const hasCredentials=!!(process.env.VIORA_TEST_EMAIL&&process.env.VIORA_TEST_PASSWORD);
test('public homepage passes serious/critical WCAG axe checks',async({page})=>{
 await page.goto('/');await expect(page.locator('body')).toBeVisible();
 const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
 const serious=results.violations.filter(v=>['critical','serious'].includes(v.impact));
 console.log('VIORA_AXE_DETAILS',JSON.stringify(serious.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,html:n.html,summary:n.failureSummary}))}))));
 expect(serious.map(v=>({id:v.id,help:v.help,nodes:v.nodes.length}))).toEqual([]);
});
test('exec/admin signs in and opens Engineering Command Centre and Visuals',async({page})=>{
 test.skip(!hasCredentials,'Configure VIORA_TEST_EMAIL and VIORA_TEST_PASSWORD as protected CI secrets.');
 await page.goto('/main.html');
 await page.locator('#loginEmail').fill(process.env.VIORA_TEST_EMAIL);
 await page.locator('#loginPassword').fill(process.env.VIORA_TEST_PASSWORD);
 await page.locator('#loginBtn').click();
 await expect(page.locator('#sidebarNav')).toBeVisible({timeout:45000});
 const engineering=page.locator('#sidebarNav [data-tab="engineering-command"]');
 await expect(engineering).toBeVisible({timeout:20000});await engineering.click();
 await expect(page.getByRole('heading',{name:'Engineering Command Centre'})).toBeVisible();
 await page.locator('#eccRefresh').click();
 await page.locator('#sidebarNav [data-tab="engineering-visuals"]').click();
 await expect(page.getByRole('heading',{name:'Engineering Visuals'})).toBeVisible();
 const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
 expect(axe.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id)).toEqual([]);
});
test('mobile main system has no document-level horizontal overflow',async({page})=>{
 await page.goto('/main.html',{waitUntil:'domcontentloaded'});
 await page.waitForLoadState('load');
 await expect(page.locator('body')).toBeVisible();
 const dimensions=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth}));
 expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth+2);
});

test('homepage globe keeps satellite visuals, caption spacing and mobile page scrolling',async({page})=>{
 test.skip(test.info().project.name!=='mobile-chromium','Mobile interaction is validated in the mobile Chromium project.');
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 const globe=page.locator('#globe-container');
 await expect(globe).toBeVisible();
 await expect(globe).toHaveAttribute('data-orbital-satellites','3',{timeout:20000});
 await expect(globe).toHaveAttribute('data-orbital-tracks','2');
 const layout=await page.evaluate(()=>{
  const caption=document.querySelector('.globe-fibre-caption');
  const next=document.querySelector('.workflow-strip');
  const globe=document.querySelector('#globe-container');
  if(!caption||!next||!globe)return null;
  return {
   captionBottom:caption.getBoundingClientRect().bottom,
   nextSectionTop:next.getBoundingClientRect().top,
   touchAction:getComputedStyle(globe).touchAction,
   scrollHeight:document.documentElement.scrollHeight,
   clientHeight:document.documentElement.clientHeight
  };
 });
 expect(layout).not.toBeNull();
 expect(layout.touchAction).toContain('pan-y');
 expect(layout.captionBottom).toBeLessThanOrEqual(layout.nextSectionTop+2);
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.mouse.wheel(0,650);
 await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(0);
});
