/* ═══════════════════════════════════════════════════════════════
   VIORA — DEFAULT TOUR CATEGORIES
   ═══════════════════════════════════════════════════════════════
   Fallback content for the landing tour. If a category has admin
   overrides in homeContent.tour.categories[KEY], those win. If not,
   these defaults render.

   These are placeholders — the admin should replace viewSampleUrl,
   demoUrl, gallery, products and faqs via the Home Content editor
   in main.html.

   Exposes: window.__VIORA_DEFAULT_CATEGORIES
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const C = {

    /* ─── Bucket 1: Run my business ─── */

    'business-mgmt': {
      name: 'Business Management',
      icon: 'fa-building',
      desc: 'Unified ops hub — sales, stock, finance, people.',
      longDesc: 'A complete ERP connecting sales, inventory, finance, HR and reporting in one database. Add modules as you grow — everything shares the same customers, products and data.',
      bullets: ['Unified operations hub', 'Workflow automation', 'Live dashboards'],
      stats: [{ v: '24/7', l: 'visibility' }, { v: '0.4ms', l: 'latency' }, { v: '99.9%', l: 'uptime' }],
      included: ['Sales & orders', 'Inventory & stock', 'Accounting & invoicing', 'Procurement', 'Reporting & dashboards', 'Role-based permissions'],
      marketCategory: 'Business Management Systems',
      viewSampleUrl: '',
      demoUrl: '',
      gallery: [],
      products: [],
      faqs: [],
    },

    'financial': {
      name: 'Financial Management',
      icon: 'fa-coins',
      desc: 'Invoicing, expenses, reconciliation and reporting.',
      longDesc: 'Full double-entry accounting with invoicing, expense tracking, bank reconciliation and tax-ready reports. Kenya VAT and IFRS ready.',
      bullets: ['Double-entry ledger', 'Invoicing & M-Pesa', 'Tax compliance'],
      stats: [{ v: '8.7B', l: 'events/day' }, { v: '0.3ms', l: 'posting' }, { v: '100%', l: 'audit-ready' }],
      included: ['Chart of accounts', 'Invoicing & receipts', 'Expense tracking', 'Bank reconciliation', 'VAT returns', 'P&L, balance sheet, cash flow'],
      marketCategory: 'Business Management Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'operational': {
      name: 'Operational Management',
      icon: 'fa-truck-fast',
      desc: 'Inventory, logistics, projects and field operations.',
      longDesc: 'For the day-to-day engine of your business — inventory, logistics, projects, field teams and service delivery. Ops systems track the physical and procedural side of your company so nothing falls between the cracks.',
      bullets: ['Inventory & logistics', 'Project tracking', 'Field ops'],
      stats: [{ v: '4.1M', l: 'events/sec' }, { v: '0.2ms', l: 'write' }, { v: '∞', l: 'scale' }],
      included: ['Multi-warehouse inventory', 'Barcode scanning', 'Batch & expiry tracking', 'Transfers', 'Cycle counts', 'Delivery tracking'],
      marketCategory: 'Business Management Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'inventory-pos': {
      name: 'POS & Inventory',
      icon: 'fa-cash-register',
      desc: 'Fast in-person selling with real-time stock.',
      longDesc: 'A fast, reliable POS designed for retail shops, restaurants and supermarkets. Works on tablet, desktop or dedicated terminal — with or without internet.',
      bullets: ['Multi-till support', 'Receipt printing', 'Offline mode'],
      stats: [{ v: '2.8K', l: 'stores' }, { v: '0.2ms', l: 'checkout' }, { v: '40+', l: 'payment rails' }],
      included: ['Multi-till', 'Receipt & kitchen printing', 'Offline-first', 'M-Pesa integration', 'Stock sync', 'Cashier reports'],
      marketCategory: 'Retail & Wholesale Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    /* ─── Bucket 1: Vertical industry systems ─── */

    'retail': {
      name: 'Retail & Wholesale',
      icon: 'fa-store',
      desc: 'POS, stock, suppliers — for shops of any size.',
      longDesc: 'Connect POS, stock, suppliers and accounting in one system. A sale at the counter updates the ledger, the reorder list, and the customer\'s purchase history in the same second.',
      bullets: ['Point of sale', 'Real-time stock', 'Supplier management'],
      stats: [{ v: '+22%', l: 'stock accuracy' }, { v: '−85%', l: 'reconciliation' }, { v: '3d', l: 'to live' }],
      included: ['POS with multi-till', 'Real-time inventory', 'Supplier records', 'Purchase orders', 'Customer history', 'Daily sales reports'],
      marketCategory: 'Retail & Wholesale Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'restaurant': {
      name: 'Restaurant & Catering',
      icon: 'fa-utensils',
      desc: 'Kitchen, till and table management.',
      longDesc: 'A full restaurant stack — table bookings, kitchen order tickets, split bills, tips, delivery integrations. Built for how a restaurant actually runs, not how a generic POS thinks it should.',
      bullets: ['Table & kitchen flow', 'Split bills', 'Delivery integrations'],
      stats: [{ v: '+30%', l: 'table turns' }, { v: '−20%', l: 'food waste' }, { v: '2d', l: 'to live' }],
      included: ['Table management', 'Kitchen order tickets', 'Split bills & tips', 'Delivery integrations', 'Menu & pricing', 'Sales reports'],
      marketCategory: 'Restaurant & Catering Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'clinic': {
      name: 'Clinic',
      icon: 'fa-stethoscope',
      desc: 'Patient records, appointments, billing.',
      longDesc: 'Patient records, appointments, prescriptions, billing and statutory compliance — designed for small clinics and dispensaries that need a paper-free workflow without enterprise complexity.',
      bullets: ['Patient records', 'Appointments', 'Billing & receipts'],
      stats: [{ v: '3min', l: 'avg visit' }, { v: '100%', l: 'records searchable' }, { v: '1wk', l: 'to deploy' }],
      included: ['Patient registration', 'Appointments', 'Prescriptions', 'Lab orders', 'Billing & M-Pesa', 'Clinical reports'],
      marketCategory: 'Clinic Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'hospital': {
      name: 'Hospital',
      icon: 'fa-hospital',
      desc: 'Full hospital-grade system.',
      longDesc: 'Full patient journey from reception to discharge — records, appointments, lab orders, pharmacy stock, insurance billing and clinical reporting. Role-based access and audit trails built in.',
      bullets: ['Patient journey', 'Lab & pharmacy', 'Insurance billing'],
      stats: [{ v: '6–10wk', l: 'to deploy' }, { v: '∞', l: 'beds' }, { v: 'AES-512', l: 'encryption' }],
      included: ['Patient records', 'Appointments & wards', 'Lab orders', 'Pharmacy stock', 'Insurance billing', 'Clinical reporting'],
      marketCategory: 'Hospital Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'pharmacy': {
      name: 'Pharmacy',
      icon: 'fa-pills',
      desc: 'Stock, batches, expiry, prescriptions.',
      longDesc: 'Pharmacy point-of-sale combined with batch tracking, expiry alerts, prescription records and statutory compliance. Never sell expired stock again.',
      bullets: ['Batch & expiry', 'Prescriptions', 'M-Pesa payments'],
      stats: [{ v: '−90%', l: 'expired stock' }, { v: '+15%', l: 'margin' }, { v: '1wk', l: 'to live' }],
      included: ['Prescription records', 'Batch & expiry tracking', 'Low-stock alerts', 'Supplier management', 'M-Pesa payments', 'Daily reconciliation'],
      marketCategory: 'Pharmacy Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'school': {
      name: 'School',
      icon: 'fa-school',
      desc: 'Admissions, fees, attendance, exams.',
      longDesc: 'Manage students, staff, fees, timetables and results from one place. Parents get a self-service portal, staff get role-based dashboards, and management gets real-time reporting.',
      bullets: ['Admissions & fees', 'Attendance & exams', 'Parent portal'],
      stats: [{ v: '−70%', l: 'admin hours' }, { v: '3×', l: 'on-time fees' }, { v: '4–6wk', l: 'to deploy' }],
      included: ['Student records', 'Admissions', 'Fee management', 'Attendance', 'Timetables', 'Exams & results', 'Parent portal'],
      marketCategory: 'School Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'hotel': {
      name: 'Hotel & Guest House',
      icon: 'fa-hotel',
      desc: 'Bookings, rooms, restaurant, housekeeping.',
      longDesc: 'A complete hospitality stack — reservations, check-in, room service, restaurant POS, housekeeping and reporting. Built to give small hotels the operational visibility of large chains.',
      bullets: ['Reservations', 'Restaurant POS', 'Housekeeping'],
      stats: [{ v: '+32%', l: 'repeat guests' }, { v: '1', l: 'unified system' }, { v: '5wk', l: 'to launch' }],
      included: ['Reservations', 'Check-in/out', 'Room assignments', 'Restaurant POS', 'Housekeeping', 'Guest history'],
      marketCategory: 'Hotel & Guest House Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'salon': {
      name: 'Salon, Spa & Beauty',
      icon: 'fa-scissors',
      desc: 'Bookings, staff rota, client history, retail.',
      longDesc: 'Appointment booking with reminders, staff commission tracking, service history per client, product retail and a simple till — all in one screen your team can learn in a morning.',
      bullets: ['Bookings & reminders', 'Staff commissions', 'Client history'],
      stats: [{ v: '−45%', l: 'no-shows' }, { v: '+18%', l: 'revenue' }, { v: '2wk', l: 'to launch' }],
      included: ['Online booking', 'SMS reminders', 'Staff commissions', 'Client service history', 'Retail POS', 'Daily reports'],
      marketCategory: 'Salon, Spa & Beauty Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'gym': {
      name: 'Gym & Fitness',
      icon: 'fa-dumbbell',
      desc: 'Memberships, classes, trainers, payments.',
      longDesc: 'Membership management, class scheduling, trainer assignments, attendance tracking and automated billing. Everything a growing gym needs to run without spreadsheets.',
      bullets: ['Memberships', 'Class scheduling', 'Trainer assignments'],
      stats: [{ v: '−30%', l: 'churn' }, { v: '95%', l: 'payment rate' }, { v: '1wk', l: 'to launch' }],
      included: ['Member records', 'Class scheduling', 'Trainer management', 'Attendance tracking', 'Membership billing', 'Progress tracking'],
      marketCategory: 'Gym & Fitness Center Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'garage': {
      name: 'Garage & Automotive',
      icon: 'fa-car',
      desc: 'Repairs, jobs, parts, invoicing.',
      longDesc: 'Job cards, technician assignments, parts inventory, service history and invoicing. Built for garages and workshops that want to stop losing jobs and parts in notebooks.',
      bullets: ['Job cards', 'Parts inventory', 'Service history'],
      stats: [{ v: '+25%', l: 'jobs tracked' }, { v: '−40%', l: 'parts loss' }, { v: '1wk', l: 'to deploy' }],
      included: ['Job cards', 'Technician assignments', 'Parts inventory', 'Service history', 'Invoicing', 'Customer reminders'],
      marketCategory: 'Garage & Automotive Service Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'veterinary': {
      name: 'Veterinary Practice',
      icon: 'fa-paw',
      desc: 'Patients, appointments, prescriptions.',
      longDesc: 'Patient (animal) records, owner history, appointments, prescriptions, vaccinations and billing. Designed for small animal clinics and mixed practices.',
      bullets: ['Patient records', 'Appointments', 'Vaccinations'],
      stats: [{ v: '3min', l: 'avg visit' }, { v: '100%', l: 'records searchable' }, { v: '1wk', l: 'to live' }],
      included: ['Animal records', 'Owner history', 'Appointments', 'Prescriptions', 'Vaccinations', 'Billing'],
      marketCategory: 'Veterinary Practice Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'farm': {
      name: 'Farm',
      icon: 'fa-seedling',
      desc: 'Produce, livestock, sales, traceability.',
      longDesc: 'Track produce and livestock, record customer orders, manage sales, and generate reports that keep operations honest. Designed for small-to-medium farms and co-ops.',
      bullets: ['Produce tracking', 'Sales & customers', 'Reports'],
      stats: [{ v: '4×', l: 'traceability' }, { v: '−90%', l: 'errors' }, { v: '2wk', l: 'to deploy' }],
      included: ['Crop & livestock records', 'Harvest tracking', 'Customer orders', 'Sales management', 'Buyer records', 'Production reports'],
      marketCategory: 'Farm Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'construction': {
      name: 'Construction',
      icon: 'fa-hard-hat',
      desc: 'Projects, materials, contractors, billing.',
      longDesc: 'Multi-site project tracking, material inventory, contractor management, milestone billing and client reporting. Built for contractors who need to see profitability per site.',
      bullets: ['Multi-site projects', 'Materials & contractors', 'Milestone billing'],
      stats: [{ v: '−25%', l: 'material waste' }, { v: '+15%', l: 'margin' }, { v: '4wk', l: 'to deploy' }],
      included: ['Project tracking', 'Material inventory', 'Contractor management', 'Milestone billing', 'Site reports', 'Client portal'],
      marketCategory: 'Construction Project Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'real-estate': {
      name: 'Real Estate Agency',
      icon: 'fa-house',
      desc: 'Listings, viewings, rent, commissions.',
      longDesc: 'Manage listings, track viewings, automate rent and commission collection, and give landlords a self-service portal. Everything a growing agency needs.',
      bullets: ['Listings & viewings', 'Rent & arrears', 'Landlord portal'],
      stats: [{ v: '−70%', l: 'rent arrears' }, { v: '+15%', l: 'occupancy' }, { v: '2wk', l: 'to launch' }],
      included: ['Property listings', 'Viewing scheduling', 'Tenant records', 'Rent & arrears', 'Commission tracking', 'Landlord portal'],
      marketCategory: 'Real Estate Agency Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'funeral': {
      name: 'Funeral Home',
      icon: 'fa-cross',
      desc: 'Case management, staff, transport, billing.',
      longDesc: 'Case management for funeral homes — intake, transport, staff assignments, billing and client communication. Sensitive, private, and built for how morticians actually work.',
      bullets: ['Case management', 'Transport logistics', 'Client billing'],
      stats: [{ v: '100%', l: 'confidential' }, { v: '−30%', l: 'admin time' }, { v: '1wk', l: 'to deploy' }],
      included: ['Case records', 'Transport scheduling', 'Staff assignments', 'Client billing', 'Client communications', 'Reports'],
      marketCategory: 'Funeral Home Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'laundry': {
      name: 'Laundry & Dry Cleaning',
      icon: 'fa-shirt',
      desc: 'Orders, tracking, pickup, delivery.',
      longDesc: 'Order intake, item tracking, pickup and delivery scheduling, and customer notifications. Built for laundries that want to scale without losing track of a single garment.',
      bullets: ['Order tracking', 'Pickup & delivery', 'Customer notifications'],
      stats: [{ v: '−50%', l: 'lost items' }, { v: '+25%', l: 'turnaround' }, { v: '1wk', l: 'to live' }],
      included: ['Order intake', 'Item tracking', 'Pickup & delivery', 'Customer notifications', 'Loyalty', 'Reports'],
      marketCategory: 'Laundry & Dry Cleaning Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'security': {
      name: 'Security Company',
      icon: 'fa-shield-halved',
      desc: 'Guards, sites, patrols, incident reports.',
      longDesc: 'Guard scheduling, site assignment, patrol tracking, incident reporting and client invoicing. Designed for security companies that deploy teams across multiple sites.',
      bullets: ['Guard rota', 'Patrol tracking', 'Incident reports'],
      stats: [{ v: '−35%', l: 'no-shows' }, { v: '+20%', l: 'client retention' }, { v: '2wk', l: 'to deploy' }],
      included: ['Guard scheduling', 'Site assignments', 'Patrol tracking', 'Incident reports', 'Client billing', 'Site reports'],
      marketCategory: 'Security Company Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'cleaning': {
      name: 'Cleaning Operations',
      icon: 'fa-broom',
      desc: 'Jobs, teams, supplies, client billing.',
      longDesc: 'Job scheduling, team assignments, supply inventory, and client billing. Perfect for cleaning companies running multiple residential and commercial sites.',
      bullets: ['Job scheduling', 'Team assignment', 'Client billing'],
      stats: [{ v: '+30%', l: 'jobs tracked' }, { v: '−20%', l: 'supply waste' }, { v: '1wk', l: 'to deploy' }],
      included: ['Job scheduling', 'Team assignments', 'Supply inventory', 'Client billing', 'Before/after photos', 'Reports'],
      marketCategory: 'Cleaning Operations Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'greenhouse': {
      name: 'Greenhouse',
      icon: 'fa-leaf',
      desc: 'Climate, crops, sensors, yield.',
      longDesc: 'Climate control monitoring, crop cycle tracking, sensor data, and yield forecasting. For greenhouse operators who want data-driven agriculture.',
      bullets: ['Climate monitoring', 'Crop cycles', 'Yield forecasting'],
      stats: [{ v: '+20%', l: 'yield' }, { v: '−15%', l: 'energy cost' }, { v: '3wk', l: 'to deploy' }],
      included: ['Climate monitoring', 'Crop cycles', 'Sensor integration', 'Harvest tracking', 'Yield reports', 'Alerts'],
      marketCategory: 'Greenhouse Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'photography': {
      name: 'Photography Studio',
      icon: 'fa-camera',
      desc: 'Bookings, shoots, galleries, invoicing.',
      longDesc: 'Session bookings, shoot calendars, client galleries, download tracking and invoicing. Built for photographers who want to spend more time shooting and less on admin.',
      bullets: ['Session bookings', 'Client galleries', 'Invoicing'],
      stats: [{ v: '+40%', l: 'bookings' }, { v: '−60%', l: 'admin time' }, { v: '1wk', l: 'to launch' }],
      included: ['Session bookings', 'Shoot calendar', 'Client galleries', 'Download tracking', 'Invoicing', 'Contracts'],
      marketCategory: 'Photography Studio Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'event': {
      name: 'Event Planning',
      icon: 'fa-calendar-check',
      desc: 'Events, vendors, attendees, billing.',
      longDesc: 'Event scheduling, vendor management, attendee tracking, budget control and post-event reporting. Designed for event planners running multiple simultaneous events.',
      bullets: ['Event scheduling', 'Vendor management', 'Attendee tracking'],
      stats: [{ v: '+25%', l: 'events handled' }, { v: '−15%', l: 'budget overruns' }, { v: '1wk', l: 'to deploy' }],
      included: ['Event scheduling', 'Vendor management', 'Attendee tracking', 'Budget control', 'Checklists', 'Post-event reports'],
      marketCategory: 'Event Planning Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'recruitment': {
      name: 'Recruitment Agency',
      icon: 'fa-user-tie',
      desc: 'Candidates, clients, placements, fees.',
      longDesc: 'Candidate database, client requirements, placement tracking and fee invoicing. Built for recruitment agencies who need to move faster than spreadsheets allow.',
      bullets: ['Candidate database', 'Placement tracking', 'Fee invoicing'],
      stats: [{ v: '3×', l: 'placements' }, { v: '−40%', l: 'time-to-hire' }, { v: '2wk', l: 'to deploy' }],
      included: ['Candidate database', 'Client requirements', 'Interview tracking', 'Placement tracking', 'Fee invoicing', 'Reports'],
      marketCategory: 'Recruitment Agency Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'travel': {
      name: 'Travel & Tours',
      icon: 'fa-plane',
      desc: 'Bookings, itineraries, payments, docs.',
      longDesc: 'Tour package management, booking intake, itinerary generation, payment tracking and traveller documentation. Built for tour operators and travel agencies.',
      bullets: ['Tour packages', 'Bookings', 'Itineraries'],
      stats: [{ v: '+30%', l: 'bookings' }, { v: '−50%', l: 'paperwork' }, { v: '2wk', l: 'to deploy' }],
      included: ['Tour packages', 'Bookings', 'Itinerary generation', 'Payment tracking', 'Traveller docs', 'Reports'],
      marketCategory: 'Travel Agency & Tour Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'printing': {
      name: 'Printing & Graphics',
      icon: 'fa-print',
      desc: 'Jobs, quotes, materials, delivery.',
      longDesc: 'Job intake, quote generation, material tracking, production scheduling and delivery tracking. Built for print shops that juggle dozens of jobs daily.',
      bullets: ['Job intake', 'Quote generation', 'Material tracking'],
      stats: [{ v: '+25%', l: 'jobs tracked' }, { v: '−20%', l: 'material waste' }, { v: '1wk', l: 'to deploy' }],
      included: ['Job intake', 'Quote generation', 'Material inventory', 'Production scheduling', 'Delivery tracking', 'Client reports'],
      marketCategory: 'Printing & Graphics Production Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    /* ─── Bucket 1: Professional practice ─── */

    'law': {
      name: 'Law Firms',
      icon: 'fa-scale-balanced',
      desc: 'Matters, billable time, documents, billing.',
      longDesc: 'Matter management, billable time tracking, document library and invoice generation. Built for law firms that want to capture every billable hour.',
      bullets: ['Matter management', 'Billable time', 'Document library'],
      stats: [{ v: '+32%', l: 'billable hours' }, { v: '0', l: 'missed deadlines' }, { v: '6hr', l: 'saved/week' }],
      included: ['Matter records', 'Time tracking', 'Document library', 'Billing & invoicing', 'Court dates', 'Client portal'],
      marketCategory: 'Professional Practice Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'architecture': {
      name: 'Architecture & Design',
      icon: 'fa-compass-drafting',
      desc: 'Projects, drawings, revisions, billing.',
      longDesc: 'Project tracking, drawing revisions, client approvals and milestone billing. Built for architecture and design practices.',
      bullets: ['Project tracking', 'Drawing revisions', 'Milestone billing'],
      stats: [{ v: '+20%', l: 'project velocity' }, { v: '−30%', l: 'rework' }, { v: '3wk', l: 'to deploy' }],
      included: ['Project records', 'Drawing revisions', 'Client approvals', 'Milestone billing', 'Contractor coordination', 'Portfolio'],
      marketCategory: 'Professional Practice Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'insurance': {
      name: 'Insurance',
      icon: 'fa-umbrella',
      desc: 'Policies, claims, premiums, renewals.',
      longDesc: 'Policy management, claims processing, premium tracking and renewal reminders. Built for insurance brokers and agencies.',
      bullets: ['Policy management', 'Claims processing', 'Renewal reminders'],
      stats: [{ v: '+25%', l: 'renewals' }, { v: '−40%', l: 'claims time' }, { v: '2wk', l: 'to deploy' }],
      included: ['Policy records', 'Claims processing', 'Premium tracking', 'Renewal reminders', 'Client communications', 'Reports'],
      marketCategory: 'Professional Practice Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    /* ─── Bucket 2: Storefronts ─── */

    'ecommerce': {
      name: 'Ecommerce Website',
      icon: 'fa-cart-shopping',
      desc: 'Sell online — catalogue, cart, checkout, M-Pesa.',
      longDesc: 'A complete online store — product catalogue, cart, checkout, payments, order management — connected to your VIORA inventory and accounting.',
      bullets: ['Catalogue & checkout', 'Cards + M-Pesa', 'Order sync'],
      stats: [{ v: '2.8K', l: 'stores' }, { v: '0.2ms', l: 'checkout' }, { v: '40+', l: 'payment rails' }],
      included: ['Product catalogue', 'Cart & checkout', 'M-Pesa & card', 'Order sync', 'Stock sync', 'Delivery integration'],
      marketCategory: 'Ecommerce Website',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'commerce': {
      name: 'Digital Commerce',
      icon: 'fa-store',
      desc: 'Full commerce stack — storefront to fulfilment.',
      longDesc: 'A complete commerce platform — multiple storefronts, fulfilment, returns, delivery tracking and reporting — all connected to the rest of VIORA.',
      bullets: ['Multi-storefront', 'Fulfilment', 'Returns & delivery'],
      stats: [{ v: '2.8K', l: 'stores' }, { v: '0.2ms', l: 'checkout' }, { v: '40+', l: 'rails' }],
      included: ['Multi-storefront', 'Cart & checkout', 'Fulfilment', 'Returns', 'Delivery tracking', 'Reports'],
      marketCategory: 'Digital Commerce Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'online-stores': {
      name: 'Online Stores',
      icon: 'fa-shop',
      desc: 'Branded online stores for your products.',
      longDesc: 'Multi-store management — run several branded storefronts from one dashboard. Perfect for franchises and multi-brand retailers.',
      bullets: ['Multi-store', 'Custom domains', 'Payment gateways'],
      stats: [{ v: '2.8K', l: 'stores' }, { v: '0.2ms', l: 'checkout' }, { v: '40+', l: 'rails' }],
      included: ['Multi-store', 'Custom domains', 'Payment gateways', 'Shipping rates', 'Discount codes', 'Store analytics'],
      marketCategory: 'Retail & Wholesale Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    /* ─── Bucket 2: Web experiences ─── */

    'web3d': {
      name: '3D Websites',
      icon: 'fa-cube',
      desc: 'Immersive WebGL sites — product tours, showrooms.',
      longDesc: 'Interactive, WebGL-powered websites that let visitors explore your product, space, or brand in three dimensions. Built for businesses that need to stand out — real estate, hospitality, manufacturing, architecture.',
      bullets: ['WebGL product tours', 'Scroll stories', '60fps mobile'],
      stats: [{ v: '60fps', l: 'render' }, { v: '<2s', l: 'load' }, { v: '340%', l: 'engagement' }],
      included: ['3D product viewer', 'Scroll animations', 'Mobile WebGL', 'Performance optimised', 'SEO friendly', 'Analytics'],
      marketCategory: '3D Websites',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'web': {
      name: 'General Websites',
      icon: 'fa-globe',
      desc: 'Corporate sites, landing pages, CMS.',
      longDesc: 'Custom-designed, fast-loading websites built to convert. Blog, CMS, contact forms, SEO and analytics — all included.',
      bullets: ['Corporate sites', 'Landing pages', 'CMS'],
      stats: [{ v: '100', l: 'Lighthouse' }, { v: '<1.2s', l: 'load' }, { v: 'SEO', l: 'optimised' }],
      included: ['Custom design', 'CMS', 'SEO', 'Contact forms', 'Analytics', 'Mobile responsive'],
      marketCategory: 'General Websites',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'entertainment-web': {
      name: 'Entertainment Websites',
      icon: 'fa-film',
      desc: 'Interactive sites for media and entertainment.',
      longDesc: 'Interactive entertainment sites — video galleries, ticketing, streaming embeds, audience engagement. Built for musicians, production houses, and entertainment brands.',
      bullets: ['Media galleries', 'Ticketing', 'Streaming embeds'],
      stats: [{ v: '+50%', l: 'engagement' }, { v: '<2s', l: 'load' }, { v: '∞', l: 'media' }],
      included: ['Media galleries', 'Ticketing', 'Streaming embeds', 'Artist profiles', 'Merch store', 'Analytics'],
      marketCategory: 'Entertainment Websites',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    /* ─── Bucket 2: Media & branding ─── */

    'video': {
      name: 'Video Advertisements',
      icon: 'fa-video',
      desc: 'Motion graphics, product demos, brand films.',
      longDesc: 'Short-form promotional videos for social media, TV, and digital campaigns — motion graphics, product demos, and brand films. Scripted, shot or animated, and delivered in every aspect ratio your channels need.',
      bullets: ['Motion graphics', 'Product demos', 'Multi-format'],
      stats: [{ v: '4K', l: 'resolution' }, { v: '15–60s', l: 'formats' }, { v: '3x', l: 'engagement' }],
      included: ['Scripting', 'Motion graphics', 'Product demos', 'Voiceover', 'Multi-format delivery', 'Revisions'],
      marketCategory: 'Video Advertisements',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'graphics': {
      name: 'Graphics Design',
      icon: 'fa-palette',
      desc: 'Brand identity, UI assets, marketing collateral.',
      longDesc: 'Brand identity, logos, UI assets, social media graphics, packaging, and print collateral. Design that makes your business look as good as it actually is — consistent across every touchpoint.',
      bullets: ['Brand identity', 'UI assets', 'Marketing collateral'],
      stats: [{ v: '1.8K', l: 'assets' }, { v: '48h', l: 'turnaround' }, { v: '100%', l: 'vector' }],
      included: ['Logo design', 'Brand guidelines', 'Colour palette', 'Typography', 'Business cards', 'Social media kits'],
      marketCategory: 'Graphics Design',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'branding': {
      name: 'Branding',
      icon: 'fa-pen-nib',
      desc: 'Full brand identity from scratch.',
      longDesc: 'Full brand identity — logo, colours, typography, and a complete kit of marketing collateral, ready to use across web and print.',
      bullets: ['Logo & identity', 'Guidelines', 'Full collateral'],
      stats: [{ v: '1.8K', l: 'assets' }, { v: '2wk', l: 'to deliver' }, { v: '100%', l: 'vector' }],
      included: ['Brand strategy', 'Logo design', 'Visual identity', 'Brand guidelines', 'Marketing collateral', 'Source files'],
      marketCategory: 'Graphics Design',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    /* ─── Bucket 3: Custom software ─── */

    'custom': {
      name: 'Custom Software',
      icon: 'fa-code',
      desc: 'Bespoke systems built around your exact processes.',
      longDesc: 'When off-the-shelf doesn\'t fit, we build exactly what you need — from internal tools to full enterprise systems. Discovery, design, build, launch, support.',
      bullets: ['Discovery workshop', 'Custom design', 'Full-stack build'],
      stats: [{ v: '100+', l: 'delivered' }, { v: '4–12wk', l: 'to launch' }, { v: 'SLA', l: 'backed' }],
      included: ['Discovery workshop', 'Custom design', 'Full-stack build', 'Testing & QA', 'Deployment', 'Support & SLA'],
      marketCategory: 'Business Management Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'enterprise': {
      name: 'Enterprise Systems',
      icon: 'fa-shield-halved',
      desc: 'Complex, multi-site, multi-role systems.',
      longDesc: 'Custom-built systems for organisations with unique workflows — hospitals, schools, cooperatives, logistics firms, government agencies. When off-the-shelf software can\'t fit, we build the system that does.',
      bullets: ['Custom workflows', 'Complex integrations', 'Compliance ready'],
      stats: [{ v: '120K', l: 'users' }, { v: '0.8ms', l: 'latency' }, { v: 'AES-512', l: 'encryption' }],
      included: ['Custom workflows', 'Complex integrations', 'Compliance controls', 'Audit trails', 'Multi-role access', 'Enterprise support'],
      marketCategory: 'Business Management Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'api': {
      name: 'API Integrations',
      icon: 'fa-plug',
      desc: 'Connect VIORA to the tools you already use.',
      longDesc: 'Connect your VIORA systems to M-Pesa, Stripe, QuickBooks, Shopify, Google Workspace, WhatsApp — plus any custom API.',
      bullets: ['REST APIs', 'Webhooks', 'Third-party sync'],
      stats: [{ v: '40+', l: 'integrations' }, { v: '<100ms', l: 'latency' }, { v: '24/7', l: 'monitoring' }],
      included: ['REST API', 'Webhooks', 'M-Pesa', 'Stripe', 'QuickBooks', 'Zapier'],
      marketCategory: 'Business Management Systems',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    /* ─── Bucket 3: AI & intelligence ─── */

    'ai-assistant': {
      name: 'AI Assistant',
      icon: 'fa-robot',
      desc: 'Conversational AI trained on your data.',
      longDesc: 'A conversational AI that answers questions, retrieves knowledge, and takes action across your systems. Deployed on your website, WhatsApp, or internal tools — trained on your data, not the open internet.',
      bullets: ['Knowledge retrieval', 'Task automation', 'Multi-channel'],
      stats: [{ v: '<1s', l: 'response' }, { v: '24/7', l: 'availability' }, { v: '92%', l: 'resolution' }],
      included: ['Knowledge retrieval', 'Task automation', 'Web + WhatsApp + voice', 'Custom training', 'Analytics', 'Privacy controls'],
      marketCategory: 'A.I Assistant',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'ai-automation': {
      name: 'AI & Automation',
      icon: 'fa-wand-magic-sparkles',
      desc: 'Workflow automation and ML integrations.',
      longDesc: 'Workflow automation and machine-learning integrations that remove repetitive work and surface decisions. From invoice matching to predictive alerts, we automate the boring parts so your team can focus on the real work.',
      bullets: ['Workflow triggers', 'LLM integration', 'Decision engines'],
      stats: [{ v: '850', l: 'models' }, { v: '14ms', l: 'inference' }, { v: '∞', l: 'runs/day' }],
      included: ['Visual workflow builder', 'Conditional logic', 'LLM integration', 'Email & SMS actions', 'Approval chains', 'Audit log'],
      marketCategory: 'AI & Automation',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'ai-analytics': {
      name: 'AI Analytics',
      icon: 'fa-chart-line',
      desc: 'Predictive reports and business intelligence.',
      longDesc: 'AI-powered analytics that go beyond dashboards — forecasts, anomaly detection, cohort analysis, and natural-language business questions.',
      bullets: ['Forecasting', 'Anomaly detection', 'Natural language queries'],
      stats: [{ v: '92%', l: 'accuracy' }, { v: '<1s', l: 'queries' }, { v: '∞', l: 'dashboards' }],
      included: ['Forecasting', 'Anomaly detection', 'Cohort analysis', 'Natural language queries', 'Automated reports', 'Alerts'],
      marketCategory: 'AI & Automation',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    /* ─── Bucket 3: Mobile ─── */

    'android': {
      name: 'Android Apps',
      icon: 'fa-mobile-screen',
      desc: 'Native Android apps for field, shop, customer.',
      longDesc: 'Native Android apps built for the field, the shop floor, or the customer\'s pocket. Offline-first where needed, with push notifications, mobile payments, and real-time sync back to your central systems.',
      bullets: ['Native performance', 'Offline sync', 'Push & payments'],
      stats: [{ v: '1.2K', l: 'devices' }, { v: '0.1ms', l: 'touch' }, { v: '24/7', l: 'sync' }],
      included: ['Native Android', 'Offline support', 'Push notifications', 'M-Pesa integration', 'Play Store submission', 'Analytics'],
      marketCategory: 'Android Applications',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

    'mobile-apps': {
      name: 'Mobile Applications',
      icon: 'fa-mobile-screen-button',
      desc: 'iOS and Android cross-platform apps.',
      longDesc: 'iOS and Android apps built natively or with React Native — push notifications, offline support, app store submission included.',
      bullets: ['iOS & Android', 'React Native', 'App store submission'],
      stats: [{ v: '1.2K', l: 'devices' }, { v: '0.1ms', l: 'touch' }, { v: '24/7', l: 'sync' }],
      included: ['iOS & Android', 'React Native', 'Push notifications', 'Offline support', 'App store submission', 'Analytics'],
      marketCategory: 'Android Applications',
      viewSampleUrl: '', demoUrl: '', gallery: [], products: [], faqs: [],
    },

  };

  window.__VIORA_DEFAULT_CATEGORIES = C;
})();