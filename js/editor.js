// js/editor.js
// 목차 블록 에디터: 줄 단위 편집, Enter 줄바꿈, Alt+1~7 단축키 위계 변경, 내어쓰기(Hanging Indent), 위계 숨기기 필터

import { computeAutoNumbers, detectPrefixAndLevel } from './hierarchy.js';

export class OutlineEditor {
  constructor({
    containerEl,
    titleInputEl,
    getDocument,
    getPresets,
    getSettings,
    onChange,
    onActiveLevelChange
  }) {
    this.containerEl = containerEl;
    this.titleInputEl = titleInputEl;
    this.getDocument = getDocument;
    this.getPresets = getPresets;
    this.getSettings = getSettings;
    this.onChange = onChange || (() => {});
    this.onActiveLevelChange = onActiveLevelChange || (() => {});

    this.maxVisibleLevel = 7; // 현재 표시할 최대 위계 단계 (전체 보기 상태면 maxHeadLevels와 동기화)
    this.isShowingAllLevels = true;
    this.activeItemId = null;

    this.bindTitleEvents();
  }

  getMaxHeadLevels() {
    const settings = this.getSettings();
    return Math.min(7, Math.max(5, Number(settings.maxHeadLevels) || 5));
  }

  bindTitleEvents() {
    if (!this.titleInputEl) return;
    this.titleInputEl.addEventListener('input', () => {
      const doc = this.getDocument();
      if (!doc) return;
      doc.title = this.titleInputEl.value;
      doc.updatedAt = new Date().toISOString();
      this.onChange('title');
    });

    this.titleInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault();
        const doc = this.getDocument();
        if (doc && doc.items.length > 0) {
          this.focusItem(doc.items[0].id, false);
        }
      }
    });
  }

  setMaxVisibleLevel(level) {
    const maxAllowed = this.getMaxHeadLevels();
    const clamped = Math.min(maxAllowed, Math.max(1, Number(level) || maxAllowed));
    this.maxVisibleLevel = clamped;
    this.isShowingAllLevels = clamped >= maxAllowed;
    this.render();
  }

  syncMaxVisibleWithSettings() {
    const maxAllowed = this.getMaxHeadLevels();
    if (this.isShowingAllLevels || this.maxVisibleLevel > maxAllowed) {
      this.maxVisibleLevel = maxAllowed;
      this.isShowingAllLevels = true;
    }
  }

  getActiveLevel() {
    const doc = this.getDocument();
    if (!doc) return 1;
    const item = doc.items.find((it) => it.id === this.activeItemId) || doc.items[0];
    return item ? item.level : 1;
  }

  /**
   * 특정 아이템이 상위 접기(collapsed) 또는 전역 위계 필터(maxVisibleLevel)에 의해 숨겨지는지 계산
   */
  computeVisibility(items) {
    const visibility = new Map();
    const hasChildren = new Map();
    let collapsedAboveLevel = null;

    for (let i = 0; i < items.length; i++) {
      const current = items[i];
      const next = items[i + 1];
      hasChildren.set(current.id, Boolean(next && next.level > current.level));

      if (collapsedAboveLevel !== null) {
        if (current.level > collapsedAboveLevel) {
          visibility.set(current.id, false);
          continue;
        } else {
          collapsedAboveLevel = null;
        }
      }

      if (current.level > this.maxVisibleLevel) {
        visibility.set(current.id, false);
        continue;
      }

      visibility.set(current.id, true);

      if (current.collapsed) {
        collapsedAboveLevel = current.level;
      }
    }

    return { visibility, hasChildren };
  }

  /**
   * 2단 컬럼에서 왼쪽 단부터 아래로 쭉 채워진 뒤 오른쪽 단으로 넘어가도록 높이 보정
   */
  adjustColumnFlowHeight() {
    const settings = this.getSettings();
    const cols = Number(settings.columns) || 2;
    if (cols <= 1) {
      this.containerEl.style.height = 'auto';
      this.containerEl.style.columnFill = 'auto';
      return;
    }

    // 기본 A4 1페이지 본문 높이(약 910px = 240mm)를 기준으로 왼쪽 단부터 채움
    const baseHeightPx = 910;
    this.containerEl.style.columnFill = 'auto';
    this.containerEl.style.height = `${baseHeightPx}px`;

    // 만약 작성한 내용이 2단을 모두 채우고 넘쳐서 3번째 가로 컬럼이 생기려 하면 높이를 늘려 2단 내에 유지
    if (this.containerEl.scrollWidth > this.containerEl.clientWidth + 16) {
      let currentH = baseHeightPx;
      while (
        this.containerEl.scrollWidth > this.containerEl.clientWidth + 16 &&
        currentH < 10000
      ) {
        currentH += 450;
        this.containerEl.style.height = `${currentH}px`;
      }
    }
  }

  /**
   * 전체 문서 렌더링
   */
  render(focusTarget = null) {
    const doc = this.getDocument();
    if (!doc) return;

    this.syncMaxVisibleWithSettings();
    const presets = this.getPresets();
    const settings = this.getSettings();

    if (this.titleInputEl && document.activeElement !== this.titleInputEl) {
      this.titleInputEl.value = doc.title || '';
    }

    // 페이지 다단 및 글꼴 설정 반영 (column-fill: auto로 왼쪽 단 아래로 먼저 써지게 함)
    this.containerEl.style.columnCount = settings.columns || 2;
    this.containerEl.style.columnFill = 'auto';
    this.containerEl.style.columnRule =
      (settings.columns || 2) > 1 && settings.showColumnRule !== false
        ? '1px solid #8c8c8c'
        : 'none';
    this.containerEl.style.fontFamily = settings.fontFamily;
    this.containerEl.style.lineHeight = settings.lineHeight || 1.55;

    const numberedItems = computeAutoNumbers(doc.items, presets, settings.autoNumbering);
    const { visibility, hasChildren } = this.computeVisibility(numberedItems);

    this.containerEl.innerHTML = '';

    numberedItems.forEach((item) => {
      const isVisible = visibility.get(item.id);
      const preset = presets.find((p) => p.level === item.level) || presets[0];

      const row = document.createElement('div');
      row.className = `outline-row level-${item.level}`;
      if (!isVisible) row.classList.add('is-hidden');
      if (item.id === this.activeItemId) row.classList.add('is-active');
      row.dataset.id = item.id;
      row.dataset.level = item.level;

      row.style.paddingLeft = `${preset.indent}px`;
      row.style.color = preset.color;
      row.style.fontSize = `${preset.fontSize}pt`;
      row.style.fontWeight = preset.fontWeight;
      row.style.marginTop = `${preset.marginTop || 2}px`;
      row.style.marginBottom = `${preset.marginBottom || 2}px`;

      // 개별 접기/펼치기 토글 아이콘
      const foldBtn = document.createElement('button');
      foldBtn.type = 'button';
      foldBtn.className = 'row-fold-btn';
      foldBtn.tabIndex = -1;
      if (hasChildren.get(item.id)) {
        foldBtn.classList.add('has-children');
        if (item.collapsed) foldBtn.classList.add('is-collapsed');
        foldBtn.title = item.collapsed ? '하위 목차 펼치기' : '하위 목차 접기';
        foldBtn.textContent = item.collapsed ? '▸' : '▾';
        foldBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleItemCollapse(item.id);
        });
      }
      row.appendChild(foldBtn);

      // 자동 번호 접두사
      if (settings.autoNumbering && item.prefix) {
        const prefixEl = document.createElement('span');
        prefixEl.className = 'outline-prefix';
        prefixEl.textContent = item.prefix;
        prefixEl.addEventListener('mousedown', (e) => {
          e.preventDefault();
          this.focusItem(item.id, false);
        });
        row.appendChild(prefixEl);
      }

      // 본문 텍스트 입력 영역
      const textEl = document.createElement('div');
      textEl.className = 'outline-text';
      textEl.contentEditable = 'true';
      textEl.spellcheck = false;
      textEl.dataset.placeholder = this.getPlaceholderByLevel(item.level);
      textEl.textContent = item.text || '';

      this.bindRowEvents(textEl, item.id);
      row.appendChild(textEl);

      if (item.collapsed && hasChildren.get(item.id)) {
        const badge = document.createElement('span');
        badge.className = 'collapsed-badge';
        badge.textContent = '하위 접힘';
        badge.title = '클릭하여 하위 항목 펼치기';
        badge.addEventListener('click', () => this.toggleItemCollapse(item.id));
        row.appendChild(badge);
      }

      this.containerEl.appendChild(row);
    });

    this.adjustColumnFlowHeight();

    if (focusTarget) {
      this.focusItem(focusTarget.id, focusTarget.toEnd, focusTarget.offset);
    }
  }

  getPlaceholderByLevel(level) {
    const map = {
      1: '대단원 제목',
      2: '중단원 제목',
      3: '소단원 주제',
      4: '세부 항목',
      5: '내용 입력',
      6: '하위 내용',
      7: '보조 내용'
    };
    return map[level] || '내용 입력';
  }

  /**
   * 번호와 스타일만 빠르게 부분 갱신
   */
  refreshNumbersAndStyles() {
    const doc = this.getDocument();
    if (!doc) return;
    const presets = this.getPresets();
    const settings = this.getSettings();
    const numberedItems = computeAutoNumbers(doc.items, presets, settings.autoNumbering);
    const { visibility, hasChildren } = this.computeVisibility(numberedItems);

    numberedItems.forEach((item) => {
      const row = this.containerEl.querySelector(`.outline-row[data-id="${item.id}"]`);
      if (!row) return;
      const preset = presets.find((p) => p.level === item.level) || presets[0];

      row.className = `outline-row level-${item.level}`;
      if (!visibility.get(item.id)) row.classList.add('is-hidden');
      if (item.id === this.activeItemId) row.classList.add('is-active');
      row.dataset.level = item.level;

      row.style.paddingLeft = `${preset.indent}px`;
      row.style.color = preset.color;
      row.style.fontSize = `${preset.fontSize}pt`;
      row.style.fontWeight = preset.fontWeight;
      row.style.marginTop = `${preset.marginTop || 2}px`;
      row.style.marginBottom = `${preset.marginBottom || 2}px`;

      let prefixEl = row.querySelector('.outline-prefix');
      if (settings.autoNumbering && item.prefix) {
        if (!prefixEl) {
          prefixEl = document.createElement('span');
          prefixEl.className = 'outline-prefix';
          row.insertBefore(prefixEl, row.querySelector('.outline-text'));
        }
        prefixEl.textContent = item.prefix;
      } else if (prefixEl) {
        prefixEl.remove();
      }

      const textEl = row.querySelector('.outline-text');
      if (textEl) {
        textEl.dataset.placeholder = this.getPlaceholderByLevel(item.level);
      }

      const foldBtn = row.querySelector('.row-fold-btn');
      if (foldBtn) {
        if (hasChildren.get(item.id)) {
          foldBtn.classList.add('has-children');
          foldBtn.textContent = item.collapsed ? '▸' : '▾';
        } else {
          foldBtn.classList.remove('has-children');
          foldBtn.textContent = '';
        }
      }
    });

    this.adjustColumnFlowHeight();
  }

  bindRowEvents(textEl, itemId) {
    textEl.addEventListener('focus', () => {
      this.activeItemId = itemId;
      this.containerEl.querySelectorAll('.outline-row.is-active').forEach((el) => {
        el.classList.remove('is-active');
      });
      const row = textEl.closest('.outline-row');
      if (row) row.classList.add('is-active');

      const doc = this.getDocument();
      const item = doc?.items.find((it) => it.id === itemId);
      if (item) {
        this.onActiveLevelChange(item.level);
      }
    });

    textEl.addEventListener('input', () => {
      const doc = this.getDocument();
      if (!doc) return;
      const item = doc.items.find((it) => it.id === itemId);
      if (!item) return;

      item.text = textEl.textContent || '';
      doc.updatedAt = new Date().toISOString();
      this.adjustColumnFlowHeight();
      this.onChange('input');
    });

    textEl.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text/plain');
      if (!pasted) return;

      const lines = pasted
        .split(/\r?\n/)
        .map((l) => l.trimEnd())
        .filter((l, idx, arr) => arr.length === 1 || l.trim().length > 0);

      if (lines.length <= 1) {
        document.execCommand('insertText', false, lines[0] || '');
        return;
      }

      const doc = this.getDocument();
      const idx = doc.items.findIndex((it) => it.id === itemId);
      if (idx === -1) return;

      const maxAllowed = this.getMaxHeadLevels();
      const currentItem = doc.items[idx];
      const firstLineParsed = detectPrefixAndLevel(lines[0]);
      if (firstLineParsed) {
        currentItem.level = Math.min(maxAllowed, firstLineParsed.level);
        currentItem.text = firstLineParsed.text;
      } else {
        currentItem.text = (currentItem.text || '') + lines[0];
      }

      const newItems = [];
      for (let i = 1; i < lines.length; i++) {
        const parsed = detectPrefixAndLevel(lines[i]);
        newItems.push({
          id: `item_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 5)}`,
          level: parsed ? Math.min(maxAllowed, parsed.level) : currentItem.level,
          text: parsed ? parsed.text : lines[i].trim(),
          collapsed: false
        });
      }

      doc.items.splice(idx + 1, 0, ...newItems);
      doc.updatedAt = new Date().toISOString();
      const lastId = newItems[newItems.length - 1].id;
      this.render({ id: lastId, toEnd: true });
      this.onChange('paste');
    });

    textEl.addEventListener('keydown', (e) => {
      this.handleKeyDown(e, itemId, textEl);
    });
  }

  handleKeyDown(e, itemId, textEl) {
    const doc = this.getDocument();
    if (!doc) return;
    const settings = this.getSettings();
    const maxAllowed = this.getMaxHeadLevels();
    const idx = doc.items.findIndex((it) => it.id === itemId);
    if (idx === -1) return;
    const item = doc.items[idx];

    // 1. 위계 단축키: Alt + 1 ~ 7 (현재 활성화된 최대 위계 단계까지)
    const digitMatch = e.code ? e.code.match(/^(?:Digit|Numpad)([1-7])$/) : null;
    const keyNum = digitMatch ? Number(digitMatch[1]) : /^[1-7]$/.test(e.key) ? Number(e.key) : null;

    const isModifierPressed =
      (settings.shortcutModifier === 'Alt' && e.altKey && !e.ctrlKey) ||
      (settings.shortcutModifier === 'CtrlShift' && e.ctrlKey && e.shiftKey) ||
      (e.altKey && !e.ctrlKey);

    if (keyNum && keyNum <= maxAllowed && isModifierPressed) {
      e.preventDefault();
      e.stopPropagation();
      this.changeItemLevel(itemId, keyNum);
      return;
    }

    // 2. Tab / Shift+Tab 으로 위계 순환 변경 (1 -> 2 -> ... -> maxAllowed -> 1 반복)
    if (e.key === 'Tab' && settings.enableTabIndent !== false) {
      e.preventDefault();
      const nextLevel = e.shiftKey
        ? item.level <= 1
          ? maxAllowed
          : item.level - 1
        : item.level >= maxAllowed
          ? 1
          : item.level + 1;
      this.changeItemLevel(itemId, nextLevel);
      return;
    }

    // 3. Enter: 바로 아래 줄에 새 목차 블록 생성
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const caretOffset = this.getCaretOffset(textEl);
      const fullText = textEl.textContent || '';
      const beforeText = fullText.slice(0, caretOffset);
      const afterText = fullText.slice(caretOffset);

      item.text = beforeText;

      const newLevel = Math.min(this.maxVisibleLevel, item.level);
      const newItem = {
        id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        level: newLevel,
        text: afterText,
        collapsed: false
      };

      doc.items.splice(idx + 1, 0, newItem);
      doc.updatedAt = new Date().toISOString();
      this.render({ id: newItem.id, toEnd: false, offset: 0 });
      this.onActiveLevelChange(newItem.level);
      this.onChange('enter');
      return;
    }

    // 4. Backspace: 줄 맨 앞에서 누를 때 줄 삭제 또는 이전 줄과 병합
    if (e.key === 'Backspace') {
      const sel = window.getSelection();
      const isCollapsed = sel && sel.isCollapsed;
      const caretOffset = this.getCaretOffset(textEl);

      if (isCollapsed && caretOffset === 0) {
        e.preventDefault();
        const fullText = textEl.textContent || '';

        if (fullText.length === 0 && doc.items.length > 1) {
          const prevVisible = this.findAdjacentVisibleItem(idx, -1);
          doc.items.splice(idx, 1);
          doc.updatedAt = new Date().toISOString();
          const targetId = prevVisible ? prevVisible.id : doc.items[0].id;
          this.render({ id: targetId, toEnd: true });
          this.onChange('delete-line');
          return;
        }

        const prevVisible = this.findAdjacentVisibleItem(idx, -1);
        if (prevVisible) {
          const prevLen = (prevVisible.text || '').length;
          prevVisible.text = (prevVisible.text || '') + fullText;
          doc.items.splice(idx, 1);
          doc.updatedAt = new Date().toISOString();
          this.render({ id: prevVisible.id, toEnd: false, offset: prevLen });
          this.onChange('merge-line');
        }
        return;
      }
    }

    // 5. 위/아래 방향키로 줄 간 이동
    if (e.key === 'ArrowUp') {
      const prevVisible = this.findAdjacentVisibleItem(idx, -1);
      if (prevVisible) {
        e.preventDefault();
        const offset = this.getCaretOffset(textEl);
        this.focusItem(prevVisible.id, false, offset);
      } else if (this.titleInputEl) {
        e.preventDefault();
        this.titleInputEl.focus();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      const nextVisible = this.findAdjacentVisibleItem(idx, 1);
      if (nextVisible) {
        e.preventDefault();
        const offset = this.getCaretOffset(textEl);
        this.focusItem(nextVisible.id, false, offset);
      }
      return;
    }
  }

  findAdjacentVisibleItem(currentIndex, direction) {
    const doc = this.getDocument();
    if (!doc) return null;
    const { visibility } = this.computeVisibility(doc.items);
    let i = currentIndex + direction;
    while (i >= 0 && i < doc.items.length) {
      if (visibility.get(doc.items[i].id)) {
        return doc.items[i];
      }
      i += direction;
    }
    return null;
  }

  changeItemLevel(itemId, newLevel) {
    const doc = this.getDocument();
    if (!doc) return;
    const item = doc.items.find((it) => it.id === itemId);
    if (!item) return;

    const maxAllowed = this.getMaxHeadLevels();
    const clamped = Math.min(maxAllowed, Math.max(1, Number(newLevel) || 1));
    item.level = clamped;

    if (clamped > this.maxVisibleLevel) {
      this.maxVisibleLevel = clamped;
      this.isShowingAllLevels = clamped >= maxAllowed;
    }

    doc.updatedAt = new Date().toISOString();
    this.refreshNumbersAndStyles();
    this.onActiveLevelChange(clamped);
    this.onChange('level');
  }

  changeActiveItemLevel(newLevel) {
    const doc = this.getDocument();
    if (!doc) return;
    const targetId = this.activeItemId || doc.items[0]?.id;
    if (!targetId) return;
    this.changeItemLevel(targetId, newLevel);
    this.focusItem(targetId, true);
  }

  toggleItemCollapse(itemId) {
    const doc = this.getDocument();
    if (!doc) return;
    const item = doc.items.find((it) => it.id === itemId);
    if (!item) return;
    item.collapsed = !item.collapsed;
    this.render();
    this.onChange('collapse');
  }

  getCaretOffset(element) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return 0;
    const range = sel.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(element);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    return preCaretRange.toString().length;
  }

  focusItem(itemId, toEnd = true, specificOffset = null) {
    const row = this.containerEl.querySelector(`.outline-row[data-id="${itemId}"]`);
    if (!row) return;
    const textEl = row.querySelector('.outline-text');
    if (!textEl) return;

    this.activeItemId = itemId;
    textEl.focus();

    const textNode = textEl.firstChild;
    const range = document.createRange();
    const sel = window.getSelection();

    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
      const maxLen = textNode.textContent.length;
      const offset =
        specificOffset !== null ? Math.min(maxLen, Math.max(0, specificOffset)) : toEnd ? maxLen : 0;
      range.setStart(textNode, offset);
      range.collapse(true);
    } else {
      range.selectNodeContents(textEl);
      range.collapse(!toEnd);
    }

    sel.removeAllRanges();
    sel.addRange(range);
  }
}
