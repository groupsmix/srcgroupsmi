// ═══════════════════════════════════════
// GROUPSMIX AI CHATBOT — Client Widget
// Smart AI assistant with OpenRouter
// + Store context awareness
// ═══════════════════════════════════════

(function() {
    'use strict';

    /* ── Config ──────────────────────────── */
    var API_URL = '/api/chat';
    var MAX_HISTORY = 10;
    var STORAGE_KEY = 'gm_chat_history';

    /* ── State ───────────────────────────── */
    var isOpen = false;
    var isStreaming = false;
    var chatHistory = [];
    var elements = {};

    /* ── SVG Icons ────────────────────────── */
    var ICONS = {
        bot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect x="2" y="8" width="20" height="12" rx="2"/><path d="M6 12h.01"/><path d="M18 12h.01"/><path d="M9 16s.9 1 3 1 3-1 3-1"/></svg>',
        close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
        minimize: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>'
    };

    /* ── Detect language from browser ─────── */
    function detectLanguage() {
        var lang = (navigator.language || navigator.userLanguage || 'en').substring(0, 2).toLowerCase();
        return lang;
    }

    /* ── Feature 11: Context-Aware Page Detection ── */
    function getPageContext() {
        var path = window.location.pathname;
        if (path === '/jobs' || path === '/jobs.html') return 'jobs';
        if (path === '/marketplace' || path === '/marketplace.html') return 'marketplace';
        if (path === '/submit' || path === '/submit.html') return 'submit';
        if (path === '/search' || path === '/search.html') return 'search';
        if (path === '/sell' || path === '/sell.html') return 'sell';
        if (path === '/store' || path === '/store.html') return 'store';
        if (path.indexOf('/tools/') !== -1) return 'tools';
        if (path.indexOf('/groups/profile') !== -1) return 'profile';
        if (path.indexOf('/browse/') !== -1) return 'browse';
        return 'home';
    }

    /* ── Get store product context for AI ──── */
    function getStoreContextString() {
        if (typeof window.StoreContext === 'undefined' || !window.StoreContext.products) return '';
        var products = window.StoreContext.products;
        if (!products.length) return '';
        var list = products.slice(0, 10).map(function(p) {
            return '- ' + p.name + ' (' + (p.price_formatted || 'Free') + ') — ' + (p.product_type || 'digital');
        }).join('\n');
        return '\n\nAvailable store products:\n' + list;
    }

    /* ── Welcome messages by language (context-aware) ── */
    function getWelcomeMessage() {
        var lang = detectLanguage();
        var context = getPageContext();

        // Context-specific quick actions override
        var contextQuickActions = {
            'jobs': {
                'ar': [
                    { text: 'ابحث عن وظيفة', query: 'أريد البحث عن وظيفة' },
                    { text: 'كيف أنشر وظيفة؟', query: 'كيف أنشر وظيفة على GroupsMix؟' },
                    { text: 'ما هو GroupsMix؟', query: 'ما هو موقع GroupsMix وكيف يعمل؟' }
                ],
                'default': [
                    { text: 'Find a job', query: 'Help me find a community management job' },
                    { text: 'Post a job', query: 'How do I post a job listing?' },
                    { text: 'What is GroupsMix?', query: 'What is GroupsMix and how does it work?' }
                ]
            },
            'marketplace': {
                'ar': [
                    { text: 'كيف أبيع؟', query: 'كيف أبيع قروب أو قناة؟' },
                    { text: 'هل الشراء آمن؟', query: 'هل الشراء من الماركت آمن؟' },
                    { text: 'ما هو GroupsMix؟', query: 'ما هو موقع GroupsMix وكيف يعمل؟' }
                ],
                'default': [
                    { text: 'How to sell?', query: 'How do I sell a group or channel on the marketplace?' },
                    { text: 'Is buying safe?', query: 'Is buying from the marketplace safe?' },
                    { text: 'What is GroupsMix?', query: 'What is GroupsMix and how does it work?' }
                ]
            },
            'submit': {
                'ar': [
                    { text: 'نصائح للقبول', query: 'كيف أضمن قبول قروبي؟' },
                    { text: 'مساعدة في الوصف', query: 'ساعدني في كتابة وصف قروبي' },
                    { text: 'ما هو GroupsMix؟', query: 'ما هو موقع GroupsMix وكيف يعمل؟' }
                ],
                'default': [
                    { text: 'Tips for approval', query: 'What tips help my group get approved faster?' },
                    { text: 'Help with description', query: 'Help me write a good group description' },
                    { text: 'What is GroupsMix?', query: 'What is GroupsMix and how does it work?' }
                ]
            },
            'search': {
                'ar': [
                    { text: 'بحث ذكي', query: 'أريد قروب تداول عملات رقمية على تليجرام' },
                    { text: 'فلتر المنصة', query: 'كيف أفلتر حسب المنصة؟' },
                    { text: 'ما هو GroupsMix؟', query: 'ما هو موقع GroupsMix وكيف يعمل؟' }
                ],
                'default': [
                    { text: 'Smart search', query: 'I want crypto trading groups on Telegram with over 1000 members' },
                    { text: 'Filter help', query: 'How do I filter groups by platform?' },
                    { text: 'What is GroupsMix?', query: 'What is GroupsMix and how does it work?' }
                ]
            },
            'store': {
                'ar': [
                    { text: 'ماذا تنصحني؟', query: 'ما المنتج الأنسب لي لتنمية مجتمعي؟' },
                    { text: 'أريد أدوات للقروبات', query: 'أريد أدوات وموارد لتنمية قروبي' },
                    { text: 'عروض وباقات', query: 'هل يوجد عروض أو باقات خاصة؟' },
                    { text: 'ما هو GroupsMix؟', query: 'ما هو موقع GroupsMix وكيف يعمل؟' }
                ],
                'default': [
                    { text: 'Recommend a product', query: 'What product do you recommend for growing my community?' },
                    { text: 'Community tools', query: 'I need tools and resources to grow my group' },
                    { text: 'Deals & bundles', query: 'Are there any deals or bundles available?' },
                    { text: 'What is GroupsMix?', query: 'What is GroupsMix and how does it work?' }
                ]
            }
        };

        // Context-specific subtitles
        var contextSubtitles = {
            'jobs': { 'ar': 'هل تبحث عن وظيفة؟ خلني أساعدك!', 'default': 'Looking for a job? I can help!' },
            'marketplace': { 'ar': 'هل تريد بيع أو شراء؟', 'default': 'Want to buy or sell?' },
            'submit': { 'ar': 'محتاج مساعدة في إضافة قروبك؟', 'default': 'Need help adding your group?' },
            'search': { 'ar': 'خلني أساعدك في البحث!', 'default': 'Let me help you find the perfect group!' },
            'store': { 'ar': 'تحتاج مساعدة في اختيار المنتج المناسب؟', 'default': 'Need help finding the right product?' }
        };

        var messages = {
            'ar': {
                greeting: 'مرحبا! أنا مساعد GroupsMix الذكي',
                subtitle: 'كيف يمكنني مساعدتك اليوم؟',
                quickActions: [
                    { text: 'ابحث عن قروب', query: 'أريد البحث عن قروب' },
                    { text: 'كيف أضيف قروبي؟', query: 'كيف أضيف قروبي في الموقع؟' },
                    { text: 'أدوات الذكاء الاصطناعي', query: 'ما هي أدوات الذكاء الاصطناعي المتوفرة؟' },
                    { text: 'ما هو GroupsMix؟', query: 'ما هو موقع GroupsMix وكيف يعمل؟' }
                ]
            },
            'default': {
                greeting: 'Hi! I\'m GroupsMix AI Assistant',
                subtitle: 'How can I help you today?',
                quickActions: [
                    { text: 'Find a group', query: 'I want to find a group' },
                    { text: 'Submit my group', query: 'How do I submit my group?' },
                    { text: 'AI Tools', query: 'What AI tools are available?' },
                    { text: 'What is GroupsMix?', query: 'What is GroupsMix and how does it work?' }
                ]
            }
        };
        var base = messages[lang] || messages.default;

        // Override with context-specific actions if available
        if (contextQuickActions[context]) {
            var ctxActions = contextQuickActions[context][lang] || contextQuickActions[context].default;
            if (ctxActions) base.quickActions = ctxActions;
        }
        if (contextSubtitles[context]) {
            var ctxSub = contextSubtitles[context][lang] || contextSubtitles[context].default;
            if (ctxSub) base.subtitle = ctxSub;
        }

        return base;
    }

    /* ── Simple Markdown Parser ──────────── */
    function parseMarkdown(text) {
        if (!text) return '';
        // Sanitize HTML
        var s = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        // Bold
        s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        // Links [text](url)
        s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
        // Plain URLs
        s = s.replace(/(^|[\s(])(https?:\/\/[^\s)<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
        // Unordered lists
        s = s.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
        s = s.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
        // Ordered lists
        s = s.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
        // Inline code
        s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
        // Paragraphs (double newline)
        s = s.replace(/\n\n/g, '</p><p>');
        // Single newlines -> <br>
        s = s.replace(/\n/g, '<br>');
        // Wrap in paragraph
        s = '<p>' + s + '</p>';
        // Clean empty paragraphs
        s = s.replace(/<p><\/p>/g, '');
        return s;
    }

    /* ── Load/Save History ────────────────── */
    function loadHistory() {
        var data = SafeStorage.getJSON(STORAGE_KEY, null);
        chatHistory = Array.isArray(data) ? data : [];
    }

    function saveHistory() {
        // Keep only last MAX_HISTORY messages
        SafeStorage.setJSON(STORAGE_KEY, chatHistory.slice(-MAX_HISTORY));
    }

    /* ── Build DOM ────────────────────────── */
    function buildWidget() {
        // No floating FAB — chatbot is triggered from bottom nav AI Chat button
        elements.fab = null;

        // Chat window
        var win = document.createElement('div');
        win.className = 'chatbot-window';
        win.id = 'chatbot-window';
        win.setAttribute('role', 'dialog');
        win.setAttribute('aria-label', 'AI Chat Assistant');

        var _welcome = getWelcomeMessage();
        var placeholderText = detectLanguage() === 'ar' ? 'اكتب رسالتك...' : 'Type your message...';

        win.innerHTML =
            '<div class="chatbot-header">' +
                '<div class="chatbot-header__avatar">' + ICONS.bot + '</div>' +
                '<div class="chatbot-header__info">' +
                    '<div class="chatbot-header__name">GroupsMix AI</div>' +
                    '<div class="chatbot-header__status">Online</div>' +
                '</div>' +
                '<button class="chatbot-header__close" id="chatbot-close" aria-label="Close chat">' + ICONS.close + '</button>' +
            '</div>' +
            '<div class="chatbot-messages" id="chatbot-messages"></div>' +
            '<div class="chatbot-input-area">' +
                '<textarea class="chatbot-input" id="chatbot-input" placeholder="' + placeholderText + '" rows="1" maxlength="2000"></textarea>' +
                '<button class="chatbot-send-btn" id="chatbot-send" aria-label="Send message">' + ICONS.send + '</button>' +
            '</div>' +
            '<div class="chatbot-footer">Powered by GroupsMix AI</div>';

        document.body.appendChild(win);
        elements.window = win;
        elements.messages = document.getElementById('chatbot-messages');
        elements.input = document.getElementById('chatbot-input');
        elements.sendBtn = document.getElementById('chatbot-send');

        // Event listeners (no FAB — chatbot opened from bottom nav)
        document.getElementById('chatbot-close').addEventListener('click', toggleChat);
        elements.sendBtn.addEventListener('click', sendMessage);
        elements.input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        elements.input.addEventListener('input', function() {
            updateSendButton();
            autoResize(elements.input);
        });

        // Close on Escape
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && isOpen) toggleChat();
        });
    }

    /* ── Auto-resize textarea ────────────── */
    function autoResize(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
    }

    /* ── Update send button state ────────── */
    function updateSendButton() {
        var hasText = elements.input.value.trim().length > 0;
        if (hasText && !isStreaming) {
            elements.sendBtn.classList.add('chatbot-send-btn--active');
        } else {
            elements.sendBtn.classList.remove('chatbot-send-btn--active');
        }
    }

    /* ── Toggle Chat Open/Close ──────────── */
    function toggleChat() {
        isOpen = !isOpen;
        elements.window.classList.toggle('chatbot-window--open', isOpen);

        if (isOpen) {
            // Show welcome or history
            if (!elements.messages.children.length) {
                showWelcome();
            }
            // Focus input
            setTimeout(function() { elements.input.focus(); }, 300);
        }
    }

    /* ── Show Welcome Message ────────────── */
    function showWelcome() {
        var welcome = getWelcomeMessage();

        // Restore history if exists
        if (chatHistory.length > 0) {
            for (var i = 0; i < chatHistory.length; i++) {
                var msg = chatHistory[i];
                appendMessage(msg.role === 'user' ? 'user' : 'bot', msg.content, true);
            }
            scrollToBottom();
            return;
        }

        // Welcome message
        var welcomeHtml =
            '<strong>' + welcome.greeting + '</strong><br>' +
            welcome.subtitle;

        appendMessage('bot', welcomeHtml, true);

        // Quick action buttons
        var quickDiv = document.createElement('div');
        quickDiv.className = 'chatbot-quick-actions';
        for (var j = 0; j < welcome.quickActions.length; j++) {
            var action = welcome.quickActions[j];
            var btn = document.createElement('button');
            btn.className = 'chatbot-quick-btn';
            btn.textContent = action.text;
            btn.setAttribute('data-query', action.query);
            btn.addEventListener('click', function() {
                var query = this.getAttribute('data-query');
                elements.input.value = query;
                sendMessage();
            });
            quickDiv.appendChild(btn);
        }
        elements.messages.appendChild(quickDiv);
    }

    /* ── Append Message Bubble ────────────── */
    function appendMessage(type, content, isHtml) {
        var div = document.createElement('div');
        div.className = 'chatbot-msg chatbot-msg--' + type;
        if (isHtml) {
            div.innerHTML = content;
        } else {
            div.innerHTML = type === 'bot' ? parseMarkdown(content) : escapeHtml(content);
        }
        elements.messages.appendChild(div);
        scrollToBottom();
        return div;
    }

    /* ── Escape HTML ─────────────────────── */
    function escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /* ── Show Typing Indicator ────────────── */
    function showTyping() {
        var div = document.createElement('div');
        div.className = 'chatbot-typing';
        div.id = 'chatbot-typing';
        div.innerHTML =
            '<div class="chatbot-typing__dot"></div>' +
            '<div class="chatbot-typing__dot"></div>' +
            '<div class="chatbot-typing__dot"></div>';
        elements.messages.appendChild(div);
        scrollToBottom();
    }

    function hideTyping() {
        var typing = document.getElementById('chatbot-typing');
        if (typing) typing.remove();
    }

    /* ── Scroll to Bottom ────────────────── */
    function scrollToBottom() {
        var el = elements.messages;
        setTimeout(function() {
            el.scrollTop = el.scrollHeight;
        }, 50);
    }

    /* ── Send Message ────────────────────── */
    function sendMessage() {
        var text = elements.input.value.trim();
        if (!text || isStreaming) return;

        // Remove quick actions if present
        var quickActions = elements.messages.querySelector('.chatbot-quick-actions');
        if (quickActions) quickActions.remove();

        // Show user message
        appendMessage('user', text, false);

        // Add to history
        chatHistory.push({ role: 'user', content: text });

        // Clear input
        elements.input.value = '';
        elements.input.style.height = 'auto';
        updateSendButton();

        // Show typing
        showTyping();
        isStreaming = true;
        updateSendButton();

        // Send to API
        streamResponse(text);
    }

    /* ── Stream AI Response ───────────────── */
    function streamResponse() {
        // Build messages for API (only role + content)
        var apiMessages = [];

        // Inject store context as a system-level hint if on store page
        var context = getPageContext();
        if (context === 'store') {
            var storeCtx = getStoreContextString();
            if (storeCtx) {
                apiMessages.push({
                    role: 'user',
                    content: '[System context: The user is browsing the GroupsMix Store page. Here are the available products they can purchase:' + storeCtx + '\nHelp them find the right product. You can suggest products from this list when relevant. Always include the product name and price.]'
                });
                apiMessages.push({
                    role: 'assistant',
                    content: 'Understood, I have the store product catalog context and will help the user find the right products.'
                });
            }
        }

        for (var i = 0; i < chatHistory.length; i++) {
            apiMessages.push({
                role: chatHistory[i].role === 'user' ? 'user' : 'assistant',
                content: chatHistory[i].content
            });
        }

        fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: apiMessages })
        })
        .then(function(response) {
            if (!response.ok) {
                throw new Error('API error: ' + response.status);
            }

            hideTyping();

            // Create bot message bubble for streaming
            var botDiv = appendMessage('bot', '', true);
            var fullText = '';

            var reader = response.body.getReader();
            var decoder = new TextDecoder();
            var buffer = '';

            function processStream() {
                return reader.read().then(function(result) {
                    if (result.done) {
                        // Stream complete
                        chatHistory.push({ role: 'assistant', content: fullText });
                        saveHistory();
                        isStreaming = false;
                        updateSendButton();
                        // Final render with markdown
                        botDiv.innerHTML = parseMarkdown(fullText);
                        scrollToBottom();
                        return;
                    }

                    buffer += decoder.decode(result.value, { stream: true });
                    var lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (var j = 0; j < lines.length; j++) {
                        var line = lines[j].trim();
                        if (!line || !line.startsWith('data: ')) continue;
                        var data = line.slice(6);
                        if (data === '[DONE]') continue;
                        try {
                            var parsed = JSON.parse(data);
                            if (parsed.text) {
                                fullText += parsed.text;
                                // Update bubble with raw text during streaming
                                botDiv.innerHTML = parseMarkdown(fullText) + '<span class="chatbot-cursor">|</span>';
                                scrollToBottom();
                            }
                        } catch (_e) {
                            // Skip malformed data
                        }
                    }

                    return processStream();
                });
            }

            return processStream();
        })
        .catch(function(err) {
            console.error('Chatbot error:', err);
            hideTyping();
            isStreaming = false;
            updateSendButton();

            var errorMsg = detectLanguage() === 'ar'
                ? 'عذرا، حدث خطأ. حاول مرة أخرى.'
                : 'Sorry, something went wrong. Please try again.';
            appendMessage('bot', errorMsg, false);
        });
    }

    /* ── Initialize ──────────────────────── */
    function init() {
        // Don't load on admin pages
        if (window.location.pathname.indexOf('gm-ctrl') !== -1) return;

        loadHistory();
        buildWidget();

        // Expose toggle globally so bottom nav AI Chat button can open it
        window.toggleChatbot = toggleChat;
    }

    // Wait for DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
