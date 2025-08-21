import {ItemStateService} from '../src/services/ItemStateService';
import {RSS_EVENTS} from '../src/events';

class FakePlugin {
  settings: any = { items: [ { name:'Feed', folder:'', items:[ { link:'l1', read:false, favorite:false, title:'t' } ] } ] };
  async writeFeedContentDebounced(mut:(items:any[])=>void){
    mut(this.settings.items);
  }
}

describe('ItemStateService', () => {
  test('toggleRead updates item and dispatches events', async () => {
    const plugin:any = new FakePlugin();
    const svc = new ItemStateService(plugin);
    const fired:string[] = [];
    document.addEventListener(RSS_EVENTS.ITEM_READ_UPDATED, ()=> fired.push(RSS_EVENTS.ITEM_READ_UPDATED));
    document.addEventListener(RSS_EVENTS.UNREAD_COUNTS_CHANGED, ()=> fired.push(RSS_EVENTS.UNREAD_COUNTS_CHANGED));
    const raw = plugin.settings.items[0].items[0];
    const item:any = { 
      url: () => raw.link,
      read: () => raw.read,
      starred: () => raw.favorite
    };
    const newState = await svc.toggleRead(item);
    expect(newState).toBe(true);
    expect(raw.read).toBe(true);
    expect(fired).toContain(RSS_EVENTS.ITEM_READ_UPDATED);
    expect(fired).toContain(RSS_EVENTS.UNREAD_COUNTS_CHANGED);
  });

  test('toggleFavorite updates item and dispatches event', async () => {
    const plugin:any = new FakePlugin();
    const svc = new ItemStateService(plugin);
    const fired:string[] = [];
    document.addEventListener(RSS_EVENTS.FAVORITE_UPDATED, ()=> fired.push(RSS_EVENTS.FAVORITE_UPDATED));
    const raw = plugin.settings.items[0].items[0];
    const item:any = { 
      url: () => raw.link,
      read: () => raw.read,
      starred: () => raw.favorite
    };
    const fav = await svc.toggleFavorite(item);
    expect(fav).toBe(true);
    expect(raw.favorite).toBe(true);
    expect(fired).toContain(RSS_EVENTS.FAVORITE_UPDATED);
  });
});
