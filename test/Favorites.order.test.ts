import RssRoot from '../src/view/RssRoot.svelte';

function makePlugin(favs: { offsetMs:number; id:string; }[]) {
  const now = Date.now();
  const items = favs.map(f=> ({ link:f.id, title:f.id, favorite:true, read:false, pubDate: new Date(now + f.offsetMs).toISOString(), pubDateMs: now + f.offsetMs }));
  const settingsItems: any[] = [ { name:'Feed1', folder:'FolderA', items } ];
  const plugin: any = {
    settings: { items: settingsItems },
    counters: undefined, // so RssRoot creates CountersService instance
    providers: { getCurrent: () => ({ folders: async () => [{ name: () => 'FolderA', feeds: () => [{ name: () => 'Feed1', link: () => 'Feed1', items: () => settingsItems[0].items }] }] }) },
    itemStateService: { toggleFavorite: (it:any)=> { it.favorite = !it.favorite; }, toggleRead: ()=>{} },
    writeFeedContentDebounced: (fn:Function)=> fn(),
    updateFeeds: async()=>{}
  };
  return plugin;
}

describe('Favorites ordering matches main (desc by time)', () => {
  test('favorites newest first via CountersService', async () => {
    const plugin = makePlugin([
      { offsetMs: -1000 * 60 * 60 * 4, id:'old-4h' },
      { offsetMs: -1000 * 60 * 20, id:'recent-20m' },
      { offsetMs: -1000 * 60 * 5, id:'mid-5m' },
    ]);
    const target = document.createElement('div');
    document.body.appendChild(target);
    new (RssRoot as any)({ target, props:{ plugin } });
    await new Promise(r=> setTimeout(r,0));
    const counters = (plugin as any).counters;
    const favs = counters.favoriteItems().map((i:any)=> i.title);
    expect(favs[0]).toBe('mid-5m');
    expect(favs[1]).toBe('recent-20m');
    expect(favs[2]).toBe('old-4h');
  });
});
