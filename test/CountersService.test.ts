import {CountersService} from '../src/services/CountersService';

describe('CountersService', () => {
  function makeItem(overrides: any = {}): any {
    return {
      link: Math.random().toString(36).slice(2),
      read: false,
      favorite: false,
      pubDate: new Date().toISOString(),
      ...overrides,
    } as any;
  }
  function makeFeed(items: any[], name='Feed1', folder='Folder1') {
    return { name, folder, items };
  }
  test('globalUnread counts across feeds and folders', () => {
    const itemsA = [makeItem(), makeItem({read:true}), makeItem()];
    const itemsB = [makeItem({read:true}), makeItem({read:true})];
  const feedA = makeFeed(itemsA,'A','FolderX');
  const feedB = makeFeed(itemsB,'B','FolderX');
  const plugin = { settings: { items:[feedA, feedB] } } as any;
  const svc = new CountersService(plugin);
  expect(svc.globalUnread()).toBe(2); // two unread in A, zero in B
  });
  test('feedUnread respects read state', () => {
    const items = [makeItem(), makeItem({read:true}), makeItem({read:false})];
  const feed = makeFeed(items,'Feed1','Folder1');
  const plugin = { settings: { items:[feed] } } as any;
  const svc = new CountersService(plugin);
  expect(svc.feedUnread('Feed1')).toBe(2);
  });
  test('folderUnread sums feeds', () => {
  const feed1 = makeFeed([makeItem(), makeItem({read:true})],'F1','Folder1');
  const feed2 = makeFeed([makeItem(), makeItem()],'F2','Folder1');
  const plugin = { settings: { items:[feed1, feed2] } } as any;
  const svc = new CountersService(plugin);
  expect(svc.folderUnread('Folder1')).toBe(3);
  });
});
