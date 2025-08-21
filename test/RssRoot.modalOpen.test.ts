import RssRoot from '../src/view/RssRoot.svelte';
import { createTestPlugin } from './utils/testPlugin';

describe('RssRoot modal open', () => {
  test('clicking an item opens ItemModal', async () => {
    const plugin = createTestPlugin([
      { folder:'Folder1', feeds:[ { name:'Feed1', items:[ { link:'a', title:'Alpha', read:false, favorite:false, pubDate: new Date().toISOString(), description:'<p>Alpha desc</p>' } ] } ] }
    ]);
    const target = document.createElement('div');
    document.body.appendChild(target);
  let opened = false;
  const handler = () => { opened = true; };
  document.addEventListener('rss-item-opened', handler, { once: true });
    new (RssRoot as any)({ target, props:{ plugin } });
  await new Promise(r=> setTimeout(r,0));
  await new Promise(r=> setTimeout(r,0));
  await new Promise(r=> setTimeout(r,0));
    const row = target.querySelector('.list-item-container');
    if(!row){
      // dump titles for debugging
      const html = target.innerHTML;
      throw new Error('Row not found. HTML='+html.slice(0,400));
    }
    (row as HTMLElement).click();
    await new Promise(r=> setTimeout(r,0));
    await new Promise(r=> setTimeout(r,0));
  expect(opened).toBe(true);
  });
});
