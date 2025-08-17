import {FeedUpdater} from '../src/services/FeedUpdater';
import {RSS_EVENTS} from '../src/events';

// We'll stub getFeedItems via jest manual mock by overriding global fetch-like behavior if needed.

class FakePlugin {
  settings: any = { feeds: [ { name:'Feed1', folder:'', url:'http://test', id:'1' } ], items: [] };
  providers: any = { getById: async ()=> ({ invalidateCache: ()=>{} }) };
  settingsManager = { writeFeedContent: async (fn: any)=> { this.settings.items = fn(); }, writeFeedContentDebounced: async ()=>{} };
  rebuildIndexes() {}
  async writeFeedContent(mut:any){ this.settings.items = mut(this.settings.items); }
}

// Mock rss parser getFeedItems
jest.mock('../src/parser/rssParser', () => ({
  getFeedItems: async () => ({ name:'Feed1', folder:'', title:'Title', description:'', image:'', link:'', items:[ { link:'a', title:'A', read:false } ] }),
  RssFeedContent: {} as any
}));

describe('FeedUpdater', () => {
  test('updateFeeds merges new feed items', async () => {
    const plugin:any = new FakePlugin();
    const updater = new FeedUpdater(plugin);
    await updater.updateFeeds();
    expect(plugin.settings.items.length).toBe(1);
    expect(plugin.settings.items[0].items.length).toBe(1);
  });
});
