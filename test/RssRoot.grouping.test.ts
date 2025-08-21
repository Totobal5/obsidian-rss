import RssRoot from '../src/view/RssRoot.svelte';
import { createTestPlugin } from './utils/testPlugin';

describe('RssRoot grouping order', () => {
  test('today group appears first, yesterday second, older last', async () => {
    const now = Date.now();
    const plugin = createTestPlugin([
      { folder:'FolderA', feeds:[ { name:'Feed1', items:[
        { link:'today-1', title:'today-1', read:false, favorite:false, pubDate: new Date(now - 0*86400000).toISOString() },
        { link:'yesterday-1', title:'yesterday-1', read:false, favorite:false, pubDate: new Date(now - 1*86400000).toISOString() },
        { link:'older-1', title:'older-1', read:false, favorite:false, pubDate: new Date(now - 2*86400000).toISOString() },
      ] } ] }
    ]);
    const target = document.createElement('div');
    document.body.appendChild(target);
    new (RssRoot as any)({ target, props:{ plugin } });
  await new Promise(r=> setTimeout(r,0));
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
