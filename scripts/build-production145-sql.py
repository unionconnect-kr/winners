"""Build a reviewed, additive production promotion from catalog snapshots."""
import json, re, sys
from pathlib import Path

root = Path(sys.argv[1])
out = Path(sys.argv[2])
load = lambda n: json.loads((root / n).read_text())
pf, sf = load('prod-functions-current.json'), load('stage-functions-current.json')
pt, st = load('prod-tables-current.json'), load('stage-tables-current.json')
fk = lambda f: (f['schema'], f['name'], f['args'])
tk = lambda t: (t['schema'], t['name'])
pm, tm = {fk(f): f for f in pf}, {tk(t): t for t in pt}
qi = lambda s: '"' + s.replace('"', '""') + '"'
qn = lambda s, n: qi(s) + '.' + qi(n)
lit = lambda s: "'" + s.replace("'", "''") + "'"
excluded_tables = {'account_recovery_events', 'account_recovery_keys', 'factory_logistics_accounts', 'factory_recipes', 'staff_link_code_rollout_backup'}
# Preserve production routing and the stronger live-session guard on staff_clock.
# Remaining exclusions are unrelated services or formatting-only differences.
excluded_functions = {'dispatch_android_notifications', 'staff_clock', 'bootstrap_staff_account', 'crew_belongs_to_store', 'guard_business_record', 'hq_delete_franchise', 'manee_support_recovery_service', 'manee_staff_portal_v1', 'manee_staff_portal_store_v2', 'manee_staff_portal_store_v1', 'manee_staff_portal_self_profile_disabled', 'manee_recovery_service'}
selected = [f for f in sf if not f['name'].startswith(('factory_', 'manee_factory_')) and f['name'] not in excluded_functions and (fk(f) not in pm or f['hash'] != pm[fk(f)]['hash'])]
tables = [t for t in st if t['name'] not in excluded_tables]
new_tables = [t for t in tables if tk(t) not in tm]
sql = ['-- MANEE 1.45 production database promotion. No staging data or credentials are copied.', 'BEGIN;', "SET LOCAL lock_timeout = '5s';", "SET LOCAL statement_timeout = '120s';", 'SET LOCAL search_path = public, pg_catalog;']
checks = []
for f in selected:
    identity = f['schema'] + '.' + f['name'] + '(' + f['args'] + ')'
    # to_regprocedure accepts argument types only; the predicate below also checks names/default-safe identity.
    pred = 'n.nspname=' + lit(f['schema']) + ' AND p.proname=' + lit(f['name']) + ' AND pg_get_function_identity_arguments(p.oid)=' + lit(f['args'])
    expected = pm.get(fk(f))
    if expected:
        checks.append('IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE ' + pred + ' AND md5(pg_get_functiondef(p.oid))=' + lit(expected['hash']) + ') THEN RAISE EXCEPTION ' + lit('Function changed since preflight: ' + identity) + '; END IF;')
    else:
        checks.append('IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE ' + pred + ') THEN RAISE EXCEPTION ' + lit('New function already exists: ' + identity) + '; END IF;')
for t in new_tables:
    checks.append('IF to_regclass(' + lit(t['schema']+'.'+t['name']) + ') IS NOT NULL THEN RAISE EXCEPTION ' + lit('Table changed since preflight: '+t['name']) + '; END IF;')
sql.append('DO $preflight$ BEGIN\n' + '\n'.join(checks) + '\nEND $preflight$;')
added_columns = []
for t in tables:
    name = qn(t['schema'], t['name']); old = tm.get(tk(t)); cols = []
    oldcols = {x['name']: x for x in old['columns']} if old else {}
    for c in t['columns']:
        if c['name'] in oldcols: continue
        assert not c['identity'] and not c['generated'], (name, c)
        definition = qi(c['name']) + ' ' + c['type']
        if c['default'] is not None: definition += ' DEFAULT ' + c['default']
        if c['not_null']: definition += ' NOT NULL'
        if old:
            sql.append('ALTER TABLE ' + name + ' ADD COLUMN ' + definition + ';')
            added_columns.append((t['schema'], t['name'], c['name']))
        else: cols.append(definition)
    if not old:
        sql.append('CREATE TABLE ' + name + '(\n' + ',\n'.join(cols) + '\n);')
        assert t['rls'], name
        sql.append('ALTER TABLE ' + name + ' ENABLE ROW LEVEL SECURITY;')
        sql.append('REVOKE ALL ON TABLE '+name+' FROM PUBLIC, anon, authenticated, service_role;')
        for a in t['acl'] or []:
            if a['role'] in ('postgres', 'anon', 'PUBLIC'): continue
            assert a['role'] in ('authenticated', 'service_role'), (name, a)
            if a['privilege'] not in ('SELECT','INSERT','UPDATE','DELETE'): continue
            sql.append('GRANT '+a['privilege']+' ON TABLE '+name+' TO '+qi(a['role'])+';')
    previous = {x['name']:x for x in (old or {}).get('constraints') or []}
    for c in t['constraints'] or []:
        if c['name'] in previous:
            assert c['definition'] == previous[c['name']]['definition'], (name, 'constraint drift', c['name'])
        else: sql.append('ALTER TABLE '+name+' ADD CONSTRAINT '+qi(c['name'])+' '+c['definition']+';')
    previous = {x['name']:x for x in (old or {}).get('indexes') or []}
    for x in t['indexes'] or []:
        if x['name'] in previous:
            assert x['definition'] == previous[x['name']]['definition'], (name, 'index drift', x['name'])
        else: sql.append(x['definition']+';')

# SQL-language functions validate their callees on creation; sort changed/new dependencies first.
byname = {(f['schema'], f['name']): f for f in selected}
done, visiting, ordered = set(), set(), []
def visit(f):
    k = fk(f)
    if k in done: return
    if k in visiting: return  # PL/pgSQL bodies can contain mutual runtime calls.
    visiting.add(k)
    for dep in re.findall(r'\b(private|public)\.([a-z_][a-z_0-9]*)\s*\(', f['definition']):
        if dep in byname and byname[dep] is not f: visit(byname[dep])
    visiting.remove(k); done.add(k); ordered.append(f)
for f in selected: visit(f)
for f in ordered:
    sql.append(f['definition'].rstrip() + ';')
    signature = qn(f['schema'], f['name']) + '(' + f['args'] + ')'
    if fk(f) not in pm:
        sql.append('REVOKE ALL ON FUNCTION '+signature+' FROM PUBLIC, anon, authenticated, service_role;')
        for a in f['acl']:
            if a['role'] == 'postgres': continue
            assert a['role'] in ('authenticated','service_role'), (signature,a)
            sql.append('GRANT EXECUTE ON FUNCTION '+signature+' TO '+qi(a['role'])+';')

# Migrate existing records additively. Existing memberships, balances and subscriptions are untouched.
sql.append("""INSERT INTO private.manee_manager_permissions(crew_id,store_id,enabled,permissions,migrated)
SELECT c.id,c.store_id,true,private.manee_manager_normalize(jsonb_build_object(
 'view',case when c.sales_access or s.manager_dashboard_enabled then 'sales' else 'none' end,
 'salesWrite',true,'schedule',true,'wage',true,'payroll',true,'reportView',true,'reportEdit',true,'export',true)),true
FROM public.crew c JOIN public.stores s ON s.id=c.store_id
WHERE c.is_manager OR EXISTS(SELECT 1 FROM public.store_memberships m WHERE m.crew_id=c.id AND m.store_id=c.store_id AND m.status='active' AND m.role='manager')
ON CONFLICT(crew_id) DO NOTHING;
INSERT INTO public.checklist_history(store_id,date,revision,done,total,closed_at)
SELECT store_id,date,1,done,total,coalesce(closed_at,now()) FROM public.checklist_log ON CONFLICT DO NOTHING;
UPDATE public.announcement_reads SET revision=1 WHERE revision IS NULL;""")
cmds = {'*':'ALL','r':'SELECT','a':'INSERT','w':'UPDATE','d':'DELETE'}
changed_policies = []
for t in tables:
    name = qn(t['schema'], t['name']);old = tm.get(tk(t));previous = {p['name']:p for p in (old or {}).get('policies') or []}
    for p in t['policies'] or []:
        # Avoid duplicate session predicates and retain the legacy reservation delete API until store rollout.
        if p['name'] in ('manee_security_live_session','manee_live_session_required','reservations_preserve_history'): continue
        if p == previous.get(p['name']): continue
        roles = ','.join(qi(x) if x!='PUBLIC' else 'PUBLIC' for x in p['roles'])
        if p['name'] in previous:
            assert (p['cmd'],p['permissive']) == (previous[p['name']]['cmd'],previous[p['name']]['permissive'])
            stmt = 'ALTER POLICY '+qi(p['name'])+' ON '+name+' TO '+roles
        else: stmt = 'CREATE POLICY '+qi(p['name'])+' ON '+name+' AS '+('PERMISSIVE' if p['permissive'] else 'RESTRICTIVE')+' FOR '+cmds[p['cmd']]+' TO '+roles
        if p['qual'] is not None: stmt += ' USING ('+p['qual']+')'
        if p['check'] is not None: stmt += ' WITH CHECK ('+p['check']+')'
        sql.append(stmt+';'); changed_policies.append((t['name'],p['name']))
    if t['schema']=='public' and any(p['name'] in ('manee_security_live_session','manee_live_session_required') for p in t['policies'] or []) and not any(p['name'] in ('manee_security_live_session','manee_live_session_required') for p in previous.values()):
        sql.append('CREATE POLICY manee_security_live_session ON '+name+' AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.is_live_manee_session())) WITH CHECK ((SELECT private.is_live_manee_session()));')
    previous = {x['name']:x for x in (old or {}).get('triggers') or []}
    for x in t['triggers'] or []:
        if x==previous.get(x['name']): continue
        if x['name'] in previous: sql.append('DROP TRIGGER '+qi(x['name'])+' ON '+name+';')
        sql.append(x['definition']+';')

sql.append("SELECT cron.schedule('manee-sms-challenge-retention','*/10 * * * *','select private.manee_purge_expired_sms_challenges(500);');")
post = []
for f in selected:
    pred = 'n.nspname='+lit(f['schema'])+' AND p.proname='+lit(f['name'])+' AND pg_get_function_identity_arguments(p.oid)='+lit(f['args'])
    post.append('IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE '+pred+' AND md5(pg_get_functiondef(p.oid))='+lit(f['hash'])+') THEN RAISE EXCEPTION '+lit('Deployed function mismatch: '+f['name'])+'; END IF;')
    if fk(f) not in pm:
        post.append('IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE '+pred+" AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN RAISE EXCEPTION "+lit('Anonymous grant on '+f['name'])+'; END IF;')
for f in pf:
    if f['schema']=='private' and f['name'] in ('dispatch_android_notifications','staff_clock'):
        post.append('IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='+lit(f['schema'])+' AND p.proname='+lit(f['name'])+') IS DISTINCT FROM '+lit(f['hash'])+' THEN RAISE EXCEPTION '+lit('Production-specific function changed: '+f['name'])+'; END IF;')
sql.append('DO $postconditions$ BEGIN\n'+'\n'.join(post)+'\nEND $postconditions$;')
qa = (out.parent/'role-smoke-rollback.sql').read_text()
qa = re.sub(r'^BEGIN;\s*','',qa, count=1, flags=re.M)
qa = re.sub(r'^ROLLBACK;\s*$', '', qa, count=1, flags=re.M)
sql.extend(['SAVEPOINT release145_verification;', qa, 'ROLLBACK TO SAVEPOINT release145_verification;', 'RELEASE SAVEPOINT release145_verification;'])
sql.append("NOTIFY pgrst, 'reload schema';")
sql.append('COMMIT;')
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text('\n\n'.join(sql)+'\n')
manifest={'functions':[{'schema':f['schema'],'name':f['name'],'args':f['args'],'expectedHash':f['hash'],'new':fk(f) not in pm} for f in selected], 'newTables':[list(tk(t)) for t in new_tables], 'addedColumns':added_columns,'policies':changed_policies,'productionOnlyPreserved':['dispatch_android_notifications','staff_clock'],'legacyReservationDeletePreserved':True}
(out.parent/'production145-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'sqlBytes':out.stat().st_size,'functions':len(selected),'newTables':len(new_tables),'addedColumns':len(added_columns),'policies':len(changed_policies)}))
