import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const migration=readFileSync(new URL('../supabase/migrations/20261103153548_staff_expense_delete.sql',import.meta.url),'utf8');
const apiMigration=readFileSync(new URL('../supabase/migrations/20261103163628_staff_expense_api_conflicts.sql',import.meta.url),'utf8');
const uid='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',sid='00000000-0000-4000-8000-000000000003',elsewhere='00000000-0000-4000-8000-000000000004',id='00000000-0000-4000-8000-000000000005';
async function fixture(){
  const db=new PGlite();await db.exec(`
    create schema auth;create schema private;
    create table public.expense_entries(id uuid primary key default gen_random_uuid(),store_id uuid,date date,description text,amount integer,created_at timestamptz default now(),category text,memo text,vendor_id uuid,payment_method text,payment_status text,created_by_user_id uuid,created_by_name text,staff_request_id uuid,staff_revision integer default 1,owner_confirmed_at timestamptz,owner_confirmed_by uuid);
    create table public.vendors(id uuid,store_id uuid,name text,default_category text,archived_at timestamptz);
    create table private.manee_expense_receipts(expense_id uuid primary key references public.expense_entries on delete cascade,name text,mime text,data text);
    create table private.test_memberships(user_id uuid,store_id uuid,role text,status text);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function private.is_live_manee_session() returns boolean language sql as $$select coalesce(current_setting('test.live',true),'true')='true'$$;
    create function private.has_store_membership(s uuid,roles text[]) returns boolean language sql as $$select exists(select 1 from private.test_memberships where user_id=auth.uid() and store_id=s and status='active' and (roles is null or role=any(roles)))$$;
    create function private.manee_store_write_entitled(s uuid) returns boolean language sql as $$select coalesce(current_setting('test.entitled',true),'true')='true'$$;
    insert into private.test_memberships values('${uid}','${sid}','staff','active'),('${other}','${sid}','staff','active');
    insert into public.expense_entries(id,store_id,date,amount,created_by_user_id,staff_revision) values('${id}','${sid}',current_date,12345,'${uid}',1);
    insert into private.manee_expense_receipts values('${id}','receipt.png','image/png','aGVsbG8=');
    select set_config('test.uid','${uid}',false);
    ${migration}
    ${apiMigration}
  `);return db;
}
const remove=(db,store=sid,revision=1)=>db.query('select public.manee_staff_expenses($1,\'delete\',$2::jsonb) as result',[store,JSON.stringify({id,revision})]);
test('own unconfirmed staff expense is removed and receipt follows its foreign key cascade',async()=>{
  const db=await fixture();try{const r=await remove(db);assert.equal(r.rows[0].result.deleted,true);assert.equal((await db.query('select count(*) as count from public.expense_entries')).rows[0].count,0);assert.equal((await db.query('select count(*) as count from private.manee_expense_receipts')).rows[0].count,0);}finally{await db.close();}
});
for(const [name,prepare,code,store,revision]of [
 ['other author',`select set_config('test.uid','${other}',false)`,'42501'],
 ['confirmed by owner',`update public.expense_entries set owner_confirmed_at=now()`,'42501'],
 ['revoked membership',`update private.test_memberships set status='revoked' where user_id='${uid}'`,'42501'],
 ['missing user',`select set_config('test.uid','',false)`,'42501'],
 ['expired session',`select set_config('test.live','false',false)`,'42501'],
 ['wrong store','select 1','42501',elsewhere],
 ['stale revision','select 1','PT409',sid,0],
 ['missing revision','select 1','PT409',sid,null],
 ['expired subscription',`select set_config('test.entitled','false',false)`,'P4402'],
])test('delete rejects '+name+' and retains both business record and receipt',async()=>{
  const db=await fixture();try{await db.exec(prepare);await assert.rejects(remove(db,store||sid,revision===undefined?1:revision),e=>e.code===code);assert.equal((await db.query('select count(*) as count from public.expense_entries')).rows[0].count,1);assert.equal((await db.query('select count(*) as count from private.manee_expense_receipts')).rows[0].count,1);}finally{await db.close();}
});
