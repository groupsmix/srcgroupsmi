-- Recommended pre-launch DB audit
-- Expected to be run against the staging environment before launch

-- 1. Tables in public with RLS disabled
SELECT nspname||'.'||relname AS table_, relrowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE relkind='r' AND nspname='public' AND NOT relrowsecurity;
 
-- 2. Tables with RLS enabled but zero policies (= deny-all, sometimes intentional)
SELECT c.relname
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid=c.oid
WHERE c.relkind='r' AND n.nspname='public' AND c.relrowsecurity
GROUP BY c.relname HAVING count(p.oid)=0;
 
-- 3. SECURITY DEFINER functions without pinned search_path
SELECT p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef
  AND NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%');
 
-- 4. Functions with EXECUTE to public/anon that shouldn't have it
SELECT p.proname, p.prosecdef, acl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
     LATERAL unnest(coalesce(p.proacl,'{}')) acl
WHERE n.nspname='public' AND acl::text ~ '(anon|PUBLIC)=X';
 
-- 5. Foreign keys missing ON DELETE rules on user-owned tables
-- (relevant for Epic C cascade correctness)
SELECT conrelid::regclass, conname, confdeltype
FROM pg_constraint
WHERE contype='f' AND confdeltype='a'
  AND conrelid::regclass::text ~ 'users|groups|articles';
