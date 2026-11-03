-- Primary key is unis_order_no, NOT po_no: a single Shopify order can ship as multiple
-- physical packages (confirmed empirically — e.g. one order with 2 separate UNIS DC
-- records, each its own tracking number/weight/freight cost). po_no is a many-to-one
-- join key onto Shopify, not a unique shipment identifier, so it can't be the PK without
-- silently losing split-shipment rows on upsert. The live dashboard already treats each
-- DC record as its own line item, so this preserves that granularity.
CREATE TABLE IF NOT EXISTS parcel_shipments (
  unis_order_no     TEXT PRIMARY KEY,               -- UNIS's own DC/shipment identifier, e.g. 'DN-3292103'
  po_no             TEXT,                           -- Shopify order name, e.g. '#123456' (join key, not unique)
  order_created_at  TIMESTAMPTZ,                    -- Shopify createdAt, fallback UNIS OrderedDate
  unis_created_at   TIMESTAMPTZ,                    -- UNIS order-level "Order Create Date"+"Order Create Time" (when the order was placed in UNIS, not shipped) — drives Parcel SLA calc, see api/parcel-sla.js
  shipped_date      TIMESTAMPTZ NOT NULL,            -- DC ShippedDate — every row here is a completed shipment
  carrier           TEXT,
  tracking_number   TEXT,
  ship_to_state     TEXT,
  pcs               INTEGER,
  weight            NUMERIC(10,2),
  freight_cost      NUMERIC(10,2),
  service_level     TEXT,                           -- Shopify shippingLines[0].title
  source_name       TEXT,
  is_draft_order    BOOLEAN NOT NULL DEFAULT FALSE,  -- drives cx-ship-cost's filter
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Added after initial launch — CREATE TABLE IF NOT EXISTS above doesn't retrofit an
-- already-existing table, so this ALTER keeps schema.sql idempotent/rerunnable.
ALTER TABLE parcel_shipments ADD COLUMN IF NOT EXISTS unis_created_at TIMESTAMPTZ;

-- Shopify order.totalShippingPriceSet.shopMoney.amount — what the customer was charged for
-- shipping, vs. freight_cost (what we paid the carrier). Drives the Parcel Cost / CX Ship
-- Cost tabs' Freight Paid + Difference columns. Same value duplicated across all rows sharing
-- a po_no (split shipments), matching how service_level is already handled.
ALTER TABLE parcel_shipments ADD COLUMN IF NOT EXISTS freight_paid NUMERIC(10,2);

CREATE INDEX IF NOT EXISTS idx_parcel_shipments_po_no        ON parcel_shipments (po_no);
CREATE INDEX IF NOT EXISTS idx_parcel_shipments_created_at   ON parcel_shipments (order_created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parcel_shipments_shipped_date ON parcel_shipments (shipped_date DESC);
CREATE INDEX IF NOT EXISTS idx_parcel_shipments_draft        ON parcel_shipments (order_created_at DESC) WHERE is_draft_order;

-- single watermark row driving the recurring sync's rolling window
CREATE TABLE IF NOT EXISTS sync_state (
  source              TEXT PRIMARY KEY,     -- 'unis_dc'
  last_synced_through TIMESTAMPTZ NOT NULL,
  last_run_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_run_status     TEXT,
  last_error          TEXT
);

-- one-time backfill progress, one row per weekly chunk, for resumability
CREATE TABLE IF NOT EXISTS backfill_progress (
  chunk_start   TIMESTAMPTZ PRIMARY KEY,
  chunk_end     TIMESTAMPTZ NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | done | error
  shopify_count INTEGER,
  unis_count    INTEGER,
  matched_count INTEGER,
  error         TEXT,
  completed_at  TIMESTAMPTZ
);

-- Dashboard logins (HTTP Basic auth, checked by middleware.mjs via lib/auth.js). Managed from
-- the admin-only Users tab; the first admin is created with scripts/create-dashboard-user.js.
-- Usernames are stored lowercase; password_hash is "scrypt$<salt b64>$<hash b64>".
CREATE TABLE IF NOT EXISTS dashboard_users (
  username       TEXT PRIMARY KEY,
  password_hash  TEXT NOT NULL,
  is_admin       BOOLEAN NOT NULL DEFAULT FALSE,
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Parcel Delivery Status tab: one row per Shopify tracking number at our fulfillment location,
-- for orders created in the last ~35 days, every status including DELIVERED. Kept current by
-- sync-service/sync-tracking.js off an order updated_at watermark (sync_state 'shopify_tracking');
-- each changed order's rows are replaced wholesale, so voided labels and cancels drop out.
-- Keyed on (order_name, tracking_number), with '' for a fulfillment that has no tracking number.
CREATE TABLE IF NOT EXISTS parcel_tracking (
  order_name          TEXT NOT NULL,          -- Shopify order name, e.g. '#1036954'
  tracking_number     TEXT NOT NULL,
  order_created_at    TIMESTAMPTZ NOT NULL,
  order_updated_at    TIMESTAMPTZ,
  fulfilled_at        TIMESTAMPTZ,            -- Shopify fulfillment createdAt (label created)
  carrier             TEXT,                   -- Shopify trackingInfo.company; UPS MI shows as 'UPS' with a 9-prefixed number
  service_level       TEXT,                   -- Shopify shippingLines[0].title
  tracking_url        TEXT,
  shipment_status     TEXT,                   -- fulfillment displayStatus; NOT_AVAILABLE when missing or an Amazon FULFILLED
  pieces              INTEGER,                -- units on the fulfillment
  in_transit_at       TIMESTAMPTZ,            -- first carrier scan
  delivered_at        TIMESTAMPTZ,
  last_event_status   TEXT,                   -- latest carrier tracking event
  last_event_at       TIMESTAMPTZ,
  last_event_city     TEXT,
  last_event_province TEXT,
  last_event_message  TEXT,
  ship_to_state       TEXT,
  ship_to_city        TEXT,
  ship_to_zip         TEXT,
  ship_to_country     TEXT,
  is_po_box           BOOLEAN NOT NULL DEFAULT FALSE,  -- derived from the street address, which isn't stored
  is_business         BOOLEAN NOT NULL DEFAULT FALSE,  -- ship-to company field present
  synced_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (order_name, tracking_number)
);

CREATE INDEX IF NOT EXISTS idx_parcel_tracking_created_at ON parcel_tracking (order_created_at DESC);
