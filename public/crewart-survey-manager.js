const Core = window.CrewartSurveyCore;

let managedQuestions = [];
let selectedQuestionId = 'Q01';
let managerDirty = false;
let managerSaving = false;
let managerUpdatedAt = null;

async function contentApi(method = 'GET', content = null) {
    const response = await fetch('/api/crewart-survey/content', {
        method,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        ...(content ? { body: JSON.stringify({ content }) } : {})
    });
    let payload = null;
    try { payload = await response.json(); } catch (_) {}
    if (!response.ok) {
        const error = new Error(payload?.error || `문항 요청 실패 (${response.status})`);
        error.status = response.status;
        throw error;
    }
    return payload;
}

function cloneDefaults() {
    return Core.QUESTIONS.map(question => ({
        ...question,
        options: question.options.slice(),
        scores: question.scores.slice()
    }));
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
}

function toast(message, isError) {
    const target = document.getElementById('toast');
    target.textContent = message;
    target.style.borderColor = isError ? '#fca5a5' : 'var(--cw-gold)';
    target.classList.add('show');
    setTimeout(() => target.classList.remove('show'), 2600);
}

function mergeSavedContent(raw) {
    const result = cloneDefaults();
    if (!raw) return result;
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (parsed?.version !== Core.SURVEY_VERSION) return result;
        const items = Array.isArray(parsed) ? parsed : parsed?.questions;
        if (!Array.isArray(items)) return result;
        items.forEach(item => {
            const target = result.find(question => question.id === String(item?.id || '').toUpperCase());
            if (!target) return;
            if (String(item.label || '').trim()) target.label = String(item.label).trim();
            if (String(item.q || '').trim()) target.q = String(item.q).trim();
            if (Array.isArray(item.options) && item.options.length >= 2) {
                target.options = [
                    String(item.options[0] || '').trim() || target.options[0],
                    String(item.options[1] || '').trim() || target.options[1]
                ];
            }
        });
    } catch (error) {
        toast('저장된 문항을 읽지 못해 기본 문항을 표시합니다.', true);
    }
    return result;
}

function currentQuestion() {
    return managedQuestions.find(question => question.id === selectedQuestionId) || managedQuestions[0];
}

function renderQuestionList() {
    document.getElementById('manager-question-list').innerHTML = managedQuestions.map((question, index) => `
        <button class="cw-manager-question-button${question.id === selectedQuestionId ? ' active' : ''}" type="button" data-question-id="${question.id}">
            <span>${String(index + 1).padStart(2, '0')}</span>
            <strong>${escapeHtml(question.label)}</strong>
            <small>${question.axis}</small>
        </button>`).join('');
    document.querySelectorAll('[data-question-id]').forEach(button => {
        button.addEventListener('click', () => selectQuestion(button.dataset.questionId));
    });
}

function renderEditor() {
    const question = currentQuestion();
    if (!question) return;
    document.getElementById('manager-id').textContent = question.id;
    document.getElementById('manager-axis').textContent = question.axis;
    document.getElementById('manager-label').value = question.label;
    document.getElementById('manager-question').value = question.q;
    document.getElementById('manager-answer-a').value = question.options[0];
    document.getElementById('manager-answer-b').value = question.options[1];
    document.getElementById('manager-answer-a-label').textContent = `${question.scores[0]} 성향 선택지`;
    document.getElementById('manager-answer-b-label').textContent = `${question.scores[1]} 성향 선택지`;
}

function commitEditor() {
    const question = currentQuestion();
    if (!question) return;
    question.label = document.getElementById('manager-label').value.trim();
    question.q = document.getElementById('manager-question').value.trim();
    question.options = [
        document.getElementById('manager-answer-a').value.trim(),
        document.getElementById('manager-answer-b').value.trim()
    ];
}

function setDirty() {
    managerDirty = true;
    document.getElementById('manager-save-state').textContent = '저장하지 않은 변경사항이 있습니다.';
}

function selectQuestion(id) {
    commitEditor();
    selectedQuestionId = id;
    renderQuestionList();
    renderEditor();
}

function validateQuestions() {
    commitEditor();
    if (managedQuestions.length !== 20) throw new Error('20개 문항이 모두 필요합니다.');
    managedQuestions.forEach(question => {
        if (!question.label || !question.q || !question.options[0] || !question.options[1]) {
            throw new Error(`${question.id} 문항에 빈 내용이 있습니다.`);
        }
    });
}

async function saveQuestions() {
    if (managerSaving) return;
    try {
        validateQuestions();
        managerSaving = true;
        document.getElementById('manager-save-button').disabled = true;
        document.getElementById('manager-sticky-save').disabled = true;
        const content = {
            version: Core.SURVEY_VERSION,
            questions: managedQuestions.map(question => ({
                id: question.id,
                label: question.label,
                q: question.q,
                options: question.options.slice()
            }))
        };
        const payload = await contentApi('PUT', content);
        managerUpdatedAt = payload.contentUpdatedAt;
        managerDirty = false;
        document.getElementById('manager-save-state').textContent = `저장됨 · ${new Date(managerUpdatedAt).toLocaleString('ko-KR')}`;
        toast('20개 문항을 저장했습니다.');
    } catch (error) {
        if (error.status === 401) showManagerLogin('인증이 만료되었습니다. 다시 로그인해 주세요.');
        toast(error.message || '문항을 저장하지 못했습니다.', true);
    } finally {
        managerSaving = false;
        document.getElementById('manager-save-button').disabled = false;
        document.getElementById('manager-sticky-save').disabled = false;
    }
}

function resetCurrent() {
    const original = cloneDefaults().find(question => question.id === selectedQuestionId);
    const index = managedQuestions.findIndex(question => question.id === selectedQuestionId);
    if (!original || index < 0) return;
    managedQuestions[index] = original;
    renderQuestionList();
    renderEditor();
    setDirty();
}

function resetAll() {
    if (!window.confirm('20개 문항을 모두 기본값으로 되돌릴까요?')) return;
    managedQuestions = cloneDefaults();
    selectedQuestionId = 'Q01';
    renderQuestionList();
    renderEditor();
    setDirty();
}

async function loadManager() {
    try {
        const payload = await contentApi();
        managedQuestions = mergeSavedContent(payload.content);
        managerUpdatedAt = payload.contentUpdatedAt || null;
        document.getElementById('manager-save-state').textContent = managerUpdatedAt
            ? `마지막 저장 · ${new Date(managerUpdatedAt).toLocaleString('ko-KR')}`
            : '기본 문항을 사용 중입니다.';
        renderQuestionList();
        renderEditor();
        document.getElementById('manager-loading').hidden = true;
        document.getElementById('manager-workspace').hidden = false;
    } catch (error) {
        if (error.status === 401) showManagerLogin('인증이 만료되었습니다. 다시 로그인해 주세요.');
        toast('문항 설정을 불러오지 못했습니다: ' + error.message, true);
    }
}

function showManagerLogin(message = '') {
    document.getElementById('manager-auth').hidden = false;
    document.getElementById('manager-nav').hidden = true;
    document.getElementById('manager-main').hidden = true;
    document.getElementById('manager-sticky').hidden = true;
    document.getElementById('manager-login-error').textContent = message;
    const input = document.getElementById('manager-password');
    input.disabled = false;
    document.getElementById('manager-login-submit').disabled = false;
    requestAnimationFrame(() => input.focus({ preventScroll: true }));
}

async function showManager() {
    document.getElementById('manager-auth').hidden = true;
    document.getElementById('manager-nav').hidden = false;
    document.getElementById('manager-main').hidden = false;
    document.getElementById('manager-sticky').hidden = false;
    await loadManager();
}

document.getElementById('manager-save-button').addEventListener('click', saveQuestions);
document.getElementById('manager-sticky-save').addEventListener('click', saveQuestions);
document.getElementById('manager-reset-current').addEventListener('click', resetCurrent);
document.getElementById('manager-reset-all').addEventListener('click', resetAll);
['manager-label', 'manager-question', 'manager-answer-a', 'manager-answer-b'].forEach(id => {
    document.getElementById(id).addEventListener('input', setDirty);
});
window.addEventListener('beforeunload', event => {
    if (!managerDirty || managerSaving) return;
    event.preventDefault();
    event.returnValue = '';
});

document.getElementById('manager-login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const input = document.getElementById('manager-password');
    const submit = document.getElementById('manager-login-submit');
    const errorText = document.getElementById('manager-login-error');
    const password = input.value;
    if (!password) return;
    input.disabled = true;
    submit.disabled = true;
    errorText.textContent = '';
    try {
        CreoPlatform.setAdmin(password);
        if (!await CreoPlatform.verifyAdmin(password)) throw new Error('비밀번호가 맞지 않습니다.');
        input.value = '';
        await showManager();
    } catch (error) {
        CreoPlatform.setAdmin('');
        showManagerLogin(error.message || '로그인하지 못했습니다.');
    }
});

document.getElementById('manager-logout').addEventListener('click', async () => {
    await CreoPlatform.logout();
    showManagerLogin();
});

(async () => {
    try {
        if (await CreoPlatform.verifyAdmin()) return showManager();
    } catch (_) {}
    showManagerLogin();
})();
