/**
 * AskSphere AI - Client Application Logic
 * Communicates with the Flask REST API endpoints:
 * - POST /api/chat
 * - POST /api/chat/analyze
 * - GET  /api/faqs
 * - GET  /api/faqs/categories
 * - POST /api/faqs
 * - PUT  /api/faqs/<id>
 * - DELETE /api/faqs/<id>
 * - GET  /api/health
 */

const API_BASE = window.location.origin.includes('http') 
  ? window.location.origin 
  : 'http://127.0.0.1:5000';

// Application State
const state = {
  activeTab: 'chat',
  faqs: [],
  categories: [],
  selectedCategory: 'All',
  searchQuery: '',
  lastQuery: '',
  health: null,
};

// DOM Elements
const elements = {
  navBtns: document.querySelectorAll('.nav-item'),
  tabPanes: document.querySelectorAll('.tab-pane'),
  pageTitle: document.getElementById('page-title'),
  pageDesc: document.getElementById('page-desc'),
  navFaqCount: document.getElementById('nav-faq-count'),
  
  // Health
  healthDot: document.getElementById('health-dot'),
  healthStatusText: document.getElementById('health-status-text'),
  healthFeatures: document.getElementById('health-features'),
  healthThreshold: document.getElementById('health-threshold'),

  // Chat
  chatMessages: document.getElementById('chat-messages'),
  chatForm: document.getElementById('chat-form'),
  chatInput: document.getElementById('chat-input'),
  chatSendBtn: document.getElementById('chat-send-btn'),
  chatClearBtn: document.getElementById('chat-clear-btn'),
  chatCharCount: document.getElementById('chat-char-count'),

  // Knowledge Base
  kbSearchInput: document.getElementById('kb-search-input'),
  kbClearSearch: document.getElementById('kb-clear-search'),
  kbCategoryPills: document.getElementById('kb-category-pills'),
  kbGrid: document.getElementById('kb-grid'),

  // NLP Inspector
  inspectorInput: document.getElementById('inspector-input'),
  btnRunAnalysis: document.getElementById('btn-run-analysis'),
  inspectCleaned: document.getElementById('inspect-cleaned'),
  inspectTokens: document.getElementById('inspect-tokens'),
  inspectStopwords: document.getElementById('inspect-stopwords'),
  inspectLemmas: document.getElementById('inspect-lemmas'),
  inspectSimTbody: document.getElementById('inspect-sim-tbody'),
  btnQuickInspect: document.getElementById('btn-quick-inspect'),

  // Manage FAQs
  manageTotalFaqs: document.getElementById('manage-total-faqs'),
  manageTotalCats: document.getElementById('manage-total-cats'),
  manageVectorVocab: document.getElementById('manage-vector-vocab'),
  manageFilterInput: document.getElementById('manage-filter-input'),
  faqsAdminTbody: document.getElementById('faqs-admin-tbody'),
  btnAddFaqManage: document.getElementById('btn-add-faq-manage'),
  btnOpenAddModal: document.getElementById('btn-open-add-modal'),

  // Modal
  faqModal: document.getElementById('faq-modal'),
  faqModalForm: document.getElementById('faq-modal-form'),
  modalTitle: document.getElementById('modal-title'),
  modalCloseBtn: document.getElementById('modal-close-btn'),
  modalCancelBtn: document.getElementById('modal-cancel-btn'),
  modalFaqId: document.getElementById('modal-faq-id'),
  modalCategorySelect: document.getElementById('modal-category-select'),
  modalCategoryCustom: document.getElementById('modal-category-custom'),
  modalQuestion: document.getElementById('modal-question'),
  modalAnswer: document.getElementById('modal-answer'),
  modalKeywords: document.getElementById('modal-keywords'),

  // Toast
  toastContainer: document.getElementById('toast-container'),
};

// Page metadata per tab
const tabMeta = {
  chat: {
    title: 'AI Knowledge Assistant',
    desc: 'Instant answers powered by TF-IDF & Cosine Similarity NLP matching'
  },
  knowledge: {
    title: 'Knowledge Base Explorer',
    desc: 'Browse, search, and discover all indexed FAQ entries'
  },
  inspector: {
    title: 'NLP Query Inspector',
    desc: 'Deep-dive into tokenization, lemmatization, and dual TF-IDF score breakdown'
  },
  manage: {
    title: 'Manage Knowledge Base',
    desc: 'Add, update, or remove FAQs with instant real-time vector re-indexing'
  }
};

/* ==========================================================================
   Initialization
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  fetchHealth();
  fetchCategories();
  fetchFaqs();
});

function setupEventListeners() {
  // Navigation Tabs
  elements.navBtns.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Topbar Actions
  elements.btnQuickInspect.addEventListener('click', () => {
    switchTab('inspector');
    if (state.lastQuery) {
      elements.inspectorInput.value = state.lastQuery;
      runNlpAnalysis(state.lastQuery);
    } else {
      runNlpAnalysis(elements.inspectorInput.value.trim());
    }
  });

  elements.btnOpenAddModal.addEventListener('click', () => openFaqModal());
  elements.btnAddFaqManage.addEventListener('click', () => openFaqModal());

  // Chat input auto-expand & submit
  elements.chatInput.addEventListener('input', handleChatInput);
  elements.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      elements.chatForm.dispatchEvent(new Event('submit'));
    }
  });
  elements.chatClearBtn.addEventListener('click', () => {
    elements.chatInput.value = '';
    handleChatInput();
  });
  elements.chatForm.addEventListener('submit', handleChatSubmit);

  // Quick Prompts click delegation
  document.addEventListener('click', (e) => {
    const promptBtn = e.target.closest('.prompt-chip');
    if (promptBtn) {
      const prompt = promptBtn.dataset.prompt;
      if (prompt) {
        elements.chatInput.value = prompt;
        switchTab('chat');
        handleChatSubmit(new Event('submit'));
      }
    }
  });

  // Knowledge Base Search & Filter
  elements.kbSearchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.trim();
    elements.kbClearSearch.style.display = state.searchQuery ? 'block' : 'none';
    renderKnowledgeBase();
  });
  elements.kbClearSearch.addEventListener('click', () => {
    elements.kbSearchInput.value = '';
    state.searchQuery = '';
    elements.kbClearSearch.style.display = 'none';
    renderKnowledgeBase();
  });

  // Inspector Sandbox
  elements.btnRunAnalysis.addEventListener('click', () => {
    const q = elements.inspectorInput.value.trim();
    if (q) runNlpAnalysis(q);
  });

  // Manage Filter
  elements.manageFilterInput.addEventListener('input', (e) => {
    renderAdminTable(e.target.value.trim().toLowerCase());
  });

  // Modal Events
  elements.modalCloseBtn.addEventListener('click', closeFaqModal);
  elements.modalCancelBtn.addEventListener('click', closeFaqModal);
  elements.faqModal.addEventListener('click', (e) => {
    if (e.target === elements.faqModal) closeFaqModal();
  });
  elements.modalCategorySelect.addEventListener('change', (e) => {
    if (e.target.value === 'custom') {
      elements.modalCategoryCustom.classList.remove('hidden');
      elements.modalCategoryCustom.focus();
    } else {
      elements.modalCategoryCustom.classList.add('hidden');
    }
  });
  elements.faqModalForm.addEventListener('submit', handleSaveFaq);
}

/* ==========================================================================
   Tab Navigation
   ========================================================================== */
function switchTab(tabId) {
  state.activeTab = tabId;

  elements.navBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  elements.tabPanes.forEach(pane => {
    pane.classList.toggle('active', pane.id === `pane-${tabId}`);
  });

  if (tabMeta[tabId]) {
    elements.pageTitle.textContent = tabMeta[tabId].title;
    elements.pageDesc.textContent = tabMeta[tabId].desc;
  }

  if (tabId === 'knowledge') {
    renderKnowledgeBase();
  } else if (tabId === 'manage') {
    renderAdminTable();
  }
}

/* ==========================================================================
   API Communication: Health, Categories, FAQs
   ========================================================================== */
async function fetchHealth() {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    if (!res.ok) throw new Error('API offline');
    const data = await res.json();
    state.health = data;

    elements.healthDot.className = 'status-dot online';
    elements.healthStatusText.textContent = `${data.service} Active`;
    elements.healthFeatures.textContent = `Indexed Vocab: ${data.indexed_features}`;
    elements.healthThreshold.textContent = `Match Threshold: ${data.default_threshold}`;
    elements.navFaqCount.textContent = data.total_faqs;
    elements.manageVectorVocab.textContent = data.indexed_features;
  } catch (err) {
    elements.healthDot.className = 'status-dot offline';
    elements.healthStatusText.textContent = 'Backend Offline';
    elements.healthFeatures.textContent = 'Port 5000 unavailable';
    console.error('Health check failed:', err);
  }
}

async function fetchCategories() {
  try {
    const res = await fetch(`${API_BASE}/api/faqs/categories`);
    const data = await res.json();
    if (data.success) {
      state.categories = data.categories;
      renderCategoryPills();
      elements.manageTotalCats.textContent = state.categories.length > 0 ? state.categories.length - 1 : 0;
    }
  } catch (err) {
    console.error('Error fetching categories:', err);
  }
}

async function fetchFaqs() {
  try {
    const res = await fetch(`${API_BASE}/api/faqs`);
    const data = await res.json();
    if (data.success) {
      state.faqs = data.faqs;
      elements.navFaqCount.textContent = state.faqs.length;
      elements.manageTotalFaqs.textContent = state.faqs.length;
      renderKnowledgeBase();
      renderAdminTable();
    }
  } catch (err) {
    console.error('Error fetching FAQs:', err);
    showToast('Failed to load FAQs from server.', 'error');
  }
}

/* ==========================================================================
   Chat Assistant
   ========================================================================== */
function handleChatInput() {
  const length = elements.chatInput.value.length;
  elements.chatCharCount.textContent = `${length}/500`;
  elements.chatClearBtn.style.display = length > 0 ? 'flex' : 'none';

  // Auto-grow height
  elements.chatInput.style.height = 'auto';
  elements.chatInput.style.height = Math.min(elements.chatInput.scrollHeight, 120) + 'px';
}

async function handleChatSubmit(e) {
  if (e) e.preventDefault();
  const question = elements.chatInput.value.trim();
  if (!question) return;

  state.lastQuery = question;

  // Append user bubble
  appendMessage({
    sender: 'user',
    text: question
  });

  // Reset input
  elements.chatInput.value = '';
  handleChatInput();

  // Show typing indicator
  const typingIndicator = appendTypingIndicator();

  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    });

    const data = await res.json();
    typingIndicator.remove();

    if (data.success) {
      appendMessage({
        sender: 'bot',
        text: data.answer,
        confidence: data.confidence_percentage,
        confidenceLevel: data.confidence_level,
        isFallback: data.is_fallback,
        matchedQuestion: data.matched_question,
        category: data.matched_faq ? data.matched_faq.category : null,
        suggestions: data.alternative_suggestions || [],
        userQuery: question
      });
    } else {
      appendMessage({
        sender: 'bot',
        text: data.error || 'Sorry, I encountered an issue processing your query.',
        isFallback: true
      });
    }
  } catch (err) {
    typingIndicator.remove();
    console.error('Chat error:', err);
    appendMessage({
      sender: 'bot',
      text: 'Cannot reach the AskSphere AI backend server. Please verify Flask is running on port 5000.',
      isFallback: true
    });
  }
}

function appendTypingIndicator() {
  const wrapper = document.createElement('div');
  wrapper.className = 'message-wrapper bot';
  wrapper.innerHTML = `
    <div class="avatar bot-avatar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M12 6v6l4 2"></path>
      </svg>
    </div>
    <div class="message-bubble bot-bubble">
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;
  elements.chatMessages.appendChild(wrapper);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
  return wrapper;
}

function appendMessage(msg) {
  const wrapper = document.createElement('div');
  wrapper.className = `message-wrapper ${msg.sender}`;

  if (msg.sender === 'user') {
    wrapper.innerHTML = `
      <div class="avatar user-avatar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
      </div>
      <div class="message-bubble user-bubble">
        <p>${escapeHtml(msg.text)}</p>
      </div>
    `;
  } else {
    // Confidence class
    let confClass = 'high';
    if (msg.isFallback || msg.confidence < 35) confClass = 'fallback';
    else if (msg.confidence < 50) confClass = 'possible';
    else if (msg.confidence < 70) confClass = 'good';

    const confBadge = msg.confidence !== undefined
      ? `<span class="confidence-tag ${confClass}">🎯 ${msg.confidence}% (${msg.confidenceLevel || ''})</span>`
      : '';

    const matchedPill = msg.matchedQuestion
      ? `<div class="matched-pill">🏷️ Matched: <strong>${escapeHtml(msg.matchedQuestion)}</strong> ${msg.category ? `(${escapeHtml(msg.category)})` : ''}</div>`
      : '';

    let suggestionsHtml = '';
    if (msg.suggestions && msg.suggestions.length > 0) {
      suggestionsHtml = `
        <div class="quick-prompts-wrapper">
          <span class="prompts-label">Related or alternative inquiries:</span>
          <div class="prompts-list">
            ${msg.suggestions.map(s => `
              <button class="prompt-chip" data-prompt="${escapeHtml(s.question)}">
                🔍 ${escapeHtml(s.question)} <span style="opacity:0.6">(${s.confidence_percentage}%)</span>
              </button>
            `).join('')}
          </div>
        </div>
      `;
    }

    const inspectBtnHtml = msg.userQuery ? `
      <div class="bubble-footer">
        <button class="inspect-btn" onclick="inspectDirectly('${encodeURIComponent(msg.userQuery)}')">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
          </svg>
          Inspect NLP Pipeline
        </button>
      </div>
    ` : '';

    wrapper.innerHTML = `
      <div class="avatar bot-avatar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z"></path>
          <path d="M2 12h20"></path>
        </svg>
      </div>
      <div class="message-bubble bot-bubble">
        <div class="bubble-header">
          <span class="bot-name">AskSphere AI</span>
          ${confBadge}
        </div>
        ${matchedPill}
        <div class="bubble-body">
          <p>${escapeHtml(msg.text)}</p>
        </div>
        ${suggestionsHtml}
        ${inspectBtnHtml}
      </div>
    `;
  }

  elements.chatMessages.appendChild(wrapper);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

window.inspectDirectly = function(encodedQuery) {
  const query = decodeURIComponent(encodedQuery);
  elements.inspectorInput.value = query;
  switchTab('inspector');
  runNlpAnalysis(query);
};

/* ==========================================================================
   Knowledge Base Explorer
   ========================================================================== */
function renderCategoryPills() {
  elements.kbCategoryPills.innerHTML = '';
  state.categories.forEach(cat => {
    const pill = document.createElement('button');
    pill.className = `cat-pill ${cat.name === state.selectedCategory ? 'active' : ''}`;
    pill.innerHTML = `
      <span>${escapeHtml(cat.name)}</span>
      <span class="count">${cat.count}</span>
    `;
    pill.addEventListener('click', () => {
      state.selectedCategory = cat.name;
      renderCategoryPills();
      renderKnowledgeBase();
    });
    elements.kbCategoryPills.appendChild(pill);
  });
}

function renderKnowledgeBase() {
  const query = state.searchQuery.toLowerCase();
  const selectedCat = state.selectedCategory;

  let filtered = state.faqs;

  if (selectedCat !== 'All') {
    filtered = filtered.filter(f => f.category.toLowerCase() === selectedCat.toLowerCase());
  }

  if (query) {
    filtered = filtered.filter(f => 
      f.question.toLowerCase().includes(query) ||
      f.answer.toLowerCase().includes(query) ||
      (f.keywords && f.keywords.some(k => k.toLowerCase().includes(query)))
    );
  }

  if (filtered.length === 0) {
    elements.kbGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
        <p style="font-size: 1.1rem; font-weight: 600; margin-bottom: 8px;">No matching FAQs found</p>
        <p style="font-size: 0.85rem;">Try adjusting your search terms or category filter.</p>
      </div>
    `;
    return;
  }

  elements.kbGrid.innerHTML = filtered.map(faq => `
    <div class="faq-card">
      <div class="faq-card-header">
        <span class="cat-badge">${escapeHtml(faq.category)}</span>
        <span class="faq-id">#${faq.id}</span>
      </div>
      <h3>${escapeHtml(faq.question)}</h3>
      <p>${escapeHtml(faq.answer)}</p>
      ${faq.keywords && faq.keywords.length > 0 ? `
        <div class="keywords-list">
          ${faq.keywords.map(kw => `<span class="keyword-tag">#${escapeHtml(kw)}</span>`).join('')}
        </div>
      ` : ''}
      <div class="faq-card-footer">
        <button class="test-ask-btn" onclick="testAskInChat('${encodeURIComponent(faq.question)}')">
          💬 Ask in Chat
        </button>
      </div>
    </div>
  `).join('');
}

window.testAskInChat = function(encodedQuestion) {
  const question = decodeURIComponent(encodedQuestion);
  elements.chatInput.value = question;
  switchTab('chat');
  handleChatSubmit(new Event('submit'));
};

/* ==========================================================================
   NLP Inspector & Sandbox
   ========================================================================== */
async function runNlpAnalysis(question) {
  if (!question) return;

  elements.btnRunAnalysis.disabled = true;
  elements.btnRunAnalysis.innerHTML = '<span>Analyzing...</span>';

  try {
    const res = await fetch(`${API_BASE}/api/chat/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    });

    const data = await res.json();
    elements.btnRunAnalysis.disabled = false;
    elements.btnRunAnalysis.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
      <span>Run Analysis</span>
    `;

    if (data.success) {
      // 1. Cleaned Query
      elements.inspectCleaned.textContent = data.cleaned_text || '(empty)';

      // 2. Tokens
      elements.inspectTokens.innerHTML = data.tokens.length > 0
        ? data.tokens.map(t => `<span class="token-pill">${escapeHtml(t)}</span>`).join('')
        : '<span style="color:var(--text-muted)">(none)</span>';

      // 3. Stopwords Removed
      elements.inspectStopwords.innerHTML = data.stopwords_removed.length > 0
        ? data.stopwords_removed.map(t => `<span class="token-pill removed">${escapeHtml(t)}</span>`).join('')
        : '<span style="color:var(--text-muted)">No stopwords detected</span>';

      // 4. Lemmatized Tokens
      elements.inspectLemmas.innerHTML = data.lemmas.length > 0
        ? data.lemmas.map(t => `<span class="token-pill lemma">${escapeHtml(t)}</span>`).join('')
        : '<span style="color:var(--text-muted)">(none)</span>';

      // 5. Similarity Breakdown Table
      elements.inspectSimTbody.innerHTML = data.similarity_breakdown.map((item, idx) => {
        let tagClass = 'high';
        if (item.confidence_percentage < 35) tagClass = 'fallback';
        else if (item.confidence_percentage < 50) tagClass = 'possible';
        else if (item.confidence_percentage < 70) tagClass = 'good';

        return `
          <tr>
            <td><strong>#${idx + 1}</strong></td>
            <td><span class="cat-badge">${escapeHtml(item.category)}</span></td>
            <td>${escapeHtml(item.question)}</td>
            <td><code>${item.question_sim}</code></td>
            <td><code>${item.keyword_sim}</code></td>
            <td>
              <div class="score-progress">
                <div class="score-bar-bg">
                  <div class="score-bar-fill" style="width: ${item.confidence_percentage}%"></div>
                </div>
                <code>${item.final_similarity}</code>
              </div>
            </td>
            <td>
              <span class="confidence-tag ${tagClass}">
                ${item.confidence_percentage}%
              </span>
            </td>
          </tr>
        `;
      }).join('');
    } else {
      showToast(data.error || 'Failed to analyze query.', 'error');
    }
  } catch (err) {
    elements.btnRunAnalysis.disabled = false;
    elements.btnRunAnalysis.innerHTML = '<span>Run Analysis</span>';
    console.error('Error analyzing query:', err);
    showToast('Failed to connect to inspection endpoint.', 'error');
  }
}

/* ==========================================================================
   Manage FAQs (CRUD)
   ========================================================================== */
function renderAdminTable(filter = '') {
  let list = state.faqs;
  if (filter) {
    list = list.filter(f => 
      f.question.toLowerCase().includes(filter) ||
      f.category.toLowerCase().includes(filter) ||
      f.answer.toLowerCase().includes(filter)
    );
  }

  elements.faqsAdminTbody.innerHTML = list.map(faq => `
    <tr>
      <td><code>#${faq.id}</code></td>
      <td><span class="cat-badge">${escapeHtml(faq.category)}</span></td>
      <td><strong>${escapeHtml(faq.question)}</strong></td>
      <td style="color:var(--text-secondary); max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${escapeHtml(faq.answer)}
      </td>
      <td>
        <div style="display: flex; gap: 4px; flex-wrap: wrap;">
          ${(faq.keywords || []).slice(0, 3).map(kw => `<span class="keyword-tag">#${escapeHtml(kw)}</span>`).join('')}
          ${(faq.keywords || []).length > 3 ? `<span class="keyword-tag">+${faq.keywords.length - 3}</span>` : ''}
        </div>
      </td>
      <td>
        <div class="table-actions">
          <button class="btn-icon-action" onclick="openFaqModal(${faq.id})" title="Edit FAQ">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="btn-icon-action delete" onclick="deleteFaq(${faq.id})" title="Delete FAQ">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openFaqModal(faqId = null) {
  elements.faqModalForm.reset();
  elements.modalCategoryCustom.classList.add('hidden');

  if (faqId) {
    const faq = state.faqs.find(f => f.id === faqId);
    if (!faq) return;

    elements.modalTitle.textContent = `Edit Knowledge Entry #${faq.id}`;
    elements.modalFaqId.value = faq.id;
    elements.modalQuestion.value = faq.question;
    elements.modalAnswer.value = faq.answer;
    elements.modalKeywords.value = (faq.keywords || []).join(', ');

    // Set category select or custom
    const options = Array.from(elements.modalCategorySelect.options).map(o => o.value);
    if (options.includes(faq.category)) {
      elements.modalCategorySelect.value = faq.category;
    } else {
      elements.modalCategorySelect.value = 'custom';
      elements.modalCategoryCustom.classList.remove('hidden');
      elements.modalCategoryCustom.value = faq.category;
    }
  } else {
    elements.modalTitle.textContent = 'Add Knowledge Entry';
    elements.modalFaqId.value = '';
    elements.modalCategorySelect.value = 'Account';
  }

  elements.faqModal.classList.add('active');
}

function closeFaqModal() {
  elements.faqModal.classList.remove('active');
}

async function handleSaveFaq(e) {
  e.preventDefault();
  const faqId = elements.modalFaqId.value ? parseInt(elements.modalFaqId.value) : null;

  let category = elements.modalCategorySelect.value;
  if (category === 'custom') {
    category = elements.modalCategoryCustom.value.trim() || 'General';
  }

  const question = elements.modalQuestion.value.trim();
  const answer = elements.modalAnswer.value.trim();
  const keywords = elements.modalKeywords.value
    .split(',')
    .map(k => k.trim())
    .filter(k => k.length > 0);

  if (!question || !answer) {
    showToast('Question and Answer are required.', 'error');
    return;
  }

  const payload = { category, question, answer, keywords };

  try {
    let res;
    if (faqId) {
      // Update
      res = await fetch(`${API_BASE}/api/faqs/${faqId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      // Create
      res = await fetch(`${API_BASE}/api/faqs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    const data = await res.json();
    if (data.success) {
      closeFaqModal();
      showToast(data.message || 'Saved successfully and reindexed matcher.', 'success');
      await fetchFaqs();
      await fetchCategories();
      await fetchHealth();
    } else {
      showToast(data.error || 'Failed to save FAQ.', 'error');
    }
  } catch (err) {
    console.error('Error saving FAQ:', err);
    showToast('Failed to save FAQ. Backend might be unreachable.', 'error');
  }
}

window.deleteFaq = async function(faqId) {
  if (!confirm(`Are you sure you want to delete FAQ #${faqId}? This will re-train the vectorizer index.`)) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/faqs/${faqId}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      showToast(`FAQ #${faqId} deleted successfully.`, 'info');
      await fetchFaqs();
      await fetchCategories();
      await fetchHealth();
    } else {
      showToast(data.error || 'Failed to delete FAQ.', 'error');
    }
  } catch (err) {
    console.error('Error deleting FAQ:', err);
    showToast('Failed to delete FAQ.', 'error');
  }
};

/* ==========================================================================
   Utilities: Toast & Sanitization
   ========================================================================== */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
    <span>${escapeHtml(message)}</span>
  `;
  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
