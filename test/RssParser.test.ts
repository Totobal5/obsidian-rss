import type {RssFeed} from "../src/settings/settings";
import {getFeedItems} from "../src/parser/rssParser";
import { jest } from '@jest/globals';

describe('rssParser fixtures', () => {
        test('malformed xml returns empty set (graceful failure)', async () => {
        const feed: RssFeed = { name: 'Invalid', url: './invalid.xml', folder: '' };
        const result = await getFeedItems(feed);
        expect(result?.items?.length ?? 0).toBe(0);
    });

        test('non-rss html returns empty set for plain html', async () => {
        const feed: RssFeed = { name: 'InvalidHtml', url: './example.org.xml', folder: '' };
        const result = await getFeedItems(feed);
        expect(result?.items?.length ?? 0).toBe(0);
    });

    test('wallabag atom feed parses items', async () => {
        const feed: RssFeed = { name: 'Wallabag', url: './wallabag.xml', folder: '' };
        const result = await getFeedItems(feed);
        expect(result?.items?.length).toBeGreaterThanOrEqual(1);
    });
});
