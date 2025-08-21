import RssRoot from '../src/view/RssRoot.svelte';
import { createTestPlugin } from './utils/testPlugin';

describe('Favorites ordering matches main (desc by time)', () => {
  test('favorites newest first via CountersService', async () => {
    const now = Date.now();
    const plugin = createTestPlugin([
      { folder:'FolderA', feeds:[ { name:'Feed1', items:[
        { link:'old-4h', title:'old-4h', favorite:true, read:false, pubDate: new Date(now - 1000*60*60*4).toISOString() },
        { link:'recent-20m', title:'recent-20m', favorite:true, read:false, pubDate: new Date(now - 1000*60*20).toISOString() },
        { link:'mid-5m', title:'mid-5m', favorite:true, read:false, pubDate: new Date(now - 1000*60*5).toISOString() },
      ] } ] }
    ]);
    const target = document.createElement('div');
    document.body.appendChild(target);
    new (RssRoot as any)({ target, props:{ plugin } });
  await new Promise(r=> setTimeout(r,0));
  await new Promise(r=> setTimeout(r,0));
  document.dispatchEvent(new CustomEvent('___TEST_OPEN_FAVORITES'));
  await new Promise(r=> setTimeout(r,0));
  await new Promise(r=> setTimeout(r,0));
  const titles = Array.from(target.querySelectorAll('.list-item-title')).map(e=> e.textContent);
  expect(titles[0]).toContain('mid-5m');
  expect(titles[1]).toContain('recent-20m');
  expect(titles[2]).toContain('old-4h');
  });
});
