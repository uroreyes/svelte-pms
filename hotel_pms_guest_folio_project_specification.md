# Project Specification: Small Hotel PMS & Guest Folio System

## 1. Project Overview
Build a lightweight, multi-property-capable **Hotel Property Management System (PMS)** tailored for boutique and small hotels. The system centralizes room inventory, direct bookings, OTA channel syncing, front-desk check-in/check-out workflows, and real-time **Guest Folio** billing (room charges + incidental/POS orders).

### Core Terminology Note
* **Folio (referred to in initial notes as "polio"):** The master financial ledger attached to a reservation or walk-in guest. All nightly room rates, add-on orders (F&B, laundry, minibar), taxes, discounts, and payments post to the Folio before checkout settlement.

---

## 2. Recommended Tech Stack
*(Adjust if targeting a specific environment, otherwise use this clean default)*
* **Frontend:** React / Remix + TypeScript + Tailwind CSS (optimistic UI updates for calendar grids and folio line items)
* **Backend / API:** Node.js / TypeScript or Laravel (REST API)
* **Database:** PostgreSQL or MySQL 8+ (strict transactional integrity for inventory locking and financial ledgers)
* **Integrations:** Webhook/iCal + REST adapters for OTA Channel Manager syncing

---

## 3. Core Functional Modules

### 3.1 Property Management (PMS)
* **Property & Room Type Setup:** Define properties, room categories (e.g., Standard, Deluxe, Suite), base occupancy, max occupancy, and amenities.
* **Physical Room Units:** Map physical room numbers (e.g., `101`, `102`, `201`) to Room Types, tracking housekeeping/operational status (`Clean`, `Dirty`, `Inspected`, `Out of Order`).
* **Front-Desk Tape Chart (Calendar Grid):** Interactive timeline view showing physical rooms on the Y-axis and dates on the X-axis, color-coded by reservation status (`Confirmed`, `Checked-In`, `Checked-Out`, `Maintenance`).

### 3.2 Dynamic Room Inventory & Rate Management
Must prevent double-booking via database-level row locking or atomic availability checks.
* **Daily Granular Control (Per-Day):**
  * Override available room count, base nightly rate, minimum length of stay ($\text{MinLOS}$), and stop-sell/close-out flags for any single date.
* **Bulk Monthly Control (Across Days):**
  * Select a date range or entire month to bulk-update availability, rates, or restrictions.
  * Support **day-of-week filtering** within a month (e.g., *"Set Deluxe rooms to $150/night and 8 available units on all Fridays and Saturdays in December"*).

### 3.3 Booking Engine (Direct Web Reservations)
* Public-facing search widget: Check-in date, Check-out date, Adults/Children count.
* Real-time availability and total price calculation (nightly rate breakdown + taxes/fees).
* Guest details capture and instant reservation creation with automated confirmation code generation.
* Immediate inventory deduction upon confirmed booking.

### 3.4 Guest Check-In & Check-Out Workflows
* **Check-In:**
  * Search arriving reservations by confirmation code, guest name, or date.
  * Assign a specific physical room unit (validating that the unit is `Clean` and unoccupied).
  * Capture/verify guest ID details and security deposit/pre-authorization.
  * Transition reservation status to `Checked-In` and automatically initialize an active **Guest Folio**.
* **Check-Out:**
  * Review full Guest Folio balance ($\text{Balance Due} = \text{Room Charges} + \text{POS Orders} - \text{Payments}$).
  * Require zero remaining balance ($\text{Balance Due} = 0.00$) before completing checkout, or record final split/full payment (Cash, Card, Bank Transfer).
  * Generate a printable/PDF itemized Folio receipt.
  * Transition reservation to `Checked-Out` and mark physical room status as `Dirty`.

### 3.5 Guest Folio & Order Management
* **Automated Nightly Posting:** Post nightly room rate + applicable taxes to the folio (either upfront upon check-in or via nightly night-audit job).
* **Add Orders to Room:**
  * Front desk or POS staff can look up any `Checked-In` room number (e.g., `Room 204`) and post incidental charges directly to the guest's folio.
  * Support custom line items or a pre-configured catalog (e.g., Restaurant/Room Service, Minibar, Airport Transfer, Late Checkout Fee).
  * Each folio entry records: `timestamp`, `category`, `description`, `quantity`, `unit_price`, `tax_amount`, `total`, and `staff_user_id`.
* **Adjustments & Payments:** Support partial payments, split folios (e.g., company pays room, guest pays incidentals), voids (with reason log, never hard-deleted), and refunds.

### 3.6 Channel Manager
* **Two-Way Sync Architecture:**
  * **Outbound (ARI Push):** Push updated inventory counts, nightly rates, and stop-sell rules to connected OTAs (Booking.com, Agoda, Airbnb, Expedia) whenever local inventory changes or a direct booking occurs.
  * **Inbound (Booking Pull/Webhook):** Ingest incoming OTA reservations, deduct local availability automatically, and flag overbookings if a race condition occurs.
  * **Fallback Sync:** Support standard `.ics` (iCal) calendar export/import URLs per room type for smaller OTAs.

### 3.7 Insights & Reporting Dashboard
* **Core Hospitality KPIs:**
  * **Occupancy Rate:** $$\text{Occupancy Rate} = \left(\frac{\text{Occupied Rooms}}{\text{Total Available Rooms}}\right) \times 100$$
  * **ADR (Average Daily Rate):** $$\text{ADR} = \frac{\text{Total Room Revenue}}{\text{Rooms Sold}}$$
  * **RevPAR (Revenue Per Available Room):** $$\text{RevPAR} = \frac{\text{Total Room Revenue}}{\text{Total Available Rooms}} = \text{ADR} \times \text{Occupancy Rate}$$
* **Operational & Financial Reports:**
  * Daily Arrivals, Departures, and In-House Guest list.
  * Revenue breakdown: Room Revenue vs. Folio Add-On Orders (F&B/Incidentals).
  * Channel performance comparison (Direct Booking Engine vs. OTAs).

---

## 4. Core Data Schema (Entities)

```text
Property (id, name, address, currency, timezone, tax_rate)
 ├── RoomType (id, property_id, name, base_rate, max_occupancy)
 │    ├── RoomUnit (id, room_type_id, room_number, floor, housekeeping_status)
 │    └── RoomInventoryDaily (id, room_type_id, date, available_count, rate_override, is_closed)
 ├── Reservation (id, property_id, guest_id, room_type_id, room_unit_id, source, check_in, check_out, status)
 │    └── Folio (id, reservation_id, status [OPEN|SETTLED], total_charges, total_payments, balance)
 │         ├── FolioItem (id, folio_id, type [ROOM|POS_ORDER|TAX|DISCOUNT], description, qty, unit_price, amount, posted_at)
 │         └── FolioPayment (id, folio_id, method [CASH|CARD|TRANSFER], amount, reference_no, paid_at)
 └── ChannelMapping (id, room_type_id, channel_name, external_room_id, ical_url, last_synced_at)
```

---

## 5. Non-Functional & Edge-Case Rules
1. **Concurrency & Overbooking Prevention:** All booking creation and daily inventory updates must execute inside database transactions with pessimistic locking (`SELECT ... FOR UPDATE`) on `RoomInventoryDaily` rows for the requested date range.
2. **Immutable Financial Audit Trail:** Never delete posted `FolioItem` or `FolioPayment` records. Corrections must be recorded as offsetting reversal/void entries with user attribution.
3. **Date Boundary Precision:** Check-in/check-out date math uses half-open intervals $[\text{check\_in}, \text{check\_out})$ (e.g., a stay from May 10 to May 12 consumes inventory for May 10 and May 11 only).

---

## 6. Suggested Implementation Phases for Claude
Instruct Claude to build iteratively in this order:
1. **Phase 1 — Database & Inventory Engine:** Schema migrations, `RoomType`, `RoomUnit`, and the per-day + bulk monthly `RoomInventoryDaily` API/UI.
2. **Phase 2 — Reservations, Check-In/Out & Guest Folio:** Front-desk reservation flow, room assignment, active Folio ledger, and "Add Order to Room" POS posting.
3. **Phase 3 — Public Booking Engine:** Guest-facing availability search and instant booking checkout wired to the inventory engine.
4. **Phase 4 — Channel Manager & Insights:** iCal/webhook OTA sync worker and the ADR/RevPAR/Occupancy analytics dashboard.