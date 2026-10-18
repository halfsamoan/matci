import test from 'node:test';
import assert from 'node:assert/strict';
import {formatBytes,memoryPoints} from '../app/visualModel.js';

test('adaptive binary units retain zero/unknown and switch at exactly one GiB',()=>{
    for(const [value,expected] of [[0,'0 MiB'],[1,'<1 MiB'],[164*1048576,'164 MiB'],[744*1048576,'744 MiB'],
        [1073741823,'1024 MiB'],[1073741824,'1.00 GiB'],[1.2*1073741824,'1.20 GiB'],
        [null,'확인 불가'],[NaN,'확인 불가'],[-1,'확인 불가']]) assert.equal(formatBytes(value),expected);
});
test('outgoing particles move in one direction and fade to zero without returning',()=>{
    const frames=[.01,.25,.5,.75,1].map(progress=>memoryPoints(.75,10,progress));
    for(let i=0;i<frames[0].length;i++) {
        const direction=Math.sign(frames[1][i].x-frames[0][i].x);
        for(let frame=1;frame<frames.length;frame++) {
            assert.ok((frames[frame][i].x-frames[frame-1][i].x)*direction>=0);
            assert.ok(frames[frame][i].y<=frames[frame-1][i].y);
            assert.ok(frames[frame][i].alpha<=frames[frame-1][i].alpha);
        }
        assert.equal(frames.at(-1)[i].alpha,0);
    }
});
