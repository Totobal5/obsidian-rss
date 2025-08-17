import ViewLoader from '../src/view/ViewLoader';
import { jest } from '@jest/globals';
import {WorkspaceLeaf} from 'obsidian';
import {augment, setupGlobalDom, makePluginWithFeed} from './utils/dom';
import {RSS_EVENTS} from '../src/events';
jest.mock('@vanakat/plugin-api', () => ({ pluginApi: (): null => null }));

class FakeLeaf extends (WorkspaceLeaf as any) {}

// Legacy ViewLoader integration test referencing removed DOM; retired.
describe.skip('ViewLoader integration (retired)', () => {
  beforeAll(()=> { setupGlobalDom(); });

  function build(){
    const fakeItemRaw = { link: 'x', title: 'X', content: 'Body', pubDate: new Date().toISOString(), read:false, favorite:false };
  const fakeFeed = { name: (): string => 'Feed1', items: (): any[] => [{ ...fakeItemRaw, title: (): string => fakeItemRaw.title, body: (): string => fakeItemRaw.content, pubDate: (): string => fakeItemRaw.pubDate, read: (): boolean => fakeItemRaw.read, markRead: (v:boolean): void => { fakeItemRaw.read=v; } }], favicon: (): string|null => null, parsed: { items: [fakeItemRaw] } };
    const plugin = makePluginWithFeed(fakeItemRaw, fakeFeed);
    const leaf = new FakeLeaf();
    const view = new ViewLoader(leaf as any, plugin as any);
    const container = augment(document.createElement('div'));
    document.body.appendChild(container);
    ;(view as any).containerEl = { 
      children: [document.createElement('div'), container],
      querySelector: (sel:string)=> container.querySelector(sel),
      querySelectorAll: (sel:string)=> container.querySelectorAll(sel)
    };
    ;(view as any).addAction = jest.fn();
    return {view, plugin, fakeItemRaw, container};
  }

  test.skip('marks item read when row clicked & updates unread counter', async () => {
    const {view, fakeItemRaw, container} = build();
    await (view as any).onOpen();
    const allBtn = container.querySelector('.rss-all-feeds-button span:last-child') as HTMLElement;
    const before = allBtn.textContent;
    const row = container.querySelector('.rss-fr-row-article') as HTMLElement;
    expect(row).toBeTruthy();
    row.click();
    expect(fakeItemRaw.read).toBe(true);
    document.dispatchEvent(new CustomEvent(RSS_EVENTS.UNREAD_COUNTS_CHANGED));
    const after = allBtn.textContent;
    expect(after).not.toEqual(before);
    expect(after?.includes('(0)')).toBe(true);
  });

  test.skip('favorite toggle updates star element and favorites counter', async () => {
    const {view, fakeItemRaw, container, plugin} = build() as any;
    await (view as any).onOpen();
    const star = container.querySelector('.rss-fr-star') as HTMLElement;
    const favCounter = container.querySelector('.rss-favorites-button span:last-child') as HTMLElement;
    const beforeFav = favCounter.textContent;
    star.click(); // triggers FAVORITE action path (delegated handler)
    expect(fakeItemRaw.favorite).toBe(true);
    // favorites counter update happens async via updateFavoritesCounter -> allow microtasks
    await new Promise(r=> setTimeout(r,0));
    const afterFav = favCounter.textContent;
    // Ensure UI changed
    expect(afterFav).toBe('Favorites (1)');
    expect(star.textContent).toBe('★');
  });
});
