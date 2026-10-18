import { neon } from '@neondatabase/serverless';

// All operations are bound to a server-configured site. No browser-supplied site ID is used.
export function createStore(databaseUrl, site, query = neon(databaseUrl).query) {
  return {
    async createSession(s) {
      await query(`INSERT INTO analytics.sessions
        (id,site_id,visitor_id,origin,opened_at,expires_at,ip_address,user_agent,share_tag)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [s.id,site,s.visitorId,s.origin,s.openedAt,s.expiresAt,s.ip,s.userAgent,s.shareTag]);
    },
    async saveSnapshot(id, data) {
      // One atomic statement gates all writes on the sequence number. Replays cannot add time.
      const rows = await query(`WITH accepted AS (
        UPDATE analytics.sessions SET last_seq=$3,
          elapsed_ms=GREATEST(elapsed_ms,$4), viewing_ms=GREATEST(viewing_ms,$5),last_seen_at=now()
        WHERE site_id=$1 AND id=$2 AND expires_at>now() AND last_seq<$3 AND elapsed_ms<=$4
          AND NOT EXISTS (SELECT 1 FROM analytics.slide_timings old WHERE old.site_id=$1 AND old.session_id=$2
            AND old.viewing_ms>($6::jsonb->>old.slide)::bigint)
        RETURNING id
      ), timings AS (
        INSERT INTO analytics.slide_timings(site_id,session_id,slide,viewing_ms)
        SELECT $1,accepted.id,(t.ordinality-1)::integer,t.value::bigint
        FROM accepted CROSS JOIN jsonb_array_elements_text($6::jsonb) WITH ORDINALITY t(value,ordinality)
        ON CONFLICT(site_id,session_id,slide) DO UPDATE SET viewing_ms=GREATEST(analytics.slide_timings.viewing_ms,excluded.viewing_ms)
      ), inserted_events AS (
        INSERT INTO analytics.events(site_id,session_id,id,type,slide,at_ms,link_id)
        SELECT $1,accepted.id,(e->>'id')::uuid,e->>'type',(e->>'slide')::integer,(e->>'atMs')::bigint,e->>'linkId'
        FROM accepted CROSS JOIN jsonb_array_elements($7::jsonb) e
        ON CONFLICT DO NOTHING
      ) SELECT id FROM accepted`,
      [site,id,data.seq,data.elapsedMs,data.slideMs.reduce((a,b)=>a+b,0),JSON.stringify(data.slideMs),JSON.stringify(data.events)]);
      return rows.length > 0;
    },
    async report(days) {
      const [summary, sessions, slides, clicks] = await Promise.all([
        query(`SELECT count(*)::int AS sessions,count(DISTINCT visitor_id)::int AS browsers,
          coalesce(sum(viewing_ms),0)::float8 AS viewing_ms,coalesce(sum(elapsed_ms),0)::float8 AS elapsed_ms
          FROM analytics.sessions WHERE site_id=$1 AND unlocked_at>now()-$2*interval '1 day'`,[site,days]),
        query(`SELECT id,visitor_id,opened_at,unlocked_at,last_seen_at,ip_address,user_agent,share_tag,viewing_ms::float8,elapsed_ms::float8
          FROM analytics.sessions WHERE site_id=$1 AND unlocked_at>now()-$2*interval '1 day'
          ORDER BY unlocked_at DESC LIMIT 100`,[site,days]),
        query(`SELECT t.slide,sum(t.viewing_ms)::float8 AS viewing_ms FROM analytics.slide_timings t
          JOIN analytics.sessions s ON s.site_id=t.site_id AND s.id=t.session_id
          WHERE t.site_id=$1 AND s.unlocked_at>now()-$2*interval '1 day' GROUP BY t.slide ORDER BY t.slide`,[site,days]),
        query(`SELECT link_id,count(*)::int AS clicks FROM analytics.events WHERE site_id=$1
          AND type='link_click' AND received_at>now()-$2*interval '1 day' GROUP BY link_id`,[site,days]),
      ]);
      return {siteId:site,days,summary:summary[0],sessions,slides,clicks};
    },
    async detail(id) {
      const [sessions, timings, events] = await Promise.all([
        query(`SELECT id,visitor_id,opened_at,unlocked_at,last_seen_at,ip_address,user_agent,share_tag,viewing_ms::float8,elapsed_ms::float8
          FROM analytics.sessions WHERE site_id=$1 AND id=$2`,[site,id]),
        query('SELECT slide,viewing_ms::float8 FROM analytics.slide_timings WHERE site_id=$1 AND session_id=$2 ORDER BY slide',[site,id]),
        query('SELECT type,slide,at_ms::float8,link_id FROM analytics.events WHERE site_id=$1 AND session_id=$2 ORDER BY at_ms LIMIT 500',[site,id]),
      ]);
      return sessions.length ? {session:sessions[0],timings,events} : null;
    },
    async cleanup(ipDays, retentionDays) {
      await query(`UPDATE analytics.sessions SET ip_address=NULL WHERE site_id=$1 AND ip_address IS NOT NULL AND unlocked_at<now()-$2*interval '1 day'`,[site,ipDays]);
      await query(`DELETE FROM analytics.sessions WHERE site_id=$1 AND unlocked_at<now()-$2*interval '1 day'`,[site,retentionDays]);
    },
  };
}
