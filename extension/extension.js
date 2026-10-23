import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import {ensureActorVisibleInScrollView} from 'resource:///org/gnome/shell/misc/animationUtils.js';
import Shell from 'gi://Shell';
import Pango from 'gi://Pango';
import {DockParticipant, easeOnCurve} from './notchDock.js';
import {isActorWithin} from './dockModel.js';
import {DESIGN} from './designTokens.js';
import {CloseController} from './actions.js';
import {protection, appView, appMetrics, attachMembers, lowAccuracy, healthText, keyOf, interactionAge, takeLines} from './policy.js';

const MAX_LINE = 262144;
// Widgets measured before their first style pass report short heights; style the tree first.
const ensureStyle = actor => {
    actor.ensure_style?.();
    actor.get_children().forEach(ensureStyle);
};
// 2^30-byte values labelled GB, as memory UIs (JEDEC, macOS Activity Monitor) do.
const bytes = n => n === null || n === undefined ? '—' : `${(n / 1073741824).toFixed(2)} GB`;
// Metric names stay out of the visible row; screen readers still get the kind.
const metricKind = kind => ({pss: 'PSS 비례 배분 기준', rss: 'RSS 상주 메모리 기준',
    mixed: 'PSS 기준, 일부 RSS 포함이라 실제보다 클 수 있음'})[kind] ?? '기준 미확인';
// Must match .matci-notch padding in stylesheet.css.in. The header row centres the title on the
// 28 px tools, so a small top pad keeps the first glyphs right under the panel.
const PAD_TOP = 10, PAD_SIDE = 16, PAD_BOTTOM = 12;
const percent = n => Number.isFinite(n) ? `${Math.round(n * 100)}%` : '—';
const hardwareText = hardware => `CPU 온도 ${Number.isFinite(hardware?.cpu_temperature_c) ?
    `${Math.round(hardware.cpu_temperature_c)}°C` : '—'} · 팬 속도 ${Number.isFinite(hardware?.cpu_fan_rpm) ?
    `${Math.round(hardware.cpu_fan_rpm).toLocaleString('ko-KR')} RPM` : '—'}`;
const hardwareAvailable = hardware => Number.isFinite(hardware?.cpu_temperature_c) ||
    Number.isFinite(hardware?.cpu_fan_rpm);
const hardwareAccessibleText = hardware => `CPU 온도 ${Number.isFinite(hardware?.cpu_temperature_c) ?
    `섭씨 ${Math.round(hardware.cpu_temperature_c)}도` : '측정 불가'}, 팬 속도 ${Number.isFinite(hardware?.cpu_fan_rpm) ?
    `분당 ${Math.round(hardware.cpu_fan_rpm)}회전` : '측정 불가'}`;

export default class Matci extends Extension {
    enable() {
        this._enabled = true;
        this._shellEnding = false;
        this._clearPendingRelogin();
        this._generation = (this._generation ?? 0) + 1;
        this._signals = [];
        this._pending = new Map();
        this._delays = new Map();
        this._queue = [];
        this._writing = false;
        this._settings = this.getSettings();
        this._interface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._ownerUid = new Gio.Credentials().get_unix_user();
        this._snapshot = null;
        this._panelSnapshot = null;
        this._receivedAt = 0;
        this._detailPaused = false;
        this._detailLoading = false;
        this._detailError = false;
        this._detailDesired = false;
        this._detailCommandSupported = null;
        this._detailRequestMode = null;
        this._detailApplying = false;
        this._detailInitialized = false;
        this._actionStatus = this._actionMessage = null;
        this._expanded = false;
        this._returnWindow = null;
        this._scrollView = null;
        this._sensorLabel = null;
        this._brand = null;
        this._brandAccessibleBase = null;
        this._rowButtons = new Map();
        this._roleButtons = new Map();
        this._rowOrder = [];
        this._sleeping = false;
        this._selected = new Set();
        this._renderedExpanded = false;
        this._closingTimer = 0;
        this._message = '메모리 관측 연결 중';
        this._failures = this._goodSamples = 0;
        this._restartTimer = this._eventTimer = 0;
        this._suggestStart = null;
        this._suggestCooldown = 0;
        this._suggestArmed = true;
        this._suggestion = null;
        this._renderedSignature = null;
        this._root = new St.BoxLayout({vertical: true, reactive: false, can_focus: false,
            style_class: 'matci-notch', clip_to_allocation: true,
            accessible_name: 'matci 메모리 노치'});
        // Tab/arrow navigation inside the notch; St drops the group when the root is destroyed.
        global.focus_manager.add_group(this._root);
        const staleIndicator = Main.panel.statusArea[this.uuid];
        if (staleIndicator) {
            Main.panel.statusArea[this.uuid] = null;
            staleIndicator.destroy();
        }
        this._indicator = new PanelMenu.Button(0.0, 'matci 메모리', true);
        this._indicator.can_focus = true;
        this._indicator.add_style_class_name('matci-panel-button');
        const panelStatus = new St.BoxLayout({style_class: 'matci-panel-status'});
        // A RAM module says what the percentage measures; the stock monitor icon read as CPU.
        this._ramIcon = Gio.icon_new_for_string(GLib.build_filenamev([this.path, 'icons', 'matci-ram-symbolic.svg']));
        this._indicatorIcon = new St.Icon({gicon: this._ramIcon, icon_size: 16});
        this._indicatorLabel = new St.Label({text: '—', y_align: Clutter.ActorAlign.CENTER});
        panelStatus.add_child(this._indicatorIcon);
        panelStatus.add_child(this._indicatorLabel);
        this._indicator.add_child(panelStatus);
        const toggle = () => {
            if (this._expanded) this._collapse(true); else this._expand(true);
            return Clutter.EVENT_STOP;
        };
        this._connect(this._indicator, 'button-press-event', toggle);
        this._connect(this._indicator, 'touch-event', (_actor, event) =>
            event.type() === Clutter.EventType.TOUCH_BEGIN ? toggle() : Clutter.EVENT_PROPAGATE);
        this._connect(this._indicator, 'key-press-event', (_actor, event) => {
            if (![Clutter.KEY_Return, Clutter.KEY_space, Clutter.KEY_KP_Enter].includes(event.get_key_symbol()))
                return Clutter.EVENT_PROPAGATE;
            toggle();
            if (!this._expanded) this._indicator.grab_key_focus();
            return Clutter.EVENT_STOP;
        });
        Main.panel.addToStatusArea(this.uuid, this._indicator);
        this._dock = new DockParticipant({id: this.uuid, content: this._root, monitor: () => this._monitor(), order: 1,
            triggerActor: () => this._indicator,
            onShellShutdown: () => this._beginShellShutdown(),
            onOutside: () => this._collapse(false, {keepReview: true}),
            onYield: () => this._collapse(false, {keepReview: true})});
        // Global shortcut (numpad Add by default). The Shell grab keeps the key from apps.
        Main.wm.addKeybinding('matci-toggle-shortcut', this._settings, Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL, toggle);
        this._actions = new CloseController({snapshot: () => this._snapshot,
            uuid: () => GLib.uuid_string_random(), now: () => this._now(),
            protection: (g, s) => this._protection(g, s), groups: s => this._groups(s),
            fresh: () => this._request('sample_now'), recordView: (s, groups) => this._recordView(s, groups),
            request: (type, body) => this._request(type, body), close: window => window.delete(global.get_current_time()),
            delay: ms => this._delay(ms), onState: (status, message) => {
                // The outcome keeps its own text; the next sample's '관측 갱신됨' must not erase it.
                this._message = message; this._actionMessage = message; this._actionStatus = status; this._render();
                if (status !== 'observing') this._announce(message);
            }});
        this._connect(Main.panel, 'destroy', () => this._beginShellShutdown());
        this._connect(this._root, 'destroy', () => this._beginShellShutdown());
        this._connect(this._indicator, 'destroy', () => this._beginShellShutdown());
        // The non-reactive root is :insensitive and never receives key events, so Escape is
        // caught at the stage while focus is inside the notch.
        this._connect(global.stage, 'key-press-event', (_stage, event) => {
            if (event.get_key_symbol() !== Clutter.KEY_Escape || !isActorWithin(global.stage.get_key_focus(), this._root))
                return Clutter.EVENT_PROPAGATE;
            this._collapse(true);
            return Clutter.EVENT_STOP;
        });
        this._connect(Main.layoutManager, 'monitors-changed', () => this._visibility());
        this._connect(Main.panel, 'notify::height', () => this._visibility());
        this._connect(Main.overview, 'showing', () => this._onOverviewShowing());
        this._connect(Main.overview, 'hidden', () => this._visibility());
        this._connect(Main.sessionMode, 'updated', () => this._visibility());
        this._connect(global.display, 'in-fullscreen-changed', () => this._onFullscreenChanged());
        this._connect(this._settings, 'changed', (_s, key) => {
            this._actions.cancel(); this._selected.clear();
            this._suggestStart = null;
            if (key === 'mode') this._restartWorker();
            else { this._message = '설정 변경 · 목록을 다시 확인하세요.'; this._render(); }
        });
        this._connect(this._interface, 'changed::color-scheme', () => this._render());
        this._connect(this._interface, 'changed::gtk-theme', () => this._render());
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
    _connect(object, signal, callback) { this._signals.push([object, object.connect(signal, callback)]); }
    _beginShellShutdown() {
        if (this._shellEnding) return;
        this._shellEnding = true;
        this._enabled = false;
        this._sleeping = true;
        if (this._closingTimer) GLib.source_remove(this._closingTimer);
        this._closingTimer = 0;
        this._dock?.dock?.shutdown();
        this._stopWorker();
        if (this._sleepSubscription) Gio.DBus.system.signal_unsubscribe(this._sleepSubscription);
        this._sleepSubscription = 0;
    }
    _openPreferences() {
        try {
            Promise.resolve(this.openPreferences()).catch(error =>
                console.warn(`[matci] 설정을 열지 못했습니다: ${error.message}`));
        } catch (error) {
            console.warn(`[matci] 설정을 열지 못했습니다: ${error.message}`);
        }
    }
    _clearPendingRelogin() {
        const path = GLib.build_filenamev([GLib.get_user_state_dir(), 'matci', 'pending-relogin.json']);
        try {
            const [, contents] = Gio.File.new_for_path(path).load_contents(null);
            const marker = JSON.parse(new TextDecoder().decode(contents));
            if (Number(marker.installed) === Number(this.metadata.version))
                Gio.File.new_for_path(path).delete(null);
        } catch (_error) {
            // Keep unmatched or unreadable markers for the next diagnostic run.
        }
    }
    _updatePanel() {
        if (!this._enabled || this._shellEnding) return;
        const value = percent((this._panelSnapshot ?? this._snapshot)?.memory?.used_ratio);
        this._indicatorLabel.text = this._versionMismatch ? '!' : value;
        this._indicatorIcon.gicon = this._versionMismatch ? Gio.ThemedIcon.new('dialog-warning-symbolic') : this._ramIcon;
        // Orange only under real memory pressure (PSI), the same rule as the meter in the notch.
        const psi = (this._panelSnapshot ?? this._snapshot)?.pressure?.some_avg10;
        if (Number.isFinite(psi) && psi >= 1 && !this._versionMismatch) this._indicatorIcon.add_style_class_name('matci-panel-warning');
        else this._indicatorIcon.remove_style_class_name('matci-panel-warning');
        this._indicator.accessible_name = this._versionMismatch ? `matci 오류 · ${this._message}` :
            `matci RAM ${value}. 상세 ${this._expanded ? '접기' : '열기'}`;
    }
    _monitor() { return Main.layoutManager.monitors[this._settings.get_int('monitor-index')] ?? Main.layoutManager.primaryMonitor; }
    _visibility() {
        if (!this._enabled || this._shellEnding || !this._dock) return;
        const visible = this._settings.get_boolean('show-notch') && this._expanded && !this._sleeping && !Main.overview.visible &&
            !Main.sessionMode.isLocked && !(this._settings.get_boolean('hide-fullscreen') && this._monitor()?.inFullscreen);
        const width = Math.min(DESIGN.geometry.matciExpanded, Math.max(1, (this._monitor()?.width ?? 800) - 24));
        const height = this._expanded ? (this._contentHeight ?? 240) : 1;
        // The coordinator owns visibility and placement, including collision fallback.
        this._dock.update({width, height, visible, expanded: this._expanded});
    }
    _onOverviewShowing() {
        if (this._expanded) this._collapse(false, {keepReview: true});
        else this._visibility();
    }
    _onFullscreenChanged() {
        if (this._settings.get_boolean('hide-fullscreen') && this._monitor()?.inFullscreen && this._expanded)
            this._collapse(false, {keepReview: true});
        else this._visibility();
    }
    _expand(manual = false) {
        if (!this._dock.claim(manual ? 100 : 30)) return;
        if (manual && this._eventTimer) { GLib.source_remove(this._eventTimer); this._eventTimer = 0; }
        if (manual) this._suggestion = null;
        this._returnWindow = global.display.get_focus_window();
        this._expanded = true;
        this._rowOrder = [];
        this._setDetail(true);
        if (manual && this._dock.state.visible) this._focusPrimary();
    }
    // Opening lands on the header anchor (the memory summary is read first), never on the insensitive root.
    _focusPrimary() {
        const target = this._roleButtons.get('anchor') ?? this._roleButtons.get('collapse');
        if (target?.can_focus) target.grab_key_focus();
    }
    _releaseFocus() {
        const focus = global.stage.get_key_focus();
        if (!isActorWithin(focus, this._root) && focus !== this._indicator) return;
        global.stage.set_key_focus(null);
        const win = this._returnWindow;
        this._returnWindow = null;
        if (win && !win.minimized && win.get_workspace?.() === global.workspace_manager.get_active_workspace())
            win.focus(global.get_current_time());
    }
    _collapse(restoreFocus = false, {keepReview = false} = {}) {
        this._expanded = false;
        this._suggestion = null;
        if (!keepReview && !this._actions?.busy) this._actions?.cancel();
        if (!this._actions?.busy) this._actionStatus = this._actionMessage = null;
        if (!keepReview) this._selected.clear();
        this._render();
        if (restoreFocus) this._releaseFocus();
        if (!this._actions?.review && !this._actions?.busy) this._setDetail(false);
    }
    async _setDetail(detail) {
        this._detailDesired = detail;
        if (detail && this._detailCommandSupported !== false) {
            this._detailLoading = true;
            this._detailError = false;
        }
        if (this._expanded) this._render();
        if (this._detailCommandSupported === false) {
            this._detailPaused = false;
            this._detailLoading = false;
            if (this._expanded) this._render();
            return;
        }
        if (!this._worker || !this._session || this._detailApplying || this._detailRequestMode === detail) return;
        const generation = this._generation;
        this._detailApplying = true;
        try {
            while (generation === this._generation && this._worker && this._session &&
                this._detailCommandSupported !== false && this._detailRequestMode !== this._detailDesired) {
                const requested = this._detailDesired;
                try {
                    const response = await this._request('set_detail', {detail: requested});
                    if (generation !== this._generation) return;
                    this._detailCommandSupported = true;
                    this._detailRequestMode = requested;
                    if (this._detailDesired === requested) {
                        this._detailPaused = response.warnings?.includes('PROCESS_DETAIL_PAUSED') ?? false;
                        this._detailLoading = requested && this._detailPaused;
                        if (!this._detailPaused) this._detailError = false;
                    }
                } catch (error) {
                    if (generation !== this._generation) return;
                    if (error?.message?.includes('COMMAND_NOT_SUPPORTED')) {
                        this._detailCommandSupported = false;
                        this._detailPaused = false;
                        this._detailLoading = false;
                        this._detailError = false;
                    } else if (this._detailDesired === requested) {
                        this._detailLoading = false;
                        this._detailPaused = requested;
                        this._detailError = requested;
                        if (requested) this._message = '상세 프로세스 목록을 가져오지 못했습니다. 다시 시도하세요.';
                        break;
                    } else {
                        // A stale command failed after the user changed visibility; retry the latest mode.
                        this._detailRequestMode = null;
                    }
                }
            }
        } finally {
            if (generation === this._generation) {
                this._detailApplying = false;
                if (this._expanded) this._render();
            }
        }
    }
    _label(text, style = 'matci-caption') {
        const label = new St.Label({text: String(text), style_class: style, x_expand: true});
        label.clutter_text.set_line_wrap(true);
        label.clutter_text.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
        label.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
        return label;
    }
    _appIcon(app, size) {
        try {
            const icon = app.create_icon_texture(size);
            icon.add_style_class_name('matci-app-icon');
            return icon;
        } catch (_error) {
            return new St.Icon({icon_name: 'application-x-executable-symbolic', icon_size: size});
        }
    }
    // No figure yet: say what is wrong and what happens next, instead of a big dash and an empty meter.
    _problemCard() {
        const stopped = !this._worker && !this._versionMismatch;
        const card = new St.BoxLayout({style_class: 'matci-problem'});
        card.add_child(new St.Icon({icon_name: stopped || this._versionMismatch ? 'dialog-warning-symbolic' : 'content-loading-symbolic',
            icon_size: 16, style_class: stopped || this._versionMismatch ? 'matci-problem-icon' : 'matci-problem-icon-quiet',
            y_align: Clutter.ActorAlign.START}));
        const text = new St.BoxLayout({vertical: true, x_expand: true, style_class: 'matci-problem-text'});
        text.add_child(this._label(this._versionMismatch ? '확장과 관측기 버전이 다릅니다' :
            stopped ? '메모리 관측이 멈췄습니다' : '메모리 관측을 시작하는 중', 'matci-problem-title'));
        const detail = this._versionMismatch ? '다시 로그인하면 같은 버전으로 맞춰집니다.' :
            stopped ? `${this._message} 잠시 뒤 자동으로 다시 연결합니다.` : '';
        if (detail) text.add_child(this._label(detail, 'matci-status'));
        card.add_child(text);
        if (stopped) {
            card.add_child(this._tagRole(this._button('지금 다시 연결', () => this._refresh()), 'refresh'));
            card.get_last_child().y_align = Clutter.ActorAlign.START;
        }
        return card;
    }
    _button(label, action, sensitive = true) {
        const button = new St.Button({label, style_class: 'matci-button', can_focus: sensitive, reactive: sensitive});
        button.connect('clicked', action);
        return button;
    }
    _iconButton(iconName, accessibleName, action, sensitive = true, role = null) {
        const button = new St.Button({style_class: 'matci-icon-button', can_focus: sensitive,
            reactive: sensitive, accessible_name: accessibleName,
            child: new St.Icon({icon_name: iconName, icon_size: DESIGN.control.icon})});
        this._tagRole(button, role);
        button.connect('clicked', action);
        return button;
    }
    _tagRole(button, role) {
        if (role) {
            button._matciRole = role;
            this._roleButtons.set(role, button);
        }
        return button;
    }
    _scrollAdjustment(scroll) {
        try {
            const adjustment = scroll?.vscroll?.adjustment;
            if (adjustment) return adjustment;
        } catch { /* GNOME versions expose the vertical adjustment differently. */ }
        try { return scroll?.vadjustment ?? null; }
        catch { return null; }
    }
    _isWithin(actor, ancestor) {
        for (let current = actor; current; current = current.get_parent?.())
            if (current === ancestor) return true;
        return false;
    }
    _protection(group, snapshot) {
        if (snapshot?.warnings?.includes('PROCESS_DETAIL_PAUSED')) return '상세 프로세스 관측이 일시 중지됨';
        return protection(group, snapshot, this._ownerUid, this._settings.get_strv('protected-app-ids'),
            snapshot === this._snapshot ? Math.max(0, this._now() - this._receivedAt) : 0);
    }
    _groups(snapshot) {
        // A demo sample must never touch Shell windows or contain a live window token.
        if (!this._enabled || this._shellEnding || !snapshot || snapshot.mode !== 'live' ||
            snapshot.warnings?.includes('PROCESS_DETAIL_PAUSED')) return [];
        const tracker = Shell.WindowTracker.get_default();
        const appSystem = Shell.AppSystem.get_default();
        const eventTime = global.get_current_time();
        const groups = new Map();
        const windowPids = new Set();
        for (const app of appSystem.get_running()) {
            const appId = app?.get_id();
            if (!appId || !appSystem.lookup_app(appId)) continue;
            for (const window of app.get_windows()) {
                if (!window || window.is_override_redirect()) continue;
                if (!groups.has(appId)) groups.set(appId, {appId, app, name: app.get_name(), windows: [], processes: [], unmapped: false});
                const group = groups.get(appId);
                group.windows.push(window);
                windowPids.add(window.get_pid());
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
        // Memory shown per row counts the whole process tree (content processes, renderers); the close
        // gate above still keys on the window processes only, so a helper spawning mid-review is harmless.
        attachMembers(all, snapshot.processes, windowPids);
        return all.slice(0, 100).sort((a, b) => a.name.localeCompare(b.name));
    }
    _recordView(snapshot, groups) {
        return this._request('record_app_view', {sample_id: snapshot.sample_id,
            apps: appView(groups, snapshot, this._ownerUid, this._settings.get_strv('protected-app-ids')),
            user_protected_app_ids: this._settings.get_strv('protected-app-ids')});
    }
    _render() {
        if (!this._enabled || this._shellEnding) return;
        if (!this._expanded && this._closingTimer) {
            this._updatePanel();
            this._visibility();
            return;
        }
        if (this._expanded && this._closingTimer) {
            GLib.source_remove(this._closingTimer);
            this._closingTimer = 0;
        }
        // With keyboard focus in the list, a sample that changes nothing visible must not rebuild the
        // rows: a rebuild re-grabs focus and makes Orca read the same row every 5 seconds.
        if (this._expanded && this._renderedExpanded && isActorWithin(global.stage.get_key_focus(), this._root) &&
            this._listSignature() === this._renderedSignature) {
            this._updatePanel();
            this._updateHardwareReadout();
            return;
        }
        if (!this._expanded && this._renderedExpanded && this._interface.get_boolean('enable-animations')) {
            // Keep the current content for the short reverse morph; clipping follows the shrinking surface.
            // Controls stop accepting input as soon as the expanded state is dismissed.
            this._renderedExpanded = false;
            this._rowButtons.clear();
            this._roleButtons.clear();
            this._scrollView = null;
            for (const child of this._root.get_children()) {
                const descendants = [child];
                while (descendants.length) {
                    const actor = descendants.pop();
                    actor.reactive = false;
                    actor.can_focus = false;
                    descendants.push(...actor.get_children());
                }
                // One short fade on the slab's curve; the retracting slab clips the rest.
                easeOnCurve(child, {opacity: 0, duration: DESIGN.motion.micro});
            }
            this._contentHeight = 1;
            this._updatePanel();
            this._visibility();
            this._closingTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DESIGN.motion.collapse, () => {
                this._closingTimer = 0;
                if (this._enabled && !this._expanded && this._root) {
                    for (const child of this._root.get_children()) child.destroy();
                }
                return GLib.SOURCE_REMOVE;
            });
            return;
        }
        const oldAdjustment = this._scrollAdjustment(this._scrollView);
        const oldScrollValue = Number(oldAdjustment?.value);
        const previousScroll = Number.isFinite(oldScrollValue) ? oldScrollValue : 0;
        const focusedActor = global.stage.get_key_focus();
        const focusWasInside = this._isWithin(focusedActor, this._root);
        const focusedAppId = focusedActor?._matciAppId ?? null;
        const focusedRole = focusedActor?._matciRole ?? null;
        this._rowButtons = new Map();
        this._roleButtons = new Map();
        this._scrollView = null;
        this._sensorLabel = null;
        this._brand = null;
        this._brandAccessibleBase = null;
        for (const child of this._root.get_children()) child.destroy();
        const opening = this._expanded && !this._renderedExpanded;
        this._updatePanel();
        const snapshot = this._snapshot;
        const panelSnapshot = this._panelSnapshot ?? snapshot;
        const memory = panelSnapshot?.memory;
        const demo = snapshot?.mode === 'demo';
        const detailReady = Boolean(snapshot) && (demo || (!this._detailPaused && !this._detailLoading));
        const psi = snapshot?.pressure?.some_avg10;
        const surfaceWidth = Math.min(DESIGN.geometry.matciExpanded,
            Math.max(1, (this._monitor()?.width ?? 800) - 24));
        const innerWidth = Math.max(1, surfaceWidth - 2 * PAD_SIDE);
        if (this._expanded) {
            const header = new St.BoxLayout({style_class: 'matci-header'});
            // Title leads, tools trail at the far end (as in Archsport), all on one vertical centre.
            // Focus anchor on open: receives Tab/Esc and is read first, but draws no ring, so a
            // mouse open shows no stray focus box. Tab then reveals rings on rows and buttons.
            const brand = new St.BoxLayout({style_class: 'matci-brand', x_expand: true, reactive: true, can_focus: true});
            this._brand = brand;
            this._tagRole(brand, 'anchor');
            // The title row is the island's own surface: a click on it folds the card.
            brand.connect('button-release-event', () => {
                this._collapse(true);
                return Clutter.EVENT_STOP;
            });
            // A dead worker waiting for its restart reads as disconnected, never as "connecting".
            const disconnected = !this._worker && !this._versionMismatch;
            const stateText = demo ? '시연' : this._versionMismatch ? '업데이트 필요' : disconnected ? '연결 끊김' :
                snapshot?.health === 'error' ? '연결 오류' : ['ok', 'partial'].includes(snapshot?.health) ? '' : '연결 중';
            for (const [text, style] of [['메모리', 'matci-title'], [stateText,
                this._versionMismatch || disconnected || snapshot?.health === 'error' ? 'matci-state-error' : 'matci-state-note']]) {
                if (!text) continue;
                const label = this._label(text, style);
                label.x_expand = false;
                label.y_align = Clutter.ActorAlign.CENTER;
                brand.add_child(label);
            }
            header.add_child(brand);
            const tools = new St.BoxLayout({style_class: 'matci-header-tools'});
            tools.add_child(this._iconButton('preferences-system-symbolic', '설정', () => this._openPreferences(), true, 'settings'));
            tools.add_child(this._iconButton('pan-up-symbolic', '접기', () => this._collapse(true), true, 'collapse'));
            header.add_child(tools);
            this._root.add_child(header);

            if (!memory) this._root.add_child(this._problemCard());
            if (this._suggestion) {
                const banner = new St.BoxLayout({style_class: 'matci-suggestion'});
                banner.add_child(new St.Icon({icon_name: 'dialog-information-symbolic', icon_size: 14,
                    style_class: 'matci-suggestion-icon', y_align: Clutter.ActorAlign.START}));
                const words = this._label(`${this._suggestion} · 닫을 앱을 골라 보세요. 자동으로 닫지 않습니다.`, 'matci-status');
                banner.add_child(words);
                this._root.add_child(banner);
            }
            const metric = new St.BoxLayout({style_class: 'matci-metric-row', visible: Boolean(memory)});
            // Both sit on the row's bottom edge; the detail's CSS padding lifts it onto the figure's baseline.
            const usedMetric = this._label(percent(memory?.used_ratio), 'matci-metric');
            usedMetric.x_expand = false;
            usedMetric.y_align = Clutter.ActorAlign.END;
            metric.add_child(usedMetric);
            const usedBytes = Number.isFinite(memory?.total_bytes) && Number.isFinite(memory?.available_bytes) ?
                memory.total_bytes - memory.available_bytes : null;
            const memoryDetail = this._label(`가용 ${bytes(memory?.available_bytes)}`,
                'matci-metric-detail');
            memoryDetail.accessible_name = `사용 ${bytes(usedBytes)}, 가용 ${bytes(memory?.available_bytes)}, 전체 ${bytes(memory?.total_bytes)}`;
            this._brandAccessibleBase = memory ? `메모리 ${percent(memory.used_ratio)} 사용, ${memoryDetail.accessible_name}` :
                `메모리, ${this._message}`;
            brand.accessible_name = this._brandAccessibleBase;
            memoryDetail.x_align = memoryDetail.y_align = Clutter.ActorAlign.END;
            metric.add_child(memoryDetail);
            this._root.add_child(metric);
            const ratio = Number.isFinite(memory?.used_ratio) ? Math.max(0, Math.min(1, memory.used_ratio)) : 0;
            // Orange only with the pressure warning beside it; high usage alone is often cache.
            const pressured = Number.isFinite(psi) && psi >= 1;
            // Red when the stall is sustained or almost nothing is left; green otherwise.
            const critical = (Number.isFinite(psi) && psi >= 10) || (Number.isFinite(memory?.used_ratio) && memory.used_ratio >= 0.95);
            const meter = new St.BoxLayout({style_class: 'matci-meter-track', x_expand: true, height: 4, visible: Boolean(memory)});
            meter.add_child(new St.Widget({style_class: critical ? 'matci-meter-fill matci-meter-critical' :
                pressured ? 'matci-meter-fill matci-meter-warning' : 'matci-meter-fill',
                width: Math.round(innerWidth * ratio), height: 4}));
            meter.add_child(new St.Widget({style_class: 'matci-meter-rest', x_expand: true, height: 4}));
            this._root.add_child(meter);
            if (Number.isFinite(memory?.used_ratio) && hardwareAvailable(panelSnapshot?.hardware)) {
                this._sensorLabel = this._label('', 'matci-status');
                this._root.add_child(this._sensorLabel);
                this._updateHardwareReadout();
            }
            if (pressured) {
                const pressure = this._label(`메모리가 부족해 작업이 지연되는 중 · 최근 10초 ${psi.toFixed(1)}%`, 'matci-protected');
                pressure.accessible_name = `메모리 압박, PSI some 10초 평균 ${psi.toFixed(2)}%`;
                this._root.add_child(pressure);
            }

            const scroll = new St.ScrollView({style_class: 'matci-scroll', x_expand: true, y_expand: false,
                hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC});
            this._scrollView = scroll;
            const list = new St.BoxLayout({vertical: true, style_class: 'matci-list'});
            scroll.set_child(list);
            this._root.add_child(scroll);
            const review = this._actions?.review;
            let displayedGroups = 0;
            const unselected = [];
            let missingValues = false;
            if (review) {
                list.add_child(this._label(`선택한 앱 ${review.groups.length}개의 창을 닫을까요?`, 'matci-section-title'));
                for (const group of review.groups) {
                    const line = new St.BoxLayout({style_class: 'matci-review-line'});
                    line.add_child(this._appIcon(group.app, 16));
                    line.add_child(this._label(`${group.name} · 창 ${group.windows.length}개`, 'matci-review-row'));
                    list.add_child(line);
                }
                list.add_child(this._label('앱이 저장 여부를 묻지 않으면 저장 안 된 내용이 사라질 수 있습니다.', 'matci-protected'));
                list.add_child(this._label('그사이 앱이나 창이 바뀌면 자동으로 취소됩니다.', 'matci-status'));
            } else if (demo) {
                list.add_child(this._label('시연 데이터 · 앱 제어 없음', 'matci-section-title'));
                const processes = (snapshot?.processes ?? []).slice(0, 20);
                const marks = appMetrics(processes.map(p => ({processes: [p]})));
                for (const [index, p] of processes.entries()) {
                    const partial = lowAccuracy({...marks[index], kind: p.metric_kind, coverage: p.coverage});
                    const row = this._label(`${p.comm ?? '시연 프로세스'} · ${bytes(p.memory_bytes)}`,
                        'matci-review-row');
                    row.accessible_name = `${p.comm ?? '시연 프로세스'}, ${bytes(p.memory_bytes)}, ${metricKind(p.metric_kind)}` +
                        `${partial ? ', 부분 측정' : ''}`;
                    list.add_child(row);
                }
            } else if (!detailReady) {
                const detailMessage = !snapshot ? this._message : this._detailError ?
                    '앱 목록을 가져오지 못했습니다 · 다시 열면 재시도합니다' : '앱 목록 불러오는 중';
                // Without any figure the problem card already says this.
                if (snapshot || memory) list.add_child(this._label(detailMessage,
                    !snapshot || this._detailError ? 'matci-status-error' : 'matci-status'));
            } else {
                // Heaviest first, fixed when the list first appears and kept while it stays open so a
                // 5-second sample never moves a row under the pointer; apps that appear later join below.
                const unordered = this._groups(snapshot);
                const unorderedMetrics = appMetrics(unordered, {truncated: Boolean(snapshot.truncated)});
                const rank = new Map(this._rowOrder.map((id, index) => [id, index]));
                const ordered = unordered.map((group, index) => ({group, metric: unorderedMetrics[index]}))
                    .sort((a, b) => (rank.get(a.group.appId) ?? Infinity) - (rank.get(b.group.appId) ?? Infinity) ||
                        (b.metric.value ?? -1) - (a.metric.value ?? -1) || a.group.name.localeCompare(b.group.name));
                this._rowOrder = ordered.map(({group}) => group.appId);
                const groups = ordered.map(({group}) => group);
                const rowMetrics = ordered.map(({metric}) => metric);
                missingValues = rowMetrics.some(row => row.value === null);
                displayedGroups = groups.length;
                if (groups.length) {
                    const section = new St.BoxLayout({style_class: 'matci-section'});
                    section.add_child(this._label('앱', 'matci-section-title'));
                    list.add_child(section);
                }
                for (const [index, group] of groups.entries()) {
                    const reason = this._protection(group, snapshot);
                    if (reason && this._selected.delete(group.appId)) unselected.push(group.name);
                    const {kind, value, coverage, approximate, count} = rowMetrics[index];
                    const partial = lowAccuracy({kind, coverage, approximate});
                    const ages = (group.members ?? group.processes).map(p => p.metric_age_ms);
                    const tree = count > 1 ? `프로세스 ${count}개` : '';
                    // Only an old value is worth reading out; '3초 전 관측' on every row was noise.
                    const age = ages.length && ages.every(Number.isFinite) ?
                        Math.max(...ages) > 30000 ? '값이 오래됨' : '' : '관측 시각 미확인';
                    const row = new St.BoxLayout({style_class: 'matci-app-row'});
                    const selected = this._selected.has(group.appId);
                    // The focusable row carries what the row no longer prints: metric kind, age, protection reason.
                    const select = new St.Button({style_class: reason ? 'matci-app-protected' :
                        selected ? 'matci-app-select matci-app-selected' : 'matci-app-select',
                        x_expand: true, can_focus: !this._actions.busy, reactive: !this._actions.busy,
                        accessible_name: `${group.name}, ${reason ? `보호됨, ${reason}` :
                            `${selected ? '선택됨' : '선택 안 됨'}, 수동 검토 가능`}, ` +
                            `메모리 ${bytes(value)}${tree ? `, 하위 ${tree} 합계` : ''}, ${metricKind(kind)}${age ? `, ${age}` : ''}` +
                            `${partial ? ', 부분 측정' : ''}`,
                        // Exposes the checked state to screen readers instead of only spelling it out.
                        toggle_mode: !reason, checked: selected});
                    select._matciAppId = group.appId;
                    // Keyboard moves into rows below the fold; skip the unallocated focus restore after render.
                    select.connect('key-focus-in', () => {
                        if (select.has_allocation()) ensureActorVisibleInScrollView(scroll, select);
                    });
                    this._rowButtons.set(group.appId, select);
                    const appContent = new St.BoxLayout({style_class: 'matci-app-name-row', x_expand: true});
                    appContent.add_child(this._appIcon(group.app, 18));
                    // A lock alone does not say why; the reason sits under the name, not only in the a11y name.
                    const nameColumn = new St.BoxLayout({vertical: true, x_expand: true, y_align: Clutter.ActorAlign.CENTER});
                    const appName = this._label(group.name, 'matci-app-name');
                    appName.clutter_text.set_line_wrap(false);
                    appName.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
                    nameColumn.add_child(appName);
                    // Under the name: why it is locked, and how many processes the value adds up.
                    const caption = [reason, tree].filter(Boolean).join(' · ');
                    if (caption) {
                        const why = this._label(caption, 'matci-app-reason');
                        why.clutter_text.set_line_wrap(false);
                        why.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
                        nameColumn.add_child(why);
                    }
                    appContent.add_child(nameColumn);
                    // Trailing status slot (lock or check) keeps app names aligned in one column.
                    if (reason) appContent.add_child(new St.Icon({icon_name: 'changes-prevent-symbolic', icon_size: 14}));
                    if (selected) appContent.add_child(new St.Icon({icon_name: 'object-select-symbolic',
                        style_class: 'matci-selected-check', icon_size: 14}));
                    // The visible value stays plain; accuracy context remains in its accessible name.
                    const metricLabel = this._label(bytes(value), 'matci-app-metric');
                    metricLabel.x_expand = false;
                    appContent.add_child(metricLabel);
                    select.set_child(appContent);
                    select.connect('clicked', () => {
                        if (reason || !detailReady || this._detailLoading || this._detailPaused) return;
                        if (this._eventTimer) { GLib.source_remove(this._eventTimer); this._eventTimer = 0; }
                        if (this._selected.has(group.appId)) this._selected.delete(group.appId); else this._selected.add(group.appId);
                        this._render();
                    });
                    row.add_child(select);
                    list.add_child(row);
                }
                if (!groups.length) list.add_child(this._label('열린 앱 없음', 'matci-empty'));
            }
            // A selection that became protected is dropped visibly, never silently.
            if (unselected.length) list.add_child(this._label(`${unselected.join(', ')}: 보호 상태가 되어 선택에서 뺐습니다`, 'matci-status'));
            if (this._actionStatus) {
                const actionText = this._actionStatus === 'observing' ? '닫기를 요청했습니다 · 창이 닫히는지 확인 중' :
                    this._actionMessage ?? this._message;
                list.add_child(this._label(actionText, 'matci-status'));
            } else if (!detailReady) {
                // The list above already explains why app controls are unavailable.
            } else if (this._detailError || this._versionMismatch || snapshot?.health === 'error') {
                list.add_child(this._label(this._message, 'matci-status-error'));
            } else if (snapshot?.health === 'partial' && missingValues) {
                // Partial health only earns a line when it is visible: a row without a value.
                list.add_child(this._label('일부 앱의 메모리 값을 확인하지 못함', 'matci-status'));
            }
            ensureStyle(this._root);
            const [, listNatural] = list.get_preferred_height(innerWidth);
            const listHeight = Math.min(260, Math.max(1, Math.ceil(listNatural),
                displayedGroups ? 18 + displayedGroups * 42 : 0));
            scroll.set_policy(St.PolicyType.NEVER,
                displayedGroups > 4 || listNatural > listHeight + 1 ? St.PolicyType.AUTOMATIC : St.PolicyType.NEVER);
            scroll.set_height(listHeight);
            const controls = new St.BoxLayout({style_class: 'matci-controls'});
            if (review) {
                controls.add_child(this._tagRole(this._button('취소', () => { this._actions.cancel(); this._actionStatus = this._actionMessage = null; this._render(); }), 'cancel'));
                controls.add_child(new St.Widget({x_expand: true}));
                const confirm = this._button('창 닫기', () => this._confirm(), !this._actions.busy);
                confirm.add_style_class_name('matci-destructive-button');
                controls.add_child(this._tagRole(confirm, 'confirm'));
            } else {
                // A version mismatch needs reinstalling, not a refresh; a dead worker does need one.
                const needsRefresh = !this._versionMismatch && (snapshot?.health === 'error' ||
                    this._message?.includes('갱신 실패') || !this._worker);
                // The problem card above already offers the reconnect when there is no data at all.
                if (needsRefresh && memory) controls.add_child(this._tagRole(this._button('다시 연결',
                    () => this._refresh(), !this._actions.busy), 'refresh'));
                const selectable = !demo && detailReady && displayedGroups > 0 && !this._actions.busy;
                if (selectable && !this._selected.size && !this._actionStatus) {
                    const hint = this._label('닫을 앱을 눌러 선택하세요', 'matci-hint');
                    hint.y_align = Clutter.ActorAlign.CENTER;
                    controls.add_child(hint);
                } else {
                    controls.add_child(new St.Widget({x_expand: true}));
                }
                if (!demo && detailReady && this._selected.size > 0) {
                    const reviewButton = this._button(`${this._selected.size}개 앱 닫기…`, () => this._review(),
                        !this._actions.busy && detailReady);
                    reviewButton.add_style_class_name('matci-primary-button');
                    this._tagRole(reviewButton, 'review');
                    controls.add_child(reviewButton);
                }
            }
            if (controls.get_children().some(child => child instanceof St.Button || child instanceof St.Label))
                this._root.add_child(controls);
        }
        // Read on every open: the figure and state first; per-row names carry the metric caveats.
        this._root.accessible_name = `matci ${demo ? '합성 시연' : '메모리'} ${percent(memory?.used_ratio)} 사용, ` +
            `가용 ${bytes(memory?.available_bytes)}. ${this._message}`;
        if (this._expanded) {
            ensureStyle(this._root);
            // Hidden rows (figure and meter while there is no data) take no space or spacing.
            const children = this._root.get_children().filter(child => child.visible);
            const childHeight = children.reduce((sum, child) => {
                const [, natural] = child.get_preferred_height(innerWidth);
                return sum + natural;
            }, 0);
            // Children plus root spacing, at least 144 px with data (a problem card alone is as tall
            // as it is); the list is capped at 190, so no upper clamp can clip the controls.
            this._contentHeight = PAD_TOP + PAD_BOTTOM + Math.max(memory ? 144 : 0,
                Math.ceil(childHeight + Math.max(0, children.length - 1) * DESIGN.spacing.sm));
        } else this._contentHeight = 1;
        this._visibility();
        if (opening && this._interface.get_boolean('enable-animations')) {
            // Content settles down into the growing slab on its curve, a beat after the surface:
            // header and figures first, then the list and controls.
            for (const [index, child] of this._root.get_children().entries()) {
                const primary = index < 3;
                child.opacity = 0;
                child.translation_y = -DESIGN.motion.contentShift;
                easeOnCurve(child, {opacity: 255, translation_y: 0,
                    duration: primary ? DESIGN.motion.primaryDuration : DESIGN.motion.secondaryDuration,
                    delay: primary ? DESIGN.motion.primaryDelay : DESIGN.motion.secondaryDelay});
            }
        }
        this._renderedExpanded = this._expanded;
        this._renderedSignature = this._expanded ? this._listSignature() : null;
        if (this._expanded && previousScroll > 0) {
            const scroll = this._scrollView;
            let attempts = 0;
            if (this._scrollTimer) GLib.source_remove(this._scrollTimer);
            const timer = this._scrollTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => {
                this._scrollTimer = 0; // Re-armed only when the source continues.
                if (!this._enabled || !this._expanded || this._scrollView !== scroll)
                    return GLib.SOURCE_REMOVE;
                attempts++;
                const adjustment = this._scrollAdjustment(scroll);
                const upper = Number(adjustment?.upper);
                const pageSize = Number(adjustment?.page_size);
                if (adjustment && Number.isFinite(upper) && Number.isFinite(pageSize) && (upper > 0 || previousScroll === 0)) {
                    adjustment.value = Math.min(previousScroll, Math.max(0, upper - pageSize));
                    return GLib.SOURCE_REMOVE;
                }
                if (attempts >= 5) {
                    if (adjustment) adjustment.value = previousScroll;
                    return GLib.SOURCE_REMOVE;
                }
                this._scrollTimer = timer;
                return GLib.SOURCE_CONTINUE;
            });
        }
        if (this._expanded && focusWasInside) {
            const target = focusedAppId ? this._rowButtons.get(focusedAppId) :
                focusedRole ? this._roleButtons.get(focusedRole) : null;
            // Entering the review moves focus to 취소, never onto the destructive 창 닫기.
            const fallback = focusedRole === 'review' ? this._roleButtons.get('cancel') : null;
            if (target?.can_focus) target.grab_key_focus();
            else if (fallback?.can_focus) fallback.grab_key_focus();
            else this._focusPrimary();
        }
    }
    // What the expanded notch shows, coarsened to what a reader would notice (0.1 GB, whole %).
    _listSignature() {
        const snapshot = this._snapshot;
        const memory = (this._panelSnapshot ?? snapshot)?.memory;
        const sensorsAvailable = hardwareAvailable((this._panelSnapshot ?? snapshot)?.hardware);
        const ready = Boolean(snapshot) && !this._detailPaused && !this._detailLoading;
        const groups = ready && snapshot.mode === 'live' ? this._groups(snapshot) : [];
        const metrics = appMetrics(groups, {truncated: Boolean(snapshot?.truncated)});
        return JSON.stringify([percent(memory?.used_ratio), Math.round((memory?.available_bytes ?? 0) / 1e8),
            sensorsAvailable,
            (snapshot?.pressure?.some_avg10 ?? 0) >= 1, this._message, this._actionStatus, this._actionMessage,
            this._suggestion, this._detailLoading, this._detailPaused, this._detailError, this._versionMismatch,
            Boolean(this._worker), [...this._selected], this._actions?.review?.id ?? null, this._actions?.busy,
            groups.map((group, index) => [group.appId, Math.round((metrics[index].value ?? -1) / 1e8),
                metrics[index].count, this._protection(group, snapshot)])]);
    }
    _updateHardwareReadout() {
        if (!this._sensorLabel) return;
        const hardware = this._panelSnapshot?.hardware;
        const text = hardwareText(hardware);
        const accessible = hardwareAccessibleText(hardware);
        if (this._sensorLabel.text !== text) this._sensorLabel.text = text;
        if (this._sensorLabel.accessible_name !== accessible) this._sensorLabel.accessible_name = accessible;
        const brandName = `${this._brandAccessibleBase}, ${accessible}`;
        if (this._brand && this._brand.accessible_name !== brandName) this._brand.accessible_name = brandName;
    }
    _review() {
        if (!this._snapshot || this._detailLoading || this._detailPaused || this._actions.busy) return;
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
        catch (error) {
            this._message = error?.message ?? '검토가 만료되었습니다. 다시 선택하세요.';
            this._actionStatus = 'error';
        }
        this._selected.clear(); this._render();
    }
    async _refresh() {
        if (!this._worker) { this._restartWorker(); this._render(); return; }
        try { await this._request('sample_now'); }
        catch (_error) { this._message = '관측 갱신 실패 · 다시 연결하세요.'; this._render(); }
    }
    _suggest(snapshot) {
        if (!this._settings.get_boolean('auto-suggestions') || snapshot.mode !== 'live' || this._actions.busy) return;
        const ratio = snapshot.memory?.used_ratio;
        const psi = snapshot.pressure?.some_avg10;
        const now = this._now();
        const threshold = this._settings.get_int('threshold') / 100;
        if (!Number.isFinite(ratio)) { this._suggestStart = null; return; }
        // High usage alone is often cache; real stalls (PSI some >= 5%) count even below the threshold.
        const stalled = Number.isFinite(psi) && psi >= 5;
        if (ratio < Math.max(0, threshold - .10) && !stalled && !(psi >= 1)) { this._suggestArmed = true; this._suggestStart = null; return; }
        if (ratio < threshold && !stalled) { this._suggestStart = null; return; }
        if (this._suggestStart === null) this._suggestStart = now;
        if (this._suggestArmed && now - this._suggestStart >= 30000 && now >= this._suggestCooldown && !this._expanded) {
            this._suggestion = stalled ? `메모리가 부족해 작업이 지연되는 중 · RAM ${percent(ratio)}` :
                `RAM ${percent(ratio)} · 30초 넘게 기준(${percent(threshold)}) 이상`;
            this._expand(false); // Priority 30 cannot steal a manual review or keyboard focus.
            // Arm the cooldown only once the suggestion is really on screen; a blocked claim retries next sample.
            if (!this._expanded) { this._suggestion = null; return; }
            this._suggestArmed = false; this._suggestCooldown = now + 600000;
            this._announce(`메모리 확인 제안. ${this._suggestion}. 앱을 자동으로 닫지 않습니다.`);
            this._render();
            this._eventTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 15000, () => {
                this._eventTimer = 0;
                if (!this._actions.review && !this._actions.busy && !this._selected.size) this._collapse();
                return GLib.SOURCE_REMOVE;
            });
        }
    }
    // Screen-reader announcement for events that happen away from focus (same mechanism as Archsport).
    _announce(text) {
        try { this._root?.get_accessible()?.emit('notification', text, Atk.Live.POLITE); }
        catch (_error) { /* ATK notification support varies across Shell and Orca versions. */ }
    }
    _startWorker() {
        if (!this._enabled || this._sleeping || this._worker) return;
        const generation = ++this._generation;
        this._cancellable = new Gio.Cancellable();
        this._session = null;
        this._detailDesired = this._expanded;
        this._detailPaused = false;
        this._detailLoading = this._expanded;
        this._detailError = false;
        this._detailCommandSupported = null;
        this._detailRequestMode = null;
        this._detailApplying = false;
        this._detailInitialized = false;
        this._versionMismatch = false;
        this._stdout = {text: '', bytes: 0};
        this._decoder = new TextDecoder();
        this._goodSamples = 0;
        this._interactionBaseline = global.get_current_time();
        try {
            const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE});
            launcher.set_cwd(this.path);
            this._worker = launcher.spawnv(['python3', '-u', '-m', 'matci', '--watch', '--mode', this._settings.get_string('mode'), '--interval', '5',
                '--ui-version', String(this.metadata.version)]);
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
                // Worker JSON is ASCII-escaped, so a chunk cannot split a UTF-8 character.
                // Byte framing avoids re-encoding a ~90 KB pending snapshot after every 8 KB chunk.
                takeLines(this._stdout, chunk, MAX_LINE, this._decoder, line => {
                    if (line.trim()) this._incoming(JSON.parse(line));
                });
                this._readChunk(generation);
            } catch (_error) { this._workerFailed('관측 응답이 유효하지 않습니다. 안전하게 다시 연결합니다.'); }
        });
    }
    _incoming(message) {
        if (this._versionMismatch) return;
        if (message.schema_version !== 1 || !['snapshot', 'ack', 'error'].includes(message.type)) throw new Error('protocol');
        if (message.type === 'snapshot') {
            if (!message.session_id || !message.sample_id || !message.boot_id || !Number.isFinite(message.monotonic_ms) ||
                !Array.isArray(message.processes) || message.processes.length > 256 ||
                message.mode !== this._settings.get_string('mode')) throw new Error('snapshot');
            if (this._session && message.session_id !== this._session) throw new Error('session changed');
            this._session = message.session_id;
            const firstSnapshot = !this._detailInitialized;
            this._detailInitialized = true;
            const detailPaused = message.warnings?.includes('PROCESS_DETAIL_PAUSED') ?? false;
            this._panelSnapshot = message;
            if (!detailPaused) this._snapshot = message;
            this._detailPaused = detailPaused;
            if (detailPaused && this._detailDesired) this._detailLoading = true;
            else if (detailPaused) {
                this._detailLoading = false;
                this._detailError = false;
            }
            else if (!detailPaused && this._detailDesired) {
                this._detailLoading = false;
                this._detailError = false;
            }
            this._updatePanel();
            if (!detailPaused) this._receivedAt = this._now();
            if (++this._goodSamples >= 3) this._failures = 0;
            if (!this._detailError && !this._actions.busy && !this._actions.review && !this._versionMismatch) this._message = message.mode === 'demo' ? '합성 시연 · 실제 메모리/앱 제어 아님' :
                healthText(message);
            this._suggest(message);
            if (firstSnapshot) this._setDetail(this._detailDesired);
            // Preserve keyboard focus on confirmation and observation controls.
            // Fresh samples still replace the underlying identity for close checks.
            if (!this._actions.review && !this._actions.busy && (!detailPaused || this._expanded)) this._render();
        } else if (message.type === 'error' && !message.request_id && !this._session) {
            const errorText = {
                WORKER_ALREADY_RUNNING: '다른 matci 관측기가 실행 중입니다 · 이전 세션 프로세스를 확인하세요',
                UI_VERSION_MISMATCH: '확장·관측기 버전 불일치 · 설치 상태를 확인하세요',
                LIVE_REQUIRES_LINUX: 'Linux에서만 실제 관측이 가능합니다',
                WORKER_INITIALIZATION_OR_STORAGE_ERROR: '관측기 저장소를 열 수 없습니다 · 상태 폴더 권한을 확인하세요',
            }[message.code] ?? '관측기 시작 오류';
            if (message.code === 'UI_VERSION_MISMATCH') {
                this._versionMismatch = true;
                this._stopWorker();
                this._message = errorText;
                this._render();
                return;
            }
            this._workerFailed(errorText, message.code === 'WORKER_ALREADY_RUNNING' ? 60 : undefined);
            return;
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
        if (!this._enabled || this._versionMismatch || !this._worker || !this._session ||
            this._queue.length >= 128 || this._pending.size >= 128)
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
    _workerFailed(message, waitSeconds = null) {
        if (!this._enabled) return;
        this._stopWorker(); this._message = message; this._render();
        const wait = Number.isFinite(waitSeconds) ? waitSeconds : Math.min(60, 5 * 2 ** Math.min(this._failures++, 4));
        this._restartTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, wait, () => {
            this._restartTimer = 0; this._startWorker(); return GLib.SOURCE_REMOVE;
        });
    }
    _restartWorker() { this._stopWorker(); this._startWorker(); }
    _stopWorker() {
        this._generation++;
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
        this._panelSnapshot = null;
        this._queue = []; this._writing = false; this._stdout = null;
        this._detailPaused = false; this._detailLoading = false; this._detailError = false;
        this._detailRequestMode = null; this._detailInitialized = false; this._detailApplying = false;
        this._suggestStart = null; this._suggestArmed = true; this._suggestCooldown = 0;
    }
    disable() {
        this._enabled = false;
        Main.wm.removeKeybinding('matci-toggle-shortcut');
        if (this._closingTimer) GLib.source_remove(this._closingTimer);
        if (this._scrollTimer) GLib.source_remove(this._scrollTimer);
        this._closingTimer = this._scrollTimer = 0;
        this._stopWorker();
        if (this._sleepSubscription) Gio.DBus.system.signal_unsubscribe(this._sleepSubscription);
        this._sleepSubscription = 0;
        for (const [object, id] of this._signals) {
            try { object.disconnect(id); } catch (_error) { /* object was disposed during Shell shutdown */ }
        }
        this._signals = [];
        this._dock?.destroy(); this._dock = null;
        if (!this._shellEnding && this._root) {
            try { this._root.destroy(); } catch (_error) {}
        }
        if (!this._shellEnding && this._indicator) {
            try {
                if (Main.panel.statusArea[this.uuid] === this._indicator) Main.panel.statusArea[this.uuid] = null;
                this._indicator.destroy();
            } catch (_error) { /* Shell already owns actor disposal */ }
        }
        this._root = this._indicator = this._indicatorIcon = this._indicatorLabel = this._ramIcon = null;
        // Destroyed row/control wrappers must not outlive the disabled extension (e.g. lock screen).
        this._rowButtons?.clear(); this._roleButtons?.clear(); this._scrollView = null;
        this._settings = this._interface = this._actions = null;
    }
}
