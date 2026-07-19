'use strict';

const { createHmac, randomBytes, timingSafeEqual } = require('node:crypto');

const BAND_AUTHORIZE_URL = 'https://auth.band.us/oauth2/authorize';
const BAND_TOKEN_URL = 'https://auth.band.us/oauth2/token';
const BAND_PROFILE_URL = 'https://openapi.band.us/v2/profile';
const BAND_LIST_URL = 'https://openapi.band.us/v2.1/bands';
const STATE_TYPE = 'band_oauth_state';
const SESSION_TYPE = 'band_oauth_session';
const STATE_COOKIE = 'creo_band_oauth_state';

function base64UrlEncode(value) {
    return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
    return Buffer.from(String(value || ''), 'base64url').toString('utf8');
}

function signToken(payload, secret) {
    const body = base64UrlEncode(JSON.stringify(payload));
    const signature = createHmac('sha256', secret).update(body).digest('base64url');
    return `${body}.${signature}`;
}

function verifyToken(token, secret, expectedType, nowMs = Date.now()) {
    const [body, signature, extra] = String(token || '').split('.');
    if (!body || !signature || extra) throw new Error('invalid token');
    const expected = createHmac('sha256', secret).update(body).digest();
    let received;
    try {
        received = Buffer.from(signature, 'base64url');
    } catch {
        throw new Error('invalid token');
    }
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
        throw new Error('invalid token');
    }

    let payload;
    try {
        payload = JSON.parse(base64UrlDecode(body));
    } catch {
        throw new Error('invalid token');
    }
    const now = Math.floor(nowMs / 1000);
    if (!payload || payload.typ !== expectedType || !Number.isFinite(payload.exp) || payload.exp < now) {
        throw new Error('expired token');
    }
    if (!Number.isFinite(payload.iat) || payload.iat > now + 60) throw new Error('invalid token');
    return payload;
}

function publicSubject(userKey, secret) {
    const digest = createHmac('sha256', secret)
        .update(`band-user:${String(userKey || '')}`)
        .digest('base64url')
        .slice(0, 32);
    return `band_${digest}`;
}

function trimSlash(value) {
    return String(value || '').trim().replace(/\/+$/, '');
}

function positiveInteger(value, fallback, minimum, maximum) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(minimum, Math.min(maximum, Math.round(number)));
}

function loadConfig(env = process.env) {
    const publicBaseUrl = trimSlash(
        env.BAND_OAUTH_PUBLIC_URL || env.RENDER_EXTERNAL_URL || 'https://creok.onrender.com'
    );
    const targetBandNo = String(env.BAND_OAUTH_TARGET_BAND_NO || '101992972').trim();
    const returnUrl = String(
        env.BAND_OAUTH_RETURN_URL || 'https://creok.onrender.com/crewart-survey.html'
    ).trim();
    const callbackUrl = String(
        env.BAND_OAUTH_REDIRECT_URI || `${publicBaseUrl}/api/band-oauth/callback`
    ).trim();
    const allowedReturnUrls = [
        returnUrl,
        ...String(env.BAND_OAUTH_ALLOWED_RETURN_URLS || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
    ].filter((value, index, values) => values.indexOf(value) === index);
    const allowedOrigins = [];
    for (const value of allowedReturnUrls) {
        try {
            const parsed = new URL(value);
            if (parsed.protocol === 'https:' && !allowedOrigins.includes(parsed.origin)) {
                allowedOrigins.push(parsed.origin);
            }
        } catch {
            // Invalid configuration is reported through configured=false.
        }
    }

    const config = {
        clientId: String(env.BAND_OAUTH_CLIENT_ID || '').trim(),
        clientSecret: String(env.BAND_OAUTH_CLIENT_SECRET || '').trim(),
        sessionSecret: String(env.BAND_OAUTH_SESSION_SECRET || '').trim(),
        publicBaseUrl,
        callbackUrl,
        returnUrl,
        allowedOrigin: allowedOrigins[0] || '',
        allowedOrigins,
        allowedReturnUrls,
        targetBandNo,
        targetBandKey: String(env.BAND_OAUTH_TARGET_BAND_KEY || '').trim(),
        targetBandUrl: String(
            env.BAND_OAUTH_TARGET_BAND_URL || `https://www.band.us/band/${targetBandNo}/post`
        ).trim(),
        stateTtlSec: positiveInteger(env.BAND_OAUTH_STATE_TTL_SEC, 600, 60, 1800),
        sessionTtlSec: positiveInteger(env.BAND_OAUTH_SESSION_TTL_SEC, 21600, 300, 86400),
        requestTimeoutMs: positiveInteger(env.BAND_OAUTH_REQUEST_TIMEOUT_MS, 10000, 1000, 30000)
    };

    config.configured = Boolean(
        config.clientId
        && config.clientSecret
        && config.sessionSecret.length >= 32
        && config.allowedReturnUrls.length > 0
        && config.allowedReturnUrls.every((value) => /^https:\/\//i.test(value))
        && /^https:\/\//i.test(config.callbackUrl)
        && /^https:\/\//i.test(config.returnUrl)
    );
    return config;
}

function redirect(res, location, extraHeaders = {}) {
    res.writeHead(302, {
        Location: location,
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        ...extraHeaders
    });
    res.end();
}

function sendJson(res, status, value, extraHeaders = {}) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        ...extraHeaders
    });
    res.end(JSON.stringify(value));
}

function corsHeaders(config, req) {
    const origin = String(req.headers?.origin || '');
    if (!origin || !config.allowedOrigins.includes(origin)) return {};
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin'
    };
}

function isAllowedReturnUrl(value, config) {
    if (!value) return config.returnUrl;
    try {
        const requested = new URL(value);
        requested.hash = '';
        const normalized = requested.toString();
        const allowed = config.allowedReturnUrls.some((candidate) => {
            const parsed = new URL(candidate);
            parsed.hash = '';
            return parsed.toString() === normalized;
        });
        return allowed ? normalized : '';
    } catch {
        return '';
    }
}

function addFragment(urlValue, key, value) {
    const url = new URL(urlValue);
    const params = new URLSearchParams(url.hash.replace(/^#/, ''));
    params.set(key, value);
    url.hash = params.toString();
    return url.toString();
}

function parseCookies(req) {
    const result = {};
    for (const part of String(req.headers?.cookie || '').split(';')) {
        const separator = part.indexOf('=');
        if (separator < 1) continue;
        const name = part.slice(0, separator).trim();
        const value = part.slice(separator + 1).trim();
        try {
            result[name] = decodeURIComponent(value);
        } catch {
            result[name] = value;
        }
    }
    return result;
}

function stateCookie(token, maxAge) {
    return `${STATE_COOKIE}=${encodeURIComponent(token)}; Path=/api/band-oauth; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearStateCookie() {
    return `${STATE_COOKIE}=; Path=/api/band-oauth; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

async function readSmallJson(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk;
            if (body.length > 16384) {
                reject(new Error('request too large'));
                req.destroy?.();
            }
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch {
                reject(new Error('invalid json'));
            }
        });
        req.on('error', reject);
    });
}

async function fetchJson(fetchImpl, url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetchImpl(url, { ...options, signal: controller.signal });
        const value = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(`BAND request failed (${response.status})`);
            error.status = response.status;
            throw error;
        }
        return value;
    } finally {
        clearTimeout(timer);
    }
}

function createBandOAuth(options = {}) {
    const config = loadConfig(options.env || process.env);
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    const logger = options.logger || console;
    const now = options.now || (() => Date.now());

    function makeState(returnUrl) {
        const issuedAt = Math.floor(now() / 1000);
        return signToken({
            typ: STATE_TYPE,
            iat: issuedAt,
            exp: issuedAt + config.stateTtlSec,
            nonce: randomBytes(18).toString('base64url'),
            returnUrl
        }, config.sessionSecret);
    }

    function makeSession(profile, isTargetMember) {
        const issuedAt = Math.floor(now() / 1000);
        return signToken({
            typ: SESSION_TYPE,
            iat: issuedAt,
            exp: issuedAt + config.sessionTtlSec,
            sub: publicSubject(profile.user_key, config.sessionSecret),
            name: String(profile.name || '').trim().slice(0, 80),
            avatar: String(profile.profile_image_url || '').trim().slice(0, 1000) || null,
            isTargetMember
        }, config.sessionSecret);
    }

    async function exchangeCode(code) {
        const tokenUrl = new URL(BAND_TOKEN_URL);
        tokenUrl.searchParams.set('grant_type', 'authorization_code');
        tokenUrl.searchParams.set('code', code);
        const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
        const token = await fetchJson(fetchImpl, tokenUrl, {
            method: 'GET',
            headers: { Authorization: `Basic ${basic}`, Accept: 'application/json' }
        }, config.requestTimeoutMs);
        if (!token.access_token) throw new Error('BAND access token missing');
        return token.access_token;
    }

    async function fetchProfile(accessToken) {
        const profileUrl = new URL(BAND_PROFILE_URL);
        profileUrl.searchParams.set('access_token', accessToken);
        const profileResponse = await fetchJson(fetchImpl, profileUrl, {
            method: 'GET', headers: { Accept: 'application/json' }
        }, config.requestTimeoutMs);
        const profile = profileResponse?.result_data;
        if (Number(profileResponse?.result_code) !== 1 || !profile?.user_key) {
            throw new Error('BAND profile unavailable');
        }
        return profile;
    }

    async function checkMembership(accessToken) {
        if (!config.targetBandKey) return null;
        const bandsUrl = new URL(BAND_LIST_URL);
        bandsUrl.searchParams.set('access_token', accessToken);
        const response = await fetchJson(fetchImpl, bandsUrl, {
            method: 'GET', headers: { Accept: 'application/json' }
        }, config.requestTimeoutMs);
        const bands = Array.isArray(response?.result_data?.bands) ? response.result_data.bands : [];
        return bands.some((band) => String(band?.band_key || '') === config.targetBandKey);
    }

    async function handle(req, res, url) {
        const pathname = url.pathname;
        if (!pathname.startsWith('/api/band-oauth/')) return false;

        const cors = corsHeaders(config, req);
        if (req.method === 'OPTIONS') {
            if (req.headers?.origin && !cors['Access-Control-Allow-Origin']) {
                sendJson(res, 403, { error: 'Origin not allowed' });
            } else {
                res.writeHead(204, cors);
                res.end();
            }
            return true;
        }

        if (pathname === '/api/band-oauth/config' && req.method === 'GET') {
            sendJson(res, 200, {
                configured: config.configured,
                loginUrl: config.configured ? `${config.publicBaseUrl}/api/band-oauth/start` : null,
                targetBandNo: config.targetBandNo,
                targetBandUrl: config.targetBandUrl
            }, cors);
            return true;
        }

        if (pathname === '/api/band-oauth/start' && req.method === 'GET') {
            if (!config.configured) {
                sendJson(res, 503, { error: 'BAND OAuth is not configured' });
                return true;
            }
            const returnUrl = isAllowedReturnUrl(url.searchParams.get('return_url'), config);
            if (!returnUrl) {
                sendJson(res, 400, { error: 'Invalid return URL' });
                return true;
            }
            const authorizeUrl = new URL(BAND_AUTHORIZE_URL);
            authorizeUrl.searchParams.set('response_type', 'code');
            authorizeUrl.searchParams.set('client_id', config.clientId);
            authorizeUrl.searchParams.set('redirect_uri', config.callbackUrl);
            redirect(res, authorizeUrl.toString(), {
                'Set-Cookie': stateCookie(makeState(returnUrl), config.stateTtlSec)
            });
            return true;
        }

        if (pathname === '/api/band-oauth/callback' && req.method === 'GET') {
            let state;
            try {
                if (!config.configured) throw new Error('not configured');
                const stateToken = parseCookies(req)[STATE_COOKIE];
                state = verifyToken(stateToken, config.sessionSecret, STATE_TYPE, now());
                const returnUrl = isAllowedReturnUrl(state.returnUrl, config);
                if (!returnUrl) throw new Error('invalid return URL');
                const providerError = url.searchParams.get('error');
                if (providerError) {
                    redirect(res, addFragment(returnUrl, 'band_oauth_error', 'access_denied'), {
                        'Set-Cookie': clearStateCookie()
                    });
                    return true;
                }
                const code = String(url.searchParams.get('code') || '').trim();
                if (!code || code.length > 2048) throw new Error('authorization code missing');

                const accessToken = await exchangeCode(code);
                const [profile, membership] = await Promise.all([
                    fetchProfile(accessToken),
                    checkMembership(accessToken)
                ]);
                const session = makeSession(profile, membership);
                redirect(res, addFragment(returnUrl, 'band_auth', session), {
                    'Set-Cookie': clearStateCookie()
                });
                return true;
            } catch (error) {
                logger.error?.('[band-oauth] callback failed:', error?.message || 'unknown error');
                const fallback = isAllowedReturnUrl(state?.returnUrl, config) || config.returnUrl;
                if (/^https:\/\//i.test(fallback)) {
                    redirect(res, addFragment(fallback, 'band_oauth_error', 'login_failed'), {
                        'Set-Cookie': clearStateCookie()
                    });
                } else {
                    sendJson(res, 400, { error: 'BAND login failed' }, {
                        'Set-Cookie': clearStateCookie()
                    });
                }
                return true;
            }
        }

        if (pathname === '/api/band-oauth/session' && req.method === 'POST') {
            if (!config.configured) {
                sendJson(res, 503, { authenticated: false, error: 'BAND OAuth is not configured' }, cors);
                return true;
            }
            if (req.headers?.origin && !cors['Access-Control-Allow-Origin']) {
                sendJson(res, 403, { error: 'Origin not allowed' });
                return true;
            }
            try {
                const body = await readSmallJson(req);
                const session = verifyToken(body.token, config.sessionSecret, SESSION_TYPE, now());
                sendJson(res, 200, {
                    authenticated: true,
                    expiresAt: new Date(session.exp * 1000).toISOString(),
                    user: {
                        id: session.sub,
                        name: session.name,
                        profileImageUrl: session.avatar,
                        isTargetMember: session.isTargetMember
                    },
                    targetBandNo: config.targetBandNo,
                    targetBandUrl: config.targetBandUrl
                }, cors);
            } catch {
                sendJson(res, 401, { authenticated: false, error: 'BAND login expired' }, cors);
            }
            return true;
        }

        return false;
    }

    return { config, handle, makeState, makeSession };
}

module.exports = {
    BAND_AUTHORIZE_URL,
    BAND_TOKEN_URL,
    BAND_PROFILE_URL,
    BAND_LIST_URL,
    STATE_COOKIE,
    STATE_TYPE,
    SESSION_TYPE,
    createBandOAuth,
    loadConfig,
    publicSubject,
    signToken,
    verifyToken
};
