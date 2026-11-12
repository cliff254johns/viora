import test from 'node:test';
import assert from 'node:assert/strict';
import { initFinance, getInvoiceTotals, getInvoicePaidAmount, getInvoiceStatusDerived } from '../../web/main/finance.js';
import { initProjects, getProjectAgreedTotal, getProjectBilledTotal, getProjectPaidTotal, getProjectRemainingTotal, getProjectFinancialProgress } from '../../web/main/projects.js';

globalThis.window = globalThis.window || {};
const state = { data: {
  invoices: [
    {id:'i1',projectId:'p1',clientId:'c1',status:'sent',items:[{amount:1000},{amount:250}],extraCharges:[{amount:50}]},
    {id:'i2',projectId:'p1',clientId:'c1',status:'draft',items:[{amount:500}]},
    {id:'i3',projectId:'p2',clientId:'c2',status:'sent',items:[{amount:900}]}
  ],
  payments: [
    {id:'pay1',projectId:'p1',amount:400,allocations:[{invoiceId:'i1',amount:400}]},
    {id:'pay2',projectId:'p1',amount:100,allocations:[{invoiceId:'i1',amount:100}]},
    {id:'pay3',projectId:'p1',amount:900,voided:true,allocations:[]},
    {id:'pay4',projectId:'p2',amount:200,reversed:true,allocations:[]}
  ],
  projects: [
    {id:'p1',clientId:'c1',agreedTotal:2000,installments:[]},
    {id:'p2',clientId:'c2',installments:[{amount:600},{amount:400}]}
  ]
}};
initFinance({state});
initProjects({state,getProject:id=>state.data.projects.find(p=>p.id===id),getInvoiceStatusDerived,getInvoiceTotals,upsertDoc:async()=>{}});
test('invoice totals include line items and extra charges, tolerate missing input',()=>{
 assert.deepEqual(getInvoiceTotals(null),{subtotal:0,tax:0,taxAmt:0,total:0});
 assert.equal(getInvoiceTotals(state.data.invoices[0]).total,1300);
});
test('invoice payment allocations aggregate exactly once per loaded payment array',()=>{
 assert.equal(getInvoicePaidAmount('i1'),500);
 assert.equal(getInvoicePaidAmount('missing'),0);
 assert.equal(getInvoiceStatusDerived(state.data.invoices[0]),'partial');
});
test('project agreed total prefers explicit value then installments',()=>{
 assert.equal(getProjectAgreedTotal('p1'),2000);
 assert.equal(getProjectAgreedTotal('p2'),1000);
 assert.equal(getProjectAgreedTotal('missing'),0);
});
test('project billed total excludes draft invoices and honours exclusion id',()=>{
 assert.equal(getProjectBilledTotal('p1'),1300);
 assert.equal(getProjectBilledTotal('p1','i1'),0);
});
test('project paid total excludes voided and reversed payments',()=>{
 assert.equal(getProjectPaidTotal('p1'),400);
 assert.equal(getProjectPaidTotal('p2'),0);
});
test('remaining balance and financial progress are bounded and deterministic',()=>{
 assert.equal(getProjectRemainingTotal('p1'),700);
 assert.deepEqual(getProjectFinancialProgress('p1'),{pct:20,agreed:2000,paid:400,balance:1600});
 assert.deepEqual(getProjectFinancialProgress('p2'),{pct:0,agreed:1000,paid:0,balance:1000});
});
