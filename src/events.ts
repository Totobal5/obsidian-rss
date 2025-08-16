// Centralized event name constants for reliability and refactoring
export const RSS_EVENTS = {
  FAVORITE_UPDATED: 'rss-reader-favorite-updated',
  ITEM_READ_UPDATED: 'rss-reader-item-read-updated',
  UNREAD_COUNTS_CHANGED: 'rss-reader-read-updated'
} as const;

export type RssEventName = typeof RSS_EVENTS[keyof typeof RSS_EVENTS];
