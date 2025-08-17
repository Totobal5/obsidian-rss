import {ItemModal} from '../src/modals/ItemModal';
import Action from '../src/actions/Action';
jest.mock('@vanakat/plugin-api', () => ({ pluginApi: () => null }));

// Minimal DOM + plugin stubs
class FakeApp { workspace:any = { getLeavesOfType: (): any[] => [] }; plugins:any = { plugins: {} }; }
class FakePlugin {
  app:any = new FakeApp();
  settings:any = { hotkeys:{}, dateFormat:'YYYY-MM-DD', displayMedia:false };
  writeFeedContent = async ()=>{};
}

class FakeItem {
  constructor(private raw:any){}
  title(){ return this.raw.title; }
  id(){ return this.raw.link; }
  body(){ return '<p>Body</p>'; }
  description(){ return '<p>Desc</p>'; }
  author(){ return 'Author'; }
  pubDate(){ return new Date().toISOString(); }
  language(){ return 'en'; }
  tags(): any[]{ return []; }
  highlights(): any[]{ return []; }
  enclosureLink(): any { return null; }
  enclosureMime(){ return ''; }
  markRead(v:boolean){ this.raw.read = v; }
}

describe('ItemModal basic data wiring', () => {
  beforeAll(()=> {
    (globalThis as any).window = (globalThis as any).window || {};
    (window as any).moment = (_date?: any) => ({ format: (_fmt: string)=> '2025-01-01' });
  });
  test('modal initializes with item data and marks read when save=true', async () => {
    const raw = { link:'x', title:'Title X', read:false, favorite:false };
    const item = new FakeItem(raw) as any;
    const plugin:any = new FakePlugin();
    plugin.settings.items = [ { name:'Feed1', folder:'', items:[ raw ] } ];
    const modal = new ItemModal(plugin, item, [item], true);
    // call onOpen/display path
    await modal.onOpen();
    expect(raw.read).toBe(true); // auto-marked read
    // Ensure title was processed (h1 created)
  const h1 = (modal as any).contentEl.querySelector('h1.rss-title');
    expect(h1?.textContent).toBe('Title X');
  });
});
