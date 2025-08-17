import { jest } from '@jest/globals';
import RssRoot from '../src/view/RssRoot.svelte';
import { RSS_EVENTS } from '../src/events';

interface RawItem { link:string; title:string; read:boolean; favorite:boolean; pubDate:string; folder:string; feed:string; }
interface FeedSpec { folder:string; name:string; items: RawItem[]; }

function makePlugin(feeds: FeedSpec[]) {
  // settings.items groups by feed (legacy shape)
  const settingsItems: any[] = feeds.map(f => ({
    subtitle:'', title:f.name, name:f.name, link:'', image:'', folder:f.folder, description:'', language:'', hash:'', items: f.items
  }));
  const plugin: any = {
    settings: { items: settingsItems },
    counters: {
      // Avoid Array.flatMap to stay within es2015 lib
      favoriteItems: () => ([] as RawItem[]).concat.apply([], settingsItems.map(s => s.items.filter((i:RawItem)=> i.favorite))),
      globalUnread: () => settingsItems.reduce((a,s)=> a + s.items.filter((i:RawItem)=> !i.read).length,0)
    },
    providers: { getCurrent: () => ({ folders: async () => {
      const grouped: Record<string, FeedSpec[]> = {};
      feeds.forEach(f => { grouped[f.folder] = grouped[f.folder] || []; grouped[f.folder].push(f); });
      return Object.entries(grouped).map(([folder, list]) => ({
        name: () => folder,
        feeds: () => list.map(fs => ({
          name: () => fs.name,
          link: () => '',
          items: () => fs.items
        }))
      }));
    } }) },
    itemStateService: { toggleFavorite: (raw:RawItem)=> raw.favorite = !raw.favorite, toggleRead: (raw:RawItem)=> raw.read = !raw.read },
    writeFeedContentDebounced: (fn:Function)=> fn()
  };
  return plugin;
}

function mount(plugin:any){
  const target = document.createElement('div');
  document.body.appendChild(target);
  new (RssRoot as any)({ target, props:{ plugin } });
  return target;
}

describe('RssRoot mark-all actions', () => {
  test('global mark-all marks every item read and emits FEED_MARK_ALL with all links', async () => {
    const now = new Date().toISOString();
    const feeds = [
      { folder:'F1', name:'Feed1', items:[ { link:'l1', title:'A', read:false, favorite:false, pubDate:now, folder:'F1', feed:'Feed1' } ] },
      { folder:'F2', name:'Feed2', items:[ { link:'l2', title:'B', read:false, favorite:false, pubDate:now, folder:'F2', feed:'Feed2' }, { link:'l3', title:'C', read:false, favorite:false, pubDate:now, folder:'F2', feed:'Feed2' } ] }
    ];
    const plugin = makePlugin(feeds);
    const target = mount(plugin);
    await new Promise(r=> setTimeout(r,0));
    const events: any[] = [];
    document.addEventListener(RSS_EVENTS.FEED_MARK_ALL as string, (e:any)=> events.push(e.detail));
    (target.querySelector('.rss-mark-all-global') as HTMLButtonElement).click();
    await new Promise(r=> setTimeout(r,0));
    // all items read
    expect(plugin.settings.items.every((s:any)=> s.items.every((i:RawItem)=> i.read))).toBe(true);
    expect(events.length).toBe(1);
    const detail = events[0];
    expect(detail.scope).toBe('global');
    expect(detail.links.sort()).toEqual(['l1','l2','l3']);
  });

  test('folder mark-all only marks that folder and emits FEED_MARK_FOLDER', async () => {
    const now = new Date().toISOString();
    const feeds = [
      { folder:'F1', name:'Feed1', items:[ { link:'l1', title:'A', read:false, favorite:false, pubDate:now, folder:'F1', feed:'Feed1' }, { link:'l2', title:'B', read:false, favorite:false, pubDate:now, folder:'F1', feed:'Feed1' } ] },
      { folder:'F2', name:'Feed2', items:[ { link:'l3', title:'C', read:false, favorite:false, pubDate:now, folder:'F2', feed:'Feed2' } ] }
    ];
    const plugin = makePlugin(feeds);
    const target = mount(plugin);
    await new Promise(r=> setTimeout(r,0));
    const folderEvents: any[] = [];
    document.addEventListener(RSS_EVENTS.FEED_MARK_FOLDER as string, (e:any)=> folderEvents.push(e.detail));
    // Click first folder's mark button
    (target.querySelector('.rss-folder-wrapper .rss-mark-folder') as HTMLButtonElement).click();
    await new Promise(r=> setTimeout(r,0));
    // Folder F1 items read
    const f1Items = plugin.settings.items.filter((s:any)=> s.folder==='F1').flatMap((s:any)=> s.items);
    const f2Items = plugin.settings.items.filter((s:any)=> s.folder==='F2').flatMap((s:any)=> s.items);
    expect(f1Items.every((i:RawItem)=> i.read)).toBe(true);
    expect(f2Items.every((i:RawItem)=> i.read)).toBe(false);
    expect(folderEvents.length).toBe(1);
    const detail = folderEvents[0];
    expect(detail.scope).toBe('folder');
    expect(detail.name).toBe('F1');
    expect(detail.links.sort()).toEqual(['l1','l2']);
  });
});
