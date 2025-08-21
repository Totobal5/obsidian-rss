import { ItemModal } from '../src/modals/ItemModal';
import type { Item } from '../src/providers/Item';
import RssReaderPlugin from '../src/main';
import { DEFAULT_SETTINGS } from '../src/settings/settings';
import { jest } from '@jest/globals';

// Service mocks with explicit return types
const mockToggleRead = jest.fn(async (_item: Item) => true);
const mockToggleFavorite = jest.fn(async (_item: Item) => true);
const mockWriteFeedContent = jest.fn(async (_updater: any) => {});

export function createMockPlugin(): Partial<RssReaderPlugin> {
    return {
        app: {
            workspace: { getLeavesOfType: () => [], getRightLeaf: () => ({ setViewState: async () => {} }) },
            metadataCache: { getTags: () => ({}) }
        } as any,
        settings: { ...DEFAULT_SETTINGS, hotkeys: { ...DEFAULT_SETTINGS.hotkeys, read: 'r', favorite: 'f', create: 'c', paste: 'v', copy: 'y', open: 'o', next: 'n', previous: 'p', tts: 't', tags: 'g' } },
        itemStateService: { toggleRead: mockToggleRead, toggleFavorite: mockToggleFavorite } as any,
        writeFeedContentDebounced: mockWriteFeedContent as any,
        // Minimal feedsManager stub for components referencing unread counts
        feedsManager: {
            getUnreadCountForFolder: () => 0,
            getUnreadCountForFeed: () => 0,
            getItemByLink: () => undefined
        } as any
    };
}

const mockPlugin = createMockPlugin();

function createMockItem(overrides: Partial<Item> = {}): Item {
    const base: Item = {
        id: () => 'id1',
        guid: () => 'guid1',
        guidHash: () => 'hash1',
        url: () => 'http://example.com/article',
        title: () => 'Test Title',
        author: () => 'Author',
        pubDate: () => '2024-06-01T12:00:00Z',
        body: () => '<p>Body</p>',
        description: () => '<p>Description</p>',
        feedId: () => 1,
        read: () => false,
        starred: () => false,
        rtl: () => false,
        mediaThumbnail: () => '',
        mediaDescription: () => '',
        enclosureMime: () => 'audio/mp3',
        enclosureLink: () => 'http://audio.mp3',
        markStarred: () => {},
        markRead: () => {},
        tags: () => ['tag1', 'tag2'],
        setTags: (_: string[]) => {},
        created: () => false,
        markCreated: (_: boolean) => {},
        language: () => 'en',
        highlights: () => [],
        folder: () => '',
        feed: () => 'Feed1'
    } as Item;
    return { ...base, ...overrides } as Item;
}

// Basic jsdom sanity: ensure window.moment stub
beforeAll(() => {
    (globalThis as any).window = globalThis.window || {};
    (window as any).moment = (_d?: any) => ({ format: () => '2024-06-01' });
});

describe('ItemModal', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should construct and register hotkeys', () => {
        const item = createMockItem();
        const items = [item];
        const modal = new ItemModal(mockPlugin as any, item, items);

        expect(modal).toBeInstanceOf(ItemModal);
        // Hotkeys should be registered (scope.register called)
        // We can't check scope directly, but no error should occur
    });

    it('should not throw if plugin.settings is missing', () => {
        const plugin = { ...mockPlugin, settings: undefined };
        const item = createMockItem();
        expect(() => new ItemModal(plugin as any, item, [item])).not.toThrow();
    });

    it('previous() should navigate to previous item and mark as read', async () => {
        const item1 = createMockItem();
    const item2 = createMockItem({ id: () => 'id2' });
        const items = [item1, item2];
        const modal = new ItemModal(mockPlugin as any, item2, items);

        // Mock close and open
        modal.close = jest.fn();
        ItemModal.prototype.open = jest.fn();

        modal.previous();

        expect(mockToggleRead).toHaveBeenCalledWith(item1);
        expect(modal.close).toHaveBeenCalled();
    });

    it('next() should navigate to next item and mark as read', async () => {
        const item1 = createMockItem();
    const item2 = createMockItem({ id: () => 'id2' });
        const items = [item1, item2];
        const modal = new ItemModal(mockPlugin as any, item1, items);

        // Mock close and open
        modal.close = jest.fn();
        ItemModal.prototype.open = jest.fn();

        modal.next();

        expect(mockToggleRead).toHaveBeenCalledWith(item2);
        expect(modal.close).toHaveBeenCalled();
    });

    it('getFavoriteState returns correct value', () => {
    const item = createMockItem({ starred: () => true });
        const modal = new ItemModal(mockPlugin as any, item, [item]);
    expect((modal as any).getFavoriteState()).toBe(true);
    });

    it('markAsFavorite toggles favorite and sets tooltip', async () => {
    const item = createMockItem();
    const modal = new ItemModal(mockPlugin as any, item, [item]);
    (modal as any).favoriteButton = {
            buttonEl: { toggleClass: jest.fn() },
            setTooltip: jest.fn()
        } as any;

    await (modal as any).markAsFavorite();

    expect(mockToggleFavorite).toHaveBeenCalledWith(item);
    expect((modal as any).favoriteButton.setTooltip).toHaveBeenCalled();
    });

    it('markAsRead marks as read and sets UI', async () => {
    const item = createMockItem({ read: () => false });
    const modal = new ItemModal(mockPlugin as any, item, [item]);
    (modal as any).readButton = {
            buttonEl: { toggleClass: jest.fn() },
            setIcon: jest.fn(),
            setTooltip: jest.fn()
        } as any;

        await (modal as any).markAsRead();

    expect(mockToggleRead).toHaveBeenCalledWith(item);
    expect((modal as any).readButton.setIcon).toHaveBeenCalledWith('eye-off');
    expect((modal as any).readButton.setTooltip).toHaveBeenCalled();
    });

    it('getBodyHtml returns body if present', () => {
    const item = createMockItem({ body: () => 'body text' });
        const modal = new ItemModal(mockPlugin as any, item, [item]);
        expect((modal as any).getBodyHtml()).toBe('body text');
    });

    it('getBodyHtml returns description if body is empty', () => {
    const item = createMockItem({ body: () => '', description: () => 'desc text' });
        const modal = new ItemModal(mockPlugin as any, item, [item]);
        expect((modal as any).getBodyHtml()).toBe('desc text');
    });

    it('truncateWords truncates long text', () => {
        const modal = new ItemModal(mockPlugin as any, createMockItem(), []);
        const text = 'a '.repeat(200) + 'extra';
        const result = (modal as any).truncateWords(text, 50);
        expect(result.endsWith('…')).toBe(true);
        expect(result.length).toBeLessThan(text.length);
    });

    it('linkify wraps plain URL with anchor', () => {
        const modal = new ItemModal(mockPlugin as any, createMockItem(), []);
        const html = (modal as any).linkify('Visit https://example.com now');
        expect(html).toContain('<a');
        expect(html).toContain('https://example.com');
    });
});