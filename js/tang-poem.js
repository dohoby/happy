/**
 * 唐诗三百首 - 主逻辑文件
 */

// ========================
// 常量
// ========================
const POET_BG_COLORS = ['#e8f4fd','#fdf2f0','#f0f9f0','#fdf8e8','#f3f0fb','#fdf0f5','#e8f8f5','#fef3e8','#f0f4ff','#fff8e1','#e0f7fa','#fce4ec','#f1f8e9','#e8eaf6','#fff3e0','#e0f2f1'];
const TAB_NAMES = { notes: '注释', translation: '译文', analysis: '赏析' };
const VOICE_NAMES = { xiaoxiao: '女声温暖', xiaoyi: '女童活泼', yunxia: '少年可爱' };
const STATUS_ICONS = {
  success: ['fa-check-circle', '#27ae60'],
  error: ['fa-exclamation-triangle', '#c0392b'],
  speaking: ['fa-volume-up', '#8e44ad'],
  paused: ['fa-pause-circle', '#2980b9'],
  stopped: ['fa-stop-circle', '#7f8c8d']
};

// ========================
// 全局状态
// ========================
let tangPoetry = [];
let currentPoemText = '';
let isSpeaking = false;
let loopMode = false;
let listLoopMode = false;
let currentPoet = null;
let currentPoemIndex = 0;
let isAutoPlaying = false;
let showPinyin = true;
let currentTab = 'notes';
let currentPoem = null;
let playbackSpeed = parseFloat(localStorage.getItem('tangPlaybackSpeed')) || 0.75;
let volume = parseFloat(localStorage.getItem('tangVolume')) || 0.8;
let currentVoice = localStorage.getItem('tangVoice') || 'xiaoxiao';
let followMode = localStorage.getItem('tangFollowMode') === '1';
let singleLineMode = localStorage.getItem('tangSingleLineMode') !== '0';
let currentLineTimings = [];
let searchTimer = null;

// 跟读模式状态
let readMode = localStorage.getItem('tangReadMode') || 'audio'; // 'audio' | 'slow'
let speechSynth = window.speechSynthesis || null;
let speechVoicesReady = false;
let currentUtterance = null;
let slowReadLines = [];
let slowReadIndex = 0;
let slowReadPaused = false;
let slowReadTimer = null;

// 跟读模式高级功能
let slowLoopMode = localStorage.getItem('tangSlowLoop') === '1';         // 整首循环
let slowLineLoopMode = localStorage.getItem('tangSlowLineLoop') === '1'; // 单句循环
let slowAutoMode = localStorage.getItem('tangSlowAuto') !== '0';         // 自动继续（默认自动）

// ========================
// 课程模式
// ========================
let appMode = 'browse'; // 'browse' | 'lesson'
let lessonPathId = null;
let lessonFrom = null;
let lessonTargetPoem = null;
let lessonPathPoems = []; // 当前学习路径中的诗篇顺序

// 学习路径数据
const LESSON_PATHS = {
  level1: ['咏鹅','春晓','静夜思','悯农','登鹳雀楼','相思','江雪','寻隐者不遇','鹿柴','竹里馆','池上','画','风','鸟鸣涧','杂诗','夜宿山寺','独坐敬亭山','秋浦歌','古朗月行','望天门山'],
  level2: ['望庐山瀑布','赠汪伦','早发白帝城','绝句','春夜喜雨','望岳','送元二使安西','九月九日忆山东兄弟','山居秋暝','赋得古原草送别','忆江南','暮江吟','夜雨寄北','登乐游原','清明','山行','江南春','游子吟','黄鹤楼','凉州词']
};

// 预加载语音列表
if (speechSynth) {
  function loadVoices() {
    const voices = speechSynth.getVoices();
    if (voices && voices.length > 0) {
      speechVoicesReady = true;
    }
  }
  loadVoices();
  if (speechSynth.onvoiceschanged !== undefined) {
    speechSynth.onvoiceschanged = loadVoices;
  }
  setTimeout(loadVoices, 500);
  // 保底：2秒后强制标记为就绪（部分浏览器 voices 永远为空但仍可朗读）
  setTimeout(() => { speechVoicesReady = true; }, 2000);
}

// 缓存 DOM 元素
const $ = id => document.getElementById(id);
const audioPlayer = $('audio-player');

// ========================
// 工具函数
// ========================
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function debounce(fn, delay) {
  return function(...args) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function getAudioUrl(poet, index) {
  if (!poet || !poet.poems[index]) return null;
  const poem = poet.poems[index];
  const safeTitle = poem.title.replace(/[^\w一-鿿]/g, '_');
  return `resources/mp3_kids/${currentVoice}/${poet.id}_${String(index).padStart(2, '0')}_${safeTitle}.mp3`;
}

function getPoemLines(text) {
  const rawLines = text.split('\n').filter(l => l.trim());
  if (!singleLineMode) return rawLines;
  const sentences = [];
  for (const line of rawLines) {
    const parts = line.match(/[^，。！？；：、]+[，。！？；：、]?/g) || [line];
    for (const part of parts) {
      if (part.trim()) sentences.push(part.trim());
    }
  }
  return sentences;
}

function calculateLineTimings(poem, poetName) {
  const poemLines = getPoemLines(poem.content);
  const allLines = [poem.title + '。', poetName + '。', ...poemLines];
  const weights = allLines.map(line => line.length + (line.match(/[，。！？；：、]/g) || []).length * 0.3);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let cumulative = 0;
  const timings = weights.map(w => {
    const start = cumulative / totalWeight;
    cumulative += w;
    return { start };
  });
  return timings.slice(2);
}

// ========================
// 语音控制
// ========================
function playAudio(url, autoTry = false) {
  if (!url) { showMessage('暂无音频文件', 'error'); return; }
  audioPlayer.pause();
  audioPlayer.currentTime = 0;
  audioPlayer.src = url;
  audioPlayer.volume = volume;
  audioPlayer.playbackRate = playbackSpeed;
  let blocked = false;
  let tmo = null;
  if (isMobileDevice() && autoTry) {
    tmo = setTimeout(() => {
      if (!isSpeaking && !blocked) {
        blocked = true;
        audioPlayer.pause();
        showMessage('请点击「朗读」按钮播放', 'info');
      }
    }, 500);
  }
  audioPlayer.onplay = function() {
    if (tmo) clearTimeout(tmo);
    audioPlayer.playbackRate = playbackSpeed;
    isSpeaking = true;
    updateVoiceControls(true);
    updatePauseBtnState(false);
    showMessage('朗读中...', 'speaking');
  };
  audioPlayer.ontimeupdate = function() {
    updateFollowHighlight();
  };
  audioPlayer.onended = function() {
    isSpeaking = false;
    isAutoPlaying = false;
    updateVoiceControls(false);
    updatePauseBtnState(false);
    clearFollowHighlight();
    showMessage('朗读完成', 'success');
    if (loopMode && currentPoemText) {
      setTimeout(() => playAudio(getAudioUrl(currentPoet, currentPoemIndex)), 1000);
    } else if (listLoopMode && currentPoet) {
      setTimeout(() => autoPlayNextPoem(), 1000);
    }
  };
  audioPlayer.onerror = function() {
    if (tmo) clearTimeout(tmo);
    isSpeaking = false;
    isAutoPlaying = false;
    updateVoiceControls(false);
    updatePauseBtnState(false);
    clearFollowHighlight();
    showMessage('音频播放失败，请检查文件是否存在', 'error');
    if (listLoopMode && currentPoet) {
      setTimeout(() => autoPlayNextPoem(), 1000);
    }
  };
  const p = audioPlayer.play();
  if (p && typeof p.catch === 'function') {
    p.catch(() => {
      if (tmo) clearTimeout(tmo);
      if (isMobileDevice() && autoTry) {
        showMessage('请点击「朗读」按钮播放', 'info');
      } else {
        showMessage('音频播放失败，请检查文件是否存在', 'error');
      }
    });
  }
}

function autoPlayNextPoem() {
  if (!listLoopMode || !currentPoet || isAutoPlaying) return;
  isAutoPlaying = true;
  let next = currentPoemIndex + 1;
  if (next >= currentPoet.poems.length) next = 0;
  const idx = next;
  setTimeout(() => {
    if (listLoopMode && !isSpeaking) {
      const p = currentPoet.poems[idx];
      if (p) {
        currentPoemIndex = idx;
        showPoemFromList(currentPoet, idx);
        setTimeout(() => {
          const url = getAudioUrl(currentPoet, idx);
          if (url) playAudio(url);
        }, 500);
      }
    }
    isAutoPlaying = false;
  }, 1000);
}

function pauseAudio() {
  if (audioPlayer.paused) {
    audioPlayer.play();
    showMessage('朗读中...', 'speaking');
    updatePauseBtnState(false);
  } else {
    audioPlayer.pause();
    showMessage('已暂停', 'paused');
    updatePauseBtnState(true);
  }
}

function stopAudio() {
  audioPlayer.pause();
  audioPlayer.currentTime = 0;
  isSpeaking = false;
  isAutoPlaying = false;
  updateVoiceControls(false);
  updatePauseBtnState(false);
  clearFollowHighlight();
  showMessage('已停止', 'stopped');
}

function updatePauseBtnState(paused) {
  const btn = $('pause-btn');
  if (paused) {
    btn.innerHTML = '<i class="fas fa-play"></i> 继续';
    btn.classList.remove('pause');
  } else {
    btn.innerHTML = '<i class="fas fa-pause"></i> 暂停';
    btn.classList.add('pause');
  }
}

function updateVoiceControls(playing) {
  $('play-btn').disabled = playing;
  $('pause-btn').disabled = !playing;
  $('stop-btn').disabled = !playing;
}

// ========================
// 模式切换
// ========================
function setReadMode(mode) {
  if (readMode === mode) return;
  readMode = mode;
  localStorage.setItem('tangReadMode', mode);

  // 停止当前播放
  stopAudio();
  stopSlowRead();

  // 更新UI
  document.querySelectorAll('.read-mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });

  const isAudio = mode === 'audio';
  $('voice-panel-title').textContent = isAudio ? '语音朗读' : '慢速跟读';
  $('speed-control').style.display = isAudio ? '' : 'none';
  $('voice-select-control').style.display = isAudio ? '' : 'none';

  // 配置按钮文案和功能
  if (isAudio) {
    $('loop-btn').innerHTML = '<i class="fas fa-redo"></i> 循环';
    $('loop-btn').classList.remove('active');
    if (loopMode) $('loop-btn').classList.add('active');

    $('list-loop-btn').innerHTML = '<i class="fas fa-list"></i> 连播';
    $('list-loop-btn').classList.remove('active');
    if (listLoopMode) $('list-loop-btn').classList.add('active');

    $('follow-btn').innerHTML = '<i class="fas fa-book-reader"></i> 跟读';
    $('follow-btn').classList.remove('active');
    if (followMode) $('follow-btn').classList.add('active');
  } else {
    // 跟读模式：按钮功能重新映射
    $('loop-btn').innerHTML = slowLoopMode ? '<i class="fas fa-redo"></i> 循环中' : '<i class="fas fa-redo"></i> 整首循环';
    $('loop-btn').classList.toggle('active', slowLoopMode);

    $('list-loop-btn').innerHTML = slowLineLoopMode ? '<i class="fas fa-repeat"></i> 单句循环中' : '<i class="fas fa-repeat"></i> 单句循环';
    $('list-loop-btn').classList.toggle('active', slowLineLoopMode);

    $('follow-btn').innerHTML = slowAutoMode ? '<i class="fas fa-forward"></i> 自动' : '<i class="fas fa-hand-pointer"></i> 手动';
    $('follow-btn').classList.toggle('active', slowAutoMode);
  }

  $('play-btn').innerHTML = isAudio ? '<i class="fas fa-play"></i> 朗读' : '<i class="fas fa-play"></i> 开始跟读';

  showMessage(isAudio ? '已切换到音频模式' : '已切换到跟读模式，适合小朋友逐句跟读', 'success');

  // 重新绑定按钮事件
  updateModeButtons();
}

// ========================
// 跟读引擎（Web Speech API）
// ========================
function startSlowRead() {
  if (!currentPoem || !currentPoet) {
    showMessage('请先选择一首诗歌', 'error');
    return;
  }
  if (!speechSynth) {
    showMessage('当前浏览器不支持语音合成，请用 Chrome/Safari/Edge', 'error');
    return;
  }
  if (isSpeaking) {
    // 如果已经在朗读，先停止
    stopSlowRead();
    return;
  }

  // 重置语音合成状态（解决 iOS Safari 首次调用失败的问题）
  try {
    speechSynth.cancel();
    speechSynth.resume();
  } catch(e) {}

  // 构建朗读队列
  const lines = getPoemLines(currentPoem.content);
  slowReadLines = [currentPoem.title, currentPoet.name, ...lines];
  slowReadIndex = 0;
  slowReadPaused = false;
  isSpeaking = true;
  updateVoiceControls(true);
  updatePauseBtnState(false);

  // 延迟一小段时间再开始，确保 cancel/resume 生效
  setTimeout(() => {
    if (!isSpeaking) return;
    readNextLine();
  }, 100);
}

function readNextLine() {
  if (!isSpeaking || slowReadPaused) return;

  // 整首循环
  if (slowReadIndex >= slowReadLines.length) {
    if (slowLoopMode) {
      slowReadIndex = 0;
      showMessage('整首循环，重新开始', 'info');
    } else {
      finishSlowRead();
      return;
    }
  }

  const text = slowReadLines[slowReadIndex];
  const lineIdx = slowReadIndex - 2;

  highlightLine(lineIdx);

  const progress = slowReadLines.length > 0 ? (slowReadIndex + 1) + '/' + slowReadLines.length : '';
  showMessage('跟读中 ' + progress, 'speaking');

  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 0.35;
  utter.pitch = 1.05;
  utter.volume = volume;
  utter.lang = 'zh-CN';

  // 尝试使用中文语音
  try {
    const voices = speechSynth.getVoices();
    if (voices && voices.length > 0) {
      const zhVoice = voices.find(v => v.lang && (v.lang.startsWith('zh') || v.lang.startsWith('cmn')));
      if (zhVoice) utter.voice = zhVoice;
    }
  } catch(e) {}

  utter.onstart = function() {
    showMessage('正在朗读...', 'speaking');
  };

  utter.onend = function() {
    currentUtterance = null;

    if (slowLineLoopMode && lineIdx >= 0) {
      slowReadTimer = setTimeout(() => readNextLine(), 1200);
      return;
    }

    if (!slowAutoMode && lineIdx >= 0) {
      slowReadPaused = true;
      updatePauseBtnState(true);
      showMessage('请点击「继续」读下一句', 'paused');
      return;
    }

    slowReadTimer = setTimeout(() => {
      slowReadIndex++;
      readNextLine();
    }, 1800);
  };

  utter.onerror = function(e) {
    currentUtterance = null;
    clearTimeout(slowReadTimer);
    if (e.error === 'not-allowed') {
      showMessage('浏览器禁止自动播放语音，请点击「开始跟读」重试', 'error');
      stopSlowRead();
      return;
    }
    if (e.error !== 'canceled' && e.error !== 'interrupted') {
      slowReadIndex++;
      readNextLine();
    }
  };

  currentUtterance = utter;

  // 尝试朗读，如果失败给出提示
  try {
    speechSynth.speak(utter);
    // 检查是否真的开始了
    setTimeout(() => {
      if (isSpeaking && !speechSynth.speaking && !speechSynth.paused && !currentUtterance) {
        // 浏览器可能静默拒绝了语音合成
        showMessage('语音播放被浏览器阻止，请尝试刷新页面后重试', 'error');
        stopSlowRead();
      }
    }, 500);
  } catch(e) {
    showMessage('语音播放失败：' + e.message, 'error');
    stopSlowRead();
  }
}

function finishSlowRead() {
  isSpeaking = false;
  updateVoiceControls(false);
  updatePauseBtnState(false);
  clearAllHighlights();
  showMessage('跟读完成', 'success');
}

function pauseSlowRead() {
  if (!isSpeaking) return;
  if (slowReadPaused) {
    // 继续
    slowReadPaused = false;
    updatePauseBtnState(false);
    showMessage('跟读中...', 'speaking');
    if (speechSynth.paused) {
      speechSynth.resume();
    } else {
      readNextLine();
    }
  } else {
    // 暂停
    slowReadPaused = true;
    clearTimeout(slowReadTimer);
    if (speechSynth.speaking) speechSynth.pause();
    updatePauseBtnState(true);
    showMessage('已暂停', 'paused');
  }
}

function stopSlowRead() {
  if (!isSpeaking && !slowReadPaused) return;
  clearTimeout(slowReadTimer);
  if (speechSynth) {
    speechSynth.cancel();
    // iOS Safari 上 cancel 后 resume 状态可能异常，重置一下
    try { speechSynth.resume(); } catch(e) {}
  }
  slowReadPaused = false;
  isSpeaking = false;
  currentUtterance = null;
  updateVoiceControls(false);
  updatePauseBtnState(false);
  clearAllHighlights();
  showMessage('已停止', 'stopped');
}

function highlightLine(index) {
  document.querySelectorAll('.poem-line').forEach((line, i) => {
    line.classList.toggle('active', i === index);
  });
}

function clearAllHighlights() {
  document.querySelectorAll('.poem-line').forEach(line => {
    line.classList.remove('active');
  });
}

// ========================
// 播放控制路由
// ========================
function onPlayClick() {
  if (readMode === 'audio') {
    playAudio(getAudioUrl(currentPoet, currentPoemIndex));
  } else {
    startSlowRead();
  }
}

function onPauseClick() {
  if (readMode === 'audio') {
    pauseAudio();
  } else {
    pauseSlowRead();
  }
}

function onStopClick() {
  if (readMode === 'audio') {
    stopAudio();
  } else {
    stopSlowRead();
  }
}

// ========================
// 跟读高亮（音频模式）
// ========================
function updateFollowHighlight() {
  if (!followMode || !audioPlayer.duration || !currentLineTimings.length) return;
  const progress = audioPlayer.currentTime / audioPlayer.duration;
  let activeIdx = -1;
  for (let i = 0; i < currentLineTimings.length; i++) {
    if (progress >= currentLineTimings[i].start) activeIdx = i;
  }
  document.querySelectorAll('.poem-line').forEach((line, i) => {
    line.classList.toggle('active', i === activeIdx);
  });
}

function clearFollowHighlight() {
  document.querySelectorAll('.poem-line').forEach(line => line.classList.remove('active'));
}

// ========================
// 拼音渲染
// ========================
function addPinyinToText(text) {
  const lines = getPoemLines(text);
  if (!window.pinyinPro || !showPinyin) {
    return lines.map((line, i) => {
      if (!line.trim()) return '<br>';
      return '<div class="poem-line" data-line-idx="' + i + '">' + line + '</div>';
    }).join('');
  }
  try {
    let html = '';
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      if (!line.trim()) { html += '<br>'; continue; }
      const arr = window.pinyinPro.pinyin(line, { toneType: 'symbol', type: 'array', multiple: true });
      let out = '';
      let ci = 0;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (/[一-鿿]/.test(ch)) {
          out += '<span class="pinyin-ruby"><span class="pinyin-text">' + (arr[ci] || '') + '</span><span class="hanzi-text">' + ch + '</span></span>';
          ci++;
        } else {
          out += '<span style="margin:0 2px">' + ch + '</span>';
        }
      }
      html += '<div class="poem-line" data-line-idx="' + li + '">' + out + '</div>';
    }
    return html;
  } catch (e) {
    return lines.map((line, i) => {
      if (!line.trim()) return '<br>';
      return '<div class="poem-line" data-line-idx="' + i + '">' + line + '</div>';
    }).join('');
  }
}

function showMessage(msg, type = 'info') {
  const el = $('current-status');
  const [icon, color] = STATUS_ICONS[type] || ['fa-info-circle', '#7f8c8d'];
  el.innerHTML = '<i class="fas ' + icon + '" style="color:' + color + '"></i> ' + msg;
}

// ========================
// 页面渲染
// ========================
function renderPoetList() {
  const ul = $('poet-list');
  ul.innerHTML = '';
  if (!tangPoetry || !tangPoetry.length) {
    ul.innerHTML = '<li class="empty-message">暂无数据</li>';
    return;
  }
  tangPoetry.forEach(poet => {
    const li = document.createElement('li');
    li.className = 'poet-item';
    li.dataset.poetId = poet.id;
    li.innerHTML = '<span class="poet-name">' + poet.name + '</span><span class="poet-count">' + poet.poems.length + '首</span>';
    li.addEventListener('click', () => { showPoetPoems(poet.id); closeNav(); });
    ul.appendChild(li);
  });
  const tp = tangPoetry.length;
  const tc = tangPoetry.reduce((s, p) => s + p.poems.length, 0);
  $('poet-count').textContent = tp;
  $('poem-count').textContent = tc;
}

function renderPoetGrid() {
  const grid = $('poet-grid');
  if (!grid) return;
  grid.innerHTML = '';
  if (!tangPoetry || !tangPoetry.length) return;
  tangPoetry.forEach((poet, i) => {
    const div = document.createElement('div');
    div.className = 'poet-grid-item fade-in-up stagger-' + (i % 5 + 1);
    div.style.background = POET_BG_COLORS[i % POET_BG_COLORS.length];
    div.innerHTML = '<div class="poet-grid-avatar">' + poet.name.charAt(0) + '</div><div class="poet-grid-name">' + poet.name + '</div><div class="poet-grid-count">' + poet.poems.length + '首</div>';
    div.addEventListener('click', () => showPoetPoems(poet.id));
    grid.appendChild(div);
  });
}

function renderDailyPoem() {
  const el = $('daily-poem');
  if (!el) return;
  if (!tangPoetry || !tangPoetry.length) return;
  const total = tangPoetry.reduce((s, p) => s + p.poems.length, 0);
  const today = new Date();
  const daySeed = Math.floor(today.getTime() / 86400000);
  const idx = daySeed % total;
  let remain = idx;
  for (const poet of tangPoetry) {
    if (remain < poet.poems.length) {
      const poem = poet.poems[remain];
      $('daily-title').textContent = poem.title;
      $('daily-author-name').textContent = poet.name;
      $('daily-preview').textContent = poem.content.split('\n')[0];
      $('daily-date').textContent = (today.getMonth() + 1) + '月' + today.getDate() + '日';
      el.onclick = () => showPoemFromList(poet, remain);
      return;
    }
    remain -= poet.poems.length;
  }
}

// ========================
// 收藏与最近阅读
// ========================
function loadFavorites() {
  try { return JSON.parse(localStorage.getItem('tangFavorites') || '[]'); }
  catch (e) { return []; }
}

function saveFavorites(list) {
  localStorage.setItem('tangFavorites', JSON.stringify(list));
}

function loadRecent() {
  try { return JSON.parse(localStorage.getItem('tangRecent') || '[]'); }
  catch (e) { return []; }
}

function saveRecent(list) {
  localStorage.setItem('tangRecent', JSON.stringify(list.slice(0, 20)));
}

function isFavorite(title) {
  return loadFavorites().some(f => f.title === title);
}

function toggleFavorite() {
  if (!currentPoem || !currentPoet) return;
  let list = loadFavorites();
  const idx = list.findIndex(f => f.title === currentPoem.title);
  if (idx >= 0) {
    list.splice(idx, 1);
    showMessage('已取消收藏', 'info');
  } else {
    list.unshift({ title: currentPoem.title, poetName: currentPoet.name, poetId: currentPoet.id, poemIndex: currentPoemIndex });
    showMessage('已收藏', 'success');
  }
  saveFavorites(list);
  updateFavBtn();
  renderFavorites();
}

function updateFavBtn() {
  const btn = $('fav-btn');
  if (!btn) return;
  const active = isFavorite(currentPoem ? currentPoem.title : '');
  btn.classList.toggle('active', active);
  btn.innerHTML = active ? '<i class="fas fa-heart"></i> 已收藏' : '<i class="far fa-heart"></i> 收藏';
}

function addRecent(poet, poem, index) {
  let list = loadRecent().filter(r => r.title !== poem.title);
  list.unshift({ title: poem.title, poetName: poet.name, poetId: poet.id, poemIndex: index });
  saveRecent(list);
  renderRecent();
}

function renderPoemList(container, list, emptyMsg) {
  container.innerHTML = '';
  if (!list || !list.length) {
    container.innerHTML = '<div class="tab-empty" style="padding:16px">' + (emptyMsg || '暂无内容') + '</div>';
    return;
  }
  list.slice(0, 10).forEach(item => {
    const div = document.createElement('div');
    div.className = 'poem-list-item';
    div.innerHTML = '<div class="pl-title">' + item.title + '</div><div class="pl-meta">' + item.poetName + '</div>';
    div.addEventListener('click', () => {
      const poet = tangPoetry.find(p => p.id === item.poetId);
      if (poet) showPoemFromList(poet, item.poemIndex);
    });
    container.appendChild(div);
  });
}

function renderFavorites() {
  const section = $('fav-section');
  if (!section) return;
  const list = loadFavorites();
  section.style.display = list.length ? 'block' : 'none';
  renderPoemList($('fav-list'), list, '暂无收藏诗歌');
}

function renderRecent() {
  const section = $('recent-section');
  if (!section) return;
  const list = loadRecent();
  section.style.display = list.length ? 'block' : 'none';
  renderPoemList($('recent-list'), list, '暂无阅读记录');
}

// ========================
// 页面切换
// ========================
function showPoetPoems(poetId) {
  const poet = tangPoetry.find(p => p.id === poetId);
  if (!poet) return;
  currentPoet = poet;
  currentPoemIndex = 0;
  $('current-poet-name').textContent = poet.name;
  $('current-poet-count').textContent = poet.poems.length + '首作品';
  const list = $('poet-poems-list');
  list.innerHTML = '';
  poet.poems.forEach((poem, i) => {
    const div = document.createElement('div');
    div.className = 'card poem-item';
    div.style.cursor = 'pointer';
    const preview = poem.content.split('\n')[0].substring(0, 14) + (poem.content.split('\n')[0].length > 14 ? '...' : '');
    div.innerHTML = '<div style="font-weight:600;color:#2c3e50;">' + poem.title + '</div><div style="font-size:.85em;color:#888;margin-top:4px;">' + preview + '</div>';
    div.addEventListener('click', () => showPoemFromList(poet, i));
    list.appendChild(div);
  });
  $('home-page').classList.remove('active');
  $('poet-poems-page').classList.add('active');
  $('poem-page').classList.remove('active');
  $('page-title').textContent = poet.name + '的作品';
  $('search-results').classList.remove('active');
  $('nav-home').classList.remove('active');
  $('nav-back').classList.remove('hidden');
}

function showPoemFromList(poet, index) {
  currentPoet = poet;
  currentPoemIndex = index;
  showPoem(poet, poet.poems[index], index);
}

function showPoem(poet, poem, index) {
  // 切换诗歌时停止所有朗读
  stopAudio();
  stopSlowRead();

  currentPoem = poem;
  $('detail-title').textContent = poem.title;
  $('poet-name').textContent = poet.name;
  $('poet-bio').textContent = poet.bio;
  $('detail-content').innerHTML = addPinyinToText(poem.content);
  $('page-title').textContent = poet.name + ' · ' + poem.title;
  $('home-page').classList.remove('active');
  $('poet-poems-page').classList.remove('active');
  $('poem-page').classList.add('active');
  currentPoemText = poem.title + '，' + poet.name + '。' + poem.content;
  currentLineTimings = calculateLineTimings(poem, poet.name);
  updateNavButtons(poet, index);
  $('current-position').textContent = (index + 1) + '/' + poet.poems.length;
  bindVoiceButtons();
  currentTab = 'notes';
  switchTab('notes');
  $('search-results').classList.remove('active');
  $('nav-home').classList.remove('active');
  $('nav-back').classList.remove('hidden');
  addRecent(poet, poem, index);
  updateFavBtn();
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const pane = $('tab-pane');
  if (!currentPoem) {
    pane.innerHTML = '<div class="tab-empty">请先选择一首诗歌</div>';
    return;
  }
  const extra = poemExtras[currentPoem.title];
  if (!extra || !extra[tab]) {
    pane.innerHTML = '<div class="tab-empty">暂无' + TAB_NAMES[tab] + '</div>';
    return;
  }
  let html = '';
  if (tab === 'notes') {
    extra.notes.split('。').filter(Boolean).forEach(s => {
      if (s.trim()) html += '<p>' + s.trim() + '。</p>';
    });
  } else if (tab === 'translation') {
    html = '<p>' + extra.translation + '</p>';
  } else if (tab === 'analysis') {
    html = '<p>' + extra.analysis + '</p>';
  }
  pane.innerHTML = html || '<div class="tab-empty">暂无内容</div>';
}

function updateNavButtons(poet, index) {
  $('prev-poem').disabled = index <= 0;
  $('next-poem').disabled = index >= poet.poems.length - 1 && !listLoopMode;
}

function prevPoem() {
  if (currentPoet && currentPoemIndex > 0) showPoemFromList(currentPoet, currentPoemIndex - 1);
}

function nextPoem() {
  if (!currentPoet) return;
  let n = currentPoemIndex + 1;
  if (n >= currentPoet.poems.length) {
    if (listLoopMode) n = 0; else return;
  }
  showPoemFromList(currentPoet, n);
}

function bindVoiceButtons() {
  $('play-btn').onclick = onPlayClick;
  $('pause-btn').onclick = onPauseClick;
  $('stop-btn').onclick = onStopClick;
  $('fav-btn').onclick = toggleFavorite;
  // loop/list-loop/follow 的功能在 setReadMode 中根据模式重新绑定
  updateModeButtons();
}

function updateModeButtons() {
  if (readMode === 'audio') {
    $('loop-btn').onclick = toggleLoop;
    $('list-loop-btn').onclick = toggleListLoop;
    $('follow-btn').onclick = toggleFollow;
  } else {
    $('loop-btn').onclick = toggleSlowLoop;
    $('list-loop-btn').onclick = toggleSlowLineLoop;
    $('follow-btn').onclick = toggleSlowAuto;
  }
}

function toggleLoop() {
  loopMode = !loopMode;
  localStorage.setItem('tangLoopMode', loopMode ? '1' : '');
  const btn = $('loop-btn');
  if (loopMode) {
    if (listLoopMode) toggleListLoop();
    btn.classList.add('active');
    btn.innerHTML = '<i class="fas fa-redo"></i> 循环中';
    showMessage('已开启单曲循环', 'success');
  } else {
    btn.classList.remove('active');
    btn.innerHTML = '<i class="fas fa-redo"></i> 循环';
    showMessage('已关闭单曲循环', 'info');
  }
}

function toggleListLoop() {
  listLoopMode = !listLoopMode;
  localStorage.setItem('tangListLoopMode', listLoopMode ? '1' : '');
  const btn = $('list-loop-btn');
  if (listLoopMode) {
    if (loopMode) toggleLoop();
    btn.classList.add('active');
    btn.innerHTML = '<i class="fas fa-list"></i> 连播中';
    showMessage('已开启列表连播', 'success');
  } else {
    btn.classList.remove('active');
    btn.innerHTML = '<i class="fas fa-list"></i> 连播';
    showMessage('已关闭列表连播', 'info');
  }
}

function toggleFollow() {
  followMode = !followMode;
  localStorage.setItem('tangFollowMode', followMode ? '1' : '');
  const btn = $('follow-btn');
  if (followMode) {
    btn.classList.add('active');
    btn.innerHTML = '<i class="fas fa-book-reader"></i> 跟读中';
    showMessage('已开启跟读模式', 'success');
  } else {
    btn.classList.remove('active');
    btn.innerHTML = '<i class="fas fa-book-reader"></i> 跟读';
    showMessage('已关闭跟读模式', 'info');
    clearFollowHighlight();
  }
}

// ========================
// 跟读模式 toggle 函数
// ========================
function toggleSlowLoop() {
  slowLoopMode = !slowLoopMode;
  localStorage.setItem('tangSlowLoop', slowLoopMode ? '1' : '');
  const btn = $('loop-btn');
  if (slowLoopMode) {
    btn.classList.add('active');
    btn.innerHTML = '<i class="fas fa-redo"></i> 循环中';
    showMessage('已开启整首循环', 'success');
  } else {
    btn.classList.remove('active');
    btn.innerHTML = '<i class="fas fa-redo"></i> 整首循环';
    showMessage('已关闭整首循环', 'info');
  }
}

function toggleSlowLineLoop() {
  slowLineLoopMode = !slowLineLoopMode;
  localStorage.setItem('tangSlowLineLoop', slowLineLoopMode ? '1' : '');
  const btn = $('list-loop-btn');
  if (slowLineLoopMode) {
    btn.classList.add('active');
    btn.innerHTML = '<i class="fas fa-repeat"></i> 单句循环中';
    showMessage('已开启单句循环', 'success');
  } else {
    btn.classList.remove('active');
    btn.innerHTML = '<i class="fas fa-repeat"></i> 单句循环';
    showMessage('已关闭单句循环', 'info');
  }
}

function toggleSlowAuto() {
  slowAutoMode = !slowAutoMode;
  localStorage.setItem('tangSlowAuto', slowAutoMode ? '1' : '0');
  const btn = $('follow-btn');
  if (slowAutoMode) {
    btn.classList.add('active');
    btn.innerHTML = '<i class="fas fa-forward"></i> 自动';
    showMessage('已切换到自动模式，读完一句自动继续', 'success');
  } else {
    btn.classList.remove('active');
    btn.innerHTML = '<i class="fas fa-hand-pointer"></i> 手动';
    showMessage('已切换到手动模式，读完一句需手动继续', 'info');
  }
}

function setSpeed(speed) {
  playbackSpeed = speed;
  localStorage.setItem('tangPlaybackSpeed', speed);
  audioPlayer.playbackRate = speed;
  document.querySelectorAll('.speed-btn[data-speed]').forEach(b => b.classList.toggle('active', parseFloat(b.dataset.speed) === speed));
  showMessage('朗读速度：' + speed + 'x', 'info');
}

function setVolume(val) {
  volume = val;
  localStorage.setItem('tangVolume', val);
  audioPlayer.volume = val;
  const pct = Math.round(val * 100);
  showMessage('音量：' + pct + '%', 'info');
}

function setVoice(voice) {
  currentVoice = voice;
  localStorage.setItem('tangVoice', voice);
  document.querySelectorAll('.speed-btn[data-voice]').forEach(b => b.classList.toggle('active', b.dataset.voice === voice));
  showMessage('已切换音色：' + VOICE_NAMES[voice], 'success');
}

function toggleSingleLine() {
  singleLineMode = !singleLineMode;
  localStorage.setItem('tangSingleLineMode', singleLineMode ? '1' : '0');
  $('toggle-single-line').textContent = singleLineMode ? '联句分行' : '单句分行';
  if (currentPoem) {
    $('detail-content').innerHTML = addPinyinToText(currentPoem.content);
    currentLineTimings = calculateLineTimings(currentPoem, currentPoet.name);
    if (!isSpeaking) clearFollowHighlight();
  }
}

// ========================
// 搜索（带防抖）
// ========================
function doSearch(kw) {
  const q = kw.toLowerCase().trim();
  if (!q) return { poems: [], poets: [] };
  const poems = [], poets = [];
  tangPoetry.forEach(poet => {
    if (poet.name.includes(q) || poet.bio.includes(q)) poets.push({ type: 'poet', poet });
    poet.poems.forEach((poem, idx) => {
      if (poem.title.includes(q) || poem.content.includes(q)) {
        poems.push({ type: 'poem', poet, poem, poemIndex: idx });
      }
    });
  });
  return { poems, poets };
}

function renderSearchResults(r, kw) {
  const box = $('search-results');
  if (!kw.trim() || (!r.poems.length && !r.poets.length)) {
    box.classList.remove('active');
    return;
  }
  let html = '';
  if (r.poems.length) {
    html += '<div class="result-section"><h3>诗歌 (' + r.poems.length + ')</h3>';
    r.poems.slice(0, 8).forEach(item => {
      const snippet = item.poem.content.replace(/\n/g, ' ').substring(0, 40);
      html += '<div class="result-poem-item" data-pid="' + item.poet.id + '" data-idx="' + item.poemIndex + '"><div class="result-poem-title">' + item.poem.title + '</div><div class="result-poem-meta">' + item.poet.name + '</div><div class="result-poem-snippet">' + snippet + '...</div></div>';
    });
    if (r.poems.length > 8) html += '<div style="text-align:center;color:#999;font-size:.85em;padding:8px;">还有 ' + (r.poems.length - 8) + ' 首</div>';
    html += '</div>';
  }
  if (r.poets.length) {
    html += '<div class="result-section"><h3>诗人 (' + r.poets.length + ')</h3>';
    r.poets.forEach(item => {
      html += '<div class="result-poet-item" data-pid="' + item.poet.id + '"><div class="result-poet-name">' + item.poet.name + '</div><div class="result-poet-bio">' + item.poet.bio.substring(0, 50) + '...</div></div>';
    });
    html += '</div>';
  }
  box.innerHTML = html;
  box.classList.add('active');
  box.querySelectorAll('.result-poem-item').forEach(el => {
    el.addEventListener('click', () => {
      const pid = el.dataset.pid;
      const idx = parseInt(el.dataset.idx);
      const poet = tangPoetry.find(p => p.id === pid);
      if (poet) showPoemFromList(poet, idx);
    });
  });
  box.querySelectorAll('.result-poet-item').forEach(el => {
    el.addEventListener('click', () => { showPoetPoems(el.dataset.pid); });
  });
}

const debouncedSearch = debounce((kw) => {
  const r = doSearch(kw);
  renderSearchResults(r, kw);
}, 300);

// ========================
// 导航
// ========================
function openNav() {
  $('side-nav').classList.add('active');
  $('nav-overlay').classList.add('active');
}

function closeNav() {
  $('side-nav').classList.remove('active');
  $('nav-overlay').classList.remove('active');
}

function backToHome() {
  $('home-page').classList.add('active');
  $('poet-poems-page').classList.remove('active');
  $('poem-page').classList.remove('active');
  $('page-title').textContent = '唐诗三百首';
  $('search-results').classList.remove('active');
  stopAudio();
  stopSlowRead();
  $('nav-home').classList.add('active');
  $('nav-back').classList.add('hidden');
}

function backToPoetPoems() {
  if (currentPoet) showPoetPoems(currentPoet.id);
  else backToHome();
}

function randomPoem() {
  if (!tangPoetry.length) return;
  const poet = tangPoetry[Math.floor(Math.random() * tangPoetry.length)];
  const idx = Math.floor(Math.random() * poet.poems.length);
  showPoemFromList(poet, idx);
}

// ========================
// 初始化
// ========================
function initApp() {
  // 解析URL参数（模式检测）
  const params = new URLSearchParams(location.search);
  appMode = params.get('mode') || 'browse';
  lessonPathId = params.get('path');
  lessonFrom = params.get('from');
  lessonTargetPoem = params.get('poem');

  if (appMode === 'lesson') {
    applyLessonMode();
  }

  // 排序一次，后续复用
  tangPoetry = tangPoetryData.slice().sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

  renderPoetList();
  renderPoetGrid();
  renderDailyPoem();
  renderFavorites();
  renderRecent();

  // 事件绑定
  $('menu-toggle').addEventListener('click', openNav);
  $('nav-overlay').addEventListener('click', closeNav);
  $('back-btn').addEventListener('click', backToPoetPoems);
  $('back-to-poet-list').addEventListener('click', backToHome);
  $('nav-fav-btn').addEventListener('click', () => {
    closeNav();
    backToHome();
    $('fav-list').scrollIntoView({ behavior: 'smooth' });
  });
  $('nav-recent-btn').addEventListener('click', () => {
    closeNav();
    backToHome();
    $('recent-list').scrollIntoView({ behavior: 'smooth' });
  });
  $('prev-poem').addEventListener('click', prevPoem);
  $('next-poem').addEventListener('click', nextPoem);
  $('nav-home').addEventListener('click', backToHome);
  $('nav-back').addEventListener('click', backToPoetPoems);
  $('nav-random').addEventListener('click', randomPoem);

  $('toggle-pinyin').addEventListener('click', () => {
    showPinyin = !showPinyin;
    $('toggle-pinyin').textContent = showPinyin ? '隐藏拼音' : '显示拼音';
    $('detail-content').classList.toggle('no-pinyin', !showPinyin);
    if (currentPoem) {
      $('detail-content').innerHTML = addPinyinToText(currentPoem.content);
      switchTab(currentTab);
    }
  });

  $('toggle-single-line').textContent = singleLineMode ? '联句分行' : '单句分行';
  $('toggle-single-line').addEventListener('click', toggleSingleLine);

  $('detail-content').addEventListener('click', (e) => {
    const line = e.target.closest('.poem-line');
    if (!line) return;
    const idx = parseInt(line.dataset.lineIdx);
    if (audioPlayer.duration && currentLineTimings[idx]) {
      audioPlayer.currentTime = currentLineTimings[idx].start * audioPlayer.duration;
      if (audioPlayer.paused) playAudio(getAudioUrl(currentPoet, currentPoemIndex));
    }
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // 搜索输入（防抖）
  const searchInput = $('search-input');
  searchInput.addEventListener('input', (e) => {
    const kw = e.target.value.trim();
    if (kw) {
      debouncedSearch(kw);
    } else {
      clearTimeout(searchTimer);
      $('search-results').classList.remove('active');
    }
  });

  // 恢复设置
  if (localStorage.getItem('tangListLoopMode')) toggleListLoop();
  else if (localStorage.getItem('tangLoopMode')) toggleLoop();

  if (followMode) {
    const btn = $('follow-btn');
    if (btn) {
      btn.classList.add('active');
      btn.innerHTML = '<i class="fas fa-book-reader"></i> 跟读中';
    }
  }

  document.querySelectorAll('.speed-btn[data-speed]').forEach(b => {
    b.addEventListener('click', () => setSpeed(parseFloat(b.dataset.speed)));
    b.classList.toggle('active', parseFloat(b.dataset.speed) === playbackSpeed);
  });
  document.querySelectorAll('.speed-btn[data-voice]').forEach(b => {
    b.addEventListener('click', () => setVoice(b.dataset.voice));
    b.classList.toggle('active', b.dataset.voice === currentVoice);
  });

  // 音量滑块
  const volSlider = $('volume-slider');
  if (volSlider) {
    volSlider.value = Math.round(volume * 100);
    volSlider.addEventListener('input', (e) => {
      setVolume(parseInt(e.target.value) / 100);
    });
  }

  // 模式切换按钮
  document.querySelectorAll('.read-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => setReadMode(btn.dataset.mode));
  });

  // 初始化模式UI
  setReadMode(readMode);

  // 如果URL指定了诗篇，自动导航
  if (lessonTargetPoem) {
    const found = findPoemByTitle(lessonTargetPoem);
    if (found) {
      // 延迟一点确保DOM就绪
      setTimeout(() => {
        showPoemFromList(found.poet, found.index);
      }, 100);
    }
  }
}

document.addEventListener('DOMContentLoaded', initApp);

// ========================
// 课程模式
// ========================
function applyLessonMode() {
  // 隐藏搜索框
  const searchBox = document.querySelector('.search-box');
  if (searchBox) searchBox.style.display = 'none';

  // 隐藏菜单按钮
  const menuToggle = $('menu-toggle');
  if (menuToggle) menuToggle.style.display = 'none';

  // 隐藏头部占位符，显示课程导航
  const headerSpacer = $('header-spacer');
  if (headerSpacer) headerSpacer.style.display = 'none';
  const lessonNav = $('lesson-nav');
  if (lessonNav) lessonNav.style.display = 'flex';

  // 更新副标题
  const subtitle = document.querySelector('.header-subtitle');
  if (subtitle && lessonPathId) {
    const pathNames = { level1: '初识唐诗', level2: '熟读唐诗', level3: '精通唐诗' };
    subtitle.textContent = '学习路径：' + (pathNames[lessonPathId] || lessonPathId);
  }

  // 绑定课程导航按钮
  const lessonBack = $('lesson-back');
  if (lessonBack) {
    lessonBack.addEventListener('click', () => {
      if (lessonPathId) {
        window.location.href = 'path-detail.html?path=' + encodeURIComponent(lessonPathId);
      } else {
        window.history.back();
      }
    });
  }
  const lessonExit = $('lesson-exit');
  if (lessonExit) {
    lessonExit.addEventListener('click', () => {
      window.location.href = 'poem-module.html';
    });
  }

  // 隐藏首页、今日推荐、最近阅读、收藏等
  $('fav-section') && ($('fav-section').style.display = 'none');

  // 绑定课程模式底部导航
  const lPrev = $('lesson-prev');
  const lNext = $('lesson-next');
  if (lPrev) lPrev.addEventListener('click', lessonPrevPoem);
  if (lNext) lNext.addEventListener('click', lessonNextPoem);

  // 绑定完成学习按钮
  const completeBtn = $('complete-btn');
  if (completeBtn) completeBtn.addEventListener('click', completeLesson);

  // 绑定课程模式收藏按钮
  const lessonFavBtn = $('lesson-fav-btn');
  if (lessonFavBtn) lessonFavBtn.addEventListener('click', toggleFavorite);

  // 绑定学会了按钮
  const masteredBtn = $('mastered-btn');
  if (masteredBtn) {
    masteredBtn.addEventListener('click', () => {
      completeLesson();
      toast('太棒了！已标记为学会');
    });
  }

  // 构建学习路径诗篇列表
  if (lessonPathId && LESSON_PATHS[lessonPathId]) {
    lessonPathPoems = LESSON_PATHS[lessonPathId].map(title => {
      const found = findPoemByTitle(title);
      return found || null;
    }).filter(Boolean);
  }
}

function findPoemByTitle(title) {
  for (const poet of tangPoetryData) {
    const idx = poet.poems.findIndex(p => p.title === title);
    if (idx >= 0) return { poet, index: idx, poem: poet.poems[idx] };
  }
  return null;
}

function completeLesson() {
  if (!currentPoem) { toast('请先选择一首诗歌'); return; }

  // 记录学习进度
  const progress = JSON.parse(localStorage.getItem('poem_progress') || '{}');
  progress[currentPoem.title] = {
    completed: true,
    completedAt: Date.now(),
    path: lessonPathId,
    readCount: (progress[currentPoem.title]?.readCount || 0) + 1
  };
  localStorage.setItem('poem_progress', JSON.stringify(progress));

  // 更新连续学习天数
  const today = new Date().toDateString();
  const lastStudy = localStorage.getItem('last_study_date');
  let streak = parseInt(localStorage.getItem('study_streak') || '0');
  if (lastStudy !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (lastStudy === yesterday.toDateString()) {
      streak++;
    } else {
      streak = 1;
    }
    localStorage.setItem('last_study_date', today);
    localStorage.setItem('study_streak', String(streak));
  }

  toast('🎉 学习完成！进度已记录');

  // 自动跳转到下一篇
  setTimeout(() => {
    lessonNextPoem();
  }, 1200);
}

function lessonPrevPoem() {
  if (!lessonPathPoems.length || !currentPoem) return;
  const idx = lessonPathPoems.findIndex(p => p.poem.title === currentPoem.title);
  if (idx > 0 && lessonPathPoems[idx - 1]) {
    showPoemFromList(lessonPathPoems[idx - 1].poet, lessonPathPoems[idx - 1].index);
  } else {
    toast('已经是第一篇了');
  }
}

function lessonNextPoem() {
  if (!lessonPathPoems.length || !currentPoem) return;
  const idx = lessonPathPoems.findIndex(p => p.poem.title === currentPoem.title);
  if (idx >= 0 && idx < lessonPathPoems.length - 1 && lessonPathPoems[idx + 1]) {
    showPoemFromList(lessonPathPoems[idx + 1].poet, lessonPathPoems[idx + 1].index);
  } else {
    toast('已完成本路径全部诗篇！');
    // 返回路径页
    if (lessonPathId) {
      setTimeout(() => {
        window.location.href = 'path-detail.html?path=' + encodeURIComponent(lessonPathId);
      }, 1500);
    }
  }
}

// 课程模式：在showPoem时切换底部导航和显示课程操作区
const _originalShowPoem = showPoem;
showPoem = function(poet, poem, index) {
  _originalShowPoem(poet, poem, index);
  if (appMode === 'lesson') {
    // 隐藏浏览模式底部导航，显示课程模式底部导航
    const bottomNav = $('bottom-nav');
    const lessonBottomNav = $('lesson-bottom-nav');
    const lessonActions = $('lesson-actions');
    const poetInfoCard = $('poet-info-card');
    const favBtn = $('fav-btn');

    if (bottomNav) bottomNav.style.display = 'none';
    if (lessonBottomNav) lessonBottomNav.style.display = 'flex';
    if (lessonActions) lessonActions.style.display = 'block';
    if (poetInfoCard) poetInfoCard.style.display = 'none';
    if (favBtn) favBtn.style.display = 'none';

    // 更新课程模式收藏按钮状态
    const lessonFavBtn = $('lesson-fav-btn');
    if (lessonFavBtn) {
      const active = isFavorite(currentPoem ? currentPoem.title : '');
      lessonFavBtn.innerHTML = active ? '<i class="fas fa-heart"></i> 已收藏' : '<i class="far fa-heart"></i> 收藏';
    }
  }
};

function toast(msg) {
  const div = document.createElement('div');
  div.textContent = msg;
  div.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.75);color:#fff;padding:10px 20px;border-radius:8px;font-size:14px;z-index:999;white-space:nowrap;';
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 2000);
}
