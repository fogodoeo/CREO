'use strict';
(() => {
    const $ = id => document.getElementById(id);
    let offset = 0, matched = 0, generation = 0;
    const sources = { profile: '프로필 번호', answer: '가입답변 번호', verified: '인증 휴대폰번호' };
    const phone = value => value ? value.replace(/^(010)(\d{4})(\d{4})$/, '$1-$2-$3') : '연락처 확인 필요';
    const element = (tag, text, className) => {
        const node = document.createElement(tag); node.textContent = text;
        if (className) node.className = className;
        return node;
    };
    function render(items) {
        $('memberList').replaceChildren(...items.map(member => {
            const row = element('article', '', 'memberRow');
            const identity = element('div', '');
            identity.append(element('h3', member.displayName || '이름 없음'), element('p', member.status === 'pending' ? '가입 확인 대기' : '등록 회원'));
            const contact = element('div', '', 'memberContact');
            contact.append(element('strong', phone(member.phone)), element('p', sources[member.phoneSource] || '등록된 번호 없음'));
            const details = element('details', '');
            details.append(element('summary', '프로필·가입답변 확인'));
            const list = element('dl', '');
            for (const [source, label] of Object.entries(sources)) {
                const evidence = member.sources[source];
                list.append(element('dt', label), element('dd', evidence?.text || '수집된 정보 없음'));
            }
            list.append(element('dt', '갱신 시간'), element('dd', new Date(member.updatedAt).toLocaleString('ko-KR')));
            details.append(list); row.append(identity, contact, details); return row;
        }));
    }
    async function load() {
        const current = ++generation;
        $('refreshMembers').disabled = true;
        $('directoryMessage').textContent = '회원 명단을 불러오고 있습니다.';
        $('memberList').setAttribute('aria-busy', 'true');
        try {
            const query = new URLSearchParams({ q: $('memberQuery').value.trim(), offset: String(offset) });
            const [response, statusResponse] = await Promise.all([
                fetch(`/api/band-directory/members?${query}`, { cache: 'no-store' }),
                fetch('/api/band-directory/status', { cache: 'no-store' })
            ]);
            if (current !== generation) return;
            if (response.status === 401) {
                render([]); $('loginLink').hidden = false;
                $('memberCount').textContent = '관리자 전용';
                $('directoryMessage').textContent = '운영자 로그인 후 이 화면으로 돌아와 새로고침해 주세요.';
                $('botState').textContent = '로그인 후 확인할 수 있습니다.';
                return;
            }
            if (!response.ok || !statusResponse.ok) throw new Error('load_failed');
            const [data, state] = await Promise.all([response.json(), statusResponse.json()]);
            if (current !== generation) return;
            $('loginLink').hidden = true;
            matched = data.matched;
            $('memberCount').textContent = `전체 ${data.total.toLocaleString()}명 · 연락처 ${data.contactable.toLocaleString()}명`;
            render(data.items);
            $('directoryMessage').textContent = data.items.length ? `${matched.toLocaleString()}명이 검색되었습니다.` : '검색 결과가 없습니다. 검색어를 바꾸거나 새로고침해 주세요.';
            $('pagePosition').textContent = matched ? `${offset + 1}–${offset + data.items.length} / ${matched}` : '0명';
            $('previousMembers').disabled = offset === 0;
            $('nextMembers').disabled = offset + 50 >= matched;
            const heartbeat = state.heartbeat;
            $('botState').textContent = state.stale ? '봇의 최근 연결 신호가 없습니다. Render 실행 상태를 확인해 주세요.'
                : heartbeat.state === 'login_required' ? '밴드 로그인이 필요합니다. 봇 계정 세션을 갱신해 주세요.'
                : heartbeat.state !== 'running' ? '연결 복구 중입니다. 잠시 후 새로고침해 주세요.'
                : `${heartbeat.autoApprove ? '자동승인 켜짐' : '자동승인 준비 중'} · ${heartbeat.rosterComplete ? '기존 회원 수집 완료' : '기존 회원 수집 중'} · 신청 ${heartbeat.pending}명`;
        } catch {
            if (current === generation) {
                render([]);
                $('directoryMessage').textContent = '명단을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.';
                $('botState').textContent = '연결 상태를 불러오지 못했습니다.';
            }
        } finally {
            if (current === generation) { $('refreshMembers').disabled = false; $('memberList').removeAttribute('aria-busy'); }
        }
    }
    $('searchForm').addEventListener('submit', event => { event.preventDefault(); offset = 0; void load(); });
    $('refreshMembers').addEventListener('click', () => void load());
    $('previousMembers').addEventListener('click', () => { offset = Math.max(0, offset - 50); void load(); });
    $('nextMembers').addEventListener('click', () => { if (offset + 50 < matched) { offset += 50; void load(); } });
    void load();
})();
