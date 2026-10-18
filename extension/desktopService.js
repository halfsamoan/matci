import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const BUS_NAME = 'org.matci.Shell1';
export const BUS_PATH = '/org/matci/Shell1';
const XML = `<node><interface name="org.matci.Shell1">
<method name="GetState"><arg type="s" direction="out"/></method>
<method name="Review"><arg type="as" direction="in"/><arg type="s" direction="out"/></method>
<method name="Confirm"><arg type="s" direction="in"/><arg type="s" direction="out"/></method>
<method name="Cancel"><arg type="s" direction="in"/><arg type="s" direction="out"/></method>
</interface></node>`;

export class DesktopService {
    constructor(bridge, state, onReady = null) {
        this.bridge = bridge;
        this.object = Gio.DBusExportedObject.wrapJSObject(XML, {
            GetState: () => this.encode(state()),
            ReviewAsync: (args, invocation) => this.reply(invocation, () => bridge.review(invocation.get_sender(), args[0])),
            ConfirmAsync: (args, invocation) => this.reply(invocation, () => bridge.confirm(invocation.get_sender(), args[0])),
            CancelAsync: (args, invocation) => this.reply(invocation, () => bridge.cancel(invocation.get_sender(), args[0])),
        });
        this.object.export(Gio.DBus.session, BUS_PATH);
        this.owner = Gio.bus_own_name_on_connection(Gio.DBus.session, BUS_NAME, Gio.BusNameOwnerFlags.NONE, onReady, null);
        this.subscription = Gio.DBus.session.signal_subscribe('org.freedesktop.DBus', 'org.freedesktop.DBus',
            'NameOwnerChanged', '/org/freedesktop/DBus', null, Gio.DBusSignalFlags.NONE,
            (_c, _s, _p, _i, _n, params) => {
                const [name, , current] = params.deep_unpack();
                if (name.startsWith(':') && !current) bridge.disconnect(name);
            });
    }
    encode(value) {
        const result = JSON.stringify(value);
        if (new TextEncoder().encode(result).length > 128 * 1024) throw new Error('STATE_LIMIT');
        return result;
    }
    async reply(invocation, action) {
        try { invocation.return_value(new GLib.Variant('(s)', [this.encode(await action())])); }
        catch (_error) { invocation.return_dbus_error('org.matci.Error.Rejected', '요청을 진행할 수 없습니다. 현재 상태와 보호 사유를 확인하고 다시 선택하세요.'); }
    }
    destroy() {
        this.bridge.destroy();
        Gio.DBus.session.signal_unsubscribe(this.subscription);
        Gio.bus_unown_name(this.owner);
        this.object.unexport();
    }
}
