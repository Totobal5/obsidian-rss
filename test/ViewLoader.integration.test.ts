import ViewLoader from '../src/view/ViewLoader';
import {WorkspaceLeaf} from 'obsidian';
jest.mock('@vanakat/plugin-api', () => ({ pluginApi: () => null }));

class FakeLeaf extends (WorkspaceLeaf as any) {}

function augment(el: any){
  el.empty = function(){ while(this.firstChild) this.removeChild(this.firstChild);} ;
  el.addClass = function(c:string){ this.classList.add(c);} ;
  el.removeClass = function(c:string){ this.classList.remove(c);} ;
  el.toggleClass = function(c:string,v?:boolean){ if(v===false) this.classList.remove(c); else this.classList.add(c);} ;
  el.setText = function(t:string){ this.textContent = t; };
  el.createDiv = function(opts?: any){ const d=document.createElement('div'); if(opts?.cls) d.className=opts.cls; if(opts?.text) d.textContent=opts.text; augment(d); this.appendChild(d); return d;};
  el.createSpan = function(opts?: any){ const s=document.createElement('span'); if(typeof opts==='string') s.className=opts; else if(opts?.cls) s.className=opts.cls; if(opts?.text) s.textContent=opts.text; (s as any).addClass=(c:string)=> s.classList.add(c); (s as any).toggleClass=(c:string,v?:boolean)=>{ if(v===false) s.classList.remove(c); else s.classList.add(c); }; this.appendChild(s); return s; };
  el.createEl = function(tag:string, opts?: any){ const n=document.createElement(tag); if(typeof opts==='string') n.className=opts; else if(opts?.cls) n.className=opts.cls; if(opts?.text) n.textContent=opts.text; augment(n); if(opts?.attr){ for(const k in opts.attr){ if(Object.prototype.hasOwnProperty.call(opts.attr,k)) n.setAttribute(k,String(opts.attr[k])); } } this.appendChild(n); return n; };
  return el;
}

function makePlugin(fakeItemRaw: any, fakeFeed: any){
  return {
    settings: { items: [ { name: 'Feed1', folder: 'Folder1', items: [fakeItemRaw] } ] as any[], feeds: [] as any[], filtered: [] as any[], folded: [] as any[], hotkeys: {}, updateTime: 0, autoSync:false },
    providers: { getCurrent: (): any => ({ folders: async (): Promise<any[]> => [{ feeds: (): any[] => [fakeFeed], name: (): string => 'Folder1' }] }) },
    writeFeedContentDebounced: jest.fn((fn:Function)=> fn()),
    getItemByLink: jest.fn(()=> fakeItemRaw),
    writeFeedContent: jest.fn(),
    itemStateService: { toggleFavorite: jest.fn(), toggleRead: jest.fn() },
    settingsManager: { writeFeedContentDebounced: jest.fn((fn:Function)=> fn()) },
  };
}

describe('ViewLoader integration', () => {
  beforeAll(()=> {
    (globalThis as any).ResizeObserver = class { observe(){} disconnect(){} } as any;
    (globalThis as any).setIcon = () => {};
    (globalThis as any).createDiv = (opts?: any)=> { const d=document.createElement('div'); if(opts?.cls) d.className=opts.cls; if(opts?.text) d.textContent=opts.text; return augment(d); };
    (globalThis as any).window = globalThis as any;
    (globalThis as any).window.moment = (_d?:any)=> ({ format: ()=> '2025-01-01'});
  });

  it('marks item read when row clicked', async () => {
    const fakeItemRaw = { link: 'x', title: 'X', content: 'Body', pubDate: new Date().toISOString(), read:false, favorite:false };
    const fakeFeed = { name: (): string => 'Feed1', items: (): any[] => [{ ...fakeItemRaw, title: (): string => fakeItemRaw.title, body: (): string => fakeItemRaw.content, pubDate: (): string => fakeItemRaw.pubDate, read: (): boolean => fakeItemRaw.read, markRead: (v:boolean): void => { fakeItemRaw.read=v; } }], favicon: (): string|null => null };
    const plugin = makePlugin(fakeItemRaw, fakeFeed);
    const leaf = new FakeLeaf();
    const view = new ViewLoader(leaf as any, plugin as any);
    const viewContent = augment(document.createElement('div'));
    document.body.appendChild(viewContent);
    (view as any).containerEl = { children: [document.createElement('div'), viewContent] };
    (view as any).addAction = jest.fn();
    await (view as any).onOpen();

    const row = viewContent.querySelector('.rss-fr-row-article') as HTMLElement;
    expect(row).toBeTruthy();
    row.click();
    expect(fakeItemRaw.read).toBe(true);
  });
});
