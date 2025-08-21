import RssRoot from '../src/view/RssRoot.svelte';
import { createTestPlugin } from './utils/testPlugin';

function mount(plugin:any){
  const target = document.createElement('div');
  document.body.appendChild(target);
  new (RssRoot as any)({ target, props:{ plugin } });
  return target;
}

describe('RssRoot filtering', () => {
  test('clicking a folder shows only its feeds items', async () => {
    const now = new Date().toISOString();
    const plugin = createTestPlugin([
      { folder:'FolderA', feeds:[ { name:'Feed1', items:[ { link:'a1', title:'A1', read:false, favorite:false, pubDate:now }, { link:'a2', title:'A2', read:false, favorite:false, pubDate:now } ] } ] },
      { folder:'FolderB', feeds:[ { name:'Feed2', items:[ { link:'b1', title:'B1', read:false, favorite:false, pubDate:now } ] } ] }
    ]);
    const target = mount(plugin);
  await new Promise(r=> setTimeout(r,0));
  await new Promise(r=> setTimeout(r,0));
    // initial: all feeds (3 items)
  const initialItems = target.querySelectorAll('.rss-fr-list .list-item-container');
  expect(initialItems.length).toBe(3);
    // Click folder A header
    const folderButtons = target.querySelectorAll('.rss-folder-header');
    (folderButtons[0] as HTMLButtonElement).click();
  await new Promise(r=> setTimeout(r,0));
  await new Promise(r=> setTimeout(r,0));
    // Now only 2 items from Feed1
  const itemTitles = Array.from(target.querySelectorAll('.list-item-title')).map(e=> e.textContent?.trim());
    expect(itemTitles.length).toBe(2);
    expect(itemTitles.every(t=> t?.startsWith('A'))).toBe(true);
  });

  test('clicking a feed shows only that feed items', async () => {
    const now = new Date().toISOString();
    const plugin = createTestPlugin([
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
