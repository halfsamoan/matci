import test from 'node:test';
import assert from 'node:assert/strict';
import {ContentMotion} from '../extension/contentMotion.js';

class Actor {
    opacity=255;translation_y=0;destroyed=0;reactive=true;animations=[];
    remove_all_transitions(){}
    destroy(){this.destroyed++;}
    ease(options){this.animations.push(options);}
}
const setup=()=>new ContentMotion({add_child(){}},actor=>{actor.reactive=false;},()=>true,0);
test('semantic swap disables outgoing controls and cleans up rapid replacements',()=>{
    const motion=setup(),a=new Actor(),b=new Actor(),c=new Actor();
    motion.show(a,'compact');motion.show(b,'overview');
    assert.equal(a.reactive,false);
    assert.equal(b.opacity,0);assert.equal(b.translation_y,6);
    b.opacity=100;b.translation_y=3;motion.show(c,'review');
    assert.equal(a.destroyed,1);assert.equal(b.opacity,100);assert.equal(b.translation_y,3);
    assert.equal(c.opacity,100);assert.equal(c.translation_y,3);assert.equal(c.animations[0].delay,0);
    a.animations[0].onComplete();assert.equal(a.destroyed,1);
    motion.finish();assert.equal(b.destroyed,1);assert.equal(c.opacity,255);assert.equal(c.translation_y,0);
    motion.destroy();assert.equal(c.destroyed,1);
});
test('reduced motion swaps immediately and routine data updates do not start a new scene transition',()=>{
    const motion=setup(),a=new Actor(),b=new Actor(),c=new Actor();
    motion.show(a,'compact');motion.show(b,'compact');assert.equal(a.destroyed,1);assert.equal(b.animations.length,0);
    motion.enabled=()=>false;motion.show(c,'review');assert.equal(b.destroyed,1);assert.equal(c.animations.length,0);assert.equal(c.opacity,255);
});
