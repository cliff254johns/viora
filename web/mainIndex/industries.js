/* industries.js — categories, sub-industry blueprints, module definitions */
(function () {
    "use strict";

    window.CATEGORIES = [
        { key: "enterprise", em: "🏢", name: "VIORA Enterprise Solutions" },
        { key: "institutional", em: "🏛️", name: "VIORA Institutional Solutions" },
        { key: "hospitality", em: "🏨", name: "VIORA Hospitality Solutions" },
        { key: "property", em: "🏗️", name: "VIORA Property & Infrastructure Solutions" },
        { key: "industry", em: "⚙️", name: "VIORA Industry & Operations Solutions" },
        { key: "business", em: "✨", name: "VIORA Business & Lifestyle Solutions" }
    ];

    window.INDUSTRIES = {
        retail: { em: "🛒", name: "Retail Shop", cat: "retail_trade",
            problem: "You're guessing what to reorder, losing sales to stockouts, and finding out too late that yesterday's cash doesn't match the till. Customer preferences live in your head, supplier debts are tracked on the back of a notebook, and month-end is a panic of counting and re-counting.",
            solutions: [
                "Real-time inventory tracking — every sale decrements stock instantly, and auto-reorder alerts fire before you run out of best-sellers",
                "M-Pesa + cash reconciliation at the till — every payment is matched to its invoice automatically, so the day's money always adds up",
                "Sales analytics by product, hour, and staff — see exactly what sells, when, and which employee closed the sale",
                "Customer loyalty engine — track repeat buyers, send targeted offers via SMS/WhatsApp, and turn one-time shoppers into regulars",
                "Supplier ledger with payment reminders — never miss a supplier payment, and never overpay twice",
                "Finance portal — real-time P&L, cash-flow forecast, VAT computation, and one-click eTIMS invoices"
            ],
            modules: ["business", "public", "client", "product", "finance"],
            changes: [
                "Never run out of best-sellers — auto-reorder alerts fire at the right time, every time",
                "Know your true margins daily, not at month-end — the dashboard updates live as you sell",
                "Accept M-Pesa with zero reconciliation work — payments auto-match to invoices",
                "Build a customer base you actually own — every buyer is a contact you can reach again",
                "Close the till in 2 minutes, not 2 hours — cash, M-Pesa, and card reconcile automatically",
                "File VAT and eTIMS without a scramble — the Finance portal computes and submits"
            ]
        },

        minimart: { em: "🏪", name: "Minimart / Duka", cat: "retail_trade",
            problem: "Your duka runs on memory and trust: you know roughly what's in stock, who owes you, and what sold yesterday. But suppliers shortchange you, customers dispute prices, and the day's cash rarely matches what the drawer should hold.",
            solutions: [
                "Barcode-based POS that works offline — keep selling through power cuts, and sync automatically when you're back online",
                "Supplier ledgers with payment reminders — know exactly who you owe and when it's due",
                "Customer credit tracking with SMS reminders — recover debts without awkward conversations",
                "Daily sales + stock reports sent to your phone — know your numbers without counting anything",
                "Simple loyalty for repeat customers — reward the people who keep your duka alive",
                "Finance portal — daily profit summary, cash-flow forecast, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "finance"],
            changes: [
                "Close the till in minutes, not hours — the system totals cash, M-Pesa, and credit automatically",
                "Know who owes what at a glance — customer credit tracking replaces the notebook",
                "Reward repeat customers without remembering faces — the loyalty engine handles it",
                "Order exactly what sells — stock reports show you what moved and what didn't",
                "Never argue about prices again — every price is in the system, printed on every receipt",
                "See your daily profit live — know the day's margin while it's still happening"
            ]
        },

        supermarket: { em: "🛍️", name: "Supermarket", cat: "retail_trade",
            problem: "Running a supermarket means juggling 4,000+ SKUs, dozens of suppliers, expiry dates, staff shifts, and shrinkage you can feel but can't prove. Expired goods eat your margin, staff theft is invisible, and by the time you notice a supplier is overcharging, you've paid them for three months.",
            solutions: [
                "Multi-aisle inventory with batch + expiry tracking — get alerts before goods expire, and never sell a customer expired stock",
                "Supplier portal with automated purchase orders — POs go out automatically when stock hits reorder points",
                "Loss prevention analytics + staff audit trails — see every void, discount, and no-sale, tied to the employee who made it",
                "Category-level P&L — know which aisles make money and which ones drain your cash",
                "Staff scheduling + role-based access — control who can approve refunds, void sales, or access cash",
                "Finance portal — multi-branch consolidated P&L, cash-flow forecasting, and statutory filings"
            ],
            modules: ["business", "partner", "client", "product", "training", "finance"],
            changes: [
                "Reduce shrinkage by 20–40% — audit trails expose every unexplained loss",
                "Automate purchase orders to suppliers — POs generate themselves when stock runs low",
                "Track staff performance and training — know who's selling and who needs coaching",
                "Never sell expired goods — expiry alerts fire 30/60/90 days before it's a problem",
                "Month-end counts take hours, not days — the system has already tracked everything",
                "Consolidate multi-branch P&L — one Finance dashboard for every store"
            ]
        },

        wholesaler: { em: "📦", name: "Wholesaler", cat: "retail_trade",
            problem: "Your business is credit: retailers take stock now and pay later. But without a system, you're chasing payments you're not sure are due, extending credit to shops already over their limit, and losing track of which retailer ordered what.",
            solutions: [
                "Bulk order processing with tiered pricing — orders in minutes, with customer-specific price lists applied automatically",
                "Delivery route tracking + scheduling — dispatch drivers with optimized routes and know when each order arrives",
                "Credit limit enforcement + aging reports — the system blocks sales to over-limit retailers and shows you exactly who's overdue",
                "Retailer portal for self-service ordering — your best customers order on their own, and you get the order in the system",
                "Sales rep performance tracking — see which reps bring in the most volume and which retailers they serve",
                "Finance portal — receivables aging, cash-flow forecasting, and credit risk scoring"
            ],
            modules: ["business", "partner", "client", "product", "finance"],
            changes: [
                "Process bulk orders in minutes, not hours — every SKU, tier, and discount is handled by the system",
                "Know which retailers are overdue instantly — aging reports update live, not monthly",
                "Optimize delivery routes — cut fuel and time by dispatching smarter",
                "Extend credit with confidence — the system enforces your limits, so you don't have to",
                "Scale your sales team without losing control — every rep, order, and customer is visible",
                "Forecast cash with precision — Finance portal shows you exactly when money arrives"
            ]
        },

        hardware: { em: "🔨", name: "Hardware Store", cat: "retail_trade",
            problem: "A hardware store has thousands of small SKUs — most of them slow-moving, some critical, all hard to count. Contractors expect quotes on the spot, buy on credit, and expect you to know their account balance.",
            solutions: [
                "Advanced SKU search + categorization — find any item by name, size, or category in seconds",
                "Project-based quoting + invoicing — build quotes for contractors with the exact items and quantities they need",
                "Contractor accounts with credit tracking — see each contractor's balance, limit, and payment history at a glance",
                "Dead stock analysis — identify items that haven't sold in 6+ months and clear them before they tie up cash",
                "Supplier price comparison — track which supplier gives you the best price for each category",
                "Finance portal — margin analysis per SKU, cash-flow forecast, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "partner", "finance"],
            changes: [
                "Quote projects accurately in seconds — pull items, quantities, and prices without leaving your seat",
                "Track contractor credit and payments — no more guessing who owes what",
                "Reduce dead stock with AI insights — clear slow-movers before they eat your cash",
                "Serve contractors faster — search by any attribute, not just item name",
                "Know your best suppliers — compare prices across your vendor list",
                "Price for profit — Finance portal shows real margin per project"
            ]
        },

        electronics: { em: "📱", name: "Electronics Shop", cat: "retail_trade",
            problem: "Every phone, laptop, or TV in your shop has a serial number, a warranty, and a theft risk. But without tracking, you can't tell which unit came from which supplier, which is still under warranty, or whether a customer's return is genuine.",
            solutions: [
                "Serial number tracking per unit — know exactly which unit came in, which went out, and when",
                "Warranty + returns management — every sale records the warranty period, so claims are quick and provable",
                "Security alerts for high-value stock — get notified when expensive items move, in or out",
                "Customer history per device — see every device a customer has bought, and offer upgrades at the right time",
                "Supplier reconciliation — match invoices to units received, and catch discrepancies immediately",
                "Finance portal — real-time P&L, working capital tracking, and eTIMS invoices"
            ],
            modules: ["business", "client", "product", "finance"],
            changes: [
                "Track every unit from purchase to sale — full lifecycle visibility on every device",
                "Process warranty claims without paperwork — the system knows the sale date and terms",
                "Reduce theft with real-time stock alerts — high-value items are watched 24/7",
                "Upsell smarter — customer device history shows you the right moment",
                "Catch supplier errors immediately — units received are matched against invoices automatically",
                "Know your true margin — Finance portal tracks cost, sale, and profit per unit"
            ]
        },

        liquorstore: { em: "🍷", name: "Liquor Store", cat: "retail_trade",
            problem: "Liquor retail is heavily regulated, high-shrinkage, and cash-heavy. You're dealing with licensing requirements, age verification laws, and shrinkage you can't quite explain.",
            solutions: [
                "Compliance reporting + license tracking — every regulatory deadline, renewal, and requirement in one dashboard",
                "Shrinkage analytics + audit trails — see exactly when and where stock disappears, tied to shift and employee",
                "Supplier management + delivery tracking — reconcile deliveries against invoices, and flag shortages immediately",
                "Age verification logging — every age-restricted sale is recorded with a timestamp",
                "Shift-based cash reconciliation — know exactly how much cash each shift should have handed over",
                "Finance portal — excise duty tracking, VAT computation, and audit-ready reports"
            ],
            modules: ["business", "partner", "client", "finance"],
            changes: [
                "Stay compliant with zero paperwork — licenses, renewals, and audits all tracked",
                "Know your shrinkage sources instantly — analytics reveal exactly where stock is lost",
                "Automate supplier reordering — POs go out when stock runs low, at your agreed prices",
                "Pass audits without panic — every sale, shift, and delivery is documented",
                "Protect your license — age verification and compliance logs are always ready",
                "Compute excise duty automatically — Finance portal handles the maths"
            ]
        },

        shoe_shop: { em: "👟", name: "Shoe Shop", cat: "retail_trade",
            problem: "Shoes come in a matrix: size × color × style. A missing size means a lost sale, and a wrong order means slow-moving stock. Seasonal demand swings are brutal — you over-order for a hot style, then get stuck with the leftovers.",
            solutions: [
                "Matrix inventory (size × color × style) — see exactly which combinations you have, and which to reorder",
                "Seasonal demand forecasting — order the right volume for each season based on your own sales history",
                "Easy returns + exchange processing — exchanges are quick, and the inventory updates automatically",
                "Fast-moving style alerts — get notified when a style is selling out and needs urgent restocking",
                "Customer size + preference history — remember who bought what size, and reach them when matching stock arrives",
                "Finance portal — seasonal profitability, cash-flow forecast, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "finance"],
            changes: [
                "Never lose a sale due to a missing size — matrix view shows you exactly what you have",
                "Order the right stock for the season — forecasting is based on your own sales history",
                "Process exchanges in seconds — the inventory and receipt update in one step",
                "Know your fastest-moving styles — restock before you sell out",
                "Turn one-time buyers into regulars — size history makes it personal",
                "Plan cash around seasons — Finance portal forecasts your peaks and troughs"
            ]
        },

        phone_accessories: { em: "🎧", name: "Phone & Accessories", cat: "retail_trade",
            problem: "Phone accessories move fast: cases, chargers, earbuds, screen protectors. Every phone model needs compatible accessories, and compatibility confusion costs you sales. Online competitors undercut you constantly.",
            solutions: [
                "Compatibility-based search — find accessories by phone model instantly, so you never guess",
                "Multi-channel listing (online + in-store) — list your stock online, and the same system updates inventory across both channels",
                "Competitor price tracking — know what the online shops are charging, so you can stay competitive",
                "Fast-moving SKU reports — see which accessories sell fastest, and reorder accordingly",
                "Bundling for higher margins — pair cases + chargers + screen protectors into profitable bundles",
                "Finance portal — real-time margin per SKU, cash-flow, and eTIMS invoices"
            ],
            modules: ["business", "public", "product", "client", "finance"],
            changes: [
                "Sell online and in-store from one system — one inventory, two channels",
                "Know which accessories match which phones — compatibility lookup ends the guesswork",
                "Stay competitive with price insights — see what the market charges",
                "Boost margin with bundles — sell more at checkout",
                "Never over-order slow movers — SKU reports show you what actually sells",
                "See real-time margin — Finance portal shows profit per product, per channel"
            ]
        },

        restaurant: { em: "🍽️", name: "Restaurant", cat: "food_bev",
            problem: "Every dish has a recipe, every recipe has a cost, and every cost changes weekly. But most restaurants price their menu once and never revisit it — which means some dishes quietly lose money every single time they're ordered.",
            solutions: [
                "Recipe costing with live ingredient prices — know the exact profit on every dish, updated when your supplier prices change",
                "Table management + reservations — manage walk-ins, bookings, and turn times without a host with a clipboard",
                "Delivery platform integration — all your orders (dine-in, takeaway, and delivery) land in one system",
                "Food waste tracking — log wastage at the end of each shift, and see exactly how much it's costing you",
                "Staff scheduling + sales per hour — match staffing to your real demand, not your guesses",
                "Finance portal — menu engineering, cost variance analysis, and eTIMS invoices"
            ],
            modules: ["business", "client", "public", "youtube", "training", "finance"],
            changes: [
                "Know the exact profit on every dish — menu engineering becomes a daily tool, not a yearly exercise",
                "Reduce food waste by 25% — waste logs reveal patterns you can actually fix",
                "Manage reservations without phone calls — customers book online, you see it instantly",
                "Serve more customers during rush — the POS is fast, and tickets flow to the kitchen automatically",
                "Market your restaurant with video content — YouTube hub turns your best dishes into marketing",
                "Control food cost variance — Finance portal flags when your actual cost drifts from recipe"
            ]
        },

        cafe: { em: "☕", name: "Café / Coffee Shop", cat: "food_bev",
            problem: "Cafés live and die by loyalty and speed. Peak-hour rush makes or breaks your day, but your POS is slow and your loyalty program is a paper card nobody remembers to bring.",
            solutions: [
                "Digital loyalty + prepaid cards — customers tap their phone, you see who's a regular, and rewards fire automatically",
                "Quick POS built for peak hours — fast order entry, quick payment, minimal taps",
                "Perishable inventory with expiry alerts — know when milk, pastries, or fruit need to move before they spoil",
                "Customer visit history — see who comes in, what they order, and when they're due back",
                "Pre-order + pickup — regulars order ahead, skip the queue, and you start their drink before they arrive",
                "Finance portal — daily profit summary, cash-flow forecasting, and tax-ready reports"
            ],
            modules: ["business", "client", "public", "product", "finance"],
            changes: [
                "Build a loyal customer base — digital loyalty is remembered by the system, not the customer",
                "Serve more customers during rush — the POS keeps up with your busiest hour",
                "Reduce perishable waste — expiry alerts tell you what to push today",
                "Personalize offers — send a free pastry to someone who hasn't been in for two weeks",
                "Turn regulars into pre-orders — the queue stops being a barrier",
                "Know your daily profit — Finance portal shows margin while the day is still happening"
            ]
        },

        bakery: { em: "🥖", name: "Bakery", cat: "food_bev",
            problem: "Bakeries are production businesses disguised as retail. Every morning you bake based on yesterday's sales and a gut feeling — and every evening you throw away what didn't sell.",
            solutions: [
                "Daily production planning based on actual orders — bake to demand, not to guesswork",
                "Dual pricing (wholesale/retail) — every customer category gets its correct price automatically",
                "Waste tracking + analytics — see exactly how much you're throwing away, and adjust production",
                "Order intake from any channel — phone, WhatsApp, and walk-in orders all land in one queue",
                "Pre-order system for regulars — customers order ahead, and you bake to confirmed orders",
                "Finance portal — production cost per unit, wastage cost, and eTIMS invoices"
            ],
            modules: ["business", "product", "partner", "client", "finance"],
            changes: [
                "Plan production to match demand — baking is based on real orders, not memory",
                "Never overbake or underbake again — production reports show what actually sells",
                "Track waste and improve margins — waste analytics reveal exactly what to change",
                "Serve wholesale and retail without confusion — pricing is automatic per customer",
                "Take pre-orders that guarantee sales — reduce waste by selling before you bake",
                "Know your true production cost — Finance portal computes cost per unit live"
            ]
        },

        food_truck: { em: "🚚", name: "Food Truck", cat: "food_bev",
            problem: "A food truck has all the pressures of a restaurant, but no permanent address to anchor customers. You chase foot traffic, accept cash that's hard to reconcile, and manage inventory without a back room.",
            solutions: [
                "GPS-based location marketing — broadcast where you are today, and let regulars find you",
                "Mobile M-Pesa payments — accept digital payments without a fixed line",
                "Compact inventory tracking — know what's on the truck and what needs restocking",
                "Pre-order + pickup — regulars order ahead, arrive at your location, and grab their food",
                "Simple daily sales summary — see the day's numbers on your phone before you drive home",
                "Finance portal — daily profit summary, cash-flow forecast, and tax-ready reports"
            ],
            modules: ["business", "public", "client", "finance"],
            changes: [
                "Attract customers to your location — GPS broadcasts bring regulars to wherever you park",
                "Accept digital payments anywhere — no cash handling headaches",
                "Track stock without a laptop — the inventory fits in your pocket",
                "Build a following — pre-orders turn casual customers into regulars",
                "Know your daily numbers — sales summary arrives before you close up",
                "See profit live — Finance portal tells you how the day actually went"
            ]
        },

        catering: { em: "🍱", name: "Catering", cat: "food_bev",
            problem: "Catering is event-based: every job is a project with a client, a date, a menu, a cost, and a crew. But without systems, quotes are built from memory, staff are scheduled by WhatsApp, and ingredient sourcing happens in a rush.",
            solutions: [
                "Event-based quoting + invoicing — build quotes with the exact menu, quantities, and staffing for each event",
                "Staff scheduling + task assignment — assign servers, chefs, and helpers with clear responsibilities",
                "Supplier coordination for ingredients — order to the event, not to the pantry",
                "Profit tracking per event — know whether each job made money, and adjust pricing accordingly",
                "Client communication portal — one place for menus, timelines, and updates",
                "Finance portal — event P&L, cost variance, and eTIMS invoices"
            ],
            modules: ["business", "client", "partner", "product", "training", "finance"],
            changes: [
                "Quote events instantly with accurate costing — no more margin surprises",
                "Schedule staff without spreadsheets — everyone knows where they're needed",
                "Coordinate suppliers seamlessly — ingredients arrive when you need them",
                "Know which events were profitable — analytics per event, not per month",
                "Delight clients with clean communication — updates go through one portal",
                "Track event margin live — Finance portal shows cost vs quote, in real time"
            ]
        },

        bar: { em: "🍺", name: "Bar / Pub", cat: "food_bev",
            problem: "Bars run on trust: bartenders pour, tabs run, and at the end of the night the cash either matches or it doesn't. Shrinkage — from over-pouring, missing bottles, or unrecorded sales — quietly eats your margin.",
            solutions: [
                "Tab management with pre-authorization — open tabs are tracked, and cards are pre-authed so nobody walks",
                "Shrinkage analytics + pour tracking — see exactly how much each bartender pours, and reconcile against sales",
                "Quick-serve POS with offline mode — keep the bar moving during peak hours, even if the internet drops",
                "Age verification logging — every age-restricted drink is logged, protecting your license",
                "Shift reconciliation — each bartender's shift closes cleanly with a cash + sales report",
                "Finance portal — pour cost analysis, margin per drink, and statutory reports"
            ],
            modules: ["business", "client", "public", "youtube", "finance"],
            changes: [
                "Track every drink poured — pour analytics reveal where margin is lost",
                "Manage tabs without errors — no more walkouts or disputed tabs",
                "Entertain customers with curated content — YouTube hub plays your venue's vibe",
                "Speed up service during rush — the POS keeps up when the bar is packed",
                "Protect your license — age verification is logged automatically",
                "Know your pour cost — Finance portal shows margin per drink, live"
            ]
        },

        butcher: { em: "🥩", name: "Butchery", cat: "food_bev",
            problem: "A butchery deals in weight, freshness, and trust. Every cut has a different price, every animal has a yield, and every customer wants to know it's fresh. Weight-based pricing at the counter is slow, cold chain breaks cost you stock.",
            solutions: [
                "Scale-integrated POS — pricing by weight happens at the counter, accurately and fast",
                "Cold chain + expiry tracking — know exactly how long each cut has been in the chiller",
                "Supplier quality tracking — record which supplier delivered which cut, and flag quality issues",
                "Cut-level margin reporting — see which cuts make money and which ones should be priced differently",
                "Customer preference history — remember who buys what, and offer matching cuts first",
                "Finance portal — yield analysis, margin per cut, and eTIMS invoices"
            ],
            modules: ["business", "product", "partner", "finance"],
            changes: [
                "Price by weight accurately — no more rounding or guessing at the counter",
                "Track freshness and reduce waste — cold chain alerts before spoilage",
                "Monitor supplier quality — flag issues before they reach customers",
                "Know which cuts are profitable — price with data, not habit",
                "Serve regulars faster — their preferences are on screen",
                "Yield analysis live — Finance portal shows cost per kilo, live"
            ]
        },

        greengrocer: { em: "🥬", name: "Greengrocer / Mama Mboga", cat: "food_bev",
            problem: "Prices change every morning at the market, produce spoils within days, and customers expect credit when cash is tight. You're tracking everything in your head — who owes what, what's fresh today, what to buy tomorrow.",
            solutions: [
                "Daily price updates + quick sale — change prices every morning in seconds, and sell without delay",
                "M-Pesa integration — accept digital payments without needing a smartphone for every customer",
                "Simple customer credit tracking — know who owes what, and send reminders without confrontation",
                "Spoilage alerts — know what needs to be sold today before it goes bad",
                "Daily profit summary — see your margin in real time, so you know how the day actually went",
                "Finance portal — daily profit, cash-flow, and tax-ready reports"
            ],
            modules: ["business", "client", "public", "finance"],
            changes: [
                "Update prices in seconds — keep up with the market without confusion",
                "Accept M-Pesa without a smartphone — serve digital customers easily",
                "Know your best customers — track repeat buyers and reward them",
                "Reduce spoilage — push what's about to go bad",
                "See your daily profit — know if the day was good while it's still happening",
                "File taxes without stress — Finance portal prepares everything"
            ]
        },

        clinic: { em: "🏥", name: "Clinic", cat: "health_wellness",
            problem: "Every patient visit generates paperwork: history, diagnosis, prescription, lab order, invoice, insurance claim. Without a system, files pile up, appointment reminders don't happen, and insurance claims take weeks to process.",
            solutions: [
                "Electronic health records (EHR) — every patient's complete history is one search away",
                "Appointment scheduling + SMS reminders — reduce no-shows by up to 60%",
                "Insurance claim tracking — submit, track, and reconcile claims without paperwork",
                "Drug inventory with expiry tracking — never dispense expired medication",
                "Clinical reporting for compliance — meet Ministry of Health reporting requirements without manual work",
                "Finance portal — patient billing, insurance receivables, and tax-ready reports"
            ],
            modules: ["business", "client", "training", "public", "finance"],
            changes: [
                "Patient records in one place — no more file hunting during a consultation",
                "Reduce no-shows with reminders — appointments actually happen",
                "Track insurance claims seamlessly — get paid faster, with less follow-up",
                "Never run out of essential drugs — inventory alerts fire before stockouts",
                "Stay compliant — reporting is automated",
                "Track receivables by insurer — Finance portal shows aging per payer"
            ]
        },

        dental: { em: "🦷", name: "Dental Clinic", cat: "health_wellness",
            problem: "Dental clinics have two hard problems: no-shows and treatment plans that stall halfway through. Patients forget appointments, treatment plans get interrupted, and equipment maintenance schedules get missed until something breaks.",
            solutions: [
                "Appointment reminders + recalls — patients get SMS reminders, and annual recalls fire automatically",
                "Digital treatment planning — chart each tooth, plan the full treatment, and track progress",
                "Equipment maintenance schedules — get alerts before equipment breaks, not after",
                "Insurance claim management — submit claims and track approvals in one place",
                "Patient portal for records — patients access their own charts and treatment history",
                "Finance portal — treatment plan billing, insurance receivables, and tax-ready reports"
            ],
            modules: ["business", "client", "training", "product", "finance"],
            changes: [
                "Reduce no-shows by 60% — reminders work",
                "Plan treatments digitally — full-mouth plans are easy to visualize and explain",
                "Never miss equipment service — schedules are enforced by the system",
                "Process insurance claims quickly — no more paper chasing",
                "Give patients access to their records — builds trust and saves staff time",
                "Track treatment plan revenue — Finance portal shows committed vs delivered"
            ]
        },

        optical: { em: "👓", name: "Optical Clinic", cat: "health_wellness",
            problem: "Optical clinics juggle prescriptions, frame inventory, lab orders, and insurance — often for the same patient. Frames come in styles, colors, and sizes, and losing track of what's in stock costs sales.",
            solutions: [
                "Prescription + frame inventory in one system — know your stock, and match it to each patient's prescription",
                "Appointment scheduling with follow-up reminders — automatic recalls for annual eye checks",
                "Insurance claim processing — submit and track claims electronically",
                "Lab order tracking — know the status of every lens and frame order",
                "Patient prescription history — never lose a prescription, and refer back easily",
                "Finance portal — frame margin analysis, insurance receivables, and eTIMS invoices"
            ],
            modules: ["business", "client", "product", "finance"],
            changes: [
                "Track prescriptions and frames together — no more mismatches",
                "Reduce appointment no-shows — reminders do the work",
                "Process insurance faster — claims go out electronically",
                "Know every lab order status — no more phone calls to check",
                "Build long-term patient relationships — annual recalls keep them coming back",
                "See frame margin live — Finance portal tracks cost vs sale"
            ]
        },

        lab: { em: "🧬", name: "Medical Lab", cat: "health_wellness",
            problem: "A medical lab lives or dies by accuracy: sample tracking, result integrity, equipment calibration, and compliance. But without a system, samples get misplaced, results get delayed, and calibration logs are on paper.",
            solutions: [
                "Sample chain-of-custody tracking — know where every sample is, from collection to result",
                "Digital result delivery — referring doctors and patients receive results electronically",
                "Equipment calibration schedules — automated reminders keep equipment compliant",
                "Quality control logging — every test run is logged, and outliers are flagged",
                "Compliance reporting — meet regulatory requirements without manual paperwork",
                "Finance portal — test costing, insurer receivables, and tax-ready reports"
            ],
            modules: ["business", "client", "public", "training", "finance"],
            changes: [
                "Never lose a sample — chain of custody is tracked end-to-end",
                "Deliver results digitally — doctors and patients get them faster",
                "Stay calibrated and compliant — schedules and logs are automatic",
                "Catch quality issues early — QC logs flag outliers instantly",
                "Pass inspections confidently — compliance reports are ready on demand",
                "Know test profitability — Finance portal shows margin per test"
            ]
        },

        pharmacy: { em: "💊", name: "Pharmacy", cat: "health_wellness",
            problem: "Pharmacies carry thousands of drugs, each with a batch number, an expiry date, and a regulatory requirement. Expired drugs eat profit, prescription records are legally required, and insurance claims are slow and error-prone.",
            solutions: [
                "Batch + expiry tracking — know exactly which batch expires when, and sell oldest first",
                "Prescription management — every prescription is logged, referenced, and compliant",
                "Insurance claim processing — submit claims and track approvals electronically",
                "Auto-reorder for essential drugs — never run out of high-demand medicines",
                "Controlled substance logging — meet regulatory requirements without paper",
                "Finance portal — drug margin analysis, insurer receivables, and eTIMS invoices"
            ],
            modules: ["business", "client", "product", "training", "finance"],
            changes: [
                "Never dispense expired drugs — expiry alerts fire before it's a problem",
                "Track prescriptions digitally — compliance is built in",
                "Process insurance faster — claims go out electronically, and payments come in sooner",
                "Reduce dead stock — expiry reports show what to discount before it expires",
                "Serve customers faster — the POS is fast, and stock is always accurate",
                "See margin per drug — Finance portal shows real profitability, live"
            ]
        },

        salon: { em: "💇", name: "Salon", cat: "beauty_personal",
            problem: "A salon's biggest problems are no-shows, commission tracking, and inventory. Stylists forget appointments, clients forget to rebook, and at the end of the month, calculating commission from a notebook leads to arguments.",
            solutions: [
                "Online booking with SMS reminders — clients book from their phone, and reminders cut no-shows dramatically",
                "Stylist commission tracking — every service, retail sale, and tip is tied to the stylist who earned it",
                "Client history + preferences — remember every client's color formula, cut, and preferences",
                "Product inventory with usage tracking — know what's in stock, and what each stylist uses",
                "Rebooking reminders — automatically prompt clients to rebook before they forget",
                "Finance portal — commission payouts, daily profit, and tax-ready reports"
            ],
            modules: ["business", "client", "public", "product", "finance"],
            changes: [
                "Reduce no-shows by 60% — reminders do their job",
                "Track stylist commissions automatically — no more month-end arguments",
                "Remember every client's preferences — personalization becomes effortless",
                "Never run out of product — usage tracking prevents stockouts",
                "Fill your calendar — rebooking reminders keep chairs full",
                "Pay commissions accurately — Finance portal computes and disburses"
            ]
        },

        barbershop: { em: "💈", name: "Barbershop", cat: "beauty_personal",
            problem: "Barbershops run on walk-ins and repeat business, but without a queue system, walk-ins are chaotic and regulars can't tell when their barber is free. Commissions are calculated by hand, product sales are rarely tracked.",
            solutions: [
                "Digital queue + booking — walk-ins join a digital queue, and regulars book ahead",
                "Barber commission tracking — every cut, product, and tip tied to the barber who earned it",
                "Quick product sales — sell product at checkout in one tap",
                "Customer visit history — know when each customer last came in, and send a nudge if they're overdue",
                "Barber performance dashboards — see who's busiest, who upsells the most, and who needs coaching",
                "Finance portal — daily revenue, commission payouts, and tax-ready reports"
            ],
            modules: ["business", "client", "public", "finance"],
            changes: [
                "Manage walk-ins without chaos — the queue is visible to everyone",
                "Track barber earnings — commissions are automatic and accurate",
                "Sell products at checkout — one-tap upsell, no friction",
                "Bring back overdue customers — reminders fire automatically",
                "Coach your team with data — performance dashboards show who's delivering",
                "Know your daily numbers — Finance portal shows revenue and profit live"
            ]
        },

        nailsalon: { em: "💅", name: "Nail Salon", cat: "beauty_personal",
            problem: "Nail salons juggle appointments, technicians, and a huge variety of design options. Clients want to see what's possible, but portfolios are on Instagram or in a phone gallery. Technician schedules overlap, supplies run out, and no-shows are expensive.",
            solutions: [
                "Online booking + design catalog — clients browse designs, pick one, and book the technician",
                "Technician scheduling — balance workload across your team, and know who's free when",
                "Supply inventory tracking — know what's in stock, and reorder before running out",
                "Pre-payment + deposits — reduce no-shows with a small deposit at booking",
                "Client design history — remember what each client asked for, and offer new designs on their next visit",
                "Finance portal — service margin, technician commission, and tax-ready reports"
            ],
            modules: ["business", "client", "public", "product", "finance"],
            changes: [
                "Show your designs online — the catalog becomes your marketing",
                "Book appointments automatically — clients pick the technician and time",
                "Never run out of supplies — inventory tracking handles reorders",
                "Reduce no-shows — deposits make clients commit",
                "Delight clients with their history — they get the same great look every time",
                "Track technician performance — Finance portal shows revenue per technician"
            ]
        },

        massage: { em: "💆‍♂️", name: "Massage Parlour", cat: "beauty_personal",
            problem: "Massage is a scheduling puzzle: therapists, rooms, and clients all need to align. Without a system, double-bookings are common, room utilization is low, and clients lose their preferred therapist.",
            solutions: [
                "Therapist + room scheduling — see everything on one calendar, and optimize utilization",
                "Client preference tracking — remember each client's preferred therapist, pressure, and products",
                "Automated rebooking reminders — prompt clients when they're due",
                "Pre-paid packages — sell packages of sessions, and let clients redeem them easily",
                "Retention analytics — see who's lapsing and reach out before they're gone",
                "Finance portal — package revenue recognition, therapist commission, and tax-ready reports"
            ],
            modules: ["business", "client", "public", "training", "finance"],
            changes: [
                "Optimize room and therapist use — no more wasted slots",
                "Personalize every session — preferences are stored and applied",
                "Automate rebooking reminders — clients come back before they forget",
                "Sell packages that build loyalty — pre-paid sessions lock in repeat visits",
                "Catch lapsed clients early — reach out before they drift away",
                "Track package revenue properly — Finance portal handles deferred revenue"
            ]
        },

        legal: { em: "⚖️", name: "Law Firm", cat: "prof_services",
            problem: "A law firm runs on billable hours, deadlines, and documents. Missing a filing deadline is career-ending. Document versions multiply fast, and one wrong version sent to a client can be catastrophic.",
            solutions: [
                "Case + matter management — every case has its own workspace with documents, deadlines, and billing",
                "Document version control — every draft is tracked, and the wrong version can never be sent",
                "Billable hour tracking — time is logged as it happens, and billed accurately",
                "Deadline + court date calendar — never miss a filing, hearing, or statute of limitations",
                "Client communication portal — secure, logged, and accessible to everyone on the matter",
                "Finance portal — trust account tracking, WIP, and statutory reports"
            ],
            modules: ["business", "client", "training", "product", "finance"],
            changes: [
                "Never miss a deadline — court dates and filings are tracked and alerted",
                "Track billable hours automatically — capture every minute, bill without regret",
                "Secure client communication — messages and documents are logged and protected",
                "Access any document instantly — version control makes every draft findable",
                "Scale the firm without chaos — every case follows the same structure",
                "Manage trust accounts correctly — Finance portal tracks client funds separately"
            ]
        },

        accounting: { em: "🧾", name: "Accounting Firm", cat: "prof_services",
            problem: "Accounting firms drown in document collection. Clients send bank statements, receipts, and invoices in dribs and drabs — by email, WhatsApp, and physical drop-off. Deadlines stack up: VAT, PAYE, NSSF, SHIF, annual returns.",
            solutions: [
                "Client document portal — clients upload everything to one place, and you see what's missing",
                "Deadline + filing calendar — every client's compliance deadlines in one view",
                "Automated billing — time and services are logged, and invoices generate automatically",
                "Compliance tracking — know which clients are compliant and which need attention",
                "Client reports — send monthly or quarterly reports without manual assembly",
                "Finance portal — multi-client ledger, deadline compliance, and eTIMS submissions"
            ],
            modules: ["business", "client", "training", "product", "finance"],
            changes: [
                "Collect documents digitally — no more chasing clients over WhatsApp",
                "Never miss a filing deadline — the calendar shows everything at a glance",
                "Automate client billing — hours are captured and invoices generate without prompts",
                "Track compliance across clients — one dashboard shows who's up to date",
                "Send professional reports — automatically, on schedule",
                "File eTIMS and statutory returns from one place — Finance portal handles it"
            ]
        },

        consultancy: { em: "💼", name: "Consultancy", cat: "prof_services",
            problem: "Consultancies sell expertise, but without systems, that expertise gets lost. Project progress is tracked in email threads, client communication is scattered across calls and messages, and billing for time is often based on rough estimates.",
            solutions: [
                "Project + milestone tracking — every client project has a clear plan with tracked milestones",
                "Client communication portal — all messages, documents, and approvals in one place",
                "Time + expense tracking — every minute and cost is captured, and billed accurately",
                "Knowledge base for methodologies — standard frameworks are captured and reusable",
                "Utilization + profitability reports — see which projects and clients make money",
                "Finance portal — WIP, utilization, profitability per engagement, and tax-ready reports"
            ],
            modules: ["business", "client", "training", "product", "finance"],
            changes: [
                "Track project progress without email archaeology — everything is in one workspace",
                "Centralize client communication — nothing gets lost between tools",
                "Bill accurately for time — hours and expenses are captured automatically",
                "Reuse methodologies across projects — knowledge becomes an asset, not a memory",
                "Know which clients are profitable — utilization reports show the truth",
                "Forecast cash flow — Finance portal shows upcoming invoices and collections"
            ]
        },

        recruitment: { em: "🎯", name: "Recruitment Agency", cat: "prof_services",
            problem: "Recruiters live in a pipeline: candidates move through stages, clients have shifting requirements, and placements close only when everything aligns. Without an ATS, candidates get lost, interviews aren't scheduled, and placements slip through the cracks.",
            solutions: [
                "Applicant tracking system (ATS) — every candidate is tracked from application to placement",
                "Client requirement matching — match candidates to open roles, and see fit scores at a glance",
                "Interview scheduling + reminders — automate the back-and-forth, and reduce no-shows",
                "Placement + commission tracking — know when a placement closes, and what you earn",
                "Talent pool search — search your entire candidate database in seconds",
                "Finance portal — placement revenue, commission forecasting, and tax-ready reports"
            ],
            modules: ["business", "client", "training", "public", "finance"],
            changes: [
                "Track every candidate — no more losing CVs in inboxes",
                "Match candidates to clients — fit scores guide your shortlists",
                "Schedule interviews automatically — candidates and clients get calendar invites",
                "Close more placements — nothing falls through the cracks",
                "Build a reusable talent pool — past candidates become future placements",
                "Forecast commission revenue — Finance portal shows pipeline value"
            ]
        },

        security: { em: "🔒", name: "Security Company", cat: "prof_services",
            problem: "A security company runs on trust and documentation: guards must be where they're supposed to be, patrols must be logged, incidents must be reported, and clients must be billed accurately.",
            solutions: [
                "Guard scheduling + patrol tracking — assign guards, track patrols via QR or NFC checkpoints",
                "Incident reporting from mobile — guards report incidents with photos and timestamps",
                "Client site management — each client site has its own dashboard with guards, patrols, and incidents",
                "Client billing with proof of service — invoices backed by tracked shifts and patrols",
                "Guard training + certification tracking — know who's qualified for which site",
                "Finance portal — client billing, payroll integration, and tax-ready reports"
            ],
            modules: ["business", "client", "training", "partner", "finance"],
            changes: [
                "Schedule guards efficiently — every shift is covered, and gaps are visible",
                "Track patrols digitally — proof that every checkpoint was visited",
                "Report incidents instantly — clients get notified in real time",
                "Bill clients with confidence — invoices match actual shifts and patrols",
                "Stay compliant with certifications — training records are always up to date",
                "Process payroll accurately — Finance portal computes guard hours and pay"
            ]
        },

        photography: { em: "📸", name: "Photography", cat: "creative_media",
            problem: "Photographers juggle bookings, shoots, editing, and delivery — and the business side often suffers. Client inquiries come via WhatsApp, Instagram, and email. Deliveries happen via WeTransfer links that expire. Pricing is inconsistent.",
            solutions: [
                "Booking + calendar management — clients book online, and your calendar stays clean",
                "Portfolio + gallery hosting — showcase your best work, and let clients browse packages",
                "Client image delivery — deliver galleries via a private link that doesn't expire",
                "Package pricing — standardized packages simplify quoting and reduce back-and-forth",
                "Client history + anniversaries — remind past clients about their anniversary, child's birthday, or next shoot",
                "Finance portal — booking revenue, deposits, and tax-ready reports"
            ],
            modules: ["business", "client", "public", "youtube", "product", "finance"],
            changes: [
                "Get booked online — clients pick a package and a date",
                "Showcase your work beautifully — the portfolio is your best sales tool",
                "Deliver images instantly — clients get galleries they can download, share, and print",
                "Price consistently — packages end inconsistent quoting",
                "Bring back past clients — reminders fire on anniversaries and birthdays",
                "Track deposits and payments — Finance portal manages cash flow"
            ]
        },

        videography: { em: "🎥", name: "Videography", cat: "creative_media",
            problem: "Videography projects have many moving parts: pre-production, shoot days, edits, revisions, and final delivery. Without a system, revisions get lost, equipment goes missing, and clients can't see progress.",
            solutions: [
                "Project + revision tracking — every project has clear stages, and every revision is numbered",
                "Equipment inventory — know what gear you have, where it is, and when it's due back",
                "Client review + approval — clients review cuts online, and their feedback is time-stamped",
                "Video delivery + hosting — deliver final videos via a private, permanent link",
                "Time + project billing — track hours and bill accurately, including revisions",
                "Finance portal — project profitability, equipment depreciation, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "youtube", "training", "finance"],
            changes: [
                "Track projects and revisions — no more version confusion",
                "Manage equipment inventory — gear is accounted for",
                "Deliver videos online — clients get a permanent link",
                "Get feedback in one place — no more scattered comments",
                "Bill accurately for revisions — extra work is tracked and charged",
                "Know project profitability — Finance portal shows real margin per project"
            ]
        },

        graphicdesign: { em: "🎨", name: "Graphic Design", cat: "creative_media",
            problem: "Design work involves constant revision, file management, and time tracking. Without a system, clients email revision requests, files are named 'logo_v3_final_FINAL.ai', and billable hours are estimated from memory.",
            solutions: [
                "Project + revision tracking — every project has numbered revisions and clear approval stages",
                "File + asset management — organized folders for every project, searchable in seconds",
                "Time tracking — log time as you work, and bill based on actual hours",
                "Client approval workflows — clients approve specific versions, and feedback is documented",
                "Project profitability — see which projects made money and which were underpriced",
                "Finance portal — WIP, time-to-cash, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "training", "finance"],
            changes: [
                "Track every revision — no more version confusion",
                "Organize design files — every asset is findable",
                "Bill accurately for time — hours are captured, not remembered",
                "Get client approvals digitally — no more 'but I approved that'",
                "Know which projects are profitable — price future projects with data",
                "Track WIP to cash — Finance portal shows exactly how long invoices take to pay"
            ]
        },

        printing: { em: "🖨️", name: "Printing Press", cat: "creative_media",
            problem: "Printing is a manufacturing business: every job consumes paper, ink, and press time. Without a system, job tracking is chaotic, materials run out mid-job, and pricing is inconsistent.",
            solutions: [
                "Job tracking + scheduling — every job has a clear status, and the schedule optimizes press time",
                "Material inventory management — know what's in stock, and reorder before a job stalls",
                "Automated quoting — pricing based on paper, ink, and press time, calculated instantly",
                "Client job portal — clients see the status of their job without calling",
                "Rush job handling — flag rush jobs, and see the impact on the schedule",
                "Finance portal — job costing, material variance, and eTIMS invoices"
            ],
            modules: ["business", "client", "product", "partner", "finance"],
            changes: [
                "Track every print job — no more lost jobs or missed deadlines",
                "Manage materials efficiently — inventory alerts prevent stoppages",
                "Quote jobs instantly — pricing is consistent and profitable",
                "Give clients visibility — they see status without calling",
                "Handle rush jobs without chaos — the schedule adapts",
                "Know job margin — Finance portal shows cost vs quote, live"
            ]
        },

        marketing: { em: "📣", name: "Marketing Agency", cat: "creative_media",
            problem: "Marketing agencies run campaigns across channels: social, search, email, display. Client reporting is a monthly scramble, team coordination is scattered across Slack and email, and proving ROI is hard.",
            solutions: [
                "Campaign management + tracking — every campaign has a dashboard with spend, results, and ROI",
                "Automated client reporting — reports generate automatically and go out on schedule",
                "Team task coordination — assignments, deadlines, and dependencies in one view",
                "Scope + change tracking — scope changes are logged, and billed if necessary",
                "Retainer + project billing — one system handles both billing types",
                "Finance portal — retainer revenue recognition, WIP, and tax-ready reports"
            ],
            modules: ["business", "client", "partner", "training", "product", "finance"],
            changes: [
                "Track campaign performance — ROI is visible, not guessed",
                "Automate client reports — reports go out without manual work",
                "Coordinate teams efficiently — everyone knows what they're responsible for",
                "Bill accurately for scope changes — no more unpaid extras",
                "Grow without chaos — the system scales with your agency",
                "Track retainer revenue properly — Finance portal handles deferred revenue"
            ]
        },

        socialmedia: { em: "📱", name: "Social Media Manager", cat: "creative_media",
            problem: "Social media managers juggle content calendars, client approvals, posting schedules, and analytics across platforms. Content lives in spreadsheets, approvals happen over WhatsApp, and analytics are checked manually.",
            solutions: [
                "Content calendar + scheduling — plan content in advance and schedule posts across platforms",
                "Client approval workflows — clients approve posts before they go live, and feedback is documented",
                "Analytics + reporting — track engagement, growth, and conversions in one dashboard",
                "Content library — reusable assets and templates speed up content creation",
                "Task + client management — manage multiple clients and their content pipelines",
                "Finance portal — retainer tracking, WIP, and tax-ready reports"
            ],
            modules: ["business", "client", "public", "youtube", "training", "finance"],
            changes: [
                "Plan content in advance — no more last-minute posts",
                "Get client approvals digitally — approvals are documented and fast",
                "Track engagement analytics — know what works and what doesn't",
                "Build a content library — assets are reusable",
                "Manage multiple clients — pipelines are organized and visible",
                "Track retainer profitability — Finance portal shows margin per client"
            ]
        },

        construction: { em: "🏗️", name: "Construction Company", cat: "construction",
            problem: "Construction projects bleed money if not tracked: material costs fluctuate, subcontractors bill by the hour, and progress is measured in weeks. Without a system, project budgets are estimates that drift, materials are ordered twice.",
            solutions: [
                "Project budgeting + cost tracking — every project has a budget that updates as materials and labor are consumed",
                "Material procurement + inventory — order materials when needed, and track deliveries against invoices",
                "Subcontractor management — contracts, payments, and compliance documents in one place",
                "Project scheduling + milestones — track progress against the schedule, and see delays early",
                "Compliance + safety documentation — every site visit, inspection, and certification is logged",
                "Finance portal — project P&L, retention tracking, and statutory reports"
            ],
            modules: ["business", "client", "partner", "product", "training", "finance"],
            changes: [
                "Track project costs in real time — know if a project is on budget before it's too late",
                "Manage materials and suppliers — no more double-ordering or stockouts",
                "Coordinate subcontractors — everyone knows what they're building and when",
                "Meet compliance requirements — documentation is centralized",
                "Deliver projects on time — schedule tracking catches delays early",
                "Know project margin live — Finance portal shows cost vs contract, in real time"
            ]
        },

        electrical: { em: "⚡", name: "Electrical Contractor", cat: "construction",
            problem: "Electrical contractors juggle jobs, materials, and safety. Materials go missing from site, safety compliance is documented on paper, and quoting jobs is based on experience, not data.",
            solutions: [
                "Job scheduling + dispatch — assign electricians to jobs and see their day at a glance",
                "Material + tool tracking — know what's in the van, what's on site, and what needs restocking",
                "Safety compliance logs — every safety check, certification, and incident is documented",
                "Mobile job updates — electricians update job status from the field",
                "Quoting with cost history — price jobs based on your actual material and labor costs",
                "Finance portal — job costing, WIP, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "training", "partner", "finance"],
            changes: [
                "Schedule jobs efficiently — no more overlap or idle time",
                "Track materials and tools — missing gear gets noticed",
                "Stay safety compliant — logs are ready for any inspection",
                "Quote jobs accurately — cost history makes pricing data-driven",
                "Update clients from the field — status is always current",
                "Track WIP and profitability — Finance portal shows real numbers per job"
            ]
        },

        plumbing: { em: "🚰", name: "Plumbing Contractor", cat: "construction",
            problem: "Plumbing is emergency-driven: calls come in at odd hours, jobs require specific parts, and clients want to know when you'll arrive. Without a system, emergency dispatch is chaotic, parts inventory is guesswork.",
            solutions: [
                "Emergency dispatch + scheduling — route plumbers to jobs efficiently, with real-time ETA",
                "Parts inventory management — know which parts are on the van, and which need restocking",
                "Job tracking + billing — every job has a ticket with time, parts, and total charge",
                "Client communication — clients receive updates on ETA and job completion",
                "Service history per client — know what was fixed last time, and when it's due for service",
                "Finance portal — job costing, parts margin, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "partner", "finance"],
            changes: [
                "Dispatch emergencies fast — plumbers get the job, clients get the ETA",
                "Track parts inventory — no more trips back for forgotten parts",
                "Bill jobs accurately — time and parts are captured",
                "Update clients automatically — no more 'when are you coming?'",
                "Build repeat business — service reminders bring clients back",
                "Track parts margin — Finance portal shows profit per part"
            ]
        },

        painting: { em: "🖌️", name: "Painting Contractor", cat: "construction",
            problem: "Painting jobs require accurate estimation, skilled crews, and consistent materials. But estimation is often based on square meters and experience, and paint colors and quantities vary.",
            solutions: [
                "Job estimation + quoting — estimate paint, labor, and time based on room dimensions and surfaces",
                "Crew scheduling — assign painters to jobs, and see the schedule at a glance",
                "Paint + material tracking — know what's in stock and what each job consumes",
                "Client progress reports — send progress updates with photos from the field",
                "Payment milestones — structure payments based on job completion",
                "Finance portal — job costing, retention, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "partner", "finance"],
            changes: [
                "Quote jobs accurately — estimation is data-driven",
                "Schedule crews efficiently — no more overlap",
                "Track materials — paint inventory is visible",
                "Keep clients informed — progress reports build trust",
                "Get paid on time — milestone billing structures payment",
                "Track job profitability — Finance portal shows real numbers"
            ]
        },

        carpentry: { em: "🪵", name: "Carpentry / Joinery", cat: "construction",
            problem: "Carpentry involves custom orders, expensive materials, and client expectations. Without a system, custom orders are tracked in notebooks, materials are ordered by guess, and project timelines slip silently.",
            solutions: [
                "Custom order management — each order has a spec, a timeline, and a completion stage",
                "Material + inventory tracking — know what's in stock and what to order",
                "Project timeline tracking — see which jobs are on schedule and which are delayed",
                "Client previews — send photos of work in progress",
                "Time + material billing — capture actual costs, and bill accurately",
                "Finance portal — job costing, WIP, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "partner", "finance"],
            changes: [
                "Manage custom orders — every spec is documented",
                "Track materials and waste — know your true costs",
                "Meet project timelines — delays are visible early",
                "Show clients progress — photos keep them engaged",
                "Bill accurately — actual time and materials are captured",
                "Track WIP and cash flow — Finance portal shows exactly where money is tied up"
            ]
        },

        logistics: { em: "🚚", name: "Logistics Company", cat: "transport_logi",
            problem: "Logistics runs on fleet efficiency, route optimization, and proof of delivery. Without a system, fleet maintenance is reactive, routes are planned by memory, and proof of delivery is a signed paper that gets lost.",
            solutions: [
                "Fleet + vehicle management — track maintenance, fuel, and driver assignment for every vehicle",
                "Route optimization + tracking — plan efficient routes, and track drivers in real time",
                "Proof of delivery capture — drivers capture signatures and photos on delivery",
                "Client billing with actuals — invoices reflect actual trips, distances, and times",
                "Driver performance tracking — see who's efficient, who's safe, and who needs coaching",
                "Finance portal — fleet cost per km, client profitability, and tax-ready reports"
            ],
            modules: ["business", "client", "partner", "product", "training", "finance"],
            changes: [
                "Track your fleet in real time — no more mystery breakdowns",
                "Optimize delivery routes — fuel and time savings add up",
                "Bill clients with proof of delivery — disputes drop",
                "Coach drivers with data — performance improves",
                "Scale operations — the system supports more vehicles without more admin",
                "Know cost per km — Finance portal shows fleet profitability per vehicle"
            ]
        },

        transport: { em: "🚌", name: "Transport / Matatu", cat: "transport_logi",
            problem: "Matatu operations face unique challenges: route scheduling, fare collection, vehicle maintenance, and crew management. Fare collection is cash-based, which is hard to track, and vehicle maintenance is often reactive.",
            solutions: [
                "Route + schedule management — publish schedules, and track adherence",
                "Digital fare collection — accept cashless payments, and know exact revenue per trip",
                "Vehicle maintenance tracking — get alerts before maintenance becomes a breakdown",
                "Crew scheduling + performance — assign drivers and conductors, and track their performance",
                "Route profitability analysis — know which routes make money and which don't",
                "Finance portal — revenue per trip, cost per km, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "partner", "finance"],
            changes: [
                "Manage routes and schedules — no more guesswork",
                "Collect fares digitally — revenue is trackable",
                "Track vehicle maintenance — breakdowns drop",
                "Optimize crew assignment — performance improves",
                "Know route profitability — cut loss-making routes",
                "Track daily revenue — Finance portal shows real-time cash position"
            ]
        },

        boda: { em: "🛵", name: "Boda Boda Rider", cat: "transport_logi",
            problem: "Boda riders operate on thin margins: fuel, maintenance, and time all cost money, and every trip matters. Without a system, trip earnings are tracked in memory, fuel and maintenance costs are estimates, and customers are one-off.",
            solutions: [
                "Trip + fare tracking — log every trip and fare, and see daily and weekly earnings",
                "Fuel + expense logging — track fuel costs and maintenance, and see your true profit",
                "Customer base + repeat rides — remember customers, and offer them a direct booking option",
                "M-Pesa payments — accept digital payments, and reduce cash handling",
                "Loan + savings tracking — track SACCO contributions or loan repayments",
                "Finance portal — daily profit, savings tracking, and tax-ready reports"
            ],
            modules: ["business", "client", "public", "finance"],
            changes: [
                "Track trips and earnings — know exactly what you made today",
                "Log fuel and expenses — see your true profit, not just revenue",
                "Build a customer base — repeat customers become reliable income",
                "Accept M-Pesa — no more cash-only limitations",
                "Plan for the future — savings and loans are tracked",
                "See your daily profit — Finance portal tells you if today was worth it"
            ]
        },

        taxi: { em: "🚕", name: "Taxi / Ride-hailing", cat: "transport_logi",
            problem: "Taxi businesses juggle trips, drivers, and customer service. Without a system, driver allocation is via phone calls, fare tracking is estimated, and customer complaints get lost.",
            solutions: [
                "Trip + driver management — assign trips, and see driver availability in real time",
                "Fare tracking + billing — every fare is logged, and billing is accurate",
                "Customer feedback + support — capture ratings, and address issues quickly",
                "Driver performance dashboards — see who's efficient, who's safe, and who needs coaching",
                "Loyalty + repeat bookings — offer regulars a direct booking option",
                "Finance portal — driver payout, revenue per vehicle, and tax-ready reports"
            ],
            modules: ["business", "client", "public", "partner", "finance"],
            changes: [
                "Manage trips and drivers — dispatch is efficient",
                "Track fares accurately — revenue is visible",
                "Handle customer feedback — issues get resolved",
                "Improve driver performance — dashboards guide coaching",
                "Build customer loyalty — regulars book directly",
                "Pay drivers accurately — Finance portal computes payout per driver"
            ]
        },

        car_hire: { em: "🚗", name: "Car Hire", cat: "transport_logi",
            problem: "Car hire is a utilization business: every day a car sits idle is money lost. But without a system, bookings are on paper, maintenance is reactive, insurance is tracked separately, and damage disputes are common.",
            solutions: [
                "Vehicle booking + calendar — see availability across all vehicles at a glance",
                "Maintenance + insurance tracking — schedules and renewals are automatic",
                "Damage + deposit management — document pre-existing damage and manage deposits cleanly",
                "Online booking for clients — clients book and pay online",
                "Utilization analytics — know which vehicles earn and which don't",
                "Finance portal — utilization, revenue per vehicle, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "partner", "finance"],
            changes: [
                "Book vehicles online — the process is fast for clients",
                "Track maintenance and insurance — nothing expires unnoticed",
                "Manage deposits and damage — disputes drop",
                "Know vehicle utilization — cut or add vehicles based on data",
                "Maximize revenue per vehicle — every car works harder",
                "Track profitability per vehicle — Finance portal shows real numbers"
            ]
        },

        courier: { em: "📮", name: "Courier Service", cat: "transport_logi",
            problem: "Courier businesses live on speed and tracking: clients want to know where their package is, and any delay damages trust. Without a system, parcel tracking is manual, delivery routing is inefficient, and proof of delivery is a signature on paper.",
            solutions: [
                "Parcel tracking + barcode scanning — every parcel is scanned at each stage",
                "Delivery routing + dispatch — routes are optimized, and drivers are dispatched efficiently",
                "Proof of delivery capture — signatures and photos are captured on delivery",
                "Client portal for tracking — clients track their own parcels without calling",
                "Billing by actual service — invoices reflect actual distances and weights",
                "Finance portal — parcel profitability, fuel cost per route, and tax-ready reports"
            ],
            modules: ["business", "client", "partner", "public", "finance"],
            changes: [
                "Track every parcel — clients see real-time status",
                "Optimize delivery routes — fuel and time savings",
                "Capture proof of delivery — disputes drop",
                "Reduce support calls — clients self-serve tracking",
                "Bill accurately — invoices match actual service",
                "Know parcel profitability — Finance portal shows margin per delivery"
            ]
        },

        agriculture: { em: "🌾", name: "Mixed Farming", cat: "agri_farming",
            problem: "Mixed farming is a complex business: multiple crops, multiple inputs, labor costs, weather risk, and market prices. Without records, you can't tell which crop is profitable, which field underperforms, or what your actual cost per acre is.",
            solutions: [
                "Farm planning + input tracking — plan crops, track inputs, and see cost per acre",
                "Labor + task management — schedule workers, and track labor costs per activity",
                "Market access + sales tracking — record sales, and see which markets pay best",
                "Weather + pest alerts — get warnings that inform planting and spraying decisions",
                "Profitability per crop — know which crops make money and which lose it",
                "Finance portal — cost per acre, seasonal P&L, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "training", "public", "finance"],
            changes: [
                "Plan crops and inputs — farming becomes data-driven",
                "Manage farm labor — costs are visible",
                "Track sales and market access — get the best price",
                "React to weather and pests — alerts inform action",
                "Know which crops are profitable — plant accordingly",
                "See seasonal P&L — Finance portal shows which seasons made money"
            ]
        },

        dairy: { em: "🐄", name: "Dairy Farm", cat: "agri_farming",
            problem: "Dairy farming is a daily routine: milking, feeding, animal health, and breeding all happen on schedule. But without records, milk production trends are invisible, animal health issues are caught late, and feed costs are estimated.",
            solutions: [
                "Daily milk production tracking — record yields per cow, and see trends over time",
                "Animal health + breeding records — track vaccinations, inseminations, and calving dates",
                "Feed + nutrition management — track feed usage and cost per cow",
                "Buyer + payment tracking — record milk deliveries and payments",
                "Profitability per cow — know which cows make money and which don't",
                "Finance portal — cost per litre, buyer receivables, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "training", "finance"],
            changes: [
                "Track daily milk production — trends are visible",
                "Manage animal health — issues are caught early",
                "Control feed costs — usage is tracked",
                "Coordinate feed and buyers — payments are documented",
                "Improve herd profitability — underperforming cows are identified",
                "Track cost per litre — Finance portal shows real margin per litre"
            ]
        },

        poultry: { em: "🐔", name: "Poultry Farm", cat: "agri_farming",
            problem: "Poultry farming runs on tight margins and strict timelines: feed conversion, mortality rates, and growth stages determine profitability. Without a system, flock performance is estimated, feed is wasted, and disease outbreaks are caught too late.",
            solutions: [
                "Flock + batch management — track each flock through its lifecycle",
                "Feed + mortality tracking — monitor feed conversion and mortality rates",
                "Sales + buyer management — record egg and meat sales, and track buyer payments",
                "Health + vaccination schedules — never miss a vaccination or treatment",
                "Profitability per batch — know which flocks performed and which didn't",
                "Finance portal — cost per bird, batch P&L, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "training", "finance"],
            changes: [
                "Track flocks and batches — performance is visible",
                "Monitor feed conversion — feed costs drop",
                "Manage sales and buyers — payments are documented",
                "Prevent disease outbreaks — schedules prevent gaps",
                "Improve batch profitability — data guides decisions",
                "See cost per bird — Finance portal shows real margin per batch"
            ]
        },

        piggery: { em: "🐖", name: "Piggery", cat: "agri_farming",
            problem: "Pig farming requires careful management of breeding cycles, feed, and health. Without records, breeding dates are guessed, feed costs are estimated, and market timing is based on memory.",
            solutions: [
                "Breeding + farrowing tracking — know when sows are due, and plan farrowing",
                "Feed + health records — track feed usage and health interventions",
                "Market pricing + sales — record sales and track market prices",
                "Profitability per pig — know which pigs and litters perform best",
                "Buyer management — track buyers and their payment history",
                "Finance portal — cost per pig, batch P&L, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "training", "finance"],
            changes: [
                "Track breeding cycles — farrowing is predictable",
                "Manage feed and health — costs are visible",
                "Get market price insights — sell at the right time",
                "Improve profitability — data guides culling and breeding",
                "Build buyer relationships — payments are documented",
                "Track batch profitability — Finance portal shows which litters earned"
            ]
        },

        beekeeping: { em: "🐝", name: "Beekeeping", cat: "agri_farming",
            problem: "Beekeeping is seasonal and location-based: hive health, honey harvest, and market access all matter. Without records, hive performance is estimated, harvest quality is variable, and market pricing is inconsistent.",
            solutions: [
                "Hive + apiary management — track each hive's location, health, and harvest history",
                "Harvest + quality tracking — record honey harvests and quality grades",
                "Market access + sales — sell honey online and track pricing",
                "Pest + disease tracking — log issues and treatments",
                "Profitability per apiary — know which locations produce best",
                "Finance portal — cost per kg, seasonal P&L, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "public", "finance"],
            changes: [
                "Track hives and harvests — performance is visible",
                "Monitor quality — honey quality is documented",
                "Sell honey online — reach more customers",
                "Catch pest issues early — treatments are tracked",
                "Improve apiary profitability — data guides expansion",
                "Track cost per kg — Finance portal shows real margin"
            ]
        },

        agrovet: { em: "🌱", name: "Agrovet", cat: "agri_farming",
            problem: "Agrovets serve farmers who often buy on credit and depend on seasonal demand. Without a system, input inventory is estimated, farmer credit is tracked in notebooks, and seasonal demand swings catch you off guard.",
            solutions: [
                "Input inventory management — know what's in stock and what needs reordering",
                "Farmer credit tracking — record credit sales and track repayments",
                "Seasonal demand forecasting — plan stock based on planting and harvest seasons",
                "Product knowledge training — capture best practices for your team",
                "Sales analytics — see which products sell best and when",
                "Finance portal — farmer credit aging, seasonal cash flow, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "training", "partner", "finance"],
            changes: [
                "Manage input inventory — stockouts and overstock are avoided",
                "Track farmer credit — recoveries improve",
                "Forecast seasonal demand — stock matches demand",
                "Train your team — product knowledge improves",
                "Understand sales trends — buying becomes data-driven",
                "Manage credit risk — Finance portal shows aging per farmer"
            ]
        },

        maize: { em: "🌽", name: "Maize Farming", cat: "agri_farming",
            problem: "Maize farming is a high-stakes, weather-dependent business. Input costs are significant, pest pressure is real, and market prices fluctuate. Without records, you can't tell if a season was profitable, and planning for the next season is based on memory.",
            solutions: [
                "Input + cost tracking — record seed, fertilizer, and labor costs per acre",
                "Weather + pest alerts — get warnings that inform planting and spraying",
                "Market price monitoring — track prices and decide when to sell",
                "Storage + inventory management — track harvested grain through storage",
                "Profitability per acre — know if the season made money",
                "Finance portal — cost per acre, seasonal P&L, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "training", "public", "finance"],
            changes: [
                "Track input costs — know your true cost per acre",
                "Get weather and pest alerts — act before losses happen",
                "Monitor market prices — sell at the best time",
                "Manage storage — grain is tracked and protected",
                "Know seasonal profitability — plan with data",
                "See real margin per acre — Finance portal computes it live"
            ]
        },

        education: { em: "🎓", name: "School", cat: "education",
            problem: "Schools juggle student records, fee collection, timetable scheduling, exam management, and parent communication. Without a system, fee arrears are hard to track, timetables are manually assembled, and parent communication is by letters that don't reach everyone.",
            solutions: [
                "Student information system — every student has a profile with academic, medical, and contact information",
                "Fee collection + tracking — track payments, arrears, and send automated reminders",
                "Parent communication portal — send updates via SMS, WhatsApp, and app",
                "Timetable + exam scheduling — automate timetables and manage exams",
                "Report cards + academic tracking — generate reports from recorded grades",
                "Finance portal — fee arrears aging, bursary tracking, and audit-ready reports"
            ],
            modules: ["business", "client", "training", "public", "youtube", "finance"],
            changes: [
                "Manage student records — one profile per student",
                "Collect fees digitally — arrears drop and reminders work",
                "Communicate with parents — messages reach everyone",
                "Automate timetables — scheduling takes minutes",
                "Generate reports faster — grades and report cards are automated",
                "Track fee arrears — Finance portal shows aging per class and per student"
            ]
        },

        college: { em: "🏛️", name: "College / University", cat: "education",
            problem: "Colleges manage courses, students, faculty, fees, exams, and alumni — often across multiple campuses. Without a system, course catalogs get out of date, transcripts take weeks, fee tracking is fragmented, and alumni engagement is minimal.",
            solutions: [
                "Course + curriculum management — manage courses, prerequisites, and faculty assignments",
                "Student records + transcripts — generate transcripts in minutes",
                "Fee tracking + financial aid — manage fees, scholarships, and payment plans",
                "Alumni engagement portal — stay connected with graduates",
                "Regulatory reporting — generate reports for accreditation and government",
                "Finance portal — multi-campus consolidation, fee aging, and audit-ready reports"
            ],
            modules: ["business", "client", "training", "public", "youtube", "finance"],
            changes: [
                "Manage courses and students — catalogs and records stay current",
                "Track fees and records — financials are visible",
                "Engage alumni — graduates stay connected",
                "Generate transcripts fast — student services improve",
                "Automate regulatory reports — compliance is easier",
                "Consolidate multi-campus finances — Finance portal handles it"
            ]
        },

        kindergarten: { em: "🧸", name: "Kindergarten / Daycare", cat: "education",
            problem: "Kindergartens care for young children, which means safety, communication, and trust. Parents want daily updates on their child's day, meals, and activities. Without a system, updates are manual, attendance is tracked on paper.",
            solutions: [
                "Child + parent records — every child has a profile with contacts, medical info, and emergency details",
                "Attendance + daily updates — log attendance and send parents daily updates",
                "Fee collection + reminders — collect fees digitally and send reminders",
                "Health + allergy tracking — record medical conditions and allergies",
                "Photo + activity sharing — share photos and activities with parents",
                "Finance portal — fee arrears, term P&L, and audit-ready reports"
            ],
            modules: ["business", "client", "training", "public", "finance"],
            changes: [
                "Track child records — everything is documented",
                "Update parents daily — engagement improves",
                "Collect fees easily — digital collection is faster",
                "Protect children with health records — allergies and conditions are visible",
                "Share moments with parents — trust builds",
                "Track fee arrears — Finance portal shows who owes what"
            ]
        },

        tuition: { em: "📚", name: "Tuition Centre", cat: "education",
            problem: "Tuition centres manage students, tutors, schedules, and payments. Without a system, enrollment is manual, tutor scheduling is chaotic, and fee tracking is by notebook. Parents want progress reports but receive only verbal updates.",
            solutions: [
                "Student enrollment + scheduling — enroll students and schedule sessions",
                "Tutor allocation + performance — assign tutors and track their performance",
                "Progress reports + parent communication — send regular progress updates",
                "Fee tracking + billing — collect fees and track arrears",
                "Attendance tracking — know which students attend",
                "Finance portal — fee arrears, tutor payouts, and tax-ready reports"
            ],
            modules: ["business", "client", "training", "public", "finance"],
            changes: [
                "Manage enrollments — the process is fast",
                "Schedule tutors — no more overlap",
                "Track progress and fees — visibility improves",
                "Communicate with parents — engagement increases",
                "Improve tutor performance — data guides coaching",
                "Pay tutors accurately — Finance portal computes per session"
            ]
        },

        driving: { em: "🚗", name: "Driving School", cat: "education",
            problem: "Driving schools juggle student scheduling, instructor allocation, vehicle tracking, and test bookings. Without a system, lessons are booked by phone, vehicles are maintained reactively, and progress tracking is on paper.",
            solutions: [
                "Student + instructor scheduling — book lessons and assign instructors",
                "Vehicle tracking + maintenance — track vehicle use and schedule maintenance",
                "Progress tracking + test booking — record progress and manage test bookings",
                "Fee collection — collect fees digitally",
                "Instructor performance — track pass rates and satisfaction",
                "Finance portal — fee arrears, instructor payouts, and tax-ready reports"
            ],
            modules: ["business", "client", "training", "product", "finance"],
            changes: [
                "Schedule students and instructors — lessons are organized",
                "Track vehicles — maintenance is proactive",
                "Manage test bookings — the process is automated",
                "Collect fees easily — digital collection is faster",
                "Improve pass rates — data guides instruction",
                "Track instructor payouts — Finance portal computes automatically"
            ]
        },

        elearning: { em: "💻", name: "E-learning Platform", cat: "education",
            problem: "E-learning platforms deliver courses, track student engagement, and issue certifications. Without a system, course delivery is inconsistent, engagement is low, and assessment is manual. Certification is difficult to verify.",
            solutions: [
                "Course delivery + tracking — deliver courses and track completion",
                "Student engagement analytics — see who's engaged and who's dropping off",
                "Assessment + certification — automate assessments and issue certificates",
                "Content library — organize and reuse course content",
                "Discussion + community — build community around courses",
                "Finance portal — subscription revenue, refunds, and tax-ready reports"
            ],
            modules: ["business", "client", "training", "public", "youtube", "finance"],
            changes: [
                "Deliver courses online — students access from anywhere",
                "Track student engagement — improve content based on data",
                "Automate certification — certificates are verifiable",
                "Reuse content — courses scale without recreating",
                "Build community — engagement increases",
                "Track subscription revenue — Finance portal handles MRR and churn"
            ]
        },

        insurance: { em: "🛡️", name: "Insurance Agency", cat: "finance_ins",
            problem: "Insurance agencies manage policies, clients, claims, and renewals. Without a system, policies are tracked in spreadsheets, renewals slip through the cracks, and commission tracking is manual. Claims take too long, and clients feel forgotten between renewals.",
            solutions: [
                "Policy + client management — every policy has a client profile with documents and history",
                "Claims tracking + follow-up — track claims through the process and follow up on delays",
                "Commission tracking — automatic commission calculation and reporting",
                "Renewal reminders — remind clients before policies lapse",
                "Client portal — clients access policies, claims, and documents",
                "Finance portal — commission receivables, reconciliation, and tax-ready reports"
            ],
            modules: ["business", "client", "partner", "training", "finance"],
            changes: [
                "Manage policies and clients — everything is centralized",
                "Track claims — clients get updates",
                "Automate renewals — retention improves",
                "Track commissions — income is visible",
                "Improve client experience — self-service builds trust",
                "Track commission receivables — Finance portal shows what's outstanding"
            ]
        },

        mortgage: { em: "🏠", name: "Mortgage Broker", cat: "finance_ins",
            problem: "Mortgage brokers match clients to lenders and guide them through a complex process. Without a system, applications are tracked in spreadsheets, documents are collected by email, and lender communication is fragmented.",
            solutions: [
                "Application + document tracking — track applications and required documents",
                "Lender + product matching — match clients to lenders based on criteria",
                "Client communication portal — keep clients updated on progress",
                "Commission tracking — track commissions per application",
                "Compliance + audit trail — document everything for compliance",
                "Finance portal — commission forecasting, WIP, and audit-ready reports"
            ],
            modules: ["business", "client", "partner", "training", "finance"],
            changes: [
                "Track applications — progress is visible",
                "Match lenders to clients — better outcomes",
                "Automate commission — income is tracked",
                "Keep clients informed — anxiety drops",
                "Document compliance — audit-ready",
                "Forecast commission — Finance portal shows pipeline value"
            ]
        },

        microfinance: { em: "💵", name: "Microfinance", cat: "finance_ins",
            problem: "Microfinance institutions issue many small loans, collect frequent repayments, and manage clients with limited credit history. Without a system, loan tracking is manual, repayment collection is difficult, and credit scoring is subjective.",
            solutions: [
                "Loan origination + tracking — manage loan applications and disbursements",
                "Repayment collection + reminders — send reminders and track payments",
                "Client credit scoring — build credit scores from repayment history",
                "Portfolio reporting — monitor loan quality and risk",
                "Mobile access for field officers — collect payments in the field",
                "Finance portal — portfolio at risk, provisioning, and audit-ready reports"
            ],
            modules: ["business", "client", "partner", "training", "finance"],
            changes: [
                "Track loans and repayments — portfolio is visible",
                "Automate reminders — collections improve",
                "Score client credit — lending decisions improve",
                "Monitor risk — early warnings prevent losses",
                "Empower field officers — collections happen anywhere",
                "Track portfolio at risk — Finance portal shows provisioning needs"
            ]
        },

        sacco: { em: "🏦", name: "SACCO", cat: "finance_ins",
            problem: "SACCOs manage member savings, loans, and dividends — with strict regulatory requirements. Without a system, member records are fragmented, loan tracking is manual, and dividend calculation is error-prone.",
            solutions: [
                "Member + savings management — every member has a savings account with a clear history",
                "Loan processing + tracking — manage loan applications, approvals, and repayments",
                "Dividend calculation — calculate dividends based on member balances",
                "Regulatory reporting — generate reports for SASRA and other regulators",
                "Member portal — members view their accounts and statements",
                "Finance portal — loan loss provisioning, regulatory ratios, and audit-ready reports"
            ],
            modules: ["business", "client", "partner", "training", "public", "finance"],
            changes: [
                "Manage members and savings — records are centralized",
                "Process loans — approvals are faster",
                "Calculate dividends — accurate and transparent",
                "Meet regulatory requirements — reporting is automated",
                "Improve member trust — self-service builds confidence",
                "Track regulatory ratios — Finance portal computes them live"
            ]
        },

        chama: { em: "👥", name: "Chama / Investment Group", cat: "finance_ins",
            problem: "Chamas pool savings from members and invest together. Without a system, contribution tracking is manual, internal loans are undocumented, and meeting decisions aren't recorded.",
            solutions: [
                "Contribution + savings tracking — record contributions per member",
                "Internal loan management — track loans, interest, and repayments",
                "Meeting records + resolutions — document meetings and decisions",
                "Investment tracking — track investments and returns",
                "Member statements — provide statements to members",
                "Finance portal — fund performance, member equity, and tax-ready reports"
            ],
            modules: ["business", "client", "training", "finance"],
            changes: [
                "Track contributions — transparent and accurate",
                "Manage internal loans — disputes drop",
                "Record meetings and decisions — institutional memory",
                "Track investments — returns are visible",
                "Build member trust — transparency improves",
                "See fund performance — Finance portal shows returns per member"
            ]
        },

        realestate: { em: "🏘️", name: "Real Estate Agency", cat: "real_estate",
            problem: "Real estate agencies match buyers, sellers, landlords, and tenants. Without a system, listings are scattered, client matching is manual, and viewing scheduling is by phone. Commission tracking is complicated.",
            solutions: [
                "Property listings — list properties with photos, details, and status",
                "Client + property matching — match clients to properties based on criteria",
                "Viewing scheduling + feedback — schedule viewings and capture feedback",
                "Commission tracking — track commissions per deal",
                "Client portal — clients browse properties and request viewings",
                "Finance portal — commission receivables, deal pipeline, and tax-ready reports"
            ],
            modules: ["business", "client", "public", "partner", "finance"],
            changes: [
                "List properties online — reach more clients",
                "Match clients to properties — efficiency improves",
                "Schedule viewings — automation saves time",
                "Track commissions — income is visible",
                "Improve client experience — self-service builds trust",
                "Track commission receivables — Finance portal shows outstanding"
            ]
        },

        propertymgmt: { em: "🏢", name: "Property Management", cat: "real_estate",
            problem: "Property managers handle tenants, leases, rent collection, maintenance, and compliance. Without a system, rent tracking is manual, maintenance requests get lost, and lease renewals slip.",
            solutions: [
                "Tenant + lease management — track tenants, leases, and renewals",
                "Rent collection + reminders — collect rent and send reminders",
                "Maintenance request tracking — log requests and track resolution",
                "Owner reporting — generate reports for property owners",
                "Compliance + documentation — track inspections and certifications",
                "Finance portal — rent roll, arrears aging, owner distributions, and audit-ready reports"
            ],
            modules: ["business", "client", "partner", "product", "finance"],
            changes: [
                "Manage tenants and leases — records are organized",
                "Collect rent automatically — collections improve",
                "Track maintenance — requests get resolved",
                "Report to owners — reporting is easy",
                "Stay compliant — documentation is ready",
                "Distribute owner funds — Finance portal handles distributions"
            ]
        },

        landlord: { em: "🏠", name: "Landlord", cat: "real_estate",
            problem: "Individual landlords manage a few properties and tenants. Without a system, rent tracking is in a notebook, tenant communication is by phone, and maintenance is reactive. Financial records are messy at tax time.",
            solutions: [
                "Rent tracking + reminders — track rent and send reminders",
                "Tenant communication — communicate with tenants in one place",
                "Maintenance logging — log maintenance issues and costs",
                "Financial reports — generate reports for tax purposes",
                "Tenant screening — document tenant history",
                "Finance portal — rental P&L, arrears tracking, and tax-ready reports"
            ],
            modules: ["business", "client", "public", "finance"],
            changes: [
                "Track rent and reminders — collections improve",
                "Communicate with tenants — no more lost messages",
                "Log maintenance — costs are tracked",
                "Report taxes easily — records are organized",
                "Screen tenants — better tenants, fewer issues",
                "See rental P&L — Finance portal shows real profit per property"
            ]
        },

        airbnbmgr: { em: "🏠", name: "Short-stay Manager", cat: "real_estate",
            problem: "Short-stay property managers juggle multiple platforms (Airbnb, Booking.com, etc.), guest communication, cleaning, and pricing. Without a system, calendars get out of sync, double-bookings happen, and cleaning schedules are chaotic.",
            solutions: [
                "Booking + calendar sync — sync calendars across platforms",
                "Guest communication automation — automate check-in details and messages",
                "Cleaning + turnover scheduling — schedule cleanings between guests",
                "Dynamic pricing — adjust prices based on demand",
                "Property performance analytics — see which properties earn best",
                "Finance portal — revenue per property, occupancy, and tax-ready reports"
            ],
            modules: ["business", "client", "public", "partner", "finance"],
            changes: [
                "Sync booking calendars — no more double-bookings",
                "Automate guest messages — responses are faster",
                "Schedule cleanings — turnovers are efficient",
                "Optimize pricing — revenue increases",
                "Know top performers — invest in winning properties",
                "Track revenue per property — Finance portal shows real profitability"
            ]
        },

        valuation: { em: "📐", name: "Property Valuation", cat: "real_estate",
            problem: "Property valuers conduct inspections, gather market data, and produce reports. Without a system, inspection data is on paper, comparables are hard to find, and reports take hours to produce.",
            solutions: [
                "Inspection data capture — capture data on mobile during inspections",
                "Market comparables database — access recent sales data",
                "Report generation — generate valuation reports from data",
                "Client billing — track time and bill accurately",
                "Compliance + documentation — meet regulatory requirements",
                "Finance portal — job profitability, WIP, and tax-ready reports"
            ],
            modules: ["business", "client", "training", "product", "finance"],
            changes: [
                "Capture inspection data — digital, not paper",
                "Access market comparables — reports are accurate",
                "Generate reports fast — turnaround improves",
                "Bill clients accurately — income is tracked",
                "Stay compliant — documentation is ready",
                "Track job profitability — Finance portal shows real margin"
            ]
        },

        hotel: { em: "🏨", name: "Hotel", cat: "hospitality",
            problem: "Hotels juggle room bookings, housekeeping, F&B, and guest experience. Without a system, bookings are tracked in multiple places, housekeeping is coordinated by radio, and guest requests get lost.",
            solutions: [
                "Room booking + revenue management — manage bookings and optimize pricing",
                "Housekeeping + maintenance — coordinate cleaning and maintenance",
                "Guest experience + feedback — capture feedback and respond",
                "F&B integration — connect restaurant and room service orders",
                "Loyalty + marketing — build loyalty and market to past guests",
                "Finance portal — revenue per room, occupancy, and audit-ready reports"
            ],
            modules: ["business", "client", "public", "youtube", "training", "finance"],
            changes: [
                "Maximize room revenue — pricing is optimized",
                "Coordinate housekeeping — rooms are ready on time",
                "Enhance guest experience — feedback is captured",
                "Integrate F&B — orders flow smoothly",
                "Build loyalty — guests return",
                "Track RevPAR — Finance portal shows real revenue per available room"
            ]
        },

        lodge: { em: "🏕️", name: "Lodge / Camp", cat: "hospitality",
            problem: "Lodges offer unique experiences, but they also face operational complexity: booking management, activity scheduling, guest communication, and supplies. Without a system, activities are booked manually, supplies run out, and guest requests are missed.",
            solutions: [
                "Booking + activity scheduling — manage bookings and activities",
                "Guest communication — communicate with guests in one place",
                "Supply + inventory management — track supplies and reorder",
                "Activity + guide scheduling — assign guides and track activities",
                "Performance analytics — see which activities and rooms earn",
                "Finance portal — revenue per activity, occupancy, and tax-ready reports"
            ],
            modules: ["business", "client", "public", "product", "finance"],
            changes: [
                "Manage bookings and activities — guest experience improves",
                "Communicate with guests — no more lost requests",
                "Track supplies — stockouts drop",
                "Schedule guides — operations are organized",
                "Know what earns — invest in winning activities",
                "Track activity margin — Finance portal shows real profitability"
            ]
        },

        airbnb: { em: "🏠", name: "Airbnb / Short-stay", cat: "hospitality",
            problem: "Short-stay hosts manage listings, calendars, guests, cleaning, and pricing across platforms. Without a system, double-bookings happen, guest communication is slow, and cleaning is chaotic.",
            solutions: [
                "Multi-platform calendar sync — sync bookings across all platforms",
                "Dynamic pricing — adjust prices based on demand",
                "Automated guest messaging — send check-in details and reminders",
                "Cleaning + turnover scheduling — schedule cleanings automatically",
                "Performance analytics — track revenue and occupancy per property",
                "Finance portal — revenue per property, expense tracking, and tax-ready reports"
            ],
            modules: ["business", "client", "public", "partner", "finance"],
            changes: [
                "Sync all booking platforms — no more double-bookings",
                "Optimize pricing — revenue increases",
                "Automate guest messages — response time drops",
                "Schedule cleanings — turnovers are efficient",
                "Know your best properties — invest wisely",
                "Track revenue and expenses — Finance portal shows real net income"
            ]
        },

        guesthouse: { em: "🛏️", name: "Guest House", cat: "hospitality",
            problem: "Guest houses are smaller than hotels but still need booking management, guest services, and payments. Without a system, bookings are tracked in a diary, check-ins are slow, and guest requests are handled ad hoc.",
            solutions: [
                "Room + booking management — manage rooms and bookings",
                "Digital check-in/check-out — speed up arrival and departure",
                "Guest service requests — handle requests in one place",
                "Payment processing — accept payments digitally",
                "Reporting — understand occupancy and revenue",
                "Finance portal — occupancy, revenue per room, and tax-ready reports"
            ],
            modules: ["business", "client", "public", "finance"],
            changes: [
                "Manage rooms and bookings — operations are organized",
                "Speed up check-in — guest experience improves",
                "Handle guest requests — satisfaction increases",
                "Accept payments — revenue is captured",
                "Know your occupancy — decisions improve",
                "Track real revenue — Finance portal shows profitability"
            ]
        },

        tour: { em: "🧭", name: "Tour Operator", cat: "hospitality",
            problem: "Tour operators design packages, book accommodations, manage guides, and communicate with clients. Without a system, packages are managed in spreadsheets, bookings are manual, and guide scheduling is chaotic.",
            solutions: [
                "Tour package management — design and manage packages",
                "Booking + payment processing — process bookings and payments",
                "Guide scheduling + client updates — assign guides and update clients",
                "Supplier coordination — manage hotels, transport, and activities",
                "Client portal — clients view itineraries and updates",
                "Finance portal — package profitability, supplier payables, and tax-ready reports"
            ],
            modules: ["business", "client", "public", "partner", "youtube", "finance"],
            changes: [
                "Manage tour packages — packages are organized",
                "Process bookings — faster turnaround",
                "Schedule guides — assignments are clear",
                "Update clients — communication improves",
                "Coordinate suppliers — operations run smoothly",
                "Track package margin — Finance portal shows real profitability"
            ]
        },

        travelagency: { em: "✈️", name: "Travel Agency", cat: "hospitality",
            problem: "Travel agencies book flights, hotels, and tours for clients. Without a system, bookings are managed in spreadsheets, client communication is scattered, and payment tracking is manual.",
            solutions: [
                "Booking + itinerary management — manage bookings and itineraries",
                "Client communication — communicate with clients in one place",
                "Supplier + payment tracking — track suppliers and payments",
                "Markup + commission tracking — track markups and commissions",
                "Client portal — clients access bookings and documents",
                "Finance portal — commission receivables, supplier payables, and tax-ready reports"
            ],
            modules: ["business", "client", "public", "partner", "finance"],
            changes: [
                "Manage bookings and itineraries — efficiency improves",
                "Communicate with clients — no more lost messages",
                "Track suppliers and payments — visibility improves",
                "Track markups — income is accurate",
                "Give clients access — trust builds",
                "Track commission receivables — Finance portal shows outstanding"
            ]
        },

        manufacturing: { em: "🏭", name: "Manufacturing", cat: "manufacturing",
            problem: "Manufacturing involves production planning, raw materials, quality control, and distribution. Without a system, production is scheduled by memory, materials are ordered in bulk, and quality issues are caught late.",
            solutions: [
                "Production planning + scheduling — plan production based on orders and inventory",
                "Raw material + inventory management — track materials and reorder automatically",
                "Quality control tracking — log inspections and flag issues",
                "Distribution + logistics — manage distribution and track deliveries",
                "Profitability per product — know which products make money",
                "Finance portal — cost of production, WIP, and audit-ready reports"
            ],
            modules: ["business", "partner", "product", "training", "client", "finance"],
            changes: [
                "Plan production efficiently — production matches demand",
                "Track materials and quality — waste and defects drop",
                "Manage distribution — deliveries are on time",
                "Know product profitability — focus on winners",
                "Scale operations — the system supports growth",
                "Track cost of goods — Finance portal shows real margin per product"
            ]
        },

        foodprocessing: { em: "🥫", name: "Food Processing", cat: "manufacturing",
            problem: "Food processing must meet strict food safety regulations, track batches for traceability, and manage quality. Without a system, batch records are incomplete, recalls are difficult, and compliance is a scramble.",
            solutions: [
                "Batch + traceability tracking — track every batch from raw material to finished product",
                "Food safety compliance — log inspections and maintain compliance records",
                "Distribution + recall management — manage distribution and enable fast recalls",
                "Quality control — track quality tests and results",
                "Retailer management — manage retailer orders and payments",
                "Finance portal — batch costing, retailer receivables, and audit-ready reports"
            ],
            modules: ["business", "partner", "product", "training", "client", "finance"],
            changes: [
                "Track batches end-to-end — traceability is complete",
                "Stay food safety compliant — audits are painless",
                "Manage recalls instantly — traceability saves time",
                "Track quality — defects are caught early",
                "Serve retailers better — orders are managed",
                "Track batch margin — Finance portal shows real profitability"
            ]
        },

        beverage: { em: "🥤", name: "Beverage Production", cat: "manufacturing",
            problem: "Beverage production involves recipe management, batch production, quality control, and distribution. Without a system, recipes are inconsistent, batch records are incomplete, and distribution is manual.",
            solutions: [
                "Recipe + batch management — standardize recipes and track batches",
                "Quality control — test and track quality per batch",
                "Distribution + sales — manage distribution and sales",
                "Regulatory compliance — generate compliance reports",
                "Retailer + distributor management — manage partners",
                "Finance portal — excise duty, batch costing, and audit-ready reports"
            ],
            modules: ["business", "partner", "product", "client", "training", "finance"],
            changes: [
                "Manage recipes and batches — consistency improves",
                "Track quality — defects drop",
                "Distribute efficiently — deliveries are on time",
                "Stay compliant — reporting is automated",
                "Grow distribution — partners are managed",
                "Compute excise duty — Finance portal handles it automatically"
            ]
        },

        textiles: { em: "🧵", name: "Textile Manufacturing", cat: "manufacturing",
            problem: "Textile manufacturing involves raw material sourcing, production scheduling, quality control, and client orders. Without a system, materials are sourced reactively, production is scheduled manually, and quality issues are caught late.",
            solutions: [
                "Material sourcing + inventory — source materials and track inventory",
                "Production scheduling — schedule production based on orders",
                "Quality + order tracking — track quality and client orders",
                "Client management — manage client orders and payments",
                "Profitability analysis — know product profitability",
                "Finance portal — job costing, WIP, and audit-ready reports"
            ],
            modules: ["business", "partner", "product", "client", "finance"],
            changes: [
                "Source materials efficiently — sourcing is proactive",
                "Schedule production — production is organized",
                "Track quality and orders — defects and delays drop",
                "Manage clients — client relationships improve",
                "Know profitability — focus on profitable lines",
                "Track job cost — Finance portal shows real margin"
            ]
        },

        furniture_mfg: { em: "🪑", name: "Furniture Manufacturing", cat: "manufacturing",
            problem: "Furniture manufacturing involves custom orders, material tracking, production, and delivery. Without a system, custom orders are tracked in notebooks, materials are ordered by guess, and delivery scheduling is manual.",
            solutions: [
                "Custom order management — track each order with specs and timelines",
                "Material + production tracking — track materials and production stages",
                "Delivery scheduling — schedule deliveries",
                "Client progress updates — send updates with photos",
                "Billing + payments — invoice clients and track payments",
                "Finance portal — job costing, WIP, and tax-ready reports"
            ],
            modules: ["business", "partner", "product", "client", "finance"],
            changes: [
                "Manage custom orders — orders are organized",
                "Track materials and production — efficiency improves",
                "Schedule deliveries — customers get their orders on time",
                "Keep clients updated — satisfaction increases",
                "Bill accurately — income is tracked",
                "Track job profitability — Finance portal shows real margin"
            ]
        },

        software: { em: "💻", name: "Software Company", cat: "tech_digital",
            problem: "Software companies build products, serve clients, and manage support. Without a system, product development is chaotic, client projects are scattered, and support tickets are lost. Billing is complex, especially for subscriptions.",
            solutions: [
                "Product + project management — manage product development and client projects",
                "Client support ticketing — track support tickets and resolutions",
                "Subscription + billing management — manage recurring billing",
                "Client portal — clients access their projects and support",
                "Team collaboration — coordinate development and client teams",
                "Finance portal — MRR/ARR tracking, deferred revenue, and audit-ready reports"
            ],
            modules: ["business", "client", "product", "training", "partner", "finance"],
            changes: [
                "Manage product and projects — development is organized",
                "Support clients efficiently — tickets are tracked",
                "Automate billing — subscriptions bill automatically",
                "Give clients visibility — satisfaction improves",
                "Coordinate teams — collaboration is seamless",
                "Track MRR and churn — Finance portal shows real SaaS metrics"
            ]
        },

        itsupport: { em: "🖥️", name: "IT Support", cat: "tech_digital",
            problem: "IT support teams manage tickets, client systems, SLAs, and technician scheduling. Without a system, tickets are lost, SLAs are breached, and technician scheduling is chaotic.",
            solutions: [
                "Ticket + SLA management — track tickets and SLAs",
                "Client system monitoring — monitor client systems and alert on issues",
                "Technician scheduling + dispatch — schedule technicians and dispatch",
                "Client portal — clients submit tickets and check status",
                "Reporting + analytics — report on SLAs and performance",
                "Finance portal — service contract revenue, WIP, and tax-ready reports"
            ],
            modules: ["business", "client", "training", "partner", "finance"],
            changes: [
                "Manage tickets and SLAs — SLAs are met",
                "Monitor client systems — issues are caught early",
                "Dispatch technicians — scheduling is efficient",
                "Give clients visibility — satisfaction improves",
                "Report on performance — data guides improvement",
                "Track contract revenue — Finance portal shows recurring income"
            ]
        },

        webdev: { em: "🌐", name: "Web Development", cat: "tech_digital",
            problem: "Web development agencies manage multiple client projects, revisions, hosting, and billing. Without a system, projects are tracked in spreadsheets, revisions cause confusion, hosting renewals slip, and billing is based on estimates.",
            solutions: [
                "Project + revision tracking — track projects and revisions",
                "Hosting + domain management — manage hosting and domains",
                "Time + project billing — track time and bill accurately",
                "Client portal — clients view project status",
                "Maintenance + support — offer ongoing maintenance",
                "Finance portal — project profitability, WIP, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "training", "finance"],
            changes: [
                "Track projects and revisions — confusion drops",
                "Manage hosting — renewals are handled",
                "Bill accurately — income is tracked",
                "Give clients visibility — trust builds",
                "Offer maintenance — recurring revenue",
                "Track project margin — Finance portal shows real profitability"
            ]
        },

        cctv: { em: "📹", name: "CCTV & Security Systems", cat: "tech_digital",
            problem: "CCTV and security system installers manage installation projects, equipment inventory, monitoring, and maintenance. Without a system, installations are scheduled manually, equipment inventory is estimated, and maintenance is reactive.",
            solutions: [
                "Installation project management — manage installations from survey to handover",
                "Equipment inventory tracking — track equipment and reorder",
                "Monitoring + alerts — monitor systems and alert on issues",
                "Maintenance scheduling — schedule preventive maintenance",
                "Client billing + contracts — manage billing and contracts",
                "Finance portal — project costing, contract revenue, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "partner", "training", "finance"],
            changes: [
                "Manage installations — projects are organized",
                "Track equipment — inventory is accurate",
                "Monitor systems — issues are caught early",
                "Schedule maintenance — breakdowns drop",
                "Manage billing — income is tracked",
                "Track project margin — Finance portal shows real profitability"
            ]
        },

        phone_repair: { em: "📱", name: "Phone Repair Shop", cat: "tech_digital",
            problem: "Phone repair shops track repairs, parts, customers, and warranties. Without a system, repair tickets are on paper, parts inventory is estimated, and customer updates are by phone. Warranty claims are disputed, and turnaround times vary.",
            solutions: [
                "Repair ticket tracking — track each repair with status and parts",
                "Parts inventory management — track parts and reorder",
                "Customer updates + warranties — update customers and manage warranties",
                "Technician tracking — track who's working on what",
                "Analytics — see repair volumes and profitability",
                "Finance portal — repair margin, parts cost, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "finance"],
            changes: [
                "Track repairs — status is visible",
                "Manage parts — stockouts drop",
                "Update customers — satisfaction improves",
                "Track technicians — productivity increases",
                "Know your numbers — profitability is visible",
                "Track repair margin — Finance portal shows profit per job"
            ]
        },

        church: { em: "⛪", name: "Church", cat: "community_faith",
            problem: "Churches manage members, contributions, events, and communication. Without a system, member records are on paper, contributions are tracked in envelopes, and event planning is chaotic.",
            solutions: [
                "Member + contribution tracking — track members and contributions",
                "Event + service planning — plan events and services",
                "Communication + notifications — send updates via SMS/WhatsApp",
                "Groups + ministries — manage small groups and ministries",
                "Media + content — share sermons and content online",
                "Finance portal — donation tracking, fund accounting, and audit-ready reports"
            ],
            modules: ["business", "client", "public", "youtube", "training", "finance"],
            changes: [
                "Track members and giving — records are organized",
                "Plan events — events run smoothly",
                "Communicate with congregation — reach increases",
                "Manage groups — community grows",
                "Share content online — reach extends",
                "Track funds properly — Finance portal shows fund accounting"
            ]
        },

        mosque: { em: "🕌", name: "Mosque", cat: "community_faith",
            problem: "Mosques manage members, donations, prayer schedules, and community events. Without a system, donations are tracked manually, events are planned by word of mouth, and member communication is informal.",
            solutions: [
                "Member + donation tracking — track members and donations",
                "Prayer + event scheduling — schedule prayers and events",
                "Community communication — send updates via SMS/WhatsApp",
                "Education + classes — manage classes and programs",
                "Media + content — share lectures and content online",
                "Finance portal — donation tracking, fund accounting, and audit-ready reports"
            ],
            modules: ["business", "client", "public", "youtube", "finance"],
            changes: [
                "Track members and donations — transparency improves",
                "Schedule prayers and events — events run smoothly",
                "Communicate with community — engagement increases",
                "Manage education — classes are organized",
                "Share content — reach extends",
                "Track funds properly — Finance portal shows fund accounting"
            ]
        },

        welfare: { em: "🫱", name: "Welfare Group", cat: "community_faith",
            problem: "Welfare groups pool contributions and provide support during hardship. Without a system, contributions are tracked in notebooks, loans are undocumented, and meeting decisions aren't recorded.",
            solutions: [
                "Contribution + savings tracking — record contributions",
                "Member records — manage member profiles",
                "Meeting + loan management — document meetings and track loans",
                "Statements + reports — provide statements to members",
                "Communication — send updates via SMS/WhatsApp",
                "Finance portal — fund accounting, member equity, and audit-ready reports"
            ],
            modules: ["business", "client", "training", "finance"],
            changes: [
                "Track contributions — transparency improves",
                "Manage members — records are organized",
                "Record meetings and loans — disputes drop",
                "Provide statements — trust builds",
                "Communicate updates — members stay informed",
                "Track fund performance — Finance portal shows real returns"
            ]
        },

        kiosk: { em: "🏪", name: "Kiosk", cat: "informal_msme",
            problem: "A kiosk runs on daily cash sales, small stock, and customer credit. Without a system, stock is tracked mentally, cash is hard to reconcile, and customer credit is a notebook.",
            solutions: [
                "Simple stock + sales tracking — record sales and track stock",
                "M-Pesa + cash reconciliation — reconcile payments",
                "Customer credit notes — track who owes what",
                "Sales reports — see daily and weekly sales",
                "Product profitability — know which products sell",
                "Finance portal — daily profit, cash flow, and tax-ready reports"
            ],
            modules: ["business", "client", "public", "finance"],
            changes: [
                "Track stock and sales — visibility improves",
                "Reconcile payments — cash matches records",
                "Manage customer credit — recoveries improve",
                "Know your daily sales — decisions improve",
                "Focus on what sells — profitability increases",
                "See daily profit — Finance portal shows real numbers"
            ]
        },

        streetvendor: { em: "🧺", name: "Street Vendor", cat: "informal_msme",
            problem: "Street vendors sell daily, often without fixed location. Without a system, sales are tracked in memory, stock is estimated, and M-Pesa payments are mixed with cash.",
            solutions: [
                "Quick sale recording — record sales in seconds",
                "Daily stock tracking — track stock before and after",
                "M-Pesa payments — accept digital payments",
                "Daily summary — see daily sales and profit",
                "Location history — track where sales are best",
                "Finance portal — daily profit, savings tracking, and tax-ready reports"
            ],
            modules: ["business", "client", "public", "finance"],
            changes: [
                "Record sales easily — no more memory",
                "Track daily stock — know what sold",
                "Accept M-Pesa — serve more customers",
                "See daily profit — decisions improve",
                "Find best locations — sales increase",
                "Track savings — Finance portal helps plan for the future"
            ]
        },

        jua_kali: { em: "🔧", name: "Jua Kali Artisan", cat: "informal_msme",
            problem: "Jua Kali artisans take custom orders, buy materials, and deliver finished products. Without a system, orders are tracked in notebooks, material costs are estimated, and customer communication is informal.",
            solutions: [
                "Job + order tracking — track each order",
                "Material cost tracking — track material costs",
                "Customer + pricing management — manage customers and pricing",
                "Delivery + payment tracking — track deliveries and payments",
                "Skill + training records — track skills and certifications",
                "Finance portal — job costing, WIP, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "training", "finance"],
            changes: [
                "Track jobs and orders — orders are organized",
                "Manage material costs — costs are visible",
                "Price confidently — pricing is consistent",
                "Track deliveries — customers are served",
                "Build skills — certifications are documented",
                "Track job profitability — Finance portal shows real margin"
            ]
        },

        mtumba: { em: "👕", name: "Mtumba (Second-hand)", cat: "informal_msme",
            problem: "Mtumba sellers buy bales, sort items, and sell individually. Without a system, bale sorting is manual, pricing is based on feel, and customer base is not tracked.",
            solutions: [
                "Bale + stock tracking — track each bale through sorting",
                "Pricing + margin management — set prices based on cost",
                "Customer + loyalty tracking — track customers and repeat buyers",
                "Sales analytics — know what sells best",
                "Profitability per bale — know which bales were profitable",
                "Finance portal — margin per bale, cash flow, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "finance"],
            changes: [
                "Track bales and stock — inventory is visible",
                "Price for profit — pricing is data-driven",
                "Build customer base — repeat buyers grow",
                "Know best sellers — buy smarter",
                "Improve bale profitability — sourcing improves",
                "Track margin per bale — Finance portal shows real profitability"
            ]
        },

        tailor: { em: "🧵", name: "Tailor", cat: "informal_msme",
            problem: "Tailors take measurements, source fabric, and deliver finished garments. Without a system, measurements are on paper, delivery dates are estimates, and pricing is inconsistent.",
            solutions: [
                "Order + measurement tracking — track orders and measurements",
                "Delivery date management — set and track delivery dates",
                "Pricing + payment tracking — set prices and track payments",
                "Client communication — send updates via SMS/WhatsApp",
                "Style + design catalog — showcase styles",
                "Finance portal — job costing, deposit tracking, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "finance"],
            changes: [
                "Track orders and measurements — errors drop",
                "Meet delivery dates — customers are happy",
                "Price accurately — income is consistent",
                "Update customers — satisfaction improves",
                "Showcase styles — sales increase",
                "Track job margin — Finance portal shows real profitability"
            ]
        },

        mpesa_agent: { em: "📲", name: "M-Pesa Agent", cat: "informal_msme",
            problem: "M-Pesa agents manage float, transactions, and cash. Without a system, float is tracked mentally, transactions are hard to reconcile, and cash handling is risky.",
            solutions: [
                "Float + transaction tracking — track float and transactions",
                "Cash reconciliation — reconcile cash daily",
                "Security alerts — alert on unusual activity",
                "Customer records — track repeat customers",
                "Reporting — generate reports for compliance",
                "Finance portal — float tracking, commission income, and audit-ready reports"
            ],
            modules: ["business", "client", "public", "finance"],
            changes: [
                "Track float and transactions — visibility improves",
                "Reconcile cash — daily reconciliation is easy",
                "Stay secure — alerts prevent fraud",
                "Serve customers better — records help",
                "Stay compliant — reports are ready",
                "Track commission income — Finance portal shows real earnings"
            ]
        },

        petrol: { em: "⛽", name: "Petrol Station", cat: "energy_env",
            problem: "Petrol stations manage fuel inventory, pumps, attendants, and compliance. Without a system, fuel inventory is tracked manually, pump readings are on paper, and compliance is a scramble.",
            solutions: [
                "Fuel inventory + dip tracking — track fuel levels and dip readings",
                "Pump + attendant management — manage pumps and attendants",
                "Compliance + safety logs — log compliance and safety",
                "Sales reporting — track sales by pump and shift",
                "Customer management — track fleet customers",
                "Finance portal — fuel margin, excise tracking, and audit-ready reports"
            ],
            modules: ["business", "client", "product", "partner", "training", "finance"],
            changes: [
                "Track fuel inventory — shrinkage drops",
                "Manage pumps and attendants — accountability improves",
                "Stay compliant — logs are ready",
                "Know your sales — reporting is accurate",
                "Serve fleet customers — loyalty grows",
                "Track fuel margin — Finance portal shows real profitability per litre"
            ]
        },

        gas: { em: "🔥", name: "Gas Cylinder Retailer", cat: "energy_env",
            problem: "Gas cylinder retailers manage cylinders, exchanges, deliveries, and safety. Without a system, cylinder tracking is manual, exchanges are hard to track, and safety compliance is a paper exercise.",
            solutions: [
                "Cylinder + exchange tracking — track cylinders and exchanges",
                "Safety compliance logs — document safety checks",
                "Delivery + customer management — schedule deliveries and manage customers",
                "Payment tracking — track payments and deposits",
                "Reporting — track cylinder turnover",
                "Finance portal — deposit tracking, margin per cylinder, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "public", "finance"],
            changes: [
                "Track cylinders — theft and loss drop",
                "Stay safety compliant — logs are ready",
                "Manage deliveries — customers are served",
                "Track deposits — income is accurate",
                "Know cylinder turnover — inventory is optimized",
                "Track margin per cylinder — Finance portal shows real numbers"
            ]
        },

        solar_home: { em: "☀️", name: "Solar Home Systems", cat: "energy_env",
            problem: "Solar home system providers sell products, install systems, and offer after-sales support. Without a system, product catalog is manual, installation scheduling is chaotic, and warranty tracking is a mess.",
            solutions: [
                "Product + installation management — manage products and installations",
                "After-sales + warranty tracking — track warranty and service",
                "Payment plans + tracking — offer and track payment plans",
                "Customer management — manage customers and their systems",
                "Performance monitoring — monitor system performance",
                "Finance portal — payment plan tracking, lease revenue, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "training", "partner", "finance"],
            changes: [
                "Manage products and installations — operations improve",
                "Track warranties — claims are handled",
                "Offer payment plans — sales increase",
                "Manage customers — satisfaction improves",
                "Monitor performance — service is proactive",
                "Track lease revenue — Finance portal shows real recurring income"
            ]
        },

        garbage: { em: "🗑️", name: "Waste Collection", cat: "energy_env",
            problem: "Waste collection companies manage routes, customers, vehicles, and compliance. Without a system, routes are planned by memory, customer billing is manual, and vehicle maintenance is reactive.",
            solutions: [
                "Route + schedule management — plan routes and schedules",
                "Customer billing + payments — bill customers and collect payments",
                "Vehicle + compliance tracking — track vehicles and compliance",
                "Missed collection tracking — track missed collections",
                "Reporting — generate reports for compliance",
                "Finance portal — route profitability, fuel cost, and tax-ready reports"
            ],
            modules: ["business", "client", "partner", "training", "finance"],
            changes: [
                "Optimize collection routes — fuel and time savings",
                "Bill customers automatically — collections improve",
                "Track vehicles — maintenance is proactive",
                "Track missed collections — service improves",
                "Stay compliant — reports are ready",
                "Track route profitability — Finance portal shows real margin"
            ]
        },

        mining: { em: "⛏️", name: "Mining Company", cat: "mining_extract",
            problem: "Mining companies manage sites, equipment, safety, and output. Without a system, output is tracked manually, equipment maintenance is reactive, and safety compliance is a paperwork exercise.",
            solutions: [
                "Site + equipment management — track sites and equipment",
                "Safety compliance tracking — log safety checks and incidents",
                "Output + sales tracking — track output and sales",
                "Buyer management — manage buyers and contracts",
                "Reporting — generate reports for regulators",
                "Finance portal — royalty tracking, buyer receivables, and audit-ready reports"
            ],
            modules: ["business", "partner", "product", "training", "client", "finance"],
            changes: [
                "Manage sites and equipment — operations improve",
                "Stay safety compliant — compliance is documented",
                "Track output and sales — visibility improves",
                "Manage buyers — relationships grow",
                "Report to regulators — reports are ready",
                "Track royalties — Finance portal computes them automatically"
            ]
        },

        quarry: { em: "🪨", name: "Quarry", cat: "mining_extract",
            problem: "Quarries manage production, equipment, safety, and sales. Without a system, production is tracked manually, equipment maintenance is reactive, and sales are ad hoc.",
            solutions: [
                "Production + output tracking — track production and output",
                "Equipment maintenance — schedule maintenance",
                "Safety compliance + sales — log safety and track sales",
                "Buyer management — manage buyers",
                "Reporting — generate reports",
                "Finance portal — production costing, buyer receivables, and audit-ready reports"
            ],
            modules: ["business", "partner", "product", "training", "finance"],
            changes: [
                "Track production — output is visible",
                "Maintain equipment — downtime drops",
                "Stay safe — compliance is documented",
                "Serve buyers — sales increase",
                "Report compliance — reports are ready",
                "Track production cost — Finance portal shows real margin per tonne"
            ]
        },

        gold_mining: { em: "🥇", name: "Gold Mining", cat: "mining_extract",
            problem: "Gold mining involves output tracking, equipment, safety, licensing, and buyer management. Without a system, output is tracked manually, licensing is a paperwork burden, and buyer management is ad hoc.",
            solutions: [
                "Output + equipment tracking — track output and equipment",
                "Licensing + compliance — track licenses and compliance",
                "Buyer + sales management — manage buyers and sales",
                "Safety tracking — log safety checks",
                "Reporting — generate reports for regulators",
                "Finance portal — royalty tracking, buyer settlements, and audit-ready reports"
            ],
            modules: ["business", "partner", "product", "training", "client", "finance"],
            changes: [
                "Track output — visibility improves",
                "Stay licensed — compliance is documented",
                "Manage buyers — relationships grow",
                "Stay safe — incidents drop",
                "Report to regulators — reports are ready",
                "Track settlements — Finance portal shows real revenue"
            ]
        },

        events: { em: "🎉", name: "Events Company", cat: "events_ent",
            problem: "Events companies plan events, coordinate vendors, manage clients, and handle billing. Without a system, event planning is chaotic, vendor coordination is by phone, and billing is manual.",
            solutions: [
                "Event planning + timelines — plan events with clear timelines",
                "Vendor coordination — coordinate vendors in one place",
                "Client billing + payments — bill clients and track payments",
                "Staff + crew scheduling — schedule staff",
                "Post-event reporting — analyze event performance",
                "Finance portal — event P&L, vendor payables, and tax-ready reports"
            ],
            modules: ["business", "client", "partner", "public", "product", "finance"],
            changes: [
                "Plan events seamlessly — timelines are clear",
                "Coordinate vendors — no more phone tag",
                "Bill clients easily — income is tracked",
                "Schedule crews — staffing is organized",
                "Learn from events — reporting improves",
                "Track event profitability — Finance portal shows real margin"
            ]
        },

        wedding: { em: "💍", name: "Wedding Planner", cat: "events_ent",
            problem: "Wedding planners manage client consultations, vendors, budgets, and timelines. Without a system, client budgets are tracked in spreadsheets, vendor coordination is by phone, and timelines are scattered.",
            solutions: [
                "Client + budget management — track client budgets",
                "Vendor coordination — coordinate vendors in one place",
                "Timeline + checklist — manage timelines and checklists",
                "Payment tracking — track payments to vendors and from clients",
                "Client portal — share plans with clients",
                "Finance portal — event P&L, vendor payables, and tax-ready reports"
            ],
            modules: ["business", "client", "partner", "public", "product", "finance"],
            changes: [
                "Manage client budgets — finances are clear",
                "Coordinate vendors — no more chaos",
                "Track timelines — weddings run smoothly",
                "Track payments — income is accurate",
                "Share plans — clients are confident",
                "Track event margin — Finance portal shows real profitability"
            ]
        },

        dj: { em: "🎧", name: "DJ / Entertainment", cat: "events_ent",
            problem: "DJs manage bookings, music libraries, equipment, and payments. Without a system, bookings are tracked in a calendar, music is on hard drives, and equipment is maintained reactively.",
            solutions: [
                "Booking + calendar management — track bookings",
                "Music + equipment library — organize music and equipment",
                "Payment tracking — track payments and deposits",
                "Client communication — communicate with clients",
                "Performance history — track performances",
                "Finance portal — booking income, deposit tracking, and tax-ready reports"
            ],
            modules: ["business", "client", "public", "product", "finance"],
            changes: [
                "Manage bookings — no more double-bookings",
                "Organize music — find tracks fast",
                "Track payments — income is captured",
                "Communicate with clients — satisfaction improves",
                "Track performances — build a portfolio",
                "Track booking income — Finance portal shows real earnings"
            ]
        },

        decor: { em: "🎀", name: "Event Decor", cat: "events_ent",
            problem: "Event decorators manage inventory, client consultations, setup scheduling, and billing. Without a system, inventory is estimated, client designs are in memory, and setup scheduling is chaotic.",
            solutions: [
                "Inventory + asset tracking — track inventory",
                "Client consultation + mood boards — capture client designs",
                "Setup scheduling + billing — schedule setups and bill",
                "Vendor coordination — coordinate with other vendors",
                "Portfolio — showcase past work",
                "Finance portal — job costing, deposit tracking, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "public", "finance"],
            changes: [
                "Track inventory — no more missing items",
                "Manage client designs — expectations are clear",
                "Schedule setups — events run smoothly",
                "Bill accurately — income is tracked",
                "Showcase work — new clients find you",
                "Track job margin — Finance portal shows real profitability"
            ]
        },

        ngo: { em: "🤝", name: "NGO", cat: "gov_ngo",
            problem: "NGOs manage donors, grants, projects, beneficiaries, and reporting. Without a system, donor records are scattered, project tracking is manual, and reporting to funders takes weeks.",
            solutions: [
                "Donor + grant management — track donors and grants",
                "Project + impact tracking — track projects and impact",
                "Beneficiary records — manage beneficiary data",
                "Reporting — generate reports for funders",
                "Field data collection — collect data in the field",
                "Finance portal — fund accounting, grant compliance, and audit-ready reports"
            ],
            modules: ["business", "client", "partner", "training", "public", "finance"],
            changes: [
                "Manage donors — relationships grow",
                "Track project impact — reporting is easier",
                "Manage beneficiaries — data is organized",
                "Report to funders — reports are ready",
                "Collect field data — accuracy improves",
                "Track funds properly — Finance portal shows fund accounting per grant"
            ]
        },

        cbo: { em: "👥", name: "Community-Based Org", cat: "gov_ngo",
            problem: "CBOs manage members, projects, and community engagement. Without a system, member records are on paper, projects are tracked manually, and reporting is difficult.",
            solutions: [
                "Member + project tracking — track members and projects",
                "Community engagement tools — engage community",
                "Reporting + compliance — generate reports",
                "Training + workshops — manage training",
                "Communication — communicate with members",
                "Finance portal — fund accounting, member contributions, and audit-ready reports"
            ],
            modules: ["business", "client", "training", "public", "finance"],
            changes: [
                "Manage members — records are organized",
                "Track projects — progress is visible",
                "Engage community — participation grows",
                "Report compliance — reports are ready",
                "Run training — knowledge spreads",
                "Track funds properly — Finance portal shows real allocation"
            ]
        },

        charity: { em: "❤️", name: "Charity", cat: "gov_ngo",
            problem: "Charities manage donors, fundraising, beneficiary tracking, and transparency. Without a system, donor records are scattered, fundraising is manual, and transparency reporting is difficult.",
            solutions: [
                "Donor + fundraising management — track donors and fundraising",
                "Beneficiary tracking — track beneficiaries",
                "Transparency reporting — generate transparent reports",
                "Events + campaigns — manage events and campaigns",
                "Communication — communicate with donors",
                "Finance portal — donation tracking, fund allocation, and audit-ready reports"
            ],
            modules: ["business", "client", "public", "training", "finance"],
            changes: [
                "Manage donors — relationships grow",
                "Track beneficiaries — impact is visible",
                "Report transparently — trust builds",
                "Run campaigns — fundraising increases",
                "Communicate — donors stay engaged",
                "Track fund allocation — Finance portal shows exactly where money goes"
            ]
        },

        mechanic: { em: "🔧", name: "Mechanic / Garage", cat: "automotive",
            problem: "Garages manage jobs, parts, customers, and billing. Without a system, job cards are on paper, parts inventory is estimated, and customer updates are by phone.",
            solutions: [
                "Job card + tracking — track each job with status",
                "Parts inventory management — track parts and reorder",
                "Customer updates + billing — update customers and bill",
                "Technician tracking — track who's working on what",
                "Vehicle history — track vehicle service history",
                "Finance portal — job costing, parts margin, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "partner", "finance"],
            changes: [
                "Track jobs — status is visible",
                "Manage parts — stockouts drop",
                "Update customers — satisfaction improves",
                "Track technicians — productivity increases",
                "Know vehicle history — service improves",
                "Track job margin — Finance portal shows real profitability"
            ]
        },

        carwash: { em: "🚿", name: "Car Wash", cat: "automotive",
            problem: "Car washes manage service queues, staff, and customer loyalty. Without a system, service tracking is manual, staff scheduling is chaotic, and loyalty is informal.",
            solutions: [
                "Service + queue management — manage service queue",
                "Staff scheduling — schedule staff",
                "Loyalty + payments — build loyalty and accept payments",
                "Customer history — track customer visits",
                "Reporting — track daily sales",
                "Finance portal — daily profit, staff payouts, and tax-ready reports"
            ],
            modules: ["business", "client", "public", "finance"],
            changes: [
                "Manage queues — customers wait less",
                "Schedule staff — staffing matches demand",
                "Build loyalty — repeat customers grow",
                "Accept payments — cash handling drops",
                "Track sales — visibility improves",
                "Track daily profit — Finance portal shows real numbers"
            ]
        },

        autospares: { em: "🔩", name: "Auto Spares Shop", cat: "automotive",
            problem: "Auto spares shops manage a huge catalog of parts, customer credit, and supplier relationships. Without a system, parts lookup is by memory, inventory is estimated, and customer credit is tracked in notebooks.",
            solutions: [
                "Parts catalog + lookup — find parts fast",
                "Inventory management — track inventory",
                "Customer + supplier credit — track credit",
                "Sales analytics — know what sells",
                "Supplier management — manage suppliers",
                "Finance portal — margin per part, credit aging, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "partner", "finance"],
            changes: [
                "Look up parts fast — customers are served",
                "Track inventory — stockouts drop",
                "Manage credit — recoveries improve",
                "Know best sellers — buy smarter",
                "Manage suppliers — pricing improves",
                "Track margin per part — Finance portal shows real profitability"
            ]
        },

        tyreshop: { em: "🛞", name: "Tyre Shop", cat: "automotive",
            problem: "Tyre shops manage tyre inventory, fitting scheduling, customer records, and warranties. Without a system, inventory is estimated, fitting is scheduled by phone, and warranty tracking is manual.",
            solutions: [
                "Tyre inventory + fitment — track inventory and fitment",
                "Service scheduling — schedule fittings",
                "Warranty + customer records — track warranty and customers",
                "Vehicle history — track vehicle tyre history",
                "Reporting — track sales",
                "Finance portal — margin per tyre, fitting revenue, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "finance"],
            changes: [
                "Track tyre inventory — stockouts drop",
                "Schedule fittings — customers are served",
                "Manage warranties — claims are handled",
                "Know vehicle history — service improves",
                "Track sales — profitability is visible",
                "Track fitting margin — Finance portal shows real profitability"
            ]
        },

        sports_club: { em: "🏟️", name: "Sports Club", cat: "sports_rec",
            problem: "Sports clubs manage members, facilities, events, and payments. Without a system, member records are on paper, facility booking is by phone, and events are planned manually.",
            solutions: [
                "Member + payment management — manage members and payments",
                "Facility + event scheduling — schedule facilities and events",
                "Team + league management — manage teams and leagues",
                "Communication — communicate with members",
                "Content — share content online",
                "Finance portal — membership revenue, event P&L, and audit-ready reports"
            ],
            modules: ["business", "client", "public", "youtube", "training", "finance"],
            changes: [
                "Manage members — records are organized",
                "Schedule facilities — bookings are efficient",
                "Run events — events run smoothly",
                "Engage members — participation grows",
                "Share content — reach extends",
                "Track membership revenue — Finance portal shows real income"
            ]
        },

        football_club: { em: "⚽", name: "Football Club", cat: "sports_rec",
            problem: "Football clubs manage players, training, fixtures, fans, and sponsorship. Without a system, player records are on paper, training schedules are informal, and fan engagement is minimal.",
            solutions: [
                "Player + staff management — manage players and staff",
                "Training + match scheduling — schedule training and matches",
                "Fan + sponsor engagement — engage fans and sponsors",
                "Content — share match highlights and content",
                "Ticketing + events — manage ticketing",
                "Finance portal — sponsorship revenue, gate receipts, and audit-ready reports"
            ],
            modules: ["business", "client", "public", "youtube", "partner", "finance"],
            changes: [
                "Manage players and staff — records are organized",
                "Schedule training and matches — operations improve",
                "Engage fans — attendance grows",
                "Attract sponsors — sponsors see value",
                "Share content — reach extends",
                "Track revenue streams — Finance portal shows real income"
            ]
        },

        gym: { em: "🏋️", name: "Gym / Fitness", cat: "sports_rec",
            problem: "Gyms manage memberships, classes, trainers, and retention. Without a system, memberships are tracked in spreadsheets, class scheduling is manual, and retention is low.",
            solutions: [
                "Membership + billing automation — manage memberships and billing",
                "Class scheduling + booking — schedule classes and allow booking",
                "Trainer + member matching — match trainers to members",
                "Retention + engagement — engage members",
                "Video content — share workouts online",
                "Finance portal — membership revenue, churn analysis, and tax-ready reports"
            ],
            modules: ["business", "client", "public", "training", "youtube", "finance"],
            changes: [
                "Automate memberships and renewals — retention improves",
                "Fill classes with online booking — attendance grows",
                "Engage members with video content — loyalty increases",
                "Match trainers to members — satisfaction improves",
                "Track performance — data guides operations",
                "Track churn — Finance portal shows real retention rates"
            ]
        },

        guards: { em: "🛡️", name: "Security Guards", cat: "security_safety",
            problem: "Security companies manage guard scheduling, site coverage, incident reporting, and client billing. Without a system, guard scheduling is manual, patrols are undocumented, and incident reports are late.",
            solutions: [
                "Guard scheduling + patrol tracking — schedule guards and track patrols",
                "Incident reporting — report incidents from the field",
                "Client billing — bill clients based on service",
                "Training + certification — track training and certifications",
                "Client portal — clients view service records",
                "Finance portal — guard payroll, client billing, and tax-ready reports"
            ],
            modules: ["business", "client", "training", "partner", "finance"],
            changes: [
                "Schedule guards — coverage is complete",
                "Track patrols — accountability improves",
                "Report incidents — clients are informed",
                "Bill clients accurately — income is tracked",
                "Train guards — quality improves",
                "Pay guards accurately — Finance portal computes payroll"
            ]
        },

        alarm: { em: "🚨", name: "Alarm Systems", cat: "security_safety",
            problem: "Alarm companies install, monitor, and maintain alarm systems. Without a system, installation is scheduled manually, monitoring is basic, and maintenance is reactive.",
            solutions: [
                "Installation + monitoring — manage installation and monitoring",
                "Maintenance scheduling — schedule preventive maintenance",
                "Client management + billing — manage clients and billing",
                "Alerts — send alerts on alarms",
                "Reporting — track system performance",
                "Finance portal — contract revenue, monitoring fees, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "partner", "training", "finance"],
            changes: [
                "Manage installations — projects are organized",
                "Monitor alarms — response improves",
                "Schedule maintenance — breakdowns drop",
                "Bill clients — income is tracked",
                "Report performance — data guides improvement",
                "Track recurring revenue — Finance portal shows real MRR"
            ]
        },

        fire_safety: { em: "🧯", name: "Fire Safety", cat: "security_safety",
            problem: "Fire safety companies inspect equipment, ensure compliance, and provide training. Without a system, inspections are tracked manually, compliance is a paperwork burden, and training is informal.",
            solutions: [
                "Equipment inspection + compliance — track inspections and compliance",
                "Installation + maintenance — manage installation and maintenance",
                "Training + certification — manage training",
                "Client management — manage clients",
                "Reporting — generate compliance reports",
                "Finance portal — service contract revenue, WIP, and audit-ready reports"
            ],
            modules: ["business", "client", "product", "training", "partner", "finance"],
            changes: [
                "Track inspections — compliance is documented",
                "Stay compliant — audits are painless",
                "Offer training — clients value it",
                "Manage clients — relationships grow",
                "Report compliance — reports are ready",
                "Track contract revenue — Finance portal shows real income"
            ]
        },

        law_firm: { em: "⚖️", name: "Law Firm", cat: "legal_compliance",
            problem: "Law firms manage cases, documents, billable hours, and client communication. Without a system, documents are on shared drives, billable hours are estimated, and client communication is scattered.",
            solutions: [
                "Case + matter management — manage cases",
                "Document version control — control documents",
                "Billable hour tracking — track billable hours",
                "Client communication — communicate with clients",
                "Secure document storage — store documents securely",
                "Finance portal — trust accounting, WIP, and audit-ready reports"
            ],
            modules: ["business", "client", "training", "product", "finance"],
            changes: [
                "Never miss a deadline — deadlines are tracked",
                "Track billable hours — income increases",
                "Secure client communication — trust builds",
                "Access documents instantly — efficiency improves",
                "Scale the firm — processes are standardized",
                "Manage trust accounts correctly — Finance portal separates client funds"
            ]
        },

        notary: { em: "✍️", name: "Notary Public", cat: "legal_compliance",
            problem: "Notaries track documents, schedule appointments, ensure compliance, and keep records. Without a system, appointments are by phone, records are on paper, and compliance is manual.",
            solutions: [
                "Document + appointment tracking — track documents and appointments",
                "Digital record keeping — keep records digitally",
                "Compliance logs — log compliance",
                "Client management — manage clients",
                "Reporting — generate reports",
                "Finance portal — fee tracking, WIP, and tax-ready reports"
            ],
            modules: ["business", "client", "public", "finance"],
            changes: [
                "Track documents — records are organized",
                "Schedule appointments — clients are served",
                "Stay compliant — logs are ready",
                "Manage clients — relationships grow",
                "Report activity — reports are easy",
                "Track fees — Finance portal shows real income"
            ]
        },

        compliance: { em: "📋", name: "Compliance Consultancy", cat: "legal_compliance",
            problem: "Compliance consultancies track regulations, assess clients, and provide training. Without a system, regulatory updates are missed, client assessments are manual, and training is informal.",
            solutions: [
                "Regulatory tracking — track regulations and updates",
                "Client assessment + reporting — assess clients and report",
                "Training + certification — provide training",
                "Client management — manage clients",
                "Reporting — generate compliance reports",
                "Finance portal — engagement profitability, WIP, and tax-ready reports"
            ],
            modules: ["business", "client", "training", "public", "partner", "finance"],
            changes: [
                "Track regulations — no more missed updates",
                "Assess clients — assessments are organized",
                "Provide training — knowledge spreads",
                "Manage clients — relationships grow",
                "Report compliance — reports are ready",
                "Track engagement margin — Finance portal shows real profitability"
            ]
        },

        warehouse_2: { em: "🏭", name: "Warehouse (3PL)", cat: "warehouse",
            problem: "Warehouses manage inventory accuracy, client reporting, space utilization, and billing. Without a system, inventory is counted manually, client reporting takes hours, and space utilization is unclear.",
            solutions: [
                "Real-time inventory tracking — track inventory in real time",
                "Client reporting portal — report to clients",
                "Space + billing management — track space and bill",
                "Inbound + outbound processing — manage inbound and outbound",
                "Performance analytics — track productivity",
                "Finance portal — client billing, cost per pallet, and audit-ready reports"
            ],
            modules: ["business", "client", "partner", "product", "finance"],
            changes: [
                "Know inventory exactly — accuracy improves",
                "Report to clients — satisfaction increases",
                "Bill accurately — income is tracked",
                "Process inbound/outbound fast — operations improve",
                "Track productivity — performance improves",
                "Track cost per pallet — Finance portal shows real margin"
            ]
        },

        cold_storage: { em: "❄️", name: "Cold Storage", cat: "warehouse",
            problem: "Cold storage facilities monitor temperature, track inventory, ensure compliance, and bill clients. Without a system, temperature monitoring is manual, inventory is estimated, and compliance is a paperwork burden.",
            solutions: [
                "Temperature monitoring + alerts — monitor temperature and alert",
                "Inventory + batch tracking — track inventory and batches",
                "Compliance + billing — track compliance and bill",
                "Client management — manage clients",
                "Reporting — generate reports",
                "Finance portal — client billing, energy cost, and audit-ready reports"
            ],
            modules: ["business", "client", "product", "partner", "training", "finance"],
            changes: [
                "Monitor temperature — spoilage drops",
                "Track inventory — accuracy improves",
                "Stay compliant — audits are easy",
                "Bill clients accurately — income is tracked",
                "Report performance — data guides improvement",
                "Track energy cost — Finance portal shows real operational margin"
            ]
        },

        fulfilment: { em: "📦", name: "Fulfilment Centre", cat: "warehouse",
            problem: "Fulfilment centres process orders, pick-pack-ship, manage inventory, and report to clients. Without a system, order processing is manual, inventory is estimated, and client reporting is minimal.",
            solutions: [
                "Order + inventory management — manage orders and inventory",
                "Pick-pack-ship workflow — streamline workflow",
                "Client reporting + billing — report to clients and bill",
                "Returns processing — process returns",
                "Performance analytics — track productivity",
                "Finance portal — per-order costing, client billing, and tax-ready reports"
            ],
            modules: ["business", "client", "partner", "product", "finance"],
            changes: [
                "Process orders fast — turnaround improves",
                "Track inventory — accuracy improves",
                "Report to clients — satisfaction increases",
                "Process returns — customers are happy",
                "Track productivity — operations improve",
                "Track per-order margin — Finance portal shows real profitability"
            ]
        },

        fashion_design: { em: "✂️", name: "Fashion Design", cat: "fashion_apparel",
            problem: "Fashion designers manage designs, materials, production, and client orders. Without a system, designs are on paper, materials are sourced ad hoc, and production is tracked manually.",
            solutions: [
                "Design + pattern management — manage designs",
                "Material sourcing + inventory — source materials",
                "Production + order tracking — track production",
                "Client management — manage clients",
                "Online store — sell online",
                "Finance portal — job costing, material margin, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "partner", "public", "finance"],
            changes: [
                "Manage designs — organized and searchable",
                "Source materials — sourcing improves",
                "Track production — timelines are met",
                "Manage clients — relationships grow",
                "Sell online — reach extends",
                "Track job margin — Finance portal shows real profitability"
            ]
        },

        boutique: { em: "🛍️", name: "Boutique", cat: "fashion_apparel",
            problem: "Boutiques manage size matrixes, seasonal collections, inventory, and online competition. Without a system, inventory is estimated, size matrixes are hard to manage, and online selling is separate from in-store.",
            solutions: [
                "Size + color matrix inventory — manage matrixes",
                "Online store integration — sell online",
                "Collection + season tracking — track collections",
                "Customer management — manage customers",
                "Sales analytics — track sales",
                "Finance portal — margin per SKU, seasonal P&L, and eTIMS invoices"
            ],
            modules: ["business", "public", "product", "client", "finance"],
            changes: [
                "Sell online and in-store — from one system",
                "Manage collections — organized by season",
                "Track size-wise sales — buy smarter",
                "Manage customers — loyalty grows",
                "Analyze sales — data guides decisions",
                "Track seasonal margin — Finance portal shows real profitability"
            ]
        },

        jewellery: { em: "💍", name: "Jewellery Store", cat: "fashion_apparel",
            problem: "Jewellery stores manage high-value inventory, security, customer trust, and certifications. Without a system, inventory is tracked manually, security is a concern, and certifications are hard to track.",
            solutions: [
                "High-value inventory tracking — track inventory",
                "Security + audit trails — audit trails",
                "Certification + warranty management — track certifications",
                "Customer management — manage customers",
                "Sales analytics — track sales",
                "Finance portal — margin per item, consignment tracking, and eTIMS invoices"
            ],
            modules: ["business", "client", "product", "partner", "finance"],
            changes: [
                "Track high-value items — theft drops",
                "Ensure security — audit trails",
                "Manage certifications — customer trust",
                "Build relationships — loyalty grows",
                "Analyze sales — data guides decisions",
                "Track consignment — Finance portal manages partner stock"
            ]
        },

        commercial_cleaning: { em: "🏢", name: "Commercial Cleaning", cat: "cleaning_facility",
            problem: "Commercial cleaning companies manage staff scheduling, client sites, quality control, and supplies. Without a system, staff scheduling is manual, quality checks are inconsistent, and supplies are ordered reactively.",
            solutions: [
                "Staff scheduling + routing — schedule staff",
                "Client site management — manage sites",
                "Quality + supply tracking — track quality and supplies",
                "Client communication — communicate with clients",
                "Reporting — track performance",
                "Finance portal — contract profitability, staff payroll, and tax-ready reports"
            ],
            modules: ["business", "client", "partner", "training", "finance"],
            changes: [
                "Schedule staff — coverage is complete",
                "Manage sites — operations improve",
                "Track quality — satisfaction increases",
                "Manage supplies — stockouts drop",
                "Report performance — data guides improvement",
                "Track contract margin — Finance portal shows real profitability"
            ]
        },

        janitorial: { em: "🧹", name: "Janitorial Services", cat: "cleaning_facility",
            problem: "Janitorial services manage staff, supplies, client sites, and quality. Without a system, scheduling is manual, supplies are estimated, and quality checks are informal.",
            solutions: [
                "Staff + site scheduling — schedule staff",
                "Supply inventory — track supplies",
                "Quality control — check quality",
                "Client communication — communicate",
                "Reporting — track performance",
                "Finance portal — contract profitability, staff payroll, and tax-ready reports"
            ],
            modules: ["business", "client", "partner", "training", "finance"],
            changes: [
                "Schedule staff — coverage is complete",
                "Manage supplies — stockouts drop",
                "Ensure quality — satisfaction increases",
                "Communicate — clients are informed",
                "Report performance — data guides improvement",
                "Track contract margin — Finance portal shows real profitability"
            ]
        },

        facility_mgmt: { em: "🏢", name: "Facility Management", cat: "cleaning_facility",
            problem: "Facility managers coordinate multiple services, report to clients, and manage maintenance and billing. Without a system, coordination is manual, reporting is scattered, and billing is estimated.",
            solutions: [
                "Service coordination + scheduling — coordinate services",
                "Client reporting portal — report to clients",
                "Maintenance + billing — manage maintenance and billing",
                "Vendor management — manage vendors",
                "Performance analytics — track performance",
                "Finance portal — contract profitability, vendor payables, and audit-ready reports"
            ],
            modules: ["business", "client", "partner", "product", "training", "finance"],
            changes: [
                "Coordinate services — operations improve",
                "Report to clients — satisfaction increases",
                "Bill accurately — income is tracked",
                "Manage vendors — relationships grow",
                "Track performance — data guides improvement",
                "Track contract margin — Finance portal shows real profitability"
            ]
        },

        equipment_rental: { em: "🛠️", name: "Equipment Rental", cat: "rental_leasing",
            problem: "Equipment rental companies track inventory, schedule rentals, maintain equipment, and bill clients. Without a system, inventory is estimated, scheduling is manual, and maintenance is reactive.",
            solutions: [
                "Equipment inventory + tracking — track inventory",
                "Rental scheduling + agreements — schedule rentals",
                "Maintenance + billing — manage maintenance and billing",
                "Customer management — manage customers",
                "Reporting — track utilization",
                "Finance portal — utilization, per-unit profitability, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "partner", "finance"],
            changes: [
                "Track equipment — inventory is accurate",
                "Schedule rentals — utilization improves",
                "Manage maintenance — downtime drops",
                "Bill clients — income is tracked",
                "Report utilization — pricing improves",
                "Track per-unit profitability — Finance portal shows real margin"
            ]
        },

        car_rental: { em: "🚗", name: "Car Rental", cat: "rental_leasing",
            problem: "Car rental businesses manage vehicle booking, maintenance, insurance, damage, and payments. Without a system, bookings are manual, maintenance is reactive, and damage disputes are common.",
            solutions: [
                "Vehicle booking + calendar — manage bookings",
                "Maintenance + insurance tracking — track maintenance",
                "Damage + deposit management — manage damage",
                "Online booking — allow online booking",
                "Reporting — track utilization",
                "Finance portal — utilization, per-vehicle profitability, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "partner", "finance"],
            changes: [
                "Book vehicles online — bookings increase",
                "Track maintenance — downtime drops",
                "Manage deposits — disputes drop",
                "Track utilization — pricing improves",
                "Report performance — data guides decisions",
                "Track per-vehicle profitability — Finance portal shows real margin"
            ]
        },

        party_supplies: { em: "🎉", name: "Party Supplies Rental", cat: "rental_leasing",
            problem: "Party supply rentals manage inventory, event scheduling, delivery, and damage tracking. Without a system, inventory is estimated, scheduling is manual, and damage is hard to prove.",
            solutions: [
                "Inventory + event tracking — track inventory",
                "Delivery + setup scheduling — schedule deliveries",
                "Damage + deposit management — manage damage",
                "Online booking — allow online booking",
                "Reporting — track utilization",
                "Finance portal — per-event profitability, deposit tracking, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "public", "finance"],
            changes: [
                "Track inventory — losses drop",
                "Schedule deliveries — events run smoothly",
                "Manage deposits — disputes drop",
                "Book online — bookings increase",
                "Track utilization — pricing improves",
                "Track per-event margin — Finance portal shows real profitability"
            ]
        },

        funeral: { em: "⚱️", name: "Funeral Services", cat: "misc_other",
            problem: "Funeral homes coordinate services, manage vendors, support clients, and bill families. Without a system, coordination is manual, vendor management is scattered, and billing is estimated.",
            solutions: [
                "Service + vendor coordination — coordinate services",
                "Client support + communication — support clients",
                "Billing + payments — bill families",
                "Vendor management — manage vendors",
                "Reporting — track performance",
                "Finance portal — service P&L, vendor payables, and tax-ready reports"
            ],
            modules: ["business", "client", "partner", "public", "finance"],
            changes: [
                "Coordinate services — families are supported",
                "Support clients — empathy improves",
                "Bill families — income is tracked",
                "Manage vendors — relationships grow",
                "Report performance — data guides improvement",
                "Track service margin — Finance portal shows real profitability"
            ]
        },

        printing_copy: { em: "🖨️", name: "Printing & Copy", cat: "misc_other",
            problem: "Print and copy shops manage jobs, pricing, materials, and delivery. Without a system, jobs are tracked manually, pricing is inconsistent, and materials are ordered reactively.",
            solutions: [
                "Job tracking + pricing — track jobs",
                "Material inventory — track materials",
                "Delivery + pickup scheduling — schedule deliveries",
                "Customer management — manage customers",
                "Reporting — track sales",
                "Finance portal — job costing, material margin, and tax-ready reports"
            ],
            modules: ["business", "client", "product", "finance"],
            changes: [
                "Track jobs — turnaround improves",
                "Manage materials — stockouts drop",
                "Schedule deliveries — customers are served",
                "Manage customers — loyalty grows",
                "Track sales — profitability is visible",
                "Track job margin — Finance portal shows real profitability"
            ]
        },

        photo_studio: { em: "📷", name: "Photo Studio", cat: "misc_other",
            problem: "Photo studios manage bookings, portfolios, image delivery, and pricing. Without a system, bookings are by phone, portfolios are scattered, and image delivery is via USB or email.",
            solutions: [
                "Booking + calendar — manage bookings",
                "Portfolio + gallery hosting — host galleries",
                "Image delivery — deliver images online",
                "Pricing + packages — set packages",
                "Client history — track clients",
                "Finance portal — booking revenue, deposits, and tax-ready reports"
            ],
            modules: ["business", "client", "public", "product", "youtube", "finance"],
            changes: [
                "Book online — bookings increase",
                "Showcase your work — new clients find you",
                "Deliver images instantly — satisfaction increases",
                "Price consistently — income is predictable",
                "Track clients — loyalty grows",
                "Track booking revenue — Finance portal shows real income"
            ]
        },

        pawnshop: { em: "💰", name: "Pawn Shop", cat: "misc_other",
            problem: "Pawn shops manage item valuation, loan tracking, interest, inventory, and compliance. Without a system, valuation is by memory, loans are tracked manually, and compliance is a paperwork burden.",
            solutions: [
                "Item valuation + loan tracking — track items and loans",
                "Interest + payment management — track interest",
                "Inventory + compliance — manage inventory and compliance",
                "Customer management — manage customers",
                "Reporting — generate compliance reports",
                "Finance portal — loan book, interest income, and audit-ready reports"
            ],
            modules: ["business", "client", "product", "training", "finance"],
            changes: [
                "Track loans and interest — income is accurate",
                "Manage inventory — losses drop",
                "Stay compliant — audits are easy",
                "Manage customers — relationships grow",
                "Report compliance — reports are ready",
                "Track loan book — Finance portal shows real portfolio value"
            ]
        },

        money_transfer: { em: "💸", name: "Money Transfer", cat: "misc_other",
            problem: "Money transfer services manage transactions, compliance, float, and security. Without a system, transactions are tracked manually, compliance is a paperwork burden, and float is hard to manage.",
            solutions: [
                "Transaction + float tracking — track transactions",
                "Compliance + KYC — track compliance",
                "Security + reporting — report security",
                "Customer management — manage customers",
                "Reporting — generate reports",
                "Finance portal — float tracking, commission income, and audit-ready reports"
            ],
            modules: ["business", "client", "public", "training", "finance"],
            changes: [
                "Track transactions — visibility improves",
                "Stay compliant — audits are easy",
                "Manage float — liquidity improves",
                "Serve customers — satisfaction increases",
                "Report activity — reports are ready",
                "Track commission income — Finance portal shows real earnings"
            ]
        }
    };
    // Reclassify every legacy sub-industry into the six official VIORA solution families.
    Object.keys(window.INDUSTRIES).forEach(function (key) {
        var item = window.INDUSTRIES[key];
        var group = window.VIORATaxonomy
            ? window.VIORATaxonomy.classifyIndustry(item, item.cat)
            : (item.cat || "enterprise");
        item.cat = group;
        item.marketCategory = window.VIORATaxonomy
            ? window.VIORATaxonomy.title(group)
            : group;
    });

    window.MODULE_DEFS = {
        business: { em: "🏪", name: "Business Portal" },
        public: { em: "🌐", name: "Public Portal" },
        client: { em: "👤", name: "Client Portal" },
        partner: { em: "🤝", name: "Partner Portal" },
        product: { em: "📦", name: "Product Portal" },
        training: { em: "🎓", name: "Training Portal" },
        youtube: { em: "📺", name: "YouTube Hub" },
        presentation: { em: "🎽️", name: "Presentation Portal" },
        finance: { em: "💰", name: "Finance Portal" }
    };

    window.DEFAULT_BANNER_CARDS = [
        { id: "business", title: "Business Portal", subtext: "List • Market • Grow", icon: "fa-solid fa-store", color: "#ff3b5c",
          features: ["Business listings", "Online ads & marketing", "POS system", "E-commerce & delivery"] },
        { id: "public", title: "Public Portal", subtext: "Discover • Engage • Access", icon: "fa-solid fa-users", color: "#10b981",
          features: ["Online portfolio", "Advertise services", "Marketing arena", "Community engagement"] },
        { id: "partner", title: "Partner Portal", subtext: "Collaborate • Expand • Succeed", icon: "fa-solid fa-handshake", color: "#3b82f6",
          features: ["Partner management", "Commission tracking", "Joint campaigns", "Resource sharing"] },
        { id: "training", title: "Training Portal", subtext: "Learn • Build • Advance", icon: "fa-solid fa-graduation-cap", color: "#8b5cf6",
          features: ["Courses & tutorials", "Webinars & workshops", "Skill development", "Certification"] },
        { id: "client", title: "Client Portal", subtext: "Manage • Track • Achieve", icon: "fa-solid fa-user-gear", color: "#f59e0b",
          features: ["Service requests", "Project tracking", "Case updates", "Secure communication"] },
        { id: "product", title: "Product Portal", subtext: "Build • Sell • Innovate", icon: "fa-solid fa-cube", color: "#06b6d4",
          features: ["Digital products", "Software solutions", "Creative services", "Marketplace"] },
        { id: "youtube", title: "YouTube Hub", subtext: "Watch • Learn • Be Inspired", icon: "fa-brands fa-youtube", color: "#ef4444",
          features: ["Artist playlists", "Educational content", "Brand stories", "Community videos"] },
        { id: "presentation", title: "Presentation Portal", subtext: "Demo • Showcase • Impress", icon: "fa-solid fa-chalkboard-user", color: "#ec4899",
          features: ["Interactive demos", "Live product tours", "Client presentations", "Sales enablement"] },
        { id: "finance", title: "Finance Portal", subtext: "Track • Forecast • Prosper", icon: "fa-solid fa-chart-line", color: "#14b8a6",
          features: ["Real-time P&L", "Cash-flow forecasting", "Currency-aware finance workflows (where configured)", "Tax & compliance reports"] }
    ];

    window.VIORA_VIDEOS = {
        featured: "cDlQazB4NUY",
        list: [
            { id: "cDlQazB4NUY", title: "VIORA 2-min overview" },
            { id: "XHvmX3FhTwU", title: "Cloudflare Explained" },
            { id: "IemOAESlWKw", title: "Firestore Explained" },
            { id: "v23jbqJhghk", title: "Platform vs Ecosystem" },
            { id: "_Hwn40VmKxU", title: "Business Ecosystems Explained" }
        ]
    };

    window.COST_TOOLS = [
        { id: "pos",         name: "POS / Tills",              price: 25000 },
        { id: "accounting",  name: "Accounting Suite",         price: 22000 },
        { id: "payroll",     name: "Payroll & HR",             price: 15000 },
        { id: "crm",         name: "CRM",                      price: 25000 },
        { id: "inventory",   name: "Inventory & Warehousing",  price: 20000 },
        { id: "website",     name: "Website / E-commerce",     price: 35000 },
        { id: "sms",         name: "SMS / WhatsApp",           price: 15000 },
        { id: "ecommerce",   name: "Marketplace fees",         price: 45000 },
        { id: "loyalty",     name: "Loyalty & Rewards",        price: 17000 },
        { id: "hr",          name: "Attendance & HRIS",        price: 19000 },
        { id: "cctv",        name: "CCTV / Security",          price: 28000 },
        { id: "elearning",   name: "E-learning Platform",      price: 32000 },
        { id: "booking",     name: "Booking & Scheduling",     price: 21000 },
        { id: "reviews",     name: "Reviews & Reputation",     price: 16000 },
        { id: "logistics",   name: "Delivery & Logistics",     price: 38000 },
        { id: "insurance",   name: "Insurance Tracking",       price: 23000 },
        { id: "analytics",   name: "BI & Analytics",           price: 42000 },
        { id: "biometric",   name: "Biometric Access",         price: 26000 },
        { id: "reconciler",  name: "Bank Reconciliation",      price: 33000 },
        { id: "finance_suite", name: "Finance Suite (P&L, cash-flow, tax)", price: 48000 },
        { id: "erpfull",     name: "Full Custom ERP",          price: 100000 }
    ];
    window.VIORA_BUNDLE_PRICE = 40000;

    window.WIZARD_DATA = {
        pains: [
            { id: "leakage", label: "💸 Money leaking — stock, cash, or staff" },
            { id: "stockouts", label: "📦 Stockouts & dead stock" },
            { id: "late_reports", label: "📊 Reports always late or wrong" },
            { id: "leads_dying", label: "📉 Leads dying in DMs & inbox" },
            { id: "compliance", label: "🧾 Compliance & tax is a scramble" },
            { id: "growth", label: "🚀 Ready to scale to more branches" }
        ],
        staff: [
            { id: "1-5", label: "1–5 staff" },
            { id: "6-20", label: "6–20 staff" },
            { id: "21-50", label: "21–50 staff" },
            { id: "50+", label: "50+ staff" }
        ],
        branches: [
            { id: "1", label: "Just one location" },
            { id: "2-3", label: "2–3 locations" },
            { id: "4-10", label: "4–10 locations" },
            { id: "10+", label: "10+ locations" }
        ]
    };

    window.I18N = {
        en: {
            tagline: "Explore. Discover. Belong.",
            subtitle: "The Integrated Enterprise Operating System",
            topTagline: "Connect People,<br>Empower Businesses,<br>Build Communities.",
            watchEyebrow: "See it in action",
            watchTitle: 'Watch the <span class="grad">2-min overview</span>',
            watchSub: "A quick walk through the portals, the shared data core, and how M-Pesa, eTIMS, Finance and AI all live in one system.",
            capEyebrow: "Inside every portal",
            capTitle: 'Built-in <span class="grad">superpowers</span>',
            capSub: "Whatever you pick, these ship with it. Hover or tap a tile to explore.",
            whyEyebrow: "Why one ecosystem",
            whyTitle: 'Ecosystem vs <span class="grad">Standalone tools</span>',
            whySub: "Two worlds, side by side. Move your cursor over the cards — see what changes when every portal reads and writes to the same live backbone.",
            howEyebrow: "How it goes",
            howTitle: 'From conversation to <span class="grad">living system</span>',
            builderEyebrow: "Interactive blueprint · 300+ sub-industries",
            builderTitle: 'What would <span class="grad">your</span> ecosystem look like?',
            builderSub: "Pick your industry category below. Tap a sub-industry to open a full blueprint with the exact portals, modules, and features you need.",
            faqEyebrow: "Questions",
            faqTitle: 'The things people <span class="grad">actually ask</span>',
            ctaTitle: 'Ready to see your <span class="grad">blueprint</span>?',
            ctaSub: "Send us your details and we'll come back on WhatsApp with a plan built around your industry — usually within a few hours."
        },
        sw: {
            tagline: "Chunguza. Gundua. Ungana.",
            subtitle: "Mfumo Mkuu wa Uendeshaji wa Biashara",
            topTagline: "Unganisha Watu,<br>Imarisha Biashara,<br>Jenga Jamii.",
            watchEyebrow: "Ione kwa vitendo",
            watchTitle: 'Tazama <span class="grad">muhtasari wa dakika 2</span>',
            watchSub: "Mwongozo wa haraka wa portal, data core ya pamoja, na jinsi M-Pesa, eTIMS, Finance na AI zinaishi katika mfumo mmoja.",
            capEyebrow: "Ndani ya kila portal",
            capTitle: 'Uwezo wa <span class="grad">ndani</span>',
            capSub: "Chochote unachochagua, hizi zinakuja nazo. Elea au gusa tile kuchunguza.",
            whyEyebrow: "Kwa nini ecosystem moja",
            whyTitle: 'Ecosystem vs <span class="grad">Zana Tofauti</span>',
            whySub: "Ulimwengu miwili, kando kwa kando. Sogeza kishale juu ya kadi — ona kinachobadilika wakati kila portal inasoma na kuandika kwenye backbone moja.",
            howEyebrow: "Inakwendaje",
            howTitle: 'Kutoka mazungumzo hadi <span class="grad">mfumo hai</span>',
            builderEyebrow: "Blueprint ya kuingiliana · sekta 300+",
            builderTitle: 'Ecosystem <span class="grad">yako</span> ingekuaje?',
            builderSub: "Chagua kategoria ya sekta yako hapa chini. Gusa sekta ndogo kufungua blueprint kamili na portal, modules, na features unazohitaji.",
            faqEyebrow: "Maswali",
            faqTitle: 'Mambo ambayo watu <span class="grad">huuliza kweli</span>',
            ctaTitle: 'Uko tayari kuona <span class="grad">blueprint yako</span>?',
            ctaSub: "Tutumie maelezo yako na tutakujibu kwa WhatsApp na mpango uliojengwa karibu na sekta yako — kawaida ndani ya saa chache."
        }
    };
})();
