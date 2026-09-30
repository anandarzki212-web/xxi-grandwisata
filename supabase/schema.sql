create extension if not exists pgcrypto;

drop table if exists whatsapp_request_items cascade;
drop table if exists whatsapp_requests cascade;
drop table if exists pickup_request_items cascade;
drop table if exists pickup_requests cascade;
drop table if exists rack_products cascade;
drop table if exists racks cascade;
drop table if exists weekly_order_rows cascade;
drop table if exists stock_transactions cascade;
drop table if exists warehouse_stock cascade;
drop table if exists weekly_orders cascade;
drop table if exists usage_entries cascade;
drop table if exists excel_snapshot_rows cascade;
drop table if exists products cascade;

create table products (
 id uuid primary key default gen_random_uuid(),
 product_code text unique not null,
 name text not null,
 category text,
 barang_tag text,
 purchase_unit text not null default 'PCS',
 base_unit text not null default 'PCS',
 conversion_factor numeric(18,6) not null default 1,
 conversion_note text,
 conversion_audit_status text,
 has_exp boolean not null default false,
 exp_raw text,
 min_stock numeric(18,6) not null default 0,
 active boolean not null default true,
 excel_row integer,
 excel_main_formula text,
 excel_transit_formula text,
 excel_main_norm_formula text,
 excel_transit_norm_formula text,
 excel_main_total_asli numeric(18,6),
 excel_main_total_kon numeric(18,6),
 excel_transit_total_asli numeric(18,6),
 excel_transit_total_kon numeric(18,6),
 created_at timestamptz not null default now()
);

create table warehouse_stock (
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references products(id) on delete cascade,
 location text not null check(location in ('GUDANG_UTAMA','GUDANG_TRANSIT')),
 qty numeric(18,6) not null default 0,
 normalized_qty numeric(18,6),
 updated_at timestamptz not null default now(),
 unique(product_id,location)
);

create table stock_transactions (
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references products(id),
 location text not null check(location in ('GUDANG_UTAMA','GUDANG_TRANSIT')),
 type text not null check(type in ('OPENING','IN','OUT','USAGE','SPOIL','ADJUSTMENT','TRANSFER_IN','TRANSFER_OUT')),
 qty numeric(18,6) not null check(qty>0),
 unit text not null,
 normalized_qty numeric(18,6),
 note text,
 source text default 'WEB',
 transaction_date date not null default current_date,
 reference_id uuid,
 created_at timestamptz not null default now()
);

create table excel_snapshot_rows (
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references products(id) on delete cascade,
 excel_row integer not null,
 source_sheet text not null,
 main_data jsonb,
 transit_data jsonb,
 formulas jsonb,
 created_at timestamptz not null default now()
);

create table weekly_orders (
 id uuid primary key default gen_random_uuid(),
 product_name text not null,
 uom text,
 qty numeric(18,6),
 week_label text,
 note text,
 source text default 'EXCEL',
 created_at timestamptz not null default now()
);

create table usage_entries (
 id uuid primary key default gen_random_uuid(),
 product_name text not null,
 uom text,
 m1 numeric(18,6), m2 numeric(18,6), m3 numeric(18,6), m4 numeric(18,6),
 note text,
 source text default 'EXCEL',
 created_at timestamptz not null default now()
);

-- Exact 19-column shape of the "format orderan mingguan" Excel sheet.
create table weekly_order_rows (
 id uuid primary key default gen_random_uuid(),
 row_no integer not null,
 left_name text,
 left_uom text,
 m1 numeric(18,6), m2 numeric(18,6), m3 numeric(18,6), m4 numeric(18,6),
 left_note text,
 right_no integer,
 right_name text,
 right_uom text,
 right_qty numeric(18,6),
 right_note text,
 created_at timestamptz not null default now()
);

create table racks (
 id uuid primary key default gen_random_uuid(),
 rack_code text unique not null,
 rack_name text not null,
 description text,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table rack_products (
 id uuid primary key default gen_random_uuid(),
 rack_id uuid not null references racks(id) on delete cascade,
 product_id uuid not null references products(id) on delete cascade,
 sort_order integer not null default 0,
 unique(rack_id,product_id)
);

create table pickup_requests (
 id uuid primary key default gen_random_uuid(),
 request_no bigint generated always as identity unique,
 rack_id uuid references racks(id),
 requester_name text not null,
 status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED')),
 note text,
 rejection_reason text,
 approved_at timestamptz,
 rejected_at timestamptz,
 created_at timestamptz not null default now()
);

create table pickup_request_items (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references pickup_requests(id) on delete cascade,
 product_id uuid not null references products(id),
 qty numeric(18,6) not null check(qty>0),
 unit text not null
);

create index idx_stock_location on warehouse_stock(location);
create index idx_tx_created on stock_transactions(created_at desc);
create index idx_tx_usage on stock_transactions(type,created_at desc);
create index idx_rack_products on rack_products(rack_id,sort_order);
create index idx_pickup_status on pickup_requests(status,created_at desc);

create or replace function public.stock_in(p_product_id uuid,p_location text,p_qty numeric,p_unit text default null,p_note text default null,p_date date default current_date)
returns void language plpgsql security definer as $$
declare f numeric; base numeric; u text;
begin
 if p_location <> 'GUDANG_UTAMA' then raise exception 'TRANSIT_STOCK_IN_ONLY_FROM_TRANSFER'; end if;
 if p_qty<=0 then raise exception 'INVALID_QTY'; end if;
 select conversion_factor,purchase_unit into f,u from products where id=p_product_id and active=true;
 if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
 base:=p_qty*coalesce(f,1);
 insert into warehouse_stock(product_id,location,qty,normalized_qty,updated_at) values(p_product_id,p_location,p_qty,base,now())
 on conflict(product_id,location) do update set qty=warehouse_stock.qty+excluded.qty,normalized_qty=coalesce(warehouse_stock.normalized_qty,0)+excluded.normalized_qty,updated_at=now();
 insert into stock_transactions(product_id,location,type,qty,unit,normalized_qty,note,source,transaction_date) values(p_product_id,p_location,'IN',p_qty,coalesce(p_unit,u),base,p_note,'WEB',p_date);
end; $$;

create or replace function public.stock_out(p_product_id uuid,p_location text,p_qty numeric,p_unit text default null,p_type text default 'OUT',p_note text default null,p_date date default current_date)
returns void language plpgsql security definer as $$
declare f numeric; base numeric; u text; current_qty numeric;
begin
 if p_location not in ('GUDANG_UTAMA','GUDANG_TRANSIT') then raise exception 'INVALID_LOCATION'; end if;
 if p_qty<=0 then raise exception 'INVALID_QTY'; end if;
 if p_type not in ('OUT','USAGE','SPOIL','ADJUSTMENT') then raise exception 'INVALID_TYPE'; end if;
 select conversion_factor,purchase_unit into f,u from products where id=p_product_id and active=true;
 if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
 select qty into current_qty from warehouse_stock where product_id=p_product_id and location=p_location for update;
 if not found then raise exception 'STOCK_NOT_FOUND'; end if;
 if current_qty<p_qty then raise exception 'INSUFFICIENT_STOCK: stok % %',current_qty,coalesce(p_unit,u); end if;
 base:=p_qty*coalesce(f,1);
 update warehouse_stock set qty=qty-p_qty,normalized_qty=case when normalized_qty is null then null else normalized_qty-base end,updated_at=now() where product_id=p_product_id and location=p_location;
 insert into stock_transactions(product_id,location,type,qty,unit,normalized_qty,note,source,transaction_date) values(p_product_id,p_location,p_type,p_qty,coalesce(p_unit,u),base,p_note,'WEB',p_date);
end; $$;

create or replace function public.transfer_main_to_transit(p_product_id uuid,p_qty numeric,p_note text default null,p_date date default current_date)
returns void language plpgsql security definer as $$
declare f numeric; u text; src numeric; base numeric;
begin
 if p_qty<=0 then raise exception 'INVALID_QTY'; end if;
 select conversion_factor,purchase_unit into f,u from products where id=p_product_id and active=true;
 if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
 select qty into src from warehouse_stock where product_id=p_product_id and location='GUDANG_UTAMA' for update;
 if not found or src<p_qty then raise exception 'INSUFFICIENT_STOCK_MAIN'; end if;
 base:=p_qty*coalesce(f,1);
 update warehouse_stock set qty=qty-p_qty,normalized_qty=case when normalized_qty is null then null else normalized_qty-base end,updated_at=now() where product_id=p_product_id and location='GUDANG_UTAMA';
 insert into warehouse_stock(product_id,location,qty,normalized_qty,updated_at) values(p_product_id,'GUDANG_TRANSIT',p_qty,base,now())
 on conflict(product_id,location) do update set qty=warehouse_stock.qty+excluded.qty,normalized_qty=case when warehouse_stock.normalized_qty is null then null else warehouse_stock.normalized_qty+excluded.normalized_qty end,updated_at=now();
 insert into stock_transactions(product_id,location,type,qty,unit,normalized_qty,note,source,transaction_date) values(p_product_id,'GUDANG_UTAMA','TRANSFER_OUT',p_qty,coalesce(u,'PCS'),base,coalesce(p_note,'Transfer ke Gudang Transit'),'WEB',p_date);
 insert into stock_transactions(product_id,location,type,qty,unit,normalized_qty,note,source,transaction_date) values(p_product_id,'GUDANG_TRANSIT','TRANSFER_IN',p_qty,coalesce(u,'PCS'),base,coalesce(p_note,'Transfer dari Gudang Utama'),'WEB',p_date);
end; $$;

create or replace function public.approve_pickup_request(p_request_id uuid)
returns void language plpgsql security definer as $$
declare r pickup_requests%rowtype; i pickup_request_items%rowtype; s numeric; f numeric; base numeric; pname text;
begin
 select * into r from pickup_requests where id=p_request_id for update;
 if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
 if r.status<>'PENDING' then raise exception 'REQUEST_NOT_PENDING'; end if;
 for i in select * from pickup_request_items where request_id=p_request_id loop
  select p.conversion_factor,p.name into f,pname from products p where p.id=i.product_id and p.active=true;
  select qty into s from warehouse_stock where product_id=i.product_id and location='GUDANG_TRANSIT' for update;
  if not found or coalesce(s,0)<i.qty then raise exception 'INSUFFICIENT_TRANSIT_STOCK:%',pname; end if;
  base:=i.qty*coalesce(f,1);
  update warehouse_stock set qty=qty-i.qty,normalized_qty=case when normalized_qty is null then null else normalized_qty-base end,updated_at=now() where product_id=i.product_id and location='GUDANG_TRANSIT';
  insert into stock_transactions(product_id,location,type,qty,unit,normalized_qty,note,source,reference_id) values(i.product_id,'GUDANG_TRANSIT','OUT',i.qty,i.unit,base,'Pengambilan QR Rak disetujui','QR_RAK',p_request_id);
 end loop;
 update pickup_requests set status='APPROVED',approved_at=now() where id=p_request_id;
end; $$;

create or replace function public.reject_pickup_request(p_request_id uuid,p_reason text default null)
returns void language plpgsql security definer as $$
begin
 update pickup_requests set status='REJECTED',rejected_at=now(),rejection_reason=p_reason where id=p_request_id and status='PENDING';
 if not found then raise exception 'REQUEST_NOT_PENDING'; end if;
end; $$;

create or replace function public.edit_usage_transaction(p_transaction_id uuid,p_new_qty numeric,p_new_unit text,p_new_note text,p_new_date date)
returns void language plpgsql security definer as $$
declare t stock_transactions%rowtype; current_qty numeric; f numeric; old_base numeric; new_base numeric; delta numeric;
begin
 if p_new_qty<=0 then raise exception 'INVALID_QTY'; end if;
 select * into t from stock_transactions where id=p_transaction_id for update;
 if not found then raise exception 'TRANSACTION_NOT_FOUND'; end if;
 if t.type not in ('OUT','USAGE','SPOIL','ADJUSTMENT') then raise exception 'ONLY_USAGE_HISTORY_CAN_BE_EDITED'; end if;
 select conversion_factor into f from products where id=t.product_id;
 old_base:=t.qty*coalesce(f,1); new_base:=p_new_qty*coalesce(f,1); delta:=t.qty-p_new_qty;
 select qty into current_qty from warehouse_stock where product_id=t.product_id and location=t.location for update;
 if not found then raise exception 'STOCK_NOT_FOUND'; end if;
 if delta<0 and current_qty < abs(delta) then raise exception 'INSUFFICIENT_STOCK_FOR_HISTORY_EDIT'; end if;
 update warehouse_stock set qty=qty+delta,normalized_qty=case when normalized_qty is null then null else normalized_qty+(delta*coalesce(f,1)) end,updated_at=now() where product_id=t.product_id and location=t.location;
 update stock_transactions set qty=p_new_qty,unit=p_new_unit,normalized_qty=new_base,note=p_new_note,transaction_date=p_new_date where id=p_transaction_id;
end; $$;

-- Prototype/demo mode: public reads/writes are enabled; UI role gating is implemented in the app.
alter table products disable row level security;
alter table warehouse_stock disable row level security;
alter table stock_transactions disable row level security;
alter table excel_snapshot_rows disable row level security;
alter table weekly_orders disable row level security;
alter table usage_entries disable row level security;
alter table weekly_order_rows disable row level security;
alter table racks disable row level security;
alter table rack_products disable row level security;
alter table pickup_requests disable row level security;
alter table pickup_request_items disable row level security;
