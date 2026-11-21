/* Panel, focus, mobile navigation and resizing behavior extracted from
 * daimpad/ratsatlas-bonn@f8850008e81825ae79be49ca7f3441b928a1858b/site/app.js
 * (MIT, Damian Paderta). Hannover keeps three supported sheets and reports
 * their state to the shareable Hannover URL. See docs/UPSTREAM.md. */
export function createBonnPanels({onChange = () => {}, onLayout = () => {}} = {}) {
  const SHEETS = ['panel-list', 'panel-detail', 'timeline-wrap'];
  const IDS = {list:'panel-list', detail:'panel-detail', timeline:'timeline-wrap'};
  const KEYS = Object.fromEntries(Object.entries(IDS).map(([key,id]) => [id,key]));
  const MOBILE = matchMedia('(max-width: 900px)');
  const NARROW = matchMedia('(max-width: 1279px)');
  const $ = id => document.getElementById(id);
  const opener = {};
  const burger = $('nav-burger'), navMore = $('nav-more');
  let lastOpened = 'panel-detail';
  const toggleFor = id => document.querySelector(`.toggle[data-panel="${id}"]`);
  const visible = el => el?.isConnected && !el.closest('[hidden]') && el.getClientRects().length;
  const getState = () => SHEETS.filter(id => !$(id).hidden).map(id => KEYS[id]);
  const equal = (a,b) => a.length === b.length && a.every((v,i) => v === b[i]);
  function refreshLayout() {
    $('map-view').setAttribute('aria-pressed', String(!getState().length));
    requestAnimationFrame(onLayout);
  }
  function rawSet(id, open) {
    const el = $(id);
    if (!el) return;
    if (open && el.hidden && document.activeElement && document.activeElement !== document.body) opener[id] = document.activeElement;
    el.hidden = !open;
    document.querySelectorAll(`.toggle[data-panel="${id}"]`).forEach(b => b.setAttribute('aria-pressed', String(open)));
    if (id === 'panel-list') { document.body.classList.toggle('list-open', open); document.body.classList.toggle('list-closed', !open); }
    if (id === 'panel-detail') { document.body.classList.toggle('detail-open', open); document.body.classList.toggle('detail-closed', !open); }
  }
  function focusPanel(id) {
    const target = $(id)?.querySelector('h2[tabindex], .tl-stage, summary, button');
    target?.focus({preventScroll:true});
  }
  function restoreFocus(id) {
    const toggle = toggleFor(id);
    // On mobile, returning to the search input would reopen the list on focus.
    // Bonn's visible navigation entry is the stable return point there.
    const target = visible(toggle) ? toggle : visible(burger) ? burger : visible(opener[id]) ? opener[id] : $('q');
    target?.focus({preventScroll:true});
  }
  function setNav(open, returnFocus = false) {
    const wasOpen = document.body.classList.contains('nav-open');
    if (open === wasOpen) return;
    document.body.classList.toggle('nav-open',open);
    burger.setAttribute('aria-expanded', String(open));
    if (!open && (returnFocus || navMore.contains(document.activeElement))) burger.focus({preventScroll:true});
  }
  function enforce(preferred = lastOpened) {
    const open = SHEETS.filter(id => !$(id).hidden);
    if (MOBILE.matches && open.length > 1) {
      const keep = open.includes(preferred) ? preferred : open.at(-1);
      open.filter(id => id !== keep).forEach(id => rawSet(id,false));
    } else if (NARROW.matches && !MOBILE.matches && !$('panel-list').hidden && !$('panel-detail').hidden) {
      rawSet(preferred === 'panel-list' ? 'panel-detail' : 'panel-list', false);
    }
  }
  function setPanel(idOrKey, open, {focus = false, notify = true} = {}) {
    const id = IDS[idOrKey] || idOrKey;
    if (!SHEETS.includes(id)) return;
    const before = getState();
    const hadFocus = $(id).contains(document.activeElement);
    rawSet(id,open);
    if (open) { lastOpened = id; enforce(id); setNav(false); }
    if (focus && open) focusPanel(id);
    if (!open && hadFocus) restoreFocus(id);
    const next = getState();
    refreshLayout();
    if (notify && !equal(before,next)) onChange(next,{reason:'user'});
    return next;
  }
  function closePanel(id) {
    setPanel(id,false);
    restoreFocus(IDS[id] || id);
  }
  function setState(keys) {
    const requested = (keys || []).filter(key => IDS[key]);
    const newlyOpened = requested.filter(key => $(IDS[key]).hidden);
    SHEETS.forEach(id => rawSet(id,requested.includes(KEYS[id])));
    if (newlyOpened.length) lastOpened = IDS[newlyOpened.at(-1)];
    else if (!requested.includes(KEYS[lastOpened])) lastOpened = IDS[requested.at(-1)] || lastOpened;
    enforce(lastOpened);
    const hiddenFocus = SHEETS.find(id => $(id).hidden && $(id).contains(document.activeElement));
    if (hiddenFocus) restoreFocus(hiddenFocus);
    refreshLayout();
    return getState();
  }
  function closeAll({notify = true} = {}) {
    const before = getState();
    SHEETS.forEach(id => rawSet(id,false));
    setNav(false);
    refreshLayout();
    if (notify && before.length) onChange([],{reason:'user'});
  }

  // Bonn's drag and keyboard resizers, with per-city stored widths.
  const WIDTH = {
    list:{v:'--list-w', min:300, max:() => Math.min(680,innerWidth * .45), def:360},
    detail:{v:'--detail-w', min:340, max:() => Math.min(760,innerWidth * .5), def:420}
  };
  const widthOf = key => parseFloat(document.documentElement.style.getPropertyValue(WIDTH[key].v)) || WIDTH[key].def;
  function setWidth(key, px, save) {
    const w = WIDTH[key], value = Math.round(Math.max(w.min,Math.min(w.max(),px)));
    document.documentElement.style.setProperty(w.v,value + 'px');
    const handle = document.querySelector(`.resizer[data-resize="${key}"]`);
    handle.setAttribute('aria-valuemin',String(w.min)); handle.setAttribute('aria-valuemax',String(Math.round(w.max())));
    handle.setAttribute('aria-valuenow',String(value)); handle.setAttribute('aria-valuetext',`${value} Pixel breit`);
    if (save) { try { localStorage.setItem('ratsatlas-hannover-breite-' + key,String(value)); } catch { /* optional preference */ } }
  }
  function clampWidths() { Object.keys(WIDTH).forEach(key => setWidth(key,widthOf(key))); }
  for (const key of Object.keys(WIDTH)) {
    try { const saved = Number(localStorage.getItem('ratsatlas-hannover-breite-' + key)); if (Number.isFinite(saved) && saved > 0) setWidth(key,saved); } catch { /* optional preference */ }
  }
  document.querySelectorAll('.resizer').forEach(handle => {
    const key = handle.dataset.resize, sign = key === 'list' ? 1 : -1;
    handle.addEventListener('pointerdown',event => {
      if (event.button !== 0) return;
      event.preventDefault(); handle.setPointerCapture(event.pointerId);
      const x0 = event.clientX, w0 = widthOf(key);
      handle.classList.add('active'); document.body.classList.add('resizing');
      const move = next => setWidth(key,w0 + sign * (next.clientX - x0));
      const end = () => {
        handle.removeEventListener('pointermove',move); handle.removeEventListener('pointerup',end); handle.removeEventListener('pointercancel',end);
        handle.classList.remove('active'); document.body.classList.remove('resizing'); setWidth(key,widthOf(key),true); refreshLayout();
      };
      handle.addEventListener('pointermove',move); handle.addEventListener('pointerup',end); handle.addEventListener('pointercancel',end);
    });
    handle.addEventListener('keydown',event => {
      const step = event.shiftKey ? 64 : 16;
      const delta = {ArrowRight:sign * step, ArrowLeft:-sign * step}[event.key];
      if (delta !== undefined) { event.preventDefault(); setWidth(key,widthOf(key) + delta,true); }
      if (event.key === 'Home') { event.preventDefault(); setWidth(key,WIDTH[key].def,true); }
    });
    handle.addEventListener('dblclick',() => setWidth(key,WIDTH[key].def,true));
  });
  function applyLayout() {
    const before = getState();
    enforce();
    $('timeline-wrap').classList.toggle('tl-compact',MOBILE.matches);
    if (!MOBILE.matches) setNav(false);
    clampWidths(); refreshLayout();
    const next = getState();
    if (!equal(before,next)) onChange(next,{reason:'layout'});
  }
  burger.addEventListener('click',() => setNav(!document.body.classList.contains('nav-open')));
  document.addEventListener('click',event => {
    const toggle = event.target.closest('[data-panel]');
    if (toggle) {
      const id = toggle.dataset.panel;
      setPanel(id,$(id).hidden,{focus:true});
    }
    const close = event.target.closest('[data-close]');
    if (close) closePanel(close.dataset.close);
    const show = event.target.closest('[data-show]');
    if (show) setPanel(show.dataset.show,true,{focus:true});
    if (event.target.closest('[data-dialog]')) setNav(false);
    if (document.body.classList.contains('nav-open') && event.target.isConnected && !event.target.closest('.nav, dialog')) setNav(false);
  });
  document.addEventListener('keydown',event => {
    if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    if (document.body.classList.contains('nav-open')) { event.preventDefault(); setNav(false,true); return; }
    const inside = SHEETS.find(id => !$(id).hidden && $(id).contains(document.activeElement));
    if (inside) { event.preventDefault(); closePanel(inside); }
  });
  MOBILE.addEventListener('change',applyLayout); NARROW.addEventListener('change',applyLayout);
  // Initial layout is silent; application state is applied immediately afterward.
  $('timeline-wrap').classList.toggle('tl-compact',MOBILE.matches); clampWidths();
  return {setPanel, closePanel, closeAll, setState, getState, focusPanel, setNav, isMobile:() => MOBILE.matches};
}
