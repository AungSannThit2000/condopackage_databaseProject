-- Simple CRUD walkthrough for presentation
-- NOTE: Schema now uses composite room key (building_id, room_no). Some legacy examples below still reference room_id; update them before running.
-- Uses the seed data from initialdata.sql (IDs restart from 1 after running that file).
-- Run section by section in psql to see changes clearly.

-- ------------------------------------------------------------------
-- 0) Quick look at the seeded data (after running initialdata.sql)
-- ------------------------------------------------------------------
select * from building order by building_id;
select * from room order by room_id;
select user_id, username, role, status from user_account order by user_id;
select * from staff order by staff_id;
select * from tenant order by tenant_id;

-- ------------------------------------------------------------------
-- 1) Buildings: list, create, update, delete
-- ------------------------------------------------------------------
-- List buildings with room counts
select b.building_id, b.building_code, b.building_name, count(r.room_id) as room_count
from building b
left join room r on b.building_id = r.building_id
group by b.building_id
order by b.building_code;

-- Create a new building "C"
insert into building (building_code, building_name)
values ('C', 'Building C');

-- Update the new building's name
update building
set building_name = 'Building C (Renovated)'
where building_code = 'C';

-- Delete the demo building C
delete from building where building_code = 'C';

-- ------------------------------------------------------------------
-- 2) Rooms: list, create, update, delete
-- ------------------------------------------------------------------
-- List rooms with building info
select r.room_id, r.room_no, r.floor, r.status, b.building_code
from room r
join building b on r.building_id = b.building_id
order by b.building_code, r.room_no;

-- Add a new room to Building B (building_id = 2 from the seed)
insert into room (building_id, room_no, floor, status)
values (2, '203', 2, 'ACTIVE');

-- Update that room's number and floor
update room
set room_no = '303', floor = 3
where building_id = 2 and room_no = '203';

-- Delete the demo room we just added
delete from room
where building_id = 2 and room_no = '303';

-- ------------------------------------------------------------------
-- 3) Users and staff (OFFICER role): create, read, update, delete
-- ------------------------------------------------------------------
-- Create an officer login and staff profile
with new_user as (
  insert into user_account (username, password, role, status)
  values ('officer2', 'officer2', 'OFFICER', 'ACTIVE')
  returning user_id
)
insert into staff (user_id, full_name, phone, email)
select user_id, 'Officer Two', '0999000005', 'officer2@example.com'
from new_user;

-- See all officers
select s.staff_id, s.full_name, s.phone, s.email, u.username
from staff s join user_account u on s.user_id = u.user_id
where u.role = 'OFFICER'
order by s.staff_id;

-- Update contact info for Officer Two
update staff set phone = '0999000006', email = 'officer2_new@example.com'
where full_name = 'Officer Two';

-- Deactivate the officer's login
update user_account set status = 'INACTIVE'
where username = 'officer2';

-- Delete the officer and their login
with s as (select staff_id, user_id from staff where full_name = 'Officer Two')
delete from staff where staff_id = (select staff_id from s);
delete from user_account where user_id = (select user_id from s);

-- ------------------------------------------------------------------
-- 4) Tenants: create, read, update, delete (assign to free room)
-- ------------------------------------------------------------------
-- Add a new tenant for room_id = 3 (Building B, room 201 from the seed)
with new_user as (
  insert into user_account (username, password, role, status)
  values ('tenant3', 'tenant3', 'TENANT', 'ACTIVE')
  returning user_id
)
insert into tenant (user_id, room_id, full_name, phone, email)
select user_id, 3, 'Tenant Three', '0999000007', 'tenant3@example.com'
from new_user;

-- List tenants with their room and building
select t.tenant_id, t.full_name, t.phone, t.email,
       b.building_code, r.room_no, u.username, u.status
from tenant t
join user_account u on t.user_id = u.user_id
join room r on t.room_id = r.room_id
join building b on r.building_id = b.building_id
order by t.tenant_id;

-- Update tenant contact info
update tenant
set phone = '0999000008', email = 'tenant3_new@example.com'
where full_name = 'Tenant Three';

-- Delete the tenant and their login (room stays available)
with t as (select tenant_id, user_id from tenant where full_name = 'Tenant Three')
delete from tenant where tenant_id = (select tenant_id from t);
delete from user_account where user_id = (select user_id from t);

-- ------------------------------------------------------------------
-- 5) Packages and status log: create, read, update, delete
-- ------------------------------------------------------------------
-- Create a package for tenant_id = 1 (Aung Sann Thit in room A101)
-- received_by_staff_id = 2 (Officer User from the seed)
with pkg as (
  insert into package (tenant_id, received_by_staff_id, tracking_no, carrier, sender_name, current_status)
  values (1, 2, 'TRACK-1001', 'DHL', 'Online Shop', 'ARRIVED')
  returning package_id, received_by_staff_id
)
insert into package_status_log (package_id, updated_by_staff_id, status, note)
select package_id, received_by_staff_id, 'ARRIVED', 'Package logged at front desk'
from pkg;

-- View packages with tenant and unit info
select p.package_id, p.tracking_no, p.carrier, p.current_status,
       t.full_name as tenant_name, b.building_code, r.room_no, p.arrived_at
from package p
join tenant t on p.tenant_id = t.tenant_id
join room r on t.room_id = r.room_id
join building b on r.building_id = b.building_id
order by p.package_id;

-- Mark the package as picked up and add a log entry
with pkg as (select package_id from package where tracking_no = 'TRACK-1001'),
     staff_cte as (select staff_id from staff where full_name = 'Officer User')
update package
set current_status = 'PICKED_UP', picked_up_at = now()
where package_id = (select package_id from pkg);

insert into package_status_log (package_id, updated_by_staff_id, status, note)
select (select package_id from pkg), (select staff_id from staff_cte),
       'PICKED_UP', 'Collected by tenant with ID shown';

-- Delete the package and its logs
with pkg as (select package_id from package where tracking_no = 'TRACK-1001')
delete from package_status_log where package_id = (select package_id from pkg);
delete from package where package_id = (select package_id from pkg);

-- ------------------------------------------------------------------
-- 6) Reporting examples (simple reads)
-- ------------------------------------------------------------------
-- How many active officers?
select count(*) as active_officers
from staff s join user_account u on s.user_id = u.user_id
where u.role = 'OFFICER' and u.status = 'ACTIVE';

-- How many tenants per building?
select b.building_code, count(t.tenant_id) as tenants
from building b
left join room r on b.building_id = r.building_id
left join tenant t on r.room_id = t.room_id
group by b.building_code
order by b.building_code;
