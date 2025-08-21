import RssRoot from '../src/view/RssRoot.svelte';
import { createTestPlugin } from './utils/testPlugin';

describe('RssRoot interactions', () => {
  test('mark feed as read marks items & updates unread count', async () => {
    const plugin = createTestPlugin([
      { folder:'Folder1', feeds:[ { name:'Feed1', items:[ { link:'a', title:'Alpha', read:false, favorite:false, pubDate: new Date().toISOString() } ] } ] }
    ]);
    const target = document.createElement('div');
    document.body.appendChild(target);
    new (RssRoot as any)({ target, props:{ plugin } });
    // Wait microtask for onMount
  await new Promise(r=> setTimeout(r,0));
  await new Promise(r=> setTimeout(r,0));
    const badge = target.querySelector('.rss-item-count-badge');
    expect(badge?.textContent).toBe('1');
    (target.querySelector('.rss-mark-feed') as HTMLElement).click();
  await new Promise(r=> setTimeout(r,0));
  await new Promise(r=> setTimeout(r,0));
    expect(plugin.settings.items[0].items[0].read).toBe(true);
  });

  test('favorite toggle updates star and favorites counter', async () => {
    const plugin = createTestPlugin([
      { folder:'Folder1', feeds:[ { name:'Feed1', items:[ { link:'a', title:'Alpha', read:false, favorite:false, pubDate: new Date().toISOString() } ] } ] }
    ]);
    const target = document.createElement('div');
    document.body.appendChild(target);
    new (RssRoot as any)({ target, props:{ plugin } });
    await new Promise(r=> setTimeout(r,0));
    const favBtn = target.querySelector('.rss-favorites-button span:last-child');
    expect(favBtn?.textContent).toContain('(0)');
  (target.querySelector('.rss-fr-star') as HTMLElement).click();
    await new Promise(r=> setTimeout(r,0));
    expect(favBtn?.textContent).toContain('(1)');
  });
});
