# VIORA browser tests

Configure protected repository secrets VIORA_TEST_EMAIL and VIORA_TEST_PASSWORD for a dedicated, least-privilege executive test identity. Do not use a personal production administrator password. The browser workflow is skipped until both secrets exist.

The suite covers public homepage accessibility, authenticated Engineering Command Centre and Visuals navigation, and a mobile viewport overflow smoke test. This is not a full finance, tenant, marketplace or customer portal journey suite; expand it using isolated seeded test tenants and non-production records. axe-core is an automated screen, not a substitute for manual keyboard and screen-reader testing.
