import ViewLoader from '../src/view/ViewLoader';
import { jest } from '@jest/globals';
import {WorkspaceLeaf} from 'obsidian';
import {augment, setupGlobalDom, makePluginWithFeed} from './utils/dom';
import {RSS_EVENTS} from '../src/events';
jest.mock('@vanakat/plugin-api', () => ({ pluginApi: (): null => null }));

class FakeLeaf extends (WorkspaceLeaf as any) {}

// Legacy DOM-based UI test retired after Svelte migration (Option B). Keeping file so history remains; skip execution.
describe.skip('Mark-all buttons (retired)', () => {
  beforeAll(()=> { setupGlobalDom(); });

  function build(multiFeeds=false, multiFolders=false){
    const makeRaw = (id:number, folder='Folder1', feedName='Feed1') => ({ link: 'x'+id, title: 'Title '+id, content: 'Body', pubDate: new Date().toISOString(), read:false, favorite:false, folder, feed: feedName });
    const raw1 = makeRaw(1);
    const raw2 = makeRaw(2);
    const feed1: any = { name: ():string=> 'Feed1', link: ():string=> 'http://feed1', url: ():string=> 'http://feed1', items: ():any[]=> [
      { ...raw1, title: ():string=> raw1.title, body: ():string=> raw1.content, pubDate: ():string=> raw1.pubDate, read: ():boolean=> raw1.read, markRead: (v:boolean):void=> { raw1.read=v; } },
      { ...raw2, title: ():string=> raw2.title, body: ():string=> raw2.content, pubDate: ():string=> raw2.pubDate, read: ():boolean=> raw2.read, markRead: (v:boolean):void=> { raw2.read=v; } },
    ], favicon: ():string|null=> null, parsed: { items: [raw1, raw2] } };
    const feedsArr = [feed1];
    let extraFeedRaw; let feed2;
    if (multiFeeds){
      const r3 = makeRaw(3,'Folder1','Feed2'); extraFeedRaw=r3;
  feed2 = { name: ():string=> 'Feed2', link: ():string=> 'http://feed2', url: ():string=> 'http://feed2', items: ():any[]=> [ { ...r3, title: ():string=> r3.title, body: ():string=> r3.content, pubDate: ():string=> r3.pubDate, read: ():boolean=> r3.read, markRead: (v:boolean):void=> { r3.read=v; } } ], favicon: ():string|null=> null, parsed: { items: [r3] } };
      feedsArr.push(feed2 as any);
    }
    const plugin = makePluginWithFeed(raw1, feed1); // base util gives settings + provider
    // inject items for feed2 if needed
    if (multiFeeds){
      plugin.settings.items.push({
        subtitle:'', title:'', name:'Feed2', link:'http://feed2', image:'', folder:'Folder1', description:'', language:'', hash:'', items: feed2.parsed.items
      });
    }
    // adjust provider folders() to return folder object consistent with multi feeds
    plugin.providers.getCurrent = () => ({ folders: async () => [{ name: ()=> 'Folder1', feeds: ()=> feedsArr }] });
    return {plugin, feed1, feed2, raw1, raw2, extraFeedRaw};
  }

  function mount(plugin:any){
    const leaf = new FakeLeaf();
    const view = new ViewLoader(leaf as any, plugin as any);
    const container = augment(document.createElement('div'));
    document.body.appendChild(container);
    ;(view as any).containerEl = {children:[document.createElement('div'), container]};
    ;(view as any).addAction = jest.fn();
    return {view, container};
  }

  test.skip('folder mark-all marks every item in folder and persists', async () => {
    const {plugin, raw1, raw2} = build(true); // two feeds
    const {view, container} = mount(plugin);
    await (view as any).onOpen();
    const folderBtn = container.querySelector('.rss-folder-header .rss-mark-folder') as HTMLElement;
    expect(folderBtn).toBeTruthy();
    folderBtn.click();
    await new Promise(r=> setTimeout(r, 10));
    expect(raw1.read).toBe(true);
    expect(raw2.read).toBe(true);
    // Ensure persisted settings items all marked
    for (const fc of plugin.settings.items){
      for (const it of fc.items) expect(it.read).toBe(true);
    }
  });

  test.skip('feed mark-all marks just that feed\'s items', async () => {
    const {plugin, raw1, raw2} = build(true);
    const {view, container} = mount(plugin);
    await (view as any).onOpen();
    const feedButtons = Array.from(container.querySelectorAll('.rss-feed-header .rss-mark-feed')) as HTMLElement[];
    expect(feedButtons.length).toBeGreaterThanOrEqual(2); // feed1 + feed2
    // Mark only first feed
    feedButtons[0].click();
    await new Promise(r=> setTimeout(r, 10));
    expect(raw1.read).toBe(true);
    expect(raw2.read).toBe(true); // both items in feed1
    // Reset another feed unmarked check? (in this simple setup second feed has one item tracked in settings)
    const secondFeedRawItems = plugin.settings.items.find(f=> f.name==='Feed2').items;
    for (const it of secondFeedRawItems){ expect(it.read).toBe(false); }
  });

  test.skip('favorites and all feeds do not show mark buttons', async () => {
    const {plugin} = build();
    const {view, container} = mount(plugin);
    await (view as any).onOpen();
    const favHas = container.querySelector('.rss-favorites-button .rss-mark-feed, .rss-favorites-button .rss-mark-folder');
    const allHas = container.querySelector('.rss-all-feeds-button .rss-mark-feed, .rss-all-feeds-button .rss-mark-folder');
    expect(favHas).toBeFalsy();
    expect(allHas).toBeFalsy();
  });
});
