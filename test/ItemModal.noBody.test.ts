import {ItemModal} from '../src/modals/ItemModal';
import { jest } from '@jest/globals';
jest.mock('@vanakat/plugin-api', () => ({ pluginApi: (): null => null }));

class FakeApp { workspace:any = { getLeavesOfType: (): any[] => [] }; plugins:any = { plugins: {} }; }
class FakePlugin { app:any = new FakeApp(); settings:any = { hotkeys:{}, dateFormat:'YYYY-MM-DD', displayMedia:false }; writeFeedContent=async()=>{}; }

class DescOnlyItem {
  constructor(private raw:any){}
  title(){ return this.raw.title; }
  id(){ return this.raw.link; }
  // body() intentionally missing
  description(){ return '<p>Only description text <em>here</em></p>'; }
  author(){ return 'Auth'; }
  pubDate(){ return new Date().toISOString(); }
  language(){ return 'en'; }
  tags(){ return []; }
  highlights(){ return []; }
  markRead(v:boolean){ this.raw.read = v; }
}

describe('ItemModal fallback body=description', () => {
  beforeAll(()=> { (globalThis as any).window = (globalThis as any).window || {}; (window as any).moment = ()=> ({ format: ()=> '2025-01-01'}); });
  test('renders description as body when body missing and no duplicate excerpt', async () => {
    const raw = { link:'d1', title:'DescOnly', read:false, favorite:false };
    const item:any = new DescOnlyItem(raw);
    const plugin:any = new FakePlugin();
    plugin.settings.items = [ { name:'FeedX', folder:'', items:[ raw ] } ];
    const modal = new ItemModal(plugin, item, [item], true);
    await modal.onOpen();
    const bodyEl = (modal as any).contentEl.querySelector('.rss-content');
    expect(bodyEl?.textContent).toContain('Only description text');
    const excerptEl = (modal as any).contentEl.querySelector('p.rss-excerpt');
    // Si body == description el excerpt no debe estar
    expect(excerptEl).toBeNull();
  });
});
