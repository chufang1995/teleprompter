/* ===== Teleprompter App ===== */

(function(){
  'use strict';

  // ─── State ───
  const STATE = {
    scripts: [],
    activeId: null,
    speed: 40,          // px per second
    fontSize: 32,       // px
    fontColor: '#ffffff', // text color
    mirror: false,
    countdown: false,
    hideControls: true,
    isPlaying: false,
    scrollY: 0,         // current scroll position in px
    contentHeight: 0,
    viewportHeight: 0,
    lastTimestamp: 0,
    controlTimer: null,
    controlsVisible: true,
    rafId: null,
  };

  // ─── DOM refs ───
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  const editorView = $('#editor-view');
  const prompterView = $('#prompter-view');
  const textarea = $('#editor-textarea');
  const currentScriptName = $('#current-script-name');
  const btnManage = $('#btn-manage');
  const manageModal = $('#manage-modal');
  const manageClose = $('#manage-close');
  const manageList = $('#manage-list');
  const btnManageNew = $('#btn-manage-new');
  const editorBody = document.querySelector('.editor-body');
  const btnStart = $('#btn-start');
  const btnBack = $('#btn-back');
  const btnPlay = $('#btn-play');
  const btnRewind = $('#btn-rewind');
  const btnForward = $('#btn-forward');
  const btnHelp = $('#btn-help');
  const btnSettings = $('#btn-control-settings');
  const helpModal = $('#help-modal');
  const helpClose = $('#help-close');

  const prompterText = $('#prompter-text');
  const mirrorWrap = $('#mirror-wrap');
  const prompterSpeedSlider = $('#prompter-speed-slider');
  const speedValue = $('#speed-value');
  const seekSlider = $('#seek-slider');
  const progressText = $('#progress-text');
  const countdownOverlay = $('#countdown-overlay');
  const countdownNumber = $('#countdown-number');
  const gestureHint = $('#gesture-hint');
  const controlTitle = $('#control-title');
  const prompterControls = $('#prompter-controls');

  const speedSlider = $('#speed-slider');
  const chkMirror = $('#chk-mirror');
  const chkCountdown = $('#chk-countdown');
  const chkHideControls = $('#chk-hide-controls');
  const btnSpeeds = $$('.btn-speed');
  const btnFonts = $$('.btn-font');
  const colorSwatches = $$('.color-swatch');
  const colorPicker = $('#font-color-picker');
  const prompterFontBtns = $$('.btn-ctrl-font');
  const prompterColorSwatches = $$('.color-swatch-sm');
  const fontSlider = $('#font-slider');
  const prompterFontSlider = $('#font-slider-prompter');
  const fontValueEditor = $('#font-value-editor');
  const fontValuePrompter = $('#font-value-prompter');

  let touchStartY = 0;
  let touchStartScrollY = 0;
  let isTouching = false;
  let totalTouchDelta = 0;
  let wasDrag = false;
  let wakeLock = null;

  // ─── Storage ───
  function loadState() {
    try {
      const raw = localStorage.getItem('teleprompter_state');
      if (raw) {
        const saved = JSON.parse(raw);
        Object.assign(STATE, saved);
      }
    } catch(e) {}
    if (!STATE.scripts || STATE.scripts.length === 0) {
      STATE.scripts = [{ id: 'default', title: '文稿 1', content: '', updatedAt: Date.now() }];
      STATE.activeId = 'default';
      saveState();
    }
    STATE.scripts.forEach(function(s) { if (!s.updatedAt) s.updatedAt = Date.now(); });
    if (!STATE.activeId || !STATE.scripts.find(s => s.id === STATE.activeId)) {
      STATE.activeId = STATE.scripts[0].id;
    }
  }

  function saveState() {
    try {
      localStorage.setItem('teleprompter_state', JSON.stringify(STATE));
    } catch(e) {}
  }

  // ─── Script Management ───
  function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

  function getActiveScript() {
    return STATE.scripts.find(s => s.id === STATE.activeId);
  }

  function updateCurrentScriptName() {
    var cur = getActiveScript();
    currentScriptName.textContent = cur ? cur.title : '文稿';
  }

  function openManageModal() {
    var cur = getActiveScript();
    if (cur) cur.content = textarea.value;
    saveState();
    renderManagementList();
    manageModal.classList.add('active');
  }

  function closeManageModal() {
    manageModal.classList.remove('active');
  }

  function renderManagementList() {
    manageList.innerHTML = '';
    var cur = getActiveScript();
    STATE.scripts.forEach(function(s) {
      var isCurrent = s.id === STATE.activeId;
      var preview = s.content ? s.content.replace(/\n/g, ' ').substring(0, 60) : '(空文稿)';
      if (preview.length >= 60) preview += '…';
      var date = '';
      if (s.updatedAt) {
        var d = new Date(s.updatedAt);
        date = (d.getMonth()+1) + '/' + d.getDate() + ' ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2,'0');
      }
      var item = document.createElement('div');
      item.className = 'manage-item' + (isCurrent ? ' current' : '');
      item.dataset.id = s.id;
      var safeTitle = s.title.replace(/"/g, '&quot;');
      var safePreview = preview.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      item.innerHTML =
        '<div class="manage-item-info">' +
          '<div class="manage-item-title-row">' +
            '<input class="manage-item-title" value="' + safeTitle + '" readonly>' +
            '<button class="manage-item-rename" data-id="' + s.id + '">✎</button>' +
            '<span class="manage-item-date">' + date + '</span>' +
          '</div>' +
          '<div class="manage-item-preview">' + safePreview + '</div>' +
        '</div>' +
        '<button class="manage-btn-del" data-id="' + s.id + '">✕</button>';
      // Select script on tap
      item.querySelector('.manage-item-info').addEventListener('click', function(e) {
        if (e.target.closest('.manage-item-rename') || e.target.closest('.manage-item-title')) return;
        var cur2 = getActiveScript();
        if (cur2) cur2.content = textarea.value;
        switchScript(s.id);
        closeManageModal();
      });
      // Rename button
      item.querySelector('.manage-item-rename').addEventListener('click', function(e) {
        e.stopPropagation();
        var inp = item.querySelector('.manage-item-title');
        inp.removeAttribute('readonly'); inp.focus(); inp.select();
      });
      // Save title on blur/enter
      item.querySelector('.manage-item-title').addEventListener('blur', function() {
        var val = this.value.trim();
        if (val) { renameScript(s.id, val); this.value = val; }
        else { this.value = s.title; }
        this.setAttribute('readonly', '');
      });
      item.querySelector('.manage-item-title').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') this.blur();
      });
      // Delete button
      item.querySelector('.manage-btn-del').addEventListener('click', function(e) {
        e.stopPropagation();
        if (STATE.scripts.length <= 1) return;
        if (!confirm('确定删除「' + s.title + '」？')) return;
        deleteScript(s.id);
        renderManagementList();
      });
      manageList.appendChild(item);
    });
  }

  function switchScript(id) {
    var cur = getActiveScript();
    if (cur) cur.content = textarea.value;
    STATE.activeId = id;
    var next = getActiveScript();
    textarea.value = next ? next.content : '';
    updateCurrentScriptName();
    saveState();
  }

  function addScript() {
    var cur = getActiveScript();
    if (cur) cur.content = textarea.value;
    var count = STATE.scripts.length + 1;
    var id = genId();
    STATE.scripts.push({ id: id, title: '文稿 ' + count, content: '', updatedAt: Date.now() });
    STATE.activeId = id;
    textarea.value = '';
    updateCurrentScriptName();
    saveState();
  }

  function renameScript(id, title) {
    var s = STATE.scripts.find(function(x) { return x.id === id; });
    if (s) { s.title = title; updateCurrentScriptName(); saveState(); }
  }

  function deleteScript(id) {
    if (STATE.scripts.length <= 1) return;
    STATE.scripts = STATE.scripts.filter(function(s) { return s.id !== id; });
    if (STATE.activeId === id) {
      STATE.activeId = STATE.scripts[0].id;
      var next = getActiveScript();
      if (next) textarea.value = next.content;
    }
    updateCurrentScriptName();
    saveState();
  }

  // ─── Speed & Font helpers ───
  function setSpeed(val) {
    STATE.speed = Math.max(5, Math.min(100, Math.round(val)));
    speedSlider.value = STATE.speed;
    prompterSpeedSlider.value = STATE.speed;
    speedValue.textContent = STATE.speed;
    // Update preset buttons
    btnSpeeds.forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.speed) === STATE.speed);
    });
    saveState();
  }

  function setFontSize(size) {
    STATE.fontSize = size;
    // Dynamic style injection — always wins, real-time
    var el = document.getElementById('fs-dynamic');
    if (!el) { el = document.createElement('style'); el.id = 'fs-dynamic'; document.head.appendChild(el); }
    el.textContent = '#prompter-text{font-size:' + size + 'px!important}';

    // Update buttons (no spread to avoid mobile compat issues)
    [].forEach.call(btnFonts, function(b) { b.classList.toggle('active', parseInt(b.dataset.size) === size); });
    [].forEach.call(prompterFontBtns, function(b) { b.classList.toggle('active', parseInt(b.dataset.size) === size); });

    // Update sliders
    try { fontSlider.value = size; } catch(e) {}
    try { prompterFontSlider.value = size; } catch(e) {}
    try { fontValueEditor.textContent = size + 'px'; } catch(e) {}
    try { fontValuePrompter.textContent = size; } catch(e) {}

    // Recalculate layout if prompter is active
    if (prompterView && prompterView.classList.contains('active')) {
      measureContent();
      applyScroll();
    }
    saveState();
  }

  function setFontColor(color) {
    STATE.fontColor = color;
    prompterText.style.color = color;
    // Update all swatch buttons (editor + prompter)
    document.querySelectorAll('.color-swatch, .color-swatch-sm').forEach(b => {
      b.classList.toggle('active', b.dataset.color === color);
    });
    colorPicker.value = color;
    saveState();
  }

  // ─── Prompter Engine ───
  function startPrompter() {
    // Save editor content
    const current = getActiveScript();
    if (current) current.content = textarea.value;
    saveState();

    // Prepare text
    const text = current ? current.content : textarea.value;
    if (!text.trim()) {
      // Auto-fill placeholder
      prompterText.textContent = '请先在编辑界面输入文稿';
      return;
    }
    prompterText.textContent = text;
    controlTitle.textContent = current ? current.title : '文稿';

    // Apply mirror
    mirrorWrap.classList.toggle('mirror-active', STATE.mirror);

    // Switch view
    editorView.classList.remove('active');
    prompterView.classList.add('active');

    // Reset state
    STATE.scrollY = 0;
    STATE.isPlaying = false;
    STATE.controlsVisible = true;
    prompterControls.classList.remove('hidden');
    btnPlay.textContent = '▶';
    prompterText.style.transform = 'translateY(0px)';
    seekSlider.value = 0;
    seekSlider.style.background = 'linear-gradient(to right, #4a9eff 0%, #333 0%)';
    progressText.textContent = '0%';

    // Show gesture hint briefly
    gestureHint.classList.add('show');
    setTimeout(() => gestureHint.classList.remove('show'), 4000);

    // Measure
    measureContent();

    // Start countdown if enabled
    if (STATE.countdown) {
      startCountdown();
    } else {
      startPlaying();
    }
  }

  function measureContent() {
    // Force layout to measure
    STATE.contentHeight = prompterText.scrollHeight;
    STATE.viewportHeight = prompterText.parentElement.clientHeight;
  }

  function startCountdown() {
    countdownOverlay.classList.add('active');
    let count = 3;
    countdownNumber.textContent = count;
    countdownNumber.style.animation = 'none';
    setTimeout(() => countdownNumber.style.animation = '', 10);

    const interval = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(interval);
        countdownOverlay.classList.remove('active');
        startPlaying();
        return;
      }
      countdownNumber.textContent = count;
      countdownNumber.style.animation = 'none';
      setTimeout(() => countdownNumber.style.animation = '', 10);
    }, 1000);
  }

  function startPlaying() {
    STATE.isPlaying = true;
    btnPlay.textContent = '⏸';
    acquireWakeLock();
    STATE.lastTimestamp = performance.now();
    if (STATE.rafId) cancelAnimationFrame(STATE.rafId);
    tick();
    // Hide controls immediately when playing starts
    if (STATE.hideControls) {
      prompterControls.classList.add('hidden');
      STATE.controlsVisible = false;
    }
  }

  function tick() {
    if (!STATE.isPlaying) return;
    const now = performance.now();
    const dt = (now - STATE.lastTimestamp) / 1000;
    STATE.lastTimestamp = now;
    const pixelsToMove = STATE.speed * dt;
    STATE.scrollY += pixelsToMove;
    applyScroll();
    STATE.rafId = requestAnimationFrame(tick);
  }

  function applyScroll() {
    // We scroll text upward: negative translateY
    const maxScroll = Math.max(0, STATE.contentHeight - STATE.viewportHeight);
    if (STATE.scrollY >= maxScroll) {
      STATE.scrollY = maxScroll;
      STATE.isPlaying = false;
      btnPlay.textContent = '▶';
      if (STATE.rafId) cancelAnimationFrame(STATE.rafId);
      showControls();
    }
    const y = -STATE.scrollY;
    prompterText.style.transform = `translateY(${y}px)`;

    // Update progress
    const progress = maxScroll > 0 ? (STATE.scrollY / maxScroll) : 0;
    var pct = Math.min(100, Math.round(progress * 100));
    seekSlider.value = Math.round(progress * 1000);
    seekSlider.style.background = 'linear-gradient(to right, #4a9eff ' + pct + '%, #333 ' + pct + '%)';
    progressText.textContent = pct + '%';
  }

  function togglePlay() {
    if (!STATE.isPlaying) {
      // If at end, reset
      const maxScroll = Math.max(0, STATE.contentHeight - STATE.viewportHeight);
      if (STATE.scrollY >= maxScroll) {
        STATE.scrollY = 0;
        applyScroll();
      }
      startPlaying();
    } else {
      STATE.isPlaying = false;
      btnPlay.textContent = '▶';
      if (STATE.rafId) cancelAnimationFrame(STATE.rafId);
      showControls();
    }
  }

  async function acquireWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch(e) { /* wake lock not supported */ }
  }

  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release(); wakeLock = null; }
  }

  function stopPrompter() {
    STATE.isPlaying = false;
    if (STATE.rafId) cancelAnimationFrame(STATE.rafId);
    releaseWakeLock();
    STATE.scrollY = 0;
    prompterView.classList.remove('active');
    editorView.classList.add('active');
    // Scroll editor body to top (fixes landscape layout issue)
    if (editorBody) editorBody.scrollTop = 0;
    // Refresh textarea content in case it changed
    const current = getActiveScript();
    if (current) textarea.value = current.content;
  }

  function showControls() {
    if (STATE.controlTimer) clearTimeout(STATE.controlTimer);
    prompterControls.classList.remove('hidden');
    STATE.controlsVisible = true;
  }

  function resetControlTimer() {
    if (STATE.controlTimer) clearTimeout(STATE.controlTimer);
    if (!STATE.isPlaying) return;
    STATE.controlTimer = setTimeout(() => {
      prompterControls.classList.add('hidden');
      STATE.controlsVisible = false;
    }, 3000);
  }

  function toggleControls() {
    if (STATE.controlsVisible) {
      prompterControls.classList.add('hidden');
      STATE.controlsVisible = false;
    } else {
      prompterControls.classList.remove('hidden');
      STATE.controlsVisible = true;
      resetControlTimer();
    }
  }

  function rewind(amount) {
    STATE.scrollY = Math.max(0, STATE.scrollY - (amount || 50));
    applyScroll();
    if (!STATE.isPlaying) showControls();
  }

  function forward(amount) {
    const maxScroll = Math.max(0, STATE.contentHeight - STATE.viewportHeight);
    STATE.scrollY = Math.min(maxScroll, STATE.scrollY + (amount || 50));
    applyScroll();
    if (!STATE.isPlaying) showControls();
  }

  // ─── Touch drag-scroll / tap handling ───
  function onTouchStart(e) {
    if (!prompterView.classList.contains('active')) return;
    if (countdownOverlay.classList.contains('active')) return;
    const touch = e.touches[0];
    touchStartY = touch.clientY;
    touchStartScrollY = STATE.scrollY;
    isTouching = true;
    totalTouchDelta = 0;
    wasDrag = false;

    // Pause playback when user starts dragging
    if (STATE.isPlaying) {
      STATE.isPlaying = false;
      btnPlay.textContent = '\u25b6';
      if (STATE.rafId) cancelAnimationFrame(STATE.rafId);
    }
    showControls();
    if (STATE.controlTimer) clearTimeout(STATE.controlTimer);
  }

  function onTouchMove(e) {
    if (!isTouching || !prompterView.classList.contains('active')) return;
    if (countdownOverlay.classList.contains('active')) return;
    e.preventDefault();
    const touch = e.touches[0];
    const dy = touch.clientY - touchStartY; // + = drag down (rewind), - = drag up (forward)
    totalTouchDelta = Math.abs(dy);
    if (totalTouchDelta > 8) wasDrag = true;

    const maxScroll = Math.max(0, STATE.contentHeight - STATE.viewportHeight);
    const newScroll = Math.max(0, Math.min(maxScroll, touchStartScrollY - dy));
    STATE.scrollY = newScroll;
    applyScroll();
    showControls();
    if (STATE.controlTimer) clearTimeout(STATE.controlTimer);
  }

  function onTouchEnd(e) {
    if (!prompterView.classList.contains('active')) return;
    isTouching = false;
    // If it was a tap (minimal movement, not a drag), toggle controls
    if (!wasDrag) {
      toggleControls();
    }
  }

  // ─── Keyboard shortcuts (desktop) ───
  function onKeyDown(e) {
    if (prompterView.classList.contains('active')) {
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      }
      if (e.code === 'ArrowUp') {
        e.preventDefault();
        rewind(20);
      }
      if (e.code === 'ArrowDown') {
        e.preventDefault();
        forward(20);
      }
      if (e.code === 'Escape') {
        stopPrompter();
      }
    }
  }

  // ─── Init ───
  function init() {
    loadState();

    // Restore settings to UI
    setSpeed(STATE.speed);
    setFontSize(STATE.fontSize);
    setFontColor(STATE.fontColor);
    chkMirror.checked = STATE.mirror;
    chkCountdown.checked = STATE.countdown;
    chkHideControls.checked = STATE.hideControls;

    // Load active script
    const current = getActiveScript();
    if (current) textarea.value = current.content;
    updateCurrentScriptName();

    // ─── Event listeners ───

    // Script management
    btnManage.addEventListener('click', openManageModal);
    manageClose.addEventListener('click', closeManageModal);
    manageModal.addEventListener('click', function(e) {
      if (e.target === manageModal) closeManageModal();
    });
    btnManageNew.addEventListener('click', function() {
      addScript();
      renderManagementList();
    });
    // Tap on current script name also opens manage modal
    currentScriptName.addEventListener('click', openManageModal);    // Settings
    speedSlider.addEventListener('input', () => setSpeed(parseInt(speedSlider.value)));
    btnSpeeds.forEach(b => b.addEventListener('click', () => setSpeed(parseInt(b.dataset.speed))));
    btnFonts.forEach(b => b.addEventListener('click', () => setFontSize(parseInt(b.dataset.size))));
    prompterFontBtns.forEach(b => b.addEventListener('click', () => setFontSize(parseInt(b.dataset.size))));
    fontSlider.addEventListener('input', () => setFontSize(parseInt(fontSlider.value)));
    fontSlider.addEventListener('change', () => setFontSize(parseInt(fontSlider.value)));
    prompterFontSlider.addEventListener('input', () => setFontSize(parseInt(prompterFontSlider.value)));
    prompterFontSlider.addEventListener('change', () => setFontSize(parseInt(prompterFontSlider.value)));

    // Seek slider
    seekSlider.addEventListener('input', function() {
      if (!prompterView.classList.contains('active')) return;
      // Pause playback while seeking
      if (STATE.isPlaying) {
        STATE.isPlaying = false;
        btnPlay.textContent = '▶';
        if (STATE.rafId) cancelAnimationFrame(STATE.rafId);
      }
      var maxScroll = Math.max(0, STATE.contentHeight - STATE.viewportHeight);
      STATE.scrollY = maxScroll * (seekSlider.value / 1000);
      applyScroll();
      showControls();
    });

    // Color swatches (editor)
    colorSwatches.forEach(b => b.addEventListener('click', () => setFontColor(b.dataset.color)));
    // Color swatches (prompter)
    prompterColorSwatches.forEach(b => b.addEventListener('click', () => setFontColor(b.dataset.color)));
    // Custom color picker
    colorPicker.addEventListener('input', () => setFontColor(colorPicker.value));

    chkMirror.addEventListener('change', () => {
      STATE.mirror = chkMirror.checked;
      mirrorWrap.classList.toggle('mirror-active', STATE.mirror);
      saveState();
    });
    chkCountdown.addEventListener('change', () => {
      STATE.countdown = chkCountdown.checked;
      saveState();
    });
    chkHideControls.addEventListener('change', () => {
      STATE.hideControls = chkHideControls.checked;
      saveState();
    });

    // Auto-save textarea on input (debounced)
    let saveTimer = null;
    textarea.addEventListener('input', function() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(function() {
        var cur = getActiveScript();
        if (cur) { cur.content = textarea.value; cur.updatedAt = Date.now(); }
        saveState();
      }, 500);
    });

    // Start / Stop
    btnStart.addEventListener('click', startPrompter);
    btnStart.addEventListener('touchstart', startPrompter, { passive: true });
    btnBack.addEventListener('click', stopPrompter);

    // Playback controls
    btnPlay.addEventListener('click', togglePlay);
    btnRewind.addEventListener('click', () => rewind(80));
    btnForward.addEventListener('click', () => forward(80));

    // Prompter speed slider
    prompterSpeedSlider.addEventListener('input', () => {
      setSpeed(parseInt(prompterSpeedSlider.value));
      if (STATE.isPlaying) resetControlTimer();
      showControls();
    });

    // Tap on prompter viewport to toggle controls
    const viewport = $('#prompter-viewport');
    viewport.addEventListener('click', (e) => {
      if (wasDrag) { wasDrag = false; return; }
      if (e.target.closest('.prompter-controls')) return;
      if (countdownOverlay.classList.contains('active')) return;
      toggleControls();
    });

    // Touch events for speed gesture
    viewport.addEventListener('touchstart', onTouchStart, { passive: true });
    viewport.addEventListener('touchmove', onTouchMove, { passive: false });
    viewport.addEventListener('touchend', onTouchEnd);

    // Keyboard
    document.addEventListener('keydown', onKeyDown);

    // Help modal
    btnHelp.addEventListener('click', () => helpModal.classList.add('active'));
    helpClose.addEventListener('click', () => helpModal.classList.remove('active'));
    helpModal.addEventListener('click', (e) => {
      if (e.target === helpModal) helpModal.classList.remove('active');
    });

    // Settings button in prompter - go back to editor
    btnSettings.addEventListener('click', stopPrompter);

    // Handle visibility change - pause when hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && STATE.isPlaying) {
        togglePlay();
      }
    });

    // Handle resize
    window.addEventListener('resize', () => {
      if (prompterView.classList.contains('active')) {
        measureContent();
        applyScroll();
      }
    });

    console.log('📃 提词器已加载 ✓');
  }

  // Start on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
