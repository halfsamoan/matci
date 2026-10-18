// Real GJS/session D-Bus transport with fake window actions. No GNOME Shell required.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {DesktopService,BUS_NAME,BUS_PATH} from '../extension/desktopService.js';
import {AppBridge} from '../extension/appBridge.js';

const loop=new GLib.MainLoop(null,false);
let failures=0,confirmed=0;
const controller={busy:false,review:null,prepare(){this.review={id:'test-token'};return this.review;},cancel(){this.review=null;},async confirm(){confirmed++;this.review=null;return 'completed';}};
const bridge=new AppBridge({controller,groups:()=>[{appId:'photo.desktop',name:'Photo',windows:[{}]}],now:()=>0});
let service;
const ready=new Promise(resolve=>{service=new DesktopService(bridge,()=>({schema_version:1,apps:[]}),resolve);});
function call(connection,method,signature='()',values=[]) {
    return new Promise((resolve,reject)=>connection.call(BUS_NAME,BUS_PATH,BUS_NAME,method,new GLib.Variant(signature,values),new GLib.VariantType('(s)'),Gio.DBusCallFlags.NO_AUTO_START,3000,null,(c,r)=>{try{resolve(JSON.parse(c.call_finish(r).deep_unpack()[0]));}catch(e){reject(e);}}));
}
const servicePromise=ready.then(async()=>{
    const flags=Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT|Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION;
    const client=Gio.DBusConnection.new_for_address_sync(GLib.getenv('DBUS_SESSION_BUS_ADDRESS'),flags,null,null);
    const other=Gio.DBusConnection.new_for_address_sync(GLib.getenv('DBUS_SESSION_BUS_ADDRESS'),flags,null,null);
    if ((await call(client,'GetState')).schema_version!==1) throw new Error('state');
    const review=await call(client,'Review','(as)',[['photo.desktop']]);
    let blocked=false;try{await call(other,'Confirm','(s)',[review.token]);}catch(_e){blocked=true;}
    if(!blocked||confirmed)throw new Error('foreign sender accepted');
    if((await call(client,'Confirm','(s)',[review.token])).status!=='completed'||confirmed!==1)throw new Error('confirm');
    client.close_sync(null); other.close_sync(null);
    print('GJS session D-Bus: state, review, sender rejection and confirm passed (fake actions).');
}).catch(error=>{printerr(error.message);failures++;}).finally(()=>{service.destroy();loop.quit();});
loop.run();
if(failures)throw new Error('D-Bus integration failed');
