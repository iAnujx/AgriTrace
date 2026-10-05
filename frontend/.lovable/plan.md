# AgriTrace production refactor

## Goal
Rebuild AgriTrace as a secure, multilingual crop supply-chain application with polished role dashboards, shared stock, QR traceability, and persistent data.

## Confirmed decisions
- Use secure email/password and Google accounts, while keeping the wallet for blockchain actions.
- Store profiles for names, avatars, preferences, and business details.
- Store authorization roles in a separate protected role table, never in profiles or browser storage.
- A farmer batch is saved only after its blockchain transaction confirms. A failed or missing-wallet transaction does not create a database batch.
- Replace the current Google Translate DOM widget with key-based translations for English, Hindi, Tamil, Marathi, and Telugu.

## Implementation plan

### 1. Foundation, accounts, and shared application state
- Add account sign-up, sign-in, Google sign-in, sign-out, email confirmation, forgot-password, and reset-password flows.
- Protect role dashboards and validate every private data operation on the server.
- Add profiles, user roles, batches, distributor stock, retailer orders, activities, and blockchain records in Lovable Cloud with strict row-level access rules and explicit grants.
- Migrate identity away from the editable `agritrace-user` browser object. Wallet address becomes an optional linked profile field used for chain operations.
- Add shared providers for settings, notifications, stock quantities, and translation; use optimistic stock updates with rollback when a server update fails.
- Keep consumer product reads public but expose only safe fields; farmer contact, account, and private profile data remain hidden.

### 2. Data and API contract
- Implement the requested `/api/batches`, `/api/batches/:id`, `/api/activities`, `/api/distributor/stock`, `/api/retailer/orders`, and `/api/blockchain-records` handlers with Zod validation.
- Support all requested filters: status, farmer, type, activity limit, batch, and activity type.
- Make purchase, dispatch, sale, and stock updates transactional so quantities cannot become negative or diverge across roles.
- Store `original_quantity` and `remaining_quantity` for progress indicators and out-of-stock behavior.
- Record each supply-chain transition and activity with actor, date, location, and transaction hash.
- Seed a small set of public verified products so the rebuilt product views are useful immediately.

### 3. Global visual system and shared shell
- Consolidate every duplicated header/sidebar into one shared dashboard shell.
- Apply Inter with weights 400/500/600, teal primary, slate surfaces, rose alerts, soft light/dark gradients, glass navigation, 220px desktop sidebar, rounded-xl controls, and the specified card treatment.
- Remove yellow/amber styling throughout. Where the specification requests a low-stock orange state, use a distinct non-yellow orange token only for that status.
- Add active navigation, role-aware links, mobile navigation, role pill, language code selector, unread bell badge, account menu, offline banner, and consistent loading/error/empty states.
- Add Framer Motion page-section fades controlled by the Animated UI setting and reduced-motion preference.
- Standardize dialogs, drawers, tooltips, toasts, buttons, and focus states.

### 4. Farmer experience
- Rebuild the farmer dashboard with verified profile summary, wallet status, metrics, bid panel/countdown, and registered-batch view.
- Add React Hook Form + Zod registration/edit drawers with crop type, harvest date, quantity/unit, price, location, image upload/preview, and inline errors.
- Execute and confirm the blockchain registration first, then persist the batch, blockchain record, stock state, and `batch_created` activity.
- Add edit and View on Chain actions, stock progress, sold/available/out-of-stock states, and crop-image handling.

### 5. Distributor and retailer experiences
- Rebuild both marketplaces as stable responsive grids with self-contained cards, stock indicators, disabled out-of-stock actions, and side-panel details.
- Distributor purchase creates stock and transitions the batch to In Transit; dispatch captures destination, vehicle, date, and location.
- Retailer order creates an order and moves the batch to Delivered; Mark as Sold uses an inline quantity form and updates remaining stock atomically.
- Add horizontal stock rows, progress bars, registered-batch tables, rose sold-out row tints, and matching registration visuals.

### 6. Consumer product discovery and traceability
- Remove batch registration and stakeholder controls from the consumer surface.
- Add real-time search, category chips, privacy-safe product grid, images, locations, prices, ratings, and stock-aware Scan QR actions.
- Add a full-screen camera scanner using the installed `jsQR` package rather than runtime CDN injection, with camera cleanup, permission handling, and inline invalid-code errors.
- Decode only AgriTrace batch identifiers, then load the public batch and blockchain journey to render origin, distributor, retailer, dates, locations, and transaction hash without personal farmer data.
- Preserve compatibility with existing journey links where practical while moving new QR codes to stable batch identifiers.

### 7. Settings and notifications
- Rebuild Settings into Appearance, Notifications, and Display groups with functional segmented controls and switches.
- Persist and apply theme, font size, compact mode, animation mode, notification categories, tips/tooltips, language, and wallet visibility globally.
- Add a right-side notifications panel backed by recent activities, relative timestamps, typed icons/colors, unread count, and Mark all as read.
- Apply translated keys to all rebuilt visible labels, actions, placeholders, badges, validation text, empty states, and errors in the five supported languages.

### 8. Migration, cleanup, and verification
- Replace local browser-only crop, stock, order, activity, role, and settings assumptions with the new shared data model; keep only safe preference caching.
- Remove duplicated legacy shell code, mock product/trace data, fake role login, and obsolete translation injection.
- Update every page’s unique metadata and preserve existing public URLs.
- Verify account flows, blockchain-required registration, stock transitions, QR scanning fallback, offline/error states, language switching, dark/compact modes, and notification behavior on desktop and mobile.
- Run focused tests plus browser checks for farmer → distributor → retailer → consumer flow, and confirm the final preview has no build, runtime, console, or layout errors.

## Technical notes
- Private application calls use authenticated TanStack server routes/functions and Lovable Cloud access policies; consumer reads use narrow public projections.
- Roles remain in `user_roles`; profile data never determines authorization.
- All quantity-changing writes use server-side validation and database transactions. Optimistic UI never replaces server enforcement.
- Blockchain is authoritative for initial farmer registration; the database is authoritative for application workflows and stock after the confirmed registration record is created.
