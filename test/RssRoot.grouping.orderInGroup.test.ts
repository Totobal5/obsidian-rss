import RssRoot from '../src/view/RssRoot.svelte';

function makePlugin(times: { offsetMs:number; id:string;}[]) {
  const now = Date.now();
  const settingsItems: any[] = [ {
    subtitle:'', title:'Feed1', name:'Feed1', link:'Feed1', image:'', folder:'FolderA', description:'', language:'', hash:'',
    items: times.map(t => ({ link:t.id, title:t.id, read:false, favorite:false, pubDate: new Date(now + t.offsetMs).toISOString(), pubDateMs: now + t.offsetMs }))
  }];
  const plugin: any = {
    settings: { items: settingsItems },
    counters: { favoriteItems: () => [], favoriteCount: () => 0, globalUnread: () => settingsItems[0].items.length, feedUnread: () => settingsItems[0].items.length, folderUnread: () => settingsItems[0].items.length, unreadByFeed: () => ({ Feed1: settingsItems[0].items.length }), unreadByFolder: () => ({ 'foldera': settingsItems[0].items.length }) },
    providers: { getCurrent: () => ({ folders: async () => [{ name: () => 'FolderA', feeds: () => [{ name: () => 'Feed1', link: () => 'Feed1', items: () => settingsItems[0].items }] }] }) },
    itemStateService: { toggleFavorite: ()=>{}, toggleRead: ()=>{} },
    writeFeedContentDebounced: (fn:Function)=> fn(),
  };
  return plugin;
}

describe('RssRoot ordering inside group (desc by time)', () => {
  test('newest first inside Today group', async () => {
    const plugin = makePlugin([
      { offsetMs: - 1000 * 60 * 60 * 5, id:'older-5h' },
      { offsetMs: - 1000 * 60 * 60 * 1, id:'recent-1h' },
      { offsetMs: - 1000 * 60 * 30, id:'latest-30m' },
    ]);
    const target = document.createElement('div');
    document.body.appendChild(target);
    new (RssRoot as any)({ target, props:{ plugin } });
    await new Promise(r=> setTimeout(r,0));
    // Capturar todos los nodos dentro de la lista
    const container = target.querySelector('.rss-fr-list');
    const nodes = Array.from(container?.children || []);
    // Ubicar primer header y recopilar items hasta siguiente header
    const firstHeaderIndex = nodes.findIndex(n => n.classList.contains('rss-fr-group-header'));
    const firstGroupItems: Element[] = [];
    for (let i = firstHeaderIndex + 1; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.classList.contains('rss-fr-group-header')) break;
      firstGroupItems.push(n);
    }
    const ids = firstGroupItems.map(el=> (el as HTMLElement).querySelector('.list-item-title')?.textContent || '');
    expect(ids[0]).toContain('latest-30m');
    expect(ids[1]).toContain('recent-1h');
    expect(ids[2]).toContain('older-5h');
  });
});
