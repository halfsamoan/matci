import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {BUILTIN_IDS} from './policy.js';

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
        switchRow(source, 'auto-suggestions', '높은 메모리 사용 시 검토 제안', '기본 꺼짐 · 30초 지속 시 제안 · 10분 대기 · 자동 닫기 없음');
        const threshold = new Adw.SpinRow({title: '제안 기준 · 전체 RAM 사용 %',
            adjustment: new Gtk.Adjustment({lower: 50, upper: 99, step_increment: 1, page_increment: 5}), value: settings.get_int('threshold')});
        threshold.connect('notify::value', () => settings.set_int('threshold', Math.round(threshold.value)));
        source.add(threshold);
        const notch = new Adw.PreferencesGroup({title: '두 노치', description: 'Archsport와 같은 320ms 모션. 패널 아래에서 나란히 배치하며 공간이 부족하면 RAM 패널 버튼으로 진입합니다. 시스템 애니메이션 끄기를 따릅니다.'});
        page.add(notch);
        switchRow(notch, 'show-notch', '노치 표시');
        switchRow(notch, 'hide-fullscreen', '전체화면에서 숨기기');
        const count = Math.min(32, Gdk.Display.get_default()?.get_monitors().get_n_items() ?? 1);
        const monitor = new Adw.ComboRow({title: '표시 모니터', model: Gtk.StringList.new(['기본 모니터', ...Array.from({length: count}, (_, i) => `모니터 ${i + 1}`)]),
            selected: Math.max(0, Math.min(count, settings.get_int('monitor-index') + 1))});
        monitor.connect('notify::selected', () => settings.set_int('monitor-index', monitor.selected - 1)); notch.add(monitor);
        const protection = new Adw.PreferencesGroup({title: '보호 앱', description: '기본 시스템·Shell·터미널·편집기·개발 도구 보호는 해제할 수 없습니다. 매핑·UID·PID 신원이 불명확한 앱도 보호합니다.'});
        page.add(protection);
        const protectedIds = new Adw.EntryRow({title: '추가 보호 desktop ID · 쉼표 구분', text: settings.get_strv('protected-app-ids').join(', '), show_apply_button: true});
        protectedIds.connect('apply', () => {
            const ids = [...new Set(protectedIds.text.split(',').map(s => s.trim()).filter(Boolean))];
            if (ids.length <= 100 && ids.every(id => /^[A-Za-z0-9_.@:+-]{1,128}$/.test(id))) {
                settings.set_strv('protected-app-ids', ids); protectedIds.remove_css_class('error');
            } else protectedIds.add_css_class('error');
        });
        protection.add(protectedIds);
        protection.add(new Adw.ActionRow({title: '기본 보호 예시', subtitle: BUILTIN_IDS.slice(0, 5).join(' · ')}));
        const history = new Adw.PreferencesGroup({title: '로컬 기록', description: '요청 결과만 읽습니다. 창 제목·원시 명령행은 기록하지 않습니다. 가용 메모리 차이는 다른 작업의 영향도 포함합니다.'});
        page.add(history);
        const status = new Adw.ActionRow({title: '최근 기록', subtitle: '갱신을 누르세요.'});
        const refresh = new Gtk.Button({label: '갱신', valign: Gtk.Align.CENTER});
        refresh.connect('clicked', () => this._readHistory(status)); status.add_suffix(refresh); history.add(status);
        this._readHistory(status);
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
            const entries = summary.receipts.slice(0, 5).map(r => `${String(r.status ?? 'unknown').slice(0, 32)} · ${String(r.updated_at ?? r.created_at ?? '').slice(0, 32)}${Number.isFinite(r.observed_delta) ? ` · 가용 ${(r.observed_delta / 1048576).toFixed(0)} MiB 변화` : ''}`);
            row.subtitle = entries.length ? entries.join('\n') : '아직 정상 닫기 요청 기록이 없습니다.';
        } catch (_error) { row.subtitle = '요약 기록을 읽을 수 없습니다. 확장을 켜고 관측을 시작하세요.'; }
    }
}
