import { jest } from '@jest/globals';
import RssRoot from '../src/view/RssRoot.svelte';

interface FeedItem { link: string; title: string; read: boolean; favorite: boolean; pubDate: string; description?: string; }
interface FeedDef { folder: string; feeds: { name: string; items: FeedItem[] }[] }

function makePlugin(defs: FeedDef[]) {
  const settingsItems: any[] = [];
  for (const fd of defs) {
    for (const feed of fd.feeds) {
      settingsItems.push({ subtitle:'', title: feed.name, name: feed.name, link:'', image:'', folder: fd.folder, description:'', language:'', hash:'', items: feed.items });
    }
  }
  function collectFavorites(){
    const out: any[] = [];
    for (const s of settingsItems) for (const it of s.items) if (it.favorite) out.push(it);
    return out;
  }
  const plugin: any = {
    settings: { items: settingsItems },
    counters: {
      favoriteItems: () => collectFavorites(),
      globalUnread: () => settingsItems.reduce((a:number,s:any)=> a + s.items.filter((i:FeedItem)=> !i.read).length,0)
    },
    providers: { getCurrent: () => ({ folders: async () => defs.map(fd => ({
      name: () => fd.folder,
      feeds: () => fd.feeds.map(feed => ({
        name: () => feed.name,
        link: () => '',
        // Return original item objects so toggling updates counters source
        items: () => feed.items
      }))
    })) }) },
    itemStateService: { toggleFavorite: (raw:FeedItem) => { raw.favorite = !raw.favorite; }, toggleRead: (raw:FeedItem) => { raw.read = !raw.read; } },
    writeFeedContentDebounced: (fn:Function) => fn()
  };
  return plugin;
}

describe('RssRoot interactions', () => {
  test('mark feed as read marks items & updates unread count', async () => {
    const plugin = makePlugin([
      { folder:'Folder1', feeds:[ { name:'Feed1', items:[ { link:'a', title:'Alpha', read:false, favorite:false, pubDate: new Date().toISOString() } ] } ] }
    ]);
    const target = document.createElement('div');
    document.body.appendChild(target);
    new (RssRoot as any)({ target, props:{ plugin } });
    // Wait microtask for onMount
    await new Promise(r=> setTimeout(r,0));
    const badge = target.querySelector('.rss-item-count-badge');
    expect(badge?.textContent).toBe('1');
    (target.querySelector('.rss-mark-feed') as HTMLElement).click();
    await new Promise(r=> setTimeout(r,0));
    expect(plugin.settings.items[0].items[0].read).toBe(true);
  });

  test('favorite toggle updates star and favorites counter', async () => {
    const plugin = makePlugin([
      { folder:'Folder1', feeds:[ { name:'Feed1', items:[ { link:'a', title:'Alpha', read:false, favorite:false, pubDate: new Date().toISOString() } ] } ] }
    ]);
    const target = document.createElement('div');
    document.body.appendChild(target);
    new (RssRoot as any)({ target, props:{ plugin } });
    await new Promise(r=> setTimeout(r,0));
    const favBtn = target.querySelector('.rss-favorites-button span:last-child');
    expect(favBtn?.textContent).toContain('(0)');
  (target.querySelector('.rss-fr-star') as HTMLElement).click();
    await new Promise(r=> setTimeout(r,0));
    expect(favBtn?.textContent).toContain('(1)');
  });
});
