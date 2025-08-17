import ViewLoader from '../src/view/ViewLoader';
import {WorkspaceLeaf} from 'obsidian';
import {augment, setupGlobalDom, makePluginWithFeed} from './utils/dom';
import {RSS_EVENTS} from '../src/events';
jest.mock('@vanakat/plugin-api', () => ({ pluginApi: (): null => null }));

class FakeLeaf extends (WorkspaceLeaf as any) {}

describe('Mark-all events detail payloads', () => {
  beforeAll(()=> setupGlobalDom());

  function buildMulti(){
    const makeRaw = (id:number, folder='Folder1', feedName='Feed1') => ({ link: 'lnk'+id, title: 'T'+id, content: 'Body', pubDate: new Date().toISOString(), read:false, favorite:false, folder, feed: feedName });
    const r1 = makeRaw(1); const r2 = makeRaw(2); const r3 = makeRaw(3,'Folder1','Feed2');
  const feed1: any = { name: ():string=> 'Feed1', link: ():string=> 'http://f1', url: ():string=> 'http://f1', items: ():any[]=> [ { ...r1, title: ():string=> r1.title, body: ():string=> r1.content, pubDate: ():string=> r1.pubDate, read: ():boolean=> r1.read, markRead: (v:boolean):void=> { r1.read=v; } }, { ...r2, title: ():string=> r2.title, body: ():string=> r2.content, pubDate: ():string=> r2.pubDate, read: ():boolean=> r2.read, markRead: (v:boolean):void=> { r2.read=v; } } ], favicon: ():null=> null, parsed:{ items:[r1,r2] } };
  const feed2: any = { name: ():string=> 'Feed2', link: ():string=> 'http://f2', url: ():string=> 'http://f2', items: ():any[]=> [ { ...r3, title: ():string=> r3.title, body: ():string=> r3.content, pubDate: ():string=> r3.pubDate, read: ():boolean=> r3.read, markRead: (v:boolean):void=> { r3.read=v; } } ], favicon: ():null=> null, parsed:{ items:[r3] } };
    const plugin = makePluginWithFeed(r1, feed1);
    plugin.settings.items.push({ subtitle:'', title:'', name:'Feed2', link:'http://f2', image:'', folder:'Folder1', description:'', language:'', hash:'', items: feed2.parsed.items });
    plugin.providers.getCurrent = () => ({ folders: async () => [{ name: ()=> 'Folder1', feeds: ()=> [feed1, feed2] }] });
    return {plugin, r1,r2,r3};
  }

  function mount(plugin:any){
    const leaf = new FakeLeaf();
    const view = new ViewLoader(leaf as any, plugin as any);
    const container = augment(document.createElement('div'));
    document.body.appendChild(container);
    (view as any).containerEl = {children:[document.createElement('div'), container]};
    (view as any).addAction = jest.fn();
    return {view, container};
  }

  test('folder mark-all emits FEED_MARK_FOLDER with links', async () => {
    const {plugin} = buildMulti();
    const {view, container} = mount(plugin);
    await (view as any).onOpen();
    const folderBtn = container.querySelector('.rss-folder-header .rss-mark-folder') as HTMLElement;
    const events: any[] = [];
    document.addEventListener(RSS_EVENTS.FEED_MARK_FOLDER, (e:any)=> events.push(e.detail));
    folderBtn.click();
    await new Promise(r=> setTimeout(r,15));
    expect(events.length).toBe(1);
    const detail = events[0];
    expect(detail.scope).toBe('folder');
    expect(detail.links.sort()).toEqual(['lnk1','lnk2','lnk3']);
  });

  test('feed mark-all emits FEED_MARK_FEED with links', async () => {
    const {plugin} = buildMulti();
    const {view, container} = mount(plugin);
    await (view as any).onOpen();
    const feedButtons = container.querySelectorAll('.rss-feed-header .rss-mark-feed');
    const events: any[] = [];
    document.addEventListener(RSS_EVENTS.FEED_MARK_FEED, (e:any)=> events.push(e.detail));
    (feedButtons[0] as HTMLElement).click();
    await new Promise(r=> setTimeout(r,15));
    expect(events.length).toBe(1);
    const detail = events[0];
    expect(detail.scope).toBe('feed');
    expect(detail.links.sort()).toEqual(['lnk1','lnk2']);
  });
});
