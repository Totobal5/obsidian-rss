import Action from '../src/actions/Action';
import {RSS_EVENTS} from '../src/events';
import {Notice} from 'obsidian';

// Minimal plugin + item stubs
class FakePlugin {
  settings: any = { items: [ { name: 'Feed', items: [ { link: 'a', read: false, favorite: false } ] } ] };
  providers: any = { getById: async () => ({ invalidateCache: () => {} }) };
  writeFeedContent(fn: any) { this.settings.items = fn(this.settings.items); return Promise.resolve(); }
}

class FakeItem {
  item: any;
  constructor(ref:any) { this.item = ref; }
  body() { return '<p>body</p>'; }
  setTags(){}
  tags(): any[] { return []; }
  markRead(v:boolean){ this.item.read = v; }
}

describe('Action READ & FAVORITE', () => {
  test('toggles read and dispatches events', async () => {
    const plugin = new FakePlugin();
    const it = new FakeItem(plugin.settings.items[0].items[0]);
    const fired: string[] = [];
    document.addEventListener(RSS_EVENTS.UNREAD_COUNTS_CHANGED, ()=> fired.push(RSS_EVENTS.UNREAD_COUNTS_CHANGED));
    document.addEventListener(RSS_EVENTS.ITEM_READ_UPDATED, ()=> fired.push(RSS_EVENTS.ITEM_READ_UPDATED));
    await Action.READ.processor(plugin as any, it as any);
    expect(plugin.settings.items[0].items[0].read).toBe(true);
    expect(fired).toContain(RSS_EVENTS.UNREAD_COUNTS_CHANGED);
    expect(fired).toContain(RSS_EVENTS.ITEM_READ_UPDATED);
  });

  test('toggles favorite and dispatches event', async () => {
    const plugin = new FakePlugin();
    const it = new FakeItem(plugin.settings.items[0].items[0]);
    const fired: string[] = [];
    document.addEventListener(RSS_EVENTS.FAVORITE_UPDATED, ()=> fired.push(RSS_EVENTS.FAVORITE_UPDATED));
    await Action.FAVORITE.processor(plugin as any, it as any);
    expect(plugin.settings.items[0].items[0].favorite).toBe(true);
    expect(fired).toContain(RSS_EVENTS.FAVORITE_UPDATED);
  });
});
