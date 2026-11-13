# Generated module and API map

Generated: 2026-11-13T01:05:02.244Z

Modules: 112

## Modules
### web/analytics-config.js

- Size: 341 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### web/assets/mamamboga/firebase.js

- Size: 5963 bytes
- Imports: https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js, https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js, https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js, https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js
- Exports: auth, db, storage, deductStock, formatKES, generateCode, showToast, uploadImage, getUserRole, isPlatformAdmin, deleteProduct
- Worker routes: none detected

### web/assets/mamamboga/sw.js

- Size: 1895 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### web/assets/r/shared/firebase.js

- Size: 1567 bytes
- Imports: https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js, https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js, https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js
- Exports: none detected
- Worker routes: none detected

### web/assets/r/sw.js

- Size: 1579 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### web/campaigns-bootstrap.js

- Size: 43911 bytes
- Imports: firebase/app, firebase/database, firebase/auth, ./main/orbit-shell.js, ./main/helpers.js, ./main/inbox.js, ./main/agent-runner.js, ./main/idb.js, ./main/modal-utils.js, ./main/charts.js, ./main/write-layer.js, ./main/ai-services.js, ./main/render-marketplace.js, ./main/campaign-accounts.js, ./main/campaign-trends.js, ./main/campaign-ai.js, ./main/campaign-analytics.js, ./main/campaign-cron.js, ./main/campaign-analytics.js
- Exports: none detected
- Worker routes: none detected

### web/category-modal.js

- Size: 10421 bytes
- Imports: none detected
- Exports: initCategoryModal, openCategoryModal
- Worker routes: none detected

### web/cookie-consent.js

- Size: 937 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### web/currency-display.js

- Size: 11519 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### web/engineering-command-centre.js

- Size: 20446 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### web/global-brand.js

- Size: 5808 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### web/globe-tier1.js

- Size: 13246 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### web/guard.js

- Size: 15310 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### web/hero-banner.js

- Size: 124682 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### web/hero-globe.js

- Size: 80876 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### web/hero-orb.js

- Size: 25135 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### web/hero-orbitals.js

- Size: 8585 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### web/hero-sky.js

- Size: 64524 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### web/hero-solar.js

- Size: 50930 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### web/hero-terminator.js

- Size: 10050 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### web/hero-time.js

- Size: 13062 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### web/hero-tooltip.js

- Size: 24574 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### web/index-home.js

- Size: 110471 bytes
- Imports: ./order-modal.js, ./category-modal.js
- Exports: none detected
- Worker routes: none detected

### web/industry-app-nav.js

- Size: 5023 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### web/industry-marketplace.js

- Size: 5946 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### web/main/agent-runner.js

- Size: 2998 bytes
- Imports: none detected
- Exports: initAgentRunner, runAgent
- Worker routes: none detected

### web/main/ai-services.js

- Size: 13251 bytes
- Imports: none detected
- Exports: initAIServices, AIFiling, AIRank, AIAnomaly
- Worker routes: none detected

### web/main/boot.js

- Size: 58761 bytes
- Imports: firebase/database, firebase/auth, ./idb.js, ./orchestration.js
- Exports: boot, registerNetworkEvents
- Worker routes: none detected

### web/main/campaign-accounts.js

- Size: 25697 bytes
- Imports: none detected
- Exports: initCampaignAccounts, platformMeta, allPlatforms, loadAccounts, getAccountForPlatform, getAccountForPlatformSync, subscribeToAccounts, unsubscribeAccounts, deleteAccount, renderAccountsPanel, openAccountEditor, mentionForPlatform, postingAsLabel
- Worker routes: none detected

### web/main/campaign-ai.js

- Size: 55009 bytes
- Imports: ./campaign-utils.js
- Exports: initCampaignAI, openComposer, openComposerWithTrend, openComposerForCampaign, openComposerForDraft, renderDraftLibrary, renderPromptLibrary
- Worker routes: none detected

### web/main/campaign-analytics.js

- Size: 42251 bytes
- Imports: ./campaign-utils.js
- Exports: initCampaignAnalytics, renderAnalyticsDashboard
- Worker routes: none detected

### web/main/campaign-cron.js

- Size: 7180 bytes
- Imports: ./campaign-utils.js
- Exports: initCampaignCron, startCampaignCron, stopCampaignCron
- Worker routes: none detected

### web/main/campaign-trends.js

- Size: 6023 bytes
- Imports: none detected
- Exports: initCampaignTrends, renderTrendRadar
- Worker routes: none detected

### web/main/campaign-utils.js

- Size: 27841 bytes
- Imports: none detected
- Exports: PILLARS, pillarByKey, PLATFORMS, platformMeta, captionForPlatform, composeUrlFor, escHtml, q, fmtNum, fmtPercent, fmtMoney, engagementRate, engagementRateFor, makePost, makeFanoutItem, buildUtmUrl, utmFromPost, detectAnomaly, buildTimeHeatmap, summarizeCampaign, bestPillar, groupPostsByFanout, summarizeFanout, statsHistoryFor, combineStatsHistory, toUtcIso, readImageFile
- Worker routes: none detected

### web/main/charts.js

- Size: 23458 bytes
- Imports: none detected
- Exports: initCharts, getTextColor, clearTextColorCache, destroyChart, destroyAllCharts, safeCanvas, renderCharts, renderMarketplaceCharts, C
- Worker routes: none detected

### web/main/clients.js

- Size: 59581 bytes
- Imports: ./projects.js, ./contacts.js, ./finance.js
- Exports: initClients, getEntities, getClients, getEmployees, getClient, getClientName, getClientProjects, getClientDocs, getClientInvoices, getClientPayments, getClientDeals, getClientContracts, getClientTasks, getClientComms, getClientAppointments, getClientPresentations, computeClientRollup, getClientAgreedTotal, getClientPaidTotal, getClientBilledTotal, getClientRemainingTotal, getClientCreditTotal, getFeeSummary, recomputeClientRollup, recomputeClientInstallments, renderClients, renderClientCards, renderClient360Page, openClient360, renderClientAvatarPreview, generateClientReport, downloadReportPdf, buildClientStatementPdf, openWelcomeEmailPreview
- Worker routes: none detected

### web/main/command-palette.js

- Size: 23346 bytes
- Imports: none detected
- Exports: initCommandPalette, openCmdPalette, closeCmdPalette, setupCommandPalette
- Worker routes: none detected

### web/main/contacts.js

- Size: 30883 bytes
- Imports: none detected
- Exports: initContacts, contactButtons, getEntityById, openCommModal, switchCommChannel, buildTemplates, updateCommPreview, sendComm, renderCommunications, openCommFullPreview
- Worker routes: none detected

### web/main/dashboard-attention.js

- Size: 8903 bytes
- Imports: none detected
- Exports: initDashboardAttention, renderDashboardAttention
- Worker routes: none detected

### web/main/dashboard-hero.js

- Size: 13175 bytes
- Imports: none detected
- Exports: initDashboardHero, startHeroWeather, stopHeroWeather, updateHeroWeather
- Worker routes: none detected

### web/main/dashboard-kpis.js

- Size: 14088 bytes
- Imports: none detected
- Exports: initDashboardKpis, renderDashboardKpis
- Worker routes: none detected

### web/main/dashboard-weather.js

- Size: 41379 bytes
- Imports: none detected
- Exports: initDashboardWeather, loadWeatherLocation, saveWeatherLocation, fetchWeather, openLocationPicker, refreshWeather, bootDashboardWeather, forceWeatherRefresh, stopDashboardWeather, getLastWeather
- Worker routes: none detected

### web/main/employee-profiles.js

- Size: 22682 bytes
- Imports:  data-idx=
- Exports: initEmployeeProfiles, renderEmployeeProfiles
- Worker routes: none detected

### web/main/finance.js

- Size: 123359 bytes
- Imports: ./helpers.js
- Exports: initFinance, invalidateInvoicePaidMemo, getInvoicePaidAmount, getInvoiceTotals, getInvoiceStatusDerived, generateInvoiceNumber, nextProjectInvoiceNumber, buildInvoiceProgressMessage, reconcilePayment, handleSubscriptionInvoicePaid, onInvoicePaid, sendInvoiceReceipt, applyClientCreditToInvoice, openPayChain, confirmPayChain, openPaymentModal, renderPaymentProjectPicker, renderPaymentAllocation, updatePaymentSummary, savePayment, deletePayment, openInvoiceGenModal, refreshInvoiceProjects, renderExtraCharges, removeCharge, updateInvoicePreview, openInvoiceViewModal, deleteInvoice, openStkModal, sendStkPush, openMpesaModal, findInvoiceCandidates, autoMatchMpesa, applyMpesaMatch, processMpesaQueue, renderMpesaModal, openManualMpesaMatch, confirmMpesaMatch, renderMpesaInline, openServiceAgreementModal, attachServiceAgreement, sendClientStatement, transferProjectCredit, openFeesModal, openCreditTransfer, bulkRemind, F
- Worker routes: none detected

### web/main/global-market.js

- Size: 32421 bytes
- Imports: ./charts.js, ./helpers.js
- Exports: initGlobalMarket, destroyGChart, gFetch, gFetchBatch, loadGlobalDashboard, loadTechPenetration, loadTechBroadband, loadTechServers, loadTechExports, loadTechRd, loadEconomicIndicators, loadInflationTrend, loadExchangeRates, loadPopulationTrend, loadCountryComparison, gChatSend, setupGlobalMarket, G
- Worker routes: none detected

### web/main/helpers.js

- Size: 9797 bytes
- Imports: none detected
- Exports: $, uid, dateToStr, todayStr, fmtDate, fmtDateTime, timeAgo, daysBetween, isOverdue, FX_RATE, fmtKES, fmtUSD, usdToKes, kpiFormat, escapeHtml, fmtBytes, normalizePhone, normalizeEmail, simpleHash, emailToId, generateLicenseKey, isMobile, debounce, pickFile, pickFileMobileSplit, H
- Worker routes: none detected

### web/main/home-content.js

- Size: 95219 bytes
- Imports: none detected
- Exports: initHomeContent, renderHomeContent
- Worker routes: none detected

### web/main/idb.js

- Size: 16402 bytes
- Imports: ./helpers.js
- Exports: IDB_NAME, IDB_STORE, IDB_QUEUE_STORE, IDB_EVENT_QUEUE_STORE, IDB_VERSION, initIdb, idbOpen, idbReset, idbSave, idbLoad, idbClear, queueOfflineMutation, removeFromQueue, updateQueueEntry, updatePendingCount, flushOfflineQueue, eventQueuePush, eventQueuePushBatch, eventQueueDrain, eventQueueRemove, eventQueueRemoveBatch, eventQueueClear, idbGetDedupeStamp, idbSetDedupeStamp
- Worker routes: none detected

### web/main/inbox.js

- Size: 24352 bytes
- Imports: firebase/database,  + String(message?.profileName || message?.from || 
- Exports: initInbox, subscribeInbox, unsubscribeInbox, renderInbox, getInboxUnreadCount, openThreadByAddress
- Worker routes: none detected

### web/main/main-subscription-plans.js

- Size: 75873 bytes
- Imports: none detected
- Exports: initSubscriptionPlans, renderSubscriptionPlans, destroySubscriptionPlans
- Worker routes: none detected

### web/main/market-content.js

- Size: 40275 bytes
- Imports: none detected
- Exports: initMarketContent, MARKET_DEFAULTS, renderMarketContent, savePromos, saveProductExtras, saveMarketContent, bindMarketContentEvents, destroyMarketContent
- Worker routes: none detected

### web/main/misc-helpers.js

- Size: 16587 bytes
- Imports: none detected
- Exports: initMiscHelpers, exportCsv, openJournalModal, renderJeLines, updateJeBalance, postJournalEntry, openProposalStudio, generateProposalDraft, saveProposalDraft, proposalToVault, proposalToInvoice
- Worker routes: none detected

### web/main/modal-utils.js

- Size: 18213 bytes
- Imports: none detected
- Exports: initModalUtils, openModal, closeModal, showModal, hideModal, toast, setSyncStatus, vioraConfirm, vioraPrompt, applyLogoEverywhere, getLogoImg
- Worker routes: none detected

### web/main/orbit-modules.js

- Size: 176752 bytes
- Imports: ./campaign-ai.js, ./campaign-analytics.js, ./campaign-utils.js, ./campaign-accounts.js, ./inbox.js, ./agent-runner.js, firebase/storage,  + (account.handle || 
- Exports: renderOverview, renderAccountsModule, renderCampaignsModule, renderPostLibrary, openFanoutDetail, closeFanoutDetail, openAddPlatformDialog, openEditScheduleDialog, cancelFanoutSchedule, openImportModal, renderContentStudio, renderCalendar, renderPublishingCentre, renderCreativeStudio, renderInbox, renderCRM, renderListening, renderAgents, renderAutomation, renderAnalyticsModule, renderCompetitorsModule, renderReports, renderClients, renderApprovals, renderMediaLibrary, renderKnowledge, renderTeam, renderIntegrations, renderSettings, renderAdmin
- Worker routes: none detected

### web/main/orbit-shell.js

- Size: 9693 bytes
- Imports: ./orbit-modules.js
- Exports: initOrbitShell, navigate, currentModule, findModuleByName, renderActiveOrbitModule
- Worker routes: none detected

### web/main/orchestration.js

- Size: 100087 bytes
- Imports: ./helpers.js
- Exports: initOrchestration, ORCHESTRATION_HANDOFFS, HANDLERS, Orchester, EventBus, renderOrchestrationPanel, Archiver, renderArchivesPanel, OrchestrationConsole
- Worker routes: none detected

### web/main/pp.js

- Size: 67751 bytes
- Imports: none detected
- Exports: initPP, PP_DEFAULTS, ppSeedCategoriesAndIndustriesFromV0, PP, bindPPEvents
- Worker routes: none detected

### web/main/projects.js

- Size: 51371 bytes
- Imports: none detected
- Exports: initProjects, getProjectAgreedTotal, getProjectBilledTotal, getProjectPaidTotal, getProjectRemainingTotal, getProjectFinancialProgress, recomputeProjectProgress, bulkGenerateTasksForClient, createAutoWorklog, renderProjects, renderTasks, renderProjectTasksEditor, bindProjectAddTaskButton, renderProjectInstallmentEditor, removeProjectInstallment, renderClientProjectsFeeEditor, openProjectDeliverables
- Worker routes: none detected

### web/main/push-notifications.js

- Size: 19486 bytes
- Imports: firebase/messaging
- Exports: initPushNotifications, PushNotifications
- Worker routes: none detected

### web/main/render-admin.js

- Size: 55719 bytes
- Imports: none detected
- Exports: initRenderAdmin, renderEmployees, renderAssets, renderCompliance, renderUsers, renderDocumentVault, renderActivity, renderTrash, renderSupportTickets, viewTicket, closeTicketView, sendTicketReply, toggleTicketStatus, markTicketResolved, deleteTicket, renderPortalRequests, renderPortalUsers, getViewingTicketId, renderProfile, renderClientsite
- Worker routes: none detected

### web/main/render-dashboard.js

- Size: 80880 bytes
- Imports: none detected
- Exports: initRenderDashboard, renderDashboard, renderDashboardCharts, renderAdminAnalytics, buildNotifications, renderNotifications, renderDashboardNotifications, initDashboardNotifications, surfaceVioraNotification, attachVioraNotificationListener, detachVioraNotificationListener, buildLocalRecommendations, refreshRecommendations, renderRecommendations, scheduleIdleRefresh, renderRecommendationsV2
- Worker routes: none detected

### web/main/render-marketplace.js

- Size: 93665 bytes
- Imports: none detected
- Exports: initRenderMarketplace, getMarketplaceMetrics, getProductSalesMetrics, invalidateMarketplaceMetrics, renderMarketplaceProducts, renderPublicUiProducts, renderMarketplaceOrders, computeMarketAnalytics, invalidateMarketAnalytics, materializeMarketplaceLeads, renderMarketplaceAnalytics, openOrderDetail, renderMyOrders, renderMyWishlist, renderCampaigns, applyCampMediaTypeUI, renderCampaignStats, fetchCampaignStats, connectTikTok, startCampaignStatsAutoRefresh, stopCampaignStatsAutoRefresh, refreshAllCampaignStats, openManualSale, renderMsProductsList, renderMsSummary, updateManualSaleItem, removeManualSaleItem, submitManualSale, addToWishlist, removeFromWishlist, buyFromWishlist
- Worker routes: none detected

### web/main/render-partner.js

- Size: 24570 bytes
- Imports: , 
- Exports: initRenderPartner, renderPartnerTasks, renderPartnerHourly, renderPartnerSchedule, renderPartnerHandoffs, renderPartnerFinancials, renderPartnerActivities, renderPartnerChat, renderPartnerPresence, renderPartnerGames, invalidatePartnerCaches
- Worker routes: none detected

### web/main/render-personal.js

- Size: 20561 bytes
- Imports: none detected
- Exports: initRenderPersonal, computeGoalProgress, personalOwnerFilter, renderPersonalTodos, renderPersonalGoals, renderPersonalSkills, renderGoalMilestoneEditor, invalidatePersonalCaches
- Worker routes: none detected

### web/main/renewal-cron.js

- Size: 15800 bytes
- Imports: ../subscription-schema.js, ./finance.js
- Exports: initRenewalCron, runRenewalCron, getExpiryOverview, bulkNotifyExpiring, RenewalCron
- Worker routes: none detected

### web/main/smart-import.js

- Size: 30380 bytes
- Imports: none detected
- Exports: initSmartImport, setupImportDropzone, abortImport, getImportState
- Worker routes: none detected

### web/main/subscriptions.js

- Size: 68709 bytes
- Imports: none detected
- Exports: initSubscriptions, renderSubscriptions, abortSubscriptionsModals, SubscriptionsAdmin
- Worker routes: none detected

### web/main/sw-bootstrap.js

- Size: 12321 bytes
- Imports: none detected
- Exports: bootServiceWorker, injectNotificationSound, playNotificationSound
- Worker routes: none detected

### web/main/training-admin-bridge.js

- Size: 9832 bytes
- Imports: none detected
- Exports: initTrainingAdminBridge, subscribeTrainingRequests, approveTrainingRequest, rejectTrainingRequest, reopenTrainingRequest, deleteTrainingRequest, renderTrainingRequests
- Worker routes: none detected

### web/main/training.js

- Size: 131042 bytes
- Imports: ${req.name || req.email}, ${course.title}
- Exports: initTraining, setTrainingContext, renderTrainingOverview, renderTrainingRequests, renderTrainingUsers, renderTrainingProgress, renderTrainingQuizzes, viewQuizSubmission, renderTrainingCertificates, renderCertTemplatesGrid, openCourseEditor, renderCeModules, toggleCeQuiz, addQuizQuestion, removeQuizQuestion, updateQuizQuestion, updateQuizOption, setQuizAnswer, addQuizOption, removeQuizOption, updateCeModule, addCeModule, removeCeModule, moveCeModule, saveCourse, deleteCourse, openChecklistEditor, renderCleTasks, updateCleTask, addCleTask, removeCleTask, saveChecklist, openResourceEditor, handleReFile, saveResource, deleteResource, openResourceFile, awardTrainingCertificate, viewTrainingCert, revokeTrainingCertImpl, openCertTemplateEditor, refreshCertTemplateModules, showCertTemplatePreview, paintCertTemplateStamps, saveCertTemplate, deleteCertTemplate, handleCertTemplateImage, renderCertificateImage, openManualAwardModal, T, AutoCertification, setupCertStampDragging, TrainingVioraAPI, bindTrainingEvents
- Worker routes: none detected

### web/main/viora-lazy-libs.js

- Size: 1430 bytes
- Imports: https://cdn.jsdelivr.net/npm/xlsx@0.18.5/xlsx.full.min.js, https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js, https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
- Exports: getXLSX, getJsPDF, getHtml2Canvas
- Worker routes: none detected

### web/main/viora-main-handlers.js

- Size: 217739 bytes
- Imports: none detected
- Exports: buildVioraHandlers
- Worker routes: none detected

### web/main/viora-main-renderers.js

- Size: 84507 bytes
- Imports: none detected
- Exports: renderEmployeeList, initMainRenderers, renderLeads, renderDeals, renderPipelineKanban, renderContracts, renderProposals, renderAppointments, renderPresentations, renderInventory, renderInvoices, renderPayments, renderLedger, renderExpenses, renderPayroll, getFeeSummary, renderPresAttachments, dedupeLeads, syncMarketToLeads, syncBlueprintLeads, syncOrderLeads
- Worker routes: none detected

### web/main/viora-main-wiring.js

- Size: 74034 bytes
- Imports: none detected
- Exports: initMainWiring, attachEvents, attachForms, attachTrainingAndUiEvents, bindSafetyNets
- Worker routes: none detected

### web/main/write-layer.js

- Size: 31877 bytes
- Imports: ./helpers.js
- Exports: initWriteLayer, ValidationError, validateRecord, fingerprintFor, dedupeWriteGuard, directWrite, directDelete, upsertDoc, upsertPersonal, upsertTrackFlat, deletePersonal, deleteTrackFlat, deleteDoc
- Worker routes: none detected

### web/main-clientsite-editor.js

- Size: 37404 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### web/main.js

- Size: 240600 bytes
- Imports: firebase/app, ./main/boot.js, firebase/database, firebase/auth, ./viora-history.js, ./main/helpers.js, ./main/idb.js, ./main/render-dashboard.js, ./main/dashboard-weather.js, ./main/dashboard-kpis.js, ./main/dashboard-attention.js, ./main/write-layer.js, ./main/orchestration.js, ./main/ai-services.js, ./main/finance.js, ./main/push-notifications.js, ./main/smart-import.js, ./main/command-palette.js, ./main/render-admin.js, ./main/subscriptions.js, ./main/render-partner.js, ./main/render-personal.js, ./main/main-subscription-plans.js, ./main/training-admin-bridge.js, ./main/pp.js, ./main/market-content.js, ./main/charts.js, ./main/global-market.js, ./main/modal-utils.js, ./main/projects.js, ./main/contacts.js, ./main/clients.js, ./main/render-marketplace.js, ./main/misc-helpers.js, ./main/viora-main-renderers.js?v=20261112-world-map-mobile-fit, ./main/viora-main-handlers.js, ./main/viora-main-wiring.js, ./main/home-content.js, ./main/employee-profiles.js,  + String(value.profileName || value.from || 
- Exports: none detected
- Worker routes: none detected

### web/mainClient/client-app.js

- Size: 165390 bytes
- Imports: firebase/app, firebase/database, firebase/auth,  + (S.client?.name || S.email),
          body: `${p.name} · KSh ${priceKES.toLocaleString()} · ${orderId}`,
          icon: 
- Exports: none detected
- Worker routes: none detected

### web/mainIndex/app.js

- Size: 63358 bytes
- Imports: https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js, https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js
- Exports: none detected
- Worker routes: none detected

### web/mainIndex/blueprint.js

- Size: 23801 bytes
- Imports: https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js, https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js
- Exports: none detected
- Worker routes: none detected

### web/mainIndex/chatbot.js

- Size: 93575 bytes
- Imports: , EXTERNAL_KB_URL);
    const r = await fetch(EXTERNAL_KB_URL, { cache: 
- Exports: none detected
- Worker routes: none detected

### web/mainIndex/industries.js

- Size: 215121 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### web/mainIndex/site-assistant-loader.js

- Size: 2128 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### web/mainIndex/site-language.js

- Size: 7516 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: /fr/, /fr, /es/, /es, /, /index.html

### web/mainMarket/market.js

- Size: 115341 bytes
- Imports: ../order-modal.js
- Exports: none detected
- Worker routes: none detected

### web/mainPatner/patner.js

- Size: 251339 bytes
- Imports: firebase/app, firebase/database, firebase/auth, ../shared/notification-bus.js,  + profileName(pu), sub: m.text.slice(0,60), time: timeAgo(m.ts), tab:
- Exports: none detected
- Worker routes: none detected

### web/mainPublic/public.js

- Size: 46051 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### web/mainTraining/trainer.js

- Size: 23411 bytes
- Imports: firebase/app, firebase/auth, firebase/database, ../shared/notification-bus.js
- Exports: none detected
- Worker routes: none detected

### web/mainTraining/training.js

- Size: 65618 bytes
- Imports: firebase/app, firebase/auth, firebase/database, ../shared/notification-bus.js
- Exports: none detected
- Worker routes: none detected

### web/order-modal.js

- Size: 21686 bytes
- Imports: none detected
- Exports: initOrderModal, openOrderModal
- Worker routes: none detected

### web/outreach.js

- Size: 82788 bytes
- Imports: https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js, https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js, https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js, +sources.length+
- Exports: none detected
- Worker routes: none detected

### web/public-profile.js

- Size: 12159 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### web/scholar-admin-boot.js

- Size: 66666 bytes
- Imports: firebase/app, firebase/auth, firebase/database, ./main/training.js
- Exports: none detected
- Worker routes: none detected

### web/script.js

- Size: 150422 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### web/shared/notification-bus.js

- Size: 1881 bytes
- Imports: none detected
- Exports: publishVioraEvent
- Worker routes: none detected

### web/shared-app.js

- Size: 15785 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### web/shared-pwa.js

- Size: 5915 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### web/subscription-schema.js

- Size: 9645 bytes
- Imports: none detected
- Exports: SUBSCRIPTION_PATH, LICENSES_PATH, PLAN, STATUS, DEFAULT_GRACE_HOURS, PLAN_DAYS, PLAN_LABELS, STATUS_LABELS, computeEndDate, buildSubscription, validateSubscription, evaluateSubscription, subscriptionPill
- Worker routes: none detected

### web/sw.js

- Size: 23329 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### web/viora-analytics.js

- Size: 2068 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### web/viora-city-sky.js

- Size: 8522 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### web/viora-history.js

- Size: 12638 bytes
- Imports: none detected
- Exports: initHistoryGuard, watchModals, pushModalToHistory, closeTopModalFromHistory, isAnyModalOpen, getOpenModals
- Worker routes: none detected

### web/worker.js

- Size: 5814 bytes
- Imports: cloudflare:workers
- Exports: TranslationRateLimiter
- Worker routes: /api/translate, /api/translation-health, /api/health

### workers/viora-api/index.js

- Size: 259810 bytes
- Imports: none detected
- Exports: none detected
- Worker routes: none detected

### workers/viora-static-next/assets.generated.js

- Size: 220535 bytes
- Imports: none detected
- Exports: EMBEDDED_ASSETS_GZIP_BASE64
- Worker routes: none detected

### workers/viora-static-next/worker.js

- Size: 2152 bytes
- Imports: ./assets.generated.js
- Exports: none detected
- Worker routes: /

### scripts/backup-firebase-rtdb.mjs

- Size: 2502 bytes
- Imports: firebase-admin/app, firebase-admin/database, @aws-sdk/client-s3, node:crypto
- Exports: none detected
- Worker routes: none detected

### scripts/generate-engineering-docs.mjs

- Size: 1796 bytes
- Imports: node:fs, node:path
- Exports: none detected
- Worker routes: none detected

### scripts/restore-firebase-rtdb.mjs

- Size: 2620 bytes
- Imports: firebase-admin/app, firebase-admin/database, @aws-sdk/client-s3, node:crypto
- Exports: none detected
- Worker routes: none detected

### scripts/retain-r2-backups.mjs

- Size: 1438 bytes
- Imports: @aws-sdk/client-s3
- Exports: none detected
- Worker routes: none detected

### scripts/review-changes.mjs

- Size: 1679 bytes
- Imports: node:fs, node:child_process
- Exports: none detected
- Worker routes: none detected

### scripts/viora-engineering-checks.mjs

- Size: 5032 bytes
- Imports: node:fs, node:assert/strict
- Exports: TranslationRateLimiter, EMBEDDED_ASSETS_GZIP_BASE64
- Worker routes: none detected

