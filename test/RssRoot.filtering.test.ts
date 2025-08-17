import RssRoot from '../src/view/RssRoot.svelte';

interface FeedItem { link:string; title:string; read:boolean; favorite:boolean; pubDate:string; }
interface FeedDef { folder:string; feeds:{ name:string; items:FeedItem[] }[] }

function makePlugin(defs: FeedDef[]) {
  const settingsItems: any[] = [];
  for (const fd of defs) for (const feed of fd.feeds) settingsItems.push({ subtitle:'', title:feed.name, name:feed.name, link:feed.name, image:'', folder:fd.folder, description:'', language:'', hash:'', items:feed.items });
  const plugin: any = {
    settings: { items: settingsItems },
    counters: {
      favoriteItems: () => settingsItems.flatMap(s=> s.items.filter((i:FeedItem)=> i.favorite)),
      favoriteCount: () => settingsItems.reduce((a,s)=> a + s.items.filter((i:FeedItem)=> i.favorite).length,0),
      globalUnread: () => settingsItems.reduce((a,s)=> a + s.items.filter((i:FeedItem)=> !i.read).length,0),
      feedUnread: (name:string) => {
        const fc = settingsItems.find(s=> s.name === name);
        return fc ? fc.items.filter((i:FeedItem)=> !i.read).length : 0;
      },
      folderUnread: (folder:string) => settingsItems.filter(s=> (s.folder||'').trim().toLowerCase()===folder.trim().toLowerCase())
        .reduce((a,s)=> a + s.items.filter((i:FeedItem)=> !i.read).length,0)
    },
    providers: { getCurrent: () => ({ folders: async () => defs.map(fd => ({
      name: () => fd.folder,
      feeds: () => fd.feeds.map(f => ({ name: () => f.name, link: () => f.name, items: () => f.items }))
    })) }) },
    itemStateService: { toggleFavorite: (raw:FeedItem)=> raw.favorite = !raw.favorite, toggleRead: (raw:FeedItem)=> raw.read = !raw.read },
    writeFeedContentDebounced: (fn:Function)=> fn(),
    updateFeeds: async () => {}
  };
  return plugin;
}

function mount(plugin:any){
  const target = document.createElement('div');
  document.body.appendChild(target);
  new (RssRoot as any)({ target, props:{ plugin } });
  return target;
}

describe('RssRoot filtering', () => {
  test('clicking a folder shows only its feeds items', async () => {
    const now = new Date().toISOString();
    const plugin = makePlugin([
      { folder:'FolderA', feeds:[ { name:'Feed1', items:[ { link:'a1', title:'A1', read:false, favorite:false, pubDate:now }, { link:'a2', title:'A2', read:false, favorite:false, pubDate:now } ] } ] },
      { folder:'FolderB', feeds:[ { name:'Feed2', items:[ { link:'b1', title:'B1', read:false, favorite:false, pubDate:now } ] } ] }
    ]);
    const target = mount(plugin);
    await new Promise(r=> setTimeout(r,0));
    // initial: all feeds (3 items)
  const initialItems = target.querySelectorAll('.rss-fr-list .list-item-container');
  expect(initialItems.length).toBe(3);
    // Click folder A header
    const folderButtons = target.querySelectorAll('.rss-folder-header');
    (folderButtons[0] as HTMLButtonElement).click();
    await new Promise(r=> setTimeout(r,0));
    // Now only 2 items from Feed1
  const itemTitles = Array.from(target.querySelectorAll('.list-item-title')).map(e=> e.textContent?.trim());
    expect(itemTitles.length).toBe(2);
    expect(itemTitles.every(t=> t?.startsWith('A'))).toBe(true);
  });

  test('clicking a feed shows only that feed items', async () => {
    const now = new Date().toISOString();
    const plugin = makePlugin([
      { folder:'FolderA', feeds:[ { name:'Feed1', items:[ { link:'a1', title:'A1', read:false, favorite:false, pubDate:now } ] }, { name:'Feed2', items:[ { link:'a2', title:'A2', read:false, favorite:false, pubDate:now } ] } ] }
    ]);
    const target = mount(plugin);
    await new Promise(r=> setTimeout(r,0));
    // Click first folder to focus (shows both its feeds) then feed2 header
    const folderButtons = target.querySelectorAll('.rss-folder-header');
    (folderButtons[0] as HTMLButtonElement).click();
    await new Promise(r=> setTimeout(r,0));
    const feedHeaders = target.querySelectorAll('.rss-feed-header');
    // Click second feed
    (feedHeaders[1] as HTMLButtonElement).click();
    await new Promise(r=> setTimeout(r,0));
  const itemTitles = Array.from(target.querySelectorAll('.list-item-title')).map(e=> e.textContent?.trim());
    expect(itemTitles.length).toBe(1);
    expect(itemTitles[0]).toBe('A2');
  });
});
