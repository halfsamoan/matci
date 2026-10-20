// Pure conservative UI policy. A low CPU reading is never permission to close.
export const BUILTIN_IDS = Object.freeze([
    'org.gnome.Shell.desktop', 'org.gnome.Terminal.desktop', 'org.gnome.Console.desktop',
    'org.gnome.Ptyxis.desktop', 'org.gnome.TextEditor.desktop', 'org.gnome.gedit.desktop',
    'code.desktop', 'code-insiders.desktop', 'com.visualstudio.code.desktop',
    'codium.desktop', 'jetbrains-idea.desktop', 'org.kde.konsole.desktop',
    'com.mitchellh.ghostty.desktop', 'Alacritty.desktop', 'kitty.desktop',
    'org.gnome.Builder.desktop', 'dev.zed.Zed.desktop', 'com.openai.Codex.desktop',
]);
const DEV = /(?:terminal|ptyxis|console|konsole|xterm|gnome-shell|code|codium|jetbrains|studio|emacs|vim|gedit|texteditor|builder|zed|electron|claude|codex)/i;
export const keyOf = p => `${p.uid}:${p.pid}:${p.start_ticks}`;
export const keysEqual = (a, b) => a.length === b.length &&
    a.map(keyOf).sort().every((value, i) => value === b.map(keyOf).sort()[i]);

// Shell event clocks are uint32 milliseconds, not Unix or worker monotonic time.
// A short wrap is coherent; zero, backwards and half-range ambiguity are unknown.
// Only interactions since the current connection/resume baseline are described.
export function interactionAge(last, now, baseline) {
    const valid = value => Number.isInteger(value) && value > 0 && value <= 0xffffffff;
    if (![last, now, baseline].every(valid)) return null;
    const age = (now - last) >>> 0;
    const sinceBaseline = (now - baseline) >>> 0;
    if (age >= 0x80000000 || sinceBaseline >= 0x80000000 || age > sinceBaseline) return null;
    return age;
}

export function protection(group, snapshot, ownerUid, protectedIds = [], age = 0) {
    if (snapshot?.mode !== 'live') return '시연 데이터 · 실제 창 제어 없음';
    if (!group?.appId || !group.windows?.length || !group.processes?.length)
        return '현재 앱/창 매핑 불명확';
    if (BUILTIN_IDS.includes(group.appId) || DEV.test(group.appId) || protectedIds.includes(group.appId))
        return '시스템·개발 도구 또는 사용자 보호 앱';
    if (snapshot.truncated) return '프로세스 목록 일부만 관측됨';
    if (age < 0 || age > 5000) return '신원 관측이 오래됨 · 새로고침 필요';
    for (const p of group.processes) {
        if (!Number.isInteger(p.pid) || p.pid <= 0 || !Number.isInteger(p.uid) || p.uid !== ownerUid ||
            !Number.isInteger(p.start_ticks) || p.start_ticks <= 0) return '유효한 동일 사용자 신원 없음';
        if (snapshot.health === 'error' || snapshot.boot_id === 'unavailable') return '현재 관측을 확인할 수 없음';
        if (p.protection_reason || p.has_work_descendants || DEV.test(p.comm ?? '')) return '보호 프로세스 또는 실행 중 작업 포함';
        const identityAge = snapshot.monotonic_ms - p.identity_observed_monotonic_ms + age;
        if (!Number.isFinite(identityAge) || identityAge < 0 || identityAge > 5000) return '프로세스 신원 재확인 필요';
        if (!(snapshot.processes ?? []).some(current => keyOf(current) === keyOf(p))) return '프로세스 신원 변경';
    }
    return null;
}

// One value per app row, summed within a single metric kind. PSS splits shared pages and RSS
// counts them whole (an upper bound).
export function appMetrics(groups) {
    const rows = groups.map(({processes}) => {
        const kinds = new Set(processes.map(p => p.metric_kind));
        const kind = kinds.size === 1 ? [...kinds][0] : null;
        const value = kind && processes.every(p => Number.isFinite(p.memory_bytes)) ?
            processes.reduce((sum, p) => sum + p.memory_bytes, 0) : null;
        const coverage = kinds.size === 1 && processes.length &&
            processes.every(p => p.coverage === 'complete') ? 'complete' : 'partial';
        return {kind, value, coverage};
    });
    const shown = new Set(rows.filter(row => row.value !== null).map(row => row.kind));
    const mixed = shown.has('pss') && shown.has('rss');
    return rows.map(row => ({...row, approximate: mixed && row.kind === 'rss' && row.value !== null}));
}

export function lowAccuracy(row) {
    return Boolean(row?.approximate) || row?.coverage !== 'complete' || (row?.kind ?? row?.metric_kind) === 'rss';
}

// Partial health has several causes (a process exiting mid-sample is enough), so it is not
// named here; the panel only shows a line when a row is actually missing its value.
export function healthText(snapshot) {
    return {ok: '관측 갱신됨', partial: '관측 갱신됨', error: '메모리 정보를 읽지 못함'}[snapshot?.health] ?? '관측 상태 미확인';
}

export function appView(groups, snapshot, ownerUid, protectedIds, age = 0) {
    return groups.slice(0, 100).map(group => {
        const reason = protection(group, snapshot, ownerUid, protectedIds, age);
        return {app_id: group.appId, process_keys: group.processes.map(p => ({uid: p.uid, pid: p.pid, start_ticks: p.start_ticks})),
            classification: reason ? (group.processes.length ? 'protected' : 'unknown') : 'active', reason_code: reason ? 'PROTECTED' : 'USER_REVIEW_REQUIRED'};
    });
}

export function sameTargets(previous, current) {
    return previous.length === current.length && previous.every(old => {
        const next = current.find(group => group.appId === old.appId);
        return next && keysEqual(old.processes, next.processes) && old.windows.length === next.windows.length &&
            old.windows.every(window => next.windows.includes(window));
    });
}

// Bounded JSON Lines framing on raw bytes. '\n' never occurs inside a UTF-8 sequence,
// so the byte limit holds without re-encoding the pending line on every chunk.
export function takeLines(state, chunk, limit, decoder, onLine) {
    let start = 0, newline;
    while ((newline = chunk.indexOf(10, start)) >= 0) {
        if (state.bytes + newline - start > limit) throw new Error('line byte limit');
        const line = state.text + decoder.decode(chunk.subarray(start, newline));
        state.text = ''; state.bytes = 0; start = newline + 1;
        onLine(line);
    }
    state.bytes += chunk.length - start;
    if (state.bytes > limit) throw new Error('line limit');
    state.text += decoder.decode(chunk.subarray(start));
}
