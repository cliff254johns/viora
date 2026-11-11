// ═══════════════════════════════════════════════════════════════
// main/viora-main-wiring.js
// v2.0 — all bindings idempotent, no undeclared identifiers,
//        delegated handlers installed exactly once.
// ═══════════════════════════════════════════════════════════════

let D = null;
const _delegated = {
  contactButtons: false,
  escapeKey:      false,
  outsideClick:   false,
  formSubmit:     false,
};

export function initMainWiring(deps) {
  if (!deps || typeof deps !== 'object') {
    throw new Error('[viora-main-wiring] initMainWiring requires a deps object');
  }
  D = deps;
  return {
    attachEvents,
    attachForms,
    attachTrainingAndUiEvents,
    bindSafetyNets,
  };
}

function C() {
  if (!D) throw new Error('[viora-main-wiring] initMainWiring() was not called');
  return D;
}

/* Idempotent element binder. */
function on(el, evt, fn, opts) {
  if (!el || el._vioraWired_ === evt + ':' + (fn.name || '')) return;
  try {
    el.addEventListener(evt, fn, opts);
    el._vioraWired_ = evt + ':' + (fn.name || '');
  } catch (_) {}
}

function $(id) {
  const d = C();
  if (typeof d.$ === 'function') { try { return d.$(id); } catch (_) {} }
  return typeof document !== 'undefined' ? document.getElementById(id) : null;
}

function toast(msg, type) {
  const d = C();
  if (typeof d.toast === 'function') { try { d.toast(msg, type || 'info'); } catch (_) {} }
}

/* ═══════════════════════════════════════════════════════════════
   attachEvents()
   ═══════════════════════════════════════════════════════════════ */
export function attachEvents() {
  const d = C();
  if (d._wiringAttachEventsDone) return;
  d._wiringAttachEventsDone = true;

  /* Install global delegated listeners once. */
  _installDelegated(d);

  /* Sidebar navigation (delegated — cheap, safe to re-bind on idempotent guard). */
  document.querySelectorAll('.sidebar nav a').forEach(a => {
    on(a, 'click', () => {
      if (a.dataset.external === 'true') return;   // ← let the browser navigate
      const tab = a.dataset.tab;
      if (!tab) return;
      if (d.Viora && typeof d.Viora.navigate === 'function') d.Viora.navigate(tab);
      if (window.matchMedia('(max-width: 899px)').matches) {
        document.getElementById('sidebar')?.classList.remove('open');
        document.getElementById('sidebarOverlay')?.classList.remove('active');
        document.body.classList.remove('mob-drawer-open');
      }
    });
  });

  /* Drawer controls */
  on($('hamburgerBtn'), 'click', () => {
    $('sidebar')?.classList.toggle('open');
    $('sidebarOverlay')?.classList.toggle('active');
  });
  on($('sidebarOverlay'), 'click', () => {
    if (typeof d.closeSidebar === 'function') d.closeSidebar();
  });

  /* Theme toggle */
  on($('themeToggle'), 'click', () => {
    const c = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', c === 'dark' ? 'light' : 'dark');
    setTimeout(() => {
      try { d.renderCharts?.(); } catch (_) {}
      try { d.renderMarketplaceCharts?.(); } catch (_) {}
      try { d.renderAdminAnalytics?.(); } catch (_) {}
    }, 100);
  });

  /* Logo upload */
  const handleLogoFile = (f) => {
    if (!f) return;
    if (f.size > 500 * 1024) { toast('Logo max 500KB.', 'error'); return; }
    const r = new FileReader();
    r.onload = async (ev) => {
      const state = d.state;
      if (!state) return;
      state.data.logoUrl = ev.target.result;
      try {
        await d.set(d.ref(d.db, d.P('logoUrl')), ev.target.result);
      } catch (_) {}
      try { d.applyLogoEverywhere?.(ev.target.result); } catch (_) {}
      toast('Logo saved.', 'success');
    };
    r.readAsDataURL(f);
  };
  on($('uploadLogoBtn'), 'click', () => d.pickFile?.({ accept: 'image/*', onPick: handleLogoFile }));
  on($('uploadLogoBtnTop'), 'click', () => d.pickFile?.({ accept: 'image/*', onPick: handleLogoFile }));
  on($('logoFileInput'), 'change', (e) => {
    const f = e.target.files?.[0];
    if (f) handleLogoFile(f);
    e.target.value = '';
  });
    /* ── Product image upload (base64 preview, ≤300 KB) ── */
  (function bindProductImageUpload() {
    const fileInput    = $('prodImageFile');
    const preview      = $('prodImagePreview');
    const hidden       = $('prodImage');
    const pickBtn      = $('prodImagePickBtn');
    const clearBtn     = $('prodImageClearBtn');
    if (!fileInput || !preview || !hidden || !pickBtn) return;

    const MAX_BYTES = 300 * 1024;

    const renderPreview = (dataUrl) => {
      if (!dataUrl) {
        preview.innerHTML = '<i class="fa-solid fa-image" style="opacity:.4;color:var(--text-secondary);"></i>';
        if (clearBtn) clearBtn.style.display = 'none';
        hidden.value = '';
        return;
      }
      preview.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;" alt="">`;
      if (clearBtn) clearBtn.style.display = 'inline-flex';
      hidden.value = dataUrl;
    };

      const readFile = (file) => {
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        toast('Pick an image file (PNG/JPG/WebP).', 'error');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast('Image too large (max 5 MB source).', 'error');
        return;
      }

      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          /* Downscale to max 400×400 and re-encode as JPEG @ 0.82 quality.
             Typically lands at 25–60 KB — safe to store inline. */
          const MAX_DIM = 400;
          let { width, height } = img;
          const ratio = Math.min(1, MAX_DIM / Math.max(width, height));
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          if (dataUrl.length > MAX_BYTES * 1.4) {
            toast('Compressed image still too large. Try a smaller source.', 'error');
            return;
          }
          renderPreview(dataUrl);
        };
        img.onerror = () => toast('Could not decode image.', 'error');
        img.src = ev.target.result;
      };
      reader.onerror = () => toast('Could not read file.', 'error');
      reader.readAsDataURL(file);
    };

    pickBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      if (f) readFile(f);
      e.target.value = '';
    });
    if (clearBtn) {
      clearBtn.addEventListener('click', () => renderPreview(null));
    }

    // Expose a setter so addProduct/editProduct can hydrate the preview
    window.__vioraSetProdImage = renderPreview;
  })();

  /* Dashboard */
  on($('refreshDashboard'), 'click', () => {
    try { d.renderAll?.(); } catch (_) {}
    toast('Refreshed.', 'info');
  });

  /* Marketplace */
  on($('addProductBtn'), 'click', () => d.Viora?.addProduct?.('product'));
  on($('addPublicUiBtn'), 'click', () => d.Viora?.addProduct?.('publicUI'));
  on($('rebuildMirrorsBtn'), 'click', () => {
    if (typeof window.rebuildInventoryMirrors === 'function') window.rebuildInventoryMirrors();
  });

  on($('productSearch'), 'input', () => d.renderMarketplaceProducts?.());
  on($('productFilterCategory'), 'change', () => d.renderMarketplaceProducts?.());
  on($('productFilterStatus'), 'change', () => d.renderMarketplaceProducts?.());
  on($('clearProductSearch'), 'click', () => {
    const s = $('productSearch'); if (s) s.value = '';
    const c = $('productFilterCategory'); if (c) c.value = 'all';
    const f = $('productFilterStatus'); if (f) f.value = 'all';
    d.renderMarketplaceProducts?.();
  });

  on($('publicUiSearch'), 'input', () => d.renderPublicUiProducts?.());
  on($('publicUiFilterStatus'), 'change', () => d.renderPublicUiProducts?.());
  on($('clearPublicUiSearch'), 'click', () => {
    const s = $('publicUiSearch'); if (s) s.value = '';
    const f = $('publicUiFilterStatus'); if (f) f.value = 'all';
    d.renderPublicUiProducts?.();
  });

  on($('orderSearch'), 'input', () => d.renderMarketplaceOrders?.());
  on($('orderFilterStatus'), 'change', () => d.renderMarketplaceOrders?.());
  on($('orderFilterMethod'), 'change', () => d.renderMarketplaceOrders?.());
  on($('clearOrderSearch'), 'click', () => {
    const s = $('orderSearch'); if (s) s.value = '';
    const a = $('orderFilterStatus'); if (a) a.value = 'all';
    const b = $('orderFilterMethod'); if (b) b.value = 'all';
    d.renderMarketplaceOrders?.();
  });

  on($('recordMarketSaleBtn'), 'click', () => d.Viora?.openManualSale?.());
  on($('mpRefreshAnalytics'), 'click', () => {
    d.renderMarketplaceAnalytics?.();
    toast('Analytics refreshed.', 'info');
  });
  on($('refreshMyOrders'), 'click', () => {
    d.renderMyOrders?.();
    toast('Orders refreshed.', 'info');
  });
  on($('browseMarketplaceBtn'), 'click', () => { window.open('/marketplace.html', '_blank'); });

  on($('msAddProductBtn'), 'click', () => {
    const products = d.getProductsList?.() || [];
    if (!products.length) { toast('Add products first.', 'error'); return; }
    const state = d.state;
    if (!state) return;
    if (!Array.isArray(state.manualSaleDraft)) state.manualSaleDraft = [];
    state.manualSaleDraft.push({ productId: products[0].id, qty: 1, plan: 'monthly' });
    d.renderMsProductsList?.();
    d.renderMsSummary?.();
  });

  on($('orderPrintBtn'), 'click', () => window.print());

  on($('exportProductsCsv'), 'click', () => {
    const r = d.getProductsList?.() || [];
    if (!r.length) { toast('Nothing.', 'error'); return; }
    d.exportCsv?.(
      r,
      ['ID', 'Name', 'Category', 'Price USD', 'Price KES', 'Sold', 'Status'],
      [
        x => x.id, x => x.name, x => x.category || '',
        x => x.price || 0, x => d.usdToKes?.(x.price),
        x => (d.getProductSalesMetrics?.()?.[x.id]?.qty || 0),
        x => x.status || 'active'
      ],
      'products.csv'
    );
  });

  on($('exportOrdersCsv'), 'click', () => {
    const r = d.getOrdersList?.() || [];
    if (!r.length) { toast('Nothing.', 'error'); return; }
    d.exportCsv?.(
      r,
      ['OrderID', 'Customer', 'Email', 'Phone', 'Items', 'TotalKES', 'TotalUSD', 'Method', 'Status', 'Date'],
      [
        x => x.id, x => x.customerName, x => x.customerEmail, x => x.customerPhone || '',
        x => (x.items || []).map(i => i.productName).join(' | '),
        x => x.totalKES, x => x.totalUSD, x => x.paymentMethod, x => x.paymentStatus, x => x.timestamp
      ],
      'orders.csv'
    );
  });

  /* Leads / campaigns / appointments / presentations */
  on($('addLeadBtn'), 'click', () => d.Viora?.addLead?.());
   on($('addCampaignBtn'), 'click', () => d.Viora?.addCampaign?.());
  on($('campaignNewBtn'), 'click', () => d.Viora?.addCampaign?.());
  on($('campaignAnalyticsRefreshBtn'), 'click', () => {
    try { renderAnalyticsDashboard(); } catch (_) {}
  });
  on($('refreshAllCampaignStatsBtn'), 'click', async () => {
    const btn = $('refreshAllCampaignStatsBtn');
    if (!btn) return;
    const prev = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Refreshing…';
    try {
      await window.refreshAllCampaignStats?.();
      toast('All campaign stats refreshed.', 'success');
    } catch (e) {
      toast('Refresh failed: ' + (e.message || 'unknown'), 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = prev;
    }
  });
  on($('campMediaType'), 'change', (e) => d.applyCampMediaTypeUI?.(e.target.value));
  on($('campRefreshStats'), 'click', () => {
    const id = $('editCampaignId')?.value;
    if (!id) { toast('Save the campaign first.', 'warning'); return; }
    const camp = (d.state?.data?.campaigns || []).find(c => c.id === id);
    if (!camp?.media?.url) { toast('No media URL on this campaign.', 'warning'); return; }
    d.fetchCampaignStats?.(id, camp.media.type, camp.media.url);
  });
  on($('campTikTokConnectBtn'), 'click', () => d.connectTikTok?.());
  on($('addAppointmentBtn'), 'click', () => d.Viora?.addAppointment?.());
  on($('addPresentationBtn'), 'click', () => d.Viora?.addPresentation?.());
  on($('apptFilter'), 'change', () => d.renderAppointments?.());
  on($('presFilter'), 'change', () => d.renderPresentations?.());

  /* Personal */
  on($('todoOwnerFilter'), 'change', () => d.renderPersonalTodos?.());
  on($('todoSearch'), 'input', () => d.renderPersonalTodos?.());
  on($('todoDateFilter'), 'change', () => d.renderPersonalTodos?.());
  on($('todoStatusFilter'), 'change', () => d.renderPersonalTodos?.());
  on($('clearTodoSearch'), 'click', () => {
    const a = $('todoSearch'); if (a) a.value = '';
    const b = $('todoDateFilter'); if (b) b.value = '';
    const c = $('todoStatusFilter'); if (c) c.value = 'all';
    d.renderPersonalTodos?.();
  });
  on($('goalOwnerFilter'), 'change', () => d.renderPersonalGoals?.());
  on($('skillOwnerFilter'), 'change', () => d.renderPersonalSkills?.());
  on($('addPersonalTodoBtn'), 'click', () => d.Viora?.addPersonalTodo?.());
  on($('addPersonalGoalBtn'), 'click', () => d.Viora?.addPersonalGoal?.());
  on($('addPersonalSkillBtn'), 'click', () => d.Viora?.addPersonalSkill?.());

  /* Clientsite */
  on($('clientsiteRefreshBtn'), 'click', async () => {
    const dd = C();
    try {
      const snap = await dd.get(dd.ref(dd.db, dd.P('clientsite')));
      if (dd.state) dd.state.data.clientsite = snap.exists() ? snap.val() : {};
      dd.renderClientsite?.();
      toast('Public site data refreshed.', 'success');
    } catch (e) {
      toast('Refresh failed: ' + (e.message || 'unknown'), 'error');
    }
  });
  on($('clientsiteEditBtn'), 'click', () => d.Viora?.editClientsiteBrand?.());
  on($('clientsiteAddServiceBtn'), 'click', () => d.Viora?.editClientsiteService?.(-1));
  on($('clientsiteAddProjectBtn'), 'click', () => d.Viora?.editClientsiteProject?.(-1));
  /* ★ v9.2 — Client modal inline project repeater */
  on($('clientAddProjectBtn'), 'click', () => {
    try { window.__vioraClientProjects?.addBlank?.(); }
    catch (e) { console.warn('[client-repeater add]', e); }
  });
  /* CRUD triggers */
  on($('addDealBtn'), 'click', () => d.Viora?.addDeal?.());
  on($('addContractBtn'), 'click', () => d.Viora?.addContract?.());
  on($('clientSendWelcomeBtn'), 'click', () => {
    const id = $('editClientId')?.value;
    if (!id) { toast('Save the client first.', 'warning'); return; }
    d.openWelcomeEmailPreview?.(id);
  });
  on($('addProjectBtn'), 'click', () => d.Viora?.addProject?.());

  on($('projectGenerateInstallmentsBtn'), 'click', () => {
    const total = parseFloat($('projectAgreedTotal')?.value) || 0;
    const count = parseInt($('projectInstallmentCount')?.value) || 0;
    if (total <= 0) { toast('Enter an agreed total first.', 'error'); return; }
    if (count <= 0) { toast('Enter number of installments.', 'error'); return; }
    if (count > 24) { toast('Max 24 installments.', 'error'); return; }

    const dd = C();
    const per = Math.round((total / count) * 100) / 100;
    const insts = [];
    const start = new Date();
    start.setDate(start.getDate() + 30);
    for (let i = 0; i < count; i++) {
      const date = new Date(start);
      date.setMonth(date.getMonth() + i);
      insts.push({
        id: dd.uid?.(),
        label: `Installment ${i + 1} of ${count}`,
        amount: per,
        dueDate: dd.dateToStr?.(date),
        paid: false, paidDate: null, partialPaid: 0
      });
    }
    if (dd.state) dd.state.pendingProjectInstallments = insts;
    try { dd.renderProjectInstallmentEditor?.(insts); } catch (_) {}
    toast(`${count} installments of ${dd.fmtKES?.(per) || per} generated for this project.`, 'success');
  });

  const recalcInstallments = () => {
    const dd = C();
    const total = parseFloat($('projectAgreedTotal')?.value) || 0;
    const count = parseInt($('projectInstallmentCount')?.value) || 0;
    if (total <= 0 || count <= 0) return;
    const state = dd.state;
    if (!state) return;
    const insts = state.pendingProjectInstallments;
    if (!Array.isArray(insts) || insts.length !== count) return;
    const per = Math.round((total / count) * 100) / 100;
    insts.forEach(inst => { inst.amount = per; });
    try { dd.renderProjectInstallmentEditor?.(insts); } catch (_) {}
  };
  on($('projectAgreedTotal'), 'input', recalcInstallments);
  on($('projectInstallmentCount'), 'input', recalcInstallments);

   on($('addTaskBtn'), 'click', () => d.Viora?.addTask?.());
  on($('addWorklogBtn'), 'click', () => d.Viora?.addWorklog?.());
  on($('addInventoryBtn'), 'click', () => d.Viora?.addInventory?.());
  on($('addExpenseBtn'), 'click', () => d.Viora?.addExpense?.());
  on($('addPayrollBtn'), 'click', () => d.Viora?.addPayroll?.());
  on($('addEmployeeBtn'), 'click', () => d.Viora?.addEmployee?.());
  on($('addAssetBtn'), 'click', () => d.Viora?.addAsset?.());
  on($('addComplianceBtn'), 'click', () => d.Viora?.addCompliance?.());
  on($('generateInvoiceBtn'), 'click', () => d.openInvoiceGenModal?.());
  on($('recordPaymentBtn'), 'click', () => d.openPaymentModal?.());

  /* Communications */
  on($('commTabWa'), 'click', () => d.switchCommChannel?.('wa'));
  on($('commTabEm'), 'click', () => d.switchCommChannel?.('em'));
  on($('commWaMessage'), 'input', () => d.updateCommPreview?.());
  on($('commEmSubject'), 'input', () => d.updateCommPreview?.());
  on($('commEmMessage'), 'input', () => d.updateCommPreview?.());
  on($('commSendBtn'), 'click', () => d.sendComm?.());
  on($('commSearch'), 'input', () => d.renderCommunications?.());
  on($('commFilter'), 'change', () => d.renderCommunications?.());
  on($('clearCommSearch'), 'click', () => {
    const s = $('commSearch'); if (s) s.value = '';
    const f = $('commFilter'); if (f) f.value = 'all';
    d.renderCommunications?.();
  });
  on($('clearCommLogBtn'), 'click', async () => {
    const dd = C();
    const list = dd.state?.data?.commLog || [];
    if (!list.length) { toast('Log is already empty.', 'info'); return; }
    if (!confirm(`Delete all ${list.length} communication log entries? This cannot be undone.`)) return;
    const btn = $('clearCommLogBtn');
    const prev = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Clearing…';
    try {
      await dd.remove(dd.ref(dd.db, dd.P('commLog')));
      if (dd.state) dd.state.data.commLog = [];
      dd.renderCommunications?.();
      dd.updateSidebarCounters?.();
      await dd.logActivity?.('delete', 'Communications log cleared', `${list.length} entries removed`);
      toast(`Cleared ${list.length} communication entries.`, 'success');
    } catch (e) {
      toast('Failed to clear log: ' + (e.message || 'unknown'), 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = prev;
    }
  });

  /* Client 360 / reports */
  on($('bulkRemindBtn'), 'click', () => d.Viora?.bulkRemind?.());
  on($('c360WaBtn'), 'click', () => {
    const id = d.state?.viewing360ClientId;
    if (id) d.openCommModal?.('client', id);
  });
  on($('c360EmBtn'), 'click', () => {
    const id = d.state?.viewing360ClientId;
    if (id) d.openCommModal?.('client', id);
  });
  on($('c360ReportBtn'), 'click', () => {
    const id = d.state?.viewing360ClientId;
    if (id) d.generateClientReport?.(id);
  });
  on($('c360StatementBtn'), 'click', () => {
    const id = d.state?.viewing360ClientId;
    if (id) d.Viora?.sendClientStatement?.(id);
  });
  on($('c360PrintBtn'), 'click', async () => {
    const id = d.state?.viewing360ClientId;
    if (!id) return;
    d.closeModal?.('client360Modal');
    try { await d.generateClientReport?.(id); } catch (_) {}
    setTimeout(() => window.print(), 500);
  });
  on($('reportDownloadBtn'), 'click', () => d.downloadReportPdf?.());
  on($('reportPrintBtn'), 'click', () => window.print());

  on($('c360Search'), 'input', () => d.renderClient360Page?.());
  on($('clearC360Search'), 'click', () => {
    const s = $('c360Search'); if (s) s.value = '';
    d.renderClient360Page?.();
  });
  on($('clientSearch'), 'input', () => d.renderClients?.());
  on($('clearClientSearch'), 'click', () => {
    const s = $('clientSearch'); if (s) s.value = '';
    d.renderClients?.();
  });
  on($('projectSearch'), 'input', () => d.renderProjects?.());
  on($('projectFilterStatus'), 'change', () => d.renderProjects?.());
  on($('clearProjectSearch'), 'click', () => {
    const a = $('projectSearch'); if (a) a.value = '';
    const b = $('projectFilterStatus'); if (b) b.value = 'all';
    d.renderProjects?.();
  });
  on($('taskSearch'), 'input', () => d.renderTasks?.());
  on($('taskFilterStatus'), 'change', () => d.renderTasks?.());
  on($('clearTaskSearch'), 'click', () => {
    const a = $('taskSearch'); if (a) a.value = '';
    const b = $('taskFilterStatus'); if (b) b.value = 'all';
    d.renderTasks?.();
  });

  on($('invoiceSearch'), 'input', () => d.renderInvoices?.());
  on($('invoiceFilterStatus'), 'change', () => d.renderInvoices?.());
  on($('clearInvoiceSearch'), 'click', () => {
    const a = $('invoiceSearch'); if (a) a.value = '';
    const b = $('invoiceFilterStatus'); if (b) b.value = 'all';
    d.renderInvoices?.();
  });

  on($('activitySearch'), 'input', () => d.renderActivity?.());
  on($('activityFilter'), 'change', () => d.renderActivity?.());
  on($('clearActivitySearch'), 'click', () => {
    const a = $('activitySearch'); if (a) a.value = '';
    const b = $('activityFilter'); if (b) b.value = 'all';
    d.renderActivity?.();
  });

  /* CSV exports */
  on($('exportClientsCsv'), 'click', () => {
    const r = d.getClients?.() || [];
    if (!r.length) { toast('Nothing.', 'error'); return; }
    d.exportCsv?.(
      r,
      ['ClientID', 'Name', 'Email', 'Phone', 'Company', 'City', 'Type', 'Case Fees', 'Balance'],
      [
        x => x.clientId || '', x => x.name, x => x.email, x => x.phone,
        x => x.company || '', x => x.city || '', x => x.clientType || '',
        x => x.caseFees || 0,
        x => d.getFeeSummary?.(x.id)?.balance?.toFixed(2) || '0'
      ],
      'clients.csv'
    );
  });
  on($('exportProjectsCsv'), 'click', () => {
    const r = d.state?.data?.projects || [];
    if (!r.length) { toast('Nothing.', 'error'); return; }
    d.exportCsv?.(
      r,
      ['Number', 'Title', 'Client', 'Area', 'Platform', 'Progress', 'Status'],
      [
        x => x.projectNumber, x => x.title, x => d.getClientName?.(x.clientId),
        x => x.serviceArea || '', x => x.platform || '', x => x.progress || 0, x => x.status
      ],
      'projects.csv'
    );
  });
  on($('exportTasksCsv'), 'click', () => {
    const r = d.state?.data?.tasks || [];
    if (!r.length) { toast('Nothing.', 'error'); return; }
    d.exportCsv?.(
      r,
      ['Title', 'Description', 'Due', 'Type', 'Priority', 'Status', 'Assigned', 'Project'],
      [
        x => x.title, x => x.description || '', x => x.dueDate,
        x => x.taskType || '', x => x.priority, x => x.status,
        x => x.assignedTo || '',
        x => x.projectId ? d.getProjectNumber?.(x.projectId) : 'None'
      ],
      'tasks.csv'
    );
  });
  on($('exportInvoicesCsv'), 'click', () => {
    const r = d.state?.data?.invoices || [];
    if (!r.length) { toast('Nothing.', 'error'); return; }
    d.exportCsv?.(
      r,
      ['Number', 'Client', 'Date', 'Due', 'Total', 'Paid', 'Status', 'Currency', 'MpesaRef'],
      [
        x => x.number, x => d.getClientName?.(x.clientId), x => x.date, x => x.dueDate,
        x => (d.getInvoiceTotals?.(x)?.total ?? 0).toFixed(2),
        x => (d.getInvoicePaidAmount?.(x.id) ?? 0).toFixed(2),
        x => d.getInvoiceStatusDerived?.(x) || (x.status || ''),
        x => x.currency, x => x.mpesaRef || ''
      ],
      'invoices.csv'
    );
  });
  on($('exportActivityCsv'), 'click', () => {
    const r = d.state?.data?.activityLog || [];
    if (!r.length) { toast('Nothing.', 'error'); return; }
    d.exportCsv?.(
      r,
      ['Timestamp', 'Type', 'Title', 'Description'],
      [x => x.timestamp, x => x.type, x => x.title, x => x.description || ''],
      'activity.csv'
    );
  });
  on($('clearActivityBtn'), 'click', async () => {
    const dd = C();
    const list = dd.state?.data?.activityLog || [];
    if (!list.length) { toast('Activity log is already empty.', 'info'); return; }
    if (!confirm(`Delete all ${list.length} activity entries? This cannot be undone.`)) return;
    const btn = $('clearActivityBtn');
    const prev = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Clearing…';
    try {
      await dd.remove(dd.ref(dd.db, dd.P('activityLog')));
      if (dd.state) dd.state.data.activityLog = [];
      dd.renderActivity?.();
      dd.updateSidebarCounters?.();
      toast(`Cleared ${list.length} activity entries.`, 'success');
    } catch (e) {
      toast('Failed to clear: ' + (e.message || 'unknown'), 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = prev;
    }
  });

  /* Invoice generator */
  on($('invGenClient'), 'change', () => { d.refreshInvoiceProjects?.(); d.updateInvoicePreview?.(); });
  on($('invGenTax'), 'input', () => d.updateInvoicePreview?.());
  on($('invGenCurrency'), 'change', () => d.updateInvoicePreview?.());
  on($('invGenNotes'), 'input', () => d.updateInvoicePreview?.());
  on($('addChargeBtn'), 'click', () => {
    const state = d.state;
    if (!state) return;
    if (!Array.isArray(state.extraChargesDraft)) state.extraChargesDraft = [];
    state.extraChargesDraft.push({ label: '', amount: 0 });
    d.renderExtraCharges?.();
    d.updateInvoicePreview?.();
  });
  on($('invoiceGenWorklogList'), 'change', (e) => {
    if (e.target.classList && e.target.classList.contains('invGenCheck')) d.updateInvoicePreview?.();
  });
  on($('confirmGenerateInvoice'), 'click', async () => {
    const dd = C();
    const items = [];
    document.querySelectorAll('.invGenCheck:checked').forEach(cb => {
      items.push({
        description: cb.dataset.desc,
        hours: null, rate: null,
        amount: parseFloat(cb.dataset.amount) || 0,
        worklogId: null,
        projectId: cb.dataset.projectId || null,
        installmentId: cb.dataset.installmentId || null
      });
    });
    const charges = (dd.state?.extraChargesDraft || []).filter(c => c.label && c.amount > 0);
    if (!items.length && !charges.length) { toast('Add at least one item.', 'error'); return; }

    const distinct = new Set(items.map(i => i.projectId).filter(Boolean));
    const projectId = distinct.size === 1 ? [...distinct][0] : null;

    const inv = {
      id: dd.uid?.(),
      number: dd.generateInvoiceNumber?.(),
      clientId: $('invGenClient')?.value,
      projectId,
      date: $('invGenDate')?.value,
      dueDate: $('invGenDue')?.value,
      currency: $('invGenCurrency')?.value,
      tax: 0,
      notes: $('invGenNotes')?.value,
      items,
      extraCharges: charges,
      status: 'sent',
      createdAt: new Date().toISOString()
    };
    try {
      await dd.upsertDoc?.('invoices', inv);
      await dd.logActivity?.('add', 'Invoice generated', `${inv.number} — ${dd.getClientName?.(inv.clientId)}`);
      try { dd.EventBus?.emit?.('invoices.created', inv, inv.id, { number: inv.number, clientId: inv.clientId }); } catch (_) {}
      dd.closeModal?.('invoiceGenModal');
      toast(`Invoice ${inv.number} generated!`, 'success');
      dd.renderActiveTab?.();
    } catch (e) {
      if (e.message === 'CONFLICT_ABORTED') return;
      toast('Invoice save failed: ' + (e.message || 'unknown'), 'error');
    }
  });

  /* Invoice view actions */
  on($('shareWhatsappBtn'), 'click', async () => {
    const dd = C();
    const inv = (dd.state?.data?.invoices || []).find(x => x.id === dd.state?.viewingInvoiceId);
    if (!inv) return;
    const client = dd.getClient?.(inv.clientId);
    if (!client || !client.phone) { toast('No phone.', 'error'); return; }
    const m = dd.buildInvoiceProgressMessage?.(inv) || '';
    try {
      await dd.callFn?.('sendWhatsApp', { to: dd.normalizePhone?.(client.phone), message: m });
    } catch (_) {
      window.open(`https://wa.me/${dd.normalizePhone?.(client.phone)}?text=${encodeURIComponent(m)}`, '_blank');
    }
    dd.logComm?.('wa', client.id, client.name, client.phone, '', m, { reason: 'invoice-progress' });
    dd.renderCommunications?.();
    toast('Progress sent.', 'success');
  });
  on($('shareEmailBtn'), 'click', async () => {
    const dd = C();
    const inv = (dd.state?.data?.invoices || []).find(x => x.id === dd.state?.viewingInvoiceId);
    if (!inv) return;
    const client = dd.getClient?.(inv.clientId);
    if (!client || !client.email) { toast('No email.', 'error'); return; }
    const b = dd.buildInvoiceProgressMessage?.(inv) || '';
    const s = `Invoice ${inv.number} — progress update`;
    try {
      const esc = dd.escapeHtml || String;
      const html = b.split('\n').map(l => `<p>${esc(l)}</p>`).join('');
      await dd.callFn?.('sendEmail', { to: client.email, subject: s, html });
    } catch (_) {
      window.location.href = `mailto:${client.email}?subject=${encodeURIComponent(s)}&body=${encodeURIComponent(b)}`;
    }
    dd.logComm?.('em', client.id, client.name, client.email, s, b, { reason: 'invoice-progress' });
    dd.renderCommunications?.();
    toast('Progress sent.', 'success');
  });
  on($('stkPushBtn'), 'click', () => {
    const id = d.state?.viewingInvoiceId;
    if (id) d.openStkModal?.(id);
  });
  on($('sendStkBtn'), 'click', () => d.sendStkPush?.());
  on($('recordPaymentForInvBtn'), 'click', () => {
    const dd = C();
    const inv = (dd.state?.data?.invoices || []).find(x => x.id === dd.state?.viewingInvoiceId);
    if (!inv) return;
    const total = dd.getInvoiceTotals?.(inv)?.total ?? 0;
    const paid = dd.getInvoicePaidAmount?.(inv.id) ?? 0;
    dd.openPaymentModal?.({ clientId: inv.clientId, amount: total - paid, invoiceId: inv.id });
  });
  on($('savePaymentBtn'), 'click', () => d.savePayment?.());
  on($('payClient'), 'change', () => {
    const dd = C();
    if (dd.state) { dd.state.pendingPaymentInvoice = null; dd.state._paymentProjectId = null; }
    dd.renderPaymentProjectPicker?.();
    dd.renderPaymentAllocation?.();
  });
  on($('payAmount'), 'input', () => d.renderPaymentAllocation?.());

  /* Invoice PDF */
  on($('downloadInvoiceBtn'), 'click', async () => {
    const dd = C();
    const inv = (dd.state?.data?.invoices || []).find(x => x.id === dd.state?.viewingInvoiceId);
    if (!inv) return;
    const source = $('invoiceViewContent');
    if (!source) return;
    if (typeof window.html2canvas !== 'function' || !window.jspdf?.jsPDF) {
      toast('PDF libraries not loaded.', 'error');
      return;
    }

    const stage = document.createElement('div');
    stage.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:#fff;color:#000;padding:20px;font-family:Inter,Arial,sans-serif;font-size:12px;line-height:1.45;';
    stage.appendChild(source.cloneNode(true));
    document.body.appendChild(stage);

    stage.querySelectorAll('*').forEach(el => {
      const cs = getComputedStyle(el);
      const bg = cs.backgroundColor;
      if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') {
        el.style.backgroundColor = 'transparent';
      }
      const cm = cs.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (cm) {
        const lum = (0.299 * +cm[1] + 0.587 * +cm[2] + 0.114 * +cm[3]) / 255;
        if (lum > 0.7) el.style.color = '#000000';
      }
    });

    try {
      const canvas = await window.html2canvas(stage, {
        scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false,
        windowWidth: 794, windowHeight: stage.scrollHeight
      });
      const imgData = canvas.toDataURL('image/png');
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const imgW = pw - margin * 2;
      const imgH = (canvas.height * imgW) / canvas.width;

      if (imgH <= ph - margin * 2) {
        pdf.addImage(imgData, 'PNG', margin, margin, imgW, imgH);
      } else {
        let remaining = imgH;
        let position = margin;
        pdf.addImage(imgData, 'PNG', margin, position, imgW, imgH);
        remaining -= (ph - margin * 2);
        while (remaining > 0) {
          pdf.addPage('a4', 'portrait');
          position = margin - (imgH - remaining);
          pdf.addImage(imgData, 'PNG', margin, position, imgW, imgH);
          remaining -= (ph - margin * 2);
        }
      }
      pdf.save(`${inv.number || 'invoice'}.pdf`);
      toast('Invoice PDF downloaded.', 'success');
    } catch (e) {
      toast('PDF failed: ' + (e.message || 'unknown'), 'error');
    } finally {
      stage.remove();
    }
  });

  on($('markPaidBtn'), 'click', () => {
    const dd = C();
    const inv = (dd.state?.data?.invoices || []).find(x => x.id === dd.state?.viewingInvoiceId);
    if (!inv) return;
    const total = dd.getInvoiceTotals?.(inv)?.total ?? 0;
    const paid = dd.getInvoicePaidAmount?.(inv.id) ?? 0;
    const remaining = total - paid;
    if (remaining <= 0) { toast('Already paid.', 'info'); return; }
    dd.openPaymentModal?.({ clientId: inv.clientId, amount: remaining, invoiceId: inv.id });
  });

  on($('deleteInvoiceBtn'), 'click', () => {
    const dd = C();
    const id = dd.state?.viewingInvoiceId;
    if (id) {
      dd.Viora?.deleteInvoice?.(id);
      dd.closeModal?.('invoiceViewModal');
    }
  });

  /* Client docs */
  on($('clientDocsZone'), 'click', () => $('clientDocsInput')?.click());
   on($('clientDocsInput'), 'change', (e) => {
    const f = e.target.files?.[0];
    if (f) {
      const cid = document.getElementById('clientDocsModal')?.dataset.clientId;
      if (cid && d.Viora?.uploadClientDoc) d.Viora.uploadClientDoc(cid, f);
    }
    e.target.value = '';
  });
  on($('clientDocsZone'), 'dragover', (e) => {
    e.preventDefault();
    e.currentTarget.style.borderColor = 'var(--accent-blue)';
  });
  on($('clientDocsZone'), 'dragleave', (e) => { e.currentTarget.style.borderColor = ''; });
   on($('clientDocsZone'), 'drop', (e) => {
    e.preventDefault();
    e.currentTarget.style.borderColor = '';
    const f = e.dataTransfer?.files?.[0];
    const cid = document.getElementById('clientDocsModal')?.dataset.clientId;
    if (f && cid && d.Viora?.uploadClientDoc) d.Viora.uploadClientDoc(cid, f);
  });

  /* Document vault */
  on($('docUploadZone'), 'click', () => $('docFileInput')?.click());
  on($('docFileInput'), 'change', (e) => {
    const dd = C();
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > (dd.MAX_FILE_SIZE || 5 * 1024 * 1024)) { toast('Max 5MB.', 'error'); return; }
    if (dd.state) dd.state.pendingDoc = f;
    const preview = $('docPreview');
    if (preview) preview.innerHTML = `<div style="padding:10px;background:var(--bg-input);border-radius:10px;margin-top:8px;">📎 ${(dd.escapeHtml || String)(f.name)} (${dd.fmtBytes?.(f.size) || f.size})</div>`;
  });
  on($('confirmUploadDoc'), 'click', async () => {
    const dd = C();
    const f = dd.state?.pendingDoc;
    if (!f) { toast('Select a file.', 'error'); return; }
    const title = $('docTitle')?.value?.trim() || f.name;
    const r = new FileReader();
    r.onload = async (ev) => {
      const doc = {
        id: dd.uid?.(),
        title,
        system: $('docSystem')?.value,
        category: $('docCategory')?.value,
        parentId: $('docParent')?.value || null,
        parentName: $('docParent')?.selectedOptions?.[0]?.textContent || '',
        fileName: f.name,
        mime: f.type || 'application/octet-stream',
        size: f.size,
        data: ev.target.result,
        uploadedAt: new Date().toISOString()
      };
          try {
        await dd.upsertDoc?.('documents', doc);
        try {
          if (dd.Viora && typeof dd.Viora.mirrorDocToClient === 'function') {
            await dd.Viora.mirrorDocToClient(doc);
          }
        } catch (_) {}
        await dd.logActivity?.('upload', 'Document uploaded', title);
        dd.closeModal?.('docUploadModal');
        if (dd.state) dd.state.pendingDoc = null;
        toast('Document uploaded.', 'success');
        dd.renderDocumentVault?.();
      } catch (e) {
        toast('Upload failed: ' + (e.message || 'unknown'), 'error');
      }
    };
    r.readAsDataURL(f);
  });

  /* Presentation attachments */
  on($('presUploadZone'), 'click', () => $('presFileInput')?.click());
   on($('presFileInput'), 'change', (e) => {
    [...(e.target.files || [])].forEach(f => d.Viora?.addPresAttachment?.(f));
    e.target.value = '';
  });
  on($('presUploadZone'), 'dragover', (e) => {
    e.preventDefault();
    e.currentTarget.style.borderColor = 'var(--accent-blue)';
  });
  on($('presUploadZone'), 'dragleave', (e) => { e.currentTarget.style.borderColor = ''; });
  on($('presUploadZone'), 'drop', (e) => {
    e.preventDefault();
    e.currentTarget.style.borderColor = '';
    [...(e.dataTransfer?.files || [])].forEach(f => d.Viora?.addPresAttachment?.(f));
  });
  
  /* Document Vault */
  on($('vaultUploadBtn'), 'click', () => d.Viora?.openDocUpload?.('Admin', 'Client Document'));
  on($('vaultRefreshBtn'), 'click', () => { d.renderDocumentVault?.(); toast('Refreshed.', 'info'); });
  on($('vaultSearch'), 'input', () => d.renderDocumentVault?.());
  on($('vaultFilterCategory'), 'change', () => d.renderDocumentVault?.());
   on($('vaultClearSearch'), 'click', () => {
    const s = $('vaultSearch'); if (s) s.value = '';
    const c = $('vaultFilterCategory'); if (c) c.value = 'all';
    d.renderDocumentVault?.();
  });

  /* Personal Docs */
  on($('personalDocsUploadBtn'), 'click', () => d.Viora?.openDocUpload?.('Admin', 'Personal Document'));

  /* Client Docs */
  on($('clientDocsRefreshBtn'), 'click', () => { try { renderClientDocs(); toast('Refreshed.', 'info'); } catch (_) {} });
  on($('clientDocsSearch'), 'input', () => { try { renderClientDocs(); } catch (_) {} });
  on($('clientDocsFilterClient'), 'change', () => { try { renderClientDocs(); } catch (_) {} });
  on($('clientDocsClear'), 'click', () => {
    const s = $('clientDocsSearch'); if (s) s.value = '';
    const f = $('clientDocsFilterClient'); if (f) f.value = 'all';
    try { renderClientDocs(); } catch (_) {}
  });

  /* Proposal studio */
  on($('openProposalStudioBtn'), 'click', () => d.openProposalStudio?.());
  on($('generateProposalBtn'), 'click', () => d.generateProposalDraft?.());
  on($('saveProposalBtn'), 'click', () => d.saveProposalDraft?.());
  on($('proposalToVaultBtn'), 'click', () => d.proposalToVault?.());
  on($('proposalToInvoiceBtn'), 'click', () => d.proposalToInvoice?.());
  on($('copyProposalBtn'), 'click', () => {
    const t = $('proposalResult')?.value || '';
    navigator.clipboard.writeText(t)
      .then(() => toast('Copied.', 'success'))
      .catch(() => toast('Copy failed.', 'error'));
  });

  /* MPesa */
  on($('openMpesaBtn'), 'click', () => d.openMpesaModal?.());
  on($('mpesaSearch'), 'input', () => d.renderMpesaModal?.());
  on($('mpesaRefreshBtn'), 'click', async () => {
    await d.processMpesaQueue?.();
    d.renderMpesaModal?.();
    d.renderMpesaInline?.();
    toast('Queue refreshed.', 'info');
  });
  on($('confirmMpesaMatch'), 'click', () => d.confirmMpesaMatch?.());

  /* Service agreement */
  on($('saUploadZone'), 'click', () => $('saFileInput')?.click());
  on($('saFileInput'), 'change', (e) => {
    const dd = C();
    const f = e.target.files?.[0];
    if (f && dd.state?.pendingSA) {
      dd.attachServiceAgreement?.(f, dd.state.pendingSA.projectId);
    }
    e.target.value = '';
  });
  on($('saUploadZone'), 'dragover', (e) => {
    e.preventDefault();
    e.currentTarget.style.borderColor = 'var(--accent-blue)';
  });
  on($('saUploadZone'), 'dragleave', (e) => { e.currentTarget.style.borderColor = ''; });
  on($('saUploadZone'), 'drop', (e) => {
    e.preventDefault();
    e.currentTarget.style.borderColor = '';
    const dd = C();
    const f = e.dataTransfer?.files?.[0];
    if (f && dd.state?.pendingSA) dd.attachServiceAgreement?.(f, dd.state.pendingSA.projectId);
  });

  /* Notifications */
  on($('notifBtn'), 'click', (e) => {
    e.stopPropagation();
    const dd = C();
    if (!dd.state) return;
    dd.state.notifOpen = !dd.state.notifOpen;
    $('notifDropdown')?.classList.toggle('show', dd.state.notifOpen);
  });
  on($('notifClear'), 'click', (e) => {
    e.stopPropagation();
    d.renderNotifications?.();
  });
  on($('mobileNotifBtn'), 'click', (e) => {
    e.stopPropagation();
    const dd = C();
    if (!dd.state) return;
    dd.state.notifOpen = !dd.state.notifOpen;
    $('notifDropdown')?.classList.toggle('show', dd.state.notifOpen);
  });

  /* Modal close buttons */
  document.querySelectorAll('[data-close]').forEach(b => {
    on(b, 'click', () => {
      const targetId = b.dataset.close;
      const dd = C();
      if (targetId === 'ticketViewModal') { dd.closeTicketView?.(); return; }
      dd.closeModal?.(targetId);
    });
  });
  document.querySelectorAll('.modal-overlay').forEach(m => {
    on(m, 'click', (e) => {
      if (e.target !== m) return;
      const dd = C();
      if (m.id === 'ticketViewModal') { dd.closeTicketView?.(); return; }
      m.classList.remove('active');
    });
  });

  /* Mobile app bar — bind each control to the same live desktop action. */
  on($('mobileLogoutBtn'), 'click', () => {
    if (typeof d.doSignOut === 'function') d.doSignOut();
    else if (typeof window.doSignOut === 'function') window.doSignOut();
  });
  on($('mobileCopilotBtn'), 'click', () => d.openCmdPalette?.());
  on($('copilotOpenBtn'), 'click', () => d.openCmdPalette?.());

  /* The drawer close control must also release the mobile drawer scroll lock. */
  on($('mobDrawerClose'), 'click', () => {
    try { d.closeSidebar?.(); } catch (_) {}
    $('sidebar')?.classList.remove('open');
    $('sidebarOverlay')?.classList.remove('active');
    document.body.classList.remove('mob-drawer-open');
    document.querySelectorAll('#mobileBottomNav .mnav-item').forEach(x => x.classList.remove('active'));
  });

  /* Support tickets */
  on($('ticketsRefreshBtn'), 'click', () => {
    d.renderSupportTickets?.();
    toast('Refreshed.', 'info');
  });
  on($('ticketSearch'), 'input', () => d.renderSupportTickets?.());
  on($('clearTicketSearch'), 'click', () => {
    const s = $('ticketSearch'); if (s) s.value = '';
    const a = $('ticketFilterStatus'); if (a) a.value = 'all';
    const b = $('ticketFilterPriority'); if (b) b.value = 'all';
    d.renderSupportTickets?.();
  });
  on($('ticketFilterStatus'), 'change', () => d.renderSupportTickets?.());
  on($('ticketFilterPriority'), 'change', () => d.renderSupportTickets?.());
  on($('ticketSendReplyBtn'), 'click', () => d.sendTicketReply?.());
  on($('ticketToggleStatusBtn'), 'click', () => d.toggleTicketStatus?.());
  on($('ticketMarkResolvedBtn'), 'click', () => d.markTicketResolved?.());
  on($('ticketDeleteBtn'), 'click', () => {
    /* FIX: use getViewingTicketId() — was previously an undeclared `_viewingTicketId`. */
    const id = d.getViewingTicketId?.();
    if (id) d.deleteTicket?.(id);
  });
  on($('ticketReplyInput'), 'keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      d.sendTicketReply?.();
    }
  });

  /* Portal */
  on($('portalApproveBtn'), 'click', () => d.Viora?.approvePortalRequest?.());
  on($('portalRejectBtn'), 'click', () => d.Viora?.rejectPortalRequest?.());
  on($('portalProvisionConfirmBtn'), 'click', () => d.Viora?.provisionPortalConfirm?.());
  on($('portalProvisionBtnTop'), 'click', () => d.Viora?.provisionPortalLogin?.());
  on($('portalUsersSearch'), 'input', () => d.renderPortalUsers?.());
  on($('portalUsersFilter'), 'change', () => d.renderPortalUsers?.());
  on($('portalReqRefreshBtn'), 'click', (e) => d.Viora?.refreshPortalRequests?.(e));
  on($('clearPortalUsersSearchBtn'), 'click', () => d.Viora?.clearPortalUsersSearch?.());

  /* Mobile bottom nav — "more" opens drawer */
  document.querySelectorAll('#mobileBottomNav .mnav-item').forEach(it => {
    const mode = it.dataset.mnav;
    if (mode === 'more') {
      on(it, 'click', () => {
        document.querySelectorAll('#mobileBottomNav .mnav-item').forEach(x => x.classList.remove('active'));
        it.classList.add('active');
        const dd = C();
        if (dd.state) dd.state.mobileCategory = 'more';
        try { dd.updateMobileSubChips?.(); } catch (_) {}
        document.getElementById('sidebar')?.classList.add('open');
        document.getElementById('sidebarOverlay')?.classList.add('active');
        document.body.classList.add('mob-drawer-open');
      });
    } else {
      on(it, 'click', () => d.setMobileCategory?.(mode));
    }
  });

  /* Journal entry */
  on($('postJournalBtn'), 'click', () => d.openJournalModal?.());
  on($('addJeLineBtn'), 'click', () => {
    const dd = C();
    if (!dd.state) return;
    if (!Array.isArray(dd.state.pendingJeLines)) dd.state.pendingJeLines = [];
    dd.state.pendingJeLines.push({ account: '', debit: 0, credit: 0 });
    dd.renderJeLines?.();
  });
  on($('postJeBtn'), 'click', () => d.postJournalEntry?.());

  /* Trash / profile / orchestration */
  on($('purgeTrashBtn'), 'click', () => d.Viora?.purgeTrash?.());
  on($('editProfileBtn'), 'click', () => d.Viora?.editProfile?.());
  on($('uploadCertBtn'), 'click', () => d.Viora?.uploadCertificate?.());
  on($('orchRefreshBtn'), 'click', () => {
    d.renderOrchestrationPanel?.();
    toast('Refreshed.', 'info');
  });
  on($('orchRunCronBtn'), 'click', () => {
    try { d.Orchester?.runAllCrons?.(); } catch (_) {}
  });
  on($('archRefreshBtn'), 'click', () => {
    d.renderArchivesPanel?.();
    toast('Refreshed.', 'info');
  });
  on($('archRunBtn'), 'click', () => {
    try { d.Archiver?.runAll?.(); } catch (_) {}
    toast('Running auto-archive…', 'info');
  });

  /* Push notifications */
  on($('enablePushBtn'), 'click', () => d.PushNotifications?.requestPermission?.());
  on($('testPushBtn'), 'click', () => d.PushNotifications?.sendTest?.());

  /* Pay chain */
  on($('payChainConfirmBtn'), 'click', () => d.Viora?.confirmPayChain?.());

  /* Delegate the training/UI sub-bindings, PP, and market-content. */
  try { attachTrainingAndUiEvents(); } catch (_) {}
  try { d.bindPPEvents?.(); } catch (_) {}
  try { d.bindMarketContentEvents?.(); } catch (_) {}
}

/* ═══════════════════════════════════════════════════════════════
   attachForms()
   ═══════════════════════════════════════════════════════════════ */
export function attachForms() {
  const d = C();
  if (d._wiringAttachFormsDone) return;
  d._wiringAttachFormsDone = true;

  const safeSave = async (fn, prefix = 'Save') => {
    try {
      await fn();
    } catch (e) {
      if (e.message === 'CONFLICT_ABORTED') return;
      console.error(`${prefix} failed:`, e);
      toast(`${prefix} failed: ${e.message || 'unknown error'}`, 'error');
    }
  };

  const bindSubmit = (id, handler) => {
    const form = $(id);
    if (!form) return;
    on(form, 'submit', (e) => { e.preventDefault(); handler(); });
  };

  bindSubmit('productForm', () => safeSave(() => d.Viora?.saveProduct?.({
    id: $('prodId')?.value?.trim(),
    name: $('prodName')?.value?.trim(),
    description: $('prodDescription')?.value?.trim(),
    category: $('prodCategory')?.value,
    icon: $('prodIcon')?.value?.trim() || 'fa-solid fa-cube',
    price: parseFloat($('prodPrice')?.value) || 0,
    period: $('prodPeriod')?.value,
    tags: $('prodTags')?.value?.trim(),
    status: $('prodStatus')?.value,
    _kind: $('prodKind')?.value || 'product',
    liveUrl: $('prodLiveUrl')?.value?.trim() || null,
    previewUrl: $('prodPreviewUrl')?.value?.trim() || null,
    link: $('prodLink')?.value?.trim() || null,
    image: $('prodImage')?.value?.trim() || null
  })));

  bindSubmit('manualSaleForm', () => safeSave(() => d.Viora?.submitManualSale?.({
    name: $('msName')?.value?.trim(),
    email: $('msEmail')?.value?.trim(),
    phone: $('msPhone')?.value?.trim(),
    method: $('msMethod')?.value
  })));

  bindSubmit('leadForm', () => safeSave(() => d.Viora?.saveLead?.({
    name: $('leadName')?.value?.trim(),
    email: $('leadEmail')?.value?.trim(),
    phone: $('leadPhone')?.value?.trim(),
    source: $('leadSource')?.value,
    status: $('leadStatus')?.value,
    campaignId: $('leadCampaign')?.value,
    notes: $('leadNotes')?.value?.trim()
  })));

  bindSubmit('campaignForm', () => safeSave(() => d.Viora?.saveCampaign?.({
    name: $('campName')?.value?.trim(),
    budget: parseFloat($('campBudget')?.value) || 0,
    spend: parseFloat($('campSpend')?.value) || 0,
    startDate: $('campStart')?.value,
    endDate: $('campEnd')?.value,
    status: $('campStatus')?.value
  })));

  bindSubmit('appointmentForm', () => safeSave(() => d.Viora?.saveAppointment?.({
    title: $('apTitle')?.value?.trim(),
    clientId: $('apClient')?.value,
    type: $('apType')?.value,
    date: $('apDate')?.value,
    startTime: $('apStartTime')?.value,
    endTime: $('apEndTime')?.value,
    mode: $('apMode')?.value,
    location: $('apLocation')?.value?.trim(),
    attendees: $('apAttendees')?.value?.trim(),
    agenda: $('apAgenda')?.value?.trim(),
    notes: $('apNotes')?.value?.trim(),
    assignedTo: $('apAssigned')?.value,
    status: $('apStatus')?.value,
    reminderMinutes: parseInt($('apReminder')?.value) || 60,
    notify: $('apNotify')?.value
  })));

  bindSubmit('presentationForm', () => safeSave(() => {
    const dd = C();
    dd.Viora?.savePresentation?.({
      title: $('prTitle')?.value?.trim(),
      clientId: $('prClient')?.value,
      appointmentId: $('prAppointment')?.value || null,
      type: $('prType')?.value,
      channel: $('prChannel')?.value,
      date: $('prDate')?.value,
      startTime: $('prStartTime')?.value,
      duration: parseInt($('prDuration')?.value) || 30,
      presenterId: $('prPresenter')?.value,
      status: $('prStatus')?.value,
      summary: $('prSummary')?.value?.trim(),
      outcome: $('prOutcome')?.value?.trim(),
      nextSteps: $('prNextSteps')?.value?.trim(),
      attachments: Array.isArray(dd.state?.pendingPresAttachments) ? dd.state.pendingPresAttachments.slice() : []
    });
  }));

  bindSubmit('personalTodoForm', () => safeSave(() => d.Viora?.savePersonalTodo?.({
    text: $('ptText')?.value?.trim(),
    date: $('ptDate')?.value,
    dueTime: $('ptDueTime')?.value,
    priority: $('ptPriority')?.value,
    recurring: $('ptRecurring')?.value === 'yes'
  })));

  bindSubmit('personalGoalForm', () => safeSave(() => d.Viora?.savePersonalGoal?.()));
  bindSubmit('personalSkillForm', () => safeSave(() => d.Viora?.savePersonalSkill?.({
    name: $('psName')?.value?.trim(),
    category: $('psCategory')?.value,
    level: parseInt($('psLevel')?.value) || 1,
    hours: parseFloat($('psHours')?.value) || 0,
    target: parseFloat($('psTarget')?.value) || 100
  })));

  bindSubmit('clientsiteBrandForm', () => safeSave(() => d.Viora?.saveClientsiteBrand?.()));
  bindSubmit('clientsiteServiceForm', () => safeSave(() => d.Viora?.saveClientsiteService?.()));
  bindSubmit('clientsiteProjectForm', () => safeSave(() => d.Viora?.saveClientsiteProject?.()));

  bindSubmit('dealForm', () => safeSave(() => d.Viora?.saveDeal?.({
    title: $('dealTitle')?.value?.trim(),
    clientId: $('dealClient')?.value,
    value: parseFloat($('dealValue')?.value) || 0,
    stage: $('dealStage')?.value,
    terms: $('dealTerms')?.value,
    owner: $('dealOwner')?.value?.trim(),
    source: $('dealSource')?.value,
    notes: $('dealNotes')?.value?.trim()
  })));

  bindSubmit('contractForm', () => safeSave(() => d.Viora?.saveContract?.({
    title: $('contractTitle')?.value?.trim(),
    clientId: $('contractClient')?.value,
    dealId: $('contractDeal')?.value,
    startDate: $('contractStart')?.value,
    expiryDate: $('contractExpiry')?.value,
    value: parseFloat($('contractValue')?.value) || 0,
    status: $('contractStatus')?.value,
    sla: $('contractSla')?.value?.trim()
  })));

  bindSubmit('clientForm', () => safeSave(() => d.Viora?.saveClient?.({
    name: $('clientName')?.value?.trim(),
    email: $('clientEmail')?.value?.trim(),
    phone: $('clientPhone')?.value?.trim(),
    phoneAlt: $('clientPhoneAlt')?.value?.trim(),
    company: $('clientCompany')?.value?.trim(),
    address: $('clientAddress')?.value?.trim(),
    city: $('clientCity')?.value?.trim(),
    clientType: $('clientType')?.value,
    caseFees: $('clientCaseFees')?.value
  })));

  bindSubmit('projectForm', () => safeSave(() => d.Viora?.saveProject?.({
    clientId: $('projectClient')?.value,
    projectNumber: $('projectNumber')?.value?.trim(),
    title: $('projectTitle')?.value?.trim(),
    serviceArea: $('projectServiceArea')?.value,
    platform: $('projectPlatform')?.value,
    clientRep: $('projectClientRep')?.value?.trim(),
    projectLead: $('projectLead')?.value?.trim(),
    startDate: $('projectStartDate')?.value,
    deadline: $('projectDeadline')?.value,
    nextMilestone: $('projectNextMilestone')?.value,
    progress: parseInt($('projectProgress')?.value) || 0,
    status: $('projectStatus')?.value,
    description: $('projectDesc')?.value?.trim()
  })));

  bindSubmit('taskForm', () => safeSave(() => d.Viora?.saveTask?.({
    title: $('taskTitle')?.value?.trim(),
    description: $('taskDesc')?.value?.trim(),
    dueDate: $('taskDueDate')?.value,
    taskType: $('taskType')?.value,
    priority: $('taskPriority')?.value,
    status: $('taskStatus')?.value,
    assignedTo: $('taskAssigned')?.value?.trim(),
    projectId: $('taskProject')?.value,
    reminderMinutes: parseInt($('taskReminderMinutes')?.value) || 1440,
    price: parseFloat($('taskPrice')?.value) || 0,
    worklogId: $('taskWorklogId')?.value || null
  })));

  bindSubmit('worklogForm', () => safeSave(() => d.Viora?.saveWorklog?.({
    projectId: $('worklogProject')?.value,
    date: $('worklogDate')?.value,
    activity: $('worklogActivity')?.value,
    hours: parseFloat($('worklogHours')?.value) || 0,
    rate: parseFloat($('worklogRate')?.value) || 0,
    description: $('worklogDesc')?.value?.trim(),
    isBilled: $('worklogBilled')?.checked || false,
  })));

  bindSubmit('inventoryForm', () => safeSave(() => d.Viora?.saveInventory?.({
    sku: $('invSku')?.value?.trim(),
    name: $('invName')?.value?.trim(),
    qty: parseInt($('invQty')?.value) || 0,
    reorder: parseInt($('invReorder')?.value) || 0,
    cost: parseFloat($('invCost')?.value) || 0,
    price: parseFloat($('invPrice')?.value) || 0
  })));

  bindSubmit('expenseForm', () => safeSave(() => d.Viora?.saveExpense?.({
    vendor: $('exVendor')?.value?.trim(),
    vendorPhone: $('exVendorPhone')?.value?.trim(),
    vendorEmail: $('exVendorEmail')?.value?.trim(),
    category: $('exCategory')?.value,
    amount: parseFloat($('exAmount')?.value) || 0,
    method: $('exMethod')?.value,
    status: $('exStatus')?.value,
    date: $('exDate')?.value,
    projectId: $('exProject')?.value || null,
    description: $('exDesc')?.value?.trim()
  })));

  bindSubmit('payrollForm', () => safeSave(() => d.Viora?.savePayroll?.({
    employeeId: $('prEmployee')?.value,
    period: $('prPeriod')?.value?.trim(),
    attendance: parseInt($('prAttendance')?.value) || 0,
    gross: parseFloat($('prGross')?.value) || 0,
    benefits: parseFloat($('prBenefits')?.value) || 0,
    projectId: $('prProject')?.value || null,
    status: $('prStatus')?.value
  })));

  bindSubmit('employeeForm', () => safeSave(() => d.Viora?.saveEmployee?.({
    name: $('empName')?.value?.trim(),
    designation: $('empDesig')?.value?.trim(),
    department: $('empDept')?.value,
    payRate: parseFloat($('empPay')?.value) || 0,
    leaveBalance: parseFloat($('empLeave')?.value) || 0,
    status: $('empStatus')?.value,
    email: $('empEmail')?.value?.trim(),
    phone: $('empPhone')?.value?.trim(),
    bankDetails: $('empBank')?.value?.trim()
  })));

  bindSubmit('assetForm', () => safeSave(() => d.Viora?.saveAsset?.({
    name: $('asName')?.value?.trim(),
    category: $('asCategory')?.value,
    cost: parseFloat($('asCost')?.value) || 0,
    depreciation: parseFloat($('asDepr')?.value) || 0,
    assignedTo: $('asAssigned')?.value,
    purchaseDate: $('asDate')?.value,
    status: $('asStatus')?.value
  })));

  bindSubmit('complianceForm', () => safeSave(() => d.Viora?.saveCompliance?.({
    title: $('cpTitle')?.value?.trim(),
    regNo: $('cpRegNo')?.value?.trim(),
    issueDate: $('cpIssue')?.value,
    expiryDate: $('cpExpiry')?.value,
    status: $('cpStatus')?.value,
    notes: $('cpNotes')?.value?.trim()
  })));

  /* Client installment generator */
  on($('generateInstallmentsBtn'), 'click', () => {
    const dd = C();
    const total = parseFloat($('clientCaseFees')?.value) || 0;
    const n = parseInt($('clientInstallmentCount')?.value) || 0;
    if (total <= 0) { toast('Enter total fees first.', 'error'); return; }
    if (n <= 0) { toast('Enter number of installments.', 'error'); return; }
    if (n > 24) { toast('Max 24 installments.', 'error'); return; }
    const per = Math.round((total / n) * 100) / 100;
    const insts = [];
    const start = new Date();
    start.setDate(start.getDate() + 30);
    for (let i = 0; i < n; i++) {
      const date = new Date(start);
      date.setMonth(date.getMonth() + i);
      insts.push({
        id: dd.uid?.(),
        label: `Installment ${i + 1} of ${n}`,
        amount: per,
        dueDate: dd.dateToStr?.(date),
        paid: false, paidDate: null, partialPaid: 0
      });
    }
    if (dd.state) dd.state.pendingInstallments = insts;
    try { dd.renderInstallmentEditor?.(insts); } catch (_) {}
    toast(`${n} installments of ${dd.fmtKES?.(per) || per} generated.`, 'success');
  });

  on($('clientCaseFees'), 'input', () => {
    const dd = C();
    const total = parseFloat($('clientCaseFees')?.value) || 0;
    const n = parseInt($('clientInstallmentCount')?.value) || 0;
    if (total <= 0 || n <= 0) return;
    const insts = dd.state?.pendingInstallments;
    if (!Array.isArray(insts) || insts.length !== n) return;
    const per = Math.round((total / n) * 100) / 100;
    insts.forEach(inst => { inst.amount = per; });
    try { dd.renderInstallmentEditor?.(insts); } catch (_) {}
  });

  on($('calcPayrollBtn'), 'click', async () => {
    const dd = C();
    const gross = parseFloat($('prGross')?.value) || 0;
    const benefits = parseFloat($('prBenefits')?.value) || 0;
    if (gross <= 0) { toast('Enter gross salary.', 'error'); return; }
    try {
      const res = await dd.callFn?.('payroll/calc', { gross, benefits });
      if (!res) return;
      const ded = res.deductions || {};
      const result = $('prCalcResult');
      if (!result) return;
      const esc = dd.escapeHtml || String;
      result.style.display = 'block';
      result.innerHTML =
        `<strong>Statutory Breakdown</strong><div style="margin-top:6px;">PAYE: ${dd.fmtKES?.(ded.paye)} · NSSF: ${dd.fmtKES?.(ded.nssf)} · SHIF: ${dd.fmtKES?.(ded.shif)} · Housing: ${dd.fmtKES?.(ded.housingLevy)}</div>` +
        `<div style="margin-top:6px;">Total Deductions: <strong>${dd.fmtKES?.(ded.total)}</strong> · Net: <strong style="color:var(--accent-green);">${dd.fmtKES?.(res.net)}</strong></div>` +
        `<div style="font-size:.7rem;color:var(--text-secondary);margin-top:6px;">${esc(res.note || '')}</div>`;
      if (dd.state) dd.state.pendingPayrollCalc = res;
    } catch (e) {
      toast('Calculation failed.', 'error');
    }
  });

  on($('pgAddMilestoneBtn'), 'click', () => {
    const dd = C();
    if (!dd.state) return;
    if (!dd.state.editingPersonalGoal) dd.state.editingPersonalGoal = { milestones: [] };
    if (!Array.isArray(dd.state.editingPersonalGoal.milestones)) dd.state.editingPersonalGoal.milestones = [];
    dd.state.editingPersonalGoal.milestones.push({ text: '', done: false });
    try { dd.renderGoalMilestoneEditor?.(); } catch (_) {}
  });
}

/* ═══════════════════════════════════════════════════════════════
   attachTrainingAndUiEvents()
   ═══════════════════════════════════════════════════════════════ */
export function attachTrainingAndUiEvents() {
  const d = C();
  if (d._wiringAttachTrainingDone) return;
  d._wiringAttachTrainingDone = true;

  const on2 = (id, evt, fn) => on($(id), evt, fn);

  on2('clientsiteIndustryForm', 'submit', (e) => { e.preventDefault(); d.Viora?.saveClientsiteIndustry?.(); });
  on2('ciDeleteBtn', 'click', () => d.Viora?.deleteClientsiteIndustry?.());
  on2('clientsiteBlogForm', 'submit', (e) => { e.preventDefault(); d.Viora?.saveClientsiteBlogPost?.(); });
  on2('cbDeleteBtn', 'click', () => d.Viora?.deleteClientsiteBlogPost?.());
  on2('clientsiteFaqForm', 'submit', (e) => { e.preventDefault(); d.Viora?.saveClientsiteFaq?.(); });
  on2('cfDeleteBtn', 'click', () => d.Viora?.deleteClientsiteFaq?.());
  on2('clientsiteTestimonialForm', 'submit', (e) => { e.preventDefault(); d.Viora?.saveClientsiteTestimonial?.(); });
  on2('ctDeleteBtn', 'click', () => d.Viora?.deleteClientsiteTestimonial?.());
  on2('clientsiteTechStackForm', 'submit', (e) => { e.preventDefault(); d.Viora?.saveClientsiteTechStack?.(); });
  on2('clientsiteSkillForm', 'submit', (e) => { e.preventDefault(); d.Viora?.saveClientsiteSkill?.(); });
  on2('cskDeleteBtn', 'click', () => d.Viora?.deleteClientsiteSkill?.());

  on2('trainingRefreshBtn', 'click', () => {
    d.renderTrainingProgress?.();
    toast('Refreshed.', 'info');
  });
  ['trainingUserSearch', 'trainingUserRoleFilter', 'trainingUserCourseFilter'].forEach(id => {
    on2(id, 'input',  () => d.renderTrainingProgress?.());
    on2(id, 'change', () => d.renderTrainingProgress?.());
  });
  on2('trainingClearFilters', 'click', () => {
    const s = $('trainingUserSearch'); if (s) s.value = '';
    const r = $('trainingUserRoleFilter'); if (r) r.value = 'all';
    const c = $('trainingUserCourseFilter'); if (c) c.value = 'all';
    d.renderTrainingProgress?.();
  });

  on2('clientAvatarPickBtn', 'click', () => $('clientAvatarInput')?.click());
  on2('clientAvatarPreview', 'click', () => $('clientAvatarInput')?.click());
  on2('clientAvatarInput', 'change', (e) => {
    const dd = C();
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast('Pick an image file.', 'error'); return; }
    if (f.size > 500 * 1024) { toast('Max 500 KB.', 'error'); return; }
    const r = new FileReader();
    r.onload = (ev) => {
      if (dd.state) dd.state.pendingClientAvatar = ev.target.result;
      try { dd.renderClientAvatarPreview?.(); } catch (_) {}
      toast('Picture ready — click Save to apply.', 'info');
    };
    r.readAsDataURL(f);
  });
  on2('clientAvatarClearBtn', 'click', () => {
    const dd = C();
    if (dd.state) dd.state.pendingClientAvatar = '__CLEAR__';
    try { dd.renderClientAvatarPreview?.(); } catch (_) {}
  });
}

/* ═══════════════════════════════════════════════════════════════
   bindSafetyNets() — install global delegated handlers once
   ═══════════════════════════════════════════════════════════════ */
export function bindSafetyNets() {
  const d = C();
  if (d._wiringSafetyDone) return;
  d._wiringSafetyDone = true;

  /* Global delegated contact-button handler — installed once, ever. */
  if (!_delegated.contactButtons) {
    _delegated.contactButtons = true;
    document.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('.contact-actions button[data-action]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const dd = C();
      dd.openCommModal?.(btn.dataset.entityType, btn.dataset.entityId);
    }, { passive: false });
  }

  /* Global outside-click for notification dropdown — installed once. */
  if (!_delegated.outsideClick) {
    _delegated.outsideClick = true;
    document.addEventListener('click', (e) => {
      if (!e.target.closest) return;
      if (!e.target.closest('.notif-wrap') && !e.target.closest('#mobileNotifBtn')) {
        document.getElementById('notifDropdown')?.classList.remove('show');
        const dd = C();
        if (dd.state) dd.state.notifOpen = false;
      }
    }, { passive: true });
  }

  /* Global Escape closes all open modals — installed once. */
  if (!_delegated.escapeKey) {
    _delegated.escapeKey = true;
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const dd = C();
      const activeTicket = document.querySelector('#ticketViewModal.active');
      if (activeTicket) { dd.closeTicketView?.(); return; }
      document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    });
  }

  /* Global form-submit → close-modal fallback — installed once. */
  if (!_delegated.formSubmit) {
    _delegated.formSubmit = true;
    document.addEventListener('submit', (e) => {
      const form = e.target;
      if (!form || !form.closest) return;
      const modal = form.closest('.modal-overlay');
      if (!modal) return;
      /* Defer so the submit handler runs first. */
      queueMicrotask(() => {
        if (form._keepModalOpen) return;
        if (modal.classList.contains('active')) modal.classList.remove('active');
      });
    }, true);
  }

  /* Mobile "Enable alerts" button — one-time bind with retry. */
  (function bindEnableAlerts() {
    const tryBind = () => {
      const btn = document.getElementById('enableAlertsBtn');
      if (!btn || btn._vioraAlertsBound) return !!btn;
      btn._vioraAlertsBound = true;

      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const original = btn.innerHTML;

        if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
          btn.disabled = false;
          toast('Notifications are blocked. Enable them in your browser settings.', 'warning');
          return;
        }

        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span style="margin-left:6px;">Enabling…</span>';

        try {
          try { if (Notification.permission === 'default') await Notification.requestPermission(); } catch (_) {}
          try { await C().PushNotifications?.requestPermission?.(); } catch (_) {}

          btn.innerHTML = '<i class="fa-solid fa-check" style="color:var(--accent-green);"></i><span style="margin-left:6px;">Alerts on</span>';
          setTimeout(() => { btn.style.display = 'none'; }, 2000);
          toast('Alerts enabled on this device.', 'success');
        } catch (e) {
          btn.innerHTML = original;
          btn.disabled = false;
          toast('Could not enable alerts: ' + (e.message || ''), 'error');
        }
      });
      return true;
    };

    if (!tryBind()) {
      let n = 0;
      const t = setInterval(() => { n++; if (tryBind() || n > 300) clearInterval(t); }, 100);
    }
  })();

  /* Mobile notification bell — real toggle, no double handlers. */
  (function bindMobileBell() {
    const tryBind = () => {
      const mobileBtn  = document.getElementById('mobileNotifBtn');
      const desktopBtn = document.getElementById('notifBtn');
      const dropdown   = document.getElementById('notifDropdown');
      if (!dropdown) return false;

      const toggle = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const wasOpen = dropdown.classList.contains('show');
        dropdown.classList.remove('show');
        if (!wasOpen) {
          dropdown.classList.add('show');
          try { C().renderNotifications?.(); } catch (_) {}
        }
      };

      if (mobileBtn && !mobileBtn._vioraBellBound) {
        mobileBtn._vioraBellBound = true;
        mobileBtn.addEventListener('click', toggle);
      }
      if (desktopBtn && !desktopBtn._vioraBellBound) {
        desktopBtn._vioraBellBound = true;
        desktopBtn.addEventListener('click', toggle);
      }
      return true;
    };

    if (!tryBind()) {
      let n = 0;
      const t = setInterval(() => { n++; if (tryBind() || n > 300) clearInterval(t); }, 100);
    }
  })();

  /* Mobile "More" tab → drawer. */
  (function bindMobileMore() {
    const tryBind = () => {
      const moreBtn = document.querySelector('#mobileBottomNav .mnav-item[data-mnav="more"]');
      if (!moreBtn || moreBtn._vioraMoreBound) return !!moreBtn;
      moreBtn._vioraMoreBound = true;
      moreBtn.addEventListener('click', () => {
        document.querySelectorAll('#mobileBottomNav .mnav-item').forEach(x => x.classList.remove('active'));
        moreBtn.classList.add('active');
        const dd = C();
        if (dd.state) dd.state.mobileCategory = 'more';
        try { dd.updateMobileSubChips?.(); } catch (_) {}
        document.getElementById('sidebar')?.classList.add('open');
        document.getElementById('sidebarOverlay')?.classList.add('active');
        document.body.classList.add('mob-drawer-open');
      });
      return true;
    };
    if (!tryBind()) {
      let n = 0;
      const t = setInterval(() => { n++; if (tryBind() || n > 300) clearInterval(t); }, 100);
    }
  })();

  /* ★ v9.7 — Global safety net: auto-wire [data-close] buttons on ANY
     modal added to the DOM after boot. Fixes dynamically-created
     modals whose Close buttons had no click handler. */
  (function installDynamicModalSafetyNet() {
    if (window.__vioraDynamicModalNet) return;
    window.__vioraDynamicModalNet = true;

    const findWithin = (root, selector) => {
      if (!root) return [];
      const found = [];
      if (root.nodeType === 1 && root.matches?.(selector)) found.push(root);
      if (root.querySelectorAll) found.push(...root.querySelectorAll(selector));
      return found;
    };

    const wireDataCloseButtons = (root) => {
      if (!root) return;
      findWithin(root, '[data-close]').forEach(b => {
        if (b._vioraDataCloseBound || (typeof b._vioraWired_ === 'string' && b._vioraWired_.startsWith('click:'))) return;
        b._vioraDataCloseBound = true;
        b.addEventListener('click', (e) => {
          const targetId = b.dataset.close;
          const dd = C();
          if (targetId === 'ticketViewModal') { dd.closeTicketView?.(); return; }
          dd.closeModal?.(targetId);
        });
      });
    };

    // Also wire any modal-overlay outside-click that we may have missed
    const wireOverlayClick = (root) => {
      if (!root) return;
      findWithin(root, '.modal-overlay').forEach(m => {
        if (m._vioraOverlayBound || (typeof m._vioraWired_ === 'string' && m._vioraWired_.startsWith('click:'))) return;
        m._vioraOverlayBound = true;
        m.addEventListener('click', (e) => {
          if (e.target !== m) return;
          const dd = C();
          if (m.id === 'ticketViewModal') { dd.closeTicketView?.(); return; }
          // Use closeModal if available so body overflow gets reset properly
          if (typeof dd.closeModal === 'function') dd.closeModal(m.id);
          else {
            m.classList.remove('active');
            m.style.display = '';
            document.body.style.overflow = '';
          }
        });
      });
    };

    const wireAll = (root) => {
      wireDataCloseButtons(root);
      wireOverlayClick(root);
    };

    // Wire anything already in the DOM
    wireAll(document);

    // Watch for new modals created dynamically
    const obs = new MutationObserver((mutations) => {
      for (const mut of mutations) {
        for (const node of mut.addedNodes) {
          if (node.nodeType !== 1) continue;
          wireAll(node);
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  })();
}

/* Idempotent delegated-install helper — used by attachEvents. */
function _installDelegated(d) {
  /* No-op here; the heavy lifts are in bindSafetyNets(). We keep this
     function so attachEvents() has a symmetric hook. */
  void d;
}
