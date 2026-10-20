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

  switchOrLoginGoogleProfile({ displayName, email }) {
    const cleanEmail = (email || displayName || 'student').trim().toLowerCase();
    const uid = `user_${cleanEmail.replace(/[^a-z0-9가-힣]/g, '_')}`;
    const user = {
      uid,
      displayName: (displayName || cleanEmail.split('@')[0]).trim(),
      email: cleanEmail.includes('@') ? cleanEmail : `${cleanEmail}@school.edu`,
      photoURL: '',
      provider: 'google-local'
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
}
