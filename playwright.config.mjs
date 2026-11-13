import {defineConfig,devices} from '@playwright/test';
const useLocalServer=process.env.VIORA_USE_LOCAL_SERVER==='true';
export default defineConfig({
 testDir:'./tests/e2e',timeout:60000,expect:{timeout:10000},fullyParallel:false,reporter:[['list']],
 use:{baseURL:process.env.VIORA_BASE_URL||'http://127.0.0.1:4173',trace:'retain-on-failure',screenshot:'only-on-failure',serviceWorkers:'block'},
 webServer:useLocalServer?{
  command:'python3 -m http.server 4173 --directory web',
  url:'http://127.0.0.1:4173',
  reuseExistingServer:!process.env.CI,
  timeout:30000
 }:undefined,
 projects:[{name:'desktop-chromium',use:{...devices['Desktop Chrome']}},{name:'mobile-chromium',use:{...devices['Pixel 7']}}]
});
