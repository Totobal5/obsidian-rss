// Centralized event name constants for reliability and refactoring
export const RSS_EVENTS = {
  FAVORITE_UPDATED: 'rss-reader-favorite-updated',
  ITEM_READ_UPDATED: 'rss-reader-item-read-updated',
  UNREAD_COUNTS_CHANGED: 'rss-reader-read-updated',
  // Mark-all scope specific events
  FEED_MARK_ALL: 'rss-reader-feed-mark-all',           // global scope all feeds
  FEED_MARK_FOLDER: 'rss-reader-feed-mark-folder',     // newly added: mark-all within a folder
  FEED_MARK_FEED: 'rss-reader-feed-mark-feed'          // newly added: mark-all within a single feed
} as const;

export type RssEventName = typeof RSS_EVENTS[keyof typeof RSS_EVENTS];
