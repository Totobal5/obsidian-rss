import RssRoot from '../src/view/RssRoot.svelte';
import { createTestPlugin } from './utils/testPlugin';

describe('RssRoot ordering inside group (desc by time)', () => {
  test('newest first inside Today group', async () => {
    const now = Date.now();
    const plugin = createTestPlugin([
      { folder:'FolderA', feeds:[ { name:'Feed1', items:[
        { link:'older-5h', title:'older-5h', read:false, favorite:false, pubDate: new Date(now - 1000*60*60*5).toISOString() },
        { link:'recent-1h', title:'recent-1h', read:false, favorite:false, pubDate: new Date(now - 1000*60*60*1).toISOString() },
        { link:'latest-30m', title:'latest-30m', read:false, favorite:false, pubDate: new Date(now - 1000*60*30).toISOString() },
      ] } ] }
    ]);
    const target = document.createElement('div');
    document.body.appendChild(target);
    new (RssRoot as any)({ target, props:{ plugin } });
  await new Promise(r=> setTimeout(r,0));
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
