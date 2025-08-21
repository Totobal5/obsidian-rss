import RssRoot from '../src/view/RssRoot.svelte';
import { RSS_EVENTS } from '../src/events';
import { createTestPlugin } from './utils/testPlugin';

function mount(plugin:any){
  const target = document.createElement('div');
  document.body.appendChild(target);
  new (RssRoot as any)({ target, props:{ plugin } });
  return target;
}

describe('RssRoot mark-all actions', () => {
  test('global mark-all marks every item read and emits FEED_MARK_ALL with all links', async () => {
    const now = new Date().toISOString();
    const plugin = createTestPlugin([
      { folder:'F1', feeds:[ { name:'Feed1', items:[ { link:'l1', title:'A', read:false, favorite:false, pubDate:now } ] } ] },
      { folder:'F2', feeds:[ { name:'Feed2', items:[ { link:'l2', title:'B', read:false, favorite:false, pubDate:now }, { link:'l3', title:'C', read:false, favorite:false, pubDate:now } ] } ] }
    ]);
    const target = mount(plugin);
    await new Promise(r=> setTimeout(r,0));
    const events: any[] = [];
    document.addEventListener(RSS_EVENTS.FEED_MARK_ALL as string, (e:any)=> events.push(e.detail));
    (target.querySelector('.rss-mark-all-global') as HTMLButtonElement).click();
    await new Promise(r=> setTimeout(r,0));
    // all items read
  expect(plugin.settings.items.every((s:any)=> s.items.every((i:any)=> i.read))).toBe(true);
    expect(events.length).toBe(1);
    const detail = events[0];
    expect(detail.scope).toBe('global');
    expect(detail.links.sort()).toEqual(['l1','l2','l3']);
  });

  test('folder mark-all only marks that folder and emits FEED_MARK_FOLDER', async () => {
    const now = new Date().toISOString();
    const plugin = createTestPlugin([
      { folder:'F1', feeds:[ { name:'Feed1', items:[ { link:'l1', title:'A', read:false, favorite:false, pubDate:now }, { link:'l2', title:'B', read:false, favorite:false, pubDate:now } ] } ] },
      { folder:'F2', feeds:[ { name:'Feed2', items:[ { link:'l3', title:'C', read:false, favorite:false, pubDate:now } ] } ] }
    ]);
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
  expect(f1Items.every((i:any)=> i.read)).toBe(true);
  expect(f2Items.every((i:any)=> i.read)).toBe(false);
    expect(folderEvents.length).toBe(1);
    const detail = folderEvents[0];
    expect(detail.scope).toBe('folder');
    expect(detail.name).toBe('F1');
    expect(detail.links.sort()).toEqual(['l1','l2']);
  });

  test('feed mark-all marks only that feed and emits FEED_MARK_FEED', async () => {
    const now = new Date().toISOString();
    const plugin = createTestPlugin([
      { folder:'F1', feeds:[ { name:'Feed1', items:[ { link:'fa1', title:'A', read:false, favorite:false, pubDate:now }, { link:'fa2', title:'B', read:false, favorite:false, pubDate:now } ] }, { name:'Feed2', items:[ { link:'fb1', title:'C', read:false, favorite:false, pubDate:now } ] } ] }
    ]);
    const target = mount(plugin);
    await new Promise(r=> setTimeout(r,0));
    const feedEvents: any[] = [];
    document.addEventListener(RSS_EVENTS.FEED_MARK_FEED as string, (e:any)=> feedEvents.push(e.detail));
    // Click first feed's mark button (Feed1)
    const feedButtons = target.querySelectorAll('.rss-feed-line .rss-mark-feed');
    (feedButtons[0] as HTMLButtonElement).click();
    await new Promise(r=> setTimeout(r,0));
  const feed1Items = plugin.settings.items.filter((s:any)=> s.name==='Feed1').flatMap((s:any)=> s.items);
  const feed2Items = plugin.settings.items.filter((s:any)=> s.name==='Feed2').flatMap((s:any)=> s.items);
  expect(feed1Items.every((i:any)=> i.read)).toBe(true);
  expect(feed2Items.every((i:any)=> i.read)).toBe(false);
    expect(feedEvents.length).toBe(1);
    const detail = feedEvents[0];
    expect(detail.scope).toBe('feed');
    expect(detail.name).toBe('Feed1');
    expect(detail.links.sort()).toEqual(['fa1','fa2']);
  });
});
