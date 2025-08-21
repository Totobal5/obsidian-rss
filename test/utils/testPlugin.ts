import { itemsStore } from '../../src/stores';
import { RSS_EVENTS } from '../../src/events';
import type { RssFeedContent, RssFeedItem } from '../../src/parser/rssParser';

export interface TestFeedItemInput {
  link: string;
  title: string;
  pubDate: string; // ISO string
  read?: boolean;
  favorite?: boolean;
  description?: string;
}

export interface TestFeedDefInput { name: string; items: TestFeedItemInput[] }
export interface TestFolderInput { folder: string; feeds: TestFeedDefInput[] }

function buildRawItem(folder: string, feed: string, input: TestFeedItemInput): RssFeedItem {
  return {
    title: input.title,
    description: input.description || '',
    content: input.description || '',
    category: '',
    link: input.link,
    creator: '',
    language: '',
    enclosure: '',
    enclosureType: '',
    image: '',
    pubDate: input.pubDate,
    folder,
    feed,
    favorite: !!input.favorite,
    read: !!input.read,
    created: false,
    visited: false,
    tags: [],
    hash: `${feed}:${input.link}`,
    id: input.link,
    highlights: [],
  };
}

function buildFeedContent(folder: string, feed: TestFeedDefInput): RssFeedContent {
  return {
    subtitle: '',
    title: feed.name,
    name: feed.name,
    link: feed.name,
    image: '',
    folder,
    description: '',
    language: '',
    hash: feed.name,
    items: feed.items.map(it => buildRawItem(folder, feed.name, it))
  };
}

export function createTestPlugin(folders: TestFolderInput[]) {
  const feedContents: RssFeedContent[] = [];
  for (const folder of folders) {
    for (const feed of folder.feeds) {
      feedContents.push(buildFeedContent(folder.folder, feed));
    }
  }

  const plugin: any = {
    settings: { 
      items: feedContents,
      hotkeys: { read:'', favorite:'', create:'', paste:'', copy:'', open:'', next:'', previous:'', tts:'' },
      dateFormat: 'YYYY-MM-DD',
      template: '',
      defaultFilename: 'note',
      pasteTemplate: '',
      saveLocation: 'current',
      saveLocationFolder: '/',
      askForFilename: false,
      displayMedia: true,
    },
  app: { workspace: { getActiveFile: () => null, getActiveViewOfType: () => null, getLeaf: () => ({ openFile: async () => {} }) }, fileManager: { getNewFileParent: () => ({ path: '/' }) }, vault: { create: async () => ({}) } }
  };

  // Seed items store before mount; schedule microtask update too for safety
  itemsStore.set(feedContents);
  queueMicrotask(()=> itemsStore.set(feedContents));

  plugin.feedsManager = {
    getUnreadCountForFeed(name: string) {
      const fc = feedContents.find(f => f.name === name);
      if (!fc) return 0;
      return fc.items.filter(i => !i.read).length;
    },
    getUnreadCountForFolder(folder: string) {
      const lc = folder.toLowerCase();
      return feedContents.filter(f => (f.folder || '').toLowerCase() === lc)
        .reduce((a, f) => a + f.items.filter(i => !i.read).length, 0);
    }
  };

  function dispatch(evt: string) {
    try { document.dispatchEvent(new CustomEvent(evt)); } catch { /* ignore */ }
  }

  plugin.itemStateService = {
    async toggleFavorite(item: any) {
      item.markStarred(!item.starred());
      dispatch(RSS_EVENTS.FAVORITE_UPDATED as string);
    },
    async toggleRead(item: any) {
      item.markRead(!item.read());
      dispatch(RSS_EVENTS.UNREAD_COUNTS_CHANGED as string);
    }
  };

  plugin.writeFeedContentDebounced = (fn: Function) => fn(feedContents);
  plugin.updateFeeds = async () => {};

  plugin.providers = {
    getCurrent: () => ({
      folders: async () => {
        const grouped: Record<string, RssFeedContent[]> = {};
        for (const fc of feedContents) {
          grouped[fc.folder] = grouped[fc.folder] || [];
          grouped[fc.folder].push(fc);
        }
        return Object.keys(grouped).map(folderName => ({
          name: () => folderName,
          feeds: () => grouped[folderName].map(fc => ({
            name: () => fc.name,
            link: () => fc.link,
            url: () => fc.link,
            folderName: () => fc.folder,
            items: () => fc.items
          }))
        }));
      }
    })
  };

  return plugin;
}
