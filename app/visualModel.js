// Fixed seed gives a stable memory field in both Canvas and Gtk.DrawingArea.
export const COLORS = Object.freeze({bg:'#050705', surface:'#111311', idle:'#e7bc62',
    active:'#4a8dff', protected:'#8e9297', freed:'#b9ff29', text:'#f4f4f2', muted:'#a0a3a6'});

export function memoryPoints(ratio, seconds = 0, release = 0, reduced = false) {
    if (!Number.isFinite(ratio)) return [];
    const count = Math.round(320 * Math.max(0, Math.min(1, ratio)));
    let seed = 2817;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const progress = Math.min(1, Math.max(0, release));
    const scatter = reduced ? 0 : 1 - Math.pow(1 - progress, 3);
    return Array.from({length: count}, (_, index) => {
        const x = random(), y = random(), phase = random() * Math.PI * 2;
        const drifting = !reduced && progress === 0;
        return {x: .18 + x * .69 + (drifting ? Math.sin(seconds * .3 + phase) * .015 : 0) + (x - .5) * scatter * .9,
            y: .09 + y * .82 + (drifting ? Math.cos(seconds * .23 + phase) * .012 : 0) - scatter * (.12 + y * .2),
            alpha: (.25 + random() * .65) * (1 - scatter), radius: .75 + random() * .8,
            color: !reduced && release > 0 && release < 1 && index % 4 === 0 ? COLORS.freed : index % 5 === 0 ? COLORS.active : COLORS.muted};
    });
}

export function formatBytes(value) {
    if (!Number.isFinite(value) || value < 0) return '확인 불가';
    if (value > 0 && value < 1048576) return '<1 MiB';
    return value < 1073741824 ? `${Math.round(value / 1048576)} MiB` : `${(value / 1073741824).toFixed(2)} GiB`;
}

export function observedChange(before, after) {
    return Number.isFinite(before) && Number.isFinite(after) ? after - before : null;
}
