// js/storage.js
// 로그인 세션 관리, 구글/학생 계정별 독립 문서함 및 자동저장·수동저장 스토리지 엔진

import {
  ALL_HEAD_PRESETS,
  DEFAULT_SETTINGS,
  createBlankDocumentItems
} from './hierarchy.js';

const STORAGE_PREFIX = 'outline_note_v2_';
const CURRENT_USER_KEY = `${STORAGE_PREFIX}current_user`;
const LOGGED_IN_SESSION_KEY = `${STORAGE_PREFIX}is_logged_in`;
const USERS_LIST_KEY = `${STORAGE_PREFIX}users_list`;
const FIREBASE_CONFIG_KEY = `${STORAGE_PREFIX}firebase_config`;
const CLASS_REGISTRY_KEY = `${STORAGE_PREFIX}class_registry`;
const TEACHER_EMAILS_KEY = `${STORAGE_PREFIX}teacher_emails`;
const CLASS_SYNC_API_BASE = 'https://team-ant-workout-pace.lijita95.workers.dev/api/outline-note';

const DEFAULT_TEACHER_EMAILS = [
  'benefit9495@gmail.com',
  'lijita95@gmail.com'
];

const DEFAULT_USER = {
  uid: 'local_default_student',
  displayName: '학생',
  email: 'student@school.edu',
  photoURL: '',
  provider: 'local'
};

export class StorageManager {
  constructor(onSyncChange) {
    this.onSyncChange = onSyncChange || (() => {});
    this.isLoggedIn = localStorage.getItem(LOGGED_IN_SESSION_KEY) === 'true';
    this.currentUser = this.loadCurrentUser();
    this.firebaseApp = null;
    this.firebaseAuth = null;
    this.firestoreDb = null;
    this.cloudReady = false;
    this.lastSavedAt = new Date();
    this.state = this.loadUserWorkspace(this.currentUser.uid);
    this.initFirebaseIfConfigured();
  }

  getGuideSeenKey(uid = this.currentUser?.uid || 'default') {
    return `${STORAGE_PREFIX}guide_seen_${uid}`;
  }

  hasSeenOnboardingGuide(uid = this.currentUser?.uid) {
    return localStorage.getItem(this.getGuideSeenKey(uid)) === 'true';
  }

  setOnboardingGuideSeen(uid = this.currentUser?.uid) {
    localStorage.setItem(this.getGuideSeenKey(uid), 'true');
  }

  setLoggedIn(loggedIn) {
    this.isLoggedIn = Boolean(loggedIn);
    localStorage.setItem(LOGGED_IN_SESSION_KEY, this.isLoggedIn ? 'true' : 'false');
  }

  logout() {
    this.setLoggedIn(false);
    this.onSyncChange('logged-out');
  }

  loadCurrentUser() {
    try {
      const saved = localStorage.getItem(CURRENT_USER_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to load user:', e);
    }
    return DEFAULT_USER;
  }

  getSavedUsersList() {
    try {
      const raw = localStorage.getItem(USERS_LIST_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  ensureUserInList(user) {
    const list = this.getSavedUsersList();
    const idx = list.findIndex((u) => u.uid === user.uid);
    if (idx >= 0) {
      list[idx] = user;
    } else {
      list.unshift(user);
    }
    localStorage.setItem(USERS_LIST_KEY, JSON.stringify(list));
  }

  getWorkspaceKey(uid) {
    return `${STORAGE_PREFIX}workspace_${uid}`;
  }

  createInitialWorkspace() {
    const now = new Date().toISOString();
    const folder1Id = 'folder_grade1';
    const blankDocId = 'doc_initial_blank';

    return {
      activeDocId: blankDocId,
      presets: JSON.parse(JSON.stringify(ALL_HEAD_PRESETS)),
      settings: { ...DEFAULT_SETTINGS },
      folders: [
        { id: folder1Id, name: '교과서 목차 정리', parentId: null, createdAt: now, expanded: true }
      ],
      documents: [
        {
          id: blankDocId,
          folderId: folder1Id,
          title: '',
          updatedAt: now,
          items: createBlankDocumentItems()
        }
      ]
    };
  }

  normalizePresets(savedPresets) {
    const full = JSON.parse(JSON.stringify(ALL_HEAD_PRESETS));
    if (!Array.isArray(savedPresets)) return full;
    return full.map((defaultPreset) => {
      const found = savedPresets.find((p) => Number(p.level) === defaultPreset.level);
      return found ? { ...defaultPreset, ...found } : defaultPreset;
    });
  }

  loadUserWorkspace(uid) {
    try {
      const raw = localStorage.getItem(this.getWorkspaceKey(uid));
      if (raw) {
        const parsed = JSON.parse(raw);
        parsed.presets = this.normalizePresets(parsed.presets);
        parsed.settings = { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) };
        parsed.settings.maxHeadLevels = Math.min(
          7,
          Math.max(5, Number(parsed.settings.maxHeadLevels) || 5)
        );
        if (!parsed.documents || parsed.documents.length === 0) {
          const initial = this.createInitialWorkspace();
          parsed.documents = initial.documents;
          parsed.activeDocId = initial.activeDocId;
        }
        return parsed;
      }
    } catch (e) {
      console.warn('Workspace load failed, creating default:', e);
    }
    const fresh = this.createInitialWorkspace();
    this.saveWorkspace(fresh, uid, true);
    return fresh;
  }

  saveWorkspace(stateToSave = this.state, uid = this.currentUser.uid, silent = false) {
    try {
      const activeDoc = stateToSave?.documents?.find((d) => d.id === stateToSave.activeDocId);
      if (activeDoc) {
        activeDoc.updatedAt = new Date().toISOString();
      }
      localStorage.setItem(this.getWorkspaceKey(uid), JSON.stringify(stateToSave));
      this.lastSavedAt = new Date();
      if (this.cloudReady && this.firestoreDb && this.currentUser.provider === 'google-firebase') {
        this.syncToFirestore(uid, stateToSave);
      }
      if (!silent) {
        this.syncStudentWorkspaceToClass(uid, stateToSave);
        this.onSyncChange('saved');
      }
      return true;
    } catch (e) {
      console.error('Failed to save workspace:', e);
      this.onSyncChange('error');
      return false;
    }
  }

  // --- 문서 및 폴더 조작 API ---

  getActiveDocument() {
    let doc = this.state.documents.find((d) => d.id === this.state.activeDocId);
    if (!doc && this.state.documents.length > 0) {
      doc = this.state.documents[0];
      this.state.activeDocId = doc.id;
    }
    return doc;
  }

  setActiveDocument(docId) {
    if (this.state.documents.some((d) => d.id === docId)) {
      this.state.activeDocId = docId;
      this.saveWorkspace();
      return this.getActiveDocument();
    }
    return null;
  }

  createDocument(folderId = null, title = '') {
    const newDoc = {
      id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      folderId: folderId || null,
      title,
      updatedAt: new Date().toISOString(),
      items: createBlankDocumentItems()
    };
    this.state.documents.unshift(newDoc);
    this.state.activeDocId = newDoc.id;
    this.saveWorkspace();
    return newDoc;
  }

  deleteDocument(docId) {
    if (this.state.documents.length <= 1) {
      alert('최소 1개의 문서는 남아있어야 합니다.');
      return false;
    }
    this.state.documents = this.state.documents.filter((d) => d.id !== docId);
    if (this.state.activeDocId === docId) {
      this.state.activeDocId = this.state.documents[0].id;
    }
    this.saveWorkspace();
    return true;
  }

  renameDocument(docId, newTitle) {
    const doc = this.state.documents.find((d) => d.id === docId);
    if (doc) {
      doc.title = newTitle.trim();
      doc.updatedAt = new Date().toISOString();
      this.saveWorkspace();
    }
  }

  moveDocument(docId, targetFolderId) {
    const doc = this.state.documents.find((d) => d.id === docId);
    if (doc) {
      doc.folderId = targetFolderId || null;
      doc.updatedAt = new Date().toISOString();
      this.saveWorkspace();
    }
  }

  createFolder(name, parentId = null) {
    const folder = {
      id: `folder_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim() || '새 폴더',
      parentId: parentId || null,
      createdAt: new Date().toISOString(),
      expanded: true
    };
    this.state.folders.push(folder);
    this.saveWorkspace();
    return folder;
  }

  renameFolder(folderId, newName) {
    const folder = this.state.folders.find((f) => f.id === folderId);
    if (folder && newName.trim()) {
      folder.name = newName.trim();
      this.saveWorkspace();
    }
  }

  toggleFolderExpanded(folderId) {
    const folder = this.state.folders.find((f) => f.id === folderId);
    if (folder) {
      folder.expanded = !folder.expanded;
      this.saveWorkspace();
    }
  }

  deleteFolder(folderId) {
    const toRemove = new Set([folderId]);
    let added = true;
    while (added) {
      added = false;
      for (const f of this.state.folders) {
        if (f.parentId && toRemove.has(f.parentId) && !toRemove.has(f.id)) {
          toRemove.add(f.id);
          added = true;
        }
      }
    }
    this.state.documents.forEach((doc) => {
      if (doc.folderId && toRemove.has(doc.folderId)) {
        doc.folderId = null;
      }
    });
    this.state.folders = this.state.folders.filter((f) => !toRemove.has(f.id));
    this.saveWorkspace();
  }

  // --- 로그인 및 프로필 전환 ---

  switchOrLoginGoogleProfile({ uid: customUid, displayName, email, photoURL = '' }) {
    const cleanEmail = (email || displayName || 'user').trim().toLowerCase();
    const uid = customUid || `user_${cleanEmail.replace(/[^a-z0-9가-힣]/g, '_')}`;
    const user = {
      uid,
      displayName: (displayName || cleanEmail.split('@')[0]).trim(),
      email: cleanEmail,
      photoURL,
      provider: 'google-oidc'
    };
    this.currentUser = user;
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    this.ensureUserInList(user);
    this.setLoggedIn(true);
    this.state = this.loadUserWorkspace(user.uid);
    this.onSyncChange('switched');
    return user;
  }

  switchToUserByUid(uid) {
    const list = this.getSavedUsersList();
    const found = list.find((u) => u.uid === uid);
    if (found) {
      this.currentUser = found;
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(found));
      this.setLoggedIn(true);
      this.state = this.loadUserWorkspace(found.uid);
      this.onSyncChange('switched');
      return found;
    }
    return null;
  }

  getFirebaseConfig() {
    try {
      const raw = localStorage.getItem(FIREBASE_CONFIG_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  saveFirebaseConfig(configObj) {
    if (!configObj) {
      localStorage.removeItem(FIREBASE_CONFIG_KEY);
      this.cloudReady = false;
      return;
    }
    localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(configObj));
    this.initFirebaseIfConfigured();
  }

  async initFirebaseIfConfigured() {
    const config = this.getFirebaseConfig();
    if (!config || !config.apiKey || !config.projectId) return false;
    try {
      const [{ initializeApp }, { getAuth, GoogleAuthProvider, signInWithPopup }, { getFirestore, doc, setDoc, getDoc }] =
        await Promise.all([
          import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
          import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
          import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js')
        ]);

      this.firebaseApp = initializeApp(config);
      this.firebaseAuth = getAuth(this.firebaseApp);
      this.firestoreDb = getFirestore(this.firebaseApp);
      this.firebaseModules = { GoogleAuthProvider, signInWithPopup, doc, setDoc, getDoc };
      this.cloudReady = true;
      this.onSyncChange('cloud-ready');
      return true;
    } catch (e) {
      console.warn('Firebase dynamic import failed or invalid config:', e);
      this.cloudReady = false;
      return false;
    }
  }

  async signInWithRealFirebaseGoogle() {
    if (!this.cloudReady || !this.firebaseAuth) {
      throw new Error('Firebase 연동 키가 설정되지 않았습니다. 아래 이름/구글 이메일 입력으로 바로 시작할 수 있습니다.');
    }
    const { GoogleAuthProvider, signInWithPopup, doc, getDoc } = this.firebaseModules;
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(this.firebaseAuth, provider);
    const fbUser = result.user;
    const userObj = {
      uid: fbUser.uid,
      displayName: fbUser.displayName || fbUser.email,
      email: fbUser.email,
      photoURL: fbUser.photoURL || '',
      provider: 'google-firebase'
    };
    this.currentUser = userObj;
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(userObj));
    this.ensureUserInList(userObj);
    this.setLoggedIn(true);

    const docRef = doc(this.firestoreDb, 'workspaces', fbUser.uid);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      this.state = snap.data();
      this.state.presets = this.normalizePresets(this.state.presets);
      localStorage.setItem(this.getWorkspaceKey(fbUser.uid), JSON.stringify(this.state));
    } else {
      this.state = this.loadUserWorkspace(fbUser.uid);
      await this.syncToFirestore(fbUser.uid, this.state);
    }
    this.onSyncChange('cloud-synced');
    return userObj;
  }

  async syncToFirestore(uid, stateData) {
    if (!this.cloudReady || !this.firestoreDb || !this.firebaseModules) return;
    try {
      const { doc, setDoc } = this.firebaseModules;
      await setDoc(doc(this.firestoreDb, 'workspaces', uid), stateData);
    } catch (e) {
      console.warn('Firestore sync error:', e);
    }
  }

  exportWorkspaceJSON() {
    const payload = {
      exportedAt: new Date().toISOString(),
      user: this.currentUser,
      workspace: this.state
    };
    return JSON.stringify(payload, null, 2);
  }

  importWorkspaceJSON(jsonString) {
    const parsed = JSON.parse(jsonString);
    const ws = parsed.workspace || parsed;
    if (!ws.documents || !Array.isArray(ws.documents)) {
      throw new Error('유효한 목차 백업 파일이 아닙니다.');
    }
    ws.presets = this.normalizePresets(ws.presets);
    ws.settings = { ...DEFAULT_SETTINGS, ...(ws.settings || {}) };
    this.state = ws;
    this.saveWorkspace();
  }

  // --- 교사 계정 판별 및 학생 반 코드 / 학번 실시간 공유 ---

  getTeacherEmails() {
    try {
      const saved = JSON.parse(localStorage.getItem(TEACHER_EMAILS_KEY) || '[]');
      return Array.from(new Set([...DEFAULT_TEACHER_EMAILS, ...saved].map((e) => e.toLowerCase())));
    } catch {
      return DEFAULT_TEACHER_EMAILS;
    }
  }

  isTeacherAccount(user = this.currentUser) {
    const params = new URLSearchParams(window.location.search);
    if (params.get('teacher') === '1') return true;
    if (!user || !user.email) return false;
    return this.getTeacherEmails().includes(user.email.trim().toLowerCase());
  }

  getStudentClassKey(uid = this.currentUser?.uid) {
    return `${STORAGE_PREFIX}student_class_${uid}`;
  }

  getStudentClassInfo(uid = this.currentUser?.uid) {
    try {
      const raw = localStorage.getItem(this.getStudentClassKey(uid));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  hasCompletedStudentClassSetup(uid = this.currentUser?.uid) {
    const info = this.getStudentClassInfo(uid);
    return Boolean(info && info.classCode && info.studentNumber && info.studentName);
  }

  saveStudentClassInfo({ classCode, studentNumber, studentName }, uid = this.currentUser?.uid) {
    const cleanInfo = {
      classCode: String(classCode || '').trim(),
      studentNumber: String(studentNumber || '').trim(),
      studentName: String(studentName || this.currentUser?.displayName || '').trim(),
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(this.getStudentClassKey(uid), JSON.stringify(cleanInfo));
    this.syncStudentWorkspaceToClass(uid, this.state);
    return cleanInfo;
  }

  getLocalClassRegistry() {
    try {
      const raw = localStorage.getItem(CLASS_REGISTRY_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  saveLocalClassRegistry(registry) {
    try {
      localStorage.setItem(CLASS_REGISTRY_KEY, JSON.stringify(registry));
    } catch (e) {
      console.warn('Failed to save local class registry:', e);
    }
  }

  async syncStudentWorkspaceToClass(uid = this.currentUser?.uid, stateData = this.state) {
    const classInfo = this.getStudentClassInfo(uid);
    if (!classInfo || !classInfo.classCode) return;

    const entry = {
      uid,
      classCode: classInfo.classCode,
      studentNumber: classInfo.studentNumber,
      studentName: classInfo.studentName,
      email: this.currentUser?.email || '',
      updatedAt: new Date().toISOString(),
      workspace: {
        folders: stateData.folders || [],
        documents: stateData.documents || [],
        presets: stateData.presets || ALL_HEAD_PRESETS,
        settings: stateData.settings || DEFAULT_SETTINGS
      }
    };

    // 1. 로컬 레지스트리에 즉시 저장
    const reg = this.getLocalClassRegistry();
    reg[uid] = entry;
    this.saveLocalClassRegistry(reg);

    // 2. 클라우드 학급 동기화 서버(Cloudflare D1)로 실시간 백그라운드 전송
    try {
      await fetch(`${CLASS_SYNC_API_BASE}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
    } catch {
      // 오프라인 또는 로컬 환경에서도 로컬 레지스트리로 정상 동작
    }
  }

  async fetchClassStudents(classCodeFilter = 'ALL') {
    const mergedMap = new Map();

    // 1. 로컬 레지스트리 데이터 로드
    const localReg = this.getLocalClassRegistry();
    Object.values(localReg).forEach((st) => {
      if (st && st.uid) {
        mergedMap.set(st.uid, st);
      }
    });

    // 2. 클라우드 D1 서버에서 실시간 학급 학생 데이터 조회 후 최신본 병합
    try {
      const url = new URL(`${CLASS_SYNC_API_BASE}/class`);
      if (classCodeFilter && classCodeFilter !== 'ALL') {
        url.searchParams.set('classCode', classCodeFilter);
      }
      const res = await fetch(url.toString(), { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.students)) {
          data.students.forEach((remoteSt) => {
            if (!remoteSt || !remoteSt.uid) return;
            const existing = mergedMap.get(remoteSt.uid);
            if (!existing || new Date(remoteSt.updatedAt) >= new Date(existing.updatedAt)) {
              mergedMap.set(remoteSt.uid, remoteSt);
            }
          });
        }
      }
    } catch {
      // 클라우드 미연결 시 로컬 데이터 사용
    }

    let list = Array.from(mergedMap.values());
    if (classCodeFilter && classCodeFilter !== 'ALL') {
      list = list.filter((s) => s.classCode === classCodeFilter);
    }

    list.sort((a, b) => {
      if (a.classCode !== b.classCode) return String(a.classCode).localeCompare(String(b.classCode), 'ko');
      return String(a.studentNumber).localeCompare(String(b.studentNumber), 'ko', { numeric: true });
    });

    return list;
  }

  seedSampleClassStudents(classCode = '1-3') {
    const now = new Date().toISOString();
    const samples = [
      {
        uid: 'sample_st_10301',
        classCode,
        studentNumber: '10301',
        studentName: '김민준',
        email: 'minjun10301@gmail.com',
        updatedAt: now,
        workspace: {
          presets: JSON.parse(JSON.stringify(ALL_HEAD_PRESETS)),
          settings: { ...DEFAULT_SETTINGS },
          folders: [{ id: 'f_hist', name: '한국사', parentId: null, createdAt: now, expanded: true }],
          documents: [
            {
              id: 'doc_s1',
              folderId: 'f_hist',
              title: 'Ⅰ. 전근대 한국사의 이해',
              updatedAt: now,
              items: [
                { id: 'i1', level: 1, text: '전근대 한국사의 이해' },
                { id: 'i2', level: 2, text: '고대 국가의 지배 체제' },
                { id: 'i3', level: 3, text: '삼국의 성립과 발전' },
                { id: 'i4', level: 4, text: '중앙 집권 국가의 특징' },
                { id: 'i5', level: 5, text: '왕권의 강화와 율령 반포' },
                { id: 'i6', level: 3, text: '남북국의 정치와 사회' },
                { id: 'i7', level: 2, text: '고려의 통치 체제와 국제 질서' },
                { id: 'i8', level: 3, text: '문벌 귀족 사회의 성립과 동요' }
              ]
            }
          ]
        }
      },
      {
        uid: 'sample_st_10302',
        classCode,
        studentNumber: '10302',
        studentName: '이서연',
        email: 'seoyeon10302@gmail.com',
        updatedAt: now,
        workspace: {
          presets: JSON.parse(JSON.stringify(ALL_HEAD_PRESETS)),
          settings: { ...DEFAULT_SETTINGS },
          folders: [{ id: 'f_sci', name: '통합과학', parentId: null, createdAt: now, expanded: true }],
          documents: [
            {
              id: 'doc_s2',
              folderId: 'f_sci',
              title: 'Ⅰ. 물질과 규칙성',
              updatedAt: now,
              items: [
                { id: 's1', level: 1, text: '물질의 규칙성과 결합' },
                { id: 's2', level: 2, text: '우주의 시작과 원소의 생성' },
                { id: 's3', level: 3, text: '빅뱅 우주론과 기본 입자' },
                { id: 's4', level: 4, text: '수소와 헬륨 원자핵의 형성' },
                { id: 's5', level: 2, text: '원소의 주기성과 화학 결합' },
                { id: 's6', level: 3, text: '이온 결합과 공유 결합의 성질' }
              ]
            }
          ]
        }
      },
      {
        uid: 'sample_st_10303',
        classCode,
        studentNumber: '10303',
        studentName: '박지훈',
        email: 'jihun10303@gmail.com',
        updatedAt: now,
        workspace: {
          presets: JSON.parse(JSON.stringify(ALL_HEAD_PRESETS)),
          settings: { ...DEFAULT_SETTINGS },
          folders: [{ id: 'f_kor', name: '공통국어', parentId: null, createdAt: now, expanded: true }],
          documents: [
            {
              id: 'doc_s3',
              folderId: 'f_kor',
              title: 'Ⅰ. 문학과 삶',
              updatedAt: now,
              items: [
                { id: 'k1', level: 1, text: '문학의 본질과 갈래' },
                { id: 'k2', level: 2, text: '서정 갈래의 이해와 감상' },
                { id: 'k3', level: 3, text: '운율과 심상의 형상화 방식' },
                { id: 'k4', level: 2, text: '서사 갈래의 이해와 감상' },
                { id: 'k5', level: 3, text: '서술자의 시점과 갈등 구조' }
              ]
            }
          ]
        }
      }
    ];

    const reg = this.getLocalClassRegistry();
    samples.forEach((st) => {
      reg[st.uid] = st;
      this.syncStudentWorkspaceToClass(st.uid, st.workspace);
    });
    this.saveLocalClassRegistry(reg);
  }
}
