(function (root, factory) {
    'use strict';
    const runtime = typeof module === 'object' && module.exports
        ? require('./channel-runtime')
        : root.CreoChannelRuntime;
    const api = factory(root, runtime);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.CreoOperatorPipeline = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root, Runtime) {
    'use strict';

    const STEPS = Object.freeze([
        Object.freeze({ id: 'workspace', route: 'workspace', number: '1', label: '경매 관리', detail: '업체 · 개체 · 순서' }),
        Object.freeze({ id: 'broadcast', route: 'control', number: '2', label: '방송 진행', detail: '1P · 2P · 3P' }),
        Object.freeze({ id: 'shipping', route: 'shipping', number: '3', label: '배송 · 결제', detail: '구매자 · 업체 확인' }),
        Object.freeze({ id: 'print', route: 'print', number: '4', label: '정산 · 인쇄', detail: '현황 · 시트 · 라벨' })
    ]);

    const CURRENT_ALIASES = Object.freeze({
        manage: 'workspace',
        auction: 'workspace',
        control: 'broadcast',
        checkout: 'shipping',
        settlement: 'print'
    });

    function currentId(value) {
        const normalized = String(value || '').trim().toLowerCase();
        return CURRENT_ALIASES[normalized] || normalized;
    }

    function channelFromLocation(locationRef = root.location) {
        if (!locationRef || !Runtime) return '';
        const params = new URLSearchParams(locationRef.search || '');
        return Runtime.normalizeChannelId(params.get('channel') || params.get('event'));
    }

    function model(channelId, current, channelName = '') {
        if (!Runtime) throw new Error('CreoChannelRuntime is required');
        const id = Runtime.normalizeChannelId(channelId);
        if (!id) return null;
        const routes = Runtime.channelRoutes(id);
        return {
            channelId: id,
            channelName: String(channelName || id).trim(),
            current: currentId(current),
            home: routes.home,
            settings: routes.settings,
            steps: STEPS.map(step => ({ ...step, href: routes[step.route], active: step.id === currentId(current) }))
        };
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    }

    function renderMarkup(state, tone) {
        const steps = state.steps.map(step => `
            <a class="step${step.active ? ' active' : ''}" href="${escapeHtml(step.href)}"${step.active ? ' aria-current="step"' : ''}>
                <i>${step.number}</i><span><b>${step.label}</b><small>${step.detail}</small></span>
            </a>`).join('');
        return `<style>
            :host{display:block;position:relative;z-index:8;background:${tone === 'dark' ? '#0d1014' : '#f5f6f8'};color:${tone === 'dark' ? '#f4f5f7' : '#18202a'};font-family:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:-.018em}
            *{box-sizing:border-box}.bar{display:grid;grid-template-columns:minmax(130px,190px) minmax(0,1fr) auto;align-items:center;gap:14px;width:min(1220px,calc(100% - 32px));min-height:52px;margin:auto;padding:7px 0;border-bottom:1px solid ${tone === 'dark' ? '#242a32' : '#dde2e8'}}
            .channel{min-width:0;color:inherit;text-decoration:none}.channel small{display:block;color:${tone === 'dark' ? '#707a87' : '#7b8591'};font-size:8px;font-weight:900;letter-spacing:.12em}.channel b{display:block;overflow:hidden;margin-top:2px;font-size:12px;font-weight:850;text-overflow:ellipsis;white-space:nowrap}
            nav{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}.step{display:flex;min-width:0;align-items:center;gap:8px;padding:7px 9px;border:1px solid transparent;border-radius:9px;color:${tone === 'dark' ? '#929ca8' : '#66717d'};text-decoration:none}.step:hover{background:${tone === 'dark' ? '#171b21' : '#fff'};color:inherit}.step.active{border-color:${tone === 'dark' ? '#6d5b34' : '#cab67d'};background:${tone === 'dark' ? '#211c12' : '#fffaf0'};color:${tone === 'dark' ? '#e8c87c' : '#6d5521'}}
            .step i{display:grid;width:22px;height:22px;flex:0 0 auto;place-items:center;border:1px solid ${tone === 'dark' ? '#363d47' : '#d9dee5'};border-radius:7px;font-size:9px;font-style:normal;font-weight:900}.step.active i{border-color:currentColor}.step span{min-width:0}.step b,.step small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.step b{font-size:10px;font-weight:850}.step small{margin-top:1px;color:${tone === 'dark' ? '#68727e' : '#87909a'};font-size:7px;font-weight:700}
            .settings{padding:8px 10px;border-radius:8px;color:${tone === 'dark' ? '#87919d' : '#707a85'};font-size:9px;font-weight:800;text-decoration:none;white-space:nowrap}.settings:hover{background:${tone === 'dark' ? '#171b21' : '#fff'};color:inherit}
            @media(max-width:760px){.bar{grid-template-columns:1fr auto;width:calc(100% - 20px);gap:7px;padding:6px 0}.channel{grid-column:1}.settings{grid-column:2}.bar nav{grid-column:1/-1;grid-row:2;gap:3px}.step{justify-content:center;padding:7px 4px}.step i{width:20px;height:20px}.step small{display:none}.step b{font-size:9px}}
            @media print{:host{display:none!important}}
        </style><div class="bar"><a class="channel" href="${escapeHtml(state.home)}"><small>OPERATING CHANNEL</small><b>${escapeHtml(state.channelName)}</b></a><nav aria-label="경매 운영 단계">${steps}</nav><a class="settings" href="${escapeHtml(state.settings)}">채널 설정</a></div>`;
    }

    let PipelineElement = null;
    if (root.customElements && root.HTMLElement && !root.customElements.get('creo-operator-pipeline')) {
        PipelineElement = class extends root.HTMLElement {
            static get observedAttributes() { return ['channel', 'channel-name', 'current', 'tone']; }
            constructor() {
                super();
                this.attachShadow({ mode: 'open' });
            }
            connectedCallback() { this.render(); }
            attributeChangedCallback() { if (this.isConnected) this.render(); }
            render() {
                if (new URLSearchParams(root.location?.search || '').get('embedded') === '1') {
                    this.hidden = true;
                    return;
                }
                const state = model(this.getAttribute('channel') || channelFromLocation(), this.getAttribute('current'), this.getAttribute('channel-name'));
                this.hidden = !state;
                this.shadowRoot.innerHTML = state ? renderMarkup(state, this.getAttribute('tone') === 'dark' ? 'dark' : 'light') : '';
            }
        };
        root.customElements.define('creo-operator-pipeline', PipelineElement);
    }

    function sync(channelId, channelName = '') {
        if (!root.document) return;
        root.document.querySelectorAll('creo-operator-pipeline').forEach(element => {
            element.setAttribute('channel', channelId);
            if (channelName) element.setAttribute('channel-name', channelName);
        });
    }

    return Object.freeze({ STEPS, channelFromLocation, currentId, model, sync });
});
