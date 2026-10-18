import {sameTargets} from './policy.js';

// Injected Shell/window and persistence adapters keep the close gate testable.
// This module has no OS process or signal API, and never stores a window in demo.
export class CloseController {
    constructor(adapter) { this.a = adapter; this.review = null; this.busy = false; this.epoch = 0; }
    cancel() { this.review = null; this.epoch++; }
    prepare(groups) {
        if (this.busy || this.a.snapshot()?.mode !== 'live') throw new Error('실제 데이터 모드에서만 검토할 수 있습니다.');
        if (!groups.length) throw new Error('닫을 앱을 직접 선택하세요.');
        const snapshot = this.a.snapshot();
        for (const group of groups) {
            const reason = this.a.protection(group, snapshot);
            if (reason) throw new Error(reason);
        }
        this.review = {id: this.a.uuid(), groups: groups.map(g => ({...g, windows: [...g.windows], processes: [...g.processes]})),
            created: this.a.now(), epoch: this.epoch, sessionId: snapshot.session_id, bootId: snapshot.boot_id};
        return this.review;
    }
    async confirm() {
        const review = this.review;
        this.review = null; // One shot, including failures and double clicks.
        if (!review || this.busy || this.a.now() - review.created > 60000) throw new Error('검토가 만료되었습니다. 다시 선택하세요.');
        this.busy = true;
        let requested = false;
        let started = false;
        let snapshot;
        const items = review.groups.map(g => ({app_id: g.appId, result: 'requested', reason_code: 'USER_SELECTED'}));
        const ensure = sample => {
            if (review.epoch !== this.epoch || sample.mode !== 'live' || sample.session_id !== review.sessionId || sample.boot_id !== review.bootId)
                throw new Error('작업 또는 연결이 변경되었습니다.');
            const groups = this.a.groups(sample).filter(g => review.groups.some(old => old.appId === g.appId));
            if (!sameTargets(review.groups, groups)) throw new Error('앱 신원 또는 창 목록이 바뀌었습니다. 다시 검토하세요.');
            for (const g of groups) {
                const reason = this.a.protection(g, sample);
                if (reason) throw new Error(reason);
            }
            return groups;
        };
        const receipt = (status, details = items, after = null) => this.a.request('record_receipt', {
            sample_id: snapshot.sample_id, mode: 'live', action_id: review.id, status, items: details,
            ...(after ? {after_sample_id: after.sample_id} : {}),
        });
        try {
            snapshot = await this.a.fresh();
            let groups = ensure(snapshot);
            const viewAck = await this.a.recordView(snapshot, this.a.groups(snapshot));
            if (viewAck?.apps?.some(app => review.groups.some(g => g.appId === app.app_id) &&
                ['protected', 'unknown'].includes(app.classification)))
                throw new Error('관측기가 선택한 앱을 보호하거나 신원을 확인하지 못했습니다.');
            const ack = await receipt('requested');
            if (ack.type !== 'ack' || ack.status !== 'requested' || ack.action_id !== review.id)
                throw new Error('닫기 요청 기록을 확인하지 못했습니다.');
            requested = true;
            // The worker limits explicit sampling to one request per 250ms.
            // Keep a small margin before the mandatory post-commit identity check.
            await this.a.delay(300);
            // Persistence may take time. Obtain a second sample and recheck *after* ack.
            const latest = await this.a.fresh();
            groups = ensure(latest);
            this.a.onState('observing', '정상 닫기를 요청하고 10초 동안 관측합니다. 저장 확인 창에서는 취소할 수 있습니다.');
            started = true;
            for (const group of groups)
                for (const window of group.windows) this.a.close(window);
            await receipt('observing');
            const deadline = this.a.now() + 10000;
            let remaining = groups;
            let after = latest;
            while (this.a.now() < deadline) {
                await this.a.delay(1000);
                if (review.epoch !== this.epoch) throw new Error('관측이 중단되었습니다.');
                after = await this.a.fresh();
                remaining = this.a.groups(after).filter(g => review.groups.some(old => old.appId === g.appId));
                if (!remaining.length) break;
            }
            const results = items.map(item => ({...item,
                result: remaining.some(g => g.appId === item.app_id) ? 'still_running' : 'window_closed',
                reason_code: remaining.some(g => g.appId === item.app_id) ? 'WINDOW_REMAINS' : 'WINDOWS_CLOSED'}));
            const status = !remaining.length ? 'completed' : results.some(i => i.result === 'window_closed') ? 'partial' : 'timeout';
            const finalAck = await receipt(status, results, after);
            const delta = finalAck.receipt?.observed_delta;
            const observation = Number.isFinite(delta) ? ` 가용 메모리 차이 ${delta >= 0 ? '+' : '−'}${(Math.abs(delta) / 1048576).toFixed(0)} MiB (전체 시스템 관측값).` : '';
            this.a.onState(status, (status === 'completed' ? '선택한 창이 닫혔습니다. 백그라운드 프로세스는 남을 수 있습니다.' : '남아 있는 창이 있습니다. 취소/응답 지연을 구별할 수 없습니다.') + observation);
            return status;
        } catch (error) {
            if (requested && review.epoch === this.epoch) {
                try { await receipt(started ? 'partial' : 'rejected', items.map(i => ({...i,
                    result: started ? 'still_running' : 'rejected', reason_code: started ? 'INTERRUPTED' : 'TARGET_CHANGED'}))); }
                catch (_ignored) { /* The next worker session seals unfinished receipts as INTERRUPTED. */ }
            }
            if (review.epoch === this.epoch) this.a.onState('error', error.message);
            throw error;
        } finally { this.busy = false; }
    }
}
