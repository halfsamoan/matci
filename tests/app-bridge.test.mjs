import test from 'node:test';
import assert from 'node:assert/strict';
import {AppBridge,publicApps} from '../extension/appBridge.js';
import {memoryPoints,observedChange} from '../app/visualModel.js';
import {readFileSync} from 'node:fs';

function setup() {
    let now=0, count=0;
    const groups=[{appId:'photo.desktop',name:'Photo',windows:[{}],processes:[{pid:42,memory_bytes:5,metric_kind:'pss'}],interactionAgeMs:600000}];
    const controller={busy:false,review:null,prepare(selected){this.review={id:`token-${++count}`};return this.review;},
        cancel(){this.review=null;},async confirm(){this.review=null;return 'completed';}};
    const bridge=new AppBridge({controller,groups:()=>groups,now:()=>now});
    return {bridge,controller,groups,advance:n=>{now=n;}};
}
test('review binds nonce to client, one confirm only; foreign sender cannot consume it',async()=>{
    const {bridge}=setup(), review=bridge.review(':1.1',['photo.desktop']);
    await assert.rejects(()=>bridge.confirm(':1.2',review.token),/MISMATCH/);
    assert.deepEqual(await bridge.confirm(':1.1',review.token),{status:'completed'});
    await assert.rejects(()=>bridge.confirm(':1.1',review.token),/MISMATCH/);
});
test('expired, disconnected and restarted reviews never resume',async()=>{
    const {bridge,advance}=setup(); let review=bridge.review(':1.1',['photo.desktop']); advance(60001);
    await assert.rejects(()=>bridge.confirm(':1.1',review.token),/EXPIRED/);
    review=bridge.review(':1.1',['photo.desktop']); bridge.disconnect(':1.1');
    await assert.rejects(()=>bridge.confirm(':1.1',review.token),/MISMATCH/);
    review=bridge.review(':1.1',['photo.desktop']); bridge.invalidate();
    await assert.rejects(()=>bridge.confirm(':1.1',review.token),/MISMATCH/);
});
test('expired pending does not block a new review; busy and invalid selections fail closed',()=>{
    const {bridge,advance,controller}=setup(); bridge.review(':1.1',['photo.desktop']); advance(60001);
    assert.ok(bridge.review(':1.2',['photo.desktop']).token); bridge.invalidate();
    for (const ids of [[],['photo.desktop','photo.desktop'],['unknown.desktop'],['../shell']]) assert.throws(()=>bridge.review(':1.1',ids));
    controller.busy=true; assert.throws(()=>bridge.review(':1.1',['photo.desktop']),/BUSY/);
});
test('public view never exports PID/window tokens or fabricates mixed metrics',()=>{
    const {groups}=setup(); let view=publicApps(groups,()=>null)[0];
    assert.equal(view.section,'idle'); assert.equal(view.memory_bytes,5); assert.ok(!('windows' in view && Array.isArray(view.windows)));
    assert.ok(!JSON.stringify(view).includes('pid'));
    groups[0].processes.push({memory_bytes:10,metric_kind:'rss'});
    view=publicApps(groups,()=> 'protected')[0]; assert.equal(view.memory_bytes,null); assert.equal(view.section,'active'); assert.equal(view.reason,'protected');
    groups[0].processes=[]; assert.equal(publicApps(groups,()=> 'unmapped')[0].section,'protected');
});
test('field has bounded density, reduced motion is stable, and observed deltas preserve sign',()=>{
    assert.equal(memoryPoints(null).length,0); assert.equal(memoryPoints(1).length,320);
    assert.deepEqual(memoryPoints(.75,1,0,true),memoryPoints(.75,200,.8,true));
    assert.equal(observedChange(10,8),-2); assert.equal(observedChange(null,8),null);
    assert.equal(readFileSync(new URL('../app/visualModel.js',import.meta.url),'utf8'),readFileSync(new URL('../web/visualModel.js',import.meta.url),'utf8'));
});
