// The GTK client shares the Shell controller; it never receives window/PID tokens.
export class AppBridge {
    constructor(adapter) { this.a = adapter; this.pending = null; this.closed = false; }
    invalidate() { this.pending = null; this.a.controller.cancel(); this.a.onInvalidate?.(); }
    disconnect(sender) { if (this.pending?.sender === sender) this.invalidate(); }
    review(sender, ids) {
        if (this.pending && this.a.now() > this.pending.expires) this.invalidate();
        if (this.closed || this.a.controller.busy || this.pending || this.a.controller.review) throw new Error('BUSY');
        if (typeof sender !== 'string' || !sender.startsWith(':') || !Array.isArray(ids) || !ids.length || ids.length > 100 ||
            ids.some(id => typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._@+-]{0,254}$/.test(id)) || new Set(ids).size !== ids.length)
            throw new Error('INVALID_SELECTION');
        const groups = this.a.groups();
        const selected = groups.filter(group => ids.includes(group.appId));
        if (selected.length !== ids.length) throw new Error('TARGET_CHANGED');
        const review = this.a.controller.prepare(selected);
        this.pending = {sender, token: review.id, expires: this.a.now() + 60000};
        this.a.onReview?.();
        return {token: review.id, apps: selected.map(g => ({app_id: g.appId, name: g.name.slice(0, 120), windows: g.windows.length}))};
    }
    check(sender, token) {
        if (this.closed || !this.pending || this.pending.sender !== sender || this.pending.token !== token) throw new Error('REVIEW_MISMATCH');
        if (this.a.now() > this.pending.expires || this.a.controller.review?.id !== token) {
            this.invalidate(); throw new Error('REVIEW_EXPIRED');
        }
    }
    async confirm(sender, token) {
        this.check(sender, token);
        this.pending = null;
        return {status: await this.a.controller.confirm()};
    }
    cancel(sender, token) { this.check(sender, token); this.invalidate(); return {status:'cancelled'}; }
    destroy() { this.closed = true; this.invalidate(); }
}

export function publicApps(groups, reasonFor) {
    return groups.slice(0, 100).map(group => {
        const reason = reasonFor(group);
        const metrics = group.processes ?? [];
        const kinds = new Set(metrics.map(p => p.metric_kind));
        const memory = metrics.length && kinds.size === 1 && metrics.every(p => Number.isFinite(p.memory_bytes)) ?
            metrics.reduce((sum, p) => sum + p.memory_bytes, 0) : null;
        const inputAge = group.interactionAgeMs;
        // Idle is descriptive; it never auto-selects or authorizes a close.
        const section = reason ? (metrics.length && group.appId !== 'org.gnome.Shell.desktop' ? 'active' : 'protected') :
            Number.isFinite(inputAge) && inputAge >= 300000 ? 'idle' : 'active';
        return {app_id: group.appId, name: String(group.name).slice(0,120), windows: group.windows.length,
            memory_bytes: memory, metric_kind: kinds.size === 1 ? [...kinds][0] : null,
            input_age_ms: Number.isFinite(inputAge) ? inputAge : null, section, reason};
    });
}
