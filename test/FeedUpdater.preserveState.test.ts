import { jest } from '@jest/globals';

class FakePlugin {
  settings: any = { feeds: [ { name:'Feed1', folder:'', url:'http://test', id:'1' } ], items: [ { name:'Feed1', folder:'', title:'Title', description:'', image:'', link:'', items:[ { link:'a', title:'A', read:true, favorite:true, created:false, visited:false, tags:[], highlights:[] } ] } ] };
  providers: any = { getById: async ()=> ({ invalidateCache: ()=>{} }) };
  settingsManager = { writeFeedContent: async (fn: any)=> { this.settings.items = fn(); }, writeFeedContentDebounced: async ()=>{} };
  rebuildIndexes() {}
  async writeFeedContent(mut:any){ this.settings.items = mut(this.settings.items); }
}

jest.unstable_mockModule('../src/parser/rssParser', () => ({
  getFeedItems: async () => ({ name:'Feed1', folder:'', title:'TitleNew', description:'', image:'', link:'', items:[ { link:'a', title:'A UPDATED', read:false, favorite:false, created:false, visited:false, tags:[], highlights:[] } ] })
}));

describe('FeedUpdater preserves item state', () => {
  test('read/favorite flags stay true after refresh', async () => {
    const { FeedUpdater } = await import('../src/services/FeedsManager');
    const plugin:any = new FakePlugin();
    const updater = new FeedUpdater(plugin);
    await updater.updateFeeds();
    expect(plugin.settings.items[0].items[0].read).toBe(true);
    expect(plugin.settings.items[0].items[0].favorite).toBe(true);
    expect(plugin.settings.items[0].title).toBe('TitleNew');
    expect(plugin.settings.items[0].items[0].title).toBe('A UPDATED');
  });
});
