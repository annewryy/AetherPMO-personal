-- ============================================================================
-- AetherPMS One-time Admin Data Migration & Cleanup Script
-- Run this script in your Supabase SQL Editor as an Administrator.
-- ============================================================================

BEGIN;

-- 1. Create a safe backup table before making any changes
CREATE TABLE IF NOT EXISTS public.action_items_backup AS 
SELECT * FROM public.action_items;

-- 2. Normalize assignee_id by exact Email match
UPDATE public.action_items ai
   SET assignee_id = pr.id,
       assignee_email = pr.email
  FROM public.profiles pr
 WHERE ai.assignee_id IS NULL
   AND ai.assignee_email IS NOT NULL
   AND LOWER(TRIM(ai.assignee_email)) = LOWER(TRIM(pr.email));

-- 3. Normalize assignee_id by Name match (ONLY if name is unique in profiles)
WITH SingleNameProfiles AS (
    SELECT LOWER(TRIM(name)) AS norm_name, MAX(id) AS profile_id
      FROM public.profiles
     WHERE name IS NOT NULL AND TRIM(name) != ''
     GROUP BY LOWER(TRIM(name))
    HAVING COUNT(*) = 1
)
UPDATE public.action_items ai
   SET assignee_id = snp.profile_id
  FROM SingleNameProfiles snp
 WHERE ai.assignee_id IS NULL
   AND ai.assignee IS NOT NULL
   AND LOWER(TRIM(ai.assignee)) = snp.norm_name;

-- 4. Log unassigned / unresolved Action Items for administrative review
SELECT id, title, assignee, assignee_email, owner, created_at
  FROM public.action_items
 WHERE assignee_id IS NULL;

COMMIT;
