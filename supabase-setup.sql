-- ============================================================
-- Corner Cafe — Supabase Setup Script
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Store all app data as simple key/value pairs
create table if not exists cafe_store (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

-- 2. Allow public read/write (the admin PIN protects sensitive actions)
alter table cafe_store enable row level security;

create policy "Public read" on cafe_store for select using (true);
create policy "Public write" on cafe_store for insert with check (true);
create policy "Public update" on cafe_store for update using (true);
create policy "Public delete" on cafe_store for delete using (true);

-- 3. Seed the staff list
insert into cafe_store (key, value) values (
  'cc_staff',
  '["Julia","Madeline","Sophia C.","Marlee","Amira","Daisy","Chloe T.","Mila","Emily","Eleanor","Aubrey","Rosalie","Maggie","Alex","Olivia","Phylicia","Jaya","Miria","Juliette","Caidyn","Emma O.","Emma M.","Chloe E.","Audrey L.","Eloise","Aisling","Nimah","Che","Ellie","Esmy","Nyah","Malia","Stella","MacKensie","Audrey Y.","Regan","Anya"]'
) on conflict (key) do nothing;
