// Fixed seed gives a stable memory field in both Canvas and Gtk.DrawingArea.
export const COLORS = Object.freeze({bg:'#050705', surface:'#111311', idle:'#e7bc62',
    active:'#4a8dff', protected:'#8e9297', freed:'#b9ff29', text:'#f4f4f2', muted:'#a0a3a6'});

export function memoryPoints(ratio, seconds = 0, release = 0, reduced = false) {
    if (!Number.isFinite(ratio)) return [];
    const count = Math.round(320 * Math.max(0, Math.min(1, ratio)));
    let seed = 2817;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const scatter = reduced ? 0 : Math.sin(Math.min(1, Math.max(0, release)) * Math.PI);
    return Array.from({length: count}, (_, index) => {
        const x = random(), y = random(), phase = random() * Math.PI * 2;
        return {x: .18 + x * .69 + (reduced ? 0 : Math.sin(seconds * .3 + phase) * .015) + (x - .5) * scatter * .65,
            y: .09 + y * .82 + (reduced ? 0 : Math.cos(seconds * .23 + phase) * .012) - scatter * .13,
            alpha: (.25 + random() * .65) * (1 - scatter * .6), radius: .75 + random() * .8,
            color: !reduced && release > 0 && release < 1 && index % 4 === 0 ? COLORS.freed : index % 5 === 0 ? COLORS.active : COLORS.muted};
    });
}

export function observedChange(before, after) {
    return Number.isFinite(before) && Number.isFinite(after) ? after - before : null;
}
