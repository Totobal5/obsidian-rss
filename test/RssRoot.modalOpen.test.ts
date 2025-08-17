import { jest } from '@jest/globals';
import RssRoot from '../src/view/RssRoot.svelte';
jest.mock('@vanakat/plugin-api', () => ({ pluginApi: (): null => null }));

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
      favoriteCount: () => collectFavorites().length,
      globalUnread: () => settingsItems.reduce((a:number,s:any)=> a + s.items.filter((i:FeedItem)=> !i.read).length,0),
      feedUnread: (name:string) => {
        const s = settingsItems.find(si=> si.name === name);
        return s ? s.items.filter((i:FeedItem)=> !i.read).length : 0;
      },
      folderUnread: (folder:string) => settingsItems.filter(si=> (si.folder||'').trim().toLowerCase()===folder.trim().toLowerCase())
        .reduce((a:number,s:any)=> a + s.items.filter((i:FeedItem)=> !i.read).length,0)
    },
    providers: { getCurrent: () => ({ folders: async () => defs.map(fd => ({
      name: () => fd.folder,
      feeds: () => fd.feeds.map(feed => ({
        name: () => feed.name,
        link: () => '',
        items: () => feed.items
      }))
    })) }) },
    itemStateService: { toggleFavorite: (raw:FeedItem) => { raw.favorite = !raw.favorite; }, toggleRead: (raw:FeedItem) => { raw.read = !raw.read; } },
    writeFeedContentDebounced: (fn:Function) => fn()
  };
  return plugin;
}

describe('RssRoot modal open', () => {
  test('clicking an item opens ItemModal', async () => {
    const plugin = makePlugin([
      { folder:'Folder1', feeds:[ { name:'Feed1', items:[ { link:'a', title:'Alpha', read:false, favorite:false, pubDate: new Date().toISOString(), description:'<p>Alpha desc</p>' } ] } ] }
    ]);
    const target = document.createElement('div');
    document.body.appendChild(target);
  let opened = false;
  const handler = () => { opened = true; };
  document.addEventListener('rss-item-opened', handler, { once: true });
    new (RssRoot as any)({ target, props:{ plugin } });
    await new Promise(r=> setTimeout(r,0));
    const row = target.querySelector('.list-item-container');
    expect(row).toBeTruthy();
    (row as HTMLElement).click();
    await new Promise(r=> setTimeout(r,0));
  expect(opened).toBe(true);
  });
});
