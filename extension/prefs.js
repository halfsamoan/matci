import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {BUILTIN_IDS} from './policy.js';

const VALID_ID = /^[A-Za-z0-9_.@:+-]{1,128}$/;
const STATUS = {completed: '모두 닫힘', partial: '일부 닫힘', timeout: '응답 없음', rejected: '취소됨', requested: '진행 중', observing: '진행 중'};
const KEYPAD = {Delete: 'Del', Decimal: '.', Insert: 'Ins', Enter: 'Enter', Add: '+', Subtract: '-', Multiply: '*', Divide: '/'};

// Gtk labels keypad keys in English ('KP Delete'), so only the key part is replaced; modifier text stays Gtk's.
function shortcutLabel(accel) {
    const [ok, key, mods] = Gtk.accelerator_parse(accel);
    if (!ok || !key) return null;
    const label = Gtk.accelerator_get_label(key, mods), keyLabel = Gtk.accelerator_get_label(key, 0);
    const name = Gdk.keyval_name(key) ?? '';
    if (!name.startsWith('KP_') || !label.endsWith(keyLabel)) return label;
    return `${label.slice(0, label.length - keyLabel.length)}숫자패드 ${KEYPAD[name.slice(3)] ?? name.slice(3)}`;
}

function appIcon(app) {
    const gicon = app?.get_icon();
    return new Gtk.Image({pixel_size: 32, ...(gicon ? {gicon} : {icon_name: 'application-x-executable-symbolic'})});
}

export default class MatciPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._matciSettings = settings;
        const page = new Adw.PreferencesPage({title: 'matci', icon_name: 'utilities-system-monitor-symbolic'});
        window.add(page);
        const source = new Adw.PreferencesGroup({title: '메모리 관측', description: 'Linux /proc 읽기 전용 관측기입니다. 앱 닫기는 Shell에서 직접 선택·검토한 현재 창에만 요청합니다.'});
        page.add(source);
        const mode = new Adw.ComboRow({title: '관측 모드', model: Gtk.StringList.new(['실제 Linux 관측', '합성 시연 · 실제 앱 제어 없음']),
            selected: settings.get_string('mode') === 'demo' ? 1 : 0});
        mode.connect('notify::selected', () => settings.set_string('mode', mode.selected ? 'demo' : 'live'));
        source.add(mode);
        const switchRow = (group, key, title, subtitle = '') => {
            const row = new Adw.SwitchRow({title, subtitle});
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT); group.add(row);
        };
        switchRow(source, 'auto-suggestions', '메모리가 높으면 확인 제안', '30초 이상 기준을 넘으면 노치를 열어 알려 줍니다 · 앱을 자동으로 닫지 않습니다');
        const threshold = new Adw.SpinRow({title: '제안 기준', subtitle: '전체 RAM 사용률 %',
            adjustment: new Gtk.Adjustment({lower: 50, upper: 99, step_increment: 1, page_increment: 5}), value: settings.get_int('threshold')});
        threshold.connect('notify::value', () => settings.set_int('threshold', Math.round(threshold.value)));
        settings.bind('auto-suggestions', threshold, 'sensitive', Gio.SettingsBindFlags.GET);
        source.add(threshold);
        const notch = new Adw.PreferencesGroup({title: '표시', description: '상단 패널 아래에 표시합니다. 시스템 애니메이션 설정을 따릅니다.'});
        page.add(notch);
        switchRow(notch, 'show-notch', '노치로 상세 보기', '끄면 패널에 RAM 사용률만 표시합니다');
        // The numpad keys are grabbed from every app (with NumLock on, '.' too), so they can be turned off.
        const shortcut = new Adw.SwitchRow({title: '숫자패드 단축키', use_markup: false,
            active: settings.get_strv('matci-toggle-shortcut').length > 0});
        const updateShortcut = () => {
            const labels = settings.get_strv('matci-toggle-shortcut').map(shortcutLabel).filter(Boolean);
            shortcut.subtitle = labels.length ? `${labels.join(' 또는 ')} · 켜 두면 다른 앱에서 이 키를 쓸 수 없습니다` :
                '꺼짐 · RAM 패널 버튼으로 엽니다';
            if (shortcut.active !== labels.length > 0) shortcut.active = labels.length > 0;
        };
        shortcut.connect('notify::active', () => {
            const current = settings.get_strv('matci-toggle-shortcut');
            if (shortcut.active && !current.length)
                settings.set_strv('matci-toggle-shortcut', settings.get_default_value('matci-toggle-shortcut').deep_unpack());
            else if (!shortcut.active && current.length) settings.set_strv('matci-toggle-shortcut', []);
        });
        updateShortcut(); notch.add(shortcut);
        switchRow(notch, 'hide-fullscreen', '전체화면에서 숨기기');
        const count = Math.min(32, Gdk.Display.get_default()?.get_monitors().get_n_items() ?? 1);
        const monitor = new Adw.ComboRow({title: '표시 모니터', model: Gtk.StringList.new(['기본 모니터', ...Array.from({length: count}, (_, i) => `모니터 ${i + 1}`)]),
            selected: Math.max(0, Math.min(count, settings.get_int('monitor-index') + 1))});
        monitor.connect('notify::selected', () => settings.set_int('monitor-index', monitor.selected - 1)); notch.add(monitor);
        const protection = new Adw.PreferencesGroup({title: '보호 앱', description: '보호된 앱은 목록에서 선택할 수 없습니다.'});
        page.add(protection);
        const builtin = BUILTIN_IDS.map(id => Gio.DesktopAppInfo.new(id)?.get_name()).filter(Boolean).slice(0, 4);
        protection.add(new Adw.ActionRow({title: '기본 보호', use_markup: false,
            subtitle: `터미널·편집기·개발 도구는 항상 보호됩니다 (예: ${(builtin.length ? builtin : BUILTIN_IDS.slice(0, 4)).join(', ')})`}));
        const setProtected = ids => settings.set_strv('protected-app-ids', ids);
        const appRow = id => {
            const app = Gio.DesktopAppInfo.new(id), name = app?.get_name() ?? id;
            const row = new Adw.ActionRow({title: name, subtitle: app ? '' : '설치되지 않은 앱', use_markup: false});
            const remove = new Gtk.Button({icon_name: 'user-trash-symbolic', tooltip_text: '보호 해제', valign: Gtk.Align.CENTER, css_classes: ['flat']});
            remove.update_property([Gtk.AccessibleProperty.LABEL], [`${name} 보호 해제`]);
            remove.connect('clicked', () => setProtected(settings.get_strv('protected-app-ids').filter(x => x !== id)));
            row.add_prefix(appIcon(app)); row.add_suffix(remove);
            return row;
        };
        let protectedRows = [];
        // Rows are rebuilt from the setting so the list, the picker and external edits never disagree.
        const rebuildProtected = () => {
            protectedRows.forEach(row => protection.remove(row));
            const ids = settings.get_strv('protected-app-ids');
            const apps = Gio.AppInfo.get_all().filter(app => app.should_show() && VALID_ID.test(app.get_id() ?? '') &&
                !ids.includes(app.get_id()) && !BUILTIN_IDS.includes(app.get_id())).sort((a, b) => a.get_name().localeCompare(b.get_name()));
            const appIds = apps.map(app => app.get_id());
            const picker = new Adw.ComboRow({title: '앱 추가', enable_search: true, model: Gtk.StringList.new(apps.map(app => app.get_name())),
                expression: Gtk.PropertyExpression.new(Gtk.StringObject.$gtype, null, 'string')});
            const add = new Gtk.Button({label: '추가', valign: Gtk.Align.CENTER, sensitive: appIds.length > 0 && ids.length < 100});
            add.connect('clicked', () => {
                const id = appIds[picker.selected], current = settings.get_strv('protected-app-ids');
                if (id && VALID_ID.test(id) && !current.includes(id) && current.length < 100) setProtected([...current, id]);
            });
            picker.add_suffix(add);
            protectedRows = [...ids.map(appRow), picker];
            protectedRows.forEach(row => protection.add(row));
        };
        rebuildProtected();
        const history = new Adw.PreferencesGroup({title: '로컬 기록', description: '닫기 요청 결과만 기록합니다. 창 제목과 명령행은 저장하지 않습니다. 가용 메모리 변화에는 다른 작업의 영향도 섞여 있어 회수량이 아닙니다.'});
        page.add(history);
        const status = new Adw.ActionRow({title: '최근 기록', subtitle: '새로고침을 누르세요.', use_markup: false});
        const refresh = new Gtk.Button({label: '새로고침', valign: Gtk.Align.CENTER});
        refresh.connect('clicked', () => this._readHistory(status)); status.add_suffix(refresh); history.add(status);
        this._readHistory(status);
        const handlers = [settings.connect('changed::matci-toggle-shortcut', updateShortcut), settings.connect('changed::protected-app-ids', rebuildProtected)];
        window.connect('close-request', () => { handlers.forEach(id => settings.disconnect(id)); return false; });
    }
    _readHistory(row) {
        try {
            const path = GLib.build_filenamev([GLib.get_user_state_dir(), 'matci', 'history-summary.json']);
            const file = Gio.File.new_for_path(path);
            const info = file.query_info('standard::size,standard::is-symlink,unix::uid', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
            if (info.get_is_symlink() || info.get_size() > 131072 || info.get_attribute_uint32('unix::uid') !== new Gio.Credentials().get_unix_user())
                throw new Error('summary bounds');
            const [, data] = file.load_contents(null);
            const summary = JSON.parse(new TextDecoder().decode(data));
            if (summary.schema_version !== 1 || summary.owner_uid !== new Gio.Credentials().get_unix_user() || !Array.isArray(summary.receipts)) throw new Error('summary version');
            const entries = summary.receipts.slice(0, 5).map(r => {
                const when = String(r.updated_at ?? r.created_at ?? '').slice(0, 32);
                const delta = Number.isFinite(r.observed_delta) ? Math.round(r.observed_delta / 1048576) : null;
                return [Object.hasOwn(STATUS, r.status) ? STATUS[r.status] : '알 수 없음',
                    when && (GLib.DateTime.new_from_iso8601(when, null)?.to_local().format('%-m월 %-d일 %H:%M') ?? when),
                    delta !== null && `가용 ${delta > 0 ? '+' : ''}${delta} MB`].filter(Boolean).join(' · ');
            });
            row.subtitle = entries.length ? entries.join('\n') : '아직 정상 닫기 요청 기록이 없습니다.';
        } catch (_error) { row.subtitle = '요약 기록을 읽을 수 없습니다. 확장을 켜고 관측을 시작하세요.'; }
    }
}
