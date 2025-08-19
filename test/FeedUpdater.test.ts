import { jest } from '@jest/globals';

class FakePlugin {
  settings: any = { feeds: [ { name:'Feed1', folder:'', url:'http://test', id:'1' } ], items: [] };
  providers: any = { getById: async ()=> ({ invalidateCache: ()=>{} }) };
  settingsManager = { writeFeedContent: async (fn: any)=> { this.settings.items = fn(); }, writeFeedContentDebounced: async ()=>{} };
  rebuildIndexes() {}
  async writeFeedContent(mut:any){ this.settings.items = mut(this.settings.items); }
}

// ESM mocking: register mock before importing module under test
jest.unstable_mockModule('../src/parser/rssParser', () => ({
  getFeedItems: async () => ({ name:'Feed1', folder:'', title:'Title', description:'', image:'', link:'', items:[ { link:'a', title:'A', read:false } ] })
}));

describe('FeedUpdater', () => {
  test('updateFeeds merges new feed items', async () => {
    const { FeedUpdater } = await import('../src/services/FeedsManager');
    const plugin:any = new FakePlugin();
    const updater = new FeedUpdater(plugin);
    await updater.updateFeeds();
    expect(plugin.settings.items.length).toBe(1);
    expect(plugin.settings.items[0].items.length).toBe(1);
  });
});
