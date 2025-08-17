import {ItemModal} from '../src/modals/ItemModal';
import { jest } from '@jest/globals';
jest.mock('@vanakat/plugin-api', () => ({ pluginApi: (): null => null }));

class FakeApp { workspace:any = { getLeavesOfType: (): any[] => [] }; plugins:any = { plugins: {} }; }
class FakePlugin { app:any = new FakeApp(); settings:any = { hotkeys:{}, dateFormat:'YYYY-MM-DD', displayMedia:false, autoMarkOnOpen:false }; writeFeedContent=async()=>{}; }

class ContentItem {
  constructor(private raw:any){}
  title(){ return this.raw.title; }
  id(){ return this.raw.link; }
  // no body(); plugin should use content field
  content(){ return '<p><strong>Main</strong> <em>HTML</em> body from content field.</p>'; }
  description(){ return '<p>Intro snippet separate</p>'; }
  author(){ return 'AuthorX'; }
  pubDate(){ return new Date().toISOString(); }
  language(){ return 'en'; }
  tags(){ return []; }
  highlights(){ return []; }
  markRead(v:boolean){ this.raw.read = v; }
}

describe('ItemModal content field fallback', () => {
  beforeAll(()=> { (globalThis as any).window = (globalThis as any).window || {}; (window as any).moment = ()=> ({ format: ()=> '2025-01-01'}); });
  test('uses content() as body when body() missing and description distinct shows excerpt', async () => {
    const raw = { link:'c-field', title:'HasContent', read:false, favorite:false };
    const item:any = new ContentItem(raw);
    const plugin:any = new FakePlugin();
    plugin.settings.items = [ { name:'FeedC', folder:'', items:[ raw ] } ];
    const modal = new ItemModal(plugin, item, [item], true);
    await modal.onOpen();

    const bodyEl = (modal as any).contentEl.querySelector('.rss-content');
    expect(bodyEl?.textContent).toContain('Main');
    const excerptEl = (modal as any).contentEl.querySelector('p.rss-excerpt');
    expect(excerptEl?.textContent?.toLowerCase()).toContain('intro snippet');
  });
});
