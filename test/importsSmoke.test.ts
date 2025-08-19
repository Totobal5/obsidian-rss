// Static smoke test: if any of these throws on import, test fails early.
import * as MainMod from '../src/main';
import * as ViewLoaderMod from '../src/view/ViewLoader';
import RssRoot from '../src/view/RssRoot.svelte';
import * as FeedModalMod from '../src/modals/FeedModal';
import * as ItemModalMod from '../src/modals/ItemModal';
import * as TagModalMod from '../src/modals/TagModal';
import * as SettingsTabMod from '../src/settings/SettingsTab';
import * as ParserMod from '../src/parser/rssParser';
import * as ProvidersMod from '../src/providers/Providers';
import * as FeedUpdaterMod from '../src/services/FeedsManager';

describe('imports smoke', () => {
  test('core modules import statically', () => {
    expect(MainMod).toBeTruthy();
    expect(ViewLoaderMod).toBeTruthy();
    expect(RssRoot).toBeTruthy();
    expect(FeedModalMod).toBeTruthy();
    expect(ItemModalMod).toBeTruthy();
    expect(TagModalMod).toBeTruthy();
    expect(SettingsTabMod).toBeTruthy();
    expect(ParserMod).toBeTruthy();
    expect(ProvidersMod).toBeTruthy();
    expect(FeedUpdaterMod).toBeTruthy();
  });
});
