import {ItemModal} from '../src/modals/ItemModal';
import { jest } from '@jest/globals';
jest.mock('@vanakat/plugin-api', () => ({ pluginApi: (): null => null }));

class FakeApp { workspace:any = { getLeavesOfType: (): any[] => [] }; plugins:any = { plugins: {} }; }
class FakePlugin { app:any = new FakeApp(); settings:any = { hotkeys:{}, dateFormat:'YYYY-MM-DD', displayMedia:false }; writeFeedContent=async()=>{}; }

class FakeItem {
  constructor(private raw:any){}
  title(){ return this.raw.title; }
  id(){ return this.raw.link; }
  body(){ return '<p>Body <strong>HTML</strong> content</p>'; }
  description(){ return '<p>Short desc</p>'; }
  author(){ return 'Author'; }
  pubDate(){ return new Date().toISOString(); }
  language(){ return 'en'; }
  tags(): any[]{ return []; }
  highlights(): any[]{ return []; }
  enclosureLink(): any { return null; }
  enclosureMime(){ return ''; }
  markRead(v:boolean){ this.raw.read = v; }
}

describe('ItemModal renders title, description excerpt and body', () => {
  beforeAll(()=> {
    (globalThis as any).window = (globalThis as any).window || {};
    (window as any).moment = (_date?: any) => ({ format: (_fmt: string)=> '2025-01-01' });
  });
  test('title, excerpt and body appear', async () => {
    const raw = { link:'y', title:'Title Y', read:false, favorite:false };
    const item = new FakeItem(raw) as any;
    const plugin:any = new FakePlugin();
    plugin.settings.items = [ { name:'Feed1', folder:'', items:[ raw ] } ];
    const modal = new ItemModal(plugin, item, [item], true);
    await modal.onOpen();

    const titleEl = (modal as any).contentEl.querySelector('h1.rss-title');
    expect(titleEl?.textContent).toBe('Title Y');

    const excerptEl = (modal as any).contentEl.querySelector('p.rss-excerpt');
    expect(excerptEl?.textContent?.toLowerCase()).toContain('short desc');

    const bodyEl = (modal as any).contentEl.querySelector('.rss-content');
    expect(bodyEl?.textContent).toContain('Body');
    expect(bodyEl?.textContent).toContain('content');
  });

  test('does not duplicate excerpt when description ~= body', async () => {
    const raw = { link:'z', title:'Title Z', read:false, favorite:false };
    // Same description and body (after stripping) -> excerpt should be skipped
    class SameItem extends FakeItem {
      body(){ return '<p>Same text</p>'; }
      description(){ return '<p>Same text</p>'; }
    }
    const item = new SameItem(raw) as any;
    const plugin:any = new FakePlugin();
    plugin.settings.items = [ { name:'Feed1', folder:'', items:[ raw ] } ];
    const modal = new ItemModal(plugin, item, [item], true);
    await modal.onOpen();
    const excerptEl = (modal as any).contentEl.querySelector('p.rss-excerpt');
    expect(excerptEl).toBeNull();
  });
});
