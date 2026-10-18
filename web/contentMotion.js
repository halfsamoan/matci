const incoming=new WeakMap();
const scenes=new WeakMap();
const markup=new WeakMap();
const ghosts=new WeakMap();
const curve='cubic-bezier(.22,1,.36,1)';

export function settleContent(node) {
    for (const animation of incoming.get(node)??[]) animation.cancel();
    incoming.delete(node);
    ghosts.get(node)?.remove(); ghosts.delete(node);
}

export function replaceContent(node,html,scene,expanded,reduced) {
    if (markup.get(node)===html && scenes.get(node)===scene) {
        if (reduced) settleContent(node);
        return;
    }
    const changed=scenes.has(node) && scenes.get(node)!==scene;
    const previousGhost=ghosts.get(node); previousGhost?.remove();
    const running=(incoming.get(node)??[]).some(animation=>animation.playState==='running');
    const presentation=[...node.querySelectorAll(':scope > .island-header,:scope > .island-body')].map(element=>{
        const style=getComputedStyle(element); return {opacity:style.opacity,transform:style.transform};
    });
    let ghost=null;
    if (changed && !reduced) {
        ghost=node.cloneNode(true); ghost.removeAttribute('id');
        ghost.querySelectorAll('[id]').forEach(element=>element.removeAttribute('id'));
        ghost.classList.add('island-ghost'); ghost.inert=true; ghost.setAttribute('aria-hidden','true');
        Object.assign(ghost.style,{left:'0px',top:'0px',width:`${node.clientWidth}px`,height:`${node.clientHeight}px`,transition:'none'});
        [...ghost.children].forEach((child,index)=>Object.assign(child.style,presentation[index]??{},{transition:'none'}));
    }
    for (const animation of incoming.get(node)??[]) animation.cancel();
    node.innerHTML=html; node.classList.toggle('expanded',expanded);
    scenes.set(node,scene); markup.set(node,html); incoming.delete(node);
    if (reduced) { ghosts.delete(node); return; }
    if (ghost) {
        node.append(ghost); ghosts.set(node,ghost);
        ghost.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-4px)'}],{duration:110,easing:curve}).finished
            .then(()=>{ghost.remove();if(ghosts.get(node)===ghost)ghosts.delete(node);}).catch(()=>ghost.remove());
    } else if (previousGhost && !changed) { node.append(previousGhost); ghosts.set(node,previousGhost); }
    else ghosts.delete(node);
    if (!changed && !running) return;
    const animations=[...node.querySelectorAll(':scope > .island-header,:scope > .island-body')].flatMap((element,index)=>{
        const body=element.classList.contains('island-body');
        if (body && !expanded) return [];
        const from=changed && !running ? {opacity:0,transform:`translateY(${body?6:2}px)`} : presentation[index];
        if (!from) return [];
        return [element.animate([from,{opacity:1,transform:'translateY(0)'}],
            {duration:body?220:160,delay:changed&&!running&&body?55:0,easing:curve,fill:'both'})];
    });
    incoming.set(node,animations);
    for(const animation of animations) animation.finished.then(()=>animation.cancel()).catch(()=>{});
}
