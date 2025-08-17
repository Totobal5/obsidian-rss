import {RSS_EVENTS} from '../../src/events';
import { jest } from '@jest/globals';

// Legacy DOM augmentation helpers removed (obsolete after Svelte migration).
export function augment(el: any){ return el; }

export function setupGlobalDom(){
  (globalThis as any).ResizeObserver = class { observe(){} disconnect(){} } as any;
  (globalThis as any).setIcon = () => {};
  (globalThis as any).window = globalThis as any;
  (globalThis as any).window.moment = (_d?:any)=> ({ format: ()=> '2025-01-01'});
  if(!(globalThis as any).CSS) (globalThis as any).CSS = {};
  if(!(globalThis as any).CSS.escape) (globalThis as any).CSS.escape = (str:string)=> String(str).replace(/[^a-zA-Z0-9_\-]/g,'_');
}

export function makePluginWithFeed(fakeItemRaw: any, fakeFeed: any){
  const settings = { items: [ { name: 'Feed1', folder: 'Folder1', items: [fakeItemRaw] } ] as any[], feeds: [] as any[], filtered: [] as any[], folded: [] as any[], hotkeys: {}, updateTime: 0, autoSync:false };
  const counters = {
    globalUnread: () => settings.items.reduce((a:any,fc:any)=> a + fc.items.filter((i:any)=> i.read !== true).length,0),
    unreadByFolder: () => settings.items.reduce((map:any,fc:any)=> { const key = fc.folder.toLowerCase(); map[key]=(map[key]||0)+fc.items.filter((i:any)=> i.read !== true).length; return map; }, {}),
    unreadByFeed: () => settings.items.reduce((map:any,fc:any)=> { map[fc.name]=(map[fc.name]||0)+fc.items.filter((i:any)=> i.read !== true).length; return map; }, {}),
    favoriteCount: () => settings.items.reduce((a:any,fc:any)=> a + fc.items.filter((i:any)=> i.favorite === true).length,0),
  favoriteItems: () => settings.items.reduce((acc:any[], fc:any)=> { for(const it of fc.items){ if(it.favorite===true) acc.push(it);} return acc; }, [])
  };
  return {
    settings,
    providers: { getCurrent: (): any => ({ folders: async (): Promise<any[]> => [{ feeds: (): any[] => [fakeFeed], name: (): string => 'Folder1' }] }) },
    writeFeedContentDebounced: jest.fn((fn:Function)=> fn()),
    getItemByLink: jest.fn(()=> fakeItemRaw),
    writeFeedContent: jest.fn(),
    counters,
    itemStateService: { 
      toggleFavorite: jest.fn(async (wrapperOrRaw: any)=> { const raw = wrapperOrRaw.item? wrapperOrRaw.item: wrapperOrRaw; raw.favorite = !raw.favorite; document.dispatchEvent(new CustomEvent(RSS_EVENTS.FAVORITE_UPDATED,{detail:{link: raw.link, favorite: raw.favorite}})); return raw.favorite; }),
      toggleRead: jest.fn(async (wrapperOrRaw: any)=> { const raw = wrapperOrRaw.item? wrapperOrRaw.item: wrapperOrRaw; raw.read = !raw.read; document.dispatchEvent(new CustomEvent(RSS_EVENTS.ITEM_READ_UPDATED,{detail:{link: raw.link, read: raw.read}})); return raw.read; })
    },
    settingsManager: { writeFeedContentDebounced: jest.fn((fn:Function)=> fn()) },
  };
}
