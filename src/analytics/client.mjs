import { ExposureClock } from './clock.mjs';

export function normalizeApiUrl(value) {
  const input=value.trim();
  const url=new URL(input.includes('://') ? input : 'https://'+input);
  const local=['localhost','127.0.0.1'].includes(url.hostname);
  if ((url.protocol!=='https:' && !(local && url.protocol==='http:')) ||
      url.username || url.password || url.search || url.hash || url.pathname!=='/' ||
      (!local && !url.hostname.includes('.'))) throw Error('Invalid analytics API origin');
  return url.origin;
}

export function initializeAnalytics(value, slideCount) {
  if (!value.trim()) return {client:null,error:null,configured:false};
  try {
    return {client:new AnalyticsClient(value,slideCount),error:null,configured:true};
  } catch {
    return {client:null,configured:true,error:'Analytics configuration error. Set VITE_ANALYTICS_API_URL to the full HTTPS Worker URL, without /admin, and redeploy.'};
  }
}

export class AnalyticsClient {
  constructor(baseUrl, slideCount) {
    this.base = normalizeApiUrl(baseUrl);
    this.count = slideCount;
    this.openedAt = new Date().toISOString();
    this.token = null;
    this.events = [];
    this.seq = 0;
    this.inFlight = false;
    this.clock = new ExposureClock(slideCount);
    this.openedMono = performance.now();
    this.sessionStarted = this.openedMono;
    this.visitorId = crypto.randomUUID();
    try {
      const value = localStorage.getItem('mata_analytics_browser_v1');
      if (value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) this.visitorId=value;
      else localStorage.setItem('mata_analytics_browser_v1',this.visitorId);
    } catch { /* Without storage, each page visit gets a new browser identifier. */ }
  }
  async unlock(password, initialSlide = 0) {
    if (Date.now() - Date.parse(this.openedAt) > 6 * 60 * 60 * 1000 - 60000) {
      this.openedAt = new Date().toISOString();
      this.openedMono = performance.now();
    }
    const tag = new URL(location.href).searchParams.get('share');
    const response = await fetch(this.base+'/session',{
      method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({password,visitorId:this.visitorId,openedAt:this.openedAt,shareTag:tag && /^[\w-]{1,80}$/.test(tag) ? tag : null}),
      signal:AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Unable to unlock presentation');
    this.token=data.token;this.expiresAt=data.expiresAt;this.sessionStarted=this.openedMono;
    this.clock=new ExposureClock(this.count);this.events=[];this.seq=0;
    this.clock.setSlide(initialSlide);this.setActive();this.event('slide_view',initialSlide);
    if (!this.started) {
      this.started=true;
      setInterval(()=>this.clock.tick(),1000);
      setInterval(()=>{if(document.visibilityState==='visible') void this.flush();},15000);
      document.addEventListener('visibilitychange',()=>{this.setActive();void this.flush(true);});
      window.addEventListener('blur',()=>{this.setActive();void this.flush(true);});
      window.addEventListener('focus',()=>this.setActive());
      window.addEventListener('pagehide',()=>{this.clock.setActive(false);void this.flush(true);});
      window.addEventListener('pageshow',()=>this.setActive());
      document.addEventListener('click',event=>{
        const link=event.target.closest?.('a[data-link-id]');
        if(link && this.token) { this.event('link_click',Number(link.dataset.slide),link.dataset.linkId);void this.flush(true); }
      });
    }
  }
  setActive() { this.clock.setActive(Boolean(this.token) && document.visibilityState==='visible' && document.hasFocus()); }
  slide(index) {
    if (!this.token || this.clock.slide===index) return;
    this.clock.setSlide(index);this.event('slide_view',index);void this.flush();
  }
  event(type, slide, linkId) {
    // Bound memory if the network remains unavailable for a long time.
    if(this.events.length<200) this.events.push({id:crypto.randomUUID(),type,slide,linkId,atMs:Math.floor(performance.now()-this.sessionStarted)});
  }
  async flush(background=false) {
    if(!this.token || (this.inFlight && !background)) return;
    if(Date.now()>=this.expiresAt) {
      this.clock.setActive(false);this.token=null;
      window.dispatchEvent(new Event('analytics:expired'));return;
    }
    const slideMs=this.clock.snapshot();
    const events=this.events.slice(0,40);
    const body=JSON.stringify({token:this.token,seq:++this.seq,elapsedMs:Math.floor(performance.now()-this.sessionStarted),slideMs,events});
    // A simple content type lets keepalive requests avoid a CORS preflight during page exit.
    if(!background) this.inFlight=true;
    try {
      const response=await fetch(this.base+'/events',{method:'POST',credentials:'omit',headers:{'Content-Type':'text/plain'},body,keepalive:true,signal:AbortSignal.timeout(10000)});
      if(response.ok) {
        const ids=new Set(events.map(e=>e.id));this.events=this.events.filter(e=>!ids.has(e.id));
      }
    } catch { /* Keep counters and unacknowledged event IDs for the next upload. */ }
    finally {if(!background)this.inFlight=false;}
  }
}
