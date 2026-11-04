// ═══════════════════════════════════════════════════════════════
// main/viora-main-handlers.js
// Builds the `Viora` object that HTML inline onclick handlers call.
//
// FIX (this version):
//   • Destructures `applyLogoEverywhere` (was `applyLogoEverything`
//     → caused silent ReferenceError, killed the whole object,
//     which killed sidebar navigation).
//   • Guards optional deps so a missing wiring can't throw at build.
//   • Keeps the public API surface unchanged.
// ═══════════════════════════════════════════════════════════════

export function buildVioraHandlers(d) {
  if (!d || typeof d !== 'object') {
    throw new Error('[viora-main-handlers] buildVioraHandlers requires a deps object');
  }

  const Viora = {};

  /* ═══════════════════════════════════════════════════════════
     DESTRUCTURE — every identifier below is guaranteed to be
     at worst `undefined`, never a thrown ReferenceError, because
     we read from a plain object literal.
     ═══════════════════════════════════════════════════════════ */
  const {
    // ── Firebase SDK ──
    db, auth, ref, set, get, remove, push, update, query, limitToLast,
    onValue, onChildAdded, onChildChanged, onChildRemoved,
    goOnline, goOffline,
    P, ROOT, WORKER_URL,

    // ── State ──
    state,

    // ── UI + feedback ──
    $, toast, logActivity, logComm, callFn, setSyncStatus,
    openModal, closeModal, showModal, hideModal, openCmdPalette,
    vioraConfirm, vioraPrompt,
    applyLogoEverywhere, getLogoImg,     // ← FIXED NAME
    addNotification, surfaceVioraNotification,

    // ── Format / util ──
    uid, todayStr, dateToStr, fmtDate, fmtDateTime, fmtKES, fmtUSD,
    usdToKes, kpiFormat, timeAgo, daysBetween, isOverdue, fmtBytes,
    escapeHtml, normalizePhone, normalizeEmail, simpleHash, emailToId,
    generateLicenseKey, isMobile, debounce, pickFile, pickFileMobileSplit,

     // ── Write layer ──
    upsertDoc, deleteDoc, queueOfflineMutation,
    convertLeadToClientDeal,                    // ← ADD THIS LINE
    upsertPersonal, upsertTrackFlat, deletePersonal, deleteTrackFlat,

    // ── Events / orchestration ──
    EventBus, Orchester, Archiver, PushNotifications,
    AIRank, AIFiling, AIAnomaly, ORCHESTRATION_HANDOFFS, HANDLERS,

    // ── Domain accessors ──
    getClients, getClient, getClientName, getEmployees,
    getProject, getProjectNumber, getProduct, getOrder, getLead,
    getClientProjects, getClientInvoices, getClientPayments,
    getClientDeals, getClientContracts, getClientTasks, getClientComms,
    getClientAppointments, getClientPresentations,
    getClientAgreedTotal, getClientBilledTotal, getClientPaidTotal,
    getClientRemainingTotal, getClientCreditTotal, getFeeSummary,
    getProjectAgreedTotal, getProjectBilledTotal, getProjectPaidTotal,
    getProjectRemainingTotal, getProjectFinancialProgress,
    getProjectOverpayment,
    recomputeProjectProgress, recomputeClientRollup,
    recomputeClientInstallments, invalidateInvoicePaidMemo,
    getInvoicePaidAmount, getInvoiceTotals, getInvoiceStatusDerived,
    generateInvoiceNumber, nextProjectInvoiceNumber, buildInvoiceProgressMessage,
    reconcilePayment, onInvoicePaid, sendInvoiceReceipt,
    applyClientCreditToInvoice,
    getOverdueInstallments, getUpcomingInstallments,
    getProductSalesMetrics, getMarketplaceMetrics,

    // ── Renderers ──
    renderActiveTab, renderAll,
    renderMarketplaceProducts, renderPublicUiProducts, renderMarketplaceOrders,
    renderMarketplaceAnalytics, renderMyOrders, renderMyWishlist,
    renderClients, renderClientCards, renderClient360Page,
    renderProjects, renderTasks, renderInventory,
    renderInvoices, renderPayments, renderLedger, renderExpenses, renderPayroll,
    renderLeads, renderDeals, renderPipelineKanban, renderContracts, renderProposals,
    renderAppointments, renderPresentations,
    renderEmployees, renderAssets, renderCompliance, renderUsers,
    renderDocumentVault, renderActivity, renderTrash,
    renderSupportTickets, renderPortalRequests, renderPortalUsers,
    renderClientsite, renderCommunications, renderMpesaInline,
    renderCampaigns,
    renderPartnerTasks, renderPartnerHourly, renderPartnerSchedule,
    renderPartnerHandoffs, renderPartnerFinancials, renderPartnerActivities,
    renderPartnerChat, renderPartnerPresence, renderPartnerGames,
    renderPersonalTodos, renderPersonalGoals, renderPersonalSkills,
    renderGoalMilestoneEditor,
    renderCharts, renderMarketplaceCharts, renderAdminAnalytics,
    renderClientAvatarPreview,
    renderProjectTasksEditor, renderProjectInstallmentEditor,
    renderClientProjectsFeeEditor,
    renderClientDocsGrid,
    renderPresAttachments,

    // ── Contacts ──
    contactButtons, getEntityById, openCommModal, switchCommChannel,
    buildTemplates, updateCommPreview, sendComm, openCommFullPreview,

    // ── Feature helpers ──
    openInvoiceViewModal, openPaymentModal, openStkModal,
    savePayment, deletePayment, deleteInvoice,
    findInvoiceCandidates, openManualMpesaMatch, confirmMpesaMatch,
    openServiceAgreementModal, attachServiceAgreement, transferProjectCredit,
    openFeesModal, openCreditTransfer, openPayChain, confirmPayChain,
    sendClientStatement, bulkRemind, openWelcomeEmailPreview, openClient360,
    openClientDocsModal, viewClientDoc, downloadClientDoc, deleteClientDoc,
    openProjectDeliverables,
    openInvoiceGenModal, refreshInvoiceProjects, renderExtraCharges,
    removeCharge, updateInvoicePreview,
    renderPaymentProjectPicker, renderPaymentAllocation,
    updatePaymentSummary,
    openProposalStudio, generateProposalDraft, saveProposalDraft,
    proposalToVault, proposalToInvoice,
    openMpesaModal, processMpesaQueue, renderMpesaModal,
    renderOrchestrationPanel, renderArchivesPanel,
    attachVioraNotificationListener,
    renderNotifications, refreshRecommendations,
    addToWishlist, removeFromWishlist, buyFromWishlist,
    openManualSale, submitManualSale,
    updateManualSaleItem, removeManualSaleItem,
    openOrderDetail,

    // ── Tickets ──
    viewTicket, closeTicketView, sendTicketReply, toggleTicketStatus,
    markTicketResolved, deleteTicket, getViewingTicketId,

    // ── Training ──
    TrainingVioraAPI, openUserTraining, revokeTrainingCertImpl,
    approveTrainingRequest, rejectTrainingRequest, reopenTrainingRequest,

    // ── Constants ──
    SENDER_PHONE, SENDER_EMAIL, MAX_FILE_SIZE, APP_VERSION,
    BUSINESS_COLLECTIONS,

    // ── Module objects ──
    PP, SubscriptionsAdmin, AutoCertification, T,
  } = d;

  /* ═══════════════════════════════════════════════════════════
     LOCAL HELPERS — narrow wrappers so a missing dep can never
     blow up the whole object build.
     ═══════════════════════════════════════════════════════════ */
  const _toast = (msg, type) => {
    try { if (typeof toast === 'function') toast(msg, type || 'info'); } catch (_) {}
  };
  const _openModal  = (id) => { try { if (typeof openModal  === 'function') openModal(id);  } catch (_) {} };
  const _closeModal = (id) => { try { if (typeof closeModal === 'function') closeModal(id); } catch (_) {} };
  const _logAct = (...args) => {
    try { if (typeof logActivity === 'function') return logActivity(...args); } catch (_) {}
    return Promise.resolve();
  };
  const _callFn = (...args) => {
    if (typeof callFn !== 'function') return Promise.reject(new Error('callFn not wired'));
    try { return callFn(...args); } catch (e) { return Promise.reject(e); }
  };
  const _applyLogo = (url) => {
    try { if (typeof applyLogoEverywhere === 'function') applyLogoEverywhere(url); } catch (_) {}
  };

  /* ═══════════════════════════════════════════════════════════
     NAVIGATION — the critical method the sidebar uses.
     Kept almost identical to your original; the important fix
     is that this now actually gets installed.
     ═══════════════════════════════════════════════════════════ */
  Viora.navigate = function (tab, opts = {}) {
    try {
      if (tab === 'marketing-campaigns' || tab === 'campaign-analytics') {
        // ★ v9.8 — Only admins, execs, and marketing can access campaigns.html
        const role = state?.operator?.role;
        if (role && role !== 'admin' && role !== 'exec' && role !== 'marketing') {
          _toast('Campaigns are restricted to admin, exec, and marketing roles.', 'warning');
          return;
        }
        window.location.href = '/campaigns.html' + (tab === 'campaign-analytics' ? '#analytics' : '');
        return;
      }
      const navEl = document.querySelector(`.sidebar nav a[data-tab="${tab}"]`);
      if (navEl && navEl.classList.contains('rbac-hidden')) {
        _toast('Access restricted.', 'warning');
        return;
      }
      if (state) state.currentTab = tab;

      const MOBILE_NAV_MAP = d.MOBILE_NAV_MAP || {};
      const cfg = MOBILE_NAV_MAP[state?.mobileCategory] || MOBILE_NAV_MAP.exec;
      const visibleTabs = (cfg?.tabs || []).filter(t => {
        const n = document.querySelector(`.sidebar nav a[data-tab="${t.tab}"]`);
        return !n || !n.classList.contains('rbac-hidden');
      });
      if (visibleTabs.length === 0) document.body.classList.add('no-chips');
      else document.body.classList.remove('no-chips');

      if (!opts.fromQueue && state) state._activeQueueId = null;
      if (state?.navMode === 'queues' && !opts.keepMode) d.setNavMode?.('registers', { silent: true });
      if (state?.navMode === 'registers') d.openGroupForTab?.(tab);

      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      const t = $('tab-' + tab);
      if (t) t.classList.add('active');

      document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
      document.querySelectorAll('#navQueuesMode .nav-queue-item').forEach(el =>
        el.classList.toggle('active', el.dataset.queueId === state?._activeQueueId)
      );

      document.querySelector('.main-content')?.scrollTo({ top: 0, behavior: 'instant' });
      d.closeSidebar?.();
      d.updateMobileSubChips?.();

      if (state) {
        state._forceRepaint = true;
        state._lastPaintedTab = null;
      }

      if (typeof renderActiveTab === 'function' && typeof renderActiveTab.cancel === 'function') {
        try { renderActiveTab.cancel(); } catch (_) {}
      }
      if (window.__vioraNavRAF) cancelAnimationFrame(window.__vioraNavRAF);
      window.__vioraNavRAF = requestAnimationFrame(() => {
        window.__vioraNavRAF = null;
        if (state) state._forceRepaint = true;
        try { if (typeof renderAll === 'function') renderAll(); }
        catch (e) { console.warn('[nav render]', e); }
      });

      if (tab === 'global-market') {
        setTimeout(() => {
          try {
            if (!d.setupGlobalMarket?._done) d.setupGlobalMarket?.();
            d.loadGlobalDashboard?.();
          } catch (e) {
            console.error('Global market init failed:', e);
            _toast('Global market failed to load: ' + e.message, 'error');
          }
        }, 300);
      }
      if (tab === 'clientsite' && typeof get === 'function' && typeof ref === 'function' && typeof P === 'function') {
        get(ref(db, P('clientsite'))).then(s => {
          if (state) state.data.clientsite = s.exists() ? s.val() : {};
          if (typeof renderClientsite === 'function') renderClientsite();
        }).catch(() => {});
      }
      if (tab === 'product-presentation') {
        setTimeout(() => { try { PP?.subscribe?.(); } catch (e) { console.warn('PP subscribe failed', e); } }, 200);
      }
      if (tab === 'orchestration') {
        setTimeout(() => { try { if (typeof renderOrchestrationPanel === 'function') renderOrchestrationPanel(); } catch (_) {} }, 100);
      }
      if (tab === 'marketing-campaigns') {
        setTimeout(() => { try { window.refreshAllCampaignStats?.(); } catch (_) {} }, 800);
      }
      if (tab === 'archives') {
        setTimeout(() => { try { if (typeof renderArchivesPanel === 'function') renderArchivesPanel(); } catch (_) {} }, 100);
      }
    } catch (e) {
      console.error('[Viora.navigate] failed:', e);
      _toast('Navigation failed: ' + (e.message || 'unknown error'), 'error');
    }
  };

  /* ═══════════════════════════════════════════════════════════
     TRAINING DELEGATES
     ═══════════════════════════════════════════════════════════ */
  Viora.revokeTrainingCert       = (certId) => { try { return revokeTrainingCertImpl(certId); } catch (_) {} };
  Viora.openEnrollUserModal      = () => { try { TrainingVioraAPI.openEnrollUserModal(); } catch (_) {} };
  Viora.approveTrainingRequest   = (uidKey) => { try { return approveTrainingRequest(uidKey); } catch (_) {} };
  Viora.rejectTrainingRequest    = (uidKey) => { try { return rejectTrainingRequest(uidKey); } catch (_) {} };
   Viora.reopenTrainingRequest    = (uidKey) => { try { return reopenTrainingRequest(uidKey); } catch (_) {} };
  Viora.openUserTraining         = (uidKey) => { try { return openUserTraining(uidKey); } catch (_) {} };

  /* Presentation attachment upload — reads the file as a DataURL,
     pushes it onto state.pendingPresAttachments, and re-renders
     the attachment grid. */
  Viora.addPresAttachment = function (file) {
    if (!file) return;
    const s = state;
    if (!s) return;

    const MAX_BYTES = 5 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      _toast('File too large (max 5 MB).', 'error');
      return;
    }

    if (!Array.isArray(s.pendingPresAttachments)) {
      s.pendingPresAttachments = [];
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      s.pendingPresAttachments.push({
        id: uid(),
        name: file.name,
        mime: file.type || 'application/octet-stream',
        size: file.size,
        data: ev.target.result
      });
      try { if (typeof renderPresAttachments === 'function') renderPresAttachments(); }
      catch (_) {}
    };
    reader.onerror = () => _toast('Could not read file.', 'error');
    reader.readAsDataURL(file);
  };

  /* ═══════════════════════════════════════════════════════════
     PORTAL
     ═══════════════════════════════════════════════════════════ */
  Viora.refreshPortalRequests = async function () {
    try {
      const [reqSnap, usrSnap] = await Promise.all([get(ref(db, P('portalRequests'))), get(ref(db, P('portalUsers')))]);
      if (state) {
        state.data.portalRequests = reqSnap.exists() ? Object.entries(reqSnap.val()).map(([k, v]) => ({ ...v, uid: v.uid || k })) : [];
        state.data.portalUsers    = usrSnap.exists() ? Object.entries(usrSnap.val()).map(([k, v]) => ({ ...v, uid: v.uid || k })) : [];
      }
      if (typeof renderPortalRequests === 'function') renderPortalRequests();
      if (state?.currentTab === 'portal-users' && typeof renderPortalUsers === 'function') renderPortalUsers();
      d.updateSidebarCounters?.();
      const pending = (state?.data?.portalRequests || []).filter(r => r.status === 'pending').length;
      _toast(pending > 0 ? `Refreshed · ${pending} pending request${pending === 1 ? '' : 's'}` : 'Refreshed · no pending requests', 'success');
    } catch (e) {
      console.error('refreshPortalRequests failed:', e);
      _toast('Refresh failed: ' + (e.message || 'unknown error'), 'error');
    }
  };

  Viora.clearPortalUsersSearch = function () {
    const search = $('portalUsersSearch'); if (search) search.value = '';
    const filter = $('portalUsersFilter'); if (filter) filter.value = 'all';
    if (typeof renderPortalUsers === 'function') renderPortalUsers();
  };

  Viora.openPortalApprove = function (uidArg) {
    const uidKey = String(uidArg);
    const req = (state?.data?.portalRequests || []).find(r => r.uid === uidKey);
    if (!req) { _toast('Request not found.', 'error'); return; }
    if (state) state._portalApproveUid = uidKey;
    $('portalApproveInfo').innerHTML = `<strong>${escapeHtml(req.name || '—')}</strong><br>${escapeHtml(req.email || '')}<br>${escapeHtml(req.phone || '')}`;
    $('portalApproveClient').innerHTML = '<option value="">— Select a client —</option>' +
      getClients().map(c => `<option value="${c.id}" ${c.email && normalizeEmail(c.email) === normalizeEmail(req.email) ? 'selected' : ''}>${escapeHtml(c.name)} — ${escapeHtml(c.email || '')}</option>`).join('');
    _openModal('portalApproveModal');
  };

  Viora.approvePortalRequest = async function () {
    const uidKey = state?._portalApproveUid;
    const clientId = $('portalApproveClient').value;
    if (!uidKey || !clientId) { _toast('Pick a client to link.', 'error'); return; }
    const req = (state?.data?.portalRequests || []).find(r => r.uid === uidKey);
    const client = getClient(clientId);
    const bridge = {
      uid: uidKey,
      email: req?.email || '',
      name: req?.name || client?.name || '',
      phone: req?.phone || client?.phone || '',
      clientId,
      active: true,
      linkedAt: new Date().toISOString(),
      linkedBy: state?.operator?.name || 'admin'
    };
    await set(ref(db, P('portalUsers/' + uidKey)), bridge);
    await set(ref(db, P('portalRequests/' + uidKey)), { ...req, status: 'approved', clientId, approvedAt: new Date().toISOString() });
    _toast('Portal user linked.', 'success');
    _closeModal('portalApproveModal');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  Viora.rejectPortalRequest = async function (uidArg) {
    const uidKey = uidArg || state?._portalApproveUid;
    const req = (state?.data?.portalRequests || []).find(r => r.uid === uidKey);
    if (!uidKey || !req) { _toast('Request not found.', 'error'); return; }
    if (!confirm('Reject and remove this request? The user can re-apply later.')) return;
    try {
      await remove(ref(db, P('portalRequests/' + uidKey)));
      if (state) state.data.portalRequests = (state.data.portalRequests || []).filter(r => r.uid !== uidKey);
      await _logAct('delete', 'Portal request rejected', `${req.name || req.email || uidKey}`);
      _toast('Request removed. User can re-apply.', 'info');
      _closeModal('portalApproveModal');
      if (typeof renderActiveTab === 'function') renderActiveTab();
    } catch (e) { _toast('Reject failed: ' + e.message, 'error'); }
  };

  Viora.togglePortalUserActive = async function (uidKey, active) {
    const u = (state?.data?.portalUsers || []).find(x => x.uid === uidKey);
    if (!u) return;
    await set(ref(db, P('portalUsers/' + uidKey)), { ...u, active });
    _toast(active ? 'User activated.' : 'User deactivated.', 'success');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  Viora.unlinkPortalUser = async function (uidKey) {
    if (!confirm('Unlink this portal user? They will lose portal access.')) return;
    await remove(ref(db, P('portalUsers/' + uidKey)));
    _toast('Portal user unlinked.', 'info');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  Viora.deletePortalUser = async function (uidKey, email) {
    const u = (state?.data?.portalUsers || []).find(x => x.uid === uidKey);
    if (!u) { _toast('Portal user not found.', 'error'); return; }
    const clientName = (typeof getClientName === 'function' && getClientName(u.clientId)) || 'this client';
    const confirmMsg =
      `⚠️ DELETE PORTAL USER PERMANENTLY?\n\n` +
      `Name:  ${u.name || '—'}\nEmail: ${u.email || email || '—'}\nLinked to: ${clientName}\n\n` +
      `This will:\n  • Remove the portal bridge record\n  • Delete the Firebase Auth account\n  • Revoke all access immediately\n\n` +
      `The CLIENT record itself is NOT deleted.\n\nThis cannot be undone. Continue?`;
    if (!confirm(confirmMsg)) return;
    try { await _callFn('portal/deleteUser', { uid: uidKey }); }
    catch (e) {
      const msg = String(e?.message || '');
      if (msg.includes('404') || msg.includes('not found') || msg.includes('not deployed')) {
        _toast('Auth delete endpoint unavailable — removing bridge only.', 'warning');
      } else {
        if (!confirm(`Backend delete failed: ${msg}\n\nRemove the portal bridge record anyway?`)) return;
      }
    }
    try { await remove(ref(db, P('portalUsers/' + uidKey))); } catch (_) {}
    try { await remove(ref(db, P('portalRequests/' + uidKey))); } catch (_) {}
    if (state) {
      state.data.portalRequests = (state.data.portalRequests || []).filter(r => r.uid !== uidKey);
      state.data.portalUsers    = (state.data.portalUsers    || []).filter(x => x.uid !== uidKey);
      state.data.users          = (state.data.users          || []).filter(x => x.uid !== uidKey);
      state.data.trainingCertificates = (state.data.trainingCertificates || []).filter(c => c.uid !== uidKey);
    }
    try { await remove(ref(db, `${ROOT}/users/${uidKey}`)); } catch (_) {}
    try {
      await remove(ref(db, P(`training/enrollments/${uidKey}`)));
      await remove(ref(db, P(`training/progress/${uidKey}`)));
      const certs = (state?.data?.trainingCertificates || []).filter(c => c.uid === uidKey);
      for (const cert of certs) await remove(ref(db, P(`training/certificates/${cert.id}`)));
    } catch (_) {}
    await _logAct('delete', 'Portal user deleted', `${u.name || u.email || uidKey} → removed from ${clientName}`);
    _toast('Portal user deleted.', 'success');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  Viora.provisionPortalLogin = function () {
    $('provClient').innerHTML = getClients().map(c => `<option value="${c.id}">${escapeHtml(c.name)} — ${escapeHtml(c.email || '')}</option>`).join('');
    $('provEmail').value = '';
    $('provName').value = '';
    $('provPassword').value = 'Viora@' + Math.random().toString(36).slice(2, 8);
    $('provResult').innerHTML = '';
    _openModal('portalProvisionModal');
  };

  Viora.provisionPortalConfirm = async function () {
    const clientId = $('provClient').value;
    const email = $('provEmail').value.trim();
    const name = $('provName').value.trim();
    const password = $('provPassword').value;
    if (!clientId || !email || password.length < 6) {
      $('provResult').innerHTML = `<div style="color:var(--accent-red);">Client, email and a 6+ char password are required.</div>`;
      return;
    }
    const btn = $('portalProvisionConfirmBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Provisioning…';
    try {
      const res = await _callFn('portal/provision', { clientId, email, name, password });
      $('provResult').innerHTML =
        `<div style="padding:10px;background:rgba(34,230,160,.1);border-left:4px solid var(--accent-green);border-radius:8px;font-size:.8rem;">` +
          `<strong>✓ Provisioned</strong><br>UID: <code>${escapeHtml(res.uid || '')}</code><br>` +
          `Email: <code>${escapeHtml(res.email || email)}</code><br>` +
          `<em>Share the temporary password with the client.</em>` +
        `</div>`;
      await _logAct('add', 'Portal login provisioned', `${email} → ${getClientName(clientId)}`);
      _toast('Portal login created.', 'success');
    } catch (e) {
      $('provResult').innerHTML =
        `<div style="padding:10px;background:rgba(255,92,124,.1);border-left:4px solid var(--accent-red);border-radius:8px;font-size:.8rem;">` +
          `<strong>Failed</strong><br>${escapeHtml(e.message || '')}` +
        `</div>`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Provision';
    }
  };

  /* ═══════════════════════════════════════════════════════════
     TICKETS
     ═══════════════════════════════════════════════════════════ */
  Viora.viewTicket          = (...a) => { try { return viewTicket(...a); } catch (_) {} };
  Viora.deleteTicket        = (...a) => { try { return deleteTicket(...a); } catch (_) {} };
  Viora.sendTicketReply     = (...a) => { try { return sendTicketReply(...a); } catch (_) {} };
  Viora.toggleTicketStatus  = (...a) => { try { return toggleTicketStatus(...a); } catch (_) {} };
  Viora.markTicketResolved  = (...a) => { try { return markTicketResolved(...a); } catch (_) {} };
  Viora.closeTicketView     = (...a) => { try { return closeTicketView(...a); } catch (_) {} };
  Viora.getViewingTicketId  = ()     => { try { return getViewingTicketId(); } catch (_) { return null; } };
  Viora.refreshTickets      = ()     => { try { if (typeof renderSupportTickets === 'function') renderSupportTickets(); } catch (_) {} };

  /* ═══════════════════════════════════════════════════════════
     MODAL HELPERS
     ═══════════════════════════════════════════════════════════ */
  Viora.openModal  = _openModal;
  Viora.closeModal = _closeModal;
  Viora.showModal  = (...a) => { try { return showModal?.(...a); } catch (_) {} };
  Viora.hideModal  = (...a) => { try { return hideModal?.(...a); } catch (_) {} };

  /* ═══════════════════════════════════════════════════════════
     MARKETPLACE PRODUCTS
     ═══════════════════════════════════════════════════════════ */
  Viora.addProduct = function (kind = 'product') {
    $('productModalTitle').textContent = kind === 'publicUI' ? 'New Public UI Product' : 'New Product';
    $('editProductId').value = '';
    $('productForm').reset();
    $('prodId').value = '';
    $('prodStatus').value = 'active';
    $('prodPrice').value = kind === 'publicUI' ? 0 : 49;
    $('prodPeriod').value = '/mo';

           /* ── Reset URL + image fields so the previous edit doesn't bleed through ── */
    const _lv = $('prodLiveUrl');    if (_lv) _lv.value = '';
    const _pv = $('prodPreviewUrl'); if (_pv) _pv.value = '';
    const _lk = $('prodLink');       if (_lk) _lk.value = '';
    const _im = $('prodImage');      if (_im) _im.value = '';
    if (typeof window.__vioraSetProdImage === 'function') {
      window.__vioraSetProdImage(null);
    }

    const publicUiExtras = $('publicUiExtras');
    if (publicUiExtras) publicUiExtras.style.display = 'block';

    let kindField = $('prodKind');
    if (!kindField) {
      kindField = document.createElement('input');
      kindField.type = 'hidden';
      kindField.id = 'prodKind';
      $('productForm').appendChild(kindField);
    }
    kindField.value = kind;

    if (kind === 'publicUI') {
      $('prodCategory').value = 'Marketplace';
      $('prodIcon').value = 'fa-solid fa-globe';
    } else {
      $('prodCategory').value = 'Software Development';
      $('prodIcon').value = 'fa-solid fa-cube';
    }

    _openModal('productModal');
  };

  Viora.editProduct = function (id) {
    const p = getProduct(id);
    if (!p) { _toast('Product not found.', 'error'); return; }
    const kind = p._kind || 'product';

    $('productModalTitle').textContent = kind === 'publicUI' ? 'Edit Public UI Product' : 'Edit Product';
    $('editProductId').value = id;
    $('prodId').value = p.id || '';
    $('prodName').value = p.name || '';
    $('prodDescription').value = p.description || '';
    $('prodCategory').value = p.category || (kind === 'publicUI' ? 'Marketplace' : 'Software Development');
    $('prodIcon').value = p.icon || (kind === 'publicUI' ? 'fa-solid fa-globe' : 'fa-solid fa-cube');
    $('prodPrice').value = p.price || 0;
    $('prodPeriod').value = p.period || '/mo';
    $('prodTags').value = Array.isArray(p.tags) ? p.tags.join(', ') : '';
    $('prodStatus').value = p.status || 'active';

         /* ── Populate URL + image fields from saved product ── */
    const _lv = $('prodLiveUrl');    if (_lv) _lv.value = p.liveUrl || '';
    const _pv = $('prodPreviewUrl'); if (_pv) _pv.value = p.previewUrl || '';
    const _lk = $('prodLink');       if (_lk) _lk.value = p.link || '';
    const _im = $('prodImage');      if (_im) _im.value = p.image || '';
    if (typeof window.__vioraSetProdImage === 'function') {
      window.__vioraSetProdImage(p.image || null);
    }

    let kindField = $('prodKind');
    if (!kindField) {
      kindField = document.createElement('input');
      kindField.type = 'hidden';
      kindField.id = 'prodKind';
      $('productForm').appendChild(kindField);
    }
    kindField.value = kind;

    const publicUiExtras = $('publicUiExtras');
    if (publicUiExtras) publicUiExtras.style.display = 'block';

    _openModal('productModal');
  };

  Viora.saveProduct = async function (f) {
    const isEdit = !!$('editProductId').value;
    const originalId = $('editProductId').value;
    const newId = (f.id || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (!newId) { _toast('Product ID required.', 'error'); return; }
    if (!f.name) { _toast('Product name required.', 'error'); return; }
    const existing = isEdit ? getProduct(originalId) : null;
    const kind = f._kind || existing?._kind || 'product';

    const payload = {
      id: newId,
      name: f.name,
      description: f.description || '',
      category: f.category || (kind === 'publicUI' ? 'Marketplace' : 'Software Development'),
      icon: f.icon || (kind === 'publicUI' ? 'fa-solid fa-globe' : 'fa-solid fa-cube'),
      price: Number(f.price) || 0,
      period: f.period || '/mo',
      tags: (f.tags || '').split(',').map(s => s.trim()).filter(Boolean),
      status: f.status || 'active',
      totalSold: existing?.totalSold || 0,
      totalRevenue: existing?.totalRevenue || 0,
      activeSubscriptions: existing?.activeSubscriptions || 0,
         liveUrl: f.liveUrl || existing?.liveUrl || null,
      previewUrl: f.previewUrl || existing?.previewUrl || null,
      link: f.link || existing?.link || null,
      image: f.image || existing?.image || null,
      _kind: kind,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      if (isEdit && originalId && originalId !== newId) {
        await deleteDoc('products', originalId, false);
      }
      await upsertDoc('products', payload, existing?._rev);

      try { EventBus.emit('products.upsert', payload, payload.id, { collection: 'products' }); } catch (_) {}

      if (!isEdit) {
        setTimeout(async () => {
          try {
            const mirrorId = 'prod-' + payload.id;
            const existingMirror = (state?.data?.inventory || []).find(x => x.id === mirrorId);
            if (existingMirror) {
              if (Number(existingMirror.qty || 0) <= 0) {
                existingMirror.qty = 100;
                existingMirror.reorder = 5;
                existingMirror._stockSeededAt = new Date().toISOString();
                try { await upsertDoc('inventory', existingMirror, existingMirror._rev); } catch (_) {}
              }
            } else {
              const priceKES = usdToKes(payload.price || 0);
              const mirror = {
                id: mirrorId,
                sku: (payload.id || '').toUpperCase(),
                name: payload.name,
                qty: 100,
                reorder: 5,
                cost: Math.round(priceKES * 0.6),
                price: priceKES,
                _source: 'product',
                _productId: payload.id,
                _mirroredAt: new Date().toISOString(),
                _stockSeededAt: new Date().toISOString(),
                createdAt: new Date().toISOString()
              };
              try { await upsertDoc('inventory', mirror); } catch (_) {}
            }
          } catch (e) { console.warn('[seed inventory]', e); }
        }, 800);
      }

      await _logAct(
        isEdit ? 'edit' : 'add',
        isEdit
          ? (kind === 'publicUI' ? 'Public UI product updated' : 'Product updated')
          : (kind === 'publicUI' ? 'Public UI product created' : 'Product created'),
        payload.name
      );

      _toast(
        isEdit
          ? (kind === 'publicUI' ? 'Public UI product updated.' : 'Product updated.')
          : (kind === 'publicUI' ? 'Public UI product created.' : 'Product created.'),
        'success'
      );

      _closeModal('productModal');
      if (typeof renderMarketplaceProducts === 'function') renderMarketplaceProducts();
      if (typeof renderPublicUiProducts === 'function') renderPublicUiProducts();
    } catch (e) {
      if (e.message === 'CONFLICT_ABORTED') return;
      if (e.message.startsWith('Validation failed')) { _toast(e.message, 'error'); return; }
      _toast('Save failed: ' + e.message, 'error');
    }
  };

  Viora.deleteProduct = async function (id) {
    const p = getProduct(id);
    if (!p) return;
    if (!confirm(`Delete product "${p.name}"? Existing orders will remain.`)) return;
    await deleteDoc('products', id);
    try {
      const mirrorId = 'prod-' + id;
      const mirror = (state?.data?.inventory || []).find(x => x.id === mirrorId);
      if (mirror) await deleteDoc('inventory', mirrorId);
    } catch (e) { console.warn('[inventory mirror delete]', e); }
    await _logAct('delete', 'Product deleted', p.name);
    _toast('Product deleted.', 'info');
    if (typeof renderMarketplaceProducts === 'function') renderMarketplaceProducts();
  };

  /* ═══════════════════════════════════════════════════════════
     ORDERS
     ═══════════════════════════════════════════════════════════ */
  Viora.markOrderPaid = async function (id) {
    const o = (state?.data?.orders || []).find(x => x.id === id);
    if (!o) { _toast('Order not found.', 'error'); return; }
    if (o.paymentStatus === 'paid') { _toast('Already marked paid.', 'info'); return; }

    const stockCheck = await d.checkOrderStock?.(o);
    if (stockCheck && !stockCheck.ok) {
      const proceed = await vioraConfirm(
        `${stockCheck.summary}\n\nMarking this order paid will decrement inventory below zero (or the products have no stock). Proceed anyway?`,
        { title: 'Insufficient stock', confirmLabel: 'Proceed anyway', cancelLabel: 'Cancel', icon: 'fa-triangle-exclamation', confirmClass: 'btn-danger' }
      );
      if (!proceed) return;
    }

    const ok = await vioraConfirm(
      `Mark order ${id} as PAID?\n\n` +
      `Customer: ${o.customerName || '—'}\n` +
      `Total: ${fmtKES(o.totalKES)}\n` +
      `Items: ${(o.items || []).map(i => i.productName).join(', ') || '—'}\n\n` +
      `This will:\n• Increment financials revenue\n• Increment product sold counts\n` +
      `• Decrement inventory (for mirrored products)\n• Write a "License sold" activity entry\n\n` +
      `Only do this after you have confirmed payment received.`,
      { title: 'Confirm payment', confirmLabel: 'Mark Paid', confirmClass: 'btn-success', icon: 'fa-money-bill-wave' }
    );
    if (!ok) return;

    o.paymentStatus = 'paid';
    o.paymentAccepted = true;
    o.paidAt = new Date().toISOString();
    o.paidMarkedBy = state?.operator?.name || 'System';
    o._rev = uid();
    o._updatedAt = new Date().toISOString();

    try {
      await set(ref(db, `${P('orders')}/${id}`), o);
      try { EventBus.emit('orders.upsert', o, o.id, o, { collection: 'orders' }); } catch (_) {}

      const arr = state?.data?.orders || [];
      const idx = arr.findIndex(x => x.id === id);
      if (idx > -1) arr[idx] = o; else arr.push(o);

      try {
        const finRef = ref(db, P('financials'));
        await update(finRef, {
          totalRevenue:       (Number((state?.data?.financials || {}).totalRevenue) || 0) + Number(o.totalKES || 0),
          totalRevenueUSD:    (Number((state?.data?.financials || {}).totalRevenueUSD) || 0) + Number(o.totalUSD || 0),
          salesCount:         (Number((state?.data?.financials || {}).salesCount) || 0) + (o.items || []).length,
          activeSubscriptions:(Number((state?.data?.financials || {}).activeSubscriptions) || 0) + (o.items || []).filter(i => i.plan !== 'lifetime').length,
          currency: 'KES',
          lastSaleAt: new Date().toISOString()
        });
      } catch (e) { console.warn('financials update failed', e); }

      for (const line of (o.items || [])) {
        if (!line.productId || line.productId.startsWith('public-ui-')) continue;
        try {
          const prodRef = ref(db, `${P('products')}/${line.productId}`);
          const pSnap = await get(prodRef);
          if (!pSnap.exists()) continue;
          const prod = pSnap.val();
          await update(prodRef, {
            totalSold: (prod.totalSold || 0) + (line.qty || 1),
            totalRevenue: (prod.totalRevenue || 0) + Number(line.amount || 0),
            activeSubscriptions: (prod.activeSubscriptions || 0) + (line.plan !== 'lifetime' ? 1 : 0)
          });
        } catch (_) {}
      }

      await _logAct('pay', 'Order marked paid', `${id} — ${fmtKES(o.totalKES)} · ${o.customerName || ''}`);
      _toast('Order marked paid. Downstream pipeline running…', 'success');
      if (typeof renderMarketplaceOrders === 'function') renderMarketplaceOrders();
      if (typeof renderMarketplaceAnalytics === 'function') renderMarketplaceAnalytics();
    } catch (e) {
      _toast('Failed to mark paid: ' + e.message, 'error');
    }
  };

  Viora.deleteOrder = async function (id) {
    const o = getOrder(id);
    if (!o) return;
    if (!confirm(`Delete order "${o.id}"?\n\nThis will remove it from the system.`)) return;
    const path = `${P('orders')}/${id}`;
    const reason = prompt('Reason for deletion (optional):', 'Manual cleanup') || 'Manual cleanup';
    try {
      await remove(ref(db, path));
      const arr = state?.data?.orders || [];
      const idx = arr.findIndex(x => x.id === id);
      if (idx > -1) arr.splice(idx, 1);
      await _logAct('delete', 'Order deleted', `${o.id} · ${reason}`);
      _toast('Order deleted.', 'info');
      if (typeof renderMarketplaceOrders === 'function') renderMarketplaceOrders();
      d.scheduleMarketSync?.();
      return;
    } catch (e) { console.warn('Hard delete failed, falling back to soft:', e); }

    try {
      const updated = {
        ...o,
        paymentStatus: 'refunded',
        deletedAt: new Date().toISOString(),
        deletedBy: state?.operator?.uid || 'system',
        deletedByName: state?.operator?.name || 'System',
        deletionReason: reason,
        _rev: uid(),
        _updatedAt: new Date().toISOString()
      };
      await set(ref(db, path), updated);
      const arr = state?.data?.orders || [];
      const idx = arr.findIndex(x => x.id === id);
      if (idx > -1) arr[idx] = updated; else arr.push(updated);

      if (o._inventoryDecrementedAt && Array.isArray(o.items)) {
        for (const it of o.items) {
          const row = (state?.data?.inventory || []).find(x => x._productId === it.productId) ||
                      (state?.data?.inventory || []).find(x => String(x.sku || '').toUpperCase() === String(it.productId).toUpperCase());
          if (!row) continue;
          row.qty = Number(row.qty || 0) + Number(it.qty || 1);
          row._lastRestoredAt = new Date().toISOString();
          try { await upsertDoc('inventory', row, row._rev); } catch (_) {}
        }
        updated._inventoryDecrementedAt = null;
        updated._inventoryRestoredAt = new Date().toISOString();
        await set(ref(db, path), updated);
      }

      await _logAct('edit', 'Order soft-deleted (marked refunded)', `${o.id} · ${reason}`);
      _toast('Marked as REFUNDED. Inventory restored.', 'warning');
      if (typeof renderMarketplaceOrders === 'function') renderMarketplaceOrders();
      if (typeof renderInventory === 'function') renderInventory();
      d.scheduleMarketSync?.();
    } catch (e2) {
      _toast('Delete failed: ' + (e2.message || 'unknown error'), 'error');
    }
  };

  Viora.viewOrder            = (id) => { try { return openOrderDetail(id); } catch (_) {} };
  Viora.openManualSale       = (...a) => { try { return openManualSale(...a); } catch (_) {} };
  Viora.submitManualSale     = (...a) => { try { return submitManualSale(...a); } catch (_) {} };
  Viora.updateManualSaleItem = (...a) => { try { return updateManualSaleItem(...a); } catch (_) {} };
  Viora.removeManualSaleItem = (...a) => { try { return removeManualSaleItem(...a); } catch (_) {} };
  Viora.addToWishlist        = (...a) => { try { return addToWishlist(...a); } catch (_) {} };
  Viora.removeFromWishlist   = (...a) => { try { return removeFromWishlist(...a); } catch (_) {} };
  Viora.buyFromWishlist      = (...a) => { try { return buyFromWishlist(...a); } catch (_) {} };

  /* ═══════════════════════════════════════════════════════════
     LEADS
     ═══════════════════════════════════════════════════════════ */
  Viora.addLead = function () {
    $('leadModalTitle').textContent = 'New Lead';
    $('editLeadId').value = '';
    $('leadForm').reset();
    const s = $('leadCampaign');
    s.innerHTML = '<option value="">— None —</option>' +
      (state?.data?.campaigns || []).map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    _openModal('leadModal');
  };

  Viora.editLead = function (id) {
    const l = getLead(id);
    if (!l) return;
    $('leadModalTitle').textContent = 'Edit Lead';
    $('editLeadId').value = id;
    $('leadName').value = l.fullName || '';
    $('leadEmail').value = l.email || '';
    $('leadPhone').value = l.phone || '';
    $('leadSource').value = l.source || 'Website';
    $('leadStatus').value = l.status || 'New';
    $('leadNotes').value = l.notes || '';
    const s = $('leadCampaign');
    s.innerHTML = '<option value="">— None —</option>' +
      (state?.data?.campaigns || []).map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    s.value = l.campaignId || '';
    _openModal('leadModal');
  };

  Viora.saveLead = async function (f) {
    const id = $('editLeadId').value;
    const existing = id ? getLead(id) : null;
    const alreadyConverted = (state?.data?.entities || []).some(e => e.type === 'client' && e.sourceLeadId === (id || ''));
    const p = {
      fullName: f.name,
      email: f.email,
      phone: f.phone,
      source: f.source,
      status: f.status,
      campaignId: f.campaignId,
      campaignName: $('leadCampaign').selectedOptions[0]?.textContent || '',
      notes: f.notes,
      id: id || uid(),
      createdAt: id ? existing?.createdAt : new Date().toISOString()
    };
    try {
      await upsertDoc('leads', p, existing?._rev);
    } catch (e) {
      if (e.message === 'CONFLICT_ABORTED') return;
      _toast('Save failed: ' + e.message, 'error');
      return;
    }
    await _logAct(id ? 'edit' : 'add', id ? 'Lead updated' : 'Lead created', p.fullName);
    _toast(id ? 'Lead updated.' : 'Lead created.', 'success');
    _closeModal('leadModal');

     const shouldConvert = p.status === 'Qualified' && !alreadyConverted && p.source !== 'Marketplace';
    if (shouldConvert) {
      const client = await (typeof convertLeadToClientDeal === 'function'
        ? convertLeadToClientDeal(p)
        : (d.convertLeadToClientDeal ? d.convertLeadToClientDeal(p) : null));
      if (client) {
        const fresh = getLead(p.id) || p;
        await upsertDoc('leads', { ...fresh, status: 'Converted' }, fresh._rev);
        await _logAct('edit', 'Lead auto-converted', `${p.fullName} → Client + Deal`);
        _toast('Lead auto-converted! Book an appointment next.', 'success');
        setTimeout(() => Viora.addAppointment({
          clientId: client.id,
          title: `Kickoff meeting — ${p.fullName}`,
          type: 'Discovery Call'
        }), 350);
      } else {
        // Conversion was requested but the function returned null
        console.warn('[lead-conversion] shouldConvert=true but client is null',
          { leadId: p.id, status: p.status, source: p.source, alreadyConverted });
        _toast('Lead qualified but client creation failed — check console.', 'warning');
      }
    } else {
      if (typeof renderAll === 'function') renderAll();
    }
  };

  Viora.deleteLead = async function (id) {
    const l = getLead(id);
    if (!l) return;
    const email = normalizeEmail(l.email);
    const isIndex = !!l._fromIndex;
    const isMarket = l.source === 'Marketplace' || isIndex;
    let msg = `Delete lead "${l.fullName}"?`;
    if (isMarket || (email && (state?.data?.marketLeads || []).some(m => normalizeEmail(m.email) === email))) {
      msg += `\n\nThis lead is also tracked in Marketplace Analytics. Deleting it will ALSO hide this customer from Top Customers. Continue?`;
    }
    if (!confirm(msg)) return;

    try { await remove(ref(db, `${P('leads')}/${id}`)); }
    catch (_) { await deleteDoc('leads', id); }

    if (state) state.data.leads = (state.data.leads || []).filter(x => x.id !== id);

    const matchingML = (state?.data?.marketLeads || []).filter(m =>
      m.leadId === id || (email && normalizeEmail(m.email) === email)
    );
    for (const m of matchingML) {
      try { await remove(ref(db, `${P('marketLeads')}/${m.id}`)); } catch (_) {}
    }
    if (matchingML.length && state) {
      state.data.marketLeads = (state.data.marketLeads || []).filter(m =>
        m.leadId !== id && !(email && normalizeEmail(m.email) === email)
      );
    }

    if (email && state) {
      const deleted = state.data.deletedMarketEmails || [];
      if (!deleted.includes(email)) deleted.push(email);
      state.data.deletedMarketEmails = deleted;
      try { await set(ref(db, P('marketplace/deletedEmails')), deleted); } catch (_) {}
    }

    await _logAct('delete', 'Lead deleted',
      `${l.fullName}${matchingML.length ? ` — removed ${matchingML.length} market record(s)` : ''}`);
    _toast(matchingML.length
      ? `Lead and ${matchingML.length} market record(s) removed.`
      : 'Lead deleted.', 'info');

    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  Viora.purgeBlocklistedCustomers = async function () {
    const list = (state?.data?.deletedMarketEmails || []).map(normalizeEmail).filter(Boolean);
    if (!list.length) { _toast('Blocklist is empty — nothing to purge.', 'info'); return; }
    const set2 = new Set(list);

    const ok = await vioraConfirm(
      `Permanently delete every trace of ${set2.size} blocklisted customer(s)?\n\n` +
      `This removes:\n  • Matching Leads\n  • Matching Marketplace Leads\n  • Matching Orders\n\n` +
      `Their email stays on the blocklist so they can never be re-created.\n\nThis cannot be undone.`,
      { title: 'Purge deleted customers', confirmLabel: 'Delete all', confirmClass: 'btn-danger' }
    );
    if (!ok) return;

    const counts = { leads: 0, marketLeads: 0, orders: 0 };

    const leadsToKill = (state?.data?.leads || []).filter(l => set2.has(normalizeEmail(l.email)));
    for (const l of leadsToKill) { try { await remove(ref(db, `${P('leads')}/${l.id}`)); counts.leads++; } catch (_) {} }
    if (state) state.data.leads = (state.data.leads || []).filter(l => !set2.has(normalizeEmail(l.email)));

    const mlsToKill = (state?.data?.marketLeads || []).filter(m => set2.has(normalizeEmail(m.email)));
    for (const m of mlsToKill) { try { await remove(ref(db, `${P('marketLeads')}/${m.id}`)); counts.marketLeads++; } catch (_) {} }
    if (state) state.data.marketLeads = (state.data.marketLeads || []).filter(m => !set2.has(normalizeEmail(m.email)));

    const ordersToKill = (state?.data?.orders || []).filter(o => set2.has(normalizeEmail(o.customerEmail)));
    for (const o of ordersToKill) { try { await remove(ref(db, `${P('orders')}/${o.id}`)); counts.orders++; } catch (_) {} }
    if (state) state.data.orders = (state.data.orders || []).filter(o => !set2.has(normalizeEmail(o.customerEmail)));

    await _logAct('delete', 'Blocklist purge completed',
      `leads: ${counts.leads} · marketLeads: ${counts.marketLeads} · orders: ${counts.orders}`);

    _toast(`Purged ${counts.leads} lead(s), ${counts.marketLeads} market lead(s), ${counts.orders} order(s).`, 'success');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  /* ═══════════════════════════════════════════════════════════
     CAMPAIGNS
     ═══════════════════════════════════════════════════════════ */
  Viora.addCampaign = function () {
    $('campaignModalTitle').textContent = 'New Campaign';
    $('editCampaignId').value = '';
    $('campaignForm').reset();
    $('campStart').value = todayStr();
    if ($('campMediaType')) $('campMediaType').value = 'none';
    if ($('campMediaUrl')) $('campMediaUrl').value = '';
    if ($('campLiveStats')) $('campLiveStats').style.display = 'none';
    if ($('campLiveStatsBody')) $('campLiveStatsBody').innerHTML = '';
    d.applyCampMediaTypeUI?.('none');
    _openModal('campaignModal');
  };

  Viora.editCampaign = function (id) {
    const c = (state?.data?.campaigns || []).find(x => x.id === id);
    if (!c) return;
    $('campaignModalTitle').textContent = 'Edit Campaign';
    $('editCampaignId').value = id;
    $('campName').value = c.name || '';
    $('campBudget').value = c.budget || 0;
    $('campSpend').value = c.spend || 0;
    $('campStart').value = c.startDate || '';
    $('campEnd').value = c.endDate || '';
    $('campStatus').value = c.status || 'Planned';

    const m = c.media || {};
    if ($('campMediaType')) $('campMediaType').value = m.type || 'none';
    if ($('campMediaUrl')) $('campMediaUrl').value = m.url || '';
    d.applyCampMediaTypeUI?.(m.type || 'none');

    if (c.stats) d.renderCampaignStats?.(id, c.stats);
    else if ($('campLiveStats')) $('campLiveStats').style.display = 'none';

    _openModal('campaignModal');
  };

  Viora.saveCampaign = async function (f) {
    const id = $('editCampaignId').value;
    const existing = id ? (state?.data?.campaigns || []).find(x => x.id === id) : null;
    const mediaType = $('campMediaType')?.value || 'none';
    const mediaUrl = ($('campMediaUrl')?.value || '').trim();

    const p = {
      ...f,
      id: id || uid(),
      createdAt: id ? existing?.createdAt : new Date().toISOString(),
      media: {
        type: mediaType,
        url: mediaType === 'none' ? null : (mediaUrl || null)
      },
      stats: existing?.stats || null,
      statsUpdatedAt: existing?.statsUpdatedAt || null,
      statsError: null
    };

    try {
      await upsertDoc('campaigns', p, existing?._rev);
    } catch (e) {
      if (e.message === 'CONFLICT_ABORTED') return;
      _toast('Save failed: ' + e.message, 'error');
      return;
    }
    await _logAct(id ? 'edit' : 'add', id ? 'Campaign updated' : 'Campaign created', p.name);
    _toast('Campaign saved.', 'success');
    _closeModal('campaignModal');
    if (typeof renderActiveTab === 'function') renderActiveTab();

    if (mediaUrl && (mediaType === 'youtube' || mediaType === 'tiktok')) {
      setTimeout(() => {
        d.fetchCampaignStats?.(p.id, mediaType, mediaUrl).catch(err =>
          console.warn('[campaign stats] initial fetch failed:', err.message));
      }, 400);
    }
  };

  Viora.deleteCampaign = async function (id) {
    const c = (state?.data?.campaigns || []).find(x => x.id === id);
    if (!c || !confirm('Delete this campaign?')) return;
    await deleteDoc('campaigns', id);
    await _logAct('delete', 'Campaign deleted', c.name);
    _toast('Campaign deleted.', 'info');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  Viora.refreshCampaignStats = async function (campaignId) {
    if (!campaignId) return;
    const camp = (state?.data?.campaigns || []).find(c => c.id === campaignId);
    if (!camp) { _toast('Campaign not found.', 'error'); return; }
    const media = camp.media || {};
    if (!media.type || media.type === 'none' || !media.url) {
      _toast('This campaign has no media URL to fetch stats from.', 'info');
      return;
    }
    try {
      if (typeof d.fetchCampaignStats === 'function') {
        await d.fetchCampaignStats(campaignId, media.type, media.url);
        _toast('Stats refreshed.', 'success');
      } else {
        _toast('Campaign stats fetcher not ready.', 'warning');
      }
    } catch (e) {
      _toast('Stats refresh failed: ' + (e.message || 'unknown'), 'error');
    }
  };

  /* ═══════════════════════════════════════════════════════════
     APPOINTMENTS
     ═══════════════════════════════════════════════════════════ */
  Viora.addAppointment = function (preset = {}) {
    $('appointmentModalTitle').textContent = 'New Appointment';
    $('editAppointmentId').value = '';
    $('appointmentForm').reset();
    const clients = getClients();
    $('apClient').innerHTML = clients.length
      ? clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}${c.company ? ' — ' + escapeHtml(c.company) : ''}</option>`).join('')
      : '<option value="">— No clients yet; convert a lead first —</option>';
    if (preset.clientId) $('apClient').value = preset.clientId;
    if (preset.title) $('apTitle').value = preset.title;
    if (preset.type) $('apType').value = preset.type;
    const now = new Date();
    $('apDate').value = preset.date || todayStr();
    $('apStartTime').value = preset.startTime || `${String(now.getHours()).padStart(2, '0')}:00`;
    $('apEndTime').value = preset.endTime || '';
    $('apAssigned').innerHTML = '<option value="">— Unassigned —</option>' +
      (state?.data?.users || []).map(u => `<option value="${u.uid}">${escapeHtml(u.name || u.email)}</option>`).join('');
    $('apAssigned').value = state?.operator?.uid || '';
    $('apStatus').value = 'scheduled';
    $('apReminder').value = 60;
    $('apNotify').value = 'none';
    _openModal('appointmentModal');
  };

  Viora.editAppointment = function (id) {
    const a = (state?.data?.appointments || []).find(x => x.id === id);
    if (!a) return;
    $('appointmentModalTitle').textContent = 'Edit Appointment';
    $('editAppointmentId').value = id;
    const clients = getClients();
    $('apClient').innerHTML = clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}${c.company ? ' — ' + escapeHtml(c.company) : ''}</option>`).join('');
    $('apClient').value = a.clientId || '';
    $('apTitle').value = a.title || '';
    $('apType').value = a.type || 'Discovery Call';
    $('apDate').value = a.date || todayStr();
    $('apStartTime').value = a.startTime || '';
    $('apEndTime').value = a.endTime || '';
    $('apMode').value = a.mode || 'In-person';
    $('apLocation').value = a.location || '';
    $('apAttendees').value = a.attendees || '';
    $('apAgenda').value = a.agenda || '';
    $('apNotes').value = a.notes || '';
    $('apAssigned').innerHTML = '<option value="">— Unassigned —</option>' +
      (state?.data?.users || []).map(u => `<option value="${u.uid}">${escapeHtml(u.name || u.email)}</option>`).join('');
    $('apAssigned').value = a.assignedTo || '';
    $('apStatus').value = a.status || 'scheduled';
    $('apReminder').value = a.reminderMinutes || 60;
    $('apNotify').value = a.notify || 'none';
    _openModal('appointmentModal');
  };

  Viora.saveAppointment = async function (f) {
    const id = $('editAppointmentId').value;
    const existing = id ? (state?.data?.appointments || []).find(x => x.id === id) : null;
    const client = getClient(f.clientId);
    if (!client) { _toast('Select a client.', 'error'); return; }
    const assigned = f.assignedTo ? (state?.data?.users || []).find(u => u.uid === f.assignedTo) : null;
    const p = {
      id: id || uid(),
      title: f.title,
      clientId: f.clientId,
      clientName: client.name,
      type: f.type,
      date: f.date,
      startTime: f.startTime,
      endTime: f.endTime || '',
      mode: f.mode,
      location: f.location,
      attendees: f.attendees,
      agenda: f.agenda,
      notes: f.notes,
      assignedTo: f.assignedTo,
      assignedName: assigned ? (assigned.name || assigned.email) : (state?.operator?.name || ''),
      status: f.status,
      reminderMinutes: f.reminderMinutes,
      notify: f.notify,
      createdAt: id ? existing?.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    try {
      await upsertDoc('appointments', p, existing?._rev);
    } catch (e) {
      if (e.message === 'CONFLICT_ABORTED') return;
      _toast('Save failed: ' + e.message, 'error');
      return;
    }
    await _logAct(id ? 'edit' : 'add', id ? 'Appointment updated' : 'Appointment booked', `${p.title} — ${p.date} ${p.startTime}`);
    _toast('Appointment saved.', 'success');
    _closeModal('appointmentModal');
    if (typeof renderActiveTab === 'function') renderActiveTab();
    if (f.notify && f.notify !== 'none') setTimeout(() => d.dispatchAppointmentNotification?.(p), 300);
    try { EventBus.emit('appointments.upsert', p, p.id, p, { collection: 'appointments' }); } catch (_) {}
  };

  Viora.markAppointmentHeld = async function (id) {
    const a = (state?.data?.appointments || []).find(x => x.id === id);
    if (!a) return;
    a.status = 'held';
    a.heldAt = new Date().toISOString();
    await upsertDoc('appointments', a, a._rev);
    await _logAct('edit', 'Appointment held', `${a.title}`);
    _toast('Marked as held.', 'success');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  Viora.markAppointmentMissed = async function (id) {
    const a = (state?.data?.appointments || []).find(x => x.id === id);
    if (!a) return;
    a.status = 'missed';
    await upsertDoc('appointments', a, a._rev);
    await _logAct('edit', 'Appointment missed', `${a.title}`);
    _toast('Marked as missed.', 'info');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  Viora.deleteAppointment = async function (id) {
    const a = (state?.data?.appointments || []).find(x => x.id === id);
    if (!a || !confirm(`Delete appointment "${a.title}"?`)) return;
    await deleteDoc('appointments', id);
    await _logAct('delete', 'Appointment deleted', a.title);
    _toast('Appointment deleted.', 'info');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  Viora.viewAppointment         = function (id) { return Viora.editAppointment(id); };
  Viora.bookAppointmentForClient = function (id) {
    const c = getClient(id);
    if (!c) return;
    Viora.addAppointment({ clientId: id, title: `Meeting — ${c.name}`, type: 'Discovery Call' });
  };

  /* ═══════════════════════════════════════════════════════════
     PRESENTATIONS
     ═══════════════════════════════════════════════════════════ */
  Viora.addPresentation = function (preset = {}) {
    $('presentationModalTitle').textContent = 'New Presentation';
    $('editPresentationId').value = '';
    $('presentationForm').reset();
    if (state) state.pendingPresAttachments = [];
    const clients = getClients();
    $('prClient').innerHTML = clients.length
      ? clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}${c.company ? ' — ' + escapeHtml(c.company) : ''}</option>`).join('')
      : '<option value="">— No clients yet —</option>';
    if (preset.clientId) $('prClient').value = preset.clientId;
    $('prAppointment').innerHTML = '<option value="">— None —</option>' +
      (state?.data?.appointments || []).map(a => `<option value="${a.id}">${escapeHtml(a.title)} — ${fmtDate(a.date)}</option>`).join('');
    if (preset.appointmentId) $('prAppointment').value = preset.appointmentId;
    if (preset.title)   $('prTitle').value = preset.title;
    if (preset.type)    $('prType').value = preset.type;
    if (preset.summary) $('prSummary').value = preset.summary;
    $('prDate').value = preset.date || todayStr();
    $('prStartTime').value = preset.startTime || '';
    $('prDuration').value = 30;
    $('prPresenter').innerHTML = '<option value="">— Me —</option>' +
      (state?.data?.users || []).map(u => `<option value="${u.uid}">${escapeHtml(u.name || u.email)}</option>`).join('');
    $('prPresenter').value = state?.operator?.uid || '';
    $('prStatus').value = 'delivered';
    if (typeof renderPresAttachments === 'function') renderPresAttachments();
    _openModal('presentationModal');
  };

  Viora.editPresentation = function (id) {
    const p = (state?.data?.presentations || []).find(x => x.id === id);
    if (!p) return;
    $('presentationModalTitle').textContent = 'Edit Presentation';
    $('editPresentationId').value = id;
    const clients = getClients();
    $('prClient').innerHTML = clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}${c.company ? ' — ' + escapeHtml(c.company) : ''}</option>`).join('');
    $('prClient').value = p.clientId || '';
    $('prAppointment').innerHTML = '<option value="">— None —</option>' +
      (state?.data?.appointments || []).map(a => `<option value="${a.id}">${escapeHtml(a.title)} — ${fmtDate(a.date)}</option>`).join('');
    $('prAppointment').value = p.appointmentId || '';
    $('prTitle').value = p.title || '';
    $('prType').value = p.type || 'Pitch / Sales';
    $('prChannel').value = p.channel || 'In-person';
    $('prDate').value = p.date || todayStr();
    $('prStartTime').value = p.startTime || '';
    $('prDuration').value = p.duration || 30;
    $('prPresenter').innerHTML = '<option value="">— Me —</option>' +
      (state?.data?.users || []).map(u => `<option value="${u.uid}">${escapeHtml(u.name || u.email)}</option>`).join('');
    $('prPresenter').value = p.presenterId || '';
    $('prStatus').value = p.status || 'delivered';
    $('prSummary').value = p.summary || '';
    $('prOutcome').value = p.outcome || '';
    $('prNextSteps').value = p.nextSteps || '';
    if (state) state.pendingPresAttachments = (p.attachments || []).slice();
    if (typeof renderPresAttachments === 'function') renderPresAttachments();
    _openModal('presentationModal');
  };

  Viora.savePresentation = async function (f) {
    const id = $('editPresentationId').value;
    const existing = id ? (state?.data?.presentations || []).find(x => x.id === id) : null;
    const client = getClient(f.clientId);
    if (!client) { _toast('Select a client.', 'error'); return; }
    const presenter = f.presenterId ? (state?.data?.users || []).find(u => u.uid === f.presenterId) : null;
    const p = {
      id: id || uid(),
      title: f.title,
      clientId: f.clientId,
      clientName: client.name,
      appointmentId: f.appointmentId || null,
      type: f.type,
      channel: f.channel,
      date: f.date,
      startTime: f.startTime || '',
      duration: f.duration,
      presenterId: f.presenterId,
      presenterName: presenter ? (presenter.name || presenter.email) : (state?.operator?.name || ''),
      status: f.status,
      summary: f.summary,
      outcome: f.outcome,
      nextSteps: f.nextSteps,
      attachments: (state?.pendingPresAttachments || []).slice(),
      createdAt: id ? existing?.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    try {
      await upsertDoc('presentations', p, existing?._rev);
    } catch (e) {
      if (e.message === 'CONFLICT_ABORTED') return;
      _toast('Save failed: ' + e.message, 'error');
      return;
    }
      for (const att of (state?.pendingPresAttachments || [])) {
      try {
        const presDoc = {
          id: 'pres-' + att.id,
          title: `${p.title} — ${att.name}`,
          system: 'Marketing',
          category: 'Presentation Attachment',
          parentId: p.id,
          parentName: p.title,
          fileName: att.name,
          mime: att.mime,
          size: att.size,
          data: att.data,
          uploadedAt: new Date().toISOString()
        };
        await upsertDoc('documents', presDoc);
        await Viora.mirrorDocToClient(presDoc, p.clientId);
      } catch (_) {}
    }
    await _logAct(id ? 'edit' : 'add', id ? 'Presentation updated' : 'Presentation logged', `${p.title} (${p.status})`);
    _toast('Presentation saved.', 'success');
    if (state) state.pendingPresAttachments = [];
    _closeModal('presentationModal');
    if (typeof renderActiveTab === 'function') renderActiveTab();
    try { EventBus.emit('presentations.upsert', p, p.id, p, { collection: 'presentations' }); } catch (_) {}
  };

  Viora.deletePresentation = async function (id) {
    const p = (state?.data?.presentations || []).find(x => x.id === id);
    if (!p || !confirm(`Delete presentation "${p.title}"?`)) return;
    await deleteDoc('presentations', id);
    await _logAct('delete', 'Presentation deleted', p.title);
    _toast('Presentation deleted.', 'info');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  Viora.createPresentationFromAppointment = function (apptId) {
    const a = (state?.data?.appointments || []).find(x => x.id === apptId);
    if (!a) return;
    const typeMap = {
      'Discovery Call': 'Pitch / Sales',
      'Requirements Gathering': 'Technical Demo',
      'Proposal Walkthrough': 'Pitch / Sales',
      'Contract Signing': 'Close / Acceptance',
      'Kick-off Meeting': 'Progress Review',
      'Progress Review': 'Progress Review',
      'Demo': 'Technical Demo',
      'Site Visit': 'Technical Demo'
    };
    Viora.addPresentation({
      clientId: a.clientId,
      appointmentId: a.id,
      title: `Presentation — ${a.title}`,
      type: typeMap[a.type] || 'Other',
      date: a.date,
      startTime: a.startTime,
      summary: a.agenda ? `Follow-up to appointment: ${a.agenda}` : ''
    });
  };

  /* ═══════════════════════════════════════════════════════════
     PERSONAL — TO-DOS / GOALS / SKILLS
     ═══════════════════════════════════════════════════════════ */
  Viora.addPersonalTodo = function () {
    $('personalTodoModalTitle').textContent = 'New To-Do';
    $('ptEditId').value = '';
    $('ptOwnerUid').value = state?.operator?.uid || '';
    $('personalTodoForm').reset();
    $('ptDate').value = todayStr();
    $('ptPriority').value = 'medium';
    $('ptRecurring').value = 'no';
    _openModal('personalTodoModal');
  };

  Viora.editPersonalTodo = function (id) {
    const t = (state?.data?.todos || []).find(x => x.id === id);
    if (!t) return;
    $('personalTodoModalTitle').textContent = 'Edit To-Do';
    $('ptEditId').value = id;
    $('ptOwnerUid').value = t.ownerUid || state?.operator?.uid || '';
    $('ptText').value = t.text || '';
    $('ptDate').value = t.date || todayStr();
    $('ptDueTime').value = t.dueTime || '';
    $('ptPriority').value = t.priority || 'medium';
    $('ptRecurring').value = t.recurring ? 'yes' : 'no';
    _openModal('personalTodoModal');
  };

  Viora.savePersonalTodo = async function (f) {
    if (!f.text) { _toast('Write something first.', 'warning'); return; }
    const id = $('ptEditId').value;
    const ownerUid = $('ptOwnerUid').value || state?.operator?.uid;
    const payload = {
      id: id || uid(),
      text: f.text,
      date: f.date || todayStr(),
      dueTime: f.dueTime || '',
      priority: f.priority || 'medium',
      recurring: !!f.recurring,
      done: false,
      ownerUid,
      createdAt: new Date().toISOString(),
      completionPhoto: null
    };
    if (id) {
      const existing = (state?.data?.todos || []).find(x => x.id === id);
      if (existing) {
        payload.done = existing.done || false;
        payload.completedAt = existing.completedAt || null;
        payload.createdAt = existing.createdAt || payload.createdAt;
        payload.completionPhoto = existing.completionPhoto || null;
      }
    }
    try {
      await upsertPersonal('todos', payload);
      await _logAct(id ? 'edit' : 'add', id ? 'To-do updated' : 'To-do created', payload.text);
      _toast('To-do saved.', 'success');
    } catch (e) {
      _toast('Failed: ' + e.message, 'error');
      return;
    }
    _closeModal('personalTodoModal');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  Viora.togglePersonalTodo = async function (id) {
    const t = (state?.data?.todos || []).find(x => x.id === id);
    if (!t) return;
    const willBeDone = !t.done;
    const updated = { ...t, done: willBeDone, completedAt: willBeDone ? new Date().toISOString() : null };
    try {
      await upsertPersonal('todos', updated);
      await _logAct('edit', willBeDone ? 'To-do completed' : 'To-do reopened', t.text || '');
      _toast(willBeDone ? 'To-do marked done.' : 'To-do reopened.', 'success');
    } catch (e) {
      _toast('Failed to update to-do: ' + e.message, 'error');
    }
  };

  Viora.deletePersonalTodo = async function (id) {
    const t = (state?.data?.todos || []).find(x => x.id === id);
    if (!t) return;
    if (!confirm(`Delete "${t.text}"?`)) return;
    try {
      await deletePersonal('todos', id, t.ownerUid);
      await _logAct('delete', 'To-do deleted', t.text || '');
      _toast('Deleted.', 'info');
    } catch (e) {
      _toast('Failed: ' + e.message, 'error');
    }
  };

  Viora.addPersonalGoal = function () {
    $('personalGoalModalTitle').textContent = 'New Goal';
    $('pgEditId').value = '';
    $('pgOwnerUid').value = state?.operator?.uid || '';
    $('personalGoalForm').reset();
    $('pgType').value = 'short_term';
    $('pgPriority').value = 'medium';
    $('pgTargetDate').value = '';
    if (state) state.editingPersonalGoal = { milestones: [] };
    if (typeof renderGoalMilestoneEditor === 'function') renderGoalMilestoneEditor();
    _openModal('personalGoalModal');
  };

  Viora.editPersonalGoal = function (id) {
    const g = (state?.data?.goals || []).find(x => x.id === id);
    if (!g) return;
    $('personalGoalModalTitle').textContent = 'Edit Goal';
    $('pgEditId').value = id;
    $('pgOwnerUid').value = g.ownerUid || state?.operator?.uid || '';
    $('pgTitle').value = g.title || '';
    $('pgDesc').value = g.description || '';
    $('pgType').value = g.type || 'short_term';
    $('pgPriority').value = g.priority || 'medium';
    $('pgTargetDate').value = g.targetDate || '';
    $('pgTargetTime').value = g.targetTime || '';
    if (state) state.editingPersonalGoal = { milestones: (g.milestones || []).map(m => ({ text: m.text || '', done: !!m.done })) };
    if (typeof renderGoalMilestoneEditor === 'function') renderGoalMilestoneEditor();
    _openModal('personalGoalModal');
  };

  Viora.updateMilestoneDraft = function (i, v) {
    if (!state?.editingPersonalGoal?.milestones) return;
    state.editingPersonalGoal.milestones[i].text = v;
  };

  Viora.toggleMilestoneDraft = function (i, checked) {
    if (!state?.editingPersonalGoal?.milestones) return;
    state.editingPersonalGoal.milestones[i].done = checked;
  };

  Viora.removeMilestoneDraft = function (i) {
    if (!state?.editingPersonalGoal?.milestones) return;
    state.editingPersonalGoal.milestones.splice(i, 1);
    if (typeof renderGoalMilestoneEditor === 'function') renderGoalMilestoneEditor();
  };

  Viora.savePersonalGoal = async function () {
    const id = $('pgEditId').value;
    const title = $('pgTitle').value.trim();
    if (!title) { _toast('Title is required.', 'warning'); return; }
    const ownerUid = $('pgOwnerUid').value || state?.operator?.uid;
    const milestones = (state?.editingPersonalGoal?.milestones || []).filter(m => (m.text || '').trim());
    const payload = {
      id: id || uid(),
      title,
      description: $('pgDesc').value.trim(),
      type: $('pgType').value,
      priority: $('pgPriority').value,
      targetDate: $('pgTargetDate').value || '',
      targetTime: $('pgTargetTime').value || '',
      milestones,
      ownerUid,
      assignedTo: [ownerUid],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (id) {
      const existing = (state?.data?.goals || []).find(x => x.id === id);
      if (existing) {
        payload.createdAt = existing.createdAt || payload.createdAt;
        payload.completedAt = existing.completedAt || null;
      }
    }
    try {
      await upsertTrackFlat('goals', payload);
      await _logAct(id ? 'edit' : 'add', id ? 'Goal updated' : 'Goal created', title);
      _toast('Goal saved.', 'success');
    } catch (e) {
      _toast('Failed: ' + e.message, 'error');
      return;
    }
    _closeModal('personalGoalModal');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  Viora.toggleGoalMilestone = async function (goalId, idx) {
    const g = (state?.data?.goals || []).find(x => x.id === goalId);
    if (!g) return;
    const ms = (g.milestones || []).map((m, i) => i === idx ? { ...m, done: !m.done } : m);
    const updated = { ...g, milestones: ms };
    await upsertTrackFlat('goals', updated);
    await _logAct('edit', ms[idx].done ? 'Milestone complete' : 'Milestone reopened', `${g.title}: ${ms[idx].text}`);
  };

  Viora.deletePersonalGoal = async function (id) {
    const g = (state?.data?.goals || []).find(x => x.id === id);
    if (!g) return;
    if (!confirm(`Delete goal "${g.title}"?`)) return;
    try {
      await deleteTrackFlat('goals', id);
      await _logAct('delete', 'Goal deleted', g.title);
      _toast('Deleted.', 'info');
    } catch (e) {
      _toast('Failed: ' + e.message, 'error');
    }
  };

  Viora.addPersonalSkill = function () {
    $('personalSkillModalTitle').textContent = 'New Skill';
    $('psEditId').value = '';
    $('psOwnerUid').value = state?.operator?.uid || '';
    $('personalSkillForm').reset();
    $('psCategory').value = 'Coding';
    $('psLevel').value = 1;
    $('psHours').value = 0;
    $('psTarget').value = 100;
    _openModal('personalSkillModal');
  };

  Viora.editPersonalSkill = function (id) {
    const s = (state?.data?.skills || []).find(x => x.id === id);
    if (!s) return;
    $('personalSkillModalTitle').textContent = 'Edit Skill';
    $('psEditId').value = id;
    $('psOwnerUid').value = s.ownerUid || state?.operator?.uid || '';
    $('psName').value = s.name || '';
    $('psCategory').value = s.category || 'Other';
    $('psLevel').value = s.level || 1;
    $('psHours').value = s.hours || 0;
    $('psTarget').value = s.target || 100;
    _openModal('personalSkillModal');
  };

  Viora.savePersonalSkill = async function (f) {
    if (!f.name) { _toast('Skill name required.', 'warning'); return; }
    const id = $('psEditId').value;
    const ownerUid = $('psOwnerUid').value || state?.operator?.uid;
    const payload = {
      id: id || uid(),
      name: f.name,
      category: f.category,
      level: f.level,
      hours: f.hours,
      target: f.target,
      ownerUid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (id) {
      const existing = (state?.data?.skills || []).find(x => x.id === id);
      if (existing) payload.createdAt = existing.createdAt || payload.createdAt;
    }
    try {
      await upsertTrackFlat('skills', payload);
      await _logAct(id ? 'edit' : 'add', id ? 'Skill updated' : 'Skill added', f.name);
      _toast('Skill saved.', 'success');
    } catch (e) {
      _toast('Failed: ' + e.message, 'error');
      return;
    }
    _closeModal('personalSkillModal');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  Viora.logPersonalSkillHours = async function (id, delta) {
    const s = (state?.data?.skills || []).find(x => x.id === id);
    if (!s) return;
    const newHours = Number(s.hours || 0) + Number(delta || 0);
    const newLevel = Math.floor(newHours / 20) + 1;
    const updated = { ...s, hours: newHours, level: newLevel, updatedAt: new Date().toISOString() };
    await upsertTrackFlat('skills', updated);
    await _logAct('edit', 'Skill hours logged', `${s.name} +${delta}h`);
    _toast(`+${delta}h logged.`, 'success');
  };

  Viora.deletePersonalSkill = async function (id) {
    const s = (state?.data?.skills || []).find(x => x.id === id);
    if (!s) return;
    if (!confirm(`Delete skill "${s.name}"?`)) return;
    try {
      await deleteTrackFlat('skills', id);
      await _logAct('delete', 'Skill deleted', s.name);
      _toast('Deleted.', 'info');
    } catch (e) {
      _toast('Failed: ' + e.message, 'error');
    }
  };

  /* ═══════════════════════════════════════════════════════════
     CLIENTSITE
     ═══════════════════════════════════════════════════════════ */
  Viora.editClientsiteBrand = function () {
    const site = state?.data?.clientsite || {};
    const b = site.branding || {};
    $('cbName').value = b.name || '';
    $('cbCompany').value = b.company || '';
    $('cbEmail').value = b.email || '';
    $('cbPhone').value = b.phone || '';
    $('cbAccent').value = b.accentColor || '#00d4ff';
    $('cbPrimary').value = b.primaryColor || '#0a0a0f';
    $('cbHeroTitle').value = site.heroTitle || '';
    $('cbHeroBio').value = site.heroBio || '';
    $('cbTypedPhrases').value = site.typedPhrases || '';
    const stats = site.stats || {};
    $('cbStatsProjects').value = stats.projects || 0;
    $('cbStatsClients').value = stats.clients || 0;
    $('cbStatsExperience').value = stats.experience || 0;
    _openModal('clientsiteBrandModal');
  };

  Viora.saveClientsiteBrand = async function () {
    const site = { ...(state?.data?.clientsite || {}) };
    site.branding = {
      name: $('cbName').value.trim(),
      company: $('cbCompany').value.trim(),
      email: $('cbEmail').value.trim(),
      phone: $('cbPhone').value.trim(),
      accentColor: $('cbAccent').value,
      primaryColor: $('cbPrimary').value
    };
    site.heroTitle = $('cbHeroTitle').value.trim();
    site.heroBio = $('cbHeroBio').value.trim();
    site.typedPhrases = $('cbTypedPhrases').value.trim();
    site.stats = {
      projects: parseInt($('cbStatsProjects').value) || 0,
      clients: parseInt($('cbStatsClients').value) || 0,
      experience: parseInt($('cbStatsExperience').value) || 0
    };
    site.updatedAt = new Date().toISOString();
    await set(ref(db, P('clientsite')), site);
    if (state) state.data.clientsite = site;
    await _logAct('edit', 'Public site branding updated', site.branding.name || '');
    _toast('Branding saved. Live site updated.', 'success');
    _closeModal('clientsiteBrandModal');
    if (typeof renderClientsite === 'function') renderClientsite();
  };

  Viora.editClientsiteIndustry = function (index) {
    const site = state?.data?.clientsite || {};
    const list = site.industries || [];
    const isNew = index < 0;
    const item = isNew ? { key: '', icon: 'fa-solid fa-industry', title: '', tagline: '', pain: '', features: [] } : list[index];
    if (!item) return;
    $('clientsiteIndustryModalTitle').textContent = isNew ? 'New Industry' : 'Edit Industry';
    $('ciIndex').value = index;
    $('ciKey').value = item.key || '';
    $('ciIcon').value = item.icon || '';
    $('ciTitle').value = item.title || '';
    $('ciTagline').value = item.tagline || '';
    $('ciPain').value = item.pain || '';
    $('ciFeatures').value = (item.features || []).join('\n');
    $('ciDeleteBtn').style.display = isNew ? 'none' : 'inline-flex';
    _openModal('clientsiteIndustryModal');
  };

  Viora.saveClientsiteIndustry = async function () {
    const site = { ...(state?.data?.clientsite || {}) };
    const list = (site.industries || []).slice();
    const idx = parseInt($('ciIndex').value);
    const item = {
      key: $('ciKey').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      icon: $('ciIcon').value.trim() || 'fa-solid fa-industry',
      title: $('ciTitle').value.trim(),
      tagline: $('ciTagline').value.trim(),
      pain: $('ciPain').value.trim(),
      features: $('ciFeatures').value.split('\n').map(s => s.trim()).filter(Boolean)
    };
    if (!item.key || !item.title) { _toast('Key and title required.', 'error'); return; }
    if (idx >= 0) list[idx] = item; else list.push(item);
    site.industries = list;
    site.updatedAt = new Date().toISOString();
    await set(ref(db, P('clientsite')), site);
    if (state) state.data.clientsite = site;
    _toast('Industry saved. Public site updated.', 'success');
    _closeModal('clientsiteIndustryModal');
    if (typeof renderClientsite === 'function') renderClientsite();
  };

  Viora.deleteClientsiteIndustry = async function () {
    const idx = parseInt($('ciIndex').value);
    const site = { ...(state?.data?.clientsite || {}) };
    const list = (site.industries || []).slice();
    if (idx < 0 || idx >= list.length) return;
    if (!confirm(`Delete "${list[idx].title}"?`)) return;
    list.splice(idx, 1);
    site.industries = list;
    site.updatedAt = new Date().toISOString();
    await set(ref(db, P('clientsite')), site);
    if (state) state.data.clientsite = site;
    _closeModal('clientsiteIndustryModal');
    if (typeof renderClientsite === 'function') renderClientsite();
  };

  Viora.editClientsiteBlogPost = function (index) {
    const site = state?.data?.clientsite || {};
    const list = site.blogPosts || [];
    const isNew = index < 0;
    const item = isNew ? { tag: '', date: '', title: '', excerpt: '', read: '5 min read' } : list[index];
    if (!item) return;
    $('clientsiteBlogModalTitle').textContent = isNew ? 'New Blog Post' : 'Edit Blog Post';
    $('cbIndex').value = index;
    $('cbTag').value = item.tag || '';
    $('cbDate').value = item.date || '';
    $('cbTitle').value = item.title || '';
    $('cbExcerpt').value = item.excerpt || '';
    $('cbRead').value = item.read || '';
    $('cbDeleteBtn').style.display = isNew ? 'none' : 'inline-flex';
    _openModal('clientsiteBlogModal');
  };

  Viora.saveClientsiteBlogPost = async function () {
    const site = { ...(state?.data?.clientsite || {}) };
    const list = (site.blogPosts || []).slice();
    const idx = parseInt($('cbIndex').value);
    const item = {
      tag: $('cbTag').value.trim(),
      date: $('cbDate').value.trim(),
      title: $('cbTitle').value.trim(),
      excerpt: $('cbExcerpt').value.trim(),
      read: $('cbRead').value.trim()
    };
    if (!item.title) { _toast('Title required.', 'error'); return; }
    if (idx >= 0) list[idx] = item; else list.push(item);
    site.blogPosts = list;
    site.updatedAt = new Date().toISOString();
    await set(ref(db, P('clientsite')), site);
    if (state) state.data.clientsite = site;
    _toast('Blog post saved.', 'success');
    _closeModal('clientsiteBlogModal');
    if (typeof renderClientsite === 'function') renderClientsite();
  };

  Viora.deleteClientsiteBlogPost = async function () {
    const idx = parseInt($('cbIndex').value);
    const site = { ...(state?.data?.clientsite || {}) };
    const list = (site.blogPosts || []).slice();
    if (idx < 0 || idx >= list.length || !confirm('Delete this post?')) return;
    list.splice(idx, 1);
    site.blogPosts = list;
    site.updatedAt = new Date().toISOString();
    await set(ref(db, P('clientsite')), site);
    if (state) state.data.clientsite = site;
    _closeModal('clientsiteBlogModal');
    if (typeof renderClientsite === 'function') renderClientsite();
  };

  Viora.editClientsiteFaq = function (index) {
    const site = state?.data?.clientsite || {};
    const list = site.faqs || [];
    const isNew = index < 0;
    const item = isNew ? { q: '', a: '' } : list[index];
    if (!item) return;
    $('clientsiteFaqModalTitle').textContent = isNew ? 'New FAQ' : 'Edit FAQ';
    $('cfIndex').value = index;
    $('cfQ').value = item.q || '';
    $('cfA').value = item.a || '';
    $('cfDeleteBtn').style.display = isNew ? 'none' : 'inline-flex';
    _openModal('clientsiteFaqModal');
  };

  Viora.saveClientsiteFaq = async function () {
    const site = { ...(state?.data?.clientsite || {}) };
    const list = (site.faqs || []).slice();
    const idx = parseInt($('cfIndex').value);
    const item = { q: $('cfQ').value.trim(), a: $('cfA').value.trim() };
    if (!item.q || !item.a) { _toast('Q and A required.', 'error'); return; }
    if (idx >= 0) list[idx] = item; else list.push(item);
    site.faqs = list;
    site.updatedAt = new Date().toISOString();
    await set(ref(db, P('clientsite')), site);
    if (state) state.data.clientsite = site;
    _toast('FAQ saved.', 'success');
    _closeModal('clientsiteFaqModal');
    if (typeof renderClientsite === 'function') renderClientsite();
  };

  Viora.deleteClientsiteFaq = async function () {
    const idx = parseInt($('cfIndex').value);
    const site = { ...(state?.data?.clientsite || {}) };
    const list = (site.faqs || []).slice();
    if (idx < 0 || idx >= list.length || !confirm('Delete this FAQ?')) return;
    list.splice(idx, 1);
    site.faqs = list;
    site.updatedAt = new Date().toISOString();
    await set(ref(db, P('clientsite')), site);
    if (state) state.data.clientsite = site;
    _closeModal('clientsiteFaqModal');
    if (typeof renderClientsite === 'function') renderClientsite();
  };

  Viora.editClientsiteTestimonial = function (index) {
    const site = state?.data?.clientsite || {};
    const list = site.testimonials || [];
    const isNew = index < 0;
    const item = isNew ? { name: '', role: '', text: '' } : list[index];
    if (!item) return;
    $('clientsiteTestimonialModalTitle').textContent = isNew ? 'New Testimonial' : 'Edit Testimonial';
    $('ctIndex').value = index;
    $('ctName').value = item.name || '';
    $('ctRole').value = item.role || '';
    $('ctText').value = item.text || '';
    $('ctDeleteBtn').style.display = isNew ? 'none' : 'inline-flex';
    _openModal('clientsiteTestimonialModal');
  };

  Viora.saveClientsiteTestimonial = async function () {
    const site = { ...(state?.data?.clientsite || {}) };
    const list = (site.testimonials || []).slice();
    const idx = parseInt($('ctIndex').value);
    const item = { name: $('ctName').value.trim(), role: $('ctRole').value.trim(), text: $('ctText').value.trim() };
    if (!item.name || !item.text) { _toast('Name and text required.', 'error'); return; }
    if (idx >= 0) list[idx] = item; else list.push(item);
    site.testimonials = list;
    site.updatedAt = new Date().toISOString();
    await set(ref(db, P('clientsite')), site);
    if (state) state.data.clientsite = site;
    _toast('Testimonial saved.', 'success');
    _closeModal('clientsiteTestimonialModal');
    if (typeof renderClientsite === 'function') renderClientsite();
  };

  Viora.deleteClientsiteTestimonial = async function () {
    const idx = parseInt($('ctIndex').value);
    const site = { ...(state?.data?.clientsite || {}) };
    const list = (site.testimonials || []).slice();
    if (idx < 0 || idx >= list.length || !confirm('Delete this testimonial?')) return;
    list.splice(idx, 1);
    site.testimonials = list;
    site.updatedAt = new Date().toISOString();
    await set(ref(db, P('clientsite')), site);
    if (state) state.data.clientsite = site;
    _closeModal('clientsiteTestimonialModal');
    if (typeof renderClientsite === 'function') renderClientsite();
  };

  Viora.editClientsiteTechStack = function () {
    const site = state?.data?.clientsite || {};
    const list = site.techStack || [];
    const render = (arr) => {
      $('ctTechList').innerHTML = arr.map((t, i) => `
        <div style="display:flex;gap:6px;margin-bottom:6px;">
          <input value="${escapeHtml(t.icon || '')}" oninput="window.__ctTechUpdate(${i},'icon',this.value)" placeholder="fa-brands fa-react" style="flex:1;padding:6px 10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-input);color:var(--text-primary);" />
          <input value="${escapeHtml(t.name || '')}" oninput="window.__ctTechUpdate(${i},'name',this.value)" placeholder="React" style="flex:1;padding:6px 10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-input);color:var(--text-primary);" />
          <button type="button" class="btn btn-danger btn-xs" onclick="window.__ctTechRemove(${i})"><i class="fa-solid fa-xmark"></i></button>
        </div>`).join('');
    };
    window.__ctTechDraft = list.slice();
    render(window.__ctTechDraft);
    window.__ctTechUpdate = (i, k, v) => { window.__ctTechDraft[i][k] = v; };
    window.__ctTechRemove = (i) => { window.__ctTechDraft.splice(i, 1); render(window.__ctTechDraft); };
    $('ctTechAddBtn').onclick = () => { window.__ctTechDraft.push({ name: '', icon: '' }); render(window.__ctTechDraft); };
    _openModal('clientsiteTechStackModal');
  };

  Viora.saveClientsiteTechStack = async function () {
    const site = { ...(state?.data?.clientsite || {}) };
    site.techStack = (window.__ctTechDraft || []).filter(t => t.name);
    site.updatedAt = new Date().toISOString();
    await set(ref(db, P('clientsite')), site);
    if (state) state.data.clientsite = site;
    _toast('Tech stack saved.', 'success');
    _closeModal('clientsiteTechStackModal');
    if (typeof renderClientsite === 'function') renderClientsite();
  };

  Viora.editClientsiteSkill = function (index) {
    const site = state?.data?.clientsite || {};
    const list = site.skills || [];
    const isNew = index < 0;
    const item = isNew ? { name: '', icon: 'fa-solid fa-code', level: 80 } : list[index];
    if (!item) return;
    $('clientsiteSkillModalTitle').textContent = isNew ? 'New Skill' : 'Edit Skill';
    $('cskIndex').value = index;
    $('cskName').value = item.name || '';
    $('cskIcon').value = item.icon || '';
    $('cskLevel').value = item.level || 80;
    $('cskDeleteBtn').style.display = isNew ? 'none' : 'inline-flex';
    _openModal('clientsiteSkillModal');
  };

  Viora.saveClientsiteSkill = async function () {
    const site = { ...(state?.data?.clientsite || {}) };
    const list = (site.skills || []).slice();
    const idx = parseInt($('cskIndex').value);
    const item = {
      name: $('cskName').value.trim(),
      icon: $('cskIcon').value.trim() || 'fa-solid fa-code',
      level: parseInt($('cskLevel').value) || 80
    };
    if (!item.name) { _toast('Name required.', 'error'); return; }
    if (idx >= 0) list[idx] = item; else list.push(item);
    site.skills = list;
    site.updatedAt = new Date().toISOString();
    await set(ref(db, P('clientsite')), site);
    if (state) state.data.clientsite = site;
    _toast('Skill saved.', 'success');
    _closeModal('clientsiteSkillModal');
    if (typeof renderClientsite === 'function') renderClientsite();
  };

  Viora.deleteClientsiteSkill = async function () {
    const idx = parseInt($('cskIndex').value);
    const site = { ...(state?.data?.clientsite || {}) };
    const list = (site.skills || []).slice();
    if (idx < 0 || idx >= list.length || !confirm('Delete this skill?')) return;
    list.splice(idx, 1);
    site.skills = list;
    site.updatedAt = new Date().toISOString();
    await set(ref(db, P('clientsite')), site);
    if (state) state.data.clientsite = site;
    _closeModal('clientsiteSkillModal');
    if (typeof renderClientsite === 'function') renderClientsite();
  };

  Viora.editClientsiteService = function (index) {
    const site = state?.data?.clientsite || {};
    const services = site.services || [];
    if (index >= 0 && index < services.length) {
      const s = services[index];
      $('clientsiteServiceModalTitle').textContent = 'Edit Service';
      $('csIndex').value = index;
      $('csTitle').value = s.title || '';
      $('csDescription').value = s.description || '';
      $('csIcon').value = s.icon || 'fa-solid fa-code';
    } else {
      $('clientsiteServiceModalTitle').textContent = 'New Service';
      $('csIndex').value = '-1';
      $('csTitle').value = '';
      $('csDescription').value = '';
      $('csIcon').value = 'fa-solid fa-code';
    }
    _openModal('clientsiteServiceModal');
  };

  Viora.saveClientsiteService = async function () {
    const site = { ...(state?.data?.clientsite || {}) };
    const services = (site.services || []).slice();
    const idx = parseInt($('csIndex').value);
    const svc = {
      title: $('csTitle').value.trim(),
      description: $('csDescription').value.trim(),
      icon: $('csIcon').value.trim() || 'fa-solid fa-star'
    };
    if (!svc.title) { _toast('Title required.', 'warning'); return; }
    if (idx >= 0) services[idx] = svc; else services.push(svc);
    site.services = services;
    site.updatedAt = new Date().toISOString();
    await set(ref(db, P('clientsite')), site);
    if (state) state.data.clientsite = site;
    await _logAct('edit', idx >= 0 ? 'Service updated' : 'Service added', svc.title);
    _toast('Service saved.', 'success');
    _closeModal('clientsiteServiceModal');
    if (typeof renderClientsite === 'function') renderClientsite();
  };

  Viora.deleteClientsiteService = async function (index) {
    const site = { ...(state?.data?.clientsite || {}) };
    const services = (site.services || []).slice();
    if (index < 0 || index >= services.length) return;
    if (!confirm(`Delete service "${services[index].title}"?`)) return;
    const removed = services.splice(index, 1)[0];
    site.services = services;
    site.updatedAt = new Date().toISOString();
    await set(ref(db, P('clientsite')), site);
    if (state) state.data.clientsite = site;
    await _logAct('delete', 'Service deleted', removed.title);
    _toast('Service deleted.', 'info');
    if (typeof renderClientsite === 'function') renderClientsite();
  };

  Viora.editClientsiteProject = function (index) {
    const site = state?.data?.clientsite || {};
    const projects = site.projects || [];
    if (index >= 0 && index < projects.length) {
      const p = projects[index];
      $('clientsiteProjectModalTitle').textContent = 'Edit Project';
      $('cpIndex').value = index;
      $('cspTitle').value = p.title || '';
      $('cpDescription').value = p.description || '';
      $('cpImage').value = p.image || '';
      $('cpTags').value = (p.tags || []).join(', ');
      $('cpLink').value = p.link || '';
    } else {
      $('clientsiteProjectModalTitle').textContent = 'New Project';
      $('cpIndex').value = '-1';
      $('cspTitle').value = '';
      $('cpDescription').value = '';
      $('cpImage').value = '';
      $('cpTags').value = '';
      $('cpLink').value = '';
    }
    _openModal('clientsiteProjectModal');
  };

  Viora.saveClientsiteProject = async function () {
    const site = { ...(state?.data?.clientsite || {}) };
    const projects = (site.projects || []).slice();
    const idx = parseInt($('cpIndex').value);
    const prj = {
      title: $('cspTitle').value.trim(),
      description: $('cpDescription').value.trim(),
      image: $('cpImage').value.trim(),
      tags: ($('cpTags').value || '').split(',').map(s => s.trim()).filter(Boolean),
      link: $('cpLink').value.trim()
    };
    if (!prj.title) { _toast('Title required.', 'warning'); return; }
    if (idx >= 0) projects[idx] = prj; else projects.push(prj);
    site.projects = projects;
    site.updatedAt = new Date().toISOString();
    await set(ref(db, P('clientsite')), site);
    if (state) state.data.clientsite = site;
    await _logAct('edit', idx >= 0 ? 'Project updated' : 'Project added', prj.title);
    _toast('Project saved.', 'success');
    _closeModal('clientsiteProjectModal');
    if (typeof renderClientsite === 'function') renderClientsite();
  };

  Viora.deleteClientsiteProject = async function (index) {
    const site = { ...(state?.data?.clientsite || {}) };
    const projects = (site.projects || []).slice();
    if (index < 0 || index >= projects.length) return;
    if (!confirm(`Delete project "${projects[index].title}"?`)) return;
    const removed = projects.splice(index, 1)[0];
    site.projects = projects;
    site.updatedAt = new Date().toISOString();
    await set(ref(db, P('clientsite')), site);
    if (state) state.data.clientsite = site;
    await _logAct('delete', 'Project deleted', removed.title);
    _toast('Project deleted.', 'info');
    if (typeof renderClientsite === 'function') renderClientsite();
  };

  /* ═══════════════════════════════════════════════════════════
     COMPANY PROFILE
     ═══════════════════════════════════════════════════════════ */
   Viora.editProfile = function () {
    const p = state?.data?.companyProfile || {};
    const esc = (v) => escapeHtml(v == null ? '' : v);
    const v = (k, dflt) => esc(p[k] != null ? p[k] : (dflt || ''));

    /* Pipe-delimited stringification for structured arrays */
    const certsStr = (p.certificates || []).map(c => {
      const parts = [
        c.title || '', c.issuer || '', c.issueDate || c.date || '',
        c.expiryDate || '', c.credentialId || '', c.description || ''
      ];
      return parts.join('|');
    }).join('\n');

    const awardsStr = (p.awards || []).map(a => {
      const parts = [
        a.title || '', a.issuer || '', a.year || a.date || '', a.description || ''
      ];
      return parts.join('|');
    }).join('\n');

    const hoursStr = (() => {
      const h = p.hours || {};
      const days = ['mon','tue','wed','thu','fri','sat','sun'];
      return days.map(d => {
        const row = h[d] || {};
        return `${d}|${row.open || ''}|${row.close || ''}|${row.closed ? '1' : '0'}`;
      }).join('\n');
    })();

    const socials = p.social || {};
    const bank = p.bank || {};
    const mpesa = p.mpesa || {};
    const dpo = p.dpo || {};

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.style.zIndex = '2000';

    /* ─────────────────────────────────────────────────────────────
       Reusable field helper — every input gets the exact same look.
       ───────────────────────────────────────────────────────────── */
    const field = (id, label, value, opts) => {
      opts = opts || {};
      const type = opts.type || 'text';
      const placeholder = opts.placeholder ? esc(opts.placeholder) : '';
      const required = opts.required ? ' required' : '';
      if (opts.textarea) {
        return `<div class="form-row" style="grid-template-columns:1fr;margin-bottom:10px;">
          <div><label style="margin-top:0;">${label}${opts.required ? ' <span class="required">*</span>' : ''}</label>
          <textarea id="${id}" rows="${opts.rows || 3}" placeholder="${placeholder}"${required}>${esc(value)}</textarea>
          ${opts.hint ? `<small style="display:block;font-size:.68rem;color:var(--text-light);margin-top:3px;">${opts.hint}</small>` : ''}
          </div></div>`;
      }
      return `<div style="margin-bottom:10px;">
        <label style="margin-top:0;">${label}${opts.required ? ' <span class="required">*</span>' : ''}</label>
        <input type="${type}" id="${id}" value="${esc(value)}" placeholder="${placeholder}"${required} />
        ${opts.hint ? `<small style="display:block;font-size:.68rem;color:var(--text-light);margin-top:3px;">${opts.hint}</small>` : ''}
      </div>`;
    };

    const row = (html) => `<div class="form-row">${html}</div>`;

    /* ─────────────────────────────────────────────────────────────
       Logo preview block
       ───────────────────────────────────────────────────────────── */
    const logoPreviewHtml = `
      <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg-input);border-radius:10px;border:1px solid var(--border-color);margin-bottom:14px;">
        <div id="cpLogoPreview" style="width:56px;height:56px;border-radius:10px;background:var(--bg-elev-2);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;border:1px dashed var(--border-color);">
          ${p.logoUrl
            ? `<img src="${esc(p.logoUrl)}" alt="" style="width:100%;height:100%;object-fit:contain;" onerror="this.style.display='none';" />`
            : `<i class="fa-solid fa-image" style="opacity:.4;color:var(--text-light);"></i>`}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:.85rem;">Company Logo</div>
          <div style="font-size:.7rem;color:var(--text-light);">Used on invoices, reports, marketplace. PNG/JPG, max 500 KB.</div>
          <div style="display:flex;gap:6px;margin-top:6px;">
            <button type="button" class="btn btn-primary btn-xs" id="cpLogoPickBtn"><i class="fa-solid fa-upload"></i> Choose</button>
            <button type="button" class="btn btn-outline btn-xs" id="cpLogoClearBtn" ${p.logoUrl ? '' : 'style="display:none;"'}><i class="fa-solid fa-xmark"></i> Remove</button>
          </div>
        </div>
        <input type="file" id="cpLogoFile" accept="image/*" style="display:none;" />
        <input type="hidden" id="cpLogoUrl" value="${esc(p.logoUrl || '')}" />
      </div>
    `;

    /* ─────────────────────────────────────────────────────────────
       Build the full form
       ───────────────────────────────────────────────────────────── */
    modal.innerHTML = `
      <div class="modal large" style="max-width:820px;max-height:92vh;overflow-y:auto;">
        <h2><span class="modal-icon"><i class="fa-solid fa-building"></i></span> Company Profile</h2>
        <form id="companyProfileForm">

          <!-- ══════════════ 1. IDENTITY ══════════════ -->
          <h4 class="form-section" style="margin-top:0;"><i class="fa-solid fa-fingerprint"></i> Identity</h4>
          ${logoPreviewHtml}
          ${row(
            field('cName', 'Display Name', v('name', 'Viora Intercollective'), { required: true }) +
            field('cLegalName', 'Legal Name', v('legalName'), { hint: 'As registered — appears on contracts and tax filings' })
          )}
          ${row(
            field('cTradingName', 'Trading Name', v('tradingName'), { hint: 'If different from legal name' }) +
            field('cTagline', 'Tagline / Slogan', v('tagline'), { hint: 'Appears on invoices and letterhead' })
          )}
          ${row(
            field('cIndustry', 'Industry', v('industry'), { placeholder: 'e.g. Software & IT Services' }) +
            field('cFoundedDate', 'Founded Date', v('foundedDate'), { type: 'date' })
          )}
          ${field('cDescription', 'Short Description', v('description'), { textarea: true, rows: 3, hint: 'One or two sentences — used on invoices and public site' })}
          ${field('cAbout', 'About (long form)', v('about'), { textarea: true, rows: 5, hint: 'Paragraphs, more detail than short description' })}

          <!-- ══════════════ 2. BRAND ══════════════ -->
          <h4 class="form-section"><i class="fa-solid fa-palette"></i> Branding</h4>
          ${row(
            field('cPrimaryColor', 'Primary Color', v('primaryColor', '#0a84ff'), { type: 'color' }) +
            field('cSecondaryColor', 'Secondary Color', v('secondaryColor', '#22e6a0'), { type: 'color' }) +
            field('cMonogram', 'Monogram (2 letters)', v('monogram'), { placeholder: 'e.g. VI', hint: 'Fallback when logo absent' })
          )}

          <!-- ══════════════ 3. REGISTRATION & TAX ══════════════ -->
          <h4 class="form-section"><i class="fa-solid fa-scale-balanced"></i> Registration & Tax</h4>
          ${row(
            field('cRegNo', 'Company Registration #', v('registrationNumber')) +
            field('cTaxId', 'Tax ID / PIN', v('taxId'))
          )}
          ${row(
            field('cKraPin', 'KRA PIN', v('kraPin'), { hint: 'If different from Tax ID' }) +
            field('cVatNumber', 'VAT Number', v('vatNumber'), { hint: 'If VAT-registered' })
          )}
          ${row(
            field('cPermitNumber', 'Business Permit #', v('permitNumber')) +
            field('cPermitExpiry', 'Permit Expiry', v('permitExpiry'), { type: 'date' })
          )}
          <label style="display:flex;align-items:center;gap:8px;font-weight:400;margin:6px 0 12px;cursor:pointer;">
            <input type="checkbox" id="cVatRegistered" ${p.vatRegistered ? 'checked' : ''} style="width:auto;" />
            <span>VAT registered (invoices will show VAT breakdown)</span>
          </label>

          <!-- ══════════════ 4. CONTACT ══════════════ -->
          <h4 class="form-section"><i class="fa-solid fa-address-book"></i> Contact</h4>
          ${row(
            field('cEmail', 'Primary Email', v('email'), { type: 'email', required: true }) +
            field('cSupportEmail', 'Support Email', v('supportEmail'), { type: 'email' })
          )}
          ${row(
            field('cBillingEmail', 'Billing Email', v('billingEmail'), { type: 'email' }) +
            field('cPhone', 'Primary Phone', v('phone'), { type: 'tel', required: true })
          )}
          ${row(
            field('cPhoneAlt', 'Alt Phone', v('phoneAlt'), { type: 'tel' }) +
            field('cWhatsApp', 'WhatsApp', v('whatsapp'), { type: 'tel' })
          )}
          ${row(
            field('cTollFree', 'Toll-free', v('phoneTollFree'), { type: 'tel' }) +
            field('cWebsite', 'Website', v('website'), { type: 'url', placeholder: 'https://' })
          )}

          <!-- ══════════════ 5. ADDRESS ══════════════ -->
          <h4 class="form-section"><i class="fa-solid fa-location-dot"></i> Address</h4>
          ${field('cPhysicalAddress', 'Physical Address', v('physicalAddress'), { placeholder: 'e.g. Kimathi Street, Nairobi CBD' })}
          ${row(
            field('cPOBox', 'P.O. Box', v('poBox'), { placeholder: 'e.g. 12345-00100' }) +
            field('cPostalCode', 'Postal Code', v('postalCode'))
          )}
          ${row(
            field('cCity', 'City / Town', v('headquarters')) +
            field('cRegion', 'County / State / Region', v('region'))
          )}
          ${row(
            field('cCountry', 'Country', v('country'), { placeholder: 'Kenya' }) +
            field('cTimezone', 'Timezone', v('timezone', 'Africa/Nairobi'), { placeholder: 'Africa/Nairobi' })
          )}
          ${row(
            field('cGeoLat', 'GPS Latitude', v('geoLat'), { placeholder: '-1.286389' }) +
            field('cGeoLng', 'GPS Longitude', v('geoLng'), { placeholder: '36.817222' })
          )}

          <!-- ══════════════ 6. BUSINESS DETAILS ══════════════ -->
          <h4 class="form-section"><i class="fa-solid fa-briefcase"></i> Business Details</h4>
          ${row(
            field('cEmployees', 'Number of Employees', v('employees'), { type: 'number' }) +
            field('cAnnualTurnover', 'Annual Turnover (KES)', v('annualTurnover'), { type: 'number' })
          )}
          ${row(
            field('cDefaultCurrency', 'Default Currency', v('defaultCurrency', 'KES'), { placeholder: 'KES' }) +
            field('cFiscalYearEnd', 'Fiscal Year End', v('fiscalYearEnd'), { placeholder: 'MM-DD', hint: 'e.g. 06-30' })
          )}
          ${field('cLanguages', 'Languages Supported (comma separated)', (Array.isArray(p.languages) ? p.languages.join(', ') : v('languages', 'English, Swahili')), { hint: 'Used on public site and invoice notes' })}

          <!-- ══════════════ 7. SOCIAL ══════════════ -->
          <h4 class="form-section"><i class="fa-solid fa-share-nodes"></i> Social Media</h4>
          ${row(
            field('cLinkedIn', 'LinkedIn', socials.linkedin || '', { type: 'url' }) +
            field('cTwitter', 'Twitter / X', socials.twitter || '', { type: 'url' })
          )}
          ${row(
            field('cFacebook', 'Facebook', socials.facebook || '', { type: 'url' }) +
            field('cInstagram', 'Instagram', socials.instagram || '', { type: 'url' })
          )}
          ${row(
            field('cYouTube', 'YouTube', socials.youtube || '', { type: 'url' }) +
            field('cTikTok', 'TikTok', socials.tiktok || '', { type: 'url' })
          )}

          <!-- ══════════════ 8. BANK & M-PESA ══════════════ -->
          <h4 class="form-section"><i class="fa-solid fa-building-columns"></i> Bank & M-Pesa</h4>
          ${row(
            field('cBankName', 'Bank Name', bank.name || '', { placeholder: 'e.g. Equity Bank' }) +
            field('cBankBranch', 'Bank Branch', bank.branch || '')
          )}
          ${row(
            field('cBankAccountName', 'Account Name', bank.accountName || '') +
            field('cBankAccountNumber', 'Account Number', bank.accountNumber || '')
          )}
          ${row(
            field('cBankSwift', 'SWIFT / BIC', bank.swift || '') +
            field('cBankBranchCode', 'Branch Code', bank.branchCode || '')
          )}
          ${row(
            field('cMpesaPaybill', 'M-Pesa Paybill', mpesa.paybill || '') +
            field('cMpesaTill', 'M-Pesa Till', mpesa.till || '')
          )}
          ${field('cMpesaAccountPrefix', 'M-Pesa Account Prefix', mpesa.accountPrefix || '', { hint: 'e.g. VIORA- so M-Pesa account becomes VIORA-<invoice#>' })}

          <!-- ══════════════ 9. BUSINESS HOURS ══════════════ -->
          <h4 class="form-section"><i class="fa-solid fa-clock"></i> Business Hours</h4>
          <p style="font-size:.75rem;color:var(--text-secondary);margin:0 0 8px;">Format per line: <code>day|open|close|closed</code> — e.g. <code>mon|08:00|17:00|0</code></p>
          ${field('cHours', 'Business Hours', hoursStr, { textarea: true, rows: 7 })}

          <!-- ══════════════ 10. CERTIFICATIONS ══════════════ -->
          <h4 class="form-section"><i class="fa-solid fa-certificate"></i> Certifications</h4>
          <p style="font-size:.75rem;color:var(--text-secondary);margin:0 0 8px;">
            One per line: <code>title|issuer|issueDate|expiryDate|credentialId|description</code>
          </p>
          ${field('cCertificates', 'Certifications', certsStr, { textarea: true, rows: 4, hint: 'Expiry is tracked and shows as a reminder in the compliance scan' })}

          <!-- ══════════════ 11. AWARDS ══════════════ -->
          <h4 class="form-section"><i class="fa-solid fa-trophy"></i> Awards</h4>
          <p style="font-size:.75rem;color:var(--text-secondary);margin:0 0 8px;">
            One per line: <code>title|issuer|year|description</code>
          </p>
          ${field('cAwards', 'Awards', awardsStr, { textarea: true, rows: 3 })}

          <!-- ══════════════ 12. LEGAL / DATA PROTECTION ══════════════ -->
          <h4 class="form-section"><i class="fa-solid fa-user-shield"></i> Legal & Compliance</h4>
          ${row(
            field('cTermsUrl', 'Terms & Conditions URL', v('termsUrl'), { type: 'url' }) +
            field('cPrivacyUrl', 'Privacy Policy URL', v('privacyUrl'), { type: 'url' })
          )}
          ${row(
            field('cDpoName', 'Data Protection Officer', dpo.name || '') +
            field('cDpoEmail', 'DPO Email', dpo.email || '', { type: 'email' })
          )}

          <!-- ══════════════ 13. VISIBILITY ══════════════ -->
          <h4 class="form-section"><i class="fa-solid fa-eye"></i> Public Visibility</h4>
          <p style="font-size:.75rem;color:var(--text-secondary);margin:0 0 8px;">Which sections appear on the public portfolio site.</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin-bottom:12px;">
            <label style="display:flex;align-items:center;gap:8px;font-weight:400;cursor:pointer;font-size:.82rem;margin:0;">
              <input type="checkbox" id="cVisCertifications" ${(p.visibility?.certifications !== false) ? 'checked' : ''} style="width:auto;" />
              <span>Show certifications</span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;font-weight:400;cursor:pointer;font-size:.82rem;margin:0;">
              <input type="checkbox" id="cVisAwards" ${(p.visibility?.awards !== false) ? 'checked' : ''} style="width:auto;" />
              <span>Show awards</span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;font-weight:400;cursor:pointer;font-size:.82rem;margin:0;">
              <input type="checkbox" id="cVisBank" ${p.visibility?.bank ? 'checked' : ''} style="width:auto;" />
              <span>Show bank details</span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;font-weight:400;cursor:pointer;font-size:.82rem;margin:0;">
              <input type="checkbox" id="cVisContacts" ${(p.visibility?.contacts !== false) ? 'checked' : ''} style="width:auto;" />
              <span>Show contact info</span>
            </label>
          </div>

          <!-- ══════════════ 14. INTERNAL ══════════════ -->
          <h4 class="form-section"><i class="fa-solid fa-lock"></i> Internal Notes</h4>
          ${field('cInternalNotes', 'Internal Notes (never shown publicly)', v('internalNotes'), { textarea: true, rows: 3 })}

          <div class="form-actions" style="margin-top:20px;">
            <button type="button" class="btn btn-danger" id="cpResetBtn" title="Clear all profile data">
              <i class="fa-solid fa-eraser"></i> Reset
            </button>
            <button type="button" class="btn btn-outline" id="cancelProfileEdit">Cancel</button>
            <button type="submit" class="btn btn-success">
              <i class="fa-solid fa-check"></i> Save Profile
            </button>
          </div>
        </form>
      </div>`;

    document.body.appendChild(modal);

    /* ── Close handlers ── */
    modal.querySelector('#cancelProfileEdit').onclick = () => modal.remove();
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    /* ── Logo preview + upload ── */
    const logoFile = modal.querySelector('#cpLogoFile');
    const logoUrl = modal.querySelector('#cpLogoUrl');
    const logoPreview = modal.querySelector('#cpLogoPreview');
    const logoClearBtn = modal.querySelector('#cpLogoClearBtn');

    const applyLogoPreview = (url) => {
      if (url) {
        logoPreview.innerHTML = `<img src="${esc(url)}" alt="" style="width:100%;height:100%;object-fit:contain;" onerror="this.style.display='none';" />`;
        if (logoClearBtn) logoClearBtn.style.display = 'inline-flex';
      } else {
        logoPreview.innerHTML = '<i class="fa-solid fa-image" style="opacity:.4;color:var(--text-light);"></i>';
        if (logoClearBtn) logoClearBtn.style.display = 'none';
      }
    };

    modal.querySelector('#cpLogoPickBtn').onclick = () => logoFile.click();
    logoFile.onchange = (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (!f) return;
      if (!f.type.startsWith('image/')) { _toast('Please pick an image file.', 'error'); return; }
      if (f.size > 500 * 1024) { _toast('Logo too large (max 500 KB).', 'error'); return; }
      const r = new FileReader();
      r.onload = (ev) => {
        const dataUrl = ev.target.result;
        logoUrl.value = dataUrl;
        applyLogoPreview(dataUrl);
        _toast('Logo loaded — click Save to apply.', 'info');
      };
      r.readAsDataURL(f);
    };
    if (logoClearBtn) {
      logoClearBtn.onclick = () => {
        logoUrl.value = '';
        applyLogoPreview(null);
        logoFile.value = '';
      };
    }

    /* ── Reset button ── */
    modal.querySelector('#cpResetBtn').onclick = async () => {
      const ok = await (window.vioraConfirm
        ? window.vioraConfirm(
            'Clear ALL company profile data? This cannot be undone. Logo, bank details, hours, certifications will all be deleted.',
            { title: 'Reset profile', confirmLabel: 'Reset Everything', confirmClass: 'btn-danger', icon: 'fa-eraser' }
          )
        : Promise.resolve(confirm('Clear ALL company profile data?')));
      if (!ok) return;
      try {
        await remove(ref(db, P('companyProfile')));
        if (state) state.data.companyProfile = {};
        await _logAct('delete', 'Company profile reset', 'All fields cleared');
        _toast('Company profile cleared.', 'info');
        modal.remove();
        d.renderProfile?.();
      } catch (e) {
        _toast('Reset failed: ' + (e.message || 'unknown'), 'error');
      }
    };

    /* ── Submit ── */
    modal.querySelector('#companyProfileForm').addEventListener('submit', async e => {
      e.preventDefault();

      const val = (id) => {
        const el = modal.querySelector('#' + id);
        return el ? el.value.trim() : '';
      };
      const numVal = (id) => {
        const n = parseFloat(val(id));
        return Number.isFinite(n) ? n : 0;
      };
      const isChecked = (id) => {
        const el = modal.querySelector('#' + id);
        return el ? el.checked : false;
      };

      /* Basic validation */
      const name = val('cName');
      const email = val('cEmail');
      const phone = val('cPhone');
      if (!name) { _toast('Display name is required.', 'error'); return; }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { _toast('Primary email is not valid.', 'error'); return; }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { _toast('Primary email is not valid.', 'error'); return; }
      const supportEmail = val('cSupportEmail');
      const billingEmail = val('cBillingEmail');
      const dpoEmail = val('cDpoEmail');
      for (const [id, label, em] of [
        ['Support', 'Support email', supportEmail],
        ['Billing', 'Billing email', billingEmail],
        ['DPO', 'DPO email', dpoEmail],
      ]) {
        if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
          _toast(label + ' is not valid.', 'error'); return;
        }
      }

      /* Parse pipe-delimited arrays */
      const parseLines = (raw, fields) => {
        return raw.split('\n')
          .filter(l => l.trim())
          .map(line => {
            const parts = line.split('|').map(s => s.trim());
            const out = {};
            fields.forEach((f, i) => { out[f] = parts[i] || ''; });
            return out;
          });
      };

      const certs = parseLines(val('cCertificates'), [
        'title', 'issuer', 'issueDate', 'expiryDate', 'credentialId', 'description'
      ]).map(c => ({ ...c, type: 'cert', id: uid() }));

      const awards = parseLines(val('cAwards'), [
        'title', 'issuer', 'year', 'description'
      ]).map(a => ({ ...a, type: 'award', id: uid() }));

      const hours = {};
      parseLines(val('cHours'), ['day', 'open', 'close', 'closed']).forEach(row => {
        if (!row.day) return;
        hours[row.day] = {
          open: row.open || '',
          close: row.close || '',
          closed: row.closed === '1'
        };
      });

      /* Preserve any existing keys we don't explicitly edit. */
      const existing = state?.data?.companyProfile || {};
      const profile = {
        ...existing,   // ← preserves certificates/awards uploaded via uploadCertificate(),
                       //   and any other future fields

        /* Identity */
        name,
        legalName: val('cLegalName'),
        tradingName: val('cTradingName'),
        tagline: val('cTagline'),
        industry: val('cIndustry'),
        foundedDate: val('cFoundedDate'),
        description: val('cDescription'),
        about: val('cAbout'),

        /* Brand */
        logoUrl: logoUrl.value || '',
        monogram: val('cMonogram'),
        primaryColor: val('cPrimaryColor') || '#0a84ff',
        secondaryColor: val('cSecondaryColor') || '#22e6a0',

        /* Registration & tax */
        registrationNumber: val('cRegNo'),
        taxId: val('cTaxId'),
        kraPin: val('cKraPin'),
        vatNumber: val('cVatNumber'),
        vatRegistered: isChecked('cVatRegistered'),
        permitNumber: val('cPermitNumber'),
        permitExpiry: val('cPermitExpiry'),

        /* Contact */
        email,
        supportEmail: val('cSupportEmail'),
        billingEmail: val('cBillingEmail'),
        phone,
        phoneAlt: val('cPhoneAlt'),
        whatsapp: val('cWhatsApp'),
        phoneTollFree: val('cTollFree'),
        website: val('cWebsite'),

        /* Address */
        physicalAddress: val('cPhysicalAddress'),
        poBox: val('cPOBox'),
        postalCode: val('cPostalCode'),
        headquarters: val('cCity'),
        region: val('cRegion'),
        country: val('cCountry'),
        timezone: val('cTimezone') || 'Africa/Nairobi',
        geoLat: numVal('cGeoLat'),
        geoLng: numVal('cGeoLng'),

        /* Business details */
        employees: val('cEmployees'),
        annualTurnover: numVal('cAnnualTurnover'),
        defaultCurrency: val('cDefaultCurrency') || 'KES',
        fiscalYearEnd: val('cFiscalYearEnd'),
        languages: val('cLanguages').split(',').map(s => s.trim()).filter(Boolean),

        /* Social */
        social: {
          linkedin: val('cLinkedIn'),
          twitter: val('cTwitter'),
          facebook: val('cFacebook'),
          instagram: val('cInstagram'),
          youtube: val('cYouTube'),
          tiktok: val('cTikTok'),
        },

        /* Bank & M-Pesa */
        bank: {
          name: val('cBankName'),
          branch: val('cBankBranch'),
          accountName: val('cBankAccountName'),
          accountNumber: val('cBankAccountNumber'),
          swift: val('cBankSwift'),
          branchCode: val('cBankBranchCode'),
        },
        mpesa: {
          paybill: val('cMpesaPaybill'),
          till: val('cMpesaTill'),
          accountPrefix: val('cMpesaAccountPrefix'),
        },

        /* Hours */
        hours,

        /* Structured certifications & awards */
        certificates: certs,
        awards: awards,

        /* Legal */
        termsUrl: val('cTermsUrl'),
        privacyUrl: val('cPrivacyUrl'),
        dpo: {
          name: val('cDpoName'),
          email: val('cDpoEmail'),
        },

        /* Visibility */
        visibility: {
          certifications: isChecked('cVisCertifications'),
          awards: isChecked('cVisAwards'),
          bank: isChecked('cVisBank'),
          contacts: isChecked('cVisContacts'),
        },

        /* Internal */
        internalNotes: val('cInternalNotes'),

        /* Meta */
        updatedAt: new Date().toISOString(),
      };

      /* Save */
      try {
        await set(ref(db, P('companyProfile')), profile);
        if (state) state.data.companyProfile = profile;

        /* Keep logoUrl on the separate node in sync — that's what
           applyLogoEverywhere() reads */
        if (profile.logoUrl) {
          try { await set(ref(db, P('logoUrl')), profile.logoUrl); } catch (_) {}
        }

        modal.remove();
        await _logAct('edit', 'Company profile updated', profile.name);
        _toast('Company profile saved.', 'success');
        d.renderProfile?.();
        d.applyLogoEverywhere?.(profile.logoUrl);
      } catch (err) {
        console.error('[profile save]', err);
        _toast('Save failed: ' + (err.message || 'unknown error'), 'error');
      }
    });
  };

  Viora.uploadCertificate = function () {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.style.zIndex = '2000';
    modal.innerHTML = `
      <div class="modal" style="max-width:520px;">
        <h2><span class="modal-icon"><i class="fa-solid fa-certificate"></i></span> Upload Certificate / Award</h2>
        <label>Type *</label>
        <select id="certUploadType"><option value="cert">Certificate</option><option value="award">Award</option></select>
        <label>Title *</label>
        <input id="certUploadTitle" placeholder="e.g. ISO 27001 Certification" />
        <label>Issuer</label>
        <input id="certUploadIssuer" placeholder="e.g. ISO" />
        <label>Date</label>
        <input type="date" id="certUploadDate" />
        <label>Description</label>
        <textarea id="certUploadDesc" rows="2" placeholder="Optional description"></textarea>
        <label>File (image or PDF) *</label>
        <div class="doc-upload-zone" id="certUploadZone" style="padding:16px;"><i class="fa-solid fa-cloud-arrow-up" style="font-size:2rem;color:var(--accent-blue);"></i><div style="font-weight:600;margin-top:8px;font-size:.85rem;">Click or drag &amp; drop</div><div style="font-size:.7rem;color:var(--text-secondary);margin-top:2px;">Image or PDF · max 5 MB</div><input type="file" id="certUploadFile" accept="image/*,application/pdf" class="file-input-hidden" /></div>
        <div id="certUploadPreview" style="margin-top:10px;"></div>
        <div class="form-actions" style="margin-top:16px;"><button type="button" class="btn btn-outline" id="cancelCertUpload">Cancel</button><button type="button" class="btn btn-success" id="confirmCertUpload"><i class="fa-solid fa-check"></i> Upload</button></div>
      </div>`;
    document.body.appendChild(modal);
    let pendingFile = null;
    const zone = modal.querySelector('#certUploadZone');
    const fileInput = modal.querySelector('#certUploadFile');
    const preview = modal.querySelector('#certUploadPreview');
    zone.onclick = () => fileInput.click();
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor = 'var(--accent-blue)'; });
    zone.addEventListener('dragleave', () => { zone.style.borderColor = ''; });
    zone.addEventListener('drop', e => { e.preventDefault(); zone.style.borderColor = ''; const f = e.dataTransfer.files[0]; if (f) handleCertFile(f); });
    fileInput.addEventListener('change', e => { const f = e.target.files[0]; if (f) handleCertFile(f); e.target.value = ''; });
    function handleCertFile(f) {
      if (f.size > MAX_FILE_SIZE) { _toast('Max 5MB.', 'error'); return; }
      pendingFile = f;
      if (f.type.startsWith('image/')) {
        const r = new FileReader();
        r.onload = ev => { preview.innerHTML = `<img src="${ev.target.result}" style="max-width:100%;max-height:160px;border-radius:8px;border:1px solid var(--border-color);" />`; };
        r.readAsDataURL(f);
      } else {
        preview.innerHTML = `<div style="padding:10px;background:var(--bg-input);border-radius:8px;">📎 ${escapeHtml(f.name)} (${fmtBytes(f.size)})</div>`;
      }
    }
    modal.querySelector('#cancelCertUpload').onclick = () => modal.remove();
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    modal.querySelector('#confirmCertUpload').onclick = async () => {
      const type = modal.querySelector('#certUploadType').value;
      const title = modal.querySelector('#certUploadTitle').value.trim();
      const issuer = modal.querySelector('#certUploadIssuer').value.trim();
      const date = modal.querySelector('#certUploadDate').value;
      const description = modal.querySelector('#certUploadDesc').value.trim();
      if (!title) { _toast('Title required.', 'error'); return; }
      if (!pendingFile) { _toast('Please select a file.', 'error'); return; }
      const reader = new FileReader();
      reader.onload = async ev => {
        const fileData = ev.target.result;
        const profile = { ...(state?.data?.companyProfile || {}) };
        if (!Array.isArray(profile.certificates)) profile.certificates = [];
        if (!Array.isArray(profile.awards)) profile.awards = [];
            const item = {
          id: uid(),
          title,
          issuer,
          date,                                   // legacy — kept for compat
          issueDate: date,                         // ★ new canonical field
          expiryDate: '',                          // ★ set via profile editor
          credentialId: '',                        // ★ set via profile editor
          description,
          type,
          fileData,
          fileName: pendingFile.name,
          mime: pendingFile.type,
          size: pendingFile.size,
          uploadedAt: new Date().toISOString()
        };
        if (type === 'award') profile.awards.push(item);
        else profile.certificates.push(item);
        profile.updatedAt = new Date().toISOString();
        await set(ref(db, P('companyProfile')), profile);
        if (state) state.data.companyProfile = profile;
        modal.remove();
        await _logAct('upload', `${type === 'award' ? 'Award' : 'Certificate'} uploaded`, title);
        _toast(`${type === 'award' ? 'Award' : 'Certificate'} uploaded.`, 'success');
        d.renderProfile?.();
      };
      reader.readAsDataURL(pendingFile);
    };
  };

  Viora.viewProfileDoc = function (idx) {
    const p = state?.data?.companyProfile || {};
    const items = [...(p.certificates || []), ...(p.awards || [])];
    const item = items[idx];
    if (!item || !item.fileData) return;
    const w = window.open();
    if (!w) { _toast('Pop-up blocked.', 'warning'); return; }
    if ((item.mime || '').startsWith('image/')) {
      w.document.write(`<title>${escapeHtml(item.title)}</title><img src="${item.fileData}" style="max-width:100%;" />`);
    } else {
      w.document.write(`<title>${escapeHtml(item.title)}</title><iframe src="${item.fileData}" style="border:0;position:fixed;inset:0;width:100%;height:100%;"></iframe>`);
    }
  };

  Viora.deleteProfileItem = async function (type, idx) {
    const p = { ...(state?.data?.companyProfile || {}) };
    const list = type === 'award' ? (p.awards || []) : (p.certificates || []);
    if (idx < 0 || idx >= list.length) return;
    if (!confirm(`Delete "${list[idx].title}"?`)) return;
    const removed = list.splice(idx, 1)[0];
    if (type === 'award') p.awards = list;
    else p.certificates = list;
    p.updatedAt = new Date().toISOString();
    await set(ref(db, P('companyProfile')), p);
    if (state) state.data.companyProfile = p;
    await _logAct('delete', `${type === 'award' ? 'Award' : 'Certificate'} deleted`, removed.title);
    _toast('Deleted.', 'info');
    d.renderProfile?.();
  };

  /* ═══════════════════════════════════════════════════════════
     DEALS
     ═══════════════════════════════════════════════════════════ */
  Viora.addDeal = function () {
    if (!getClients().length) { _toast('Add a client first.', 'error'); return; }
    $('dealModalTitle').textContent = 'New Deal';
    $('editDealId').value = '';
    $('dealForm').reset();
    $('dealClient').innerHTML = getClients().map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    _openModal('dealModal');
  };

  Viora.editDeal = function (id) {
    const deal = (state?.data?.deals || []).find(x => x.id === id);
    if (!deal) return;
    $('dealModalTitle').textContent = 'Edit Deal';
    $('editDealId').value = id;
    $('dealClient').innerHTML = getClients().map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    $('dealTitle').value = deal.title || '';
    $('dealClient').value = deal.clientId || '';
    $('dealValue').value = deal.value || 0;
    $('dealStage').value = deal.stage || 'Quote Sent';
    $('dealTerms').value = deal.terms || 'Net 30';
    $('dealOwner').value = deal.owner || '';
    $('dealSource').value = deal.source || 'Website';
    $('dealNotes').value = deal.notes || '';
    _openModal('dealModal');
  };

  Viora.saveDeal = async function (f) {
    const id = $('editDealId').value;
    const client = getClient(f.clientId);
    const existing = id ? (state?.data?.deals || []).find(x => x.id === id) : null;
    const p = {
      title: f.title,
      clientId: f.clientId,
      clientName: client ? client.name : '',
      value: f.value,
      stage: f.stage,
      terms: f.terms,
      owner: f.owner,
      source: f.source,
      notes: f.notes,
      autoGenerated: existing?.autoGenerated || false,
      id: id || uid(),
      createdAt: id ? existing?.createdAt : new Date().toISOString()
    };
    try {
      await upsertDoc('deals', p, existing?._rev);
    } catch (e) {
      if (e.message === 'CONFLICT_ABORTED') return;
      _toast('Save failed: ' + e.message, 'error');
      return;
    }
    await _logAct(id ? 'edit' : 'add', id ? 'Deal updated' : 'Deal created', p.title);
    if (!id && p.stage === 'Won') {
      await d.autoSpawnProjectAndInvoice?.(p);
      await _logAct('edit', 'Deal Won → auto-spawned downstream');
      _toast('Deal Won → downstream records created!', 'success');
    }
    _toast('Deal saved.', 'success');
    _closeModal('dealModal');
    if (typeof renderAll === 'function') renderAll();
  };

  Viora.markDealWon = async function (id) {
    const deal = (state?.data?.deals || []).find(x => x.id === id);
    if (!deal) return;
    if (!confirm(`Mark "${deal.title}" as WON?`)) return;
    deal.stage = 'Won';
    await upsertDoc('deals', deal, deal._rev);
    await d.autoSpawnProjectAndInvoice?.(deal);
    await _logAct('edit', 'Deal Won', `${deal.title}`);
    _toast('Deal Won.', 'success');
    if (typeof renderAll === 'function') renderAll();
  };

  Viora.deleteDeal = async function (id) {
    const deal = (state?.data?.deals || []).find(x => x.id === id);
    if (!deal || !confirm('Delete this deal?')) return;
    await deleteDoc('deals', id);
    await _logAct('delete', 'Deal deleted', deal.title);
    _toast('Deal deleted.', 'info');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  Viora.kanbanDragStart = function (ev) {
    const id = ev.target.dataset.dealId;
    ev.dataTransfer.setData('text/plain', id);
    ev.target.classList.add('dragging');
  };

  Viora.kanbanDragOver  = function (ev) { ev.preventDefault(); ev.currentTarget.classList.add('dragover'); };
  Viora.kanbanDragLeave = function (ev) { ev.currentTarget.classList.remove('dragover'); };

  Viora.kanbanDrop = async function (ev) {
    ev.preventDefault();
    ev.currentTarget.classList.remove('dragover');
    const dealId = ev.dataTransfer.getData('text/plain');
    const stage = ev.currentTarget.dataset.stage;
    const deal = (state?.data?.deals || []).find(x => x.id === dealId);
    if (!deal || deal.stage === stage) return;
    deal.stage = stage;
    await upsertDoc('deals', deal, deal._rev);
    if (stage === 'Won') await d.autoSpawnProjectAndInvoice?.(deal);
    await _logAct('edit', 'Deal moved', `${deal.title} → ${stage}`);
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  /* ═══════════════════════════════════════════════════════════
     CONTRACTS
     ═══════════════════════════════════════════════════════════ */
  Viora.addContract = function () {
    if (!getClients().length) { _toast('Add a client first.', 'error'); return; }
    $('contractModalTitle').textContent = 'New Contract';
    $('editContractId').value = '';
    $('contractForm').reset();
    $('contractStart').value = todayStr();
    $('contractClient').innerHTML = getClients().map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    $('contractDeal').innerHTML = '<option value="">— None —</option>' +
      (state?.data?.deals || []).map(d => `<option value="${d.id}">${escapeHtml(d.title)}</option>`).join('');
    _openModal('contractModal');
  };

  Viora.editContract = function (id) {
    const c = (state?.data?.contracts || []).find(x => x.id === id);
    if (!c) return;
    $('contractModalTitle').textContent = 'Edit Contract';
    $('editContractId').value = id;
    $('contractTitle').value = c.title || '';
    $('contractClient').innerHTML = getClients().map(cl => `<option value="${cl.id}">${escapeHtml(cl.name)}</option>`).join('');
    $('contractClient').value = c.clientId || '';
    $('contractDeal').innerHTML = '<option value="">— None —</option>' +
      (state?.data?.deals || []).map(d => `<option value="${d.id}">${escapeHtml(d.title)}</option>`).join('');
    $('contractDeal').value = c.dealId || '';
    $('contractStart').value = c.startDate || '';
    $('contractExpiry').value = c.expiryDate || '';
    $('contractValue').value = c.value || 0;
    $('contractStatus').value = c.status || 'Draft';
    $('contractSla').value = c.sla || '';
    _openModal('contractModal');
  };

  Viora.saveContract = async function (f) {
    const id = $('editContractId').value;
    const client = getClient(f.clientId);
    const existing = id ? (state?.data?.contracts || []).find(x => x.id === id) : null;
    const p = {
      ...f,
      clientName: client ? client.name : '',
      id: id || uid(),
      createdAt: id ? existing?.createdAt : new Date().toISOString()
    };
    try {
      await upsertDoc('contracts', p, existing?._rev);
    } catch (e) {
      if (e.message === 'CONFLICT_ABORTED') return;
      _toast('Save failed: ' + e.message, 'error');
      return;
    }
    await _logAct(id ? 'edit' : 'add', id ? 'Contract updated' : 'Contract created', p.title);
    _toast('Contract saved.', 'success');
    _closeModal('contractModal');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  Viora.deleteContract = async function (id) {
    const c = (state?.data?.contracts || []).find(x => x.id === id);
    if (!c || !confirm('Delete this contract?')) return;
    await deleteDoc('contracts', id);
    await _logAct('delete', 'Contract deleted', c.title);
    _toast('Contract deleted.', 'info');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  /* ═══════════════════════════════════════════════════════════
     CLIENTS
     ═══════════════════════════════════════════════════════════ */
  Viora.addClient = function () {
    $('clientModalTitle').textContent = 'New Client';
    $('editClientId').value = '';
    $('clientForm').reset();
    const _cf = $('clientCaseFees');           if (_cf) _cf.value = 0;
    const _ic = $('clientInstallmentCount');   if (_ic) _ic.value = 0;
    const _ie = $('installmentEditor');        if (_ie) { _ie.style.display = 'none'; _ie.innerHTML = ''; }
    if (state) state.pendingInstallments = null;
    if (state) state.pendingClientAvatar = null;
    if (state) state._clientDraft = null;
    const feeHost = $('clientProjectsFeeEditor'); if (feeHost) feeHost.innerHTML = '';
    if (typeof renderClientAvatarPreview === 'function') renderClientAvatarPreview();

    /* ★ v9.2 — reset the inline project repeater for a new client */
    try { window.__vioraClientProjects?.resetForNew?.(); } catch (e) { console.warn('[client-repeater]', e); }

    _openModal('clientModal');
  };

  Viora.editClient = function (id) {
    const c = getClient(id);
    if (!c) return;

    setTimeout(() => {
      const btn = document.getElementById('clientSendWelcomeBtn');
      if (btn) btn.style.display = c.email ? 'inline-flex' : 'none';
    }, 50);

    $('clientModalTitle').textContent = 'Edit Client';
    $('editClientId').value = id;
    $('clientName').value = c.name || '';
    $('clientEmail').value = c.email || '';
    $('clientPhone').value = c.phone || '';
    $('clientPhoneAlt').value = c.phoneAlt || '';
    $('clientCompany').value = c.company || '';
    $('clientAddress').value = c.address || '';
    $('clientCity').value = c.city || '';
    $('clientType').value = c.clientType || 'Enterprise';

    if (state) state.pendingInstallments = null;
    if (state) state.pendingClientAvatar = null;
    if (typeof renderClientAvatarPreview === 'function') renderClientAvatarPreview();

    const _cf = $('clientCaseFees');         if (_cf) _cf.value = getClientAgreedTotal(id);
    const _ic = $('clientInstallmentCount'); if (_ic) _ic.value = 0;
    const _ie = $('installmentEditor');      if (_ie) { _ie.style.display = 'none'; _ie.innerHTML = ''; }

      if (state) state.editingClientId = id;
    if (typeof renderClientProjectsFeeEditor === 'function') renderClientProjectsFeeEditor(id);

    /* ★ v9.2 — pre-populate the inline project repeater */
    try { window.__vioraClientProjects?.loadForClient?.(id); } catch (e) { console.warn('[client-repeater]', e); }

    _openModal('clientModal');
  };

  Viora.saveClient = async function (f) {
    const id = $('editClientId').value;
    const existing = id ? getClient(id) : null;
    let avatar = existing?.avatar || null;
    if (state?.pendingClientAvatar === '__CLEAR__') avatar = null;
    else if (state?.pendingClientAvatar) avatar = state.pendingClientAvatar;

    const p = {
      id: id || uid(),
      type: 'client',
      name: f.name,
      email: f.email,
      phone: f.phone,
      phoneAlt: f.phoneAlt,
      company: f.company,
      address: f.address,
      city: f.city,
      clientType: f.clientType,
      documents: existing?.documents || [],
      avatar,
      clientId: existing?.clientId || ('CL-' + uid().slice(-6).toUpperCase()),
      sourceLeadId: existing?.sourceLeadId || null,
      updatedAt: new Date().toISOString(),
      createdAt: id ? existing?.createdAt : new Date().toISOString()
    };

    try {
      await upsertDoc('entities', p, existing?._rev);
    } catch (e) {
      if (e.message === 'CONFLICT_ABORTED') return;
      _toast('Save failed: ' + e.message, 'error');
      return;
    }
    await _logAct(id ? 'edit' : 'add', id ? 'Client updated' : 'Client added', p.name);

    /* ★ v9.2 — Persist each inline-drafted project */
    try {
      const draft = window.__vioraClientProjects?.getDraft?.() || [];
      let createdCount = 0;
      let updatedCount = 0;

      for (const proj of draft) {
        if (!proj.title || !String(proj.title).trim()) continue;

        const isNew = !proj.id;
        const projectId = proj.id || uid();
        const projectNumber = (proj.projectNumber || '').trim() || `PRJ-${projectId.slice(0, 6)}`;
        const startDate = proj.startDate || dateToStr(new Date());
        const deadline = proj.deadline || dateToStr(new Date(Date.now() + 90 * 86400000));
        const agreedTotal = Math.max(0, Number(proj.agreedTotal) || 0);

        // If the operator didn't touch installments, seed a single "Full amount" installment
        let installments = Array.isArray(proj.installments) ? proj.installments.slice() : [];
        if (!installments.length && agreedTotal > 0) {
          installments = [{
            id: uid(),
            label: 'Full amount',
            amount: agreedTotal,
            dueDate: dateToStr(new Date(Date.now() + 30 * 86400000)),
            paid: false, paidDate: null, partialPaid: 0
          }];
        }

        const record = {
          id: projectId,
          clientId: p.id,
          projectNumber,
          title: String(proj.title).trim(),
          serviceArea: proj.serviceArea || 'Other',
          platform: proj.platform || 'AWS',
          startDate,
          deadline,
          status: proj.status || 'active',
          progress: Number(proj.progress) || 0,
          agreedTotal,
          installments,
          description: '',
          createdAt: isNew ? new Date().toISOString() : (getProject?.(projectId)?.createdAt || new Date().toISOString()),
          updatedAt: new Date().toISOString()
        };

        try {
          await upsertDoc('projects', record, isNew ? null : getProject?.(projectId)?._rev);
          if (isNew) {
            createdCount++;
            try { d.EventBus?.emit?.('projects.created', record, projectId, record, { source: 'client-modal', collection: 'projects' }); } catch (_) {}
          } else {
            updatedCount++;
          }
          try { if (typeof recomputeProjectProgress === 'function') await recomputeProjectProgress(projectId); } catch (_) {}
        } catch (err) {
          console.warn('[client-modal] project save failed', err);
        }
      }

      if (createdCount || updatedCount) {
        _toast(`${createdCount} project(s) created, ${updatedCount} updated.`, 'success');
      }

      // Anything removed from the draft array while editing should be deleted
      if (id) {
        const draftIds = new Set(draft.filter(pr => pr.id).map(pr => pr.id));
        const orphaned = (state.data.projects || []).filter(pr => pr.clientId === id && !draftIds.has(pr.id));
        for (const pr of orphaned) {
          try { await deleteDoc('projects', pr.id, false); } catch (_) {}
        }
      }
    } catch (e) {
      console.warn('[client-modal] project cascade failed', e);
    }

    if (state) {
      state.pendingInstallments = null;
      state.pendingClientAvatar = null;
      state._clientDraft = null;
      state._clientProjectDraft = null;   // ★ clear the repeater
    }
      _toast('Client saved.', 'success');
    _closeModal('clientModal');
    if (typeof renderActiveTab === 'function') renderActiveTab();
    d.publishClientsToPublicSite?.();

    /* ★ v9.4 — Force the sidebar counter to recompute immediately. */
    try {
      if (typeof updateSidebarCounters === 'function') updateSidebarCounters(true);
    } catch (_) {}

    const wasNew = !id;
    const live = getClient(p.id);
    if (wasNew && p.email && live && !live._welcomeSent) {
      setTimeout(() => {
        const active = document.querySelector('.modal-overlay.active');
        if (active && active.id !== 'clientModal') {
          console.info('[welcome preview] skipped — another modal is open');
          return;
        }
        try { openWelcomeEmailPreview(p.id); }
        catch (e) { console.warn('[welcome preview] failed', e); }
      }, 400);
    }
  };

  /* Mirror a document into the owning client's documents[] array
     so every file — no matter which uploader created it — shows up
     in Client 360 and the client modal's docs grid. */
  Viora.mirrorDocToClient = async function (doc, explicitClientId) {
    if (!doc || !doc.id) return;
    let clientId = explicitClientId || null;

    if (!clientId) {
      // parentId may point at a client directly
      if (doc.parentId) {
        const c = (state?.data?.entities || []).find(
          e => e && e.id === doc.parentId && e.type === 'client'
        );
        if (c) clientId = c.id;
        else {
          // or at a project → resolve the project's clientId
          const proj = (state?.data?.projects || []).find(p => p && p.id === doc.parentId);
          if (proj && proj.clientId) clientId = proj.clientId;
        }
      }
    }
    if (!clientId) return;

    const client = getClient(clientId);
    if (!client) return;

    if (!Array.isArray(client.documents)) client.documents = [];
    if (client.documents.some(d => d && d.id === doc.id)) return;

    client.documents.push({
      id: doc.id,
      title: doc.title || doc.fileName || 'Document',
      fileName: doc.fileName || '',
      mime: doc.mime || '',
      size: doc.size || 0,
      data: doc.data || '',
      category: doc.category || 'Document',
      uploadedAt: doc.uploadedAt || new Date().toISOString(),
      parentId: doc.parentId || null,
      parentName: doc.parentName || ''
    });

    try {
      await upsertDoc('entities', client, client._rev);
    } catch (e) {
      console.warn('[mirrorDocToClient] write failed', e);
    }
    try { if (typeof renderActiveTab === 'function') renderActiveTab(); } catch (_) {}
  };



  Viora.saveClientProjectAgreements = async function (clientId) {
    const projects = getClientProjects(clientId);
    if (!projects.length) { _toast('No projects to update.', 'info'); return; }
    let changed = 0;
    for (const p of projects) {
      const input = document.querySelector(`.proj-agreed-input[data-project-id="${p.id}"]`);
      if (!input) continue;
      const newAgreed = Math.max(0, parseFloat(input.value) || 0);
      const oldAgreed = getProjectAgreedTotal(p.id);
      if (Math.abs(newAgreed - oldAgreed) < 0.01) continue;

      if (!p.installments || !p.installments.length) {
        p.installments = [{
          id: uid(),
          label: 'Full amount',
          amount: newAgreed,
          dueDate: dateToStr(new Date(Date.now() + 30 * 86400000)),
          paid: false, paidDate: null
        }];
      } else if (p.installments.length === 1) {
        p.installments[0].amount = newAgreed;
      } else {
        const oldSum = p.installments.reduce((s, i) => s + Number(i.amount || 0), 0);
        if (oldSum > 0) {
          const factor = newAgreed / oldSum;
          p.installments.forEach(i => { i.amount = Math.round(Number(i.amount || 0) * factor * 100) / 100; });
        }
      }
      p.agreedTotal = newAgreed;
      p._updatedAt = new Date().toISOString();
      try { await upsertDoc('projects', p, p._rev); changed++; } catch (_) {}
      try { await recomputeProjectProgress(p.id); } catch (_) {}
    }
    if (changed) {
      const live = getClient(clientId);
      if (live) {
        live.caseFees = getClientAgreedTotal(clientId);
        try { await upsertDoc('entities', live, live._rev); } catch (_) {}
        try { EventBus.emit('entities.upsert', live, live.id, live, { collection: 'entities', source: 'saveClientProjectAgreements' }); } catch (_) {}
      }
      _toast(`Updated ${changed} project agreement(s).`, 'success');
      if (typeof renderClients === 'function') renderClients();
      if (typeof renderClientProjectsFeeEditor === 'function') renderClientProjectsFeeEditor(clientId);
    } else {
      _toast('No changes.', 'info');
    }
  };

  Viora.addProjectFromClientEditor = async function (clientId) {
    const existingClient = getClient(clientId);
    if (state) state._clientDraft = {
      clientId,
      isNew: !existingClient,
      name: $('clientName')?.value || '',
      email: $('clientEmail')?.value || '',
      phone: $('clientPhone')?.value || '',
      phoneAlt: $('clientPhoneAlt')?.value || '',
      company: $('clientCompany')?.value || '',
      address: $('clientAddress')?.value || '',
      city: $('clientCity')?.value || '',
      type: $('clientType')?.value || 'Enterprise',
      avatar: state.pendingClientAvatar || null
    };
    _closeModal('clientModal');
    Viora.addProject();
    setTimeout(() => {
      const sel = $('projectClient');
      if (sel) sel.value = clientId;
    }, 120);
  };

  Viora.deleteClient = async function (id) {
    const c = getClient(id);
    if (!c) return;
    if (!confirm(`Delete "${c.name}"?\n\nThis will also remove:\n• Projects, work logs, invoices, appointments, presentations\n• The linked Lead (if any)\n• Marketplace leads + orders tied to their email\n\nThis cannot be undone.`)) return;
    const clientEmail = normalizeEmail(c.email);
    const pids = (state?.data?.projects || []).filter(p => p.clientId === id).map(p => p.id);
    for (const pid of pids) await deleteDoc('projects', pid);
    for (const w of (state?.data?.worklogs || []).filter(w => pids.includes(w.projectId))) await deleteDoc('worklogs', w.id);
    for (const inv of (state?.data?.invoices || []).filter(i => i.clientId === id)) await deleteDoc('invoices', inv.id);
    for (const a of (state?.data?.appointments || []).filter(x => x.clientId === id)) await deleteDoc('appointments', a.id);
    for (const pr of (state?.data?.presentations || []).filter(x => x.clientId === id)) await deleteDoc('presentations', pr.id);
    const linkedLeads = (state?.data?.leads || []).filter(l => l.sourceLeadId === id || l.id === c.sourceLeadId || (clientEmail && normalizeEmail(l.email) === clientEmail));
    for (const l of linkedLeads) {
      try { await remove(ref(db, `${P('leads')}/${l.id}`)); } catch (_) {}
      if (state) state.data.leads = (state.data.leads || []).filter(x => x.id !== l.id);
    }
    if (clientEmail) {
      const mls = (state?.data?.marketLeads || []).filter(m => normalizeEmail(m.email) === clientEmail);
      for (const m of mls) { try { await remove(ref(db, `${P('marketLeads')}/${m.id}`)); } catch (_) {} }
      if (state) state.data.marketLeads = (state.data.marketLeads || []).filter(m => normalizeEmail(m.email) !== clientEmail);
      const matchingOrders = (state?.data?.orders || []).filter(o => normalizeEmail(o.customerEmail) === clientEmail);
      for (const o of matchingOrders) {
        try { await remove(ref(db, `${P('orders')}/${o.id}`)); }
        catch (_) {
          try { await set(ref(db, `${P('orders')}/${o.id}`), { ...o, paymentStatus: 'refunded', deletedAt: new Date().toISOString(), deletedByName: state?.operator?.name || 'System', _rev: uid(), _updatedAt: new Date().toISOString() }); } catch (_) {}
        }
      }
      if (state) state.data.orders = (state.data.orders || []).filter(o => normalizeEmail(o.customerEmail) !== clientEmail);
    }
    try { await remove(ref(db, `${P('entities')}/${id}`)); }
    catch (_) { await deleteDoc('entities', id); }
    if (state) state.data.entities = (state.data.entities || []).filter(e => e.id !== id);
    if (clientEmail && state) {
      const deleted = state.data.deletedMarketEmails || [];
      if (!deleted.includes(clientEmail)) deleted.push(clientEmail);
      state.data.deletedMarketEmails = deleted;
      try { await set(ref(db, P('marketplace/deletedEmails')), deleted); } catch (_) {}
    }
    await _logAct('delete', 'Client deleted (with cascade)', `${c.name} — lead + marketplace records removed`);
     _toast('Client and all linked records deleted.', 'info');
    if (typeof renderAll === 'function') renderAll();
    d.publishClientsToPublicSite?.();

    /* ★ v9.4 — Force the sidebar counter to recompute immediately. */
    try {
      if (typeof updateSidebarCounters === 'function') updateSidebarCounters(true);
    } catch (_) {}
  };

   /* ── Client Documents modal (folder icon on client tiles) ── */
  Viora.openClientDocs = function (cid) {
    const client = getClient(cid);
    if (!client) { _toast('Client not found.', 'error'); return; }

    const nameEl = $('clientDocsName');
    if (nameEl) nameEl.textContent = client.name || '—';

    const modal = document.getElementById('clientDocsModal');
    if (modal) modal.dataset.clientId = cid;

    Viora._renderClientDocsGrid(cid);
    _openModal('clientDocsModal');
  };

  Viora._renderClientDocsGrid = function (cid) {
    const grid = $('clientDocsGrid');
    if (!grid) return;
    const client = getClient(cid);
    const docs = Array.isArray(client?.documents) ? client.documents : [];

    if (!docs.length) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:24px;text-align:center;color:var(--text-secondary);">No documents yet. Drop a file above to add one.</div>';
      return;
    }

    grid.innerHTML = docs.map((d, i) => {
      const icon = (d.mime || '').startsWith('image/') ? 'fa-file-image'
                 : d.mime === 'application/pdf'              ? 'fa-file-pdf'
                 : (d.mime || '').startsWith('video/')       ? 'fa-file-video'
                 : (d.mime || '').startsWith('audio/')       ? 'fa-file-audio'
                 : 'fa-file';
      const bytes = fmtBytes ? fmtBytes(d.size) : (d.size || 0) + ' B';
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg-card-solid);border:1px solid var(--border-color);border-radius:10px;">
        <i class="fa-solid ${icon}" style="color:var(--accent-blue);font-size:1.1rem;"></i>
        <div style="flex:1;min-width:0;">
          <div style="font-size:.85rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(d.fileName || d.title || '')}">
            ${escapeHtml(d.title || d.fileName || 'Untitled')}
          </div>
          <div style="font-size:.7rem;color:var(--text-secondary);">
            ${escapeHtml(d.category || 'Document')} · ${bytes}
            ${d.uploadedAt ? ' · ' + timeAgo(d.uploadedAt) : ''}
          </div>
        </div>
        ${d.data ? `<button class="btn btn-primary btn-xs" onclick="Viora.viewClientDoc('${q(cid)}','${q(d.id)}')" title="View"><i class="fa-solid fa-eye"></i></button>` : ''}
        ${d.data ? `<button class="btn btn-success btn-xs" onclick="Viora.downloadClientDoc('${q(cid)}','${q(d.id)}')" title="Download"><i class="fa-solid fa-download"></i></button>` : ''}
        <button class="btn btn-danger btn-xs" onclick="Viora.deleteClientDoc('${q(cid)}','${q(d.id)}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
      </div>`;
    }).join('');
  };

  Viora.viewClientDoc = function (cid, docId) {
    const client = getClient(cid);
    const doc = (client?.documents || []).find(d => d && d.id === docId);
    if (!doc || !doc.data) { _toast('Document has no preview data.', 'warning'); return; }
    const w = window.open();
    if (!w) { _toast('Pop-up blocked.', 'warning'); return; }
    const title = escapeHtml(doc.title || doc.fileName || 'Document');
    const mime = String(doc.mime || '');
    if (mime.startsWith('image/')) {
      w.document.write(`<title>${title}</title><img src="${doc.data}" style="max-width:100%;" />`);
    } else if (mime === 'application/pdf') {
      w.document.write(`<title>${title}</title><iframe src="${doc.data}" style="border:0;position:fixed;inset:0;width:100%;height:100%;"></iframe>`);
    } else if (mime.startsWith('text/') || /\.(txt|md|csv)$/i.test(doc.fileName || '')) {
      try {
        const b64 = doc.data.split(',')[1] || '';
        const text = atob(b64);
        w.document.write(`<title>${title}</title><pre style="white-space:pre-wrap;padding:20px;font-family:ui-monospace,Menlo,monospace;">${escapeHtml(text)}</pre>`);
      } catch (_) { w.close(); _toast('Could not decode text file.', 'error'); }
    } else {
      w.close();
      _toast('Preview not available — use Download.', 'info');
    }
  };

  Viora.downloadClientDoc = function (cid, docId) {
    const client = getClient(cid);
    const doc = (client?.documents || []).find(d => d && d.id === docId);
    if (!doc || !doc.data) { _toast('No file data to download.', 'warning'); return; }
    const a = document.createElement('a');
    a.href = doc.data;
    a.download = doc.fileName || doc.title || 'document';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  Viora.deleteClientDoc = async function (cid, docId) {
    const client = getClient(cid);
    if (!client) return;
    if (!confirm('Delete this document?')) return;
    client.documents = (client.documents || []).filter(d => d && d.id !== docId);
    try {
      await upsertDoc('entities', client, client._rev);
      await _logAct('delete', 'Client document deleted', client.name || '');
      _toast('Document deleted.', 'info');
      Viora._renderClientDocsGrid(cid);
    } catch (e) {
      _toast('Delete failed: ' + (e.message || 'unknown'), 'error');
    }
  };
  
  Viora.uploadClientDoc = function (cid, file) {
    if (!file) return;
    const MAX = 5 * 1024 * 1024;
    if (file.size > MAX) { _toast('File too large (max 5 MB).', 'error'); return; }
    const client = getClient(cid);
    if (!client) { _toast('Client not found.', 'error'); return; }

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const doc = {
          id: uid(),
          title: file.name,
          fileName: file.name,
          mime: file.type || 'application/octet-stream',
          size: file.size,
          data: ev.target.result,
          category: 'Client Document',
          uploadedAt: new Date().toISOString()
        };
        if (!Array.isArray(client.documents)) client.documents = [];
        client.documents.push(doc);
        await upsertDoc('entities', client, client._rev);
        await _logAct('upload', 'Client document uploaded', `${client.name} — ${file.name}`);
        _toast('Document uploaded.', 'success');
        Viora._renderClientDocsGrid(cid);
      } catch (e) {
        _toast('Upload failed: ' + (e.message || 'unknown'), 'error');
      }
    };
    reader.onerror = () => _toast('Could not read file.', 'error');
    reader.readAsDataURL(file);
  };
  Viora.client360          = (id)  => { try { openClient360(id); } catch (_) {} };
  Viora.openClient360      = (id)  => { try { openClient360(id); } catch (_) {} };

  /* ═══════════════════════════════════════════════════════════
     PROJECTS
     ═══════════════════════════════════════════════════════════ */
  Viora.addProject = function () {
    if (!getClients().length) { _toast('Add a client first.', 'error'); return; }
    $('projectModalTitle').textContent = 'New Project';
    $('editProjectId').value = '';
    $('editProjectRev').value = '';
    $('projectForm').reset();

    if (state) state._projectTasksDraft = [];
    if (typeof renderProjectTasksEditor === 'function') renderProjectTasksEditor();

    $('projectClient').innerHTML = getClients().map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

    const year = new Date().getFullYear();
    const count = (state?.data?.projects || []).filter(p => p.projectNumber && p.projectNumber.startsWith(String(year))).length;
    const autoNumber = `${year}/${String(count + 1).padStart(3, '0')}`;
    if ($('projectNumber')) $('projectNumber').value = autoNumber;
    if ($('projectStartDate')) $('projectStartDate').value = todayStr();
    if ($('projectProgress')) $('projectProgress').value = 0;
    if ($('projectStatus')) $('projectStatus').value = 'active';

    const totalEl = $('projectAgreedTotal'); if (totalEl) totalEl.value = '';
    const cntEl = $('projectInstallmentCount'); if (cntEl) cntEl.value = '';
    const ed = $('projectInstallmentEditor'); if (ed) { ed.style.display = 'none'; ed.innerHTML = ''; }
    if (state) state.pendingProjectInstallments = null;

    if (state) state._projectTasksDraft = [];
    if (typeof renderProjectTasksEditor === 'function') renderProjectTasksEditor();

    _openModal('projectModal');
  };

  Viora.editProject = function (id) {
    const p = getProject(id);
    if (!p) return;
    $('projectModalTitle').textContent = 'Edit Project';
    $('editProjectId').value = id;
    $('editProjectRev').value = p._rev || '';
    $('projectClient').innerHTML = getClients().map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    $('projectClient').value = p.clientId;
    $('projectNumber').value = p.projectNumber || '';
    $('projectTitle').value = p.title || '';
    $('projectServiceArea').value = p.serviceArea || 'Other';
    $('projectPlatform').value = p.platform || 'AWS';
    $('projectClientRep').value = p.clientRep || '';
    $('projectLead').value = p.projectLead || '';
    $('projectStartDate').value = p.startDate || '';
    $('projectDeadline').value = p.deadline || '';
    $('projectNextMilestone').value = p.nextMilestone || '';
    $('projectProgress').value = p.progress || 0;
    $('projectStatus').value = p.status || 'active';
    $('projectDesc').value = p.description || '';
    const agreed = getProjectAgreedTotal(p.id);
    const insts = Array.isArray(p.installments) ? p.installments.slice() : [];
    if ($('projectAgreedTotal')) $('projectAgreedTotal').value = agreed;
    if ($('projectInstallmentCount')) $('projectInstallmentCount').value = insts.length;
    if (state) state.pendingProjectInstallments = insts.length ? insts : null;
    if (insts.length) {
      if (typeof renderProjectInstallmentEditor === 'function') renderProjectInstallmentEditor(insts);
    } else {
      const ed = $('projectInstallmentEditor'); if (ed) { ed.style.display = 'none'; ed.innerHTML = ''; }
    }
    if (state) state._projectTasksDraft = (state?.data?.tasks || [])
      .filter(t => t.projectId === id)
      .map(t => ({
        id: t.id,
        title: t.title || '',
        dueDate: t.dueDate || '',
        priority: t.priority || 'medium',
        status: t.status || 'pending'
      }));
    if (typeof renderProjectTasksEditor === 'function') renderProjectTasksEditor();
    _openModal('projectModal');
  };

  Viora.saveProject = async function (f) {
    const id = $('editProjectId').value;
    const existing = id ? getProject(id) : null;
    const isNew = !id;
    const projectAgreed = parseFloat($('projectAgreedTotal')?.value) || 0;
    const pendingInsts = state?.pendingProjectInstallments || (existing?.installments || []);

    const p = {
      ...f,
      id: id || uid(),
      agreedTotal: projectAgreed,
      installments: pendingInsts.slice(),
      createdAt: id ? existing?.createdAt : new Date().toISOString()
    };

    try {
      await upsertDoc('projects', p, existing?._rev);
    } catch (e) {
      if (e.message === 'CONFLICT_ABORTED') return;
      _toast('Save failed: ' + e.message, 'error');
      return;
    }

    let draftTasks = (state?._projectTasksDraft || []).filter(t => (t.title || '').trim());

    if (isNew && draftTasks.length === 0) {
      const now = Date.now();
      draftTasks = [
        { id: null, title: `Kickoff meeting — ${p.title || p.projectNumber || 'project'}`, dueDate: dateToStr(new Date(now + 3 * 86400000)), priority: 'high', status: 'pending' },
        { id: null, title: `Requirements gathering — ${p.projectNumber || ''}`, dueDate: dateToStr(new Date(now + 7 * 86400000)), priority: 'high', status: 'pending' },
        { id: null, title: `Draft delivery plan — ${p.projectNumber || ''}`, dueDate: dateToStr(new Date(now + 14 * 86400000)), priority: 'medium', status: 'pending' }
      ];
    }

    const savedTaskIds = [];
    for (const t of draftTasks) {
      const taskRecord = {
        id: t.id || uid(),
        title: t.title.trim(),
        dueDate: t.dueDate || dateToStr(new Date(Date.now() + 14 * 86400000)),
        taskType: 'Client Delivery',
        priority: t.priority || 'medium',
        status: t.status || 'pending',
        assignedTo: p.projectLead || state?.operator?.name || 'Ops',
        projectId: p.id,
        description: '',
        createdAt: t.id
          ? ((state?.data?.tasks || []).find(x => x.id === t.id)?.createdAt || new Date().toISOString())
          : new Date().toISOString()
      };
      try {
        await upsertDoc('tasks', taskRecord, (state?.data?.tasks || []).find(x => x.id === taskRecord.id)?._rev);
        savedTaskIds.push(taskRecord.id);
      } catch (err) {
        if (err.message !== 'CONFLICT_ABORTED') console.warn('[task save]', err);
      }
    }

    if (id) {
      const existingTaskIds = (state?.data?.tasks || []).filter(t => t.projectId === id).map(t => t.id);
      for (const tid of existingTaskIds) {
        if (!savedTaskIds.includes(tid)) {
          try { await deleteDoc('tasks', tid, false); } catch (_) {}
        }
      }
    }

    try { await recomputeProjectProgress(p.id); } catch (_) {}

    await _logAct(id ? 'edit' : 'add',
      id ? 'Project updated' : 'Project created',
      `${p.projectNumber} — ${p.title} (${savedTaskIds.length} tasks)`);

    if (isNew) {
      try { EventBus.emit('projects.created', p, p.id, p, { source: 'manual-create', collection: 'projects' }); } catch (_) {}
    }

    try { await recomputeClientRollup(p.clientId); } catch (e) { console.warn('[client rollup]', e); }

    if (state) {
      state.pendingProjectInstallments = null;
      state._projectTasksDraft = null;
    }
    _toast('Project saved.', 'success');
    _closeModal('projectModal');
    if (typeof renderActiveTab === 'function') renderActiveTab();
    d.publishClientsToPublicSite?.();

    const cameFromClientEditor = state?._clientDraft && state._clientDraft.clientId === p.clientId;
    if (cameFromClientEditor) {
      const draft = state._clientDraft;
      state._clientDraft = null;
      setTimeout(() => {
        if (draft.isNew) {
          Viora.addClient();
          setTimeout(() => {
            const setEl = (id2, v) => { const el = $(id2); if (el && v !== undefined) el.value = v; };
            setEl('clientName', draft.name);
            setEl('clientEmail', draft.email);
            setEl('clientPhone', draft.phone);
            setEl('clientPhoneAlt', draft.phoneAlt);
            setEl('clientCompany', draft.company);
            setEl('clientAddress', draft.address);
            setEl('clientCity', draft.city);
            setEl('clientType', draft.type);
            if (state) state.pendingClientAvatar = draft.avatar || null;
            if (typeof renderClientAvatarPreview === 'function') renderClientAvatarPreview();
            _toast('Project added — finish creating the client.', 'info');
          }, 200);
        } else {
          Viora.editClient(draft.clientId);
          setTimeout(() => {
            const setEl = (id2, v) => { const el = $(id2); if (el && v !== undefined) el.value = v; };
            setEl('clientName', draft.name);
            setEl('clientEmail', draft.email);
            setEl('clientPhone', draft.phone);
            setEl('clientPhoneAlt', draft.phoneAlt);
            setEl('clientCompany', draft.company);
            setEl('clientAddress', draft.address);
            setEl('clientCity', draft.city);
            setEl('clientType', draft.type);
            if (state) state.pendingClientAvatar = draft.avatar || null;
            if (typeof renderClientAvatarPreview === 'function') renderClientAvatarPreview();
            if (typeof renderClientProjectsFeeEditor === 'function') renderClientProjectsFeeEditor(draft.clientId);
            _toast('Project added — continue editing the client.', 'info');
          }, 200);
        }
      }, 250);
    }
  };

  Viora.openServiceAgreement = (pid) => { try { openServiceAgreementModal(pid); } catch (_) {} };

  Viora.deleteProject = async function (id) {
    const p = getProject(id);
    if (!p || !confirm(`Delete "${p.title}"?`)) return;
    for (const w of (state?.data?.worklogs || []).filter(w => w.projectId === id)) await deleteDoc('worklogs', w.id);
    await deleteDoc('projects', id);
    try { if (p.clientId) await recomputeClientRollup(p.clientId); } catch (_) {}
    await _logAct('delete', 'Project deleted', p.title);
    _toast('Project deleted.', 'info');
    if (typeof renderActiveTab === 'function') renderActiveTab();
    d.publishClientsToPublicSite?.();
  };

   /* ═══════════════════════════════════════════════════════════
     WORKLOGS
     ═══════════════════════════════════════════════════════════ */
  Viora.addWorklog = function () {
    $('worklogModalTitle').textContent = 'Log Work';
    $('editWorklogId').value = '';
    $('worklogForm').reset();
    $('worklogDate').value = todayStr();
    $('worklogBilled').checked = false;
    $('worklogProject').innerHTML =
      '<option value="">— Select a project —</option>' +
      (state?.data?.projects || [])
        .filter(p => p && p.status !== 'closed')
        .map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.projectNumber || p.title || '')} — ${escapeHtml(getClientName(p.clientId))}</option>`)
        .join('');
    _openModal('worklogModal');
  };

  Viora.editWorklog = function (id) {
    const w = (state?.data?.worklogs || []).find(x => x.id === id);
    if (!w) { _toast('Worklog not found.', 'error'); return; }
    $('worklogModalTitle').textContent = 'Edit Work Log';
    $('editWorklogId').value = id;
    $('worklogProject').innerHTML =
      '<option value="">— Select a project —</option>' +
      (state?.data?.projects || [])
        .filter(p => p && p.status !== 'closed')
        .map(p => `<option value="${escapeHtml(p.id)}" ${p.id === w.projectId ? 'selected' : ''}>${escapeHtml(p.projectNumber || p.title || '')} — ${escapeHtml(getClientName(p.clientId))}</option>`)
        .join('');
    $('worklogDate').value = w.date || todayStr();
    $('worklogActivity').value = w.activity || 'Development';
    $('worklogHours').value = w.hours || 0;
    $('worklogRate').value = w.rate || 0;
    $('worklogDesc').value = w.description || '';
    $('worklogBilled').checked = !!w.isBilled;
    _openModal('worklogModal');
  };

  Viora.saveWorklog = async function (f) {
    const id = $('editWorklogId').value;
    const existing = id ? (state?.data?.worklogs || []).find(x => x.id === id) : null;
    const projectId = f.projectId || $('worklogProject').value;
    if (!projectId) { _toast('Select a project.', 'error'); return; }

    const hours = parseFloat(f.hours) || 0;
    const rate = parseFloat(f.rate) || 0;
    if (hours <= 0) { _toast('Hours must be > 0.', 'error'); return; }
    if (rate < 0) { _toast('Rate cannot be negative.', 'error'); return; }

    const record = {
      id: id || uid(),
      projectId,
      clientId: (state?.data?.projects || []).find(p => p.id === projectId)?.clientId || null,
      date: f.date || todayStr(),
      activity: f.activity || 'Development',
      hours,
      rate,
      amount: Math.round(hours * rate * 100) / 100,
      description: f.description || '',
      isBilled: !!f.isBilled,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await upsertDoc('worklogs', record, existing?._rev);
    } catch (e) {
      if (e.message === 'CONFLICT_ABORTED') return;
      _toast('Save failed: ' + e.message, 'error');
      return;
    }

    await _logAct(id ? 'edit' : 'add', id ? 'Work log updated' : 'Work log added',
      `${record.activity} — ${hours}h @ ${fmtKES(rate)}/h`);

    if (state) state.pendingWorklog = null;
    _toast('Work log saved.', 'success');
    _closeModal('worklogModal');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  Viora.deleteWorklog = async function (id) {
    const w = (state?.data?.worklogs || []).find(x => x.id === id);
    if (!w) return;
    if (!confirm(`Delete work log "${w.activity}" from ${fmtDate(w.date)}?`)) return;
    try {
      await deleteDoc('worklogs', id);
      await _logAct('delete', 'Work log deleted', `${w.activity} — ${w.hours}h`);
      _toast('Work log deleted.', 'info');
      if (typeof renderActiveTab === 'function') renderActiveTab();
    } catch (e) {
      _toast('Delete failed: ' + (e.message || 'unknown'), 'error');
    }
  };
  /* ═══════════════════════════════════════════════════════════
     TASKS
     ═══════════════════════════════════════════════════════════ */
  Viora.addTask = function () {
    $('taskModalTitle').textContent = 'New Task';
    $('editTaskId').value = '';
    $('taskForm').reset();
    $('taskDueDate').value = todayStr();
    $('taskStatus').value = 'pending';
    $('taskPriority').value = 'medium';
    $('taskReminderMinutes').value = 1440;
    if ($('taskWorklogId')) $('taskWorklogId').value = '';
    $('taskProject').innerHTML = '<option value="">None</option>' +
      (state?.data?.projects || []).map(p => `<option value="${p.id}">${escapeHtml(p.projectNumber)}</option>`).join('');
    _openModal('taskModal');
  };

  Viora.editTask = function (id) {
    const t = (state?.data?.tasks || []).find(x => x.id === id);
    if (!t) return;
    $('taskModalTitle').textContent = 'Edit Task';
    $('editTaskId').value = id;
    $('taskTitle').value = t.title || '';
    $('taskDesc').value = t.description || '';
    $('taskDueDate').value = t.dueDate || '';
    $('taskType').value = t.taskType || 'Other';
    $('taskPriority').value = t.priority || 'medium';
    $('taskStatus').value = t.status || 'pending';
    $('taskAssigned').value = t.assignedTo || '';
    $('taskReminderMinutes').value = t.reminderMinutes || 1440;
    if ($('taskWorklogId')) $('taskWorklogId').value = t.worklogId || '';
    $('taskProject').innerHTML = '<option value="">None</option>' +
      (state?.data?.projects || []).map(p => `<option value="${p.id}">${escapeHtml(p.projectNumber)}</option>`).join('');
    $('taskProject').value = t.projectId || '';
    _openModal('taskModal');
  };

  Viora.saveTask = async function (f) {
    const id = $('editTaskId').value;
    const existing = id ? (state?.data?.tasks || []).find(x => x.id === id) : null;
    const nowIso = new Date().toISOString();
    const p = {
      id: id || uid(),
      title: (f.title || '').trim(),
      description: f.description || '',
      dueDate: f.dueDate || todayStr(),
      taskType: f.taskType || 'Other',
      priority: f.priority || 'medium',
      status: f.status || 'pending',
      assignedTo: f.assignedTo || state?.operator?.name || '',
      projectId: f.projectId || null,
      price: Number(f.price) || 0,
      reminderSent: false,
      reminderMinutes: f.reminderMinutes || 1440,
      createdAt: id ? (existing?.createdAt || nowIso) : nowIso,
      updatedAt: nowIso
    };
    try {
      await upsertDoc('tasks', p, existing?._rev);
    } catch (e) {
      if (e.message === 'CONFLICT_ABORTED') { _closeModal('taskModal'); return; }
      _toast('Save failed: ' + e.message, 'error');
      return;
    }
    await _logAct(id ? 'edit' : 'add', id ? 'Task updated' : 'Task added', p.title);
    _toast('Task saved.', 'success');
    _closeModal('taskModal');
    if (p.projectId) {
      try { await recomputeProjectProgress(p.projectId); }
      catch (e) { console.warn('[recompute]', e); }
    }
    if (existing && existing.projectId && existing.projectId !== p.projectId) {
      try { await recomputeProjectProgress(existing.projectId); } catch (_) {}
    }
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  Viora.toggleTask = async function (id) {
    const t = (state?.data?.tasks || []).find(x => x.id === id);
    if (!t) return;
    t.status = t.status === 'done' ? 'pending' : 'done';
    t.reminderSent = false;
    t._completedAt = t.status === 'done' ? new Date().toISOString() : null;
    t._statusChangedAt = new Date().toISOString();
    const updated = { ...t };
    if (state?.currentTab === 'ops-tasks' && typeof renderTasks === 'function') renderTasks();
    else if (typeof renderActiveTab === 'function') renderActiveTab();
    try { await upsertDoc('tasks', updated, null); }
    catch (e) { console.warn('[toggleTask persist]', e); }
    if (t.projectId) {
      try { await recomputeProjectProgress(t.projectId); }
      catch (e) { console.warn('[recompute]', e); }
    }
    try { EventBus.emit('tasks.upsert', t, t.id, t, { collection: 'tasks' }); } catch (_) {}
    if (t.projectId && t.status === 'done') {
      const tasks = (state?.data?.tasks || []).filter(x => x.projectId === t.projectId);
      const pending = tasks.filter(x => x.status !== 'done').length;
      const live = getProject(t.projectId);
      if (pending === 0 && live && !live._deliverablesOpenedAt &&
          typeof window.openProjectDeliverables === 'function') {
        setTimeout(() => {
          try { window.openProjectDeliverables(t.projectId); }
          catch (e) { console.warn('[deliverables open]', e); }
        }, 700);
      }
    }
    if (state?.currentTab === 'ops-projects' && typeof renderProjects === 'function') renderProjects();
    else if (state?.currentTab === 'ops-tasks' && typeof renderTasks === 'function') renderTasks();
    else if (state?.currentTab === 'dashboard' && typeof renderActiveTab === 'function') renderActiveTab();
    else if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  Viora.deleteTask = async function (id) {
    const t = (state?.data?.tasks || []).find(x => x.id === id);
    if (!t || !confirm(`Delete "${t.title}"?`)) return;
    const projectId = t.projectId;
    await deleteDoc('tasks', id);
    _toast('Task deleted.', 'info');
    if (projectId) {
      try { await recomputeProjectProgress(projectId); }
      catch (e) { console.warn('[recompute after deleteTask]', e); }
    }
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  /* ═══════════════════════════════════════════════════════════
     INVENTORY
     ═══════════════════════════════════════════════════════════ */
  Viora.addInventory = function () {
    $('inventoryModalTitle').textContent = 'New Item';
    $('editInventoryId').value = '';
    $('inventoryForm').reset();
    $('invQty').value = 0;
    $('invReorder').value = 5;
    _openModal('inventoryModal');
  };

  Viora.editInventory = function (id) {
    const i = (state?.data?.inventory || []).find(x => x.id === id);
    if (!i) return;
    $('inventoryModalTitle').textContent = 'Edit Item';
    $('editInventoryId').value = id;
    $('invSku').value = i.sku;
    $('invName').value = i.name;
    $('invQty').value = i.qty;
    $('invReorder').value = i.reorder;
    $('invCost').value = i.cost;
    $('invPrice').value = i.price;
    _openModal('inventoryModal');
  };

  Viora.saveInventory = async function (f) {
    const id = $('editInventoryId').value;
    const existing = id ? (state?.data?.inventory || []).find(x => x.id === id) : null;
    const p = { ...f, id: id || uid(), createdAt: id ? existing?.createdAt : new Date().toISOString() };
    try {
      await upsertDoc('inventory', p, existing?._rev);
    } catch (e) {
      if (e.message === 'CONFLICT_ABORTED') return;
      _toast('Save failed: ' + e.message, 'error');
      return;
    }
    _toast('Inventory saved.', 'success');
    _closeModal('inventoryModal');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  Viora.deleteInventory = async function (id) {
    const i = (state?.data?.inventory || []).find(x => x.id === id);
    if (!i || !confirm('Delete this item?')) return;
    await deleteDoc('inventory', id);
    _toast('Item deleted.', 'info');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  /* ═══════════════════════════════════════════════════════════
     EXPENSES
     ═══════════════════════════════════════════════════════════ */
  Viora.addExpense = function () {
    $('expenseModalTitle').textContent = 'Record Expense';
    $('editExpenseId').value = '';
    $('expenseForm').reset();
    $('exDate').value = todayStr();
    $('exProject').innerHTML = '<option value="">— None —</option>' +
      (state?.data?.projects || []).map(p => `<option value="${p.id}">${escapeHtml(p.projectNumber)}</option>`).join('');
    _openModal('expenseModal');
  };

  Viora.saveExpense = async function (f) {
    const id = $('editExpenseId').value;
    const existing = id ? (state?.data?.expenses || []).find(x => x.id === id) : null;
    const p = { ...f, id: id || uid(), createdAt: id ? existing?.createdAt : new Date().toISOString() };
    try {
      await upsertDoc('expenses', p, existing?._rev);
    } catch (e) {
      if (e.message === 'CONFLICT_ABORTED') return;
      _toast('Save failed: ' + e.message, 'error');
      return;
    }
    _toast('Expense saved.', 'success');
    _closeModal('expenseModal');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  Viora.deleteExpense = async function (id) {
    const e = (state?.data?.expenses || []).find(x => x.id === id);
    if (!e || !confirm('Delete this expense?')) return;
    await deleteDoc('expenses', id);
    _toast('Expense deleted.', 'info');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  /* ═══════════════════════════════════════════════════════════
     PAYROLL
     ═══════════════════════════════════════════════════════════ */
  Viora.addPayroll = function () {
    if (!getEmployees().length) { _toast('Add an employee first.', 'error'); return; }
    $('payrollModalTitle').textContent = 'Run Payroll (Kenya)';
    $('editPayrollId').value = '';
    $('payrollForm').reset();
    $('prEmployee').innerHTML = getEmployees().map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');
    $('prPeriod').value = todayStr().slice(0, 7);
    $('prAttendance').value = 22;
    $('prBenefits').value = 0;
    $('prCalcResult').style.display = 'none';
    $('prProject').innerHTML = '<option value="">— None —</option>' +
      (state?.data?.projects || []).map(p => `<option value="${p.id}">${escapeHtml(p.projectNumber)}</option>`).join('');
    _openModal('payrollModal');
  };

  Viora.savePayroll = async function (f) {
    const emp = getEmployees().find(e => e.id === f.employeeId);
    let calc = state?.pendingPayrollCalc;
    if (!calc) {
      try { calc = await _callFn('payroll/calc', { gross: f.gross, benefits: f.benefits }); }
      catch (_) { _toast('Payroll calc failed.', 'error'); return; }
    }
    const p = {
      ...f,
      employeeName: emp ? emp.name : '',
      net: calc.net,
      deductions: calc.deductions,
      id: uid(),
      createdAt: new Date().toISOString()
    };
    await upsertDoc('payroll', p);
    if (state) state.pendingPayrollCalc = null;
    _toast('Payroll saved.', 'success');
    _closeModal('payrollModal');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  Viora.markPayrollPaid = async function (id) {
    const p = (state?.data?.payroll || []).find(x => x.id === id);
    if (!p) return;
    p.status = 'Paid';
    await upsertDoc('payroll', p, p._rev);
    _toast('Payroll paid.', 'success');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  Viora.deletePayroll = async function (id) {
    const p = (state?.data?.payroll || []).find(x => x.id === id);
    if (!p || !confirm('Delete this payroll run?')) return;
    await deleteDoc('payroll', id);
    _toast('Payroll deleted.', 'info');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  /* ═══════════════════════════════════════════════════════════
     EMPLOYEES
     ═══════════════════════════════════════════════════════════ */
  Viora.addEmployee = function () {
    $('employeeModalTitle').textContent = 'New Employee';
    $('editEmployeeId').value = '';
    $('employeeForm').reset();
    $('empLeave').value = 21;
    _openModal('employeeModal');
  };

  Viora.editEmployee = function (id) {
    const e = (state?.data?.entities || []).find(x => x.id === id);
    if (!e) return;
    $('employeeModalTitle').textContent = 'Edit Employee';
    $('editEmployeeId').value = id;
    $('empName').value = e.name || '';
    $('empDesig').value = e.designation || '';
    $('empDept').value = e.department || 'Operations';
    $('empPay').value = e.payRate || 0;
    $('empLeave').value = e.leaveBalance || 0;
    $('empStatus').value = e.status || 'Active';
    $('empEmail').value = e.email || '';
    $('empPhone').value = e.phone || '';
    $('empBank').value = e.bankDetails || '';
    _openModal('employeeModal');
  };

  Viora.saveEmployee = async function (f) {
    const id = $('editEmployeeId').value;
    const existing = id ? (state?.data?.entities || []).find(x => x.id === id) : null;
    const p = {
      ...f,
      type: 'employee',
      id: id || uid(),
      updatedAt: new Date().toISOString(),
      createdAt: id ? existing?.createdAt : new Date().toISOString()
    };

    try {
      await upsertDoc('entities', p, existing?._rev);
    } catch (e) {
      if (e.message === 'CONFLICT_ABORTED') return;
      _toast('Save failed: ' + e.message, 'error');
      return;
    }

    /* ★ v9.3 — Force the local state to contain the record before we
       repaint, in case the write-layer putInArray ran against a stale
       array reference. */
    try {
      if (!Array.isArray(state.data.entities)) state.data.entities = [];
      const i = state.data.entities.findIndex(x => x.id === p.id);
      if (i > -1) {
        state.data.entities[i] = { ...state.data.entities[i], ...p };
      } else {
        state.data.entities.push(p);
      }
    } catch (_) {}

    /* ★ v9.3 — Invalidate counter cache so the sidebar badge and the
       table's dependency read from the same fresh source. */
    try {
      if (state._counterCache) {
        delete state._counterCache.v.employees;
        delete state._counterCache.v.clients;
        state._counterCache.t = 0;
      }
      if (typeof updateSidebarCounters === 'function') updateSidebarCounters(true);
    } catch (_) {}

    _toast('Employee saved.', 'success');
    _closeModal('employeeModal');

    /* ★ v9.3 — Paint the table SYNCHRONOUSLY on the current tab
       before the RAF-based renderActiveTab fires. This bypasses any
       timing race between the save and the router. */
    if (state.currentTab === 'admin-employees') {
      try {
        if (typeof window.renderEmployees === 'function') window.renderEmployees();
      } catch (_) {}
    }

    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  Viora.deleteEmployee = async function (id) {
    const e = (state?.data?.entities || []).find(x => x.id === id);
    if (!e || !confirm('Delete this employee?')) return;
    await deleteDoc('entities', id);
    _toast('Employee deleted.', 'info');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  /* ═══════════════════════════════════════════════════════════
     ASSETS
     ═══════════════════════════════════════════════════════════ */
  Viora.addAsset = function () {
    $('assetModalTitle').textContent = 'New Asset';
    $('editAssetId').value = '';
    $('assetForm').reset();
    $('asDate').value = todayStr();
    $('asDepr').value = 20;
    $('asAssigned').innerHTML = '<option value="">— None —</option>' +
      getEmployees().map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');
    _openModal('assetModal');
  };

  Viora.editAsset = function (id) {
    const a = (state?.data?.assets || []).find(x => x.id === id);
    if (!a) return;
    $('assetModalTitle').textContent = 'Edit Asset';
    $('editAssetId').value = id;
    $('asName').value = a.name;
    $('asCategory').value = a.category;
    $('asCost').value = a.cost;
    $('asDepr').value = a.depreciation;
    $('asAssigned').innerHTML = '<option value="">— None —</option>' +
      getEmployees().map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');
    $('asAssigned').value = a.assignedTo || '';
    $('asDate').value = a.purchaseDate || '';
    $('asStatus').value = a.status;
    _openModal('assetModal');
  };

  Viora.saveAsset = async function (f) {
    const id = $('editAssetId').value;
    const assigned = getEmployees().find(e => e.id === f.assignedTo);
    const existing = id ? (state?.data?.assets || []).find(x => x.id === id) : null;
    const p = {
      ...f,
      assignedName: assigned ? assigned.name : '',
      id: id || uid(),
      createdAt: id ? existing?.createdAt : new Date().toISOString()
    };
    try {
      await upsertDoc('assets', p, existing?._rev);
    } catch (e) {
      if (e.message === 'CONFLICT_ABORTED') return;
      _toast('Save failed: ' + e.message, 'error');
      return;
    }
    _toast('Asset saved.', 'success');
    _closeModal('assetModal');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  Viora.deleteAsset = async function (id) {
    const a = (state?.data?.assets || []).find(x => x.id === id);
    if (!a || !confirm('Delete this asset?')) return;
    await deleteDoc('assets', id);
    _toast('Asset deleted.', 'info');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  /* ═══════════════════════════════════════════════════════════
     COMPLIANCE
     ═══════════════════════════════════════════════════════════ */
  Viora.addCompliance = function () {
    $('complianceModalTitle').textContent = 'New Record';
    $('editComplianceId').value = '';
    $('complianceForm').reset();
    $('cpIssue').value = todayStr();
    _openModal('complianceModal');
  };

  Viora.editCompliance = function (id) {
    const c = (state?.data?.compliance || []).find(x => x.id === id);
    if (!c) return;
    $('complianceModalTitle').textContent = 'Edit Record';
    $('editComplianceId').value = id;
    $('cpTitle').value = c.title;
    $('cpRegNo').value = c.regNo || '';
    $('cpIssue').value = c.issueDate || '';
    $('cpExpiry').value = c.expiryDate || '';
    $('cpStatus').value = c.status || 'Active';
    $('cpNotes').value = c.notes || '';
    _openModal('complianceModal');
  };

  Viora.saveCompliance = async function (f) {
    const id = $('editComplianceId').value;
    const existing = id ? (state?.data?.compliance || []).find(x => x.id === id) : null;
    const p = { ...f, id: id || uid(), createdAt: id ? existing?.createdAt : new Date().toISOString() };
    try {
      await upsertDoc('compliance', p, existing?._rev);
    } catch (e) {
      if (e.message === 'CONFLICT_ABORTED') return;
      _toast('Save failed: ' + e.message, 'error');
      return;
    }
    _toast('Compliance saved.', 'success');
    _closeModal('complianceModal');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  Viora.deleteCompliance = async function (id) {
    const c = (state?.data?.compliance || []).find(x => x.id === id);
    if (!c || !confirm('Delete this record?')) return;
    await deleteDoc('compliance', id);
    _toast('Record deleted.', 'info');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  /* ═══════════════════════════════════════════════════════════
     DOCUMENTS
     ═══════════════════════════════════════════════════════════ */
  Viora.openDocUpload = function (system, category) {
    $('docSystem').value = system;
    $('docCategory').value = category;
    $('docTitle').value = '';
    $('docPreview').innerHTML = '';
    $('docFileInput').value = '';
    if (state) state.pendingDoc = null;
    const ps = $('docParent');
    ps.innerHTML = '<option value="">— Standalone —</option>';
    const options = [];
    if (system === 'Marketing')  options.push(...(state?.data?.campaigns  || []).map(c => ({ id: c.id, label: 'Campaign: ' + c.name })));
    if (system === 'Sales')      options.push(...(state?.data?.contracts  || []).map(c => ({ id: c.id, label: 'Contract: ' + c.title })));
    if (system === 'Operations') options.push(...(state?.data?.projects   || []).map(p => ({ id: p.id, label: 'Project: '  + p.title })));
    if (system === 'Finance')    options.push(...(state?.data?.invoices   || []).map(i => ({ id: i.id, label: 'Invoice: '  + i.number })));
    options.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = o.label;
      ps.appendChild(opt);
    });
    _openModal('docUploadModal');
  };

  Viora.viewDoc = function (id) {
    const doc = (state?.data?.documents || []).find(x => x.id === id);
    if (!doc) { _toast('Not found.', 'error'); return; }
    $('viewerTitle').textContent = doc.title || doc.fileName;
    let body = '';
    if ((doc.mime || '').startsWith('image/')) {
      body = `<img src="${doc.data}" style="max-width:100%;border-radius:12px;" />`;
    } else if (doc.mime === 'application/pdf') {
      body = `<iframe src="${doc.data}" style="width:100%;height:70vh;border:none;border-radius:12px;"></iframe>`;
    } else if ((doc.mime || '').startsWith('text/')) {
      body = `<pre style="text-align:left;white-space:pre-wrap;padding:16px;background:var(--bg-card-solid);border-radius:12px;">${escapeHtml(atob((doc.data.split(',')[1] || '')))}</pre>`;
    } else {
      body = `<div style="padding:40px 20px;"><i class="fa-solid fa-file" style="font-size:60px;color:var(--text-light);"></i><p style="margin-top:16px;">Preview not available.</p></div>`;
    }
    $('viewerBody').innerHTML = body;
    $('viewerDownloadBtn').onclick = () => Viora.downloadDoc(id);
    _openModal('viewerModal');
  };

  Viora.downloadDoc = function (id) {
    const doc = (state?.data?.documents || []).find(x => x.id === id);
    if (!doc) return;
    const a = document.createElement('a');
    a.href = doc.data;
    a.download = doc.fileName;
    a.click();
    _logAct('send', 'Document downloaded', doc.fileName);
  };

  Viora.deleteDoc = async function (id) {
    const doc = (state?.data?.documents || []).find(x => x.id === id);
    if (!doc || !confirm('Delete this document?')) return;
    await deleteDoc('documents', id);
    _toast('Document deleted.', 'info');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  /* ═══════════════════════════════════════════════════════════
     USERS
     ═══════════════════════════════════════════════════════════ */
  Viora.setUserRole = async function (uidKey, role) {
    try {
      await set(ref(db, `${ROOT}/users/${uidKey}/role`), role);
      await _logAct('edit', 'User role changed', `${uidKey} → ${role}`);
      _toast('Role updated.', 'success');
    } catch (e) {
      _toast('Failed: ' + e.message, 'error');
    }
  };

  Viora.deleteUser = async function (uidKey) {
    if (!confirm('Delete this user profile? (Auth account must be removed separately.)')) return;
    await remove(ref(db, `${ROOT}/users/${uidKey}`));
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  /* ═══════════════════════════════════════════════════════════
     TRASH
     ═══════════════════════════════════════════════════════════ */
  Viora.restoreFromTrash = async function (trashId) {
    const t = (state?.data?.trash || []).find(x => x.id === trashId);
    if (!t) return;
    await set(ref(db, `${P(t.collection)}/${t.originalId}`), t.payload);
    await remove(ref(db, `${P('trash')}/${trashId}`));
    _toast('Restored.', 'success');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  Viora.purgeTrashItem = async function (trashId) {
    if (!confirm('Permanently delete this item?')) return;
    await remove(ref(db, `${P('trash')}/${trashId}`));
    _toast('Purged.', 'info');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  Viora.purgeTrash = async function () {
    if (!confirm('Permanently delete ALL trash entries? This cannot be undone.')) return;
    await remove(ref(db, P('trash')));
    _toast('Trash emptied.', 'info');
    if (typeof renderActiveTab === 'function') renderActiveTab();
  };

  /* ═══════════════════════════════════════════════════════════
     FINANCE PASSTHROUGHS
     ═══════════════════════════════════════════════════════════ */
  Viora.openInvoiceGen  = (...a) => { try { return openInvoiceGenModal(...a); } catch (_) {} };
  Viora.viewInvoice     = (id) => { if (state) state.viewingInvoiceId = id; try { openInvoiceViewModal(id); } catch (_) {} };
  Viora.deleteInvoice   = (...a) => { try { return deleteInvoice(...a); } catch (_) {} };
  Viora.openPayment     = (...a) => { try { return openPaymentModal(...a); } catch (_) {} };
  Viora.savePayment     = (...a) => { try { return savePayment(...a); } catch (_) {} };
  Viora.deletePayment   = (...a) => { try { return deletePayment(...a); } catch (_) {} };
  Viora.openPayChain    = (...a) => { try { return openPayChain(...a); } catch (_) {} };
  Viora.confirmPayChain = (...a) => { try { return confirmPayChain(...a); } catch (_) {} };
  Viora.openStk         = (...a) => { try { return openStkModal(...a); } catch (_) {} };
  Viora.openMpesa       = (...a) => { try { return openMpesaModal(...a); } catch (_) {} };
  Viora.manualMatchMpesa = (...a) => { try { return openManualMpesaMatch(...a); } catch (_) {} };
  Viora.openFees        = (...a) => { try { return openFeesModal(...a); } catch (_) {} };
  Viora.openCreditTransfer = (...a) => { try { return openCreditTransfer(...a); } catch (_) {} };
  Viora.transferProjectCredit = (...a) => { try { return transferProjectCredit(...a); } catch (_) {} };
  Viora.sendClientStatement = (...a) => { try { return sendClientStatement(...a); } catch (_) {} };
  Viora.bulkRemind      = (...a) => { try { return bulkRemind(...a); } catch (_) {} };

  /* ═══════════════════════════════════════════════════════════
     PROPOSAL STUDIO
     ═══════════════════════════════════════════════════════════ */
  Viora.openProposalStudio     = (...a) => { try { return openProposalStudio(...a); } catch (_) {} };
  Viora.generateProposalDraft  = (...a) => { try { return generateProposalDraft(...a); } catch (_) {} };
  Viora.saveProposalDraft      = (...a) => { try { return saveProposalDraft(...a); } catch (_) {} };
  Viora.proposalToVault        = (...a) => { try { return proposalToVault(...a); } catch (_) {} };
  Viora.proposalToInvoice      = (...a) => { try { return proposalToInvoice(...a); } catch (_) {} };
  Viora.openProposalFor = function (kind, id) {
    if (!kind || !id) return;
    const preset = kind === 'lead' ? { leadId: id } : { dealId: id };
    if (typeof openProposalStudio === 'function') openProposalStudio(preset);
    else { console.warn('[viora] openProposalStudio unavailable'); _toast('Proposal studio not ready — try again in a moment.', 'warning'); }
  };

  /* ═══════════════════════════════════════════════════════════
     MISC UTILITY PASSTHROUGHS
     ═══════════════════════════════════════════════════════════ */
  Viora.removeCharge = (...a) => { try { return removeCharge(...a); } catch (_) {} };
  Viora.removeJeLine = function (i) {
    if (state?.pendingJeLines) {
      state.pendingJeLines.splice(i, 1);
      d.renderJeLines?.();
    }
  };
  Viora.removeInstallment        = (...a) => { try { return d.removeInstallment?.(...a); } catch (_) {} };
  Viora.removeProjectInstallment = (...a) => { try { return removeProjectInstallment(...a); } catch (_) {} };
    /* ★ v9.6 — Preview a presentation attachment in a new tab. */
  Viora.viewPresAttachment = function (i) {
    const list = state?.pendingPresAttachments;
    if (!Array.isArray(list) || !list[i]) { _toast('Attachment not found.', 'error'); return; }
    const att = list[i];
    if (!att.data) { _toast('No preview data for this attachment.', 'warning'); return; }

    const w = window.open();
    if (!w) { _toast('Pop-up blocked — allow pop-ups to preview.', 'warning'); return; }

    const mime = String(att.mime || '').toLowerCase();
    const name = String(att.name || 'preview');
    const title = name.replace(/[<>&"']/g, '');

    if (mime.startsWith('image/')) {
      w.document.write(
        '<!DOCTYPE html><html><head><title>' + title + '</title>' +
        '<style>html,body{margin:0;padding:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh;}img{max-width:100%;max-height:100vh;object-fit:contain;box-shadow:0 0 40px rgba(0,0,0,.6);}</style>' +
        '</head><body><img src="' + att.data + '" alt="' + title + '"></body></html>'
      );
    } else if (mime === 'application/pdf') {
      w.document.write(
        '<!DOCTYPE html><html><head><title>' + title + '</title>' +
        '<style>html,body{margin:0;padding:0;height:100%;}iframe{border:0;position:fixed;inset:0;width:100%;height:100%;}</style>' +
        '</head><body><iframe src="' + att.data + '"></iframe></body></html>'
      );
    } else if (mime.startsWith('video/')) {
      w.document.write(
        '<!DOCTYPE html><html><head><title>' + title + '</title>' +
        '<style>html,body{margin:0;padding:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh;}video{max-width:100%;max-height:100vh;}</style>' +
        '</head><body><video src="' + att.data + '" controls autoplay></video></body></html>'
      );
    } else if (mime.startsWith('audio/')) {
      w.document.write(
        '<!DOCTYPE html><html><head><title>' + title + '</title>' +
        '<style>html,body{margin:0;padding:0;background:#111;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui,sans-serif;color:#e2e8f0;}audio{margin-top:24px;width:80%;max-width:480px;}</style>' +
        '</head><body><h2 style="font-weight:600;">' + title + '</h2><audio src="' + att.data + '" controls autoplay></audio></body></html>'
      );
    } else if (mime.startsWith('text/') || /\.(txt|md|csv|log)$/i.test(name)) {
      try {
        const base64 = att.data.split(',')[1] || '';
        const decoded = atob(base64);
        w.document.write(
          '<!DOCTYPE html><html><head><title>' + title + '</title>' +
          '<style>html,body{margin:0;padding:0;background:#0f172a;color:#e2e8f0;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;line-height:1.5;}pre{margin:0;padding:20px;white-space:pre-wrap;word-break:break-word;}</style>' +
          '</head><body><pre>' +
          decoded.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') +
          '</pre></body></html>'
        );
      } catch (e) {
        _toast('Could not decode text file.', 'error');
        w.close();
      }
    } else {
      _toast('Preview not available for this file type — click Download.', 'info');
      w.close();
    }
  };

  /* ★ v9.6 — Download a presentation attachment directly. */
  Viora.downloadPresAttachment = function (i) {
    const list = state?.pendingPresAttachments;
    if (!Array.isArray(list) || !list[i]) { _toast('Attachment not found.', 'error'); return; }
    const att = list[i];
    if (!att.data) { _toast('No data to download.', 'warning'); return; }
    try {
      const a = document.createElement('a');
      a.href = att.data;
      a.download = att.name || 'attachment';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      _toast('Download started.', 'success');
    } catch (e) {
      _toast('Download failed: ' + (e.message || 'unknown'), 'error');
    }
  };
  
  Viora.removePresAttachment     = function (i) {
    if (Array.isArray(state?.pendingPresAttachments)) {
      state.pendingPresAttachments.splice(i, 1);
      if (typeof renderPresAttachments === 'function') renderPresAttachments();
    }
  };

  /* ═══════════════════════════════════════════════════════════
     TRACK ADMIN HELPERS
     ═══════════════════════════════════════════════════════════ */
  Viora.deleteTrackItem = async function (col, uidKey, id) {
    if (!confirm('Delete this item?')) return;
    try {
      await remove(ref(db, d.TRACK_P?.(`${col}/${uidKey}/${id}`)));
      _toast('Deleted.', 'info');
    } catch (e) {
      _toast('Delete failed: ' + e.message, 'error');
    }
  };

  Viora.resetTrackGame = async function (gameId) {
    if (!confirm(`Reset game "${gameId}"?`)) return;
    try {
      await remove(ref(db, d.TRACK_P?.(`games/${gameId}`)));
      _toast('Game reset.', 'info');
    } catch (e) {
      _toast('Reset failed: ' + e.message, 'error');
    }
  };

  /* ═══════════════════════════════════════════════════════════
     EVENT-HELPER PASSTHROUGHS
     ═══════════════════════════════════════════════════════════ */
  Viora.refreshRecommendations       = (...a) => { try { return refreshRecommendations?.(...a); } catch (_) {} };
  Viora.renderDashboardNotifications = (...a) => { try { return d.renderDashboardNotifications?.(...a); } catch (_) {} };
  Viora.initDashboardNotifications   = (...a) => { try { return d.initDashboardNotifications?.(...a); } catch (_) {} };

  /* Logo helper (used in a few code paths) */
  Viora.applyLogo = _applyLogo;

  return Viora;
}
