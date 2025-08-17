import RssRoot from '../src/view/RssRoot.svelte';

interface FeedItem { link:string; title:string; read:boolean; favorite:boolean; pubDate:string; }

function makePlugin(itemsPerDay: {dayOffset:number; id:string;}[]) {
  const now = Date.now();
  const settingsItems: any[] = [ {
    subtitle:'', title:'Feed1', name:'Feed1', link:'Feed1', image:'', folder:'FolderA', description:'', language:'', hash:'',
    items: itemsPerDay.map(d => ({ link:d.id, title:d.id, read:false, favorite:false, pubDate: new Date(now - d.dayOffset*86400000 + (1000*itemsPerDay.indexOf(d))).toISOString() }))
  }];
  const plugin: any = {
    settings: { items: settingsItems },
    counters: {
      favoriteItems: () => [], favoriteCount: () => 0,
      globalUnread: () => settingsItems[0].items.length,
      feedUnread: () => settingsItems[0].items.length,
      folderUnread: () => settingsItems[0].items.length,
      unreadByFeed: () => ({ Feed1: settingsItems[0].items.length }),
      unreadByFolder: () => ({ 'foldera': settingsItems[0].items.length })
    },
    providers: { getCurrent: () => ({ folders: async () => [{ name: () => 'FolderA', feeds: () => [{ name: () => 'Feed1', link: () => 'Feed1', items: () => settingsItems[0].items }] }] }) },
    itemStateService: { toggleFavorite: ()=>{}, toggleRead: ()=>{} },
    writeFeedContentDebounced: (fn:Function)=> fn(),
  };
  return plugin;
}

describe('RssRoot grouping order', () => {
  test('today group appears first, yesterday second, older last', async () => {
    const plugin = makePlugin([
      { dayOffset:0, id:'today-1' },
      { dayOffset:1, id:'yesterday-1' },
      { dayOffset:2, id:'older-1' }
    ]);
    const target = document.createElement('div');
    document.body.appendChild(target);
    new (RssRoot as any)({ target, props:{ plugin } });
    await new Promise(r=> setTimeout(r,0));
    const headers = Array.from(target.querySelectorAll('.rss-fr-group-header')).map(h=> h.textContent?.toLowerCase() || '');
    // Expect first contains today or hoy
    expect(headers[0]).toMatch(/today|hoy/);
    // Expect second contains yesterday or ayer
    expect(headers[1]).toMatch(/yesterday|ayer/);
    // Last should not contain today/yesterday and be different
    expect(headers[2]).not.toMatch(/today|hoy|yesterday|ayer/);
  });
});
