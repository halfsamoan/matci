// Only content actors animate. The notch actor keeps its existing geometry motion.
export class ContentMotion {
    constructor(host, inert, enabled, mode) {
        Object.assign(this, {host, inert, enabled, mode, current:null, outgoing:null, key:null});
    }
    finish() {
        if (this.outgoing) {
            this.outgoing.remove_all_transitions(); this.outgoing.destroy(); this.outgoing=null;
        }
        if (this.current) {
            this.current.remove_all_transitions(); this.current.opacity=255; this.current.translation_y=0;
        }
    }
    show(next, key) {
        if (this.outgoing) { this.outgoing.remove_all_transitions(); this.outgoing.destroy(); this.outgoing=null; }
        const previous=this.current, changed=this.key!==null && key!==this.key;
        previous?.remove_all_transitions();
        this.current=next; this.key=key; this.host.add_child(next);
        if (!previous) return;
        if (!changed || !this.enabled()) {
            if (this.enabled() && previous.opacity<255) {
                next.opacity=previous.opacity; next.translation_y=previous.translation_y;
                next.ease({opacity:255,translation_y:0,duration:180,mode:this.mode});
            }
            previous.destroy(); return;
        }
        this.inert(previous);
        // The host measures only its newest child and preserves older allocations.
        this.outgoing=previous;
        const interrupted=previous.opacity<255;
        next.opacity=interrupted?previous.opacity:0;
        next.translation_y=interrupted?previous.translation_y:6;
        previous.ease({opacity:0,translation_y:-4,duration:100,mode:this.mode,onComplete:()=>{
            if (this.outgoing===previous) { previous.destroy(); this.outgoing=null; }
        }});
        next.ease({opacity:255,translation_y:0,delay:interrupted?0:55,duration:180,mode:this.mode});
    }
    destroy() { this.finish(); this.current?.destroy(); this.current=null; }
}
