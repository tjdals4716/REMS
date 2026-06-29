const API_BASE_URL = (window.APP_CONFIG && window.APP_CONFIG.BACKEND_BASE);

// 공통 fetch 응답 처리
async function handleResponse(res) {
    // 인증 만료/실패 → 로그인 페이지로
    if (res.status === 401 || res.status === 403) {
        redirectToLogin('세션이 만료되었습니다. 다시 로그인해주세요.');
        throw new Error('인증이 만료되었습니다');
    }
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        // JWT/인증 관련 오류가 500 등으로 와도 로그인 페이지로 유도
        if (/jwt|token|expired|signature|malformed|unauthor|forbidden|authentication/i.test(text)) {
            redirectToLogin('세션이 만료되었습니다. 다시 로그인해주세요.');
            throw new Error('인증이 만료되었습니다');
        }
        throw new Error(text || (res.status + ' ' + res.statusText));
    }
    if (res.status === 204) return null;
    return res.json();
}

// ★ login.js / oauth-redirect.html 이 토큰을 저장하는 키와 동일하게 맞춤
const TOKEN_KEY = 'accessToken';

// 저장된 JWT 토큰
function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }

// JWT payload 디코드 (base64url) — 서버 호출 없이 토큰 내용을 읽음
function decodeJwt(token) {
    try {
        const part = token.split('.')[1];
        if (!part) return null;
        let b64 = part.replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) b64 += '=';
        const json = decodeURIComponent(
            atob(b64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
        );
        return JSON.parse(json);
    } catch { return null; }
}

// 현재 로그인된 사용자 uid
// 1) JWT 토큰의 subject 에서 추출  2) 저장된 currentUser 객체에서 추출
function getUid() {
    const t = getToken();
    if (t) {
        const p = decodeJwt(t);
        // 백엔드 JwtTokenProvider가 uid를 subject(sub)에 넣음. 다르면 후보 조정.
        if (p && (p.sub || p.uid || p.username)) return p.sub || p.uid || p.username;
    }
    // oauth-redirect.html 이 저장한 사용자 객체(UserDTO)에서 uid 추출
    try {
        const cu = JSON.parse(localStorage.getItem('currentUser') || 'null');
        if (cu && cu.uid) return cu.uid;
    } catch (_) {}
    return '';
}

// 토큰 존재 + 만료 여부 검사
function isTokenValid() {
    const t = getToken();
    if (!t) return false;
    const p = decodeJwt(t);
    if (!p) return false;
    if (p.exp && Date.now() >= p.exp * 1000) return false; // 만료됨
    return true;
}

// 인증 헤더 (JWT를 Authorization 헤더로 전송)
function authHeaders(withJson) {
    const h = {};
    if (withJson) h['Content-Type'] = 'application/json';
    const t = getToken();
    if (t) h['Authorization'] = 'Bearer ' + t;
    return h;
}

// 로그인 페이지로 이동 (토큰 없음/만료 시)
let _authRedirecting = false;
function redirectToLogin(msg) {
    if (_authRedirecting) return;   // 같은 페이지 안에서 중복 알림 방지
    _authRedirecting = true;
    alert(msg || '토큰이 만료되었거나 존재하지 않습니다. 다시 로그인해주세요.');
    logout();                       // accessToken 제거 → login.js가 되튕기지 않음 (루프 방지)
    location.href = 'login.html';
}

// 토큰이 유효하지 않으면 로그인 페이지로 보냄. 유효하면 true 반환
function requireAuthOrRedirect() {
    if (!isTokenValid()) { redirectToLogin(); return false; }
    return true;
}

// 로그인(아이디/비번) — 소셜 로그인을 쓰면 사용 안 함. 콘솔 테스트용으로만 유지.
async function login(uid, password) {
    const res = await fetch(`${API_BASE_URL}/user/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, password })
    });
    if (!res.ok) throw new Error('로그인 실패 (' + res.status + ')');
    const jwt = await res.json(); // JWTDTO: { token, user ... }
    if (!jwt.token) throw new Error('토큰을 받지 못했습니다 (JWTDTO 필드명 확인)');
    localStorage.setItem(TOKEN_KEY, jwt.token);
    if (jwt.user) localStorage.setItem('currentUser', JSON.stringify(jwt.user));
    return jwt;
}

// 로그아웃 확인 — "로그아웃을 진행하시겠습니까?" 후 진행
function confirmLogout() {
    if (!confirm('로그아웃을 진행하시겠습니까?')) return;
    logout();
    location.href = 'login.html';
}

// 로그아웃: 저장된 인증 정보 전부 제거 (login.js가 토큰 존재만 보고 되돌리는 루프 방지)
function logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('auth');
}

// ★ 메인 페이지 진입 즉시 토큰 확인 — 없거나 만료면 안내 후 login.html로 이동
requireAuthOrRedirect();

// 백엔드 API 호출 모음 (모든 요청에 uid + JWT 포함)
const Api = {
    // 건물 (/building)
    getBuildings: () =>
        fetch(`${API_BASE_URL}/building/all/${getUid()}`, { headers: authHeaders() }).then(handleResponse),
    getBuilding: (id) =>
        fetch(`${API_BASE_URL}/building/id/${getUid()}/${id}`, { headers: authHeaders() }).then(handleResponse),
    createBuilding: (dto, mediaFiles) => {
        const fd = new FormData();
        fd.append('uid', getUid());                       // @RequestPart("uid") String
        fd.append('buildingData', JSON.stringify(dto));   // @RequestPart("buildingData") String
        (mediaFiles || []).forEach(f => fd.append('mediaData', f));  // @RequestPart("mediaData") List<MultipartFile> (여러 장, 선택)
        // FormData 전송 시 Content-Type은 브라우저가 boundary와 함께 자동 설정 → authHeaders()만 사용
        return fetch(`${API_BASE_URL}/building`, { method: 'POST', headers: authHeaders(), body: fd }).then(handleResponse);
    },
    updateBuilding: (dto, mediaFiles) => {
        const fd = new FormData();
        fd.append('uid', getUid());
        fd.append('buildingData', JSON.stringify(dto));   // dto.mediaURLs = 유지할 기존 이미지 목록, dto.id 포함
        (mediaFiles || []).forEach(f => fd.append('mediaData', f));  // 새로 추가 업로드할 파일들
        return fetch(`${API_BASE_URL}/building`, { method: 'PUT', headers: authHeaders(), body: fd }).then(handleResponse);
    },
    deleteBuilding: (id) =>
        fetch(`${API_BASE_URL}/building/delete/${getUid()}/${id}`, { method: 'DELETE', headers: authHeaders() }).then(handleResponse),
    searchBuildings: (keyword) =>
        fetch(`${API_BASE_URL}/building/search/${getUid()}?keyword=${encodeURIComponent(keyword)}`, { headers: authHeaders() }).then(handleResponse),

    // 호실 (/unit)
    createUnit: (buildingId, dto) =>
        fetch(`${API_BASE_URL}/unit/${getUid()}/building/${buildingId}`, { method: 'POST', headers: authHeaders(true), body: JSON.stringify(dto) }).then(handleResponse),
    updateUnit: (id, dto) =>
        fetch(`${API_BASE_URL}/unit/${getUid()}/${id}`, { method: 'PUT', headers: authHeaders(true), body: JSON.stringify(dto) }).then(handleResponse),
    deleteUnit: (id) =>
        fetch(`${API_BASE_URL}/unit/delete/${getUid()}/${id}`, { method: 'DELETE', headers: authHeaders() }).then(handleResponse),

    // 사용자 (/user)
    // 공개 프로필 카드 조회 — 매물 등록자 등 "다른 사용자"의 이름/프로필을 가져옴
    getUserProfile: (uid) =>
        fetch(`${API_BASE_URL}/user/profile/${encodeURIComponent(uid)}`, { headers: authHeaders() }).then(handleResponse),
    // 회원 수정 (프로필 사진 변경) — userData(JSON 문자열) + 선택적 mediaData(파일) 멀티파트 전송
    updateUser: (userDTO, file) => {
        const fd = new FormData();
        fd.append('userData', JSON.stringify(userDTO));   // @RequestPart("userData") String
        if (file) fd.append('mediaData', file);           // @RequestPart(value="mediaData", required=false)
        return fetch(`${API_BASE_URL}/user`, { method: 'PUT', headers: authHeaders(), body: fd }).then(handleResponse);
    },

    // 장소 검색 (/api/search/place) — 네이버 지역검색 프록시. 지도 중심(lat/lng)을 주면 가까운 순으로 정렬됨
    searchPlace: (query, lat, lng) => {
        let qs = `query=${encodeURIComponent(query)}`;
        if (lat != null && lng != null) qs += `&lat=${lat}&lng=${lng}`;
        return fetch(`${API_BASE_URL}/api/search/place?${qs}`, { headers: authHeaders() }).then(handleResponse);
    },
};

// 전역 상태 (서버에서 불러온 건물 목록 캐시)
let state = { buildings: [] };

// =====================================================
// 사용자 프로필 헬퍼 (설정 화면 · 매물 등록자 표시 공용)
// =====================================================
// 로그인 시 저장된 사용자 객체(UserDTO) 읽기/쓰기 — name, profileURL, provider 등 포함
function getCurrentUser() {
    try { return JSON.parse(localStorage.getItem('currentUser') || 'null'); } catch (_) { return null; }
}
function setCurrentUser(u) {
    try { localStorage.setItem('currentUser', JSON.stringify(u)); } catch (_) {}
}

// HTML/속성 이스케이프 (이름에 <, ", & 등이 들어가도 마크업이 깨지지 않게)
function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// [B] edit by smsong - 라인 스타일 SVG 아이콘 (하단 네비와 동일한 stroke 라인 톤)
// 기본 이모지(✏️🔒📷✕✓👤 등) 대신 사용. currentColor 상속 → 텍스트 색을 그대로 따름.
const ICON_PATHS = {
    edit:    '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>',
    lock:    '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    camera:  '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l2-3h8l2 3h3a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="3.5"/>',
    check:   '<polyline points="20 6 9 17 4 12"/>',
    close:   '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    plus:    '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    user:    '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    back:    '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
    pin:     '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    building:'<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="22" x2="9" y2="18"/><line x1="15" y1="22" x2="15" y2="18"/><line x1="8" y1="6" x2="10" y2="6"/><line x1="14" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="14" y1="14" x2="16" y2="14"/>',
    map:     '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>',
    agency:  '<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/><path d="M3 9h18"/>',
    phone:   '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7A2 2 0 0 1 22 16.9z"/>',
    // 건물 유형 아이콘 (단독&다중 / 다세대 / 오피스텔 / 상가)
    house:      '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    multiplex:  '<path d="M3 21V9l5-4 5 4v12"/><path d="M13 21V11l4-3 4 3v10"/><path d="M6 13h1.5M6 16.5h1.5M9.5 13h1.5M9.5 16.5h1.5"/>',
    officetel:  '<rect x="6" y="3" width="12" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>',
    commercial: '<path d="M4 9l1.2-4h13.6L20 9"/><path d="M5 9v11h14V9"/><path d="M3.5 9h17"/><path d="M9.5 20v-5h5v5"/>'
};
// icon(name, size, extraStyle) → inline SVG 문자열
function icon(name, size, extraStyle) {
    const sz = size || 16;
    const sw = sz <= 18 ? 2 : 1.8;
    return `<svg class="ic ic-${name}" width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" `
        + `stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" `
        + `style="vertical-align:middle;flex-shrink:0;${extraStyle || ''}" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
}
// 건물 유형 → 라인 아이콘 (기본 이모지 대체)
const TYPE_ICON_NAME = { house: 'house', multiplex: 'multiplex', officetel: 'officetel', commercial: 'commercial' };
function typeIcon(type, size, color) {
    return `<span style="display:inline-flex;align-items:center;color:${color || '#1a56db'};">`
        + icon(TYPE_ICON_NAME[type] || 'building', size || 22) + `</span>`;
}
// [E] edit by smsong

// 소셜 로그인 제공자 → 표시 정보(라벨/색상)
function providerInfo(p) {
    switch (String(p || '').toLowerCase()) {
        case 'kakao':  return { label: '카카오', color: '#191600', bg: '#FEE500', border: '' };
        case 'naver':  return { label: '네이버', color: '#ffffff', bg: '#03C75A', border: '' };
        case 'google': return { label: '구글',  color: '#374151', bg: '#ffffff', border: '#e5e7eb' };
        default:        return { label: '이메일', color: '#374151', bg: '#f3f4f6', border: '' };
    }
}
function providerBadge(p) {
    const i = providerInfo(p);
    return `<span class="provider-badge" style="background:${i.bg};color:${i.color};${i.border ? `border:1px solid ${i.border};` : ''}">${i.label}</span>`;
}
function providerLoginText(p) {
    return `${providerInfo(p).label} 계정으로 로그인됨`;
}

// 아바타(프로필 원형) — 이미지가 있으면 사진, 없거나 로드 실패하면 이름 첫 글자
function avatarHTML(profile, sizePx) {
    const url = profile && profile.profileURL ? profile.profileURL : '';
    const name = (profile && (profile.name || profile.nickname)) || '';
    // [B] edit by smsong - 이름이 없으면 기본 이모지(👤) 대신 라인 SVG 유저 아이콘 사용
    const initial = name ? escapeHtml(name.trim().charAt(0)) : icon('user', Math.round((sizePx || 40) * 0.5));
    // [E] edit by smsong
    const sz = sizePx || 40;
    return `<div class="avatar" style="width:${sz}px;height:${sz}px;font-size:${Math.round(sz * 0.42)}px;">
        <span class="avatar-initial">${initial}</span>
        ${url ? `<img src="${escapeHtml(url)}" alt="" onerror="this.remove()">` : ''}
    </div>`;
}

// 매물 등록자 프로필 캐시 (uid -> {name, profileURL, provider, agency...})
const _ownerCache = {};

// [B] edit by smsong - 소유자 식별자 추출/비교 견고화
// 백엔드가 등록자 식별자를 어떤 필드명(ownerUid/uid/ownerId/writerUid/owner/user_id)으로,
// 또 uid(문자열) 혹은 id(숫자) 중 무엇으로 내려도 "내 매물"을 올바르게 판별하도록 함.
function ownerIdOf(obj) {
    if (!obj) return '';
    const v = obj.ownerUid ?? obj.uid ?? obj.userUid ?? obj.ownerId ?? obj.writerUid ?? obj.owner ?? obj.user_id ?? obj.userId;
    return v == null ? '' : String(v);
}
function myIds() {
    const me = getCurrentUser() || {};
    return [getUid(), me.uid, me.id, me.userId, me.name]
        .filter(v => v != null && v !== '')
        .map(String);
}
// 현재 로그인 사용자가 이 오브젝트(건물/호실)의 작성자인지 확인
function isMine(obj) {
    const owner = ownerIdOf(obj);
    if (!owner) return false;
    return myIds().includes(owner);
}
// [E] edit by smsong

async function fetchOwnerProfile(obj) {
    // [B] edit by smsong - uid 문자열 또는 건물/호실 객체 모두 허용
    const uid = (obj && typeof obj === 'object') ? ownerIdOf(obj) : (obj || '');
    // [E] edit by smsong
    if (!uid) return null;
    if (_ownerCache[uid]) return _ownerCache[uid];
    const me = getCurrentUser();
    if (me && myIds().includes(String(uid))) { _ownerCache[uid] = me; return me; }   // 본인이면 로컬 정보 사용
    try {
        const p = await Api.getUserProfile(uid);
        _ownerCache[uid] = p || { uid };
        return _ownerCache[uid];
    } catch (_) {
        return { uid };   // 실패 시 uid 만으로 표시
    }
}

// 서버에서 전체 건물(+호실)을 불러와 state에 저장
async function loadData(isInitial) {
    try {
        const buildings = await Api.getBuildings();
        // 백엔드 id(Long) -> 문자열로 정규화 (기존 '=== id' 비교 로직 그대로 동작)
        (buildings || []).forEach(b => {
            b.id = String(b.id);
            b.units = (b.units || []).map(u => ({ ...u, id: String(u.id) }));
        });
        state.buildings = buildings || [];
    } catch (e) {
        state.buildings = [];
        if (_authRedirecting) return state;   // 이미 로그인 페이지로 이동 중
        if (isInitial) {
            // 메인 진입 시 데이터 로드 실패(서버가 토큰 거부/500/연결 실패) → 로그인으로
            redirectToLogin('세션이 만료되었거나 서버에 연결할 수 없습니다. 다시 로그인해주세요.');
        } else if (typeof showToast === 'function') {
            showToast('서버 연결 실패: ' + e.message);
        }
    }
    return state;
}

// =====================================================
// MAP
// =====================================================
let map; // 네이버는 geocoder 객체를 따로 선언할 필요가 없습니다.
let markers = [];
let overlays = [];
let pickerMode = false;
let pickerLatlng = null;
let currentBuilding = null;
let activeFilter = 'all';
let activeTab = 'map';

const STATUS_COLOR = { empty: '#dc2626', occupied: '#0d9451', expiring: '#d97706' };
const STATUS_LABEL = { empty: '공실', occupied: '임차', expiring: '만기임박' };
const TYPE_EMOJI = { house: '🏠', multiplex: '🏘️', officetel: '🏢', commercial: '🏪' };
const TYPE_LABEL = { house: '단독&다중', multiplex: '다세대', officetel: '오피스텔', commercial: '상가' };

async function initMap() {
    if (!requireAuthOrRedirect()) return;
    const container = document.getElementById('map');

    // Fallback center: Seoul (네이버 좌표계)
    const center = new naver.maps.LatLng(37.5665, 126.9780);

    // 네이버 지도 생성 (줌 레벨 14가 카카오의 7 정도와 비슷합니다)
    map = new naver.maps.Map(container, {
        center: center,
        zoom: 14,
        zoomControl: false // 커스텀 버튼을 쓰므로 기본 컨트롤은 숨김
    });

    naver.maps.Event.addListener(map, 'click', function(e) {
        if (pickerMode) {
            pickerLatlng = e.coord; // 네이버는 e.coord에 좌표가 담깁니다.
            return;
        }
        // 시트가 펼쳐져 있으면 peek로 내리고, 아니면(어느 탭이든) 상/하단 메뉴 토글(몰입 모드)
        if (Sheet.isOpen()) { Sheet.dismiss(); return; }
        toggleImmersive();
    });

    await loadData(true);
    renderMarkers();
    updateStats();
    showBuildingList();
    showSheet('');

    // Zoom controls (네이버는 숫자가 클수록 확대됩니다. 카카오와 반대)
    document.getElementById('zoom-in-btn').onclick = () => map.setZoom(map.getZoom() + 1);
    document.getElementById('zoom-out-btn').onclick = () => map.setZoom(map.getZoom() - 1);
    document.getElementById('my-location-btn').onclick = gotoMyLocation;
    document.getElementById('add-btn-float').onclick = toggleMapPicker;
    document.getElementById('map-picker-confirm').onclick = confirmPickerLocation;

    // 현재 위치 추적 시작(파란 점). iOS가 아니면 나침반도 바로 연결
    startGeolocationTracking();
    if (!(typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function')) {
        ensureOrientationPermission();
    }
}

function gotoMyLocation() {
    ensureOrientationPermission();           // iOS: 사용자 제스처에서 나침반 권한 요청
    if (!navigator.geolocation) { showToast('위치 권한이 필요합니다'); return; }
    navigator.geolocation.getCurrentPosition(pos => {
        const latlng = new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
        updateGeoMarker(latlng, pos.coords.heading);
        map.setCenter(latlng);
        map.setZoom(16); // 내 위치는 확대해서 보여줌
    }, () => showToast('위치 권한이 필요합니다'), { enableHighAccuracy: true });
    if (geoWatchId == null) startGeolocationTracking();
}

// =====================================================
// 현재 위치 + 방향(나침반) — 네이버 지도앱 스타일
// =====================================================
let geoMarker = null;
let geoWatchId = null;
let geoHeading = 0;
let _oriAsked = false;

// 지도 로드시 현재 위치 추적 시작 → 파란 점 + 방향 부채꼴 표시
function startGeolocationTracking() {
    if (!navigator.geolocation || !map) return;
    if (geoWatchId != null) return;
    geoWatchId = navigator.geolocation.watchPosition(pos => {
        const latlng = new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
        updateGeoMarker(latlng, pos.coords.heading);
    }, () => {}, { enableHighAccuracy: true, maximumAge: 1000, timeout: 12000 });
}

function geoMarkerContent() {
    return '' +
        '<div class="geo-loc-marker">' +
        '  <div class="geo-loc-beam" id="geo-loc-beam"></div>' +
        '  <div class="geo-loc-pulse"></div>' +
        '  <div class="geo-loc-dot"></div>' +
        '</div>';
}

function updateGeoMarker(latlng, gpsHeading) {
    if (!map) return;
    if (!geoMarker) {
        geoMarker = new naver.maps.Marker({
            position: latlng,
            map: map,
            zIndex: 1000,
            clickable: false,
            icon: {
                content: geoMarkerContent(),
                size: new naver.maps.Size(44, 44),
                anchor: new naver.maps.Point(22, 22)
            }
        });
    } else {
        geoMarker.setPosition(latlng);
    }
    // GPS 이동방향이 있으면 그것도 반영(걷는 중)
    if (typeof gpsHeading === 'number' && !isNaN(gpsHeading)) {
        geoHeading = gpsHeading;
        applyGeoHeading();
    }
}

function applyGeoHeading() {
    const beam = document.getElementById('geo-loc-beam');
    if (beam) beam.style.transform = 'rotate(' + geoHeading + 'deg)';
}

// 기기 방향(나침반) 핸들러 — iOS의 webkitCompassHeading 우선, 그 외엔 alpha 변환
function _onDeviceOrientation(e) {
    let hd = null;
    if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) {
        hd = e.webkitCompassHeading;                       // iOS: 이미 북=0, 시계방향
    } else if (e.alpha != null && !isNaN(e.alpha)) {
        hd = (360 - e.alpha) % 360;                        // Android 등: 북 기준으로 변환
    }
    if (hd != null) { geoHeading = hd; applyGeoHeading(); }
}

function _attachOrientation() {
    window.addEventListener('deviceorientationabsolute', _onDeviceOrientation, true);
    window.addEventListener('deviceorientation', _onDeviceOrientation, true);
}

// iOS 13+ 는 사용자 제스처에서 권한 요청 필요
function ensureOrientationPermission() {
    if (_oriAsked) return;
    _oriAsked = true;
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(state => { if (state === 'granted') _attachOrientation(); })
            .catch(() => {});
    } else {
        _attachOrientation();
    }
}

function renderMarkers() {
    overlays.forEach(o => o.setMap(null));
    overlays = [];

    state.buildings.forEach(b => {
        if (!matchesFilter(b)) return;

        const unitStats = getUnitStats(b);
        const dominant = unitStats.empty > 0 ? 'empty' : (unitStats.expiring > 0 ? 'expiring' : 'occupied');
        const color = STATUS_COLOR[dominant];

        const content = `
      <div onclick="selectBuilding('${b.id}')" style="
        position:relative; cursor:pointer;
        background:white; border:2px solid ${color};
        border-radius:9px; padding:3px 7px;
        box-shadow:0 2px 7px rgba(0,0,0,0.16);
        font-family:-apple-system,sans-serif;
        min-width:52px; text-align:center;
        transform:translateX(-50%) translateY(-100%);
        margin-bottom:7px;
      ">
        <div style="font-size:10.5px;font-weight:700;color:#111;line-height:1.2;">${b.name}</div>
        <div style="font-size:9px;color:${color};font-weight:600;margin-top:1px;">
          공실 ${unitStats.empty} · 임차 ${unitStats.occupied}
        </div>
        <div style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);
          width:0;height:0;border-left:6px solid transparent;
          border-right:6px solid transparent;border-top:6px solid ${color};">
        </div>
      </div>
    `;

        // 네이버는 Marker 객체의 icon: { content } 속성으로 HTML 커스텀 마커를 지원합니다.
        const overlay = new naver.maps.Marker({
            position: new naver.maps.LatLng(b.lat, b.lng),
            map: map,
            icon: {
                content: content,
                size: new naver.maps.Size(52, 34),
                anchor: new naver.maps.Point(0, 0) // CSS transform으로 중심을 맞췄으므로 여기선 0,0 처리
            }
        });
        overlays.push(overlay);
    });
}

function matchesFilter(b) {
    if (activeFilter === 'all') return true;
    if (['house', 'multiplex', 'officetel', 'commercial'].includes(activeFilter)) {
        return b.type === activeFilter;
    }
    const s = getUnitStats(b);
    if (activeFilter === 'empty') return s.empty > 0;
    if (activeFilter === 'occupied') return s.occupied > 0;
    if (activeFilter === 'expiring') return s.expiring > 0;
    return true;
}

function getUnitStats(b) {
    const units = b.units || [];
    return {
        empty: units.filter(u => u.status === 'empty').length,
        occupied: units.filter(u => u.status === 'occupied').length,
        expiring: units.filter(u => u.status === 'expiring').length,
        total: units.length
    };
}

function selectBuilding(id) {
    currentBuilding = state.buildings.find(b => b.id === id);
    if (!currentBuilding) return;

    if (typeof map !== 'undefined' && map) {
        // 카카오 LatLng를 네이버 LatLng로 변경
        map.panTo(new naver.maps.LatLng(currentBuilding.lat, currentBuilding.lng));
    }
    showBuildingDetail(currentBuilding);
    showSheet('center');
}

// =====================================================
// STATS
// =====================================================
function updateStats() {
    // 상단 통계바는 제거됨 — 해당 요소가 있을 때만 갱신
    let totalEmpty = 0, totalOccupied = 0, totalExpiring = 0;
    state.buildings.forEach(b => {
        const s = getUnitStats(b);
        totalEmpty += s.empty;
        totalOccupied += s.occupied;
        totalExpiring += s.expiring;
    });
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('cnt-all', state.buildings.length);
    set('cnt-empty', totalEmpty);
    set('cnt-occupied', totalOccupied);
    set('cnt-expiring', totalExpiring);
}

// =====================================================
// BOTTOM SHEET — 네이버 지도 스타일(손가락을 따라 부드럽게 + 스냅)
//  스냅 지점: full(전체) → half(약 2/3 지점에서 걸림) → closed(완전히 내려감)
// =====================================================
const Sheet = (function () {
    const el = document.getElementById('bottom-sheet');
    const handle = document.getElementById('sheet-handle');
    const header = document.getElementById('sheet-header');

    let mode = 'building';     // 'building' | 'tab'
    let current = 'closed';    // 'full' | 'half' | 'peek' | 'closed'
    let dragging = false;
    let startY = 0, startPx = 0, lastY = 0, lastT = 0, vel = 0;

    const PEEK = 156;          // peek 상태에서 화면에 남겨둘 시트 높이(px) — "위에 살짝만"

    // 시트 높이/화면 높이를 기준으로 각 스냅 지점의 translateY(px)를 계산
    function metrics() {
        const A = (el.parentElement && el.parentElement.clientHeight) || window.innerHeight;
        const H = el.offsetHeight || A * 0.88;
        return {
            full: 0,                                         // 맨 위로 올라온 상태
            half: Math.max(0, Math.round(H - A * 0.45)),     // 중간 지점에서 걸림
            peek: Math.max(0, Math.round(H - PEEK)),         // 아래로 다 내려도 살짝 남김(완전히 안 닫힘)
            closed: Math.round(H + 24)                        // 완전히 숨김(몰입모드/초기 진입 애니메이션용)
        };
    }
    function curTranslate() {
        const m = /translateY\(([-0-9.]+)px\)/.exec(el.style.transform || '');
        return m ? parseFloat(m[1]) : metrics()[current];
    }
    function apply(px, animate) {
        el.style.transition = animate
            ? 'transform 0.42s cubic-bezier(0.32,0.72,0,1)'   // 부드러운 감속(네이버 느낌)
            : 'none';
        el.style.transform = 'translateY(' + px + 'px)';
    }
    function snap(name, animate) {
        current = name;
        apply(metrics()[name], animate !== false);
        el.classList.toggle('sheet-open', name !== 'closed');
    }

    function open(m, target) {
        mode = m;
        el.dataset.mode = m;
        setImmersive(false);                       // 시트가 열리면 상/하단 UI는 보이게
        target = target || 'full';
        if (current === 'closed') {
            apply(metrics().closed, false);        // 아래에서 시작
            void el.offsetHeight;                  // reflow → 진입 애니메이션 보장
            requestAnimationFrame(() => snap(target, true));
        } else {
            snap(target, true);
        }
    }
    // 아래로 다 내려도 완전히 닫지 않고 peek(살짝 남김)으로 — 사용중인 폼이 사라지지 않게
    function collapse() {
        if (current === 'closed') {
            apply(metrics().closed, false);
            void el.offsetHeight;
            requestAnimationFrame(() => snap('peek', true));
        } else {
            snap('peek', true);
        }
        // peek은 '닫힘'이 아니므로 currentBuilding(사용중인 폼 컨텍스트)을 유지한다
    }
    // 화면 밖으로 완전히 숨김(위치설정/몰입모드 전환 등 특수한 경우만)
    function hardClose() {
        snap('closed', true);
        currentBuilding = null;
    }
    function dismiss() { collapse(); }            // 호환용: dismiss=peek로 수렴
    function isOpen() { return current === 'full' || current === 'half'; }  // 펼쳐진 상태만 '열림'
    function isPeek() { return current === 'peek'; }

    // ---------- 드래그(터치/마우스 공용) ----------
    function down(e) {
        dragging = true;
        startY = lastY = (e.touches ? e.touches[0].clientY : e.clientY);
        lastT = Date.now(); vel = 0;
        startPx = curTranslate();
        el.style.transition = 'none';              // 드래그 중엔 손가락을 1:1로 따라오게
        document.body.style.userSelect = 'none';
    }
    function move(e) {
        if (!dragging) return;
        const y = (e.touches ? e.touches[0].clientY : e.clientY);
        const max = metrics().peek;                // 아래로는 peek까지만(완전히 안 닫힘)
        const px = Math.max(0, Math.min(startPx + (y - startY), max));
        el.style.transform = 'translateY(' + px + 'px)';
        const now = Date.now(), dt = now - lastT;
        if (dt > 0) vel = (y - lastY) / dt;        // +면 아래 방향 속도
        lastY = y; lastT = now;
        if (e.cancelable) e.preventDefault();
    }
    function up() {
        if (!dragging) return;
        dragging = false;
        document.body.style.userSelect = '';
        const m = metrics();
        const pos = curTranslate();
        const TH = 0.55;                            // 플릭 속도 임계값(px/ms)
        let target;
        if (vel > TH) {                             // 아래로 빠르게 → 한 단계 내림(최하단은 peek)
            target = current === 'full' ? 'half' : 'peek';
        } else if (vel < -TH) {                     // 위로 빠르게 → 한 단계 올림
            target = current === 'peek' ? 'half' : 'full';
        } else {                                    // 천천히 놓으면 가장 가까운 지점으로 스냅
            const cand = (m.half > 4 && m.half < m.peek - 4)
                ? ['full', 'half', 'peek'] : ['full', 'peek'];
            target = cand.reduce((a, b) =>
                Math.abs(m[b] - pos) < Math.abs(m[a] - pos) ? b : a, cand[0]);
        }
        snap(target, true);
    }

    [handle, header].forEach(t => {
        if (!t) return;
        t.addEventListener('touchstart', down, { passive: true });
        t.addEventListener('mousedown', down);
    });
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('mousemove', move);
    window.addEventListener('touchend', up);
    window.addEventListener('mouseup', up);
    window.addEventListener('resize', () => { if (isOpen()) snap(current, false); });

    return { open, collapse, dismiss, hardClose, snap, isOpen, isPeek };
})();

// 기존 호출부 호환: ''=peek(살짝 남김), 'full'=탭 시트, 그 외('center'/'half'/'peek')=건물 상세
function showSheet(state_) {
    if (!state_) { Sheet.collapse(); return; }   // 완전히 닫지 않고 peek
    if (state_ === 'full') { Sheet.open('tab', 'full'); return; }
    Sheet.open('building', 'full');
}
function closeSheet() {
    // ✕(닫기)도 완전히 닫지 않고 목록을 살짝 남긴 peek 상태로
    markTab('map');
    showBuildingList();
    Sheet.collapse();
    currentBuilding = null;
}

function showBuildingList() {
    document.getElementById('sheet-title').textContent = '내 건물 목록';
    document.getElementById('sheet-subtitle').textContent = `총 ${state.buildings.length}개 건물 관리중`;

    const body = document.getElementById('sheet-body');
    if (state.buildings.length === 0) {
        body.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">${icon('building',56,'color:#9ca3af;')}</div>
      <div class="empty-state-title">등록된 건물이 없습니다</div>
      <div class="empty-state-sub">+ 버튼을 눌러 첫 번째 건물을 추가해보세요</div>
    </div>`;
        return;
    }

    body.innerHTML = state.buildings.map(b => {
        const s = getUnitStats(b);
        const pct = s.total > 0 ? Math.round((s.occupied / s.total) * 100) : 0;
        const emoji = typeIcon(b.type, 26); // [B/E] edit by smsong - 유형 라인 아이콘(기본 이모지 대체)
        // 실제 오브젝트에 첨부된 첫 번째 이미지를 썸네일로 사용 (없거나 로드 실패 시 타입 이모지)
        const firstImg = (b.mediaURLs && b.mediaURLs.length) ? b.mediaURLs[0] : '';
        const thumb = firstImg
            ? `<div class="building-thumb has-img"><img src="${firstImg}" alt="" loading="lazy" onerror="this.remove();this.parentElement.classList.remove('has-img')"><span class="building-thumb-emoji">${emoji}</span></div>`
            : `<div class="building-thumb"><span class="building-thumb-emoji">${emoji}</span></div>`;
        return `<div class="building-list-item" onclick="selectBuilding('${b.id}')">
      ${thumb}
      <div style="flex:1;min-width:0;">
        <div class="building-list-name">${b.name}</div>
        <div class="building-list-addr">${b.address}</div>
        <div style="margin-top:4px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          ${isMine(b)
            ? '<span style="font-size:10.5px;color:#1a56db;background:#e8f0fe;font-weight:700;padding:1px 7px;border-radius:10px;">내 매물</span>'
            : (ownerIdOf(b) ? `<span style="display:inline-flex;align-items:center;gap:3px;font-size:10.5px;color:#6b7280;background:#f3f4f6;font-weight:600;padding:1px 7px;border-radius:10px;">${icon('lock',11)} ${ownerNameSpan(b)}</span>` : '')}
          ${s.empty > 0 ? `<span style="font-size:11px;color:#dc2626;font-weight:600;">공실 ${s.empty}</span>` : ''}
          ${s.expiring > 0 ? `<span style="font-size:11px;color:#d97706;font-weight:600;">만기 ${s.expiring}</span>` : ''}
        </div>
      </div>
      <div class="building-occupancy">
        <div class="occupancy-pct">${pct}%</div>
        <div class="occupancy-label">점유율</div>
        <div class="occupancy-bar"><div class="occupancy-fill" style="width:${pct}%"></div></div>
      </div>
    </div>`;
    }).join('');
    hydrateOwnerNames(body); // [B/E] edit by smsong - 목록 잠금 배지의 등록자 이름 채우기
}

// 현재 로그인 사용자가 이 오브젝트(건물/호실)의 작성자인지 확인 → 위쪽 isMine()으로 통합됨

// [B] edit by smsong - 잠금 라벨의 등록자 표시를 uid가 아닌 name 으로. 이름은 비동기로 채움.
function ownerNameSpan(obj, fallback) {
    const oid = ownerIdOf(obj);
    return `<span class="owner-name-async" data-owner-uid="${escapeHtml(oid)}">${escapeHtml(fallback || '다른 사용자')}</span>`;
}
async function hydrateOwnerNames(root) {
    const scope = root || document;
    const spans = scope.querySelectorAll('.owner-name-async[data-owner-uid]:not([data-filled])');
    for (const el of spans) {
        const oid = el.dataset.ownerUid;
        el.dataset.filled = '1';
        if (!oid) continue;
        try {
            const p = await fetchOwnerProfile(oid);
            el.textContent = (p && (p.name || p.nickname)) || '다른 사용자';
        } catch (_) {}
    }
}
// [E] edit by smsong

function showBuildingDetail(b) {
    const s = getUnitStats(b);
    const totalRent = b.units.filter(u => u.status === 'occupied').reduce((sum, u) => sum + (u.rent || 0), 0);
    const totalDeposit = b.units.filter(u => u.status !== 'empty').reduce((sum, u) => sum + (u.deposit || 0), 0);

    document.getElementById('sheet-title').textContent = b.name;
    document.getElementById('sheet-subtitle').textContent = (b.address || '') + (b.detailAddress ? ' ' + b.detailAddress : '');

    const body = document.getElementById('sheet-body');
    body.innerHTML = `
    ${renderGallery(b)}
    <!-- 매물 등록자(커뮤니티 스타일) — 프로필 + 이름 -->
    <div class="owner-card" id="ownercard-${b.id}">
      ${avatarHTML(null, 40)}
      <div style="min-width:0;flex:1;">
        <div class="owner-card-label">매물 등록자</div>
        <div class="owner-card-name">불러오는 중…</div>
      </div>
    </div>
    <!-- [B] edit by smsong - 공인중개사사무소 정보 (등록자 프로필에서 비동기로 채움) -->
    <div id="agencycard-${b.id}"></div>
    <!-- [E] edit by smsong -->
    <div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      ${isMine(b) ? `
      <button onclick="openEditBuilding('${b.id}')" style="display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;font-size:13px;font-weight:600;color:#374151;cursor:pointer;">${icon('edit',15)} 건물 수정</button>
      <button onclick="openAddUnit('${b.id}')" style="display:inline-flex;align-items:center;gap:4px;padding:7px 14px;border-radius:8px;border:none;background:#1a56db;font-size:13px;font-weight:600;color:#fff;cursor:pointer;">${icon('plus',15)} 호실 추가</button>
      ` : `
      <div style="display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border-radius:8px;background:#f3f4f6;color:#6b7280;font-size:12.5px;font-weight:600;">${icon('lock',14)} ${ownerNameSpan(b)}님의 매물 · 조회 전용</div>
      `}
      <button onclick="switchTab('list')" style="display:inline-flex;align-items:center;gap:4px;padding:7px 14px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;font-size:13px;font-weight:600;color:#6b7280;cursor:pointer;">${icon('back',15)} 목록</button>
    </div>

    <!-- 주소 + 상세주소 (바로 옆에) -->
    <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:12px;padding:10px 12px;background:#f9fafb;border-radius:10px;">
      <span style="font-size:12px;font-weight:700;color:#6b7280;flex-shrink:0;">주소</span>
      <span style="font-size:14px;font-weight:600;color:#111827;">${b.address || '-'}</span>
      ${b.detailAddress ? `<span style="font-size:13px;color:#6b7280;">${b.detailAddress}</span>` : ''}
    </div>

    <!-- 금액: 보증금 / 월세 / 관리비 -->
    <div class="building-info-grid" style="grid-template-columns:repeat(3,1fr);">
      <div class="info-card">
        <div class="info-card-label">보증금</div>
        <div class="info-card-value">${(b.deposit || 0).toLocaleString()}만원</div>
      </div>
      <div class="info-card">
        <div class="info-card-label">월세</div>
        <div class="info-card-value">${(b.rent || 0).toLocaleString()}만원</div>
      </div>
      <div class="info-card">
        <div class="info-card-label">관리비</div>
        <div class="info-card-value">${(b.manage || 0).toLocaleString()}만원</div>
      </div>
    </div>

    <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:8px;">호실 현황</div>
    <div class="unit-list">
      ${b.units.length === 0 ? '<div style="text-align:center;padding:20px;color:#9ca3af;font-size:14px;">등록된 호실이 없습니다</div>' :
        b.units.map(u => `
          <div class="unit-item ${u.status}" onclick="openUnitDetail('${b.id}','${u.id}')">
            <div>
              <div class="unit-status-badge">${STATUS_LABEL[u.status]}</div>
            </div>
            <div style="flex:1;min-width:0;">
              <div class="unit-name">${u.name} <span style="font-weight:400;color:#9ca3af;font-size:12px;">${u.floor}층</span></div>
              <div class="unit-detail">${u.area}㎡ · ${u.tenant || '공실'}</div>
            </div>
            <div class="unit-rent">
              ${u.status !== 'empty' ? `
                <div class="unit-rent-main">${u.rent > 0 ? u.rent.toLocaleString()+'만원' : '전세'}</div>
                <div class="unit-rent-sub">보 ${u.deposit.toLocaleString()}만</div>
              ` : '<div class="unit-rent-main" style="color:#dc2626;">공실</div>'}
            </div>
          </div>
        `).join('')
    }
    </div>
  `;
    hydrateOwnerCard(b);
    hydrateOwnerNames(body); // [B/E] edit by smsong - 조회전용 잠금 라벨 등록자 이름 채우기
}

// 매물 등록자 카드 채우기 — 등록자 프로필을 비동기로 불러와 이름/사진/제공자 표시
async function hydrateOwnerCard(b) {
    const el = document.getElementById('ownercard-' + b.id);
    if (!el) return;
    // [B] edit by smsong - 등록자 식별을 객체 기반으로, 표시 이름은 name 우선
    const p = await fetchOwnerProfile(b);
    const name = (p && (p.name || p.nickname)) || '알 수 없음';
    // [E] edit by smsong
    const mine = isMine(b);
    el.innerHTML = `
      ${avatarHTML(p, 40)}
      <div style="min-width:0;flex:1;">
        <div class="owner-card-label">매물 등록자</div>
        <div class="owner-card-name">${escapeHtml(name)}${mine ? '<span class="owner-you">나</span>' : ''}</div>
      </div>
      ${p && p.provider ? providerBadge(p.provider) : ''}
    `;
    // [B] edit by smsong - 공인중개사사무소 정보 카드 렌더
    const agencyEl = document.getElementById('agencycard-' + b.id);
    if (agencyEl) agencyEl.innerHTML = agencyCardHTML(p);
    // [E] edit by smsong
}

// [B] edit by smsong - 공인중개사사무소(이름/전화/주소) 표시 카드. 정보가 하나도 없으면 렌더 안 함.
function agencyCardHTML(p) {
    if (!p) return '';
    const name = p.agencyName, phone = p.agencyPhone, addr = p.agencyAddress;
    if (!name && !phone && !addr) return '';
    const row = (ic, val, isTel) => val ? `
      <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#374151;">
        <span style="color:#1a56db;display:inline-flex;">${icon(ic, 15)}</span>
        ${isTel ? `<a href="tel:${escapeHtml(String(val).replace(/[^0-9+]/g,''))}" style="color:#1a56db;text-decoration:none;font-weight:600;">${escapeHtml(val)}</a>`
                : `<span>${escapeHtml(val)}</span>`}
      </div>` : '';
    return `
      <div style="margin-bottom:12px;padding:12px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;">
        <div style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:#6b7280;margin-bottom:8px;">
          ${icon('agency',14)} 공인중개사사무소
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${name ? `<div style="font-size:14px;font-weight:700;color:#111827;">${escapeHtml(name)}</div>` : ''}
          ${row('phone', phone, true)}
          ${row('pin', addr, false)}
        </div>
      </div>`;
}
// [E] edit by smsong

// =====================================================
// MODALS — Building
// =====================================================
function startAddBuilding() {
    // Enter picker mode
    pickerMode = true;
    pickerLatlng = map.getCenter();
    document.getElementById('map-picker-bar').classList.add('show');
    document.getElementById('map-picker-crosshair').classList.add('show');
    document.getElementById('map-picker-confirm').classList.add('show');
    document.getElementById('map-picker-search').classList.add('show');
    document.getElementById('picker-search-input').value = '';
    document.getElementById('picker-search-results').classList.remove('show');
    const addBtn = document.getElementById('add-btn-float');
    addBtn.classList.add('picking');      // + → × (취소 아이콘)
    addBtn.title = '위치 설정 취소';
    document.getElementById('app').classList.add('picker-active'); // 상단바 숨기고 검색창을 그 자리에
    Sheet.hardClose();                    // 위치 설정 중엔 시트를 완전히 내려 지도를 비움
    document.getElementById('sheet-body').innerHTML = `<div class="empty-state"><div class="empty-state-icon">${icon('pin',56,'color:#9ca3af;')}</div><div class="empty-state-title">지도를 이동하여 위치 설정</div><div class="empty-state-sub">건물 위치를 지도 위에서 직접 설정하세요</div></div>`;
}

// + 버튼 토글: 활성 상태면 취소, 아니면 위치 설정 시작
function toggleMapPicker() {
    if (pickerMode) cancelMapPicker();
    else startAddBuilding();
}

// 위치 설정(피커) 취소 → 상단 안내바/확인 버튼 숨기고 + 버튼 원래대로
function cancelMapPicker() {
    pickerMode = false;
    document.getElementById('map-picker-bar').classList.remove('show');
    document.getElementById('map-picker-crosshair').classList.remove('show');
    document.getElementById('map-picker-confirm').classList.remove('show');
    document.getElementById('map-picker-search').classList.remove('show');
    document.getElementById('picker-search-results').classList.remove('show');
    const addBtn = document.getElementById('add-btn-float');
    addBtn.classList.remove('picking');
    addBtn.title = '건물 추가';
    document.getElementById('app').classList.remove('picker-active'); // 상단바 복원
    showBuildingList();
    Sheet.collapse();                     // 취소하면 목록을 다시 살짝 띄움(peek)
}

function confirmPickerLocation() {
    const center = map.getCenter();
    pickerLatlng = center;
    pickerMode = false;
    document.getElementById('map-picker-bar').classList.remove('show');
    document.getElementById('map-picker-crosshair').classList.remove('show');
    document.getElementById('map-picker-confirm').classList.remove('show');
    document.getElementById('map-picker-search').classList.remove('show');
    document.getElementById('picker-search-results').classList.remove('show');
    const addBtn = document.getElementById('add-btn-float');
    addBtn.classList.remove('picking');
    addBtn.title = '건물 추가';
    document.getElementById('app').classList.remove('picker-active'); // 상단바 복원

    // 네이버 Reverse Geocoding 호출
    naver.maps.Service.reverseGeocode({
        coords: center,
    }, function(status, response) {
        let addr = '';
        if (status === naver.maps.Service.Status.OK) {
            const items = response.v2.address;
            // 지번 주소 또는 도로명 주소를 가져옵니다.
            addr = items.roadAddress || items.jibunAddress || '';
        }
        // 좌표를 전달할 때 네이버는 .lat() .lng() 함수를 사용합니다.
        openBuildingForm(null, center.lat(), center.lng(), addr);
    });
}

// ===== 건물 이미지(여러 장) 관리 =====
const MAX_BUILDING_IMAGES = 10;   // 건물당 첨부 가능한 최대 이미지 수
let bfKeepUrls = [];   // 건물 수정 시 "유지할" 기존 이미지 URL 목록
let bfNewFiles = [];   // 새로 추가한 파일(File) 목록

// 건물 상세 이미지 갤러리 — 가로 스와이프 캐러셀 (스크롤 스냅 + 점 인디케이터)
function renderGallery(b) {
    const arr = (b && b.mediaURLs) ? b.mediaURLs : [];
    if (!arr.length) return '';
    const gid = 'gal-' + (b && b.id ? b.id : Math.random().toString(36).slice(2));
    const safeName = (b && b.name ? b.name : '').replace(/"/g, '&quot;');

    const slides = arr.map((u, i) => `
      <div class="gal-slide">
        <img src="${u}" alt="${safeName}"
             ${i === 0 ? `onload="fitGalleryHeight('${gid}', this)"` : ''}
             onclick="openImageViewer('${u}')" onerror="this.parentElement.style.display='none'">
      </div>`).join('');

    // 이미지가 2장 이상일 때만 카운터/점 표시
    const counter = arr.length > 1 ? `<div class="gal-counter" id="${gid}-cnt">1 / ${arr.length}</div>` : '';
    const dots = arr.length > 1
        ? `<div class="gal-dots" id="${gid}-dots">${arr.map((_, i) => `<span class="gal-dot${i === 0 ? ' active' : ''}"></span>`).join('')}</div>`
        : '';

    return `<div class="gallery-wrap">
      <div class="gal-track" id="${gid}" onscroll="onGalleryScroll('${gid}', ${arr.length})">${slides}</div>
      ${counter}
      ${dots}
    </div>`;
}

// 캐러셀 스크롤 위치 → 카운터/점 인디케이터 갱신
function onGalleryScroll(gid, total) {
    const track = document.getElementById(gid);
    if (!track || !track.clientWidth) return;
    const idx = Math.round(track.scrollLeft / track.clientWidth);
    const cnt = document.getElementById(gid + '-cnt');
    if (cnt) cnt.textContent = (idx + 1) + ' / ' + total;
    const dots = document.getElementById(gid + '-dots');
    if (dots) Array.from(dots.children).forEach((d, i) => d.classList.toggle('active', i === idx));
}

// 첫 이미지 비율에 맞춰 캐러셀 높이를 설정 → 첫 장은 딱 맞고 나머지는 그 안에 전체가 보임(contain)
function fitGalleryHeight(gid, img) {
    const track = document.getElementById(gid);
    if (!track || !img || !img.naturalWidth) return;
    const w = track.clientWidth || track.offsetWidth;
    if (!w) return;
    let h = w * img.naturalHeight / img.naturalWidth;
    const maxH = Math.round(window.innerHeight * 0.7);   // 세로 사진이 화면을 다 먹지 않도록 상한
    if (h > maxH) h = maxH;
    track.style.height = Math.round(h) + 'px';
}

// 폼: 유지 중인 기존 이미지 썸네일 (X로 제거)
function renderBfExisting() {
    const box = document.getElementById('bf-existing');
    if (!box) return;
    if (!bfKeepUrls.length) { box.innerHTML = '<div class="bf-empty">기존 사진 없음</div>'; return; }
    box.innerHTML = bfKeepUrls.map((u, i) => `
      <div class="bf-thumb">
        <img src="${u}" onerror="this.parentElement.style.display='none'">
        <button type="button" class="bf-thumb-del" onclick="removeBfImage(${i})">${icon('close',14)}</button>
      </div>`).join('');
}

function removeBfImage(idx) {
    bfKeepUrls.splice(idx, 1);
    renderBfExisting();
    updateBfCount();
}

// 폼: 파일 선택 시 누적 추가 (최대 MAX_BUILDING_IMAGES 장 제한)
function addBfFiles(e) {
    const picked = Array.from((e.target && e.target.files) ? e.target.files : []);
    const room = MAX_BUILDING_IMAGES - (bfKeepUrls.length + bfNewFiles.length);
    if (room <= 0) {
        showToast(`최대 ${MAX_BUILDING_IMAGES}장만 첨부 가능합니다`);
        e.target.value = '';
        return;
    }
    if (picked.length > room) {
        showToast(`최대 ${MAX_BUILDING_IMAGES}장만 첨부 가능합니다 (지금 ${room}장까지 추가)`);
    }
    bfNewFiles = bfNewFiles.concat(picked.slice(0, room));
    e.target.value = '';   // 같은 파일 재선택 가능 + 선택 누적
    renderBfNewPreview();
    updateBfCount();
}

// 폼: 새로 추가한 파일 미리보기 (✕로 제거)
function renderBfNewPreview() {
    const box = document.getElementById('bf-new-preview');
    if (!box) return;
    box.innerHTML = bfNewFiles.map((f, i) => `
      <div class="bf-thumb">
        <img src="${URL.createObjectURL(f)}">
        <button type="button" class="bf-thumb-del" onclick="removeBfNewFile(${i})">${icon('close',14)}</button>
        <span class="bf-thumb-new">NEW</span>
      </div>`).join('');
}

function removeBfNewFile(idx) {
    bfNewFiles.splice(idx, 1);
    renderBfNewPreview();
    updateBfCount();
}

// 현재 첨부 수 라벨 갱신 (기존 유지 + 신규)
function updateBfCount() {
    const el = document.getElementById('bf-count');
    if (el) el.textContent = (bfKeepUrls.length + bfNewFiles.length) + ' / ' + MAX_BUILDING_IMAGES;
}

function openBuildingForm(building, lat, lng, addr) {
    const isEdit = !!building;
    bfKeepUrls = (building && building.mediaURLs) ? building.mediaURLs.slice() : [];
    bfNewFiles = [];
    document.getElementById('modal-title').textContent = isEdit ? '건물 수정' : '건물 추가';

    document.getElementById('modal-body').innerHTML = `
    <div class="form-section-title">기본 정보</div>
    <div class="form-group">
      <label class="form-label">건물명 *</label>
      <input id="f-name" class="form-input" type="text" placeholder="예: 강남 상가빌딩" value="${building ? building.name : ''}">
    </div>
    <div class="form-group">
      <label class="form-label">주소</label>
      <input id="f-addr" class="form-input" type="text" placeholder="주소" value="${building ? (building.address || '') : (addr || '')}">
    </div>
    <div class="form-group">
      <label class="form-label">상세주소</label>
      <input id="f-detail" class="form-input" type="text" placeholder="예: 3층 302호, 동/호수 등" value="${building ? (building.detailAddress || '') : ''}">
    </div>
    <div class="form-group">
      <label class="form-label">건물 유형</label>
      <select id="f-type" class="form-select">
        <option value="house" ${(!building || building.type==='house')?'selected':''}>단독&다중</option>
        <option value="multiplex" ${building && building.type==='multiplex'?'selected':''}>다세대</option>
        <option value="officetel" ${building && building.type==='officetel'?'selected':''}>오피스텔</option>
        <option value="commercial" ${building && building.type==='commercial'?'selected':''}>상가</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">보증금 (만원)</label>
      <input id="f-deposit" class="form-input" type="number" min="0" placeholder="예: 1000" value="${building ? (building.deposit || '') : ''}">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">월세 (만원)</label>
        <input id="f-rent" class="form-input" type="number" min="0" placeholder="예: 50" value="${building ? (building.rent || '') : ''}">
      </div>
      <div class="form-group">
        <label class="form-label">관리비 (만원)</label>
        <input id="f-manage" class="form-input" type="number" min="0" placeholder="예: 5" value="${building ? (building.manage || '') : ''}">
      </div>
    </div>
    ${isEdit ? `
    <div class="form-group">
      <label class="form-label">현재 사진 <span style="font-weight:400;color:#9ca3af;">(${icon('close',11)} 눌러 제거)</span></label>
      <div id="bf-existing" class="bf-thumb-wrap"></div>
    </div>` : ''}
    <div class="form-group">
      <label class="form-label">사진/미디어 <span style="font-weight:400;color:#9ca3af;">(최대 ${MAX_BUILDING_IMAGES}장 · <span id="bf-count">0 / ${MAX_BUILDING_IMAGES}</span>)</span></label>
      <input id="f-media" class="form-input" type="file" accept="image/*,video/*" multiple onchange="addBfFiles(event)">
      <div id="bf-new-preview" class="bf-thumb-wrap"></div>
    </div>
  `;

    document.getElementById('modal-footer').innerHTML = `
    ${isEdit ? `<button class="btn-danger" onclick="deleteBuilding('${building.id}')">삭제</button>` : ''}
    <button class="btn-secondary" onclick="closeModal()">취소</button>
    <button class="btn-primary" onclick="saveBuilding('${isEdit ? building.id : ''}', ${lat||building?.lat}, ${lng||building?.lng})">저장</button>
  `;

    renderBfExisting();   // 수정 시 기존 이미지 썸네일 표시
    updateBfCount();
    showModal();
}

function openEditBuilding(id) {
    const b = state.buildings.find(b => b.id === id);
    if (!isMine(b)) { showToast('본인이 등록한 매물만 수정할 수 있습니다'); return; }
    if (b) openBuildingForm(b, b.lat, b.lng, b.address);
}

async function saveBuilding(id, lat, lng) {
    const name = document.getElementById('f-name').value.trim();
    if (!name) { showToast('건물명을 입력하세요'); return; }

    const dto = {
        name,
        address: document.getElementById('f-addr').value.trim(),
        detailAddress: document.getElementById('f-detail').value.trim(),
        type: document.getElementById('f-type').value,
        deposit: parseInt(document.getElementById('f-deposit').value) || 0,
        rent: parseInt(document.getElementById('f-rent').value) || 0,
        manage: parseInt(document.getElementById('f-manage').value) || 0,
        lat: parseFloat(lat), lng: parseFloat(lng)
    };

    const mediaFiles = bfNewFiles;            // 새로 추가한 파일들
    dto.mediaURLs = bfKeepUrls;               // 유지할 기존 이미지 목록 (제거된 건 빠져있음)
    if (bfKeepUrls.length + mediaFiles.length > MAX_BUILDING_IMAGES) {
        showToast(`최대 ${MAX_BUILDING_IMAGES}장만 첨부 가능합니다`);
        return;
    }

    try {
        if (id) {
            dto.id = id;
            await Api.updateBuilding(dto, mediaFiles);   // 유지목록 + 새 파일들
        } else {
            await Api.createBuilding(dto, mediaFiles);
        }
        await loadData();
        closeModal();
        renderMarkers();
        updateStats();
        showBuildingList();
        showSheet('center');
        showToast(id ? '건물 정보가 수정되었습니다' : '건물이 추가되었습니다');
    } catch (e) {
        showToast('저장 실패: ' + e.message);
    }
}

async function deleteBuilding(id) {
    const b = state.buildings.find(b => b.id === id);
    if (b && !isMine(b)) { showToast('본인이 등록한 매물만 삭제할 수 있습니다'); return; }
    if (!confirm('건물과 모든 호실 정보가 삭제됩니다. 계속하시겠습니까?')) return;
    try {
        await Api.deleteBuilding(id);
        await loadData();
        closeModal();
        renderMarkers();
        updateStats();
        showBuildingList();
        showSheet('center');
        currentBuilding = null;
        showToast('건물이 삭제되었습니다');
    } catch (e) {
        showToast('삭제 실패: ' + e.message);
    }
}

// =====================================================
// MODALS — Unit
// =====================================================
function openAddUnit(buildingId) {
    const b = state.buildings.find(b => b.id === buildingId);
    if (!isMine(b)) { showToast('본인이 등록한 매물에만 호실을 추가할 수 있습니다'); return; }
    openUnitForm(buildingId, null);
}

function openUnitDetail(buildingId, unitId) {
    const b = state.buildings.find(b => b.id === buildingId);
    const u = b.units.find(u => u.id === unitId);
    if (!u) return;

    document.getElementById('modal-title').textContent = `${u.name} 상세`;
    document.getElementById('modal-body').innerHTML = `
    <div class="unit-tabs">
      <div class="unit-tab active" onclick="switchUnitTab('info')">기본정보</div>
      <div class="unit-tab" onclick="switchUnitTab('contract')">계약정보</div>
      <div class="unit-tab" onclick="switchUnitTab('memo')">메모</div>
    </div>
    <div id="unit-tab-content"></div>
  `;

    window._unitTabData = { buildingId, unitId, u };
    renderUnitTab('info');

    document.getElementById('modal-footer').innerHTML = `
    <button class="btn-secondary" onclick="closeModal()">닫기</button>
    ${isMine(u)
        ? `<button class="btn-primary" onclick="openUnitForm('${buildingId}','${unitId}')">수정</button>`
        : `<span style="display:inline-flex;align-items:center;gap:4px;font-size:12.5px;color:#9ca3af;align-self:center;padding:0 6px;">${icon('lock',13)} ${ownerNameSpan(u)}님이 등록한 호실</span>`}
  `;
    showModal();
    hydrateOwnerNames(document.getElementById('modal')); // [B/E] edit by smsong
}

function switchUnitTab(tab) {
    document.querySelectorAll('.unit-tab').forEach((t,i) => {
        t.classList.toggle('active', ['info','contract','memo'][i] === tab);
    });
    renderUnitTab(tab);
}

function renderUnitTab(tab) {
    const { u } = window._unitTabData;
    const c = document.getElementById('unit-tab-content');

    const statusColors = { empty: '#dc2626', occupied: '#0d9451', expiring: '#d97706' };
    const statusBg = { empty: '#fee2e2', occupied: '#d1fae5', expiring: '#fef3c7' };

    if (tab === 'info') {
        c.innerHTML = `
      <div style="display:inline-block;padding:5px 12px;border-radius:20px;background:${statusBg[u.status]};color:${statusColors[u.status]};font-size:13px;font-weight:700;margin-bottom:12px;">
        ${STATUS_LABEL[u.status]}
      </div>
      <div class="building-info-grid">
        <div class="info-card"><div class="info-card-label">호실</div><div class="info-card-value">${u.name}</div></div>
        <div class="info-card"><div class="info-card-label">층</div><div class="info-card-value">${u.floor}층</div></div>
        <div class="info-card"><div class="info-card-label">면적</div><div class="info-card-value">${u.area}㎡</div></div>
        <div class="info-card"><div class="info-card-label">유형</div><div class="info-card-value">${{commercial:'상가',residential:'주거',office:'사무실'}[u.type]||u.type}</div></div>
      </div>
      <div class="info-card" style="margin-top:8px;">
        <div class="info-card-label">임차인</div>
        <div class="info-card-value">${u.tenant || '—'}</div>
      </div>
    `;
    } else if (tab === 'contract') {
        c.innerHTML = `
      <div class="building-info-grid">
        <div class="info-card"><div class="info-card-label">보증금</div><div class="info-card-value">${u.deposit ? u.deposit.toLocaleString()+'만원' : '—'}</div></div>
        <div class="info-card"><div class="info-card-label">월세</div><div class="info-card-value">${u.rent ? u.rent.toLocaleString()+'만원' : (u.deposit ? '전세' : '—')}</div></div>
        <div class="info-card"><div class="info-card-label">관리비</div><div class="info-card-value">${u.manage ? u.manage+'만원' : '—'}</div></div>
        <div class="info-card"><div class="info-card-label">계약기간</div>
          <div class="info-card-value" style="font-size:12px;">${u.contractStart ? u.contractStart+'~'+u.contractEnd : '—'}</div>
        </div>
      </div>
      ${u.contractEnd ? (() => {
            const daysLeft = Math.ceil((new Date(u.contractEnd) - new Date()) / 86400000);
            const color = daysLeft < 90 ? '#dc2626' : daysLeft < 180 ? '#d97706' : '#0d9451';
            return `<div style="padding:10px 12px;background:#f9fafb;border-radius:10px;font-size:13px;margin-top:8px;color:${color};font-weight:600;">
          만기까지 D-${daysLeft > 0 ? daysLeft : '만기'}
        </div>`;
        })() : ''}
    `;
    } else {
        c.innerHTML = `<div style="padding:12px;background:#f9fafb;border-radius:10px;font-size:14px;color:#374151;min-height:80px;">
      ${u.memo || '<span style="color:#9ca3af;">메모가 없습니다</span>'}
    </div>`;
    }
}

function openUnitForm(buildingId, unitId) {
    const b = state.buildings.find(b => b.id === buildingId);
    const u = unitId ? b.units.find(u => u.id === unitId) : null;
    if (unitId && !isMine(u)) { showToast('본인이 등록한 호실만 수정할 수 있습니다'); return; }
    if (!unitId && !isMine(b)) { showToast('본인이 등록한 매물에만 호실을 추가할 수 있습니다'); return; }
    const isEdit = !!u;

    document.getElementById('modal-title').textContent = isEdit ? '호실 수정' : '호실 추가';
    document.getElementById('modal-body').innerHTML = `
    <div class="form-section-title">기본 정보</div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">호실명 *</label>
        <input id="uf-name" class="form-input" placeholder="예: 101호" value="${u ? u.name : ''}">
      </div>
      <div class="form-group">
        <label class="form-label">층</label>
        <input id="uf-floor" class="form-input" type="number" min="1" placeholder="층" value="${u ? u.floor : ''}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">면적 (㎡)</label>
        <input id="uf-area" class="form-input" type="number" placeholder="㎡" value="${u ? u.area : ''}">
      </div>
      <div class="form-group">
        <label class="form-label">유형</label>
        <select id="uf-type" class="form-select">
          <option value="commercial" ${u && u.type==='commercial'?'selected':''}>상가</option>
          <option value="residential" ${u && u.type==='residential'?'selected':''}>주거용</option>
          <option value="office" ${u && u.type==='office'?'selected':''}>사무용</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">현황</label>
      <div class="status-selector">
        <div class="status-option ${!u || u.status==='empty'?'selected':''}" data-status="empty" onclick="selectStatus('empty')">공실</div>
        <div class="status-option ${u && u.status==='occupied'?'selected':''}" data-status="occupied" onclick="selectStatus('occupied')">임차중</div>
        <div class="status-option ${u && u.status==='expiring'?'selected':''}" data-status="expiring" onclick="selectStatus('expiring')">만기임박</div>
      </div>
    </div>

    <div class="form-section-title">임차인 정보</div>
    <div class="form-group">
      <label class="form-label">임차인명</label>
      <input id="uf-tenant" class="form-input" placeholder="임차인 이름" value="${u ? u.tenant : ''}">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">보증금 (만원)</label>
        <input id="uf-deposit" class="form-input" type="number" placeholder="0" value="${u ? u.deposit : ''}">
      </div>
      <div class="form-group">
        <label class="form-label">월세 (만원)</label>
        <input id="uf-rent" class="form-input" type="number" placeholder="0 = 전세" value="${u ? u.rent : ''}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">관리비 (만원)</label>
      <input id="uf-manage" class="form-input" type="number" placeholder="0" value="${u ? u.manage : ''}">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">계약 시작</label>
        <input id="uf-start" class="form-input" type="date" value="${u ? u.contractStart : ''}">
      </div>
      <div class="form-group">
        <label class="form-label">계약 만료</label>
        <input id="uf-end" class="form-input" type="date" value="${u ? u.contractEnd : ''}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">메모</label>
      <textarea id="uf-memo" class="form-textarea">${u ? u.memo : ''}</textarea>
    </div>
  `;

    document.getElementById('modal-footer').innerHTML = `
    ${isEdit ? `<button class="btn-danger" onclick="deleteUnit('${buildingId}','${unitId}')">삭제</button>` : ''}
    <button class="btn-secondary" onclick="closeModal()">취소</button>
    <button class="btn-primary" onclick="saveUnit('${buildingId}','${isEdit ? unitId : ''}')">저장</button>
  `;

    showModal();
}

function selectStatus(status) {
    document.querySelectorAll('.status-option').forEach(el => {
        el.classList.toggle('selected', el.dataset.status === status);
    });
}

async function saveUnit(buildingId, unitId) {
    const name = document.getElementById('uf-name').value.trim();
    if (!name) { showToast('호실명을 입력하세요'); return; }

    const status = document.querySelector('.status-option.selected')?.dataset.status || 'empty';
    const dto = {
        name, status,
        floor: parseInt(document.getElementById('uf-floor').value) || 1,
        area: parseFloat(document.getElementById('uf-area').value) || 0,
        type: document.getElementById('uf-type').value,
        tenant: document.getElementById('uf-tenant').value.trim(),
        deposit: parseInt(document.getElementById('uf-deposit').value) || 0,
        rent: parseInt(document.getElementById('uf-rent').value) || 0,
        manage: parseInt(document.getElementById('uf-manage').value) || 0,
        contractStart: document.getElementById('uf-start').value,
        contractEnd: document.getElementById('uf-end').value,
        memo: document.getElementById('uf-memo').value.trim()
    };

    try {
        if (unitId) {
            await Api.updateUnit(unitId, dto);
        } else {
            await Api.createUnit(buildingId, dto);
        }
        await loadData();
        const b = state.buildings.find(x => x.id === buildingId);
        closeModal();
        renderMarkers();
        updateStats();
        if (b) { showBuildingDetail(b); showSheet('center'); currentBuilding = b; }
        showToast(unitId ? '호실 정보가 수정되었습니다' : '호실이 추가되었습니다');
    } catch (e) {
        showToast('저장 실패: ' + e.message);
    }
}

async function deleteUnit(buildingId, unitId) {
    const b = state.buildings.find(b => b.id === buildingId);
    const u = b && b.units.find(u => u.id === unitId);
    if (u && !isMine(u)) { showToast('본인이 등록한 호실만 삭제할 수 있습니다'); return; }
    if (!confirm('이 호실을 삭제하시겠습니까?')) return;
    try {
        await Api.deleteUnit(unitId);
        await loadData();
        const b = state.buildings.find(x => x.id === buildingId);
        closeModal();
        renderMarkers();
        updateStats();
        if (b) { showBuildingDetail(b); currentBuilding = b; }
        showToast('호실이 삭제되었습니다');
    } catch (e) {
        showToast('삭제 실패: ' + e.message);
    }
}

// =====================================================
// STATS TAB
// =====================================================
function showStatsView() {
    const body = document.getElementById('sheet-body');
    let totalRent = 0, totalDeposit = 0;
    let allEmpty = 0, allOccupied = 0, allExpiring = 0;
    let totalUnits = 0;

    state.buildings.forEach(b => {
        const s = getUnitStats(b);
        allEmpty += s.empty; allOccupied += s.occupied; allExpiring += s.expiring;
        totalUnits += s.total;
        b.units.forEach(u => {
            if (u.status !== 'empty') {
                totalRent += u.rent || 0;
                totalDeposit += u.deposit || 0;
            }
        });
    });

    const pct = totalUnits > 0 ? Math.round((allOccupied / totalUnits) * 100) : 0;

    document.getElementById('sheet-title').textContent = '수익 현황';
    document.getElementById('sheet-subtitle').textContent = '전체 건물 통합 집계';

    body.innerHTML = `
    <div class="building-info-grid">
      <div class="info-card"><div class="info-card-label">월 수입 합계</div><div class="info-card-value" style="color:#1a56db;">${totalRent.toLocaleString()}만원</div></div>
      <div class="info-card"><div class="info-card-label">보증금 합계</div><div class="info-card-value">${(totalDeposit/10000).toFixed(1)}억원</div></div>
      <div class="info-card"><div class="info-card-label">점유율</div><div class="info-card-value" style="color:#0d9451;">${pct}%</div></div>
      <div class="info-card"><div class="info-card-label">공실</div><div class="info-card-value" style="color:#dc2626;">${allEmpty}호</div></div>
    </div>

    <div style="margin:8px 0;padding:14px;background:#f9fafb;border-radius:12px;">
      <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:10px;">점유율 현황</div>
      <div style="display:flex;gap:4px;height:20px;border-radius:10px;overflow:hidden;">
        <div style="flex:${allOccupied};background:#0d9451;" title="임차중"></div>
        <div style="flex:${allExpiring};background:#d97706;" title="만기임박"></div>
        <div style="flex:${allEmpty};background:#dc2626;" title="공실"></div>
      </div>
      <div style="display:flex;gap:14px;margin-top:8px;">
        <div style="font-size:12px;color:#0d9451;font-weight:600;">● 임차 ${allOccupied}호</div>
        <div style="font-size:12px;color:#d97706;font-weight:600;">● 만기임박 ${allExpiring}호</div>
        <div style="font-size:12px;color:#dc2626;font-weight:600;">● 공실 ${allEmpty}호</div>
      </div>
    </div>

    <div style="font-size:13px;font-weight:700;color:#374151;margin:12px 0 8px;">건물별 현황</div>
    ${state.buildings.map(b => {
        const s = getUnitStats(b);
        const r = b.units.filter(u=>u.status==='occupied').reduce((acc,u)=>acc+(u.rent||0),0);
        return `<div style="padding:12px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:8px;cursor:pointer;" onclick="selectBuilding('${b.id}');switchTab('map')">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="display:flex;align-items:center;gap:6px;font-size:14px;font-weight:700;color:#111;">${typeIcon(b.type,16)} ${b.name}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:2px;">${s.total}호 중 임차 ${s.occupied}호 · 공실 ${s.empty}호</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:15px;font-weight:700;color:#1a56db;">${r.toLocaleString()}만</div>
            <div style="font-size:11px;color:#9ca3af;">월 수입</div>
          </div>
        </div>
      </div>`;
    }).join('')}
  `;
}

function showSettingsView() {
    document.getElementById('sheet-title').textContent = '내 프로필';
    document.getElementById('sheet-subtitle').textContent = '로그인한 계정 정보';

    const me = getCurrentUser() || {};
    const name = me.name || me.nickname || '이름 없음';

    document.getElementById('sheet-body').innerHTML = `
    <div class="profile-page">
      <!-- 위에 작게: 현재 어떤 소셜 로그인으로 로그인했는지 -->
      <div class="profile-provider">
        ${providerBadge(me.provider)}
        <span>${providerLoginText(me.provider)}</span>
      </div>

      <!-- 로그인된 사용자 프로필(사진) -->
      ${avatarHTML(me, 96)}

      <!-- name 값 -->
      <div class="profile-name">${escapeHtml(name)}</div>
      ${me.email ? `<div class="profile-sub">${escapeHtml(me.email)}</div>` : ''}

      <!-- [B] edit by smsong - 내 공인중개사사무소 정보 요약 -->
      ${agencyCardHTML(me) || `<div style="margin:6px 0 2px;font-size:12.5px;color:#9ca3af;">공인중개사사무소 정보가 없습니다. ‘내 정보 수정’에서 등록하세요.</div>`}
      <!-- [E] edit by smsong -->

      <input type="file" id="profile-file" accept="image/*" style="display:none" onchange="changeProfilePhoto(event)">
      <div class="profile-actions">
        <button class="btn-secondary" onclick="document.getElementById('profile-file').click()" style="display:inline-flex;align-items:center;justify-content:center;gap:6px;">${icon('camera',16)} 프로필 사진 변경</button>
        <button class="btn-secondary" onclick="openProfileEdit()" style="display:inline-flex;align-items:center;justify-content:center;gap:6px;">${icon('edit',16)} 내 정보 수정</button>
        <button class="profile-logout" onclick="confirmLogout()">로그아웃</button>
      </div>
    </div>
  `;
}

// [B] edit by smsong - 회원정보 수정 모달 (이름/닉네임/이메일/휴대폰/주소 + 공인중개사사무소 이름/전화/주소)
function openProfileEdit() {
    const me = getCurrentUser() || {};
    const field = (id, label, val, ph, type) => `
      <div style="margin-bottom:12px;">
        <label class="form-label" for="${id}">${label}</label>
        <input id="${id}" type="${type || 'text'}" class="form-input" value="${escapeHtml(val || '')}" placeholder="${escapeHtml(ph || '')}" autocomplete="off">
      </div>`;
    document.getElementById('modal-title').textContent = '내 정보 수정';
    document.getElementById('modal-body').innerHTML = `
      ${field('pe-name', '이름', me.name, '실명')}
      ${field('pe-nickname', '닉네임', me.nickname, '닉네임')}
      ${field('pe-email', '이메일', me.email, 'example@email.com', 'email')}
      ${field('pe-phone', '휴대폰', me.phone, '010-0000-0000', 'tel')}
      ${field('pe-address', '주소', me.address, '주소')}
      <div style="display:flex;align-items:center;gap:6px;margin:18px 0 10px;font-size:13px;font-weight:800;color:#1a56db;">
        ${icon('agency',16)} 공인중개사사무소 정보
      </div>
      ${field('pe-agency-name', '사무소 이름', me.agencyName, '○○공인중개사사무소')}
      ${field('pe-agency-phone', '사무소 전화번호', me.agencyPhone, '02-000-0000', 'tel')}
      ${field('pe-agency-address', '사무소 주소', me.agencyAddress, '사무소 주소')}
    `;
    document.getElementById('modal-footer').innerHTML = `
      <button class="btn-secondary" onclick="closeModal()">취소</button>
      <button class="btn-primary" onclick="saveProfileEdit()">저장</button>
    `;
    showModal();
}

async function saveProfileEdit() {
    const me = getCurrentUser();
    if (!me || !me.uid) { showToast('로그인 정보를 찾을 수 없습니다'); return; }
    const v = id => (document.getElementById(id)?.value || '').trim();
    // uid/id 는 식별/권한용으로 반드시 함께 전송. 나머지는 입력값으로 부분 업데이트.
    const dto = {
        uid: me.uid,
        id: me.id,
        name: v('pe-name') || me.name,
        nickname: v('pe-nickname'),
        email: v('pe-email'),
        phone: v('pe-phone'),
        address: v('pe-address'),
        agencyName: v('pe-agency-name'),
        agencyPhone: v('pe-agency-phone'),
        agencyAddress: v('pe-agency-address')
    };
    try {
        showToast('저장 중…');
        const updated = await Api.updateUser(dto);   // 파일 없이 JSON 부분 업데이트
        const merged = Object.assign({}, me, updated || dto);
        setCurrentUser(merged);
        _ownerCache[me.uid] = merged;
        closeModal();
        showSettingsView();
        showToast('내 정보가 저장되었습니다');
    } catch (err) {
        showToast('저장 실패: ' + err.message);
    }
}
// [E] edit by smsong

// 프로필 사진 변경 — 선택한 이미지를 회원수정 API(PUT /user)로 업로드하고 화면/캐시 갱신
async function changeProfilePhoto(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';                 // 같은 파일 재선택 가능하게 초기화
    if (!file) return;
    const me = getCurrentUser();
    if (!me || !me.uid) { showToast('로그인 정보를 찾을 수 없습니다'); return; }
    try {
        showToast('프로필 사진 업로드 중…');
        // name 은 함께 보내 기존 값 유지(부분 업데이트). 사진 외 다른 정보는 서버가 그대로 둠.
        const updated = await Api.updateUser({ uid: me.uid, id: me.id, name: me.name }, file);
        const merged = Object.assign({}, me, updated || {});   // 응답(UserDTO)의 새 profileURL 반영
        setCurrentUser(merged);
        _ownerCache[me.uid] = merged;     // 매물 등록자 카드 캐시도 갱신
        showSettingsView();
        showToast('프로필 사진이 변경되었습니다');
    } catch (err) {
        showToast('변경 실패: ' + err.message);
    }
}

function saveKakaoKey() {
    const key = document.getElementById('kakao-key').value.trim();
    if (key) { localStorage.setItem('kakao_key', key); location.reload(); }
}

function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hakbangnote_backup_' + new Date().toISOString().slice(0,10) + '.json';
    a.click();
}

function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
        try {
            const imported = JSON.parse(ev.target.result);
            if (!imported.buildings) { showToast('올바른 파일 형식이 아닙니다'); return; }
            // 각 건물을 호실 포함하여 서버에 생성 (BuildingDTO가 중첩 units 지원)
            for (const b of imported.buildings) {
                const dto = {
                    name: b.name, address: b.address, detailAddress: b.detailAddress, type: b.type,
                    lat: b.lat, lng: b.lng, memo: b.memo,
                    units: (b.units || []).map(u => ({
                        floor: u.floor, name: u.name, type: u.type, status: u.status,
                        area: u.area, tenant: u.tenant, deposit: u.deposit, rent: u.rent,
                        manage: u.manage, contractStart: u.contractStart,
                        contractEnd: u.contractEnd, memo: u.memo
                    }))
                };
                await Api.createBuilding(dto);
            }
            await loadData();
            renderMarkers();
            updateStats();
            showBuildingList();
            showToast('데이터를 가져왔습니다');
        } catch (err) { showToast('가져오기 실패: ' + err.message); }
    };
    reader.readAsText(file);
}

async function resetData() {
    if (!confirm('서버의 모든 건물·호실 데이터가 삭제됩니다. 계속하시겠습니까?')) return;
    try {
        for (const b of [...state.buildings]) {
            await Api.deleteBuilding(b.id);
        }
        await loadData();
        renderMarkers();
        updateStats();
        showBuildingList();
        showToast('전체 데이터가 초기화되었습니다');
    } catch (e) {
        showToast('초기화 실패: ' + e.message);
    }
}

// =====================================================
// 네이버 부동산 매물 JSON 가져오기
// =====================================================
function openImportNaver() {
    document.getElementById('modal-title').textContent = '네이버 매물 가져오기';
    document.getElementById('modal-body').innerHTML = `
    <div style="font-size:13px;color:#6b7280;margin-bottom:10px;line-height:1.6;">
      네이버 부동산 매물의 JSON 데이터를 붙여넣으면 건물·호실로 자동 변환됩니다.
      같은 건물명이 이미 있으면 그 건물에 호실로 추가됩니다.
    </div>
    <textarea id="naver-json" class="form-textarea" style="min-height:200px;font-family:monospace;font-size:12px;" placeholder='{ "articleDetail": { ... }, "articleAddition": { ... } }'></textarea>
  `;
    document.getElementById('modal-footer').innerHTML = `
    <button class="btn-secondary" onclick="closeModal()">취소</button>
    <button class="btn-primary" onclick="importNaverJson()">변환하여 추가</button>
  `;
    showModal();
}

// 네이버 매물 JSON → 앱 건물/호실 구조로 변환
function convertNaverArticle(raw) {
    const d = raw.articleDetail || {};
    const add = raw.articleAddition || {};
    const floor = raw.articleFloor || {};
    const space = raw.articleSpace || {};
    const price = raw.articlePrice || {};
    const admin = raw.administrationCostInfo || {};

    // 건물명 / 주소 / 좌표
    const buildingName = d.articleName
        || ((d.aptName || '') + ' ' + (d.buildingName || '')).trim()
        || '이름없는 건물';
    const address = ((d.exposureAddress || add.exposureAddress || '') + ' ' + (d.detailAddress || '')).trim();
    const lat = parseFloat(d.latitude || add.latitude) || 0;
    const lng = parseFloat(d.longitude || add.longitude) || 0;

    // 건물 유형 매핑 (상가류 → commercial, 오피스텔 → officetel, 다세대/빌라 → multiplex, 나머지 → house)
    const typeCode = d.realestateTypeCode || add.realEstateTypeCode || '';
    let btype = 'house';
    if (['SG', 'SMS', 'GM', 'GJCG', 'SUG'].includes(typeCode)) btype = 'commercial';
    else if (['OPST'].includes(typeCode)) btype = 'officetel';
    else if (['DSD', 'VL', 'YR', 'DDDG'].includes(typeCode)) btype = 'multiplex';

    // 층
    const floorInfo = add.floorInfo || ''; // 예: "3/25"
    const unitFloor = parseInt((floorInfo.split('/')[0] || '').replace(/[^0-9]/g, ''))
        || parseInt(floor.correspondingFloorCount) || 1;
    const totalFloors = parseInt(floor.totalFloorCount)
        || parseInt((floorInfo.split('/')[1] || '').replace(/[^0-9]/g, '')) || 1;

    // 면적 (전용 우선)
    const area = space.exclusiveSpace || parseFloat(d.area2) || space.supplySpace || parseFloat(d.area1) || 0;

    // 가격 (만원 단위)
    const deposit = price.warrantPrice || price.dealPrice || 0;
    const rent = price.rentPrice || 0;

    // 관리비 (원 → 만원)
    let manage = 0;
    if (admin.etcFeeDetails && admin.etcFeeDetails.etcFeeAmount) {
        manage = Math.round(admin.etcFeeDetails.etcFeeAmount / 10000);
    }

    // 거래유형
    const tradeType = d.tradeTypeName || add.tradeTypeName || '';

    // 호실명 (네이버 매물엔 호수가 없어 층 기준으로 생성)
    const unitName = unitFloor + '층 매물';

    // 메모 구성
    const memoParts = [];
    if (tradeType) memoParts.push(tradeType);
    if (d.roomCount) memoParts.push(`방${d.roomCount}/욕실${d.bathroomCount || 0}`);
    const dir = add.direction || d.direction;
    if (dir) memoParts.push(dir);
    if (d.articleFeatureDescription) memoParts.push(d.articleFeatureDescription.trim());
    if (d.moveInTypeName) memoParts.push(d.moveInTypeName);
    if (add.cpName) memoParts.push('출처:' + add.cpName);
    const unitMemo = memoParts.join(' | ');

    // 건물 메모 (단지 정보)
    const bmemoParts = [];
    if (d.aptHouseholdCount) bmemoParts.push(`${d.aptHouseholdCount}세대`);
    if (d.aptUseApproveYmd) bmemoParts.push(`${d.aptUseApproveYmd.slice(0, 4)}년 준공`);
    if (d.aptParkingCountPerHousehold) bmemoParts.push(`세대당주차 ${d.aptParkingCountPerHousehold}`);
    const buildingMemo = bmemoParts.join(' · ');

    const unit = {
        id: 'u' + Date.now() + Math.floor(Math.random() * 1000),
        floor: unitFloor,
        name: unitName,
        type: btype,
        status: 'occupied', // 가격 정보를 화면에 보이게 하기 위해 occupied로 (임차인은 비움)
        area: Math.round(area * 100) / 100,
        tenant: '',
        deposit, rent, manage,
        contractStart: '',
        contractEnd: '',
        memo: unitMemo
    };

    return { buildingName, address, lat, lng, btype, totalFloors, buildingMemo, unit };
}

async function importNaverJson() {
    const txt = document.getElementById('naver-json').value.trim();
    if (!txt) { showToast('JSON을 붙여넣으세요'); return; }

    let raw;
    try { raw = JSON.parse(txt); } catch { showToast('JSON 형식이 올바르지 않습니다'); return; }
    if (!raw.articleDetail && !raw.articleAddition) {
        showToast('네이버 매물 데이터가 아닙니다');
        return;
    }

    const c = convertNaverArticle(raw);

    try {
        // 같은 건물명이 있으면 그 건물에 호실 추가, 없으면 새 건물 생성
        const existing = state.buildings.find(x => x.name === c.buildingName);
        const isNew = !existing;
        let buildingId;

        if (!existing) {
            const created = await Api.createBuilding({
                name: c.buildingName, address: c.address, type: c.btype,
                lat: c.lat, lng: c.lng, memo: c.buildingMemo,
                units: []
            });
            buildingId = String(created.id);
        } else {
            buildingId = existing.id;
        }

        await Api.createUnit(buildingId, c.unit);
        await loadData();
        closeModal();
        renderMarkers();
        updateStats();
        showToast(isNew ? `'${c.buildingName}' 건물이 추가되었습니다` : `'${c.buildingName}'에 호실이 추가되었습니다`);

        if (typeof map !== 'undefined' && map) switchTab('map');
        selectBuilding(buildingId);
    } catch (e) {
        showToast('가져오기 실패: ' + e.message);
    }
}

// =====================================================
// UI HELPERS
// =====================================================
function markTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
}

function switchTab(tab) {
    if (pickerMode) cancelMapPicker();   // 다른 탭으로 가면 위치 설정 모드 해제

    if (tab === 'map') {
        markTab('map');
        showBuildingList();              // 지도와 함께 보일 목록을 peek 콘텐츠로
        Sheet.collapse();                // 완전히 닫지 않고 살짝 남김(peek)
        return;
    }

    // 목록/현황/설정 — 지도를 배경에 깔아둔 채 시트(폼)로 띄움 (네이버 지도 스타일)
    markTab(tab);
    if (tab === 'list') showBuildingList();
    else if (tab === 'stats') showStatsView();
    else if (tab === 'settings') showSettingsView();
    Sheet.open('tab', 'full');
}

// ===== 몰입 모드 — 지도 탭에서 지도를 누르면 상/하단 메뉴가 위아래로 사라짐 =====
function setImmersive(on) {
    // 웹(데스크톱) 모드에서는 몰입 모드(상/하단 숨김)를 쓰지 않음 — 패널/지도/헤더 항상 표시
    if (document.documentElement.classList.contains('mode-web')) return;
    const app = document.getElementById('app');
    if (app) app.classList.toggle('chrome-hidden', on);
    if (on) closeFilterPanel();
}
function toggleImmersive() {
    const app = document.getElementById('app');
    setImmersive(!(app && app.classList.contains('chrome-hidden')));
}

// ===== 필터 패널 — 상단 필터 버튼에서 쑥 나오고 다시 누르면 쑥 들어감 =====
function openFilterPanel() {
    const p = document.getElementById('filter-panel');
    const b = document.getElementById('filter-btn');
    if (p) p.classList.add('show');
    if (b) b.classList.add('active');
}
function closeFilterPanel() {
    const p = document.getElementById('filter-panel');
    const b = document.getElementById('filter-btn');
    if (p) p.classList.remove('show');
    if (b) b.classList.remove('active');
}
function toggleFilterPanel() {
    const p = document.getElementById('filter-panel');
    (p && p.classList.contains('show')) ? closeFilterPanel() : openFilterPanel();
}

function showModal() {
    document.getElementById('modal-overlay').classList.add('show');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('show');
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
}

// =====================================================
// SEARCH
// =====================================================
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

// ===== 장소 검색 공용 헬퍼 =====
// 현재 지도 중심 좌표 (장소를 "가까운 순"으로 정렬하는 기준)
function mapCenter() {
    try { if (typeof map !== 'undefined' && map) { const c = map.getCenter(); return { lat: c.lat(), lng: c.lng() }; } } catch (_) {}
    return { lat: null, lng: null };
}
// 입력 디바운스 (검색창 키 입력마다 서버를 때리지 않도록)
function debounce(fn, ms) {
    let t; return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
}
// 카테고리 "음식점>한식" → "음식점 · 한식"
function fmtCategory(c) { return (c || '').replace(/>/g, ' · '); }

// 선택한 장소로 지도 이동.
//  · 지역검색 mapx/mapy(±1e7)는 오차가 있어, 도로명/지번 주소로 재지오코딩한 좌표를 우선 사용
//  · isPicker=true 면 "위치 설정(피커)" 중심을 옮김(건물 위치로 설정), 아니면 일반 패닝
function gotoPlace(p, isPicker) {
    if (!p) return;
    const apply = (lat, lng) => {
        if (typeof naver === 'undefined' || !map) return;
        const ll = new naver.maps.LatLng(lat, lng);
        if (isPicker) {
            map.setCenter(ll); map.setZoom(17); pickerLatlng = ll;
            if (typeof pickerSearchResults !== 'undefined' && pickerSearchResults) pickerSearchResults.classList.remove('show');
        } else {
            map.panTo(ll); map.setZoom(16);
            searchResults.classList.remove('show');
        }
    };
    const addr = (p.roadAddress || p.jibunAddress || '').trim();
    if (addr && typeof naver !== 'undefined') {
        naver.maps.Service.geocode({ query: addr }, function (status, response) {
            if (status === naver.maps.Service.Status.OK && response.v2.addresses.length > 0) {
                const a = response.v2.addresses[0];
                apply(parseFloat(a.y), parseFloat(a.x));
            } else if (p.lat != null && p.lng != null) {
                apply(p.lat, p.lng);                 // 지오코딩 실패 → 지역검색 좌표로 폴백
            } else {
                showToast('위치를 찾을 수 없습니다');
            }
        });
    } else if (p.lat != null && p.lng != null) {
        apply(p.lat, p.lng);
    } else {
        showToast('위치를 찾을 수 없습니다');
    }
}

// 장소 검색 결과를 검색창 드롭다운 HTML로 (places 배열은 onclick 에서 인덱스로 참조 → 따옴표 이스케이프 문제 없음)
function renderPlaceItems(places, onclickFnName) {
    return (places || []).map((p, i) => `
    <div class="search-result-item" onclick="${onclickFnName}(${i})">
      <div>${escapeHtml(p.name)}${p.category ? ` <span class="search-cat">${escapeHtml(fmtCategory(p.category))}</span>` : ''}</div>
      <div class="search-result-sub">${escapeHtml(p.roadAddress || p.jibunAddress || '')}</div>
    </div>`).join('');
}

// ===== 상단 검색창 — 내 건물(로컬) + 장소(가까운 순) =====
let _topbarPlaces = [];
let _topbarSeq = 0;     // 빠른 타이핑 시 늦게 도착한 응답이 최신 결과를 덮어쓰지 않도록
function selectTopbarPlace(i) {
    const p = _topbarPlaces[i];
    if (!p) return;
    searchInput.value = p.name;
    gotoPlace(p, false);
}

const _runTopbarPlaceSearch = debounce((q, seq) => {
    const c = mapCenter();
    Api.searchPlace(q, c.lat, c.lng).then(places => {
        if (seq !== _topbarSeq) return;             // 더 최신 검색이 있으면 무시
        _topbarPlaces = places || [];
        const buildingHtml = searchInput.dataset.buildingHtml || '';
        const placeHtml = renderPlaceItems(_topbarPlaces, 'selectTopbarPlace');
        const combined = buildingHtml + placeHtml;
        searchResults.innerHTML = combined;
        searchResults.classList.toggle('show', !!combined);
    }).catch(() => { /* 장소 검색 실패 시 건물 결과만 유지 */ });
}, 250);

searchInput.addEventListener('input', e => {
    const raw = e.target.value.trim();
    const q = raw.toLowerCase();
    if (!q) { searchResults.classList.remove('show'); searchInput.dataset.buildingHtml = ''; return; }

    // 1) 내 건물(로컬) 즉시 표시
    const localResults = state.buildings.filter(b =>
        b.name.toLowerCase().includes(q) || (b.address || '').toLowerCase().includes(q)
    );
    const buildingHtml = localResults.map(b => `
    <div class="search-result-item" onclick="selectBuilding('${b.id}');searchResults.classList.remove('show');searchInput.value='${(b.name || '').replace(/'/g, '')}'">
      <div>${escapeHtml(b.name)}</div>
      <div class="search-result-sub">${escapeHtml(b.address || '')}</div>
    </div>`).join('');
    searchInput.dataset.buildingHtml = buildingHtml;
    searchResults.innerHTML = buildingHtml;
    searchResults.classList.toggle('show', !!buildingHtml);

    // 2) 장소(상호명) 검색 — 지도 중심 기준 가까운 순 (디바운스)
    if (raw.length >= 1) { _topbarSeq++; _runTopbarPlaceSearch(raw, _topbarSeq); }
});

// 함수 이름과 줌 레벨 로직 네이버로 변경
function gotoNaverResult(lat, lng) {
    map.panTo(new naver.maps.LatLng(lat, lng));
    map.setZoom(16);
}

// 이미지 확대 보기 (라이트박스)
function openImageViewer(url) {
    const v = document.getElementById('image-viewer');
    const img = document.getElementById('image-viewer-img');
    if (!v || !img) return;
    img.src = url;
    v.classList.add('show');
}
function closeImageViewer() {
    const v = document.getElementById('image-viewer');
    if (v) v.classList.remove('show');
}

// =====================================================
// 위치 설정(피커) 모드 — 주소 검색으로 지도 이동
// 지도 중심(크로스헤어)이 곧 설정 위치이므로, 검색 위치로 중심을 옮긴다
// =====================================================
const pickerSearchInput = document.getElementById('picker-search-input');
const pickerSearchResults = document.getElementById('picker-search-results');

// 검색 결과 위치로 지도 중심 이동 → 그 지점이 건물 위치로 설정됨
function gotoPickerResult(lat, lng) {
    const latlng = new naver.maps.LatLng(lat, lng);
    map.setCenter(latlng);
    map.setZoom(17);
    pickerLatlng = latlng;
    pickerSearchResults.classList.remove('show');
}

// 위치 설정(피커) 장소 결과 — 인덱스로 참조 (전역: 인라인 onclick 에서 호출)
let _pickerPlaces = [];
function selectPickerPlace(i) {
    const p = _pickerPlaces[i];
    if (!p) return;
    if (pickerSearchInput) pickerSearchInput.value = p.name;
    gotoPlace(p, true);   // 피커 중심을 그 장소로 이동 → 건물 위치로 설정
}

if (pickerSearchInput) {
    let _pSeq = 0;             // 최신 검색만 반영
    let _placeHtml = '';       // 장소(상호명) 결과 HTML
    let _addrHtml = '';        // 주소(지오코딩) 결과 HTML
    function renderPicker() {
        const combined = _placeHtml + _addrHtml;
        pickerSearchResults.innerHTML = combined;
        pickerSearchResults.classList.toggle('show', !!combined);
    }
    // 장소 검색(가까운 순) — 디바운스로 호출
    const runPickerPlace = debounce((q, seq) => {
        const c = mapCenter();
        Api.searchPlace(q, c.lat, c.lng).then(places => {
            if (seq !== _pSeq) return;
            _pickerPlaces = places || [];
            _placeHtml = renderPlaceItems(_pickerPlaces, 'selectPickerPlace');
            renderPicker();
        }).catch(() => { /* 장소 검색 실패 시 주소 결과만 유지 */ });
    }, 250);

    // 입력 시: 장소(가까운 순) + 주소 후보를 함께 표시
    pickerSearchInput.addEventListener('input', e => {
        const q = e.target.value.trim();
        if (!q || typeof naver === 'undefined') {
            _placeHtml = ''; _addrHtml = ''; _pickerPlaces = [];
            pickerSearchResults.classList.remove('show');
            return;
        }
        _pSeq++; const seq = _pSeq;

        // 1) 주소 후보(지오코딩)
        naver.maps.Service.geocode({ query: q }, function (status, response) {
            if (seq !== _pSeq) return;
            if (status === naver.maps.Service.Status.OK && response.v2.addresses.length > 0) {
                _addrHtml = response.v2.addresses.slice(0, 5).map(p => {
                    const label = (p.roadAddress || p.jibunAddress || '').replace(/'/g, '');
                    return `<div class="search-result-item" onclick="gotoPickerResult('${p.y}','${p.x}');document.getElementById('picker-search-input').value='${label}';">
                        <div>${escapeHtml(p.roadAddress || p.jibunAddress)}</div>
                        <div class="search-result-sub">${escapeHtml(p.jibunAddress || '')}</div>
                    </div>`;
                }).join('');
            } else {
                _addrHtml = '';
            }
            renderPicker();
        });

        // 2) 장소(상호명) — 지도 중심 기준 가까운 순
        runPickerPlace(q, seq);
    });

    // Enter → 장소 결과가 있으면 가장 가까운 장소로, 없으면 주소 첫 결과로 이동
    pickerSearchInput.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const q = pickerSearchInput.value.trim();
        if (!q || typeof naver === 'undefined') return;
        if (_pickerPlaces.length) { selectPickerPlace(0); return; }
        naver.maps.Service.geocode({ query: q }, function (status, response) {
            if (status === naver.maps.Service.Status.OK && response.v2.addresses.length > 0) {
                const p = response.v2.addresses[0];
                gotoPickerResult(p.y, p.x);
                pickerSearchInput.value = p.roadAddress || p.jibunAddress || q;
            } else {
                showToast('결과를 찾을 수 없습니다');
            }
        });
    });
}

document.addEventListener('click', e => {
    if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.classList.remove('show');
    }
});

// =====================================================
// FILTER
// =====================================================
// =====================================================
// FILTER — 상단 필터 버튼 + 떠오르는 필터 패널
// =====================================================
(function initFilter() {
    const btn = document.getElementById('filter-btn');
    const panel = document.getElementById('filter-panel');

    if (btn) btn.addEventListener('click', e => { e.stopPropagation(); toggleFilterPanel(); });

    document.querySelectorAll('#filter-panel .filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('#filter-panel .filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            activeFilter = chip.dataset.filter;
            renderMarkers();
        });
    });

    // 패널 바깥을 누르면 닫힘
    document.addEventListener('click', e => {
        if (panel && panel.classList.contains('show') &&
            !panel.contains(e.target) && !(btn && btn.contains(e.target))) {
            closeFilterPanel();
        }
    });
})();

// =====================================================
// INIT
// =====================================================
// 네이버 지도 키가 없거나 로드 실패 시 보여줄 안내 화면
async function showMapFallback() {
    if (!requireAuthOrRedirect()) return;
    document.getElementById('map').innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;background:#f9fafb;padding:30px;text-align:center;">
      <div style="margin-bottom:16px;color:#9ca3af;">${icon('map',48,'color:#9ca3af;')}</div>
      <div style="font-size:16px;font-weight:700;color:#374151;margin-bottom:8px;">네이버 지도 API 키가 필요합니다</div>
      <div style="font-size:13px;color:#6b7280;margin-bottom:20px;line-height:1.6;">
        1. ncloud.com (네이버 클라우드 플랫폼) 접속<br>
        2. Application 생성 (Maps) → Client ID 복사<br>
        3. config.js 의 NAVER_MAP_CLIENT_ID 값 교체<br>
      </div>
      <button onclick="switchTab('settings')" style="padding:12px 24px;background:#1a56db;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;">API 키 설정하기</button>
    </div>
  `;
    await loadData(true);
    showBuildingList();
    showSheet('');
    updateStats();
}

// PWA: offline support hint
window.addEventListener('online', () => showToast('인터넷에 연결되었습니다'));
window.addEventListener('offline', () => showToast('오프라인 모드 — 데이터는 로컬에 저장됩니다'));
// =====================================================
// 반응형 모드 — 앱(모바일/PWA) vs 웹(데스크톱)
//  · 설치형 PWA(standalone) 또는 좁은 화면  → 앱 모드 (기존 모바일 UI 그대로)
//  · 넓은 데스크톱 브라우저               → 웹 모드 (좌측 패널 + 우측 지도)
//  · <html> 에 mode-web / mode-app 클래스를 토글하고, CSS 가 레이아웃을 분기한다.
// =====================================================
(function initResponsiveMode() {
    const WEB_MIN_WIDTH = 1024;   // 이 폭 이상 + 비-PWA 일 때만 웹 레이아웃

    function isStandalone() {
        return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
            || window.navigator.standalone === true;   // iOS 홈화면 추가 앱
    }
    function isWeb() {
        return !isStandalone() && window.innerWidth >= WEB_MIN_WIDTH;
    }
    function apply() {
        const root = document.documentElement;
        const web = isWeb();
        const changed = root.classList.contains('mode-web') !== web;
        root.classList.toggle('mode-web', web);
        root.classList.toggle('mode-app', !web);
        // 모드가 바뀌면 현재 탭 내용을 다시 그려 레이아웃/썸네일을 새로 반영
        if (changed) {
            try {
                if (typeof activeTab !== 'undefined' && activeTab === 'stats' && typeof showStatsView === 'function') showStatsView();
                else if (typeof activeTab !== 'undefined' && activeTab === 'settings' && typeof showSettingsView === 'function') showSettingsView();
                else if (typeof showBuildingList === 'function') showBuildingList();
            } catch (e) { /* 초기 로드 시점 등은 무시 */ }
        }
    }

    apply();   // main.js 파싱 시점에 1차 적용 (initMap 보다 먼저 클래스 확정)
    let t;
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(apply, 150); });
    if (window.matchMedia) {
        try { window.matchMedia('(display-mode: standalone)').addEventListener('change', apply); } catch (e) {}
    }
})();
