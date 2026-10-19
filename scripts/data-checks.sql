-- Data checks for the page checker. Read-only. Each row is one problem: (area, problem, detail).
-- Run with Supabase execute_sql on project wruevdyyhuizyydibzar. No rows means nothing found.
with
money as (select payload p, published_at from money_snapshot limit 1),
txns as (select t from money, jsonb_array_elements(p->'transactions') t),
periods as (select k, v from money, jsonb_each(p->'spending') as x(k, v)),
period_sums as (
  select k, (v->>'income')::numeric income, (v->>'spent')::numeric spent, (v->>'net')::numeric net,
    coalesce((select -sum((t->>'amount')::numeric) from txns where t->>'category' = 'Income' and t->>'hidden' is null
      and t->>'date' >= v->>'start' and t->>'date' < v->>'end'), 0) txn_income,
    coalesce((select sum((t->>'amount')::numeric) from txns where (t->>'spending')::boolean
      and t->>'date' >= v->>'start' and t->>'date' < v->>'end'), 0) txn_spent
  from periods
),
email as (select payload p, synced_at from section_snapshots where section = 'email' order by synced_at desc limit 1)

-- Snapshots the pages read from that stopped updating
select 'freshness' area, section || ' snapshot is stale' problem, 'last synced ' || synced_at::text detail
from (select distinct on (section) section, synced_at from section_snapshots order by section, synced_at desc) s
where section <> 'finances' and synced_at < now() - interval '6 hours'
union all
select 'freshness', 'Finances: Mac has not published', 'last published ' || published_at::text from money where published_at < now() - interval '6 hours'

-- Finances: tiles must match the transactions they summarize
union all
select 'finances', 'Came in does not match income transactions', k || ': tile ' || round(income, 2) || ', transactions ' || round(txn_income, 2)
from period_sums where abs(income - txn_income) > 1
union all
select 'finances', 'Spent does not match spending transactions', k || ': tile ' || round(spent, 2) || ', transactions ' || round(txn_spent, 2)
from period_sums where abs(spent - txn_spent) > 1
union all
select 'finances', 'Left over is not Came in minus Spent', k || ': ' || round(net, 2) || ' vs ' || round(income - spent, 2)
from period_sums where abs(net - (income - spent)) > 1
union all
select 'finances', 'Money in filed as a transfer', (t->>'date') || ' ' || left(t->>'name', 60) || ' ' || (t->>'amount')
from txns where t->>'category' = 'Transfer' and (t->>'amount')::numeric < 0
  and (t->>'name') ~* '(check|cheque|mobile|atm|cash|branch) deposit|payroll|direct dep|wave'
union all
select 'finances', 'Transactions dated in the future', count(*)::text || ' rows' from txns where (t->>'date')::date > current_date + 1 having count(*) > 0
union all
select 'finances', 'Edits from the page stuck waiting for the Mac', count(*)::text || ' queued over 1h' from money_actions
where status not in ('done', 'failed') and created_at < now() - interval '1 hour' having count(*) > 0
union all
select 'finances', 'Edit failed on the Mac', path || ': ' || left(coalesce(result->>'error', ''), 100) from money_actions
where status = 'failed' and done_at > now() - interval '1 day'

-- Email: threads waiting on a reply need options to pick from
union all
select 'email', 'Needs a reply but has no reply options', left(coalesce(t->>'subject', t->>'id'), 80)
from email, jsonb_array_elements(coalesce(p->'threads', p->'to_reply', '[]')) t
where (t->>'needs_reply')::boolean and coalesce(jsonb_array_length(t->'replies'), 0) = 0

-- Requests to Claude that stalled or failed
union all
select 'claude', 'Request stuck in ' || status, coalesce(action, '') || ' ' || left(coalesce(note, task, ''), 80) from claude_requests
where status in ('queued', 'working') and created_at < now() - interval '3 hours'
union all
select 'claude', 'Request failed', coalesce(action, '') || ' ' || left(coalesce(note, task, ''), 60) || ': ' || left(coalesce(result, summary, ''), 80) from claude_requests
where status = 'failed' and updated_at > now() - interval '1 day'

-- Brain dumps never sorted
union all
select 'brain dump', 'Not sorted after 3 hours', left(content, 80) from brain_dumps
where processed_at is null and created_at < now() - interval '3 hours'

-- Jobs
union all
select 'jobs', 'Unknown status', slug || ': ' || coalesce(status, 'null') from jobs
where coalesce(status, '') not in ('new', 'approved', 'applied', 'interview', 'offer', 'accepted', 'rejected', 'skipped')
union all
select 'jobs', 'Due date passed but still open', slug || ' due ' || due::text from jobs
where due < current_date and status in ('new', 'approved')
