import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import Shell from 'gi://Shell';
import Pango from 'gi://Pango';
import {DockParticipant} from './notchDock.js';
import {CloseController} from './actions.js';
import {protection, appView, keyOf, interactionAge} from './policy.js';
import {AppBridge, publicApps} from './appBridge.js';
import {DesktopService} from './desktopService.js';
import {ContentMotion} from './contentMotion.js';

const MAX_LINE = 262144;
const bytes = n => n === null || n === undefined ? '확인 불가' : `${(n / 1073741824).toFixed(2)} GiB`;
const percent = n => Number.isFinite(n) ? `${Math.round(n * 100)}%` : '—';

// Only the incoming scene participates in sizing. Outgoing content keeps its
// last allocation during the fade, including when the notch starts shrinking.
const ContentLayout = GObject.registerClass(class MatciContentLayout extends Clutter.BinLayout {
    vfunc_get_preferred_width(container, forHeight) {
        return container.get_last_child()?.get_preferred_width(forHeight) ?? [0, 0];
    }
    vfunc_get_preferred_height(container, forWidth) {
        return container.get_last_child()?.get_preferred_height(forWidth) ?? [0, 0];
    }
    vfunc_allocate(container, box) {
        const current = container.get_last_child();
        for (const child of container.get_children()) {
            child.allocate(child === current ? new Clutter.ActorBox({x1: 0, y1: 0,
                x2: box.get_width(), y2: box.get_height()}) : child.get_allocation_box());
        }
    }
});

export default class Matci extends Extension {
    enable() {
        this._enabled = true;
        this._generation = 0;
        this._signals = [];
        this._pending = new Map();
        this._delays = new Map();
        this._queue = [];
        this._writing = false;
        this._settings = this.getSettings();
        this._interface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._ownerUid = new Gio.Credentials().get_unix_user();
        this._snapshot = null;
        this._receivedAt = 0;
        this._expanded = false;
        this._selected = new Set();
        this._message = '메모리 관측 연결 중';
        this._failures = this._goodSamples = 0;
        this._restartTimer = this._eventTimer = 0;
        this._suggestStart = null;
        this._suggestCooldown = 0;
        this._suggestArmed = true;
        this._root = new St.BoxLayout({vertical: true, reactive: true, can_focus: true,
            style_class: 'matci-notch', width: 220, height: 46, clip_to_allocation: true,
            accessible_name: 'matci 메모리 노치'});
        const host=new St.Widget({layout_manager:new ContentLayout(),x_expand:true,y_expand:true});
        this._root.add_child(host);
        this._contentMotion=new ContentMotion(host, actor=>{
            const focus=global.stage.get_key_focus();
            if (focus && actor.contains(focus)) this._root.grab_key_focus();
            const disable=node=>{
                node.reactive=false;
                if (node instanceof St.Widget) node.can_focus=false;
                for (const child of node.get_children()) disable(child);
            };
            disable(actor);
        },()=>this._interface.get_boolean('enable-animations'),Clutter.AnimationMode.EASE_OUT_CUBIC);
        this._root.connect('key-press-event', (_actor, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Escape) {
                this._collapse(); this._indicator.grab_key_focus(); return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        Main.layoutManager.addChrome(this._root, {affectsStruts: false, trackFullscreen: true});
        this._indicator = new PanelMenu.Button(0.0, 'matci 메모리');
        this._indicatorLabel = new St.Label({text: 'RAM', y_align: Clutter.ActorAlign.CENTER});
        this._indicator.add_child(this._indicatorLabel);
        this._indicator.menu.addAction('메모리 노치 열기', () => this._expand(true));
        this._indicator.menu.addAction('matci 앱 열기', () => this._openApp());
        this._indicator.menu.addAction('matci 설정 · 기록', () => this.openPreferences());
        this._indicator.menu.addAction('관측 다시 연결', () => this._restartWorker());
        Main.panel.addToStatusArea(this.uuid, this._indicator);
        this._dock = new DockParticipant({id: this.uuid, actor: this._root, monitor: () => this._monitor(), order: 1,
            onYield: () => this._collapse(), onPlacement: placement => {
                this._indicatorLabel.text = placement.fallback ? `RAM ${percent(this._snapshot?.memory?.used_ratio)}` : 'RAM';
            }});
        this._actions = new CloseController({snapshot: () => this._snapshot,
            uuid: () => GLib.uuid_string_random(), now: () => this._now(),
            protection: (g, s) => this._protection(g, s), groups: s => this._groups(s),
            fresh: () => this._request('sample_now'), recordView: (s, groups) => this._recordView(s, groups),
            request: (type, body) => this._request(type, body), close: window => window.delete(global.get_current_time()),
            delay: ms => this._delay(ms), onReceipt: receipt => { this._lastReceipt = receipt; }, onState: (status, message) => {
                this._message = message; this._actionStatus = status; this._render();
            }});
        this._bridge = new AppBridge({controller: this._actions, groups: () => this._groups(this._snapshot),
            now: () => this._now(), onReview: () => {
                if (this._dock.claim(100)) { this._expanded = true; this._render(); }
            }, onInvalidate: () => this._render()});
        this._desktopService = new DesktopService(this._bridge, () => ({schema_version: 1,
            mode: this._snapshot?.mode ?? 'offline', memory: this._now() - this._receivedAt <= 10000 ? this._snapshot?.memory ?? null : null,
            age_ms: this._snapshot ? Math.max(0, this._now() - this._receivedAt) : null,
            pressure: this._snapshot?.pressure ?? null, sample_id: this._snapshot?.sample_id ?? null,
            apps: publicApps(this._groups(this._snapshot), group => this._protection(group, this._snapshot)),
            busy: this._actions.busy, message: this._message, receipt: this._lastReceipt ?? null}));
        this._connect(Main.layoutManager, 'monitors-changed', () => this._visibility());
        this._connect(this._interface, 'changed::enable-animations',()=>{
            if (!this._interface.get_boolean('enable-animations')) this._contentMotion.finish();
        });
        this._connect(Main.panel, 'notify::height', () => this._visibility());
        this._connect(Main.overview, 'showing', () => this._visibility());
        this._connect(Main.overview, 'hidden', () => this._visibility());
        this._connect(Main.sessionMode, 'updated', () => this._visibility());
        this._connect(global.display, 'in-fullscreen-changed', () => this._visibility());
        this._connect(this._settings, 'changed', (_s, key) => {
            this._bridge.invalidate();
            this._actions.cancel(); this._selected.clear();
            this._suggestStart = null;
            if (key === 'mode') this._restartWorker();
            else { this._message = '설정 변경 · 목록을 다시 확인하세요.'; this._render(); }
        });
        this._sleepSubscription = Gio.DBus.system.signal_subscribe('org.freedesktop.login1',
            'org.freedesktop.login1.Manager', 'PrepareForSleep', '/org/freedesktop/login1', null,
            Gio.DBusSignalFlags.NONE, (_c, _s, _p, _i, _n, args) => {
                if (args.deep_unpack()[0]) { this._sleeping = true; this._stopWorker(); this._collapse(); }
                else if (this._enabled) { this._sleeping = false; this._restartWorker(); }
            });
        this._render();
        this._startWorker();
    }
    _now() { return GLib.get_monotonic_time() / 1000; }
    _openApp() {
        try { Gio.Subprocess.new(['gjs', '-m', `${this.path}/app/main.js`], Gio.SubprocessFlags.NONE); }
        catch (_error) { this._message = '앱 창을 열 수 없습니다. gjs·GTK4 설치를 확인하세요.'; this._render(); }
    }
    _connect(object, signal, callback) { this._signals.push([object, object.connect(signal, callback)]); }
    _monitor() { return Main.layoutManager.monitors[this._settings.get_int('monitor-index')] ?? Main.layoutManager.primaryMonitor; }
    _visibility() {
        if (!this._enabled || !this._dock) return;
        const visible = this._settings.get_boolean('show-notch') && !this._sleeping && !Main.overview.visible &&
            !Main.sessionMode.isLocked && !(this._settings.get_boolean('hide-fullscreen') && this._monitor()?.inFullscreen);
        const width = Math.min(this._expanded ? 500 : 220, Math.max(1, (this._monitor()?.width ?? 800) - 24));
        const height = this._expanded ? 250 : 46;
        const changed = this._geometry?.width !== width || this._geometry?.height !== height;
        if (changed) {
            this._root.remove_all_transitions();
            this._root.ease({width, height, duration: this._interface.get_boolean('enable-animations') ? 320 : 0,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC});
        }
        this._geometry = {width, height};
        // The coordinator owns visibility and placement, including collision fallback.
        const monitor = this._monitor();
        const stateKey = JSON.stringify([width, height, visible, this._expanded,
            monitor?.x, monitor?.y, monitor?.width, monitor?.height, Main.panel.height]);
        if (stateKey !== this._dockStateKey) {
            this._dockStateKey = stateKey;
            this._dock.update({width, height, visible, expanded: this._expanded});
        }
    }
    _expand(manual = false) {
        if (!this._dock.claim(manual ? 100 : 30)) return;
        if (manual && this._eventTimer) { GLib.source_remove(this._eventTimer); this._eventTimer = 0; }
        this._expanded = true; this._render();
        if (manual) this._root.grab_key_focus();
    }
    _collapse() {
        this._expanded = false;
        if (!this._actions?.busy) this._actions?.cancel();
        this._selected.clear(); this._render();
    }
    _label(text, style = 'matci-caption') {
        const label = new St.Label({text: String(text), style_class: style, x_expand: true});
        label.clutter_text.set_line_wrap(true);
        label.clutter_text.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
        label.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
        return label;
    }
    _button(label, action, sensitive = true) {
        const button = new St.Button({label, style_class: 'matci-button', can_focus: sensitive, reactive: sensitive});
        button.connect('clicked', action);
        return button;
    }
    _protection(group, snapshot) {
        return protection(group, snapshot, this._ownerUid, this._settings.get_strv('protected-app-ids'),
            snapshot === this._snapshot ? Math.max(0, this._now() - this._receivedAt) : 0);
    }
    _groups(snapshot) {
        // A demo sample must never touch Shell windows or contain a live window token.
        if (!snapshot || snapshot.mode !== 'live') return [];
        const tracker = Shell.WindowTracker.get_default();
        const appSystem = Shell.AppSystem.get_default();
        const eventTime = global.get_current_time();
        const groups = new Map();
        for (const app of appSystem.get_running()) {
            const appId = app?.get_id();
            if (!appId || !appSystem.lookup_app(appId)) continue;
            for (const window of app.get_windows()) {
                if (!window || window.is_override_redirect()) continue;
                if (!groups.has(appId)) groups.set(appId, {appId, name: app.get_name(), windows: [], processes: [], unmapped: false});
                const group = groups.get(appId);
                group.windows.push(window);
                if (tracker.get_window_app(window)?.get_id() !== appId) group.unmapped = true;
                const matches = snapshot.processes.filter(p => p.pid === window.get_pid());
                if (matches.length !== 1) group.unmapped = true;
                else if (!group.processes.some(p => keyOf(p) === keyOf(matches[0]))) group.processes.push(matches[0]);
            }
        }
        const all = [...groups.values()];
        // Shared PID attribution is ambiguous (including multiple desktop IDs).
        const ownership = new Map();
        for (const group of all)
            for (const process of group.processes) ownership.set(keyOf(process), (ownership.get(keyOf(process)) ?? 0) + 1);
        for (const group of all) {
            const inputAges = group.windows.map(window => interactionAge(window.get_user_time(), eventTime, this._interactionBaseline)).filter(age => age !== null);
            group.interactionAgeMs = inputAges.length ? Math.min(...inputAges) : null;
            if (group.processes.some(p => ownership.get(keyOf(p)) > 1)) group.unmapped = true;
            if (group.unmapped) group.processes = []; // Fail closed; no fabricated metric or executable key.
        }
        return all.slice(0, 100).sort((a, b) => a.name.localeCompare(b.name));
    }
    _recordView(snapshot, groups) {
        return this._request('record_app_view', {sample_id: snapshot.sample_id,
            apps: appView(groups, snapshot, this._ownerUid, this._settings.get_strv('protected-app-ids')),
            user_protected_app_ids: this._settings.get_strv('protected-app-ids')});
    }
    _render() {
        if (!this._enabled) return;
        const content=new St.BoxLayout({vertical:true,x_expand:true,y_expand:true,style_class:'matci-content'});
        const snapshot = this._snapshot;
        const memory = snapshot?.memory;
        const demo = snapshot?.mode === 'demo';
        if (!this._expanded) {
            const button = new St.Button({style_class: 'matci-compact', reactive: true, can_focus: true,
                accessible_name: `matci RAM ${percent(memory?.used_ratio)}${demo ? ' 합성 시연' : ''}`});
            const compact = new St.BoxLayout({style_class: 'matci-header', x_expand: true});
            const bars = new St.BoxLayout({style_class: 'matci-bars', y_align: Clutter.ActorAlign.CENTER});
            for (const height of [7, 16, 11]) bars.add_child(new St.Widget({style_class: 'matci-bar', width: 3, height,
                y_align: Clutter.ActorAlign.END}));
            compact.add_child(bars);
            compact.add_child(this._label(`RAM ${percent(memory?.used_ratio)}`, 'matci-title'));
            compact.add_child(this._label(demo ? '시연' : 'matci', 'matci-caption'));
            button.set_child(compact); button.connect('clicked', () => this._expand(true)); content.add_child(button);
        } else {
            const header = new St.BoxLayout({style_class: 'matci-header'});
            header.add_child(this._label(`matci · ${demo ? '합성 시연 · 실제 제어 없음' : '전체 RAM 관측'}`, 'matci-title'));
            header.add_child(this._button('설정', () => this.openPreferences()));
            header.add_child(this._button('앱 열기 ↗', () => this._openApp()));
            header.add_child(this._button('접기', () => this._collapse()));
            content.add_child(header);
            content.add_child(this._label(`${percent(memory?.used_ratio)} 사용 · 가용 ${bytes(memory?.available_bytes)} / 전체 ${bytes(memory?.total_bytes)}`, 'matci-metric'));
            content.add_child(this._label('전체: MemTotal − MemAvailable · 앱 점유는 확보 보장량이 아닙니다.'));
            const scroll = new St.ScrollView({style_class: 'matci-scroll', x_expand: true, y_expand: true,
                hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC});
            const list = new St.BoxLayout({vertical: true, style_class: 'matci-list'});
            scroll.set_child(list);
            const review = this._actions?.review;
            if (review) {
                list.add_child(this._label('선택한 앱의 아래 모든 창에 정상 닫기를 요청합니다.', 'matci-title'));
                for (const group of review.groups)
                    list.add_child(this._label(`${group.name} · ${group.windows.length}개 창 (제목은 저장하지 않음)`));
                list.add_child(this._label('미저장 작업·재생·다운로드를 확인하세요. 새 창이 생기면 요청을 거부합니다.'));
            } else if (demo) {
                list.add_child(this._label('합성 프로세스 데이터입니다. 실제 앱 선택이나 닫기 요청을 만들지 않습니다.'));
                for (const p of (snapshot?.processes ?? []).slice(0, 20))
                    list.add_child(this._label(`${p.comm ?? '시연 프로세스'} · ${bytes(p.memory_bytes)} · ${p.metric_kind?.toUpperCase() ?? '미확인'}`));
            } else {
                const groups = this._groups(snapshot);
                for (const group of groups) {
                    const reason = this._protection(group, snapshot);
                    if (reason) this._selected.delete(group.appId);
                    const row = new St.BoxLayout({style_class: 'matci-app-row'});
                    const selected = this._selected.has(group.appId);
                    const shellApp = Shell.AppSystem.get_default().lookup_app(group.appId);
                    if (shellApp) row.add_child(shellApp.create_icon_texture(24));
                    const select = this._button(`${selected ? '☑' : '☐'} ${group.name.slice(0, 32)} · ${group.windows.length}창`, () => {
                        if (this._selected.has(group.appId)) this._selected.delete(group.appId); else this._selected.add(group.appId);
                        this._render();
                    }, !reason && !this._actions.busy);
                    select.accessible_name = `${group.name}, ${selected ? '선택됨' : '선택 안 됨'}, ${reason ?? '수동 검토 필요'}`;
                    row.add_child(select);
                    const metrics = group.processes;
                    const kinds = new Set(metrics.map(p => p.metric_kind));
                    const value = metrics.length && kinds.size === 1 && metrics.every(p => Number.isFinite(p.memory_bytes)) ?
                        metrics.reduce((sum, p) => sum + p.memory_bytes, 0) : null;
                    const ages = metrics.map(p => p.metric_age_ms);
                    const age = ages.length && ages.every(Number.isFinite) ? `${Math.round(Math.max(...ages) / 1000)}초 전` : '시각 미확인';
                    row.add_child(this._label(`${bytes(value)} · ${kinds.size === 1 ? [...kinds][0]?.toUpperCase() : '혼합/미확인'} · ${age}`, 'matci-caption'));
                    list.add_child(row);
                    if (reason) list.add_child(this._label(`보호: ${reason}`, 'matci-protected'));
                    const inputAge = group.interactionAgeMs;
                    const interaction = inputAge === null ? '최근 입력 시각 미확인' : inputAge < 60000 ?
                        `최근 입력 ${Math.floor(inputAge / 1000)}초 전` : `최근 입력 ${Math.floor(inputAge / 60000)}분 전`;
                    list.add_child(this._label(`${interaction} · 입력 없음은 작업 완료를 뜻하지 않음`));
                    if (!reason) list.add_child(this._label('선택한 창 PID만 관측 · 하위 프로세스 전체 점유 미확인'));
                }
                if (!groups.length) list.add_child(this._label('현재 매핑 가능한 창이 없습니다. 다음 관측을 기다리세요.'));
            }
            list.add_child(this._label(this._message, 'matci-status'));
            content.add_child(scroll);
            const controls = new St.BoxLayout({style_class: 'matci-controls'});
            if (review) {
                controls.add_child(this._button('취소', () => { this._actions.cancel(); this._render(); }));
                controls.add_child(this._button('정상 닫기 요청', () => this._confirm(), !this._actions.busy));
            } else {
                controls.add_child(this._button('새로고침', () => this._refresh(), Boolean(snapshot) && !this._actions.busy));
                controls.add_child(this._button(`선택 ${this._selected.size}개 검토`, () => this._review(), !demo && this._selected.size > 0 && !this._actions.busy));
            }
            content.add_child(controls);
        }
        this._root.accessible_name = `matci ${demo ? '합성 시연' : '메모리'}. ${percent(memory?.used_ratio)} 사용. ${this._message}`;
        const scene=!this._expanded?'compact':this._actions?.review?'review':this._actions?.busy?'observing':this._actionStatus??'overview';
        this._contentMotion.show(content,`${scene}:${snapshot?.mode??'offline'}`);
        this._visibility();
    }
    _review() {
        this._bridge?.invalidate();
        if (!this._dock.claim(100)) return;
        try {
            this._actions.prepare(this._groups(this._snapshot).filter(g => this._selected.has(g.appId)));
            this._message = '명시적으로 확인한 경우에만 닫기를 요청합니다.';
        } catch (error) { this._message = error.message; }
        this._render();
    }
    async _confirm() {
        if (!this._dock.claim(100)) return;
        try { await this._actions.confirm(); }
        catch (_error) { /* Controller supplies the visible reason. */ }
        this._selected.clear(); this._render();
    }
    async _refresh() {
        try { await this._request('sample_now'); }
        catch (_error) { this._message = '관측 갱신 실패 · 다시 연결하세요.'; this._render(); }
    }
    _suggest(snapshot) {
        if (!this._settings.get_boolean('auto-suggestions') || snapshot.mode !== 'live' || this._actions.busy) return;
        const ratio = snapshot.memory?.used_ratio;
        const now = this._now();
        const threshold = this._settings.get_int('threshold') / 100;
        if (!Number.isFinite(ratio)) { this._suggestStart = null; return; }
        if (ratio < Math.max(0, threshold - .10)) { this._suggestArmed = true; this._suggestStart = null; return; }
        if (ratio < threshold) { this._suggestStart = null; return; }
        if (this._suggestStart === null) this._suggestStart = now;
        if (this._suggestArmed && now - this._suggestStart >= 30000 && now >= this._suggestCooldown && !this._expanded) {
            this._suggestArmed = false; this._suggestCooldown = now + 600000;
            this._message = '메모리 사용이 30초 이상 높습니다. 확인을 제안합니다. 자동으로 앱을 닫지 않습니다.';
            this._expand(false); // Priority 30 cannot steal a manual review or keyboard focus.
            if (this._expanded) this._eventTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 6000, () => {
                this._eventTimer = 0; if (!this._actions.review && !this._actions.busy) this._collapse(); return GLib.SOURCE_REMOVE;
            });
        }
    }
    _startWorker() {
        if (!this._enabled || this._sleeping || this._worker) return;
        const generation = ++this._generation;
        this._cancellable = new Gio.Cancellable();
        this._session = null;
        this._stdoutText = '';
        this._decoder = new TextDecoder();
        this._goodSamples = 0;
        this._interactionBaseline = global.get_current_time();
        try {
            const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE});
            launcher.set_cwd(this.path);
            this._worker = launcher.spawnv(['python3', '-u', '-m', 'matci', '--watch', '--mode', this._settings.get_string('mode'), '--interval', '5']);
            this._input = this._worker.get_stdout_pipe();
            this._output = this._worker.get_stdin_pipe();
            this._readChunk(generation);
            const worker = this._worker;
            worker.wait_async(null, (source, result) => {
                try { source.wait_finish(result); } catch (_error) { /* EOF still schedules restart. */ }
                if (this._enabled && generation === this._generation) this._workerFailed('관측 연결이 종료되었습니다.');
            });
        } catch (_error) { this._workerFailed('Python 관측기를 시작하지 못했습니다. 설치 경로를 확인하세요.'); }
    }
    _readChunk(generation) {
        if (!this._enabled || generation !== this._generation) return;
        this._input.read_bytes_async(8192, GLib.PRIORITY_DEFAULT, this._cancellable, (source, result) => {
            if (!this._enabled || generation !== this._generation) return;
            try {
                const chunk = source.read_bytes_finish(result).get_data();
                if (!chunk.length) { this._workerFailed('관측 스트림이 종료되었습니다.'); return; }
                this._stdoutText += this._decoder.decode(chunk, {stream: true});
                let newline;
                while ((newline = this._stdoutText.indexOf('\n')) >= 0) {
                    if (newline > MAX_LINE) throw new Error('line limit');
                    const line = this._stdoutText.slice(0, newline);
                    if (new TextEncoder().encode(line).length > MAX_LINE) throw new Error('line byte limit');
                    this._stdoutText = this._stdoutText.slice(newline + 1);
                    if (line.trim()) this._incoming(JSON.parse(line));
                }
                if (new TextEncoder().encode(this._stdoutText).length > MAX_LINE) throw new Error('line limit');
                this._readChunk(generation);
            } catch (_error) { this._workerFailed('관측 응답이 유효하지 않습니다. 안전하게 다시 연결합니다.'); }
        });
    }
    _incoming(message) {
        if (message.schema_version !== 1 || !['snapshot', 'ack', 'error'].includes(message.type)) throw new Error('protocol');
        if (message.type === 'snapshot') {
            if (!message.session_id || !message.sample_id || !message.boot_id || !Number.isFinite(message.monotonic_ms) ||
                !Array.isArray(message.processes) || message.processes.length > 256 ||
                message.mode !== this._settings.get_string('mode')) throw new Error('snapshot');
            if (this._session && message.session_id !== this._session) throw new Error('session changed');
            this._session = message.session_id;
            this._snapshot = message;
            this._receivedAt = this._now();
            if (++this._goodSamples >= 3) this._failures = 0;
            if (!this._actions.busy && !this._actions.review) this._message = message.mode === 'demo' ? '합성 시연 · 실제 메모리/앱 제어 아님' :
                `${message.health} · PSI some ${message.pressure?.some_avg10 ?? '확인 불가'} · 관측 갱신됨`;
            this._suggest(message);
            // Preserve keyboard focus on confirmation and observation controls.
            // Fresh samples still replace the underlying identity for close checks.
            if (!this._actions.review && !this._actions.busy) this._render();
        } else if (message.session_id !== this._session) throw new Error('wrong session');
        if (message.request_id) {
            const pending = this._pending.get(message.request_id);
            if (pending) {
                GLib.source_remove(pending.timer); this._pending.delete(message.request_id);
                if (message.type === 'error') {
                    const code = typeof message.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(message.code) ? message.code : 'REQUEST_REJECTED';
                    pending.reject(new Error(`기록 또는 관측 요청 거부 · ${code}`));
                }
                else pending.resolve(message);
            }
        }
    }
    _request(type, body = {}) {
        if (!this._enabled || !this._worker || !this._session || this._queue.length >= 128 || this._pending.size >= 128)
            return Promise.reject(new Error('관측 연결 준비가 필요합니다.'));
        const requestId = GLib.uuid_string_random();
        const message = {schema_version: 1, type, request_id: requestId, session_id: this._session, ...body};
        return new Promise((resolve, reject) => {
            const timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10000, () => {
                this._pending.delete(requestId); reject(new Error('관측 요청 시간 초과')); return GLib.SOURCE_REMOVE;
            });
            this._pending.set(requestId, {resolve, reject, timer});
            this._queue.push(new TextEncoder().encode(`${JSON.stringify(message)}\n`));
            this._writeNext(this._generation);
        });
    }
    _writeNext(generation) {
        if (this._writing || !this._queue.length || generation !== this._generation) return;
        this._writing = true;
        this._output.write_all_async(this._queue.shift(), GLib.PRIORITY_DEFAULT, this._cancellable, (source, result) => {
            if (!this._enabled || generation !== this._generation) return;
            try { source.write_all_finish(result); this._writing = false; this._writeNext(generation); }
            catch (_error) { this._workerFailed('관측 요청 전송이 중단되었습니다.'); }
        });
    }
    _delay(ms) {
        return new Promise((resolve, reject) => {
            const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
                this._delays.delete(id); resolve(); return GLib.SOURCE_REMOVE;
            });
            this._delays.set(id, reject);
        });
    }
    _workerFailed(message) {
        if (!this._enabled) return;
        this._stopWorker(); this._message = message; this._render();
        const wait = Math.min(60, 5 * 2 ** Math.min(this._failures++, 4));
        this._restartTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, wait, () => {
            this._restartTimer = 0; this._startWorker(); return GLib.SOURCE_REMOVE;
        });
    }
    _restartWorker() { this._stopWorker(); this._startWorker(); }
    _stopWorker() {
        this._generation++;
        this._bridge?.invalidate(); this._lastReceipt = null;
        this._actions?.cancel();
        for (const name of ['_restartTimer', '_eventTimer']) {
            if (this[name]) GLib.source_remove(this[name]); this[name] = 0;
        }
        for (const pending of this._pending.values()) {
            GLib.source_remove(pending.timer); pending.reject(new Error('관측 연결이 변경되었습니다.'));
        }
        this._pending.clear();
        for (const [id, reject] of this._delays) { GLib.source_remove(id); reject(new Error('관측 중단')); }
        this._delays.clear();
        this._cancellable?.cancel();
        // Only our own read-only worker is terminated. User apps only receive Meta.Window.delete.
        try { this._worker?.force_exit(); } catch (_error) {}
        this._worker = this._input = this._output = this._cancellable = null;
        this._snapshot = this._session = null;
        this._queue = []; this._writing = false;
        this._suggestStart = null; this._suggestArmed = true; this._suggestCooldown = 0;
    }
    disable() {
        this._enabled = false;
        this._desktopService?.destroy(); this._desktopService = this._bridge = null;
        this._stopWorker();
        if (this._sleepSubscription) Gio.DBus.system.signal_unsubscribe(this._sleepSubscription);
        this._sleepSubscription = 0;
        for (const [object, id] of this._signals) object.disconnect(id);
        this._signals = [];
        this._dock?.destroy(); this._dock = null;
        this._contentMotion?.destroy(); this._contentMotion=null;
        this._root?.destroy(); this._root = null;
        this._indicator?.destroy(); this._indicator = null;
        this._settings = this._interface = this._actions = null;
    }
}
