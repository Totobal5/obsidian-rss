import {RSS_EVENTS} from '../../src/events';

export function augment(el: any){
  el.empty = function(){ while(this.firstChild) this.removeChild(this.firstChild);} ;
  el.addClass = function(c:string){ this.classList.add(c);} ;
  el.removeClass = function(c:string){ this.classList.remove(c);} ;
  el.hasClass = function(c:string){ return this.classList.contains(c);} ;
  el.toggleClass = function(c:string,v?:boolean){ if(v===false) this.classList.remove(c); else this.classList.add(c);} ;
  el.setText = function(t:string){ this.textContent = t; };
  el.createDiv = function(opts?: any){ const d=document.createElement('div'); if(opts?.cls) d.className=opts.cls; if(opts?.text) d.textContent=opts.text; augment(d); this.appendChild(d); return d;};
  el.createSpan = function(opts?: any){ const s=document.createElement('span'); if(typeof opts==='string') s.className=opts; else if(opts?.cls) s.className=opts.cls; if(opts?.text) s.textContent=opts.text; (s as any).addClass=(c:string)=> s.classList.add(c); (s as any).toggleClass=(c:string,v?:boolean)=>{ if(v===false) s.classList.remove(c); else s.classList.add(c); }; (s as any).setText=(t:string)=>{ s.textContent=t; }; this.appendChild(s); return s; };
  el.createEl = function(tag:string, opts?: any){ const n=document.createElement(tag); if(typeof opts==='string') n.className=opts; else if(opts?.cls) n.className=opts.cls; if(opts?.text) n.textContent=opts.text; augment(n); if(opts?.attr){ for(const k in opts.attr){ if(Object.prototype.hasOwnProperty.call(opts.attr,k)) n.setAttribute(k,String(opts.attr[k])); } } this.appendChild(n); return n; };
  return el;
}

export function setupGlobalDom(){
  (globalThis as any).ResizeObserver = class { observe(){} disconnect(){} } as any;
  (globalThis as any).setIcon = () => {};
  (globalThis as any).createDiv = (opts?: any)=> { const d=document.createElement('div'); if(opts?.cls) d.className=opts.cls; if(opts?.text) d.textContent=opts.text; return augment(d); };
  (globalThis as any).window = globalThis as any;
  (globalThis as any).window.moment = (_d?:any)=> ({ format: ()=> '2025-01-01'});
  if(!(globalThis as any).CSS) (globalThis as any).CSS = {};
  if(!(globalThis as any).CSS.escape) (globalThis as any).CSS.escape = (str:string)=> String(str).replace(/[^a-zA-Z0-9_\-]/g,'_');
}

export function makePluginWithFeed(fakeItemRaw: any, fakeFeed: any){
  const settings = { items: [ { name: 'Feed1', folder: 'Folder1', items: [fakeItemRaw] } ] as any[], feeds: [] as any[], filtered: [] as any[], folded: [] as any[], hotkeys: {}, updateTime: 0, autoSync:false };
  const counters = {
    globalUnread: () => settings.items.reduce((a:any,fc:any)=> a + fc.items.filter((i:any)=> i.read !== true).length,0),
    unreadByFolder: () => settings.items.reduce((map:any,fc:any)=> { const key = fc.folder.toLowerCase(); map[key]=(map[key]||0)+fc.items.filter((i:any)=> i.read !== true).length; return map; }, {}),
    unreadByFeed: () => settings.items.reduce((map:any,fc:any)=> { map[fc.name]=(map[fc.name]||0)+fc.items.filter((i:any)=> i.read !== true).length; return map; }, {}),
    favoriteCount: () => settings.items.reduce((a:any,fc:any)=> a + fc.items.filter((i:any)=> i.favorite === true).length,0),
  favoriteItems: () => settings.items.reduce((acc:any[], fc:any)=> { for(const it of fc.items){ if(it.favorite===true) acc.push(it);} return acc; }, [])
  };
  return {
    settings,
    providers: { getCurrent: (): any => ({ folders: async (): Promise<any[]> => [{ feeds: (): any[] => [fakeFeed], name: (): string => 'Folder1' }] }) },
    writeFeedContentDebounced: jest.fn((fn:Function)=> fn()),
    getItemByLink: jest.fn(()=> fakeItemRaw),
    writeFeedContent: jest.fn(),
    counters,
    itemStateService: { 
      toggleFavorite: jest.fn(async (wrapperOrRaw: any)=> { const raw = wrapperOrRaw.item? wrapperOrRaw.item: wrapperOrRaw; raw.favorite = !raw.favorite; document.dispatchEvent(new CustomEvent(RSS_EVENTS.FAVORITE_UPDATED,{detail:{link: raw.link, favorite: raw.favorite}})); return raw.favorite; }),
      toggleRead: jest.fn(async (wrapperOrRaw: any)=> { const raw = wrapperOrRaw.item? wrapperOrRaw.item: wrapperOrRaw; raw.read = !raw.read; document.dispatchEvent(new CustomEvent(RSS_EVENTS.ITEM_READ_UPDATED,{detail:{link: raw.link, read: raw.read}})); return raw.read; })
    },
    settingsManager: { writeFeedContentDebounced: jest.fn((fn:Function)=> fn()) },
  };
}
