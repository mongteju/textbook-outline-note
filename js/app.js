// js/app.js
// Apple HIG 스타일 미니멀 컨트롤러: 초기 로그인 화면, 자동+수동 저장(Ctrl+S), 4단계 인터랙티브 코치마크 가이드

import { ALL_HEAD_PRESETS, DEFAULT_SETTINGS, getFormatSampleLabel } from './hierarchy.js';
import { StorageManager } from './storage.js';
import { OutlineEditor } from './editor.js';

const INTERACTIVE_STEPS = [
  {
    title: '교과 제목을 입력해보세요',
    desc: '위쪽 제목 칸에 과목이나 단원 이름을 적고 Enter를 눌러보세요.',
    nextLabel: '다음'
  },
  {
    title: 'Tab 키를 눌러 위계를 바꿔보세요',
    desc: '목차 내용을 적고 Tab(또는 Shift+Tab)을 눌러보세요. 1~5단계가 반복해서 바뀝니다.',
    nextLabel: '다음'
  },
  {
    title: '인쇄 버튼을 눌러 확인해보세요',
    desc: '우측 상단 [인쇄]를 누르면 다른 메뉴 없이 A4 2단 문서만 깔끔하게 출력됩니다.',
    nextLabel: '다음'
  },
  {
    title: '문서함에서 새 문서를 만들어보세요',
    desc: '좌측 상단 [문서함]을 눌러 열고 [새 문서]를 만들어보세요.',
    nextLabel: '완료'
  }
];

class App {
  constructor() {
    this.storage = new StorageManager((status) => this.updateSyncBadge(status));
    this.activeHeadLevel = 1;
    this.guideActive = false;
    this.guideStep = 0;
    this.toastTimer = null;

    this.cacheDOM();
    this.initEditor();
    this.bindGlobalEvents();
    this.renderAll();

    // 로그인 상태 확인: 로그인 전이면 초기 로그인 화면 표시, 로그인 상태면 에디터 진입
    if (!this.storage.isLoggedIn) {
      this.showLoginGate();
    } else {
      this.hideLoginGateAndStart();
    }
  }

  focusFirstLine() {
    const doc = this.storage.getActiveDocument();
    if (doc && doc.items.length > 0) {
      this.editor.focusItem(doc.items[0].id, true);
    }
  }

  cacheDOM() {
    // 초기 로그인 게이트 화면 (단일 Google 로그인 버튼 + Google 계정 선택 모달)
    this.loginScreenGate = document.getElementById('loginScreenGate');
    this.gateGoogleOAuthBtn = document.getElementById('gateGoogleOAuthBtn');
    this.googleChooserModal = document.getElementById('googleChooserModal');
    this.googleChooserList = document.getElementById('googleChooserList');
    this.googleCustomEmailForm = document.getElementById('googleCustomEmailForm');
    this.googleCustomEmailInput = document.getElementById('googleCustomEmailInput');
    this.googleCancelCustomBtn = document.getElementById('googleCancelCustomBtn');
    this.useAnotherGoogleBtn = document.getElementById('useAnotherGoogleBtn');
    this.closeGoogleChooserBtn = document.getElementById('closeGoogleChooserBtn');

    // 저장 완료 토스트
    this.saveToast = document.getElementById('saveToast');

    // 상단 툴바
    this.sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
    this.quickNewDocBtn = document.getElementById('quickNewDocBtn');
    this.currentBreadcrumbEl = document.getElementById('currentBreadcrumb');
    this.syncBadgeEl = document.getElementById('syncBadge');
    this.syncStatusTextEl = document.getElementById('syncStatusText');
    this.depthFilterGroup = document.getElementById('depthFilterGroup');
    this.openGuideBtn = document.getElementById('openGuideBtn');
    this.saveDocBtn = document.getElementById('saveDocBtn');
    this.printBtn = document.getElementById('printBtn');
    this.userAccountBtn = document.getElementById('userAccountBtn');
    this.userAvatarText = document.getElementById('userAvatarText');
    this.userNameLabel = document.getElementById('userNameLabel');

    // 사이드바
    this.sidebarEl = document.getElementById('sidebarDrawer');
    this.sidebarOverlayEl = document.getElementById('sidebarOverlay');
    this.sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
    this.newFolderBtn = document.getElementById('newFolderBtn');
    this.newDocInSidebarBtn = document.getElementById('newDocInSidebarBtn');
    this.folderTreeEl = document.getElementById('folderTreeContainer');
    this.exportJsonBtn = document.getElementById('exportJsonBtn');
    this.importJsonBtn = document.getElementById('importJsonBtn');
    this.importJsonInput = document.getElementById('importJsonInput');

    // 에디터
    this.docTitleInput = document.getElementById('docTitleInput');
    this.outlineContainer = document.getElementById('outlineContainer');
    this.hiddenDepthNotice = document.getElementById('hiddenDepthNotice');
    this.resetDepthBtn = document.getElementById('resetDepthBtn');

    // 하단 플로팅 독
    this.bottomHeadsDock = document.getElementById('bottomHeadsDock');
    this.openSettingsBtn = document.getElementById('openSettingsBtn');

    // 인터랙티브 코치마크 가이드
    this.guideCoachmark = document.getElementById('guideCoachmark');
    this.coachStepBadge = document.getElementById('coachStepBadge');
    this.coachTitle = document.getElementById('coachTitle');
    this.coachDesc = document.getElementById('coachDesc');
    this.coachDots = document.getElementById('coachDots');
    this.coachSkipBtn = document.getElementById('coachSkipBtn');
    this.coachPrevBtn = document.getElementById('coachPrevBtn');
    this.coachNextBtn = document.getElementById('coachNextBtn');

    // 설정 시트
    this.settingsModal = document.getElementById('settingsModal');
    this.closeSettingsBtn = document.getElementById('closeSettingsBtn');
    this.maxHeadLevelsSelect = document.getElementById('maxHeadLevelsSelect');
    this.addHeadLevelQuickBtn = document.getElementById('addHeadLevelQuickBtn');
    this.colCountSelect = document.getElementById('colCountSelect');
    this.colRuleCheckbox = document.getElementById('colRuleCheckbox');
    this.autoNumberCheckbox = document.getElementById('autoNumberCheckbox');
    this.tabIndentCheckbox = document.getElementById('tabIndentCheckbox');
    this.shortcutModSelect = document.getElementById('shortcutModSelect');
    this.fontFamilySelect = document.getElementById('fontFamilySelect');
    this.lineHeightInput = document.getElementById('lineHeightInput');
    this.lineHeightVal = document.getElementById('lineHeightVal');
    this.detailedHeadTableBody = document.getElementById('detailedHeadTableBody');
    this.resetPresetsBtn = document.getElementById('resetPresetsBtn');

    // 계정 시트
    this.authModal = document.getElementById('authModal');
    this.closeAuthBtn = document.getElementById('closeAuthBtn');
    this.currentAccountCard = document.getElementById('currentAccountCard');
    this.savedProfilesList = document.getElementById('savedProfilesList');
    this.realGoogleLoginBtn = document.getElementById('realGoogleLoginBtn');
    this.logoutBtn = document.getElementById('logoutBtn');

    // 프롬프트 모달
    this.promptModal = document.getElementById('promptModal');
    this.promptTitle = document.getElementById('promptTitle');
    this.promptInput = document.getElementById('promptInput');
    this.promptSelectWrapper = document.getElementById('promptSelectWrapper');
    this.promptFolderSelect = document.getElementById('promptFolderSelect');
    this.promptCancelBtn = document.getElementById('promptCancelBtn');
    this.promptConfirmBtn = document.getElementById('promptConfirmBtn');
  }

  getMaxHeadLevels() {
    return Math.min(7, Math.max(5, Number(this.storage.state.settings.maxHeadLevels) || 5));
  }

  // --- 초기 로그인 게이트 화면 및 Google 계정 선택 창 제어 ---

  showLoginGate() {
    if (this.guideActive) {
      this.guideCoachmark.classList.add('is-hidden');
      this.clearCoachHighlights();
    }
    this.googleChooserModal.classList.add('is-hidden');
    this.loginScreenGate.classList.remove('is-hidden');
  }

  hideLoginGateAndStart() {
    this.googleChooserModal.classList.add('is-hidden');
    this.loginScreenGate.classList.add('is-hidden');
    this.renderAll();

    // 해당 계정에서 최초 1회만 인터랙티브 가이드 자동 실행
    if (!this.storage.hasSeenOnboardingGuide(this.storage.currentUser.uid)) {
      setTimeout(() => this.startInteractiveGuide(0), 150);
    } else {
      this.focusFirstLine();
    }
  }

  openGoogleAccountChooser() {
    this.renderGoogleChooserAccounts();
    this.googleCustomEmailForm.classList.add('is-hidden');
    this.useAnotherGoogleBtn.classList.remove('is-hidden');
    this.googleChooserModal.classList.remove('is-hidden');
  }

  closeGoogleAccountChooser() {
    this.googleChooserModal.classList.add('is-hidden');
  }

  renderGoogleChooserAccounts() {
    let users = this.storage.getSavedUsersList();
    if (!users || users.length === 0) {
      // 저장된 계정이 없을 때 기본 Google 계정을 1개 제공하여 클릭 1번으로도 즉시 시작 가능하게 함
      users = [
        {
          uid: 'user_google_default',
          displayName: 'Google 사용자',
          email: 'my.account@gmail.com',
          provider: 'google-local'
        }
      ];
    }

    this.googleChooserList.innerHTML = '';
    users.forEach((u) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'g-account-row';
      const initial = (u.displayName || u.email || 'G')[0].toUpperCase();
      btn.innerHTML = `
        <span class="g-row-avatar">${this.escapeHTML(initial)}</span>
        <span class="g-row-meta">
          <strong>${this.escapeHTML(u.displayName)}</strong>
          <small>${this.escapeHTML(u.email)}</small>
        </span>
      `;
      btn.addEventListener('click', () => {
        this.storage.switchOrLoginGoogleProfile({
          displayName: u.displayName,
          email: u.email
        });
        this.closeAuthModal();
        this.hideLoginGateAndStart();
      });
      this.googleChooserList.appendChild(btn);
    });
  }

  // --- 명시적 수동 저장 + 토스트 표시 ---

  triggerManualSave() {
    const ok = this.storage.saveWorkspace();
    if (ok) {
      const now = new Date();
      const timeStr = now.toTimeString().slice(0, 5);
      if (this.syncStatusTextEl) {
        this.syncStatusTextEl.textContent = `저장됨 (${timeStr})`;
      }
      this.showSaveToast('✓ 문서가 저장되었습니다');
    }
  }

  showSaveToast(message) {
    if (!this.saveToast) return;
    this.saveToast.textContent = message;
    this.saveToast.classList.remove('is-hidden');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.saveToast.classList.add('is-hidden');
    }, 1800);
  }

  initEditor() {
    this.editor = new OutlineEditor({
      containerEl: this.outlineContainer,
      titleInputEl: this.docTitleInput,
      getDocument: () => this.storage.getActiveDocument(),
      getPresets: () => this.storage.state.presets,
      getSettings: () => this.storage.state.settings,
      onChange: (changeType) => {
        this.storage.saveWorkspace();
        this.renderBreadcrumb();
        this.renderSidebarTree();

        if (this.guideActive && this.guideStep === 1 && changeType === 'level') {
          this.advanceGuideStep(2);
        }
      },
      onActiveLevelChange: (level) => {
        this.activeHeadLevel = level;
        this.highlightActiveHeadCircle();
        this.renderDepthFilterBar();
      }
    });
  }

  bindGlobalEvents() {
    // 초기 로그인 화면: 단일 Google 로그인 버튼 클릭
    this.gateGoogleOAuthBtn.addEventListener('click', async () => {
      if (this.storage.cloudReady) {
        try {
          await this.storage.signInWithRealFirebaseGoogle();
          this.hideLoginGateAndStart();
          return;
        } catch {
          // Firebase 팝업 실패 또는 미설정 시 Google 계정 선택 모달 오픈
        }
      }
      this.openGoogleAccountChooser();
    });

    // Google 계정 선택 창 내부 이벤트
    this.useAnotherGoogleBtn.addEventListener('click', () => {
      this.useAnotherGoogleBtn.classList.add('is-hidden');
      this.googleCustomEmailForm.classList.remove('is-hidden');
      this.googleCustomEmailInput.value = '';
      setTimeout(() => this.googleCustomEmailInput.focus(), 30);
    });

    this.googleCancelCustomBtn.addEventListener('click', () => {
      this.googleCustomEmailForm.classList.add('is-hidden');
      this.useAnotherGoogleBtn.classList.remove('is-hidden');
    });

    this.closeGoogleChooserBtn.addEventListener('click', () => {
      this.closeGoogleAccountChooser();
    });

    this.googleCustomEmailForm.addEventListener('submit', (e) => {
      e.preventDefault();
      let email = this.googleCustomEmailInput.value.trim().toLowerCase();
      if (!email) return;
      if (!email.includes('@')) {
        email = `${email}@gmail.com`;
      }
      const displayName = email.split('@')[0];
      this.storage.switchOrLoginGoogleProfile({ displayName, email });
      this.closeAuthModal();
      this.hideLoginGateAndStart();
    });

    // 로그아웃 버튼
    if (this.logoutBtn) {
      this.logoutBtn.addEventListener('click', () => {
        this.closeAuthModal();
        this.storage.logout();
        this.showLoginGate();
      });
    }

    // 상단 [저장] 버튼
    if (this.saveDocBtn) {
      this.saveDocBtn.addEventListener('click', () => {
        this.triggerManualSave();
      });
    }

    this.sidebarToggleBtn.addEventListener('click', () => {
      this.toggleSidebar(true);
      if (this.guideActive && this.guideStep === 3) {
        this.positionCoachmarkForStep(3);
      }
    });
    this.sidebarCloseBtn.addEventListener('click', () => this.toggleSidebar(false));
    this.sidebarOverlayEl.addEventListener('click', () => this.toggleSidebar(false));

    this.docTitleInput.addEventListener('keydown', (e) => {
      if (this.guideActive && this.guideStep === 0 && (e.key === 'Enter' || e.key === 'ArrowDown')) {
        setTimeout(() => this.advanceGuideStep(1), 50);
      }
    });

    this.outlineContainer.addEventListener('focusin', () => {
      if (
        this.guideActive &&
        this.guideStep === 0 &&
        this.docTitleInput.value.trim().length > 0
      ) {
        this.advanceGuideStep(1);
      }
    });

    this.quickNewDocBtn.addEventListener('click', () => {
      const currentDoc = this.storage.getActiveDocument();
      const folderId = currentDoc ? currentDoc.folderId : null;
      const newDoc = this.storage.createDocument(folderId, '');
      this.renderAll();
      if (newDoc.items.length > 0) {
        this.editor.focusItem(newDoc.items[0].id, false);
      }
      if (this.guideActive && this.guideStep === 3) {
        this.finishInteractiveGuide();
      }
    });

    this.newFolderBtn.addEventListener('click', () => this.openCreateFolderPrompt());
    this.newDocInSidebarBtn.addEventListener('click', () => {
      if (this.guideActive && this.guideStep === 3) {
        const activeDoc = this.storage.getActiveDocument();
        const newDoc = this.storage.createDocument(activeDoc ? activeDoc.folderId : null, '');
        this.renderAll();
        this.toggleSidebar(false);
        this.finishInteractiveGuide();
        if (newDoc.items.length > 0) {
          this.docTitleInput.focus();
        }
        return;
      }
      this.openCreateDocPrompt();
    });

    this.depthFilterGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-depth]');
      if (!btn) return;
      const depth = Number(btn.dataset.depth);
      this.editor.setMaxVisibleLevel(depth);
      this.renderDepthFilterBar();
    });

    if (this.resetDepthBtn) {
      this.resetDepthBtn.addEventListener('click', () => {
        this.editor.setMaxVisibleLevel(this.getMaxHeadLevels());
        this.renderDepthFilterBar();
      });
    }

    // 인터랙티브 코치마크 가이드 버튼 (이전 / 다음 / 단계 점 클릭 / 닫기)
    this.openGuideBtn.addEventListener('click', () => this.startInteractiveGuide(0));
    this.coachSkipBtn.addEventListener('click', () => this.finishInteractiveGuide());
    this.coachPrevBtn.addEventListener('click', () => {
      if (this.guideStep > 0) {
        this.advanceGuideStep(this.guideStep - 1);
      }
    });
    this.coachNextBtn.addEventListener('click', () => {
      if (this.guideStep < INTERACTIVE_STEPS.length - 1) {
        this.advanceGuideStep(this.guideStep + 1);
      } else {
        this.finishInteractiveGuide();
      }
    });
    this.coachDots.addEventListener('click', (e) => {
      const dotBtn = e.target.closest('button[data-step]');
      if (!dotBtn) return;
      this.advanceGuideStep(Number(dotBtn.dataset.step));
    });

    window.addEventListener('resize', () => {
      if (this.guideActive) {
        this.positionCoachmarkForStep(this.guideStep);
      }
    });

    // 인쇄 버튼
    this.printBtn.addEventListener('click', () => {
      if (this.guideActive && this.guideStep === 2) {
        this.advanceGuideStep(3);
      }
      window.print();
    });

    // 설정 모달
    this.openSettingsBtn.addEventListener('click', () => this.openSettingsModal());
    this.closeSettingsBtn.addEventListener('click', () => this.closeSettingsModal());
    this.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.settingsModal) this.closeSettingsModal();
    });

    this.maxHeadLevelsSelect.addEventListener('change', () => {
      const nextMax = Math.min(7, Math.max(5, Number(this.maxHeadLevelsSelect.value) || 5));
      this.storage.state.settings.maxHeadLevels = nextMax;
      this.editor.setMaxVisibleLevel(nextMax);
      this.storage.saveWorkspace();
      this.populateSettingsModal();
      this.renderAll();
    });

    this.addHeadLevelQuickBtn.addEventListener('click', () => {
      const currentMax = this.getMaxHeadLevels();
      if (currentMax < 7) {
        const nextMax = currentMax + 1;
        this.storage.state.settings.maxHeadLevels = nextMax;
        this.editor.setMaxVisibleLevel(nextMax);
        this.storage.saveWorkspace();
        this.populateSettingsModal();
        this.renderAll();
      }
    });

    this.colCountSelect.addEventListener('change', () => {
      this.storage.state.settings.columns = Number(this.colCountSelect.value);
      this.storage.saveWorkspace();
      this.editor.render();
    });

    this.colRuleCheckbox.addEventListener('change', () => {
      this.storage.state.settings.showColumnRule = this.colRuleCheckbox.checked;
      this.storage.saveWorkspace();
      this.editor.render();
    });

    this.autoNumberCheckbox.addEventListener('change', () => {
      this.storage.state.settings.autoNumbering = this.autoNumberCheckbox.checked;
      this.storage.saveWorkspace();
      this.editor.render();
      this.renderBottomDock();
    });

    this.tabIndentCheckbox.addEventListener('change', () => {
      this.storage.state.settings.enableTabIndent = this.tabIndentCheckbox.checked;
      this.storage.saveWorkspace();
    });

    this.shortcutModSelect.addEventListener('change', () => {
      this.storage.state.settings.shortcutModifier = this.shortcutModSelect.value;
      this.storage.saveWorkspace();
      this.renderBottomDock();
    });

    this.fontFamilySelect.addEventListener('change', () => {
      this.storage.state.settings.fontFamily = this.fontFamilySelect.value;
      this.storage.saveWorkspace();
      this.editor.render();
    });

    this.lineHeightInput.addEventListener('input', () => {
      const val = Number(this.lineHeightInput.value);
      this.lineHeightVal.textContent = val.toFixed(2);
      this.storage.state.settings.lineHeight = val;
      this.storage.saveWorkspace();
      this.editor.render();
    });

    this.resetPresetsBtn.addEventListener('click', () => {
      this.storage.state.presets = JSON.parse(JSON.stringify(ALL_HEAD_PRESETS));
      this.storage.state.settings = { ...DEFAULT_SETTINGS };
      this.editor.setMaxVisibleLevel(DEFAULT_SETTINGS.maxHeadLevels);
      this.storage.saveWorkspace();
      this.populateSettingsModal();
      this.renderAll();
    });

    // 계정 모달
    this.userAccountBtn.addEventListener('click', () => this.openAuthModal());
    this.closeAuthBtn.addEventListener('click', () => this.closeAuthModal());
    this.authModal.addEventListener('click', (e) => {
      if (e.target === this.authModal) this.closeAuthModal();
    });

    if (this.realGoogleLoginBtn) {
      this.realGoogleLoginBtn.addEventListener('click', () => {
        this.closeAuthModal();
        this.loginScreenGate.classList.remove('is-hidden');
        this.openGoogleAccountChooser();
        this.useAnotherGoogleBtn.click();
      });
    }

    // JSON 백업
    this.exportJsonBtn.addEventListener('click', () => {
      const jsonStr = this.storage.exportWorkspaceJSON();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `목차노트_${this.storage.currentUser.displayName}_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    this.importJsonBtn.addEventListener('click', () => {
      this.importJsonInput.click();
    });

    this.importJsonInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          this.storage.importWorkspaceJSON(reader.result);
          this.renderAll();
        } catch (err) {
          alert(err.message);
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    // 전역 단축키: Ctrl+S (수동 저장) 및 Alt + 1 ~ 7 (위계 변경)
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.triggerManualSave();
        return;
      }
      const digitMatch = e.code ? e.code.match(/^(?:Digit|Numpad)([1-7])$/) : null;
      const keyNum = digitMatch ? Number(digitMatch[1]) : null;
      if (keyNum && keyNum <= this.getMaxHeadLevels() && e.altKey && !e.ctrlKey) {
        e.preventDefault();
        this.editor.changeActiveItemLevel(keyNum);
      }
    });
  }

  // --- 한 번에 하나의 기능만 따라하게 하는 인터랙티브 가이드 ---

  startInteractiveGuide(stepIdx = 0) {
    this.guideActive = true;
    // 계정당 최초 1회만 자동으로 뜨도록 시작 즉시 기록
    this.storage.setOnboardingGuideSeen(this.storage.currentUser.uid);
    this.guideCoachmark.classList.remove('is-hidden');
    this.advanceGuideStep(stepIdx);
  }

  advanceGuideStep(stepIdx) {
    this.guideStep = Math.max(0, Math.min(INTERACTIVE_STEPS.length - 1, stepIdx));
    const step = INTERACTIVE_STEPS[this.guideStep];

    this.coachStepBadge.textContent = `${this.guideStep + 1} / ${INTERACTIVE_STEPS.length}`;
    this.coachTitle.textContent = step.title;
    this.coachDesc.textContent = step.desc;
    this.coachNextBtn.textContent = step.nextLabel;
    if (this.coachPrevBtn) {
      this.coachPrevBtn.disabled = this.guideStep === 0;
    }

    this.coachDots.innerHTML = INTERACTIVE_STEPS.map(
      (_, i) =>
        `<button type="button" data-step="${i}" class="coach-dot ${i === this.guideStep ? 'is-active' : ''}" title="${i + 1}단계로 이동"></button>`
    ).join('');

    this.clearCoachHighlights();

    if (this.guideStep < 3 && this.sidebarEl.classList.contains('is-open')) {
      this.toggleSidebar(false);
    }

    if (this.guideStep === 0) {
      this.docTitleInput.classList.add('coach-highlight');
      this.docTitleInput.focus();
    } else if (this.guideStep === 1) {
      this.focusFirstLine();
      const firstRow = this.outlineContainer.querySelector('.outline-row');
      if (firstRow) firstRow.classList.add('coach-highlight');
    } else if (this.guideStep === 2) {
      this.printBtn.classList.add('coach-highlight');
    } else if (this.guideStep === 3) {
      this.sidebarToggleBtn.classList.add('coach-highlight');
      this.newDocInSidebarBtn.classList.add('coach-highlight');
    }

    this.positionCoachmarkForStep(this.guideStep);
  }

  positionCoachmarkForStep(stepIdx) {
    const coachWidth = 290;
    const coachHeight = 155;
    let top = 60;
    let left = 16;

    if (stepIdx === 0) {
      const rect = this.docTitleInput.getBoundingClientRect();
      top = rect.bottom + 12;
      left = rect.left;
    } else if (stepIdx === 1) {
      const targetEl = this.outlineContainer.querySelector('.outline-row') || this.outlineContainer;
      const rect = targetEl.getBoundingClientRect();
      top = rect.bottom + 12;
      left = rect.left;
    } else if (stepIdx === 2) {
      const rect = this.printBtn.getBoundingClientRect();
      top = rect.bottom + 12;
      left = rect.right - coachWidth;
    } else if (stepIdx === 3) {
      const isSidebarOpen = this.sidebarEl.classList.contains('is-open');
      if (isSidebarOpen) {
        this.coachDesc.textContent = '열린 문서함 상단의 [새 문서] 버튼을 눌러보세요.';
        top = 104;
        left = 16;
      } else {
        this.coachDesc.textContent = INTERACTIVE_STEPS[3].desc;
        const rect = this.sidebarToggleBtn.getBoundingClientRect();
        top = rect.bottom + 12;
        left = Math.max(16, rect.left);
      }
    }

    const safeTop = Math.min(window.innerHeight - coachHeight - 16, Math.max(56, top));
    const safeLeft = Math.min(window.innerWidth - coachWidth - 16, Math.max(16, left));

    this.guideCoachmark.style.top = `${safeTop}px`;
    this.guideCoachmark.style.left = `${safeLeft}px`;
  }

  clearCoachHighlights() {
    document.querySelectorAll('.coach-highlight').forEach((el) => {
      el.classList.remove('coach-highlight');
    });
  }

  finishInteractiveGuide() {
    this.guideActive = false;
    this.clearCoachHighlights();
    this.guideCoachmark.classList.add('is-hidden');
    this.storage.setOnboardingGuideSeen(this.storage.currentUser.uid);
    this.focusFirstLine();
  }

  toggleSidebar(open) {
    if (open) {
      this.sidebarEl.classList.add('is-open');
      this.sidebarOverlayEl.classList.add('is-open');
    } else {
      this.sidebarEl.classList.remove('is-open');
      this.sidebarOverlayEl.classList.remove('is-open');
    }
  }

  updateSyncBadge(status) {
    if (!this.syncBadgeEl) return;
    this.syncBadgeEl.classList.toggle('is-error', status === 'error');
    if (this.syncStatusTextEl) {
      if (status === 'saved') {
        this.syncStatusTextEl.textContent = '자동 저장됨';
      } else if (status === 'cloud-synced') {
        this.syncStatusTextEl.textContent = '클라우드 저장됨';
      } else if (status === 'error') {
        this.syncStatusTextEl.textContent = '저장 오류';
      }
    }
  }

  renderAll() {
    this.renderUserHeader();
    this.renderBreadcrumb();
    this.renderSidebarTree();
    this.renderBottomDock();
    this.renderDepthFilterBar();
    this.editor.render();
  }

  renderUserHeader() {
    const user = this.storage.currentUser;
    const initial = (user.displayName || user.email || '학')[0].toUpperCase();
    this.userAvatarText.textContent = initial;
    this.userNameLabel.textContent = user.displayName || user.email;
  }

  renderBreadcrumb() {
    const doc = this.storage.getActiveDocument();
    if (!doc) return;
    const folder = this.storage.state.folders.find((f) => f.id === doc.folderId);
    const folderName = folder ? folder.name : '문서함';
    const docTitle = doc.title?.trim() || '제목 없음';
    this.currentBreadcrumbEl.innerHTML = `<span class="crumb-folder">${this.escapeHTML(folderName)}</span><span class="crumb-sep">›</span><span class="crumb-doc">${this.escapeHTML(docTitle)}</span>`;
  }

  renderDepthFilterBar() {
    const maxLevels = this.getMaxHeadLevels();
    this.editor.syncMaxVisibleWithSettings();
    const currentDepth = this.editor.maxVisibleLevel;

    let html = '';
    for (let lvl = 1; lvl < maxLevels; lvl++) {
      const activeClass = currentDepth === lvl ? 'is-active' : '';
      html += `<button type="button" data-depth="${lvl}" class="${activeClass}" title="${lvl}단계까지만 표시">${lvl}단계</button>`;
    }
    const allActive = currentDepth >= maxLevels ? 'is-active' : '';
    html += `<button type="button" data-depth="${maxLevels}" class="${allActive}" title="전체 위계 표시">전체</button>`;

    this.depthFilterGroup.innerHTML = html;

    if (this.hiddenDepthNotice) {
      if (currentDepth < maxLevels) {
        this.hiddenDepthNotice.classList.remove('is-hidden');
        this.hiddenDepthNotice.querySelector('.notice-text').textContent =
          `${currentDepth}단계까지만 표시 중`;
      } else {
        this.hiddenDepthNotice.classList.add('is-hidden');
      }
    }
  }

  renderBottomDock() {
    const maxLevels = this.getMaxHeadLevels();
    const presets = this.storage.state.presets.slice(0, maxLevels);
    const mod = this.storage.state.settings.shortcutModifier === 'CtrlShift' ? 'Ctrl+Shift+' : 'Alt+';

    this.bottomHeadsDock.innerHTML = '';

    presets.forEach((preset) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'dock-head-item';
      if (preset.level === this.activeHeadLevel) {
        itemEl.classList.add('is-active');
      }
      itemEl.dataset.level = preset.level;

      const sampleLabel = getFormatSampleLabel(preset.format);

      const circleWrap = document.createElement('div');
      circleWrap.className = 'dock-circle-wrap';

      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.className = 'hidden-color-input';
      colorInput.value = preset.color;

      const circleBtn = document.createElement('button');
      circleBtn.type = 'button';
      circleBtn.className = 'dock-color-circle';
      circleBtn.style.backgroundColor = preset.color;
      circleBtn.title = `헤드 ${preset.level} (${mod}${preset.level}) · 한번 더 클릭 시 색상 변경`;
      circleBtn.innerHTML = `<span class="circle-prefix-tag">${sampleLabel}</span>`;

      circleBtn.addEventListener('click', () => {
        if (this.activeHeadLevel === preset.level) {
          colorInput.click();
        } else {
          this.editor.changeActiveItemLevel(preset.level);
        }
      });

      colorInput.addEventListener('input', (e) => {
        preset.color = e.target.value;
        circleBtn.style.backgroundColor = preset.color;
        this.storage.saveWorkspace();
        this.editor.refreshNumbersAndStyles();
      });

      circleWrap.appendChild(circleBtn);
      circleWrap.appendChild(colorInput);
      itemEl.appendChild(circleWrap);

      const sizeCtrl = document.createElement('div');
      sizeCtrl.className = 'dock-size-control';

      const minusBtn = document.createElement('button');
      minusBtn.type = 'button';
      minusBtn.className = 'size-step-btn';
      minusBtn.textContent = '−';

      const sizeVal = document.createElement('span');
      sizeVal.className = 'size-val-label';
      sizeVal.textContent = `${preset.fontSize}`;

      const plusBtn = document.createElement('button');
      plusBtn.type = 'button';
      plusBtn.className = 'size-step-btn';
      plusBtn.textContent = '+';

      const updateSize = (delta) => {
        const next = Math.min(28, Math.max(8, Number((preset.fontSize + delta).toFixed(1))));
        preset.fontSize = next;
        sizeVal.textContent = `${next}`;
        this.storage.saveWorkspace();
        this.editor.refreshNumbersAndStyles();
      };

      minusBtn.addEventListener('click', () => updateSize(-0.5));
      plusBtn.addEventListener('click', () => updateSize(0.5));

      sizeCtrl.appendChild(minusBtn);
      sizeCtrl.appendChild(sizeVal);
      sizeCtrl.appendChild(plusBtn);

      itemEl.appendChild(sizeCtrl);
      this.bottomHeadsDock.appendChild(itemEl);
    });
  }

  highlightActiveHeadCircle() {
    this.bottomHeadsDock.querySelectorAll('.dock-head-item').forEach((el) => {
      const lvl = Number(el.dataset.level);
      el.classList.toggle('is-active', lvl === this.activeHeadLevel);
    });
  }

  // --- 사이드바 폴더 및 문서 트리 ---

  renderSidebarTree() {
    const { folders, documents, activeDocId } = this.storage.state;
    this.folderTreeEl.innerHTML = '';

    const renderFolderNode = (folder, depth = 0) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'tree-folder-group';

      const header = document.createElement('div');
      header.className = 'tree-folder-header';
      header.style.paddingLeft = `${10 + depth * 14}px`;

      const toggleIcon = document.createElement('span');
      toggleIcon.className = 'folder-chevron';
      toggleIcon.textContent = folder.expanded !== false ? '▾' : '▸';

      const folderTitle = document.createElement('span');
      folderTitle.className = 'folder-name';
      folderTitle.textContent = folder.name;

      header.appendChild(toggleIcon);
      header.appendChild(folderTitle);

      const actions = document.createElement('div');
      actions.className = 'tree-item-actions';

      const addDocBtn = document.createElement('button');
      addDocBtn.type = 'button';
      addDocBtn.title = '새 문서';
      addDocBtn.textContent = '+';
      addDocBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const newDoc = this.storage.createDocument(folder.id, '');
        this.renderAll();
        this.toggleSidebar(false);
        if (newDoc.items.length > 0) {
          this.editor.focusItem(newDoc.items[0].id, false);
        }
      });

      const renameBtn = document.createElement('button');
      renameBtn.type = 'button';
      renameBtn.title = '이름 변경';
      renameBtn.textContent = '편집';
      renameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openRenameFolderPrompt(folder);
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.title = '삭제';
      delBtn.textContent = '×';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.storage.deleteFolder(folder.id);
        this.renderAll();
      });

      actions.appendChild(addDocBtn);
      actions.appendChild(renameBtn);
      actions.appendChild(delBtn);
      header.appendChild(actions);

      header.addEventListener('click', () => {
        this.storage.toggleFolderExpanded(folder.id);
        this.renderSidebarTree();
      });

      wrapper.appendChild(header);

      if (folder.expanded !== false) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'tree-folder-children';

        const subFolders = folders.filter((f) => f.parentId === folder.id);
        subFolders.forEach((sf) => {
          childrenContainer.appendChild(renderFolderNode(sf, depth + 1));
        });

        const folderDocs = documents.filter((d) => d.folderId === folder.id);
        folderDocs.forEach((doc) => {
          childrenContainer.appendChild(this.createDocNodeEl(doc, depth + 1, activeDocId));
        });

        wrapper.appendChild(childrenContainer);
      }

      return wrapper;
    };

    const rootFolders = folders.filter((f) => !f.parentId);
    rootFolders.forEach((folder) => {
      this.folderTreeEl.appendChild(renderFolderNode(folder, 0));
    });

    const rootDocs = documents.filter((d) => !d.folderId);
    if (rootDocs.length > 0) {
      const rootSection = document.createElement('div');
      rootSection.className = 'tree-unfiled-section';
      rootDocs.forEach((doc) => {
        rootSection.appendChild(this.createDocNodeEl(doc, 0, activeDocId));
      });
      this.folderTreeEl.appendChild(rootSection);
    }
  }

  createDocNodeEl(doc, depth, activeDocId) {
    const docRow = document.createElement('div');
    docRow.className = 'tree-doc-row';
    if (doc.id === activeDocId) docRow.classList.add('is-active');
    docRow.style.paddingLeft = `${22 + depth * 14}px`;

    const titleSpan = document.createElement('span');
    titleSpan.className = 'tree-doc-title';
    titleSpan.textContent = doc.title?.trim() || '제목 없음';
    docRow.appendChild(titleSpan);

    const actions = document.createElement('div');
    actions.className = 'tree-item-actions';

    const moveBtn = document.createElement('button');
    moveBtn.type = 'button';
    moveBtn.textContent = '편집';
    moveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openEditDocPrompt(doc);
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.storage.deleteDocument(doc.id);
      this.renderAll();
    });

    actions.appendChild(moveBtn);
    actions.appendChild(delBtn);
    docRow.appendChild(actions);

    docRow.addEventListener('click', () => {
      this.storage.setActiveDocument(doc.id);
      this.renderAll();
      this.toggleSidebar(false);
    });

    return docRow;
  }

  // --- 프롬프트 모달 ---

  openPromptModal({ title, defaultValue = '', showFolderSelect = false, selectedFolderId = null, folderLabel = '위치', onConfirm }) {
    this.promptTitle.textContent = title;
    this.promptInput.value = defaultValue;

    if (showFolderSelect) {
      this.promptSelectWrapper.classList.remove('is-hidden');
      this.promptSelectWrapper.querySelector('label').textContent = folderLabel;
      this.promptFolderSelect.innerHTML = `<option value="">최상위</option>`;
      this.storage.state.folders.forEach((f) => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = f.name;
        if (f.id === selectedFolderId) opt.selected = true;
        this.promptFolderSelect.appendChild(opt);
      });
    } else {
      this.promptSelectWrapper.classList.add('is-hidden');
    }

    this.promptModal.classList.remove('is-hidden');
    setTimeout(() => {
      this.promptInput.focus();
      this.promptInput.select();
    }, 30);

    const cleanup = () => {
      this.promptModal.classList.add('is-hidden');
      this.promptConfirmBtn.onclick = null;
      this.promptCancelBtn.onclick = null;
      this.promptInput.onkeydown = null;
    };

    this.promptCancelBtn.onclick = cleanup;
    this.promptConfirmBtn.onclick = () => {
      const val = this.promptInput.value.trim();
      const folderVal = this.promptFolderSelect.value || null;
      cleanup();
      onConfirm(val, folderVal);
    };
    this.promptInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.promptConfirmBtn.click();
      } else if (e.key === 'Escape') {
        cleanup();
      }
    };
  }

  openCreateFolderPrompt() {
    this.openPromptModal({
      title: '새 폴더',
      defaultValue: '',
      showFolderSelect: true,
      selectedFolderId: null,
      folderLabel: '상위 폴더',
      onConfirm: (name, parentId) => {
        if (!name) return;
        this.storage.createFolder(name, parentId);
        this.renderSidebarTree();
      }
    });
  }

  openRenameFolderPrompt(folder) {
    this.openPromptModal({
      title: '폴더 이름 변경',
      defaultValue: folder.name,
      showFolderSelect: false,
      onConfirm: (newName) => {
        if (!newName) return;
        this.storage.renameFolder(folder.id, newName);
        this.renderAll();
      }
    });
  }

  openCreateDocPrompt() {
    const activeDoc = this.storage.getActiveDocument();
    this.openPromptModal({
      title: '새 문서',
      defaultValue: '',
      showFolderSelect: true,
      selectedFolderId: activeDoc ? activeDoc.folderId : null,
      folderLabel: '폴더',
      onConfirm: (title, folderId) => {
        const newDoc = this.storage.createDocument(folderId, title);
        this.renderAll();
        this.toggleSidebar(false);
        if (newDoc.items.length > 0) {
          this.editor.focusItem(newDoc.items[0].id, false);
        }
      }
    });
  }

  openEditDocPrompt(doc) {
    this.openPromptModal({
      title: '문서 편집',
      defaultValue: doc.title,
      showFolderSelect: true,
      selectedFolderId: doc.folderId,
      folderLabel: '폴더 이동',
      onConfirm: (newTitle, folderId) => {
        this.storage.renameDocument(doc.id, newTitle);
        this.storage.moveDocument(doc.id, folderId);
        this.renderAll();
      }
    });
  }

  // --- 설정 시트 ---

  openSettingsModal() {
    this.populateSettingsModal();
    this.settingsModal.classList.remove('is-hidden');
  }

  closeSettingsModal() {
    this.settingsModal.classList.add('is-hidden');
  }

  populateSettingsModal() {
    const { settings, presets } = this.storage.state;
    const maxLevels = this.getMaxHeadLevels();

    this.maxHeadLevelsSelect.value = String(maxLevels);
    this.addHeadLevelQuickBtn.disabled = maxLevels >= 7;
    this.addHeadLevelQuickBtn.textContent =
      maxLevels >= 7 ? '최대 7단계' : `+ ${maxLevels + 1}단계 추가`;

    this.colCountSelect.value = String(settings.columns || 2);
    this.colRuleCheckbox.checked = settings.showColumnRule !== false;
    this.autoNumberCheckbox.checked = settings.autoNumbering !== false;
    this.tabIndentCheckbox.checked = settings.enableTabIndent !== false;
    this.shortcutModSelect.value = settings.shortcutModifier || 'Alt';
    this.fontFamilySelect.value = settings.fontFamily;
    this.lineHeightInput.value = settings.lineHeight || 1.55;
    this.lineHeightVal.textContent = Number(settings.lineHeight || 1.55).toFixed(2);

    this.detailedHeadTableBody.innerHTML = '';
    const formatOptions = [
      { value: 'roman', label: 'Ⅰ. Ⅱ. Ⅲ.' },
      { value: 'number_dot', label: '1. 2. 3.' },
      { value: 'number_paren_right', label: '1) 2) 3)' },
      { value: 'number_paren_both', label: '(1) (2) (3)' },
      { value: 'hangul_dot', label: '가. 나. 다.' },
      { value: 'hangul_paren_right', label: '가) 나) 다)' },
      { value: 'hangul_paren_both', label: '(가) (나) (다)' },
      { value: 'circled_number', label: '① ② ③' },
      { value: 'bullet', label: '• 기호' },
      { value: 'dash', label: '- 대시' },
      { value: 'none', label: '없음' }
    ];

    presets.slice(0, maxLevels).forEach((p) => {
      const tr = document.createElement('tr');

      const tdName = document.createElement('td');
      tdName.innerHTML = `<strong>헤드 ${p.level}</strong>`;
      tr.appendChild(tdName);

      const tdColor = document.createElement('td');
      const colorIn = document.createElement('input');
      colorIn.type = 'color';
      colorIn.className = 'table-color-swatch';
      colorIn.value = p.color;
      colorIn.addEventListener('input', () => {
        p.color = colorIn.value;
        this.storage.saveWorkspace();
        this.renderBottomDock();
        this.editor.refreshNumbersAndStyles();
      });
      tdColor.appendChild(colorIn);
      tr.appendChild(tdColor);

      const tdFormat = document.createElement('td');
      const fmtSelect = document.createElement('select');
      fmtSelect.className = 'apple-select sm';
      formatOptions.forEach((opt) => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (opt.value === p.format) o.selected = true;
        fmtSelect.appendChild(o);
      });
      fmtSelect.addEventListener('change', () => {
        p.format = fmtSelect.value;
        this.storage.saveWorkspace();
        this.renderBottomDock();
        this.editor.render();
      });
      tdFormat.appendChild(fmtSelect);
      tr.appendChild(tdFormat);

      const tdIndent = document.createElement('td');
      const indentInput = document.createElement('input');
      indentInput.type = 'number';
      indentInput.min = '0';
      indentInput.max = '160';
      indentInput.step = '2';
      indentInput.className = 'apple-num-input';
      indentInput.value = p.indent;
      indentInput.addEventListener('input', () => {
        p.indent = Math.max(0, Number(indentInput.value) || 0);
        this.storage.saveWorkspace();
        this.editor.refreshNumbersAndStyles();
      });
      tdIndent.appendChild(indentInput);
      tr.appendChild(tdIndent);

      const tdBold = document.createElement('td');
      const boldCheck = document.createElement('input');
      boldCheck.type = 'checkbox';
      boldCheck.className = 'apple-switch sm';
      boldCheck.checked = p.fontWeight >= 700;
      boldCheck.addEventListener('change', () => {
        p.fontWeight = boldCheck.checked ? 700 : 500;
        this.storage.saveWorkspace();
        this.editor.refreshNumbersAndStyles();
      });
      tdBold.appendChild(boldCheck);
      tr.appendChild(tdBold);

      this.detailedHeadTableBody.appendChild(tr);
    });
  }

  // --- 계정 모달 ---

  openAuthModal() {
    this.populateAuthModal();
    this.authModal.classList.remove('is-hidden');
  }

  closeAuthModal() {
    this.authModal.classList.add('is-hidden');
  }

  populateAuthModal() {
    const user = this.storage.currentUser;
    this.currentAccountCard.innerHTML = `
      <div class="account-badge-lg">${this.escapeHTML((user.displayName || '학')[0].toUpperCase())}</div>
      <div class="account-info">
        <div class="account-name">${this.escapeHTML(user.displayName)}</div>
        <div class="account-email">${this.escapeHTML(user.email)}</div>
      </div>
      <span class="account-status-pill">활성</span>
    `;

    const users = this.storage.getSavedUsersList();
    this.savedProfilesList.innerHTML = '';
    users.forEach((u) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'saved-profile-item';
      if (u.uid === user.uid) btn.classList.add('is-current');
      btn.innerHTML = `
        <span class="sp-avatar">${this.escapeHTML((u.displayName || 'U')[0].toUpperCase())}</span>
        <span class="sp-meta">
          <strong>${this.escapeHTML(u.displayName)}</strong>
          <small>${this.escapeHTML(u.email)}</small>
        </span>
        <span class="sp-action">${u.uid === user.uid ? '사용 중' : '전환'}</span>
      `;
      btn.addEventListener('click', () => {
        if (u.uid !== user.uid) {
          this.storage.switchToUserByUid(u.uid);
          this.renderAll();
          this.populateAuthModal();
          this.closeAuthModal();
          if (!this.storage.hasSeenOnboardingGuide(this.storage.currentUser.uid)) {
            setTimeout(() => this.startInteractiveGuide(0), 120);
          }
        }
      });
      this.savedProfilesList.appendChild(btn);
    });
  }

  escapeHTML(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.outlineApp = new App();
});
