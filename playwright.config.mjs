import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/e2e',timeout:60000,expect:{timeout:10000},fullyParallel:false,reporter:[['list']],
 use:{baseURL:process.env.VIORA_BASE_URL||'https://viora.co.ke',trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'desktop-chromium',use:{...devices['Desktop Chrome']}},{name:'mobile-chromium',use:{...devices['Pixel 7']}}]
});
