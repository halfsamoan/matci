import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import {COLORS, memoryPoints, formatBytes as bytes} from './visualModel.js';

// Installed beside the extension modules. No worker, process collector or OS-close API.
const root = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_path();
const demo = ARGV.includes('--demo') || ARGV.includes('--smoke');
const smoke = ARGV.includes('--smoke');
if (demo) GLib.setenv('GSETTINGS_BACKEND', 'memory', true);
const app = new Gtk.Application({application_id: 'org.matci.App', flags: 0});
const percent = value => Number.isFinite(value) ? `${Math.round(value * 100)}%` : '—';
let win, content, graph, metric, notice, action, list, heading, autoButton, settings, dialog, graphCaption, footerHost;
let page = 'memory', current = {mode:'offline', apps:[], memory:null}, selected = new Set();
let polling = false, disposed = false, modal = false, pollTimer = 0, animationTimer = 0, drawCount = 0;
let releaseAt = 0, receiptKey = '', points = [], sampleId = null, generation = 0, resultMetric = null;
let installedApps = new Map();
let shellLayout, navRail, memoryStage, visualization, actionRow, footerNote;
let stacked = null, narrow = null;
let smokeRows=[];
const label = (text, css = '', wrap = false) => {
    const widget = new Gtk.Label({label:String(text), xalign:0, wrap, hexpand:true, wrap_mode:Pango.WrapMode.WORD_CHAR});
    if (css) widget.add_css_class(css); return widget;
};
const box = (vertical = true, spacing = 0) => new Gtk.Box({orientation:vertical ? Gtk.Orientation.VERTICAL : Gtk.Orientation.HORIZONTAL, spacing});
const button = (text, callback, css = '') => {
    const widget = new Gtk.Button({label:text}); if (css) widget.add_css_class(css);
    widget.connect('clicked', callback); return widget;
};
function clear(widget) { while (widget.get_first_child()) widget.remove(widget.get_first_child()); }
function motion() { return Gtk.Settings.get_default().gtk_enable_animations; }
function getSettings() {
    let source = Gio.SettingsSchemaSource.get_default();
    for (const directory of [`${root}/schemas`,`${root}/extension/schemas`]) {
        if (Gio.File.new_for_path(`${directory}/gschemas.compiled`).query_exists(null)) {
            source = Gio.SettingsSchemaSource.new_from_directory(directory,source,false); break;
        }
    }
    const schema = source.lookup('org.gnome.shell.extensions.matci', true);
    return schema ? new Gio.Settings({settings_schema:schema}) : null;
}
function call(method, signature = '()', values = []) {
    const epoch = generation;
    return new Promise((resolve, reject) => Gio.DBus.session.call('org.matci.Shell1', '/org/matci/Shell1',
        'org.matci.Shell1', method, new GLib.Variant(signature, values), new GLib.VariantType('(s)'),
        Gio.DBusCallFlags.NO_AUTO_START, method === 'Confirm' ? 25000 : 3000, null, (connection, result) => {
            try {
                const [text] = connection.call_finish(result).deep_unpack();
                if (disposed || generation !== epoch) throw new Error('CONNECTION_CHANGED');
                if (new TextEncoder().encode(text).length > 131072) throw new Error('STATE_LIMIT');
                resolve(JSON.parse(text));
            } catch (error) { reject(error); }
        }));
}
function appIcon(id) {
    // Gio.AppInfo handles the installed desktop entry; never fabricate an app logo.
    const info = installedApps.get(id);
    return new Gtk.Image({gicon:info?.get_icon() ?? new Gio.ThemedIcon({name:'application-x-executable'}), pixel_size:32});
}
function autoPopover() {
    const popover = new Gtk.Popover(); const body = box(true, 16); body.add_css_class('auto-popover');
    const row = box(false, 24); row.append(label('메모리 자동 제안', 'section-title'));
    const toggle = new Gtk.Switch({active:settings?.get_boolean('auto-suggestions') ?? false, valign:Gtk.Align.CENTER});
    toggle.sensitive = Boolean(settings); row.append(toggle); body.append(row);
    const value = label(`${settings?.get_int('threshold') ?? 85}%`, 'idle');
    const caption = box(false, 16); caption.append(label('제안 기준')); caption.append(value); body.append(caption);
    const slider = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 50, 99, 1);
    slider.set_draw_value(false); slider.set_value(settings?.get_int('threshold') ?? 85); slider.sensitive = toggle.active;
    toggle.connect('notify::active', () => { settings?.set_boolean('auto-suggestions', toggle.active); slider.sensitive = toggle.active; autoTitle(); });
    slider.connect('value-changed', () => { const n = Math.round(slider.get_value()); value.label = `${n}%`; settings?.set_int('threshold', n); });
    body.append(slider); body.append(label('30초 지속 · 10분 간격\n앱은 자동 종료하지 않습니다.', 'muted', true));
    popover.set_child(body); popover._matciToggle=toggle; popover._matciSlider=slider; return popover;
}
function autoTitle() { if (autoButton) autoButton.label = `메모리 자동 제안 · ${settings?.get_boolean('auto-suggestions') ? 'On' : 'Off'}  ›`; }
function responsive(force = false) {
    const width = win.get_width() || 480;
    const nextStacked = width < 820, nextNarrow = width < 700;
    if (!force && nextStacked === stacked && nextNarrow === narrow) return;
    stacked = nextStacked; narrow = nextNarrow;
    for (const [active, css] of [[stacked,'stacked'],[narrow,'narrow']])
        active ? win.add_css_class(css) : win.remove_css_class(css);
    shellLayout.orientation = narrow ? Gtk.Orientation.VERTICAL : Gtk.Orientation.HORIZONTAL;
    navRail.orientation = narrow ? Gtk.Orientation.HORIZONTAL : Gtk.Orientation.VERTICAL;
    navRail.hexpand = narrow;
    if (page === 'memory' && memoryStage) {
        memoryStage.orientation = stacked ? Gtk.Orientation.VERTICAL : Gtk.Orientation.HORIZONTAL;
        visualization.hexpand = stacked; graph.hexpand = stacked;
        graph.content_width = stacked ? 1 : 230; graph.content_height = stacked ? 220 : 330;
        actionRow.orientation = narrow ? Gtk.Orientation.VERTICAL : Gtk.Orientation.HORIZONTAL;
    }
}
function memoryPage() {
    clear(content); clear(footerHost);
    heading = label('메모리에 여유를', 'hero-title', true); content.append(heading);
    autoButton = new Gtk.MenuButton({halign:Gtk.Align.START}); autoButton.add_css_class('auto-trigger');
    autoButton.set_popover(autoPopover()); autoTitle(); content.append(autoButton);
    notice = label('', 'muted', true); content.append(notice);
    memoryStage = box(false, 30); content.append(memoryStage);
    visualization = box(true, 12); visualization.add_css_class('visualization'); visualization.hexpand = false;
    const values = box(true, 10); values.valign = Gtk.Align.CENTER; values.set_size_request(150, -1);
    values.append(label('사용 중 메모리', 'active')); metric = label('—', 'big-number'); values.append(metric);
    visualization.append(values);
    graph = new Gtk.DrawingArea({hexpand:false, content_height:330, content_width:230});
    graph.set_draw_func((_area, cr, width, height) => { try { draw(cr, width, height); drawCount++; } finally { cr.$dispose(); } });
    visualization.append(graph); graphCaption = label('', 'muted', true); visualization.append(graphCaption); memoryStage.append(visualization);
    list = box(true, 24); list.hexpand = true; list.add_css_class('app-list'); memoryStage.append(list);
    actionRow = box(false, 16); actionRow.add_css_class('action-bar');
    actionRow.append(label('직접 선택 · 정상 닫기만 요청\n앱 점유는 확보 보장량이 아닙니다.', 'muted'));
    action = button('선택 검토', review, 'suggested-action'); actionRow.append(action); footerHost.append(actionRow);
    footerNote=label('창 PID의 PSS/RSS 관측 · 전체 앱·탭 점유가 아닙니다.', 'muted');
    footerNote.ellipsize=Pango.EllipsizeMode.END; footerNote.tooltip_text=footerNote.label; footerHost.append(footerNote);
    responsive(true);
    renderMemory();
}
function renderMemory() {
    if (page !== 'memory' || modal) return;
    metric.label = percent(current.memory?.used_ratio);
    graphCaption.label = `전체 ${bytes(current.memory?.total_bytes)}\n가용 ${bytes(current.memory?.available_bytes)}\nMemTotal − MemAvailable\n아래 선: 이 세션의 최근 60회 관측`;
    notice.label = demo ? '합성 디자인 시연 · 실제 프로세스/창 제어 없음' : current.mode === 'offline' ?
        'matci GNOME 확장을 켜세요. 연결 전에는 수치나 닫기 기능을 제공하지 않습니다.' : current.message ?? '';
    const focusedId = win.get_focus()?._matciAppId;
    let restoreFocus = null;
    clear(list);
    if (smoke) smokeRows=[];
    resultMetric = null;
    for (const [section, title] of [['idle','입력 없는 앱'], ['active','사용 중'], ['protected','시스템 · 작업 보호']]) {
        const apps = (current.apps ?? []).filter(item => item.section === section);
        if (!apps.length) continue;
        const group = box(true, 8), header = box(false, 12), titleLabel = label(title, 'section-title'); titleLabel.add_css_class(section);
        header.append(titleLabel);
        const kinds = new Set(apps.map(item => item.metric_kind));
        const amount = apps.every(item => Number.isFinite(item.memory_bytes)) && kinds.size === 1 ?
            apps.reduce((sum, item) => sum + item.memory_bytes, 0) : null;
        header.append(label(`${bytes(amount)} · 앱 관측`, 'muted')); group.append(header);
        for (const item of apps) {
            const row = box(false, 12); row.add_css_class('app-row');
            const check = new Gtk.CheckButton({active:selected.has(item.app_id), valign:Gtk.Align.CENTER});
            check._matciAppId = item.app_id;
            check.sensitive = !demo && !item.reason && !current.busy && !modal && current.mode === 'live';
            if (smoke && ARGV.includes('--states') && !item.reason) check.sensitive=true;
            if (focusedId === item.app_id && check.sensitive) restoreFocus = check;
            const selectionStyle = () => check.active ? row.add_css_class('row-selected') : row.remove_css_class('row-selected');
            selectionStyle();
            const focus = new Gtk.EventControllerFocus();
            focus.connect('enter',()=>row.add_css_class('row-focused'));
            focus.connect('leave',()=>row.remove_css_class('row-focused')); row.add_controller(focus);
            check.connect('toggled', () => { check.active ? selected.add(item.app_id) : selected.delete(item.app_id); selectionStyle(); updateAction(); });
            if (!check.sensitive) row.add_css_class('row-protected');
            if (smoke) smokeRows.push({row,check});
            check.tooltip_text = item.reason ?? `${item.name} 선택 · 창 ${item.windows}개`;
            row.append(check); row.append(appIcon(item.app_id));
            const description = box(true, 3); description.hexpand = true;
            const name=label(item.name, 'app-name'); name.ellipsize=Pango.EllipsizeMode.END; name.width_chars=1; name.tooltip_text=item.name; description.append(name);
            const age = Number.isFinite(item.input_age_ms) ? `최근 입력 ${Math.floor(item.input_age_ms / 60000)}분 전` : '최근 입력 시각 미확인';
            description.append(label(item.reason ?? `${age} · ${item.windows}개 창 · 자동 선택 없음`, 'muted', true)); row.append(description);
            const amountBox = box(true, 3); amountBox.hexpand = false; amountBox.append(label(bytes(item.memory_bytes), 'app-memory'));
            amountBox.append(label(item.metric_kind?.toUpperCase() ?? '미확인', 'muted')); row.append(amountBox); group.append(row);
        }
        list.append(group);
    }
    if (!(current.apps ?? []).length) list.append(label('현재 매핑 가능한 앱이 없습니다.', 'muted'));
    const receipt = current.receipt;
    if (receipt) {
        const delta = receipt.observed_delta;
        const result = label(Number.isFinite(delta) ? `가용 메모리 변화 ${delta >= 0 ? '+' : '−'}${bytes(Math.abs(delta))}` : '가용 메모리 변화 미확인', 'result'); if (delta > 0) result.add_css_class('freed');
        if (delta > 0) resultMetric = result;
        list.append(result); list.append(label('전체 시스템 관측 차이입니다. 특정 앱의 회수량을 뜻하지 않습니다.', 'muted', true));
    }
    updateAction(); graph.queue_draw();
    if (focusedId) (restoreFocus ?? autoButton).grab_focus();
}
function updateAction() {
    action.label = selected.size ? `선택 ${selected.size}개 검토` : '선택 검토';
    action.sensitive = !demo && current.mode === 'live' && !current.busy && !modal && selected.size > 0;
}
async function review() {
    if (demo || modal || current.busy || !selected.size) return;
    modal = true; list.sensitive=false; autoButton.sensitive=false; updateAction();
    let token = null;
    try {
        const result = await call('Review', '(as)', [[...selected]]); token = result.token;
        dialog = new Gtk.Dialog({title:'선택한 앱 확인', transient_for:win, modal:true, default_width:470}); dialog.add_css_class('matci');
        const body = dialog.get_content_area(); body.spacing = 18; body.add_css_class('review-body');
        body.append(label('선택한 앱의 모든 창에 정상 닫기를 요청합니다.', 'section-title', true));
        for (const item of result.apps) body.append(label(`${item.name} · ${item.windows}개 창`, '', true));
        body.append(label('미저장 내용·재생·다운로드를 직접 확인하세요. 저장 확인 창에서 취소할 수 있습니다. 강제 종료하지 않습니다.', 'muted', true));
        const consent = new Gtk.CheckButton({label:'대상과 작업 상태를 확인했습니다.'}); body.append(consent);
        dialog.add_button('취소', Gtk.ResponseType.CANCEL); const confirm = dialog.add_button('정상 닫기 요청', Gtk.ResponseType.ACCEPT);
        confirm.sensitive = false; consent.connect('toggled', () => { confirm.sensitive = consent.active; });
        const accepted = await new Promise(resolve => {
            dialog.connect('response', (_dialog, response) => resolve(response === Gtk.ResponseType.ACCEPT && consent.active)); dialog.present();
        });
        dialog.destroy(); dialog = null;
        if (accepted) { notice.label = '정상 닫기 요청 후 상태를 관측합니다…'; await call('Confirm', '(s)', [token]); }
        else await call('Cancel', '(s)', [token]);
    } catch (_error) {
        if (token) { try { await call('Cancel', '(s)', [token]); } catch (_ignored) {} }
        if (!disposed) notice.label = '요청을 진행하지 못했습니다. 앱 상태·보호 사유를 확인하고 다시 선택하세요.';
    } finally { modal = false; selected.clear(); if (!disposed) { list.sensitive=true; autoButton.sensitive=true; updateAction(); await poll(); } }
}
function setColor(cr, hex, alpha = 1) { cr.setSourceRGBA(parseInt(hex.slice(1,3),16)/255, parseInt(hex.slice(3,5),16)/255, parseInt(hex.slice(5,7),16)/255, alpha); }
function draw(cr, width, height) {
    const ratio = current.memory?.used_ratio;
    const now = GLib.get_monotonic_time() / 1000000;
    const release = releaseAt && motion() ? Math.min(1, (now - releaseAt) / 1.6) : 0;
    setColor(cr, COLORS.protected, .25); cr.setLineWidth(3); cr.moveTo(14, 12); cr.lineTo(14, height-12); cr.stroke();
    if (Number.isFinite(ratio)) {
        setColor(cr, COLORS.active); cr.setLineWidth(4); cr.moveTo(14,height-12); cr.lineTo(14,height-12-(height-24)*ratio); cr.stroke();
    }
    const field = memoryPoints(ratio, now, 0, !motion());
    if (release > 0 && release < 1)
        field.push(...memoryPoints(ratio, releaseAt, release).filter((_point,index)=>index%4===0));
    for (const point of field) {
        setColor(cr, point.color, point.alpha); cr.arc(point.x*width,point.y*height,point.radius,0,2*Math.PI); cr.fill();
    }
    if (points.length > 1) {
        setColor(cr, COLORS.active, .65); cr.setLineWidth(1);
        points.forEach((point, index) => { const x=32+index/(points.length-1)*(width-48), y=height-10-point*20; index ? cr.lineTo(x,y) : cr.moveTo(x,y); }); cr.stroke();
    }
}
function historyPage() {
    clear(content); clear(footerHost); content.append(label('작업 기록', 'hero-title'));
    content.append(label('로컬 요청 결과 · 가용 변화는 전체 시스템 관측값입니다.', 'muted', true));
    if (demo) { content.append(label('디자인 시연에서는 실제 작업 기록을 읽지 않습니다.', 'muted')); return; }
    try {
        const file = Gio.File.new_for_path(`${GLib.get_user_state_dir()}/matci/history-summary.json`);
        const info = file.query_info('standard::size,standard::is-symlink,unix::uid', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        if (info.get_is_symlink() || info.get_size() > 131072 || info.get_attribute_uint32('unix::uid') !== new Gio.Credentials().get_unix_user()) throw new Error('SUMMARY');
        const [, data] = file.load_contents(null), summary = JSON.parse(new TextDecoder().decode(data));
        if (summary.schema_version !== 1 || summary.owner_uid !== new Gio.Credentials().get_unix_user() || !Array.isArray(summary.receipts)) throw new Error('SUMMARY');
        for (const receipt of summary.receipts.slice(0,100)) {
            const entry = box(true,8); entry.add_css_class('history-entry');
            entry.append(label(`${String(receipt.status).slice(0,32)} · ${String(receipt.updated_at).slice(0,32)}`, 'section-title'));
            entry.append(label(Number.isFinite(receipt.observed_delta) ? ` 가용 변화 ${receipt.observed_delta >= 0 ? '+' : '−'}${bytes(Math.abs(receipt.observed_delta))}` : '가용 변화 미확인', 'muted')); content.append(entry);
        }
        if (!summary.receipts.length) content.append(label('아직 기록이 없습니다.', 'muted'));
    } catch (_error) { content.append(label('기록을 읽을 수 없습니다. 확장에서 정상 닫기 요청을 진행하면 여기에 표시됩니다.', 'muted', true)); }
}
function settingsPage() {
    clear(content); clear(footerHost); content.append(label('설정', 'hero-title'));
    const menu = new Gtk.MenuButton({label:'메모리 자동 제안 설정', halign:Gtk.Align.START}); menu.set_popover(autoPopover()); content.append(menu);
    content.append(label('자동 제안은 앱을 닫지 않습니다. 시스템 모션 감소 설정을 따릅니다.', 'muted', true));
    const preferences = button('GNOME 확장 설정 · 보호 목록', () => {
        try { Gio.Subprocess.new(['gnome-extensions','prefs','matci@local'], Gio.SubprocessFlags.NONE); } catch (_error) {}
    }); preferences.sensitive=!demo; content.append(preferences);
    content.append(label('Disk · Organize · 패키지 제거는 후속 기능입니다. 현재 창은 메모리·기록·설정만 제공합니다.', 'muted', true));
}
async function poll() {
    if (polling || disposed || demo) return;
    polling = true;
    try {
        const next = await call('GetState');
        if (next.schema_version !== 1 || !Array.isArray(next.apps) || next.apps.length > 100) throw new Error('STATE');
        current = next;
        const valid = new Set(next.apps.filter(item => !item.reason).map(item => item.app_id));
        selected = new Set([...selected].filter(id => valid.has(id)));
        if (sampleId !== next.sample_id && Number.isFinite(next.memory?.used_ratio)) {
            sampleId = next.sample_id; points.push(next.memory.used_ratio); if (points.length > 60) points.shift();
        }
        const key = next.receipt ? `${next.receipt.id}:${next.receipt.status}` : '';
        if (key && key !== receiptKey && next.receipt.observed_delta > 0) releaseAt = GLib.get_monotonic_time()/1000000;
        receiptKey = key;
    } catch (_error) {
        generation++; current = {mode:'offline', memory:null, apps:[]}; selected.clear(); points = []; sampleId = null;
        if (dialog) dialog.response(Gtk.ResponseType.CANCEL);
    } finally { polling = false; if (!disposed) renderMemory(); }
}
app.connect('activate', () => {
    if (win) { win.present(); return; }
    installedApps = new Map(Gio.AppInfo.get_all().map(info => [info.get_id(),info]));
    try { settings = getSettings(); } catch (_error) { settings = null; }
    const provider = new Gtk.CssProvider(); provider.load_from_path(`${root}/app/style.css`);
    Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    const size = smoke ? ARGV.find(arg=>/^--size=\d+x\d+$/.test(arg))?.slice(7).split('x').map(Number) : null;
    win = new Gtk.ApplicationWindow({application:app, title:'matci', default_width:size?.[0] ?? 900, default_height:size?.[1] ?? 720}); win.add_css_class('matci');
    const header = new Gtk.HeaderBar(); header.set_title_widget(label(demo ? 'matci · 합성 디자인 시연' : 'matci · 메모리', 'window-title')); win.set_titlebar(header);
    shellLayout = box(false); win.set_child(shellLayout); navRail=box(true,14); navRail.hexpand=false; navRail.add_css_class('rail'); shellLayout.append(navRail);
    for (const [id,title,icon] of [['memory','메모리','media-flash-symbolic'],['history','기록','document-open-recent-symbolic'],['settings','설정','emblem-system-symbolic']]) {
        const nav = new Gtk.Button(), inner = box(true,5); inner.append(new Gtk.Image({icon_name:icon,pixel_size:26})); inner.append(label(title)); nav.set_child(inner);
        if (id === page) nav.add_css_class('nav-active');
        nav.connect('clicked', () => { if (modal) return; page=id; for (let child=navRail.get_first_child();child;child=child.get_next_sibling()) child.remove_css_class('nav-active'); nav.add_css_class('nav-active'); ({memory:memoryPage,history:historyPage,settings:settingsPage})[page](); }); navRail.append(nav);
    }
    const right = box(true); right.hexpand=true; right.vexpand=true; shellLayout.append(right);
    const scroll = new Gtk.ScrolledWindow({hexpand:true, vexpand:true, hscrollbar_policy:Gtk.PolicyType.NEVER}); right.append(scroll);
    content = box(true,16); content.add_css_class('content'); scroll.set_child(content);
    footerHost=box(true,8); footerHost.add_css_class('footer-host'); right.append(footerHost);
    if (demo) current = {mode:'demo', memory:{used_ratio:.75,total_bytes:16*1073741824,available_bytes:4*1073741824}, apps:[
        {app_id:'google-chrome.desktop',name:'Google Chrome',windows:3,memory_bytes:744*1048576,metric_kind:'pss',input_age_ms:420000,section:'idle'},
        {app_id:'org.gnome.Loupe.desktop',name:'이미지 뷰어',windows:1,memory_bytes:164*1048576,metric_kind:'pss',input_age_ms:1440000,section:'idle'},
        {app_id:'org.gnome.Terminal.desktop',name:'Terminal',windows:1,memory_bytes:1.2*1073741824,metric_kind:'pss',section:'active',reason:'터미널·실행 중 작업 보호'},
    ]};
    memoryPage(); win.present(); poll();
    pollTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT,2, () => { poll(); return GLib.SOURCE_CONTINUE; });
    animationTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT,33, () => {
        responsive();
        if (page==='memory' && win.is_active && motion() && Number.isFinite(current.memory?.used_ratio)) {
            graph.queue_draw();
            if (resultMetric && releaseAt) {
                const progress = Math.min(1,(GLib.get_monotonic_time()/1000000-releaseAt)/1.6);
                resultMetric.label = `가용 메모리 변화 +${bytes(current.receipt.observed_delta*(1-Math.pow(1-progress,3)))}`;
            }
        }
        return GLib.SOURCE_CONTINUE;
    });
    win.connect('close-request', () => { disposed=true; generation++; if (pollTimer) GLib.source_remove(pollTimer); if (animationTimer) GLib.source_remove(animationTimer); pollTimer=animationTimer=0; return false; });
    let captureAttempts = 0, popoverChecked = false;
    if (smoke && settings) GLib.timeout_add(GLib.PRIORITY_DEFAULT,300, () => {
        const popover=autoButton.get_popover(); popover.popup(); popover._matciToggle.active=true; popover._matciSlider.set_value(92);
        popoverChecked=settings.get_boolean('auto-suggestions') && settings.get_int('threshold')===92;
        GLib.timeout_add(GLib.PRIORITY_DEFAULT,300,()=>{popover.popdown();return GLib.SOURCE_REMOVE;});
        return GLib.SOURCE_REMOVE;
    });
    const resize = smoke ? ARGV.find(arg=>/^--resize=\d+x\d+$/.test(arg))?.slice(9).split('x').map(Number) : null;
    if (resize) GLib.timeout_add(GLib.PRIORITY_DEFAULT,700,()=>{
        win.set_default_size(...resize);
        // A second drag step applies the target after GTK has switched layout constraints.
        GLib.timeout_add(GLib.PRIORITY_DEFAULT,150,()=>{win.set_default_size(...resize);return GLib.SOURCE_REMOVE;});
        return GLib.SOURCE_REMOVE;
    });
    if (smoke && ARGV.includes('--states')) GLib.timeout_add(GLib.PRIORITY_DEFAULT,850,()=>{
        smokeRows[0].check.active=true; smokeRows[0].check.grab_focus();
        smokeRows[1].row.set_state_flags(Gtk.StateFlags.PRELIGHT,false);
        return GLib.SOURCE_REMOVE;
    });
    if (smoke) GLib.timeout_add(GLib.PRIORITY_DEFAULT,1200, () => {
        if (ARGV.includes('--capture')) {
            const paintable = Gtk.WidgetPaintable.new(win), snapshot = new Gtk.Snapshot();
            paintable.snapshot(snapshot,win.get_width(),win.get_height());
            const node = snapshot.to_node();
            if (!node && ++captureAttempts < 4) { win.queue_draw(); return GLib.SOURCE_CONTINUE; }
            if (!node) { printerr('GTK capture unavailable'); win.close(); return GLib.SOURCE_REMOVE; }
            const texture = win.get_renderer().render_texture(node,null);
            texture.save_to_png(`${root}/docs/screenshots/native-gtk-v2.png`);
        }
        const [allocated,bounds]=action.compute_bounds(win);
        print(JSON.stringify({gtk4:true,drawn:drawCount>0,popover:popoverChecked,demo:true,
            width:win.get_width(),height:win.get_height(),stacked,narrow,
            row_states:!ARGV.includes('--states') || (smokeRows[0].row.has_css_class('row-selected') && smokeRows[0].row.has_css_class('row-focused') && Boolean(smokeRows[1].row.get_state_flags() & Gtk.StateFlags.PRELIGHT) && !action.sensitive),
            action_visible:allocated && bounds.get_y()>=0 && bounds.get_y()+bounds.get_height()<=win.get_height()}));
        win.close(); return GLib.SOURCE_REMOVE;
    });
});
app.run([]);
