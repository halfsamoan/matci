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
    // Each reason names the one thing that applies, so a locked row says why in plain words.
    if (protectedIds.includes(group.appId)) return '내가 보호한 앱';
    if (BUILTIN_IDS.includes(group.appId) || DEV.test(group.appId)) return '터미널·편집기·개발 도구는 닫지 않음';
    if (snapshot.truncated) return '프로세스 목록 일부만 관측됨';
    if (age < 0 || age > 5000) return '신원 관측이 오래됨 · 새로고침 필요';
    for (const p of group.processes) {
        if (!Number.isInteger(p.pid) || p.pid <= 0 || !Number.isInteger(p.uid) || p.uid !== ownerUid ||
            !Number.isInteger(p.start_ticks) || p.start_ticks <= 0) return '유효한 동일 사용자 신원 없음';
        if (snapshot.health === 'error' || snapshot.boot_id === 'unavailable') return '현재 관측을 확인할 수 없음';
        if (p.protection_reason || DEV.test(p.comm ?? '')) return '보호 대상 프로세스가 창을 소유';
        if (p.has_work_descendants) return '하위 작업 실행 중 (에이전트·터미널·빌드 등)';
        const identityAge = snapshot.monotonic_ms - p.identity_observed_monotonic_ms + age;
        if (!Number.isFinite(identityAge) || identityAge < 0 || identityAge > 5000) return '프로세스 신원 재확인 필요';
        if (!(snapshot.processes ?? []).some(current => keyOf(current) === keyOf(p))) return '프로세스 신원 변경';
    }
    return null;
}

// Display-only membership: each app's window process plus its descendant tree (Firefox content
// processes, Electron renderers/zygotes), stopping at another app's window process so a browser
// launched from a terminal stays its own row. Close identity keeps using group.processes.
// ponytail: crash handlers reparented to systemd --user (~4 MB per app) fall outside the tree.
export function attachMembers(groups, processes, windowPids) {
    const children = new Map();
    for (const process of processes) {
        if (!children.has(process.ppid)) children.set(process.ppid, []);
        children.get(process.ppid).push(process);
    }
    for (const group of groups) {
        const roots = new Set(group.processes.map(p => p.pid));
        const members = new Map();
        const stack = [...group.processes];
        while (stack.length) {
            const process = stack.pop();
            if (members.has(keyOf(process))) continue;
            members.set(keyOf(process), process);
            for (const child of children.get(process.pid) ?? []) {
                if (windowPids.has(child.pid) && !roots.has(child.pid)) continue;
                stack.push(child);
            }
        }
        group.members = [...members.values()];
    }
    return groups;
}

// One value per app row: the PSS sum of its members (PSS splits shared pages, so the rows do not
// double count). Members without PSS yet add their RSS, an upper bound, and mark the row partial.
export function appMetrics(groups, {truncated = false} = {}) {
    return groups.map(group => {
        const members = group.members ?? group.processes;
        const kinds = new Set(members.map(p => p.metric_kind));
        const kind = !members.length ? null : kinds.size === 1 ? [...kinds][0] : 'mixed';
        const value = members.length && members.every(p => Number.isFinite(p.memory_bytes)) ?
            members.reduce((sum, p) => sum + p.memory_bytes, 0) : null;
        const coverage = !truncated && kind !== 'mixed' && members.length &&
            members.every(p => p.coverage === 'complete') ? 'complete' : 'partial';
        return {kind, value, coverage, count: members.length, approximate: kind === 'mixed'};
    });
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
