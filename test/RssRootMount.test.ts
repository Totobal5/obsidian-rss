import { jest } from '@jest/globals';
import RssRoot from '../src/view/RssRoot.svelte';
import { RSS_EVENTS } from '../src/events';

describe('RssRoot direct mount', () => {
  test('mounts with minimal plugin stub and renders empty state', async () => {
    const plugin: any = {
      settings: { items: [] },
  counters: { favoriteItems: (): any[] => [], globalUnread: (): number => 0 },
  providers: { getCurrent: (): any => ({ folders: async (): Promise<any[]> => [] }) },
      itemStateService: { toggleFavorite: jest.fn(), toggleRead: jest.fn() },
      writeFeedContentDebounced: (fn:Function)=> fn()
    };
    const target = document.createElement('div');
    document.body.appendChild(target);
    new (RssRoot as any)({ target, props:{ plugin } });
    expect(target.innerHTML).toContain('All Feeds');
  });
});
