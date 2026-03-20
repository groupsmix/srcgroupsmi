// ═══════════════════════════════════════
// SVG ICONS SYSTEM
// Professional inline SVG icons replacing emojis
// ═══════════════════════════════════════
const ICONS = {
    // ── Platform Icons (Official Brand SVGs) ──
    whatsapp: '<svg class="svg-icon svg-icon--whatsapp" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>',
    whatsapp_channel: '<svg class="svg-icon svg-icon--whatsapp-channel" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>',
    telegram: '<svg class="svg-icon svg-icon--telegram" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>',
    telegram_channel: '<svg class="svg-icon svg-icon--telegram-channel" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>',
    discord: '<svg class="svg-icon svg-icon--discord" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1569 2.4189z"/></svg>',
    facebook: '<svg class="svg-icon svg-icon--facebook" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
    // ── UI Icons (Linear/Stroke Style) ──
    search: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    upload: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    rocket: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>',
    tools: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>',
    star: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    fire: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/></svg>',
    sparkles: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z"/></svg>',
    smartphone: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>',
    globe: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>',
    folder: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>',
    lightbulb: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z"/></svg>',
    shield: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    check_circle: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    ban: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>',
    chart: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    users: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
    party: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5.8 11.3L2 22l10.7-3.79"/><path d="M4 3h.01"/><path d="M22 8h.01"/><path d="M15 2h.01"/><path d="M22 20h.01"/><path d="M22 2l-2.24.75a2.9 2.9 0 00-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"/><path d="M22 13l-1.34-.45a2.9 2.9 0 00-3.12 1.96 1.53 1.53 0 01-1.63 1.45c-.86 0-1.6.6-1.76 1.44L14 22"/></svg>',
    home: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    bell: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>',
    user: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    megaphone: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l18-5v12L3 13v-2z"/><path d="M11.6 16.8a3 3 0 11-5.8-1.6"/></svg>',
    shopping_cart: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>',
    store: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/></svg>',
    briefcase: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>',
    trophy: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 010-5H6"/><path d="M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0012 0V2z"/></svg>',
    lock: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>',
    file_text: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    clipboard: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>',
    newspaper: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-2 2zm0 0a2 2 0 01-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8z"/></svg>',
    info: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    phone: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>',
    help_circle: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    graduation: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>',
    heart: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>',
    log_out: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    sun: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
    moon: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>',
    zap: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    menu: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
    settings: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
    dashboard: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
    edit: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    eye: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    eye_off: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
    arrow_right: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
    chevron_down: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
    x_circle: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    message_circle: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>',
    plus: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    clock: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    mail: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></svg>',
    refresh: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>',
    warning: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    inbox: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>',
    frown: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
    // ── Category Icons ──
    bitcoin: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11.767 19.089c4.924.868 6.14-6.025 1.216-6.894m-1.216 6.894L5.86 18.047m5.908 1.042-.347 1.97m1.563-8.864c4.924.869 6.14-6.025 1.215-6.893m-1.215 6.893-3.94-.694m5.155-6.2L8.29 4.26m5.908 1.042.348-1.97M7.48 20.364l3.126-17.727"/></svg>',
    monitor: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
    gamepad: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><rect x="2" y="6" width="20" height="12" rx="2"/></svg>',
    book_open: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>',
    briefcase: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>',
    dollar_sign: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
    megaphone: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l18-5v12L3 13v-2z"/><path d="M11.6 16.8a3 3 0 11-5.8-1.6"/></svg>',
    theater: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
    music: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    activity: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    dumbbell: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5h11M6.5 17.5h11M2 12h2M20 12h2M4 8v8M20 8v8M7 6v12M17 6v12"/></svg>',
    utensils: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>',
    plane: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>',
    scissors: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>',
    palette: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>',
    camera: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>',
    microscope: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18h8"/><path d="M3 22h18"/><path d="M14 22a7 7 0 100-14h-1"/><path d="M9 14h2"/><path d="M9 12a2 2 0 01-2-2V6h6v4a2 2 0 01-2 2z"/><path d="M12 6V3a1 1 0 00-1-1H9a1 1 0 00-1 1v3"/></svg>',
    bookmark: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>',
    film: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>',
    flag: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
    paw: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 015 5v3.5a3.5 3.5 0 01-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 015.5 10z"/></svg>',
    car: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 16H9m10 0h3v-3.15a1 1 0 00-.84-.99L16 11l-2.7-3.6a1 1 0 00-.8-.4H5.24a2 2 0 00-1.8 1.1l-.8 1.63A6 6 0 002 12.42V16h2"/><circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/></svg>',
    home_alt: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    feather: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.24 12.24a6 6 0 00-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" y1="8" x2="2" y2="22"/><line x1="17.5" y1="15" x2="9" y2="15"/></svg>',
    baby: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12h.01M15 12h.01M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5"/><path d="M19 6.3a9 9 0 11-14 0"/><path d="M12 3a2 2 0 012 2"/></svg>',
    globe: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>',
    code: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
    smile: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
    map_pin: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    // ── Level Icons ──
    seedling: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22V8"/><path d="M5 12H2a10 10 0 0010-10v0a10 10 0 0010 10h-3"/><path d="M8 17c-1.5 1-3 2.5-3 5"/><path d="M16 17c1.5 1 3 2.5 3 5"/></svg>',
    leaf: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 019.8 6.9C15.5 4.9 17 3.5 17 3.5s3 2 3 9c0 5.5-4.78 8.5-9 7.5z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>',
    tree: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-6"/><path d="M6 11l6-9 6 9H6z"/><path d="M4 17l8-6 8 6H4z"/></svg>',
    diamond: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.7 10.3a2.41 2.41 0 000 3.41l7.59 7.59a2.41 2.41 0 003.41 0l7.59-7.59a2.41 2.41 0 000-3.41l-7.59-7.59a2.41 2.41 0 00-3.41 0z"/></svg>',
    crown: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M3 20h18"/></svg>',
};

// Helper: get platform SVG icon by id
function getPlatformIcon(platformId) {
    return ICONS[platformId] || ICONS.globe;
}

// Helper: generate an SVG flag icon with country code text
function getFlagIcon(code) {
    if (!code || code === 'GLOBAL') return ICONS.globe;
    return '<svg class="svg-icon svg-icon--flag" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/><text x="12" y="11" text-anchor="middle" fill="currentColor" stroke="none" font-size="6" font-weight="600" font-family="system-ui">' + code + '</text></svg>';
}

// ═══════════════════════════════════════
// MODULE 1: CONFIG
// ═══════════════════════════════════════
const CONFIG = {
    siteName: 'GroupsMix',
    // Issue 14 fix: environment-aware siteUrl — uses current origin at runtime,
    // falls back to production domain for non-browser contexts (e.g. build/SSR)
    siteUrl: (typeof window !== 'undefined' && window.location && window.location.origin !== 'null')
        ? window.location.origin
        : 'https://groupsmix.com',
    supabaseUrl: 'https://hmlqppacanpxmrfdlkec.supabase.co',
    perPage: 12,
    adminPerPage: 20,
    maxToasts: 3,
    toastDuration: 4000,
    debounceDelay: 300,
    timeoutDuration: 5000,
    defaultSort: 'ranking',
    defaultTheme: 'dark',
    turnstileSiteKey: '0x4AAAAAACfjfwpiZdD7LJB4',
    cacheDurations: {
        // Issue #16 fix: extended cache durations to reduce frequent API calls
        settings: 600000, homepage: 300000, groups: 600000, group: 600000,
        stats: 1800000, lists: 3600000, ads: 300000, articles: 900000,
        user: 300000, donations: 900000
    },
    platforms: [
        { id: 'whatsapp', name: 'WhatsApp Groups', emoji: ICONS.whatsapp, svgIcon: ICONS.whatsapp, types: ['group', 'community'], kind: 'group' },
        { id: 'whatsapp_channel', name: 'WhatsApp Channels', emoji: ICONS.whatsapp_channel, svgIcon: ICONS.whatsapp_channel, types: ['channel'], kind: 'channel' },
        { id: 'telegram', name: 'Telegram Groups', emoji: ICONS.telegram, svgIcon: ICONS.telegram, types: ['group', 'supergroup'], kind: 'group' },
        { id: 'telegram_channel', name: 'Telegram Channels', emoji: ICONS.telegram_channel, svgIcon: ICONS.telegram_channel, types: ['channel'], kind: 'channel' },
        { id: 'discord', name: 'Discord', emoji: ICONS.discord, svgIcon: ICONS.discord, types: ['server'], kind: 'group' },
        { id: 'facebook', name: 'Facebook', emoji: ICONS.facebook, svgIcon: ICONS.facebook, types: ['group', 'page'], kind: 'group' }
    ],
    categories: [
        { id: 'crypto', name: 'Crypto', emoji: ICONS.bitcoin, svgIcon: ICONS.bitcoin }, { id: 'technology', name: 'Technology', emoji: ICONS.monitor, svgIcon: ICONS.monitor },
        { id: 'gaming', name: 'Gaming', emoji: ICONS.gamepad, svgIcon: ICONS.gamepad }, { id: 'education', name: 'Education', emoji: ICONS.book_open, svgIcon: ICONS.book_open },
        { id: 'business', name: 'Business', emoji: ICONS.briefcase, svgIcon: ICONS.briefcase }, { id: 'jobs', name: 'Jobs', emoji: ICONS.dollar_sign, svgIcon: ICONS.dollar_sign },
        { id: 'marketing', name: 'Marketing', emoji: ICONS.megaphone, svgIcon: ICONS.megaphone }, { id: 'entertainment', name: 'Entertainment', emoji: ICONS.theater, svgIcon: ICONS.theater },
        { id: 'music', name: 'Music', emoji: ICONS.music, svgIcon: ICONS.music }, { id: 'sports', name: 'Sports', emoji: ICONS.activity, svgIcon: ICONS.activity },
        { id: 'health', name: 'Health', emoji: ICONS.dumbbell, svgIcon: ICONS.dumbbell }, { id: 'food', name: 'Food', emoji: ICONS.utensils, svgIcon: ICONS.utensils },
        { id: 'travel', name: 'Travel', emoji: ICONS.plane, svgIcon: ICONS.plane }, { id: 'fashion', name: 'Fashion', emoji: ICONS.scissors, svgIcon: ICONS.scissors },
        { id: 'art', name: 'Art', emoji: ICONS.palette, svgIcon: ICONS.palette }, { id: 'photography', name: 'Photography', emoji: ICONS.camera, svgIcon: ICONS.camera },
        { id: 'news', name: 'News', emoji: ICONS.newspaper, svgIcon: ICONS.newspaper }, { id: 'science', name: 'Science', emoji: ICONS.microscope, svgIcon: ICONS.microscope },
        { id: 'books', name: 'Books', emoji: ICONS.bookmark, svgIcon: ICONS.bookmark }, { id: 'movies', name: 'Movies', emoji: ICONS.film, svgIcon: ICONS.film },
        { id: 'anime', name: 'Anime', emoji: ICONS.flag, svgIcon: ICONS.flag }, { id: 'pets', name: 'Pets', emoji: ICONS.paw, svgIcon: ICONS.paw },
        { id: 'cars', name: 'Cars', emoji: ICONS.car, svgIcon: ICONS.car }, { id: 'realestate', name: 'Real Estate', emoji: ICONS.home_alt, svgIcon: ICONS.home_alt },
        { id: 'religion', name: 'Religion', emoji: ICONS.feather, svgIcon: ICONS.feather }, { id: 'parenting', name: 'Parenting', emoji: ICONS.baby, svgIcon: ICONS.baby },
        { id: 'languages', name: 'Languages', emoji: ICONS.globe, svgIcon: ICONS.globe }, { id: 'programming', name: 'Programming', emoji: ICONS.code, svgIcon: ICONS.code },
        { id: 'memes', name: 'Memes', emoji: ICONS.smile, svgIcon: ICONS.smile }, { id: 'dating', name: 'Dating', emoji: ICONS.heart, svgIcon: ICONS.heart },
        { id: 'other', name: 'Other', emoji: ICONS.map_pin, svgIcon: ICONS.map_pin }
    ],
    countries: [
        { code: 'GLOBAL', name: 'Global', flag: ICONS.globe }, { code: 'US', name: 'United States', flag: getFlagIcon('US') },
        { code: 'GB', name: 'United Kingdom', flag: getFlagIcon('GB') }, { code: 'IN', name: 'India', flag: getFlagIcon('IN') },
        { code: 'NG', name: 'Nigeria', flag: getFlagIcon('NG') }, { code: 'BR', name: 'Brazil', flag: getFlagIcon('BR') },
        { code: 'DE', name: 'Germany', flag: getFlagIcon('DE') }, { code: 'FR', name: 'France', flag: getFlagIcon('FR') },
        { code: 'ES', name: 'Spain', flag: getFlagIcon('ES') }, { code: 'IT', name: 'Italy', flag: getFlagIcon('IT') },
        { code: 'CA', name: 'Canada', flag: getFlagIcon('CA') }, { code: 'AU', name: 'Australia', flag: getFlagIcon('AU') },
        { code: 'MX', name: 'Mexico', flag: getFlagIcon('MX') }, { code: 'JP', name: 'Japan', flag: getFlagIcon('JP') },
        { code: 'KR', name: 'South Korea', flag: getFlagIcon('KR') }, { code: 'SA', name: 'Saudi Arabia', flag: getFlagIcon('SA') },
        { code: 'AE', name: 'UAE', flag: getFlagIcon('AE') }, { code: 'TR', name: 'Turkey', flag: getFlagIcon('TR') },
        { code: 'EG', name: 'Egypt', flag: getFlagIcon('EG') }, { code: 'ZA', name: 'South Africa', flag: getFlagIcon('ZA') },
        { code: 'KE', name: 'Kenya', flag: getFlagIcon('KE') }, { code: 'GH', name: 'Ghana', flag: getFlagIcon('GH') },
        { code: 'PK', name: 'Pakistan', flag: getFlagIcon('PK') }, { code: 'BD', name: 'Bangladesh', flag: getFlagIcon('BD') },
        { code: 'ID', name: 'Indonesia', flag: getFlagIcon('ID') }, { code: 'PH', name: 'Philippines', flag: getFlagIcon('PH') },
        { code: 'MY', name: 'Malaysia', flag: getFlagIcon('MY') }, { code: 'TH', name: 'Thailand', flag: getFlagIcon('TH') },
        { code: 'VN', name: 'Vietnam', flag: getFlagIcon('VN') }, { code: 'RU', name: 'Russia', flag: getFlagIcon('RU') },
        { code: 'PL', name: 'Poland', flag: getFlagIcon('PL') }, { code: 'NL', name: 'Netherlands', flag: getFlagIcon('NL') },
        { code: 'SE', name: 'Sweden', flag: getFlagIcon('SE') }, { code: 'CH', name: 'Switzerland', flag: getFlagIcon('CH') },
        { code: 'AT', name: 'Austria', flag: getFlagIcon('AT') }, { code: 'PT', name: 'Portugal', flag: getFlagIcon('PT') },
        { code: 'AR', name: 'Argentina', flag: getFlagIcon('AR') }, { code: 'CO', name: 'Colombia', flag: getFlagIcon('CO') },
        { code: 'CL', name: 'Chile', flag: getFlagIcon('CL') }, { code: 'PE', name: 'Peru', flag: getFlagIcon('PE') },
        { code: 'MA', name: 'Morocco', flag: getFlagIcon('MA') }, { code: 'TN', name: 'Tunisia', flag: getFlagIcon('TN') },
        { code: 'DZ', name: 'Algeria', flag: getFlagIcon('DZ') }, { code: 'IQ', name: 'Iraq', flag: getFlagIcon('IQ') },
        { code: 'IL', name: 'Israel', flag: getFlagIcon('IL') }, { code: 'UA', name: 'Ukraine', flag: getFlagIcon('UA') },
        { code: 'RO', name: 'Romania', flag: getFlagIcon('RO') }, { code: 'CZ', name: 'Czech Republic', flag: getFlagIcon('CZ') },
        { code: 'GR', name: 'Greece', flag: getFlagIcon('GR') }, { code: 'HU', name: 'Hungary', flag: getFlagIcon('HU') },
        { code: 'SG', name: 'Singapore', flag: getFlagIcon('SG') }, { code: 'NZ', name: 'New Zealand', flag: getFlagIcon('NZ') },
        { code: 'IE', name: 'Ireland', flag: getFlagIcon('IE') }, { code: 'DK', name: 'Denmark', flag: getFlagIcon('DK') },
        { code: 'NO', name: 'Norway', flag: getFlagIcon('NO') }, { code: 'FI', name: 'Finland', flag: getFlagIcon('FI') }
    ],
    // Issue 17 fix: expanded languages list to cover all CONFIG.countries regions
    languages: [
        'English', 'Spanish', 'French', 'German', 'Portuguese', 'Arabic', 'Hindi', 'Chinese',
        'Japanese', 'Korean', 'Russian', 'Turkish', 'Italian', 'Dutch', 'Polish', 'Indonesian',
        'Thai', 'Vietnamese', 'Malay', 'Swahili', 'Bengali', 'Urdu', 'Filipino', 'Romanian',
        'Czech', 'Greek', 'Hungarian', 'Hebrew', 'Ukrainian', 'Swedish', 'Norwegian', 'Danish',
        'Finnish', 'Persian'
    ],
    levels: [
        { level: 1, name: 'Seedling', emoji: ICONS.seedling, svgIcon: ICONS.seedling, minGxp: 0 },
        { level: 2, name: 'Sprout', emoji: ICONS.leaf, svgIcon: ICONS.leaf, minGxp: 200 },
        { level: 3, name: 'Tree', emoji: ICONS.tree, svgIcon: ICONS.tree, minGxp: 600 },
        { level: 4, name: 'Star', emoji: ICONS.star, svgIcon: ICONS.star, minGxp: 1500 },
        { level: 5, name: 'Fire', emoji: ICONS.fire, svgIcon: ICONS.fire, minGxp: 3000 },
        { level: 6, name: 'Diamond', emoji: ICONS.diamond, svgIcon: ICONS.diamond, minGxp: 6000 },
        { level: 7, name: 'Crown', emoji: ICONS.crown, svgIcon: ICONS.crown, minGxp: 12000 }
    ],
    nichePricing: {
        crypto: 25, technology: 20, gaming: 20, education: 15, business: 25, jobs: 25,
        marketing: 20, entertainment: 15, music: 15, sports: 15, health: 15, food: 10,
        travel: 15, fashion: 15, art: 10, photography: 10, news: 15, science: 10,
        books: 10, movies: 15, anime: 15, pets: 10, cars: 15, realestate: 20,
        religion: 10, parenting: 10, languages: 15, programming: 20, memes: 10, dating: 20, other: 10
    },
    features: {
        reviews: true, leaderboard: true, scamWall: true, tools: true, articles: true,
        store: true, marketplace: true, jobs: true, donate: true, ads: true
    },
    announcement: { enabled: false, text: '', link: '', type: 'info' },
    // Issue 18 fix: added eth, ltc, ton to match wallet types used in go.html and promote pages
    cryptoWallets: { btc: '', eth: '', usdt: '', sol: '', ltc: '', ton: '' },
    lemonSqueezy: { storeUrl: '', products: {} },
    adSlotLimits: { sidebar: 2, searchTop: 1, categoryBottom: 1, profileSimilar: 2 },
    notificationTypes: {
        welcome: { icon: ICONS.hand_wave || ICONS.user, title: 'Welcome!' },
        group_approved: { icon: ICONS.check_circle, title: 'Group Approved' },
        group_rejected: { icon: ICONS.x_circle, title: 'Group Rejected' },
        payment_verified: { icon: ICONS.check_circle, title: 'Payment Verified' },
        payment_rejected: { icon: ICONS.x_circle, title: 'Payment Rejected' },
        vip_activated: { icon: ICONS.star, title: 'VIP Activated' },
        vip_expired: { icon: ICONS.clock, title: 'VIP Expired' },
        level_up: { icon: ICONS.trophy, title: 'Level Up!' },
        review_received: { icon: ICONS.message_circle, title: 'New Review' },
        report_resolved: { icon: ICONS.shield, title: 'Report Resolved' },
        gxp_awarded: { icon: ICONS.sparkles, title: 'GXP Awarded' },
        system: { icon: ICONS.info, title: 'System Notice' },
        info: { icon: ICONS.info, title: 'Info' }
    },
    disposableEmails: [
        'tempmail.com', 'throwaway.email', 'guerrillamail.com', 'mailinator.com', 'yopmail.com',
        'temp-mail.org', 'fakeinbox.com', 'sharklasers.com', 'guerrillamailblock.com', 'grr.la',
        'dispostable.com', 'trashmail.com', 'mailnesia.com', 'maildrop.cc', 'discard.email',
        'mailcatch.com', 'tempail.com', 'tempr.email', '10minutemail.com', 'mohmal.com',
        'burnermail.io', 'temp-mail.io', 'tmpmail.net', 'tmpmail.org', 'boun.cr',
        'mailtemp.net', 'emailondeck.com', '33mail.com', 'getnada.com', 'inboxkitten.com',
        'throwmail.com', 'trashmail.net', 'mytemp.email', 'tempmailo.com', 'emailtemp.org',
        'crazymailing.com', 'mailsac.com', 'tempmailco.com', 'tempmailer.com', 'getairmail.com',
        'trash-mail.com', 'one-time.email', 'moakt.com', 'tmail.ws', 'tempsky.com',
        'mailexpire.com', 'emailfake.com', 'throwawaymail.com', 'spamgourmet.com', 'jetable.org'
    ],
    platformPatterns: {
        whatsapp: /^https:\/\/chat\.whatsapp\.com\//,
        whatsapp_channel: /^https:\/\/(www\.)?whatsapp\.com\/channel\//,
        telegram: /^https:\/\/(t\.me|telegram\.me)\//,
        telegram_channel: /^https:\/\/(t\.me|telegram\.me)\//,
        discord: /^https:\/\/(discord\.gg|discord\.com\/invite)\//,
        facebook: /^https:\/\/(www\.)?facebook\.com\//,
    },
    defaultSettings: {}
};

// All Supabase client calls use window.supabaseClient directly
// (initialised by supabase-config.js). window.supabase is left
// untouched so the CDN library namespace is never overwritten.

// ═══════════════════════════════════════
// MODULE 2: CACHE (sessionStorage)
// ═══════════════════════════════════════
// Audit fix #8: added _maxSize and eviction to prevent unbounded memory growth in sessionStorage
const CACHE = {
    _prefix: 'gm_cache_',
    _maxSize: 100,
    get(key, maxAgeMs) {
        try {
            const raw = sessionStorage.getItem(this._prefix + key);
            if (!raw) return null;
            const { data, ts } = JSON.parse(raw);
            if (Date.now() - ts > maxAgeMs) { sessionStorage.removeItem(this._prefix + key); return null; }
            return data;
        } catch (err) { console.error('CACHE.get:', err.message); return null; }
    },
    set(key, data) {
        try {
            // Evict oldest entries if cache exceeds max size
            const allKeys = Object.keys(sessionStorage).filter(k => k.startsWith(this._prefix));
            if (allKeys.length >= this._maxSize) {
                const entries = allKeys.map(k => {
                    try { const parsed = JSON.parse(sessionStorage.getItem(k)); return { key: k, ts: parsed.ts || 0 }; }
                    catch (e) { return { key: k, ts: 0 }; }
                }).sort((a, b) => a.ts - b.ts);
                // Remove oldest 20% to avoid evicting on every set
                const removeCount = Math.max(1, Math.floor(this._maxSize * 0.2));
                for (let i = 0; i < removeCount && i < entries.length; i++) {
                    sessionStorage.removeItem(entries[i].key);
                }
            }
            sessionStorage.setItem(this._prefix + key, JSON.stringify({ data, ts: Date.now() }));
        } catch (err) { console.error('CACHE.set:', err.message); }
    },
    remove(key) {
        try { sessionStorage.removeItem(this._prefix + key); } catch (err) { console.error('CACHE.remove:', err.message); }
    },
    clear() {
        try {
            Object.keys(sessionStorage).forEach(k => { if (k.startsWith(this._prefix)) sessionStorage.removeItem(k); });
        } catch (err) { console.error('CACHE.clear:', err.message); }
    }
};

// ═══════════════════════════════════════
// MODULE 3: Security
// ═══════════════════════════════════════
const Security = {
    _behavioral: { events: new Set(), startTime: 0, fieldFocused: false },

    init() {
        this._behavioral.startTime = Date.now();
        this.initBehavioral();
    },

    sanitize(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/\//g, '&#x2F;')
            .trim().replace(/\s+/g, ' ');
    },

    // Issue #10 fix: dedicated URL sanitizer that preserves forward slashes
    // sanitize() replaces / with &#x2F; which breaks valid URLs in src attributes
    sanitizeUrl(url) {
        if (typeof url !== 'string') return '';
        var trimmed = url.trim();
        // Only allow https:// URLs
        if (!/^https:\/\//i.test(trimmed)) return '';
        // Block dangerous schemes that could be embedded
        var lower = trimmed.toLowerCase();
        if (lower.includes('javascript:') || lower.includes('data:') ||
            lower.includes('file:') || lower.includes('vbscript:')) return '';
        // Encode only HTML-dangerous characters, NOT forward slashes
        return trimmed
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    },

    isValidEmail(email) {
        if (typeof email !== 'string') return false;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
    },

    /**
     * Validate password strength.
     * Returns { valid: boolean, errors: string[] }
     * Requirements: min 8 chars, uppercase, lowercase, digit, special char.
     */
    validatePassword(password) {
        var errors = [];
        if (typeof password !== 'string' || password.length < 8) errors.push('Password must be at least 8 characters');
        if (password && !/[A-Z]/.test(password)) errors.push('Must contain an uppercase letter');
        if (password && !/[a-z]/.test(password)) errors.push('Must contain a lowercase letter');
        if (password && !/[0-9]/.test(password)) errors.push('Must contain a number');
        if (password && !/[^A-Za-z0-9]/.test(password)) errors.push('Must contain a special character (!@#$%^&*...)');
        return { valid: errors.length === 0, errors: errors };
    },

    /**
     * Calculate password strength score (0-4) for UI meter.
     * 0 = very weak, 1 = weak, 2 = fair, 3 = strong, 4 = very strong
     */
    getPasswordStrength(password) {
        if (typeof password !== 'string' || !password) return { score: 0, label: 'Too short', color: 'var(--error)' };
        var score = 0;
        if (password.length >= 8) score++;
        if (password.length >= 12) score++;
        if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
        if (/[0-9]/.test(password)) score++;
        if (/[^A-Za-z0-9]/.test(password)) score++;
        // Cap at 4
        score = Math.min(4, score);
        var labels = [
            { label: 'Very weak', color: 'var(--error)' },
            { label: 'Weak', color: 'var(--error)' },
            { label: 'Fair', color: 'var(--warning)' },
            { label: 'Strong', color: 'var(--info)' },
            { label: 'Very strong', color: 'var(--success)' }
        ];
        return { score: score, label: labels[score].label, color: labels[score].color };
    },

    /**
     * Validate a URL is safe for navigation (no javascript:, data:, etc.).
     * Used to sanitize notification links and other user-provided URLs.
     */
    isSafeNavigationUrl(url) {
        if (typeof url !== 'string' || !url.trim()) return false;
        var trimmed = url.trim().toLowerCase();
        // Only allow http(s) and relative paths
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/')) {
            // Block dangerous schemes that might be embedded
            var dangerous = ['javascript:', 'data:', 'file:', 'vbscript:', 'blob:'];
            if (dangerous.some(function(d) { return trimmed.includes(d); })) return false;
            return true;
        }
        return false;
    },

    isDisposableEmail(email) {
        if (typeof email !== 'string') return false;
        const domain = email.split('@')[1]?.toLowerCase();
        return CONFIG.disposableEmails.includes(domain);
    },

    isValidUrl(url, platform) {
        if (typeof url !== 'string') return false;
        if (!url.startsWith('https://')) return false;
        const dangerous = ['javascript:', 'data:', 'file:', 'vbscript:', '%6A%61%76%61'];
        if (dangerous.some(d => url.toLowerCase().includes(d))) return false;
        if (platform && CONFIG.platformPatterns[platform]) {
            return CONFIG.platformPatterns[platform].test(url);
        }
        return true;
    },

    isValidTxHash(hash, currency) {
        if (typeof hash !== 'string' || !hash.trim()) return false;
        const h = hash.trim();
        if (currency === 'btc') return /^[a-fA-F0-9]{64}$/.test(h);
        if (currency === 'usdt') return /^[a-fA-F0-9]{64}$/.test(h);
        if (currency === 'sol') return /^[1-9A-HJ-NP-Za-km-z]{86,88}$/.test(h);
        return h.length >= 32;
    },

    checkRateLimit(action) {
        const limits = {
            submit: { window: 3600000, max: 5 }, review: { window: 3600000, max: 10 },
            report: { window: 3600000, max: 5 }, payment: { window: 3600000, max: 3 },
            contact: { window: 3600000, max: 2 }, search: { window: 3600000, max: 60 },
            login: { window: 900000, max: 5 }, comment: { window: 60000, max: 5 }
        };
        const l = limits[action];
        if (!l) return true;
        const key = 'gm_rl_' + action;
        let timestamps = [];
        try { const raw = localStorage.getItem(key); timestamps = raw ? JSON.parse(raw) : []; } catch (err) { console.error('Security.checkRateLimit:', err.message); timestamps = []; }
        const now = Date.now();
        const recent = timestamps.filter(t => now - t < l.window);
        if (recent.length >= l.max) return false;
        recent.push(now);
        localStorage.setItem(key, JSON.stringify(recent));
        return true;
    },

    checkOnline() {
        return navigator.onLine;
    },

    checkBehavioral() {
        const b = this._behavioral;
        return b.events.size >= 2 && (Date.now() - b.startTime) >= 3000 && b.fieldFocused;
    },

    initBehavioral() {
        const track = (e) => { this._behavioral.events.add(e.type); };
        ['mousemove', 'touchstart', 'keypress', 'scroll'].forEach(evt => {
            document.addEventListener(evt, track, { once: true, passive: true });
        });
        document.addEventListener('focusin', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
                this._behavioral.fieldFocused = true;
                this._behavioral.events.add('focusin');
            }
        }, { passive: true });
    },

    obfuscateLink(url) {
        if (typeof url !== 'string' || !url) return '';
        try { return btoa(unescape(encodeURIComponent(url))); } catch (e) { return ''; }
    },

    deobfuscateLink(encoded) {
        if (typeof encoded !== 'string' || !encoded) return '';
        try { return decodeURIComponent(escape(atob(encoded))); } catch (e) { return ''; }
    },

    /**
     * Server-side validation via /api/validate Cloudflare Pages Function.
     * Verifies Turnstile token, email, and rate limit on the server.
     * Returns { ok, errors, code } or { ok: true } on success.
     * Falls back gracefully if the endpoint is unavailable.
     *
     * @param {Object} params - { email, turnstileToken, action }
     * @returns {Promise<{ok: boolean, errors: string[]}>}
     */
    async serverValidate(params) {
        try {
            const res = await fetch('/api/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params)
            });
            // If the server itself errored (5xx), fall back to client-side only
            if (res.status >= 500) {
                console.warn('Security.serverValidate: server error ' + res.status + ', using client-side only');
                return { ok: true, errors: [] };
            }
            var data;
            try {
                data = await res.json();
            } catch (jsonErr) {
                // Response was not valid JSON (e.g. HTML error page)
                console.warn('Security.serverValidate: non-JSON response, using client-side only');
                return { ok: true, errors: [] };
            }
            return data;
        } catch (err) {
            // If the endpoint is unreachable (e.g. local dev, not on Cloudflare),
            // fall back to client-side checks only — don't block the user.
            console.warn('Security.serverValidate: endpoint unavailable, using client-side only');
            return { ok: true, errors: [] };
        }
    }
};

// ═══════════════════════════════════════
// MODULE 4: Auth
// ═══════════════════════════════════════
const Auth = {
    _session: null,
    _currentUserData: null,
    _isCreatingProfile: false,
    _pendingDisplayName: null,
    _authInitialized: false,
    _authReadyPromise: null,
    _authReadyResolve: null,
    _processingAuthEvent: false,
    _signOutRedirectTimer: null,

    /**
     * Returns a Promise that resolves once the initial auth check
     * (INITIAL_SESSION) has been fully processed, including the
     * profile fetch. Pages can `await Auth.waitForAuth()` before
     * reading Auth.isLoggedIn() / Auth.getUser() to avoid races.
     */
    waitForAuth() {
        if (Auth._authInitialized) return Promise.resolve();
        return Auth._authReadyPromise || Promise.resolve();
    },

    _initListener() {
        Auth._authReadyPromise = new Promise(function (resolve) {
            Auth._authReadyResolve = resolve;
        });
        // IMPORTANT: The callback must NOT be async to avoid a deadlock
        // in Supabase JS v2. The client holds an internal lock while
        // calling onAuthStateChange listeners. If the callback awaits
        // any Supabase REST/RPC call, that call needs the same lock
        // → deadlock. We set only synchronous state here and defer
        // all async work (profile fetch, etc.) via setTimeout(fn, 0).
        window.supabaseClient.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
                Auth._processingAuthEvent = true;
                if (Auth._signOutRedirectTimer) { clearTimeout(Auth._signOutRedirectTimer); Auth._signOutRedirectTimer = null; }
                // Store session synchronously so isLoggedIn() works immediately
                if (session) { Auth._session = session; }
                // Defer heavy async work to next tick to release the Supabase internal lock
                setTimeout(function () { Auth._processSignIn(event, session); }, 0);

            } else if (event === 'SIGNED_OUT') {
                // Guard: if we are currently processing INITIAL_SESSION or
                // SIGNED_IN, this SIGNED_OUT is a spurious race. Ignore it.
                if (Auth._processingAuthEvent) { return; }
                // Defer async recovery check to next tick
                setTimeout(function () { Auth._processSignOut(event); }, 0);
            }
        });
    },

    // Deferred handler for SIGNED_IN / INITIAL_SESSION / TOKEN_REFRESHED.
    // Runs outside the Supabase internal lock so REST/RPC calls work.
    async _processSignIn(event, session) {
        try {
            let currentSession = session;

            // Supabase fix: sometimes session is null on INITIAL_SESSION
            // even though a valid session exists in localStorage.
            if (!currentSession && event === 'INITIAL_SESSION') {
                try {
                    const { data: fallback } = await window.supabaseClient.auth.getSession();
                    currentSession = fallback?.session || null;
                } catch (e) {
                    currentSession = null;
                }
            }

            if (currentSession) {
                Auth._session = currentSession;
                Auth._currentUserData = await DB.user.getProfile(currentSession.user.id);

                // Fix: create missing profile for ALL auth events, not
                // just SIGNED_IN. This prevents the "Missing Profile Trap"
                // where INITIAL_SESSION users with no profile get kicked.
                if (!Auth._currentUserData && !Auth._isCreatingProfile) {
                    Auth._isCreatingProfile = true;
                    try {
                        var savedName = Auth._pendingDisplayName || '';
                        if (!savedName) {
                            try { savedName = localStorage.getItem('gm_pending_display_name') || ''; } catch (e) { /* private browsing */ }
                        }
                        if (!savedName) { savedName = 'User'; }
                        try { localStorage.removeItem('gm_pending_display_name'); } catch (e) { /* ok */ }
                        const newProfile = await DB.user.createProfile({
                            auth_id: currentSession.user.id,
                            email: currentSession.user.email,
                            display_name: savedName,
                            role: 'user',
                            gxp: 0,
                            level: 1
                        });
                        Auth._currentUserData = newProfile;
                        Auth._pendingDisplayName = null;
                        if (newProfile) {
                            // Issue #3 fix: removed duplicate increment_user_count call.
                            // DB.user.createProfile() already calls increment_user_count internally.
                            try {
                                await window.supabaseClient.from('notifications').insert({
                                    uid: newProfile.id, type: 'welcome', title: 'Welcome to GroupsMix!',
                                    message: 'Start exploring trusted social media groups.', link: '/search'
                                });
                            } catch (err) { /* welcome notification is optional */ }
                        }
                    } finally {
                        Auth._isCreatingProfile = false;
                    }
                }

                // Award daily login GXP and stabilize session
                if (Auth._currentUserData) {
                    CACHE.set('user_profile', Auth._currentUserData);
                    await DB.user.dailyLoginCheck(Auth._currentUserData.id);
                    // Security: start inactivity timer when user is authenticated
                    Auth._initInactivityWatch();
                }
                // Resolve any pending signUp/signIn promise
                if (Auth._profileReadyResolve) {
                    Auth._profileReadyResolve(Auth._currentUserData);
                    Auth._profileReadyResolve = null;
                }
            } else {
                Auth._session = null;
                Auth._currentUserData = null;
            }

            try { renderHeader(); } catch (e) { console.error('renderHeader error:', e); }

            Auth._processingAuthEvent = false;

            // NOTE: Admin page access control is handled by the admin
            // panel's own gate (gm-ctrl-x7.html) which performs a full
            // server-verified auth + role check. Removed redundant
            // redirect here to avoid a race condition where the profile
            // hasn't loaded yet but this code fires first.
        } catch (err) {
            console.error('_processSignIn auth event error:', err);
        } finally {
            // ALWAYS signal auth initialization is complete on INITIAL_SESSION,
            // even if an error occurred above. Without this, waitForAuth() hangs
            // forever and the page never loads.
            if (event === 'INITIAL_SESSION') {
                Auth._authInitialized = true;
                if (Auth._authReadyResolve) { Auth._authReadyResolve(); Auth._authReadyResolve = null; }
            }
        }
    },

    // Deferred handler for SIGNED_OUT.
    // Runs outside the Supabase internal lock so recovery calls work.
    async _processSignOut(event) {
        // Guard: verify the session is truly gone by checking
        // localStorage directly. If a session token still exists
        // in storage, this is likely a false SIGNED_OUT event.
        try {
            var storedRaw = localStorage.getItem('sb-hmlqppacanpxmrfdlkec-auth-token');
            if (storedRaw) {
                var storedData = JSON.parse(storedRaw);
                if (storedData && (storedData.access_token || (storedData.currentSession && storedData.currentSession.access_token))) {
                    try {
                        var { data: recoveryData } = await window.supabaseClient.auth.getSession();
                        if (recoveryData?.session) {
                            Auth._session = recoveryData.session;
                            Auth._currentUserData = await DB.user.getProfile(recoveryData.session.user.id);
                            if (Auth._currentUserData) { CACHE.set('user_profile', Auth._currentUserData); }
                            renderHeader();
                            return; // Session recovered — do not sign out
                        }
                    } catch (recErr) { /* recovery failed, proceed with sign-out */ }
                }
            }
        } catch (e) { /* localStorage access failed, proceed normally */ }

        Auth._session = null;
        Auth._currentUserData = null;
        CACHE.remove('user_profile');

        // Also resolve auth ready if still pending (e.g. user signed out before INITIAL_SESSION)
        if (!Auth._authInitialized) {
            Auth._authInitialized = true;
            if (Auth._authReadyResolve) { Auth._authReadyResolve(); Auth._authReadyResolve = null; }
        }

        // Use a short delay before redirecting to allow any pending
        // INITIAL_SESSION or TOKEN_REFRESHED events to arrive first.
        var _dashPaths = ['/dashboard', '/pages/user/dashboard'];
        // NOTE: admin page (/gm-ctrl-x7) removed — its own gate handles sign-out redirect
        if (_dashPaths.indexOf(window.location.pathname) !== -1) {
            Auth._signOutRedirectTimer = setTimeout(function() {
                // Final check: if session was restored by another event, don't redirect
                if (!Auth._session) {
                    window.location.href = '/';
                }
            }, 500);
        } else {
            renderHeader();
        }
    },

    _handleAuthError(error) {
        if (!error) return 'Something went wrong. Please try again.';
        const msg = error.message || '';
        if (msg.includes('Invalid login credentials')) return 'Incorrect email or password';
        if (msg.includes('User already registered')) return 'This email is already registered. Try signing in.';
        // Security: updated to match our stronger 8-char requirement
        if (msg.includes('Password should be at least')) return 'Password must be at least 8 characters with uppercase, lowercase, number, and special character';
        if (msg.includes('Unable to validate email')) return 'Please enter a valid email address';
        if (msg.includes('Email not confirmed')) return 'EMAIL_NOT_CONFIRMED';
        if (msg.includes('For security purposes')) return 'Too many attempts. Please try again later.';
        if (msg.includes('Email rate limit')) return 'Too many requests. Please wait a few minutes.';
        if (msg.includes('User not found')) return 'Incorrect email or password';
        if (msg.includes('Signup disabled')) return 'Registration is temporarily disabled';
        if (msg.includes('Network')) return 'Connection issue. Please check your internet.';
        if (msg.includes('same_password')) return 'New password must be different from your current password';
        return 'Something went wrong. Please try again.';
    },

    async signUp(email, password, displayName, turnstileToken) {
        try {
            if (!Security.checkRateLimit('login')) { UI.toast('Too many attempts. Please try again later.', 'error'); return null; }
            // Security: check network connectivity before attempting signup
            if (!Security.checkOnline()) { UI.toast('You appear to be offline. Please check your connection.', 'error'); return null; }
            // Security: enforce strong password on client side before server call
            var pwCheck = Security.validatePassword(password);
            if (!pwCheck.valid) { UI.toast(pwCheck.errors[0], 'error'); return null; }
            // ── Server-side validation (rate limit + email + Turnstile + password) ──
            // Only send turnstileToken if it is a real token (not the bypass placeholder)
            // Audit fix #20: do NOT send password to server-side validation — keep strength check client-side only
            var svParams = { email: email, action: 'signup' };
            if (turnstileToken && turnstileToken !== 'bypass_sdk_unavailable') { svParams.turnstileToken = turnstileToken; }
            var sv = await Security.serverValidate(svParams);
            if (!sv.ok) { UI.toast(sv.errors?.[0] || 'Validation failed. Please try again.', 'error'); return null; }
            // Store display name for _initListener to use when creating profile
            Auth._pendingDisplayName = Security.sanitize(displayName);
            // Also persist to localStorage so it survives the email-verification redirect
            try { localStorage.setItem('gm_pending_display_name', Auth._pendingDisplayName); } catch (e) { /* private browsing */ }
            const { data, error } = await window.supabaseClient.auth.signUp({
                email,
                password,
                options: { emailRedirectTo: CONFIG.siteUrl + '/?verified=1' }
            });
            if (error) {
                Auth._pendingDisplayName = null;
                try { localStorage.removeItem('gm_pending_display_name'); } catch (e) { /* ok */ }
                UI.toast(Auth._handleAuthError(error), 'error');
                return null;
            }
            // ── Email verification check ──────────────────────────────
            // When "Confirm email" is enabled in Supabase, data.session
            // will be null until the user clicks the confirmation link.
            // We return a special string so the UI can show the
            // "check your inbox" screen instead of logging the user in.
            if (!data.session) {
                // Keep display name in localStorage for post-verify profile creation
                return 'email_verification_pending';
            }
            // Instant-login: clean up localStorage since we don't need it
            try { localStorage.removeItem('gm_pending_display_name'); } catch (e) { /* ok */ }
            // ── Instant-login path (email confirmation disabled) ─────
            Auth._isCreatingProfile = true;
            const profilePromise = new Promise(resolve => { Auth._profileReadyResolve = resolve; });
            const profile = await Promise.race([
                profilePromise,
                new Promise(resolve => setTimeout(() => resolve(null), 10000))
            ]);
            Auth._currentUserData = profile || Auth._currentUserData;
            if (Auth._currentUserData) { CACHE.set('user_profile', Auth._currentUserData); }
            renderHeader();
            UI.toast('Account created! Welcome to GroupsMix', 'success');
            return data;
        } catch (err) {
            Auth._pendingDisplayName = null;
            Auth._isCreatingProfile = false;
            Auth._profileReadyResolve = null;
            UI.toast('Something went wrong. Please try again.', 'error');
            return null;
        }
    },

    async signIn(email, password) {
        try {
            if (!Security.checkRateLimit('login')) { UI.toast('Too many attempts. Please try again later.', 'error'); return null; }
            if (!Security.checkOnline()) { UI.toast('You appear to be offline. Please check your connection.', 'error'); return null; }
            // ── Server-side validation (rate limit + email) ──
            var sv = await Security.serverValidate({ email: email, action: 'signin' });
            if (!sv.ok) { UI.toast(sv.errors?.[0] || 'Validation failed. Please try again.', 'error'); return null; }
            const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
            if (error) {
                var friendlyMsg = Auth._handleAuthError(error);
                if (friendlyMsg === 'EMAIL_NOT_CONFIRMED') return 'email_not_confirmed';
                UI.toast(friendlyMsg, 'error');
                return null;
            }
            Auth._session = data.session;
            // Use maybeSingle to avoid error if profile doesn't exist yet
            const { data: profile } = await window.supabaseClient.from('users').select('*').eq('auth_id', data.user.id).maybeSingle();
            if (profile) { Auth._currentUserData = profile; CACHE.set('user_profile', profile); }
            UI.toast('Welcome back, ' + (profile?.display_name || 'User') + '!', 'success');
            renderHeader();
            return data;
        } catch (err) {
            console.error('Auth.signIn:', err.message || err);
            UI.toast('Something went wrong. Please try again.', 'error');
            return null;
        }
    },

    async signOut() {
        try {
            await window.supabaseClient.auth.signOut();
            Auth._session = null;
            Auth._currentUserData = null;
            CACHE.clear();
            // Security: clear inactivity timer and remove listeners on sign out (Issue #1)
            if (Auth._inactivityHandler) {
                Auth._inactivityEvents.forEach(function(evt) {
                    document.removeEventListener(evt, Auth._inactivityHandler);
                });
                Auth._inactivityHandler = null;
            }
            if (Auth._inactivityTimer) { clearTimeout(Auth._inactivityTimer); Auth._inactivityTimer = null; }
            renderHeader();
            UI.toast('Signed out successfully', 'success');
            const authPages = ['/user/', '/admin'];
            if (authPages.some(p => window.location.pathname.includes(p))) {
                window.location.href = '/';
            }
        } catch (err) { UI.toast('Something went wrong. Please try again.', 'error'); }
    },

    async resetPassword(email) {
        try {
            // ── Server-side validation (rate limit + email) ──
            var sv = await Security.serverValidate({ email: email, action: 'reset' });
            if (!sv.ok) { UI.toast(sv.errors?.[0] || 'Validation failed. Please try again.', 'error'); return false; }
            // Bug fix: correct redirect path to /pages/user/reset-password
            const { error } = await window.supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: CONFIG.siteUrl + '/pages/user/reset-password'
            });
            if (error) { UI.toast(Auth._handleAuthError(error), 'error'); return false; }
            UI.toast('Password reset link sent to your email', 'success');
            return true;
        } catch (err) { console.error('Auth.resetPassword:', err.message); UI.toast('Something went wrong. Please try again.', 'error'); return false; }
    },

    async updatePassword(newPassword) {
        try {
            // Security: enforce strong password requirements on password update
            var pwCheck = Security.validatePassword(newPassword);
            if (!pwCheck.valid) { UI.toast(pwCheck.errors[0], 'error'); return false; }
            const { error } = await window.supabaseClient.auth.updateUser({ password: newPassword });
            if (error) { UI.toast(Auth._handleAuthError(error), 'error'); return false; }
            UI.toast('Password updated! You can now sign in', 'success');
            return true;
        } catch (err) { console.error('Auth.updatePassword:', err.message); UI.toast('Something went wrong. Please try again.', 'error'); return false; }
    },

    // ── Session inactivity timeout ─────────────────────────────
    // Auto-logout after 30 minutes of inactivity to protect unattended sessions.
    _inactivityTimer: null,
    _inactivityTimeout: 1800000, // 30 minutes in ms
    _inactivityHandler: null,
    _inactivityEvents: ['mousedown', 'keypress', 'scroll', 'touchstart', 'mousemove'],
    _resetInactivityTimer() {
        if (Auth._inactivityTimer) clearTimeout(Auth._inactivityTimer);
        if (!Auth._session) return;
        Auth._inactivityTimer = setTimeout(function() {
            if (Auth._session) {
                UI.toast('Session expired due to inactivity. Please sign in again.', 'warning', 6000);
                Auth.signOut();
            }
        }, Auth._inactivityTimeout);
    },
    _initInactivityWatch() {
        // Remove previous listeners first to prevent accumulation (Issue #1)
        if (Auth._inactivityHandler) {
            Auth._inactivityEvents.forEach(function(evt) {
                document.removeEventListener(evt, Auth._inactivityHandler);
            });
        }
        Auth._inactivityHandler = function() { Auth._resetInactivityTimer(); };
        Auth._inactivityEvents.forEach(function(evt) {
            document.addEventListener(evt, Auth._inactivityHandler, { passive: true });
        });
        Auth._resetInactivityTimer();
    },

    isLoggedIn() { return !!Auth._session; },
    isAdmin() { return Auth._currentUserData?.role === 'admin'; },
    isModerator() { return Auth._currentUserData?.role === 'moderator' || Auth.isAdmin(); },
    isEditor() { return Auth._currentUserData?.role === 'editor' || Auth.isAdmin(); },
    hasRole(role) {
        const userRole = Auth._currentUserData?.role;
        if (!userRole) return false;
        const hierarchy = { admin: 4, moderator: 3, editor: 2, user: 1 };
        return (hierarchy[userRole] || 0) >= (hierarchy[role] || 0);
    },
    getRole() { return Auth._currentUserData?.role || 'user'; },
    getUser() { return Auth._currentUserData; },
    getUserId() { return Auth._currentUserData?.id; },
    getAuthId() { return Auth._session?.user?.id; },
    getEmail() { return Auth._session?.user?.email; },
    requireAuth() { if (!Auth.isLoggedIn()) { UI.authModal('signin'); return false; } return true; },
    requireAdmin() { if (!Auth.isAdmin()) { UI.toast('Access denied', 'error'); return false; } return true; },
    requireModerator() { if (!Auth.isModerator()) { UI.toast('Access denied', 'error'); return false; } return true; },

    async resendVerification(email) {
        try {
            if (!Security.checkRateLimit('login')) { UI.toast('Too many attempts. Please wait.', 'error'); return false; }
            const { error } = await window.supabaseClient.auth.resend({ type: 'signup', email, options: { emailRedirectTo: CONFIG.siteUrl + '/?verified=1' } });
            if (error) { UI.toast(Auth._handleAuthError(error), 'error'); return false; }
            UI.toast('Verification email sent! Check your inbox.', 'success');
            return true;
        } catch (err) { UI.toast('Something went wrong. Please try again.', 'error'); return false; }
    }
};

// CONTINUE IN NEXT MESSAGE
// ═══════════════════════════════════════
// MODULE 5: DB
// ═══════════════════════════════════════
const DB = {
    groups: {
        async getApproved({ platform, category, country, sort, limit, offset } = {}) {
            try {
                const l = limit || CONFIG.perPage;
                const o = offset || 0;
                const s = sort || CONFIG.defaultSort;
                const cacheKey = 'groups_' + [platform, category, country, s, l, o].join('_');
                const cached = CACHE.get(cacheKey, CONFIG.cacheDurations.groups);
                if (cached) return cached;
                let q = window.supabaseClient.from('groups').select('*', { count: 'exact' }).eq('status', 'approved');
                if (platform) q = q.eq('platform', platform);
                if (category) q = q.eq('category', category);
                if (country) q = q.eq('country', country);
                const sortCol = s === 'newest' ? 'approved_at' : s === 'views' ? 'views' : s === 'rating' ? 'avg_rating' : s === 'trending' ? 'click_count' : 'ranking_score';
                q = q.order(sortCol, { ascending: false }).range(o, o + l - 1);
                const { data, error, count } = await q;
                if (error) throw error;
                const result = { data: data || [], count: count || 0 };
                CACHE.set(cacheKey, result);
                return result;
            } catch (err) { console.error('DB.groups.getApproved:', err.message); return { data: [], count: 0 }; }
        },
        async getOne(id) {
            try {
                if (!id) return null;
                const cached = CACHE.get('group_' + id, CONFIG.cacheDurations.group);
                if (cached) return cached;
                const { data, error } = await window.supabaseClient.from('groups').select('*').eq('id', id).single();
                if (error) throw error;
                CACHE.set('group_' + id, data);
                return data;
            } catch (err) { console.error('DB.groups.getOne:', err.message); return null; }
        },
        async getFeatured() {
            try {
                const cached = CACHE.get('featured_groups', CONFIG.cacheDurations.homepage);
                if (cached) return cached;
                const now = new Date().toISOString();
                const { data, error } = await window.supabaseClient.from('groups').select('*').eq('status', 'approved')
                    .in('vip_tier', ['diamond', 'global']).gt('vip_expiry', now)
                    .order('ranking_score', { ascending: false }).limit(6);
                if (error) throw error;
                CACHE.set('featured_groups', data || []);
                return data || [];
            } catch (err) { console.error('DB.groups.getFeatured:', err.message); return []; }
        },
        async getTrending() {
            try {
                const cached = CACHE.get('trending_groups', CONFIG.cacheDurations.homepage);
                if (cached) return cached;
                const { data, error } = await window.supabaseClient.from('groups').select('*').eq('status', 'approved')
                    .order('ranking_score', { ascending: false }).limit(12);
                if (error) throw error;
                CACHE.set('trending_groups', data || []);
                return data || [];
            } catch (err) { console.error('DB.groups.getTrending:', err.message); return []; }
        },
        async getNew() {
            try {
                const cached = CACHE.get('new_groups', CONFIG.cacheDurations.homepage);
                if (cached) return cached;
                const { data, error } = await window.supabaseClient.from('groups').select('*').eq('status', 'approved')
                    .order('approved_at', { ascending: false }).limit(12);
                if (error) throw error;
                CACHE.set('new_groups', data || []);
                return data || [];
            } catch (err) { console.error('DB.groups.getNew:', err.message); return []; }
        },
        async getByPlatform(platform, opts = {}) { return DB.groups.getApproved({ ...opts, platform }); },
        async getByCategory(category, opts = {}) { return DB.groups.getApproved({ ...opts, category }); },
        async getByCountry(country, opts = {}) { return DB.groups.getApproved({ ...opts, country }); },
        async getSimilar(group) {
            try {
                if (!group) return [];
                const { data, error } = await window.supabaseClient.from('groups').select('*').eq('status', 'approved')
                    .neq('id', group.id).or('category.eq.' + group.category + ',platform.eq.' + group.platform)
                    .order('ranking_score', { ascending: false }).limit(6);
                if (error) throw error;
                return data || [];
            } catch (err) { console.error('DB.groups.getSimilar:', err.message); return []; }
        },
        async getByUser(userId) {
            try {
                if (!userId) return [];
                const { data, error } = await window.supabaseClient.from('groups').select('*')
                    .eq('submitter_uid', userId).order('submitted_at', { ascending: false });
                if (error) throw error;
                return data || [];
            } catch (err) { console.error('DB.groups.getByUser:', err.message); return []; }
        },
        async search(query, opts = {}) {
            try {
                if (!query || query.trim().length < 2) return { data: [], count: 0 };
                const words = query.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
                if (!words.length) return { data: [], count: 0 };
                const l = opts.limit || CONFIG.perPage;
                const o = opts.offset || 0;
                let q = window.supabaseClient.from('groups').select('*', { count: 'exact' }).eq('status', 'approved')
                    .overlaps('search_terms', words);
                if (opts.platform) q = q.eq('platform', opts.platform);
                if (opts.category) q = q.eq('category', opts.category);
                if (opts.country) q = q.eq('country', opts.country);
                const sortCol = opts.sort === 'newest' ? 'approved_at' : opts.sort === 'views' ? 'views' : opts.sort === 'rating' ? 'avg_rating' : 'ranking_score';
                q = q.order(sortCol, { ascending: false }).range(o, o + l - 1);
                const { data, error, count } = await q;
                if (error) throw error;
                return { data: data || [], count: count || 0 };
            } catch (err) { console.error('DB.groups.search:', err.message); return { data: [], count: 0 }; }
        },
        async incrementViews(id) {
            try {
                const key = 'gm_view_' + id;
                const last = localStorage.getItem(key);
                if (last && Date.now() - parseInt(last) < 3600000) return;
                await window.supabaseClient.rpc('increment_views', { p_group_id: id });
                localStorage.setItem(key, Date.now().toString());
            } catch (err) { console.error('DB.groups.incrementViews:', err.message); }
        },
        async incrementClicks(id) {
            try {
                const key = 'gm_click_' + id;
                const last = localStorage.getItem(key);
                if (last && Date.now() - parseInt(last) < 1800000) return;
                await window.supabaseClient.rpc('increment_clicks', { p_group_id: id });
                localStorage.setItem(key, Date.now().toString());
            } catch (err) { console.error('DB.groups.incrementClicks:', err.message); }
        },
        async incrementReports(id) {
            try { await window.supabaseClient.rpc('increment_reports', { p_group_id: id }); }
            catch (err) { console.error('DB.groups.incrementReports:', err.message); }
        },
        async getHighReports({ limit } = {}) {
            try {
                const l = limit || 20;
                const { data, error } = await window.supabaseClient.from('groups').select('*').eq('status', 'approved')
                    .gt('reports', 2).order('reports', { ascending: false }).limit(l);
                if (error) throw error;
                return data || [];
            } catch (err) { console.error('DB.groups.getHighReports:', err.message); return []; }
        }
    },
    pending: {
        // Audit fix #12: NOTE — group submissions currently rely on client-side sanitization only.
        // For full protection, add a Supabase Edge Function or DB trigger to re-validate
        // name, link, description, tags, and category server-side before inserting into pending.
        async submit(data) {
            try {
                // Issue 13 fix: guard against offline mutations to prevent silent failures
                if (!Security.checkOnline()) { UI.toast('You appear to be offline. Please check your connection.', 'error'); return null; }
                if (!Auth.requireAuth()) return null;
                if (!Security.checkRateLimit('submit')) { UI.toast('Too many submissions. Please wait.', 'error'); return null; }
                var dupResult;
                try {
                    dupResult = await window.supabaseClient.rpc('check_duplicate_link', { p_link: data.link });
                } catch (dupErr) {
                    // If the RPC doesn't exist or fails, skip duplicate check gracefully
                    console.warn('DB.pending.submit: check_duplicate_link unavailable, skipping:', dupErr.message);
                    dupResult = { data: false };
                }
                if (dupResult && dupResult.data) { UI.toast('This group link has already been submitted.', 'warning'); return null; }
                var searchTerms = '';
                try {
                    searchTerms = Algorithms.generateSearchTerms(data.name, data.description, data.tags, data.category, data.platform);
                } catch (stErr) {
                    console.warn('DB.pending.submit: generateSearchTerms failed, using fallback:', stErr.message);
                    searchTerms = (data.name + ' ' + data.description + ' ' + data.category + ' ' + data.platform).toLowerCase();
                }
                const row = {
                    name: Security.sanitize(data.name), link: data.link, platform: data.platform,
                    platform_type: data.platform_type || 'group', category: data.category,
                    country: data.country || 'GLOBAL', city: Security.sanitize(data.city || ''),
                    language: data.language || 'English', description: Security.sanitize(data.description),
                    tags: Array.isArray(data.tags) ? data.tags.map(t => Security.sanitize(t)) : [],
                    search_terms: searchTerms, submitter_uid: Auth.getUserId(),
                    submitter_email: Auth.getEmail() || '', status: 'pending'
                };
                const { data: result, error } = await window.supabaseClient.from('pending').insert(row).select().single();
                if (error) {
                    console.error('DB.pending.submit insert error:', error.code, error.message, error.details, error.hint);
                    if (error.code === '42501' || (error.message && error.message.indexOf('policy') !== -1)) {
                        UI.toast('Permission denied. Please sign out and sign in again.', 'error');
                    } else if (error.code === '23505') {
                        UI.toast('This group has already been submitted.', 'warning');
                    } else {
                        UI.toast('Failed to submit: ' + (error.message || 'Unknown error'), 'error');
                    }
                    return null;
                }
                return result;
            } catch (err) { console.error('DB.pending.submit:', err.message); UI.toast('Failed to submit. Please try again later.', 'error'); return null; }
        },
        async getByUser(userId) {
            try {
                if (!userId) return [];
                const { data, error } = await window.supabaseClient.from('pending').select('*')
                    .eq('submitter_uid', userId).order('submitted_at', { ascending: false });
                if (error) throw error;
                return data || [];
            } catch (err) { console.error('DB.pending.getByUser:', err.message); return []; }
        },
        async getAll({ status, limit, offset } = {}) {
            try {
                if (!Auth.requireAdmin()) return { data: [], count: 0 };
                let q = window.supabaseClient.from('pending').select('*', { count: 'exact' });
                if (status) q = q.eq('status', status);
                q = q.order('submitted_at', { ascending: false });
                if (limit) q = q.range(offset || 0, (offset || 0) + limit - 1);
                const { data, error, count } = await q;
                if (error) throw error;
                return { data: data || [], count: count || 0 };
            } catch (err) { console.error('DB.pending.getAll:', err.message); return { data: [], count: 0 }; }
        },
        async approve(id) {
            try {
                if (!Auth.requireAdmin()) return 'Permission denied. You must be an admin.';

                // Fetch the full pending row first
                const { data: p, error: fetchErr } = await window.supabaseClient
                    .from('pending').select('*').eq('id', id).single();
                if (fetchErr) {
                    console.error('DB.pending.approve fetch error:', fetchErr.message);
                    return 'Could not fetch pending group: ' + fetchErr.message;
                }
                if (!p) return 'Pending group not found.';

                // Ensure description is valid to avoid groups_description_check constraint (min ~20 chars)
                const rawDesc = (p.description && p.description.trim().length > 0)
                    ? p.description.trim()
                    : '';
                const safeDesc = rawDesc.length >= 20
                    ? rawDesc
                    : (rawDesc.length > 0 ? rawDesc + ' — Community group on GroupsMix.' : 'Community group on GroupsMix.');

                // If the description in the pending row is too short, update it before RPC
                if (!p.description || p.description.trim().length < 20) {
                    await window.supabaseClient.from('pending')
                        .update({ description: safeDesc }).eq('id', id);
                }

                // Try the RPC first
                const { error: rpcErr } = await window.supabaseClient.rpc('approve_group', { p_pending_id: id });
                if (!rpcErr) {
                    CACHE.clear();
                    DB.admin.log('approve_group', { pending_id: id });
                    return true;
                }

                // RPC failed — log and try manual fallback
                console.warn('DB.pending.approve RPC failed, attempting manual fallback:', rpcErr.code, rpcErr.message);

                // Manual fallback: insert into groups + update pending status
                const now = new Date().toISOString();
                const groupRow = {
                    name: p.name,
                    link: p.link,
                    platform: p.platform,
                    platform_type: p.platform_type || 'group',
                    category: p.category,
                    country: p.country || 'GLOBAL',
                    city: p.city || '',
                    language: p.language || 'English',
                    description: safeDesc,
                    tags: p.tags || [],
                    search_terms: p.search_terms || '',
                    submitter_uid: p.submitter_uid,
                    submitter_email: p.submitter_email || '',
                    status: 'approved',
                    approved_at: now,
                    submitted_at: p.submitted_at || now,
                    views: 0,
                    clicks: 0,
                    reports: 0,
                    avg_rating: 0,
                    review_count: 0,
                    ranking_score: 0
                };
                const { error: insertErr } = await window.supabaseClient
                    .from('groups').insert(groupRow);
                if (insertErr) {
                    console.error('DB.pending.approve manual insert error:', insertErr.code, insertErr.message, insertErr.details, insertErr.hint);
                    return 'RPC failed: ' + rpcErr.message + ' | Manual insert also failed: ' + insertErr.message;
                }

                // Mark the pending row as approved
                await window.supabaseClient.from('pending')
                    .update({ status: 'approved' }).eq('id', id);

                CACHE.clear();
                DB.admin.log('approve_group', { pending_id: id, method: 'manual_fallback' });
                return true;
            } catch (err) { console.error('DB.pending.approve:', err.message); return err.message || 'Unknown error'; }
        },
        async reject(id, reason) {
            try {
                if (!Auth.requireAdmin()) return 'Permission denied. You must be an admin.';
                const { error } = await window.supabaseClient.from('pending').update({ status: 'rejected' }).eq('id', id);
                if (error) {
                    console.error('DB.pending.reject error:', error.code, error.message, error.details, error.hint);
                    return error.message || 'Reject update failed';
                }
                DB.admin.log('reject_group', { pending_id: id, reason });
                return true;
            } catch (err) { console.error('DB.pending.reject:', err.message); return err.message || 'Unknown error'; }
        }
    },
    reviews: {
        async getByGroup(groupId, { limit, offset } = {}) {
            try {
                if (!groupId) return { data: [], count: 0 };
                const l = limit || 10;
                const o = offset || 0;
                const { data, error, count } = await window.supabaseClient.from('reviews').select('*', { count: 'exact' })
                    .eq('group_id', groupId).order('created_at', { ascending: false }).range(o, o + l - 1);
                if (error) throw error;
                return { data: data || [], count: count || 0 };
            } catch (err) { console.error('DB.reviews.getByGroup:', err.message); return { data: [], count: 0 }; }
        },
        async submit({ groupId, rating, text }) {
            try {
                // Issue 13 fix: guard against offline mutations to prevent silent failures
                if (!Security.checkOnline()) { UI.toast('You appear to be offline. Please check your connection.', 'error'); return null; }
                if (!Auth.requireAuth()) return null;
                if (!Security.checkRateLimit('review')) { UI.toast('Too many reviews. Please wait.', 'error'); return null; }
                const hasReviewed = await DB.reviews.hasReviewed(Auth.getUserId(), groupId);
                if (hasReviewed) { UI.toast('You have already reviewed this group.', 'warning'); return null; }
                const row = {
                    group_id: groupId, uid: Auth.getUserId(),
                    display_name: Auth.getUser()?.display_name || 'Anonymous',
                    photo_url: Auth.getUser()?.photo_url || '',
                    rating: Math.max(1, Math.min(5, parseInt(rating) || 1)),
                    text: Security.sanitize(text || '').slice(0, 500)
                };
                const { data, error } = await window.supabaseClient.from('reviews').insert(row).select().single();
                if (error) throw error;
                try { await window.supabaseClient.rpc('update_review_stats', { p_group_id: groupId, p_new_rating: row.rating }); } catch (err) { console.error('DB.reviews.submit update_review_stats:', err.message); }
                try { await DB.user.addGXP(Auth.getUserId(), 10); } catch (err) { console.error('DB.reviews.submit addGXP:', err.message); }
                CACHE.remove('group_' + groupId);
                return data;
            } catch (err) { console.error('DB.reviews.submit:', err.message); UI.toast('Failed to submit review.', 'error'); return null; }
        },
        async hasReviewed(userId, groupId) {
            try {
                if (!userId || !groupId) return false;
                const { data } = await window.supabaseClient.from('reviews').select('id').eq('uid', userId).eq('group_id', groupId).limit(1);
                return Array.isArray(data) && data.length > 0;
            } catch (err) { console.error('DB.reviews.hasReviewed:', err.message); return false; }
        }
    },
    reports: {
        async submit({ groupId, reason, details }) {
            try {
                // Issue 13 fix: guard against offline mutations to prevent silent failures
                if (!Security.checkOnline()) { UI.toast('You appear to be offline. Please check your connection.', 'error'); return null; }
                if (!Auth.requireAuth()) return null;
                if (!Security.checkRateLimit('report')) { UI.toast('Too many reports. Please wait.', 'error'); return null; }
                const row = { group_id: groupId, reporter_uid: Auth.getUserId(), reason: Security.sanitize(reason || ''), details: Security.sanitize(details || '').slice(0, 1000) };
                const { data, error } = await window.supabaseClient.from('reports').insert(row).select().single();
                if (error) throw error;
                try { await DB.groups.incrementReports(groupId); } catch (err) { console.error('DB.reports.submit incrementReports:', err.message); }
                return data;
            } catch (err) { console.error('DB.reports.submit:', err.message); UI.toast('Failed to submit report.', 'error'); return null; }
        },
        async getAll({ status, limit, offset } = {}) {
            try {
                if (!Auth.requireAdmin()) return { data: [], count: 0 };
                let q = window.supabaseClient.from('reports').select('*', { count: 'exact' });
                if (status) q = q.eq('status', status);
                q = q.order('created_at', { ascending: false });
                if (limit) q = q.range(offset || 0, (offset || 0) + limit - 1);
                const { data, error, count } = await q;
                if (error) throw error;
                return { data: data || [], count: count || 0 };
            } catch (err) { console.error('DB.reports.getAll:', err.message); return { data: [], count: 0 }; }
        },
        async resolve(id, action) {
            try {
                if (!Auth.requireAdmin()) return false;
                const { error } = await window.supabaseClient.from('reports').update({ status: 'resolved', action: Security.sanitize(action || ''), resolved_at: new Date().toISOString(), resolved_by: Auth.getUserId() }).eq('id', id);
                if (error) throw error;
                DB.admin.log('resolve_report', { report_id: id, action });
                return true;
            } catch (err) { console.error('DB.reports.resolve:', err.message); return false; }
        }
    },
    payments: {
        async submit(data) {
            try {
                // Issue 13 fix: guard against offline mutations to prevent silent failures
                if (!Security.checkOnline()) { UI.toast('You appear to be offline. Please check your connection.', 'error'); return null; }
                if (!Auth.requireAuth()) return null;
                if (!Security.checkRateLimit('payment')) { UI.toast('Too many payment attempts. Please wait.', 'error'); return null; }
                const row = {
                    uid: Auth.getUserId(), email: Auth.getEmail() || '', type: data.type || '',
                    service: data.service || '', group_id: data.group_id || null,
                    currency: data.currency || '', amount: parseFloat(data.amount) || 0,
                    tx_hash: Security.sanitize(data.tx_hash || ''), wallet_address: data.wallet_address || '',
                    status: 'pending'
                };
                const { data: result, error } = await window.supabaseClient.from('payments').insert(row).select().single();
                if (error) throw error;
                return result;
            } catch (err) {
                console.error('DB.payments.submit:', err.message);
                try {
                    const failed = JSON.parse(localStorage.getItem('gm_failed_payments') || '[]');
                    failed.push({ ...data, timestamp: Date.now() });
                    localStorage.setItem('gm_failed_payments', JSON.stringify(failed));
                } catch (err) { console.error('DB.payments.submit failed_payments save:', err.message); }
                UI.toast('Payment recorded locally. Please contact support.', 'warning');
                return null;
            }
        },
        async getByUser(userId) {
            try {
                if (!userId) return [];
                const { data, error } = await window.supabaseClient.from('payments').select('*').eq('uid', userId).order('created_at', { ascending: false });
                if (error) throw error;
                return data || [];
            } catch (err) { console.error('DB.payments.getByUser:', err.message); return []; }
        },
        async getAll({ status, limit, offset } = {}) {
            try {
                if (!Auth.requireAdmin()) return { data: [], count: 0 };
                let q = window.supabaseClient.from('payments').select('*', { count: 'exact' });
                if (status) q = q.eq('status', status);
                q = q.order('created_at', { ascending: false });
                if (limit) q = q.range(offset || 0, (offset || 0) + limit - 1);
                const { data, error, count } = await q;
                if (error) throw error;
                return { data: data || [], count: count || 0 };
            } catch (err) { console.error('DB.payments.getAll:', err.message); return { data: [], count: 0 }; }
        },
        async verify(id) {
            try {
                if (!Auth.requireAdmin()) return false;
                const { error } = await window.supabaseClient.from('payments').update({ status: 'verified', verified_at: new Date().toISOString(), verified_by: Auth.getUserId() }).eq('id', id);
                if (error) throw error;
                DB.admin.log('verify_payment', { payment_id: id });
                return true;
            } catch (err) { console.error('DB.payments.verify:', err.message); return false; }
        },
        async reject(id, reason) {
            try {
                if (!Auth.requireAdmin()) return false;
                const { error } = await window.supabaseClient.from('payments').update({ status: 'rejected', rejection_reason: Security.sanitize(reason || '') }).eq('id', id);
                if (error) throw error;
                DB.admin.log('reject_payment', { payment_id: id, reason });
                return true;
            } catch (err) { console.error('DB.payments.reject:', err.message); return false; }
        }
    },
    notifications: {
        async getByUser(userId, { limit, offset } = {}) {
            try {
                if (!userId) return { data: [], count: 0 };
                const l = limit || 20;
                const o = offset || 0;
                const { data, error, count } = await window.supabaseClient.from('notifications').select('*', { count: 'exact' })
                    .eq('uid', userId).order('created_at', { ascending: false }).range(o, o + l - 1);
                if (error) throw error;
                return { data: data || [], count: count || 0 };
            } catch (err) { console.error('DB.notifications.getByUser:', err.message); return { data: [], count: 0 }; }
        },
        async markRead(id) {
            try {
                const { error } = await window.supabaseClient.from('notifications').update({ read: true }).eq('id', id).eq('read', false);
                if (error) throw error;
                if (Auth.getUserId()) {
                    await window.supabaseClient.from('users').update({ unread_notifications: Math.max(0, (Auth.getUser()?.unread_notifications || 1) - 1) }).eq('id', Auth.getUserId());
                }
                return true;
            } catch (err) { console.error('DB.notifications.markRead:', err.message); return false; }
        },
        async markAllRead(userId) {
            try {
                if (!userId) return false;
                const { error } = await window.supabaseClient.from('notifications').update({ read: true }).eq('uid', userId).eq('read', false);
                if (error) throw error;
                await window.supabaseClient.from('users').update({ unread_notifications: 0 }).eq('id', userId);
                return true;
            } catch (err) { console.error('DB.notifications.markAllRead:', err.message); return false; }
        },
        async create({ uid, type, title, message, link }) {
            try {
                if (!uid) return null;
                const { data, error } = await window.supabaseClient.from('notifications').insert({
                    uid, type: type || 'info', title: title || '', message: message || '', link: link || ''
                }).select().single();
                if (error) throw error;
                await window.supabaseClient.from('users').update({ unread_notifications: (Auth.getUser()?.unread_notifications || 0) + 1 }).eq('id', uid);
                return data;
            } catch (err) { console.error('DB.notifications.create:', err.message); return null; }
        },
        async getUnreadCount(userId) {
            try {
                if (!userId) return 0;
                const { count, error } = await window.supabaseClient.from('notifications').select('id', { count: 'exact', head: true })
                    .eq('uid', userId).eq('read', false);
                if (error) throw error;
                return count || 0;
            } catch (err) { console.error('DB.notifications.getUnreadCount:', err.message); return 0; }
        }
    },
    user: {
        async getProfile(authId) {
            try {
                if (!authId) return null;
                const { data, error } = await window.supabaseClient.from('users').select('*').eq('auth_id', authId).single();
                if (error) throw error;
                return data;
            } catch (err) { console.error('DB.user.getProfile:', err.message); return null; }
        },
        async createProfile(profileData) {
            try {
                const { data, error } = await window.supabaseClient.from('users').insert(profileData).select().single();
                if (error) throw error;
                try { await window.supabaseClient.rpc('increment_user_count'); } catch (err) { console.error('DB.user.createProfile increment_user_count:', err.message); }
                return data;
            } catch (err) { console.error('DB.user.createProfile:', err.message); return null; }
        },
        async updateProfile(userId, updates) {
            try {
                if (!userId) return false;
                const allowed = {};
                if (updates.display_name !== undefined) allowed.display_name = Security.sanitize(updates.display_name);
                if (updates.photo_url !== undefined) allowed.photo_url = Security.sanitize(updates.photo_url);
                const { error } = await window.supabaseClient.from('users').update(allowed).eq('id', userId);
                if (error) throw error;
                CACHE.remove('user_profile');
                return true;
            } catch (err) { console.error('DB.user.updateProfile:', err.message); return false; }
        },
        async addGXP(userId, amount) {
            try {
                if (!userId || !amount) return;
                await window.supabaseClient.rpc('add_gxp', { p_user_id: userId, p_amount: amount });
            } catch (err) { console.error('DB.user.addGXP:', err.message); }
        },
        async getLeaderboard({ limit, offset } = {}) {
            try {
                const cached = CACHE.get('leaderboard', CONFIG.cacheDurations.lists);
                if (cached) return cached;
                const l = limit || 50;
                const o = offset || 0;
                const { data, error } = await window.supabaseClient.from('users')
                    .select('id, display_name, photo_url, gxp, level')
                    .order('gxp', { ascending: false }).range(o, o + l - 1);
                if (error) throw error;
                CACHE.set('leaderboard', data || []);
                return data || [];
            } catch (err) { console.error('DB.user.getLeaderboard:', err.message); return []; }
        },
        async dailyLoginCheck(userId) {
            try {
                if (!userId) return;
                const today = new Date().toISOString().split('T')[0];
                const key = 'gm_last_daily_' + userId;
                if (localStorage.getItem(key) === today) return;
                await DB.user.addGXP(userId, 3);
                await window.supabaseClient.from('users').update({ last_login: new Date().toISOString() }).eq('id', userId);
                localStorage.setItem(key, today);
            } catch (err) { console.error('DB.user.dailyLoginCheck:', err.message); }
        }
    },
    contacts: {
        async submit(data) {
            try {
                // Issue 13 fix: guard against offline mutations to prevent silent failures
                if (!Security.checkOnline()) { UI.toast('You appear to be offline. Please check your connection.', 'error'); return null; }
                if (!Security.checkRateLimit('contact')) { UI.toast('Too many messages. Please wait.', 'error'); return null; }
                const row = {
                    name: Security.sanitize(data.name || ''), email: data.email || '',
                    subject: Security.sanitize(data.subject || ''), message: Security.sanitize(data.message || ''),
                    uid: Auth.getUserId() || null
                };
                const { data: result, error } = await window.supabaseClient.from('contacts').insert(row).select().single();
                if (error) throw error;
                return result;
            } catch (err) { console.error('DB.contacts.submit:', err.message); UI.toast('Failed to send message.', 'error'); return null; }
        }
    },
    donations: {
        async submit(data) {
            try {
                // Issue 13 fix: guard against offline mutations to prevent silent failures
                if (!Security.checkOnline()) { UI.toast('You appear to be offline. Please check your connection.', 'error'); return null; }
                if (!Security.checkRateLimit('payment')) { UI.toast('Too many attempts. Please wait.', 'error'); return null; }
                const row = {
                    uid: Auth.getUserId() || null, display_name: Security.sanitize(data.display_name || 'Anonymous'),
                    message: Security.sanitize(data.message || '').slice(0, 500),
                    currency: data.currency || '', amount: parseFloat(data.amount) || 0,
                    tx_hash: Security.sanitize(data.tx_hash || ''), status: 'pending'
                };
                const { data: result, error } = await window.supabaseClient.from('donations').insert(row).select().single();
                if (error) throw error;
                return result;
            } catch (err) { console.error('DB.donations.submit:', err.message); return null; }
        },
        async getVerified({ limit } = {}) {
            try {
                const cached = CACHE.get('donations_verified', CONFIG.cacheDurations.donations);
                if (cached) return cached;
                const { data, error } = await window.supabaseClient.from('donations').select('*').eq('status', 'verified')
                    .order('created_at', { ascending: false }).limit(limit || 20);
                if (error) throw error;
                CACHE.set('donations_verified', data || []);
                return data || [];
            } catch (err) { console.error('DB.donations.getVerified:', err.message); return []; }
        }
    },
    articles: {
        async getPublished({ limit, offset } = {}) {
            try {
                const cached = CACHE.get('articles', CONFIG.cacheDurations.articles);
                if (cached && !offset) return cached;
                const l = limit || CONFIG.perPage;
                const o = offset || 0;
                const { data, error, count } = await window.supabaseClient.from('articles').select('*', { count: 'exact' })
                    .eq('status', 'published').order('published_at', { ascending: false }).range(o, o + l - 1);
                if (error) throw error;
                const result = { data: data || [], count: count || 0 };
                if (!offset) CACHE.set('articles', result);
                return result;
            } catch (err) { console.error('DB.articles.getPublished:', err.message); return { data: [], count: 0 }; }
        },
        async getBySlug(slug) {
            try {
                if (!slug) return null;
                const cached = CACHE.get('article_' + slug, CONFIG.cacheDurations.articles);
                if (cached) return cached;
                const { data, error } = await window.supabaseClient.from('articles').select('*').eq('slug', slug).single();
                if (error) throw error;
                CACHE.set('article_' + slug, data);
                return data;
            } catch (err) { console.error('DB.articles.getBySlug:', err.message); return null; }
        },
        async incrementViews(id) {
            try { await window.supabaseClient.rpc('increment_article_views', { p_article_id: id }); }
            catch (err) { console.error('DB.articles.incrementViews:', err.message); }
        },
        async getAll() {
            try {
                if (!Auth.requireAdmin()) return { data: [] };
                const { data, error } = await window.supabaseClient.from('articles').select('*').order('created_at', { ascending: false });
                if (error) throw error;
                return { data: data || [] };
            } catch (err) { console.error('DB.articles.getAll:', err.message); return { data: [] }; }
        },
        async create(articleData) {
            try {
                if (!Auth.requireAdmin()) return null;
                if (articleData.published !== undefined) {
                    articleData.status = articleData.published ? 'published' : 'draft';
                    delete articleData.published;
                }
                articleData.published_at = new Date().toISOString();
                const { data, error } = await window.supabaseClient.from('articles').insert(articleData).select().single();
                if (error) throw error;
                return data;
            } catch (err) { console.error('DB.articles.create:', err.message); return null; }
        },
        async update(id, articleData) {
            try {
                if (!Auth.requireAdmin()) return null;
                if (articleData.published !== undefined) {
                    articleData.status = articleData.published ? 'published' : 'draft';
                    delete articleData.published;
                }
                const { data, error } = await window.supabaseClient.from('articles').update(articleData).eq('id', id).select().single();
                if (error) throw error;
                return data;
            } catch (err) { console.error('DB.articles.update:', err.message); return null; }
        }
    },
    ads: {
        _seenKey: 'gm_seen_ads',
        _getSeenIds() {
            try {
                const raw = sessionStorage.getItem(this._seenKey);
                return raw ? JSON.parse(raw) : [];
            } catch (err) { return []; }
        },
        _markSeen(adId) {
            try {
                const seen = this._getSeenIds();
                if (!seen.includes(adId)) seen.push(adId);
                sessionStorage.setItem(this._seenKey, JSON.stringify(seen));
            } catch (err) { console.error('DB.ads._markSeen:', err.message); }
        },
        async getActive(position, options) {
            try {
                const category = (options && options.category) ? options.category : '';
                const cacheKey = 'ads_' + position + (category ? '_' + category : '');
                const cached = CACHE.get(cacheKey, CONFIG.cacheDurations.ads);
                if (cached) return cached;
                const now = new Date().toISOString();
                const limit = CONFIG.adSlotLimits[position] || 2;
                var allAds = [];
                if (category) {
                    const { data: nicheAds, error: nicheErr } = await window.supabaseClient.from('ads').select('*')
                        .eq('status', 'active').eq('position', position).eq('target_category', category)
                        .gt('expires_at', now).limit(limit);
                    if (!nicheErr && nicheAds) allAds = nicheAds;
                    if (allAds.length < limit) {
                        const nicheIds = allAds.map(function(a) { return a.id; });
                        var q = window.supabaseClient.from('ads').select('*')
                            .eq('status', 'active').eq('position', position)
                            .gt('expires_at', now).limit(limit - allAds.length);
                        if (nicheIds.length > 0) {
                            q = q.not('id', 'in', '(' + nicheIds.join(',') + ')');
                        }
                        const { data: fallback, error: fbErr } = await q;
                        if (!fbErr && fallback) allAds = allAds.concat(fallback);
                    }
                } else {
                    const { data, error } = await window.supabaseClient.from('ads').select('*')
                        .eq('status', 'active').eq('position', position)
                        .gt('expires_at', now).limit(limit * 3);
                    if (error) throw error;
                    allAds = data || [];
                }
                var qualityAds = allAds.filter(function(ad) {
                    var trustScore = ad.trust_score !== undefined ? (isNaN(ad.trust_score) ? 0 : Number(ad.trust_score)) : 100;
                    return trustScore >= 70;
                });
                var seenIds = this._getSeenIds();
                var unseenAds = qualityAds.filter(function(ad) { return seenIds.indexOf(ad.id) === -1; });
                if (unseenAds.length === 0) {
                    try { sessionStorage.removeItem(this._seenKey); } catch (e) { /* ok */ }
                    unseenAds = qualityAds;
                }
                for (var i = unseenAds.length - 1; i > 0; i--) {
                    var j = Math.floor(Math.random() * (i + 1));
                    var temp = unseenAds[i];
                    unseenAds[i] = unseenAds[j];
                    unseenAds[j] = temp;
                }
                var result = unseenAds.slice(0, limit);
                CACHE.set(cacheKey, result);
                return result;
            } catch (err) { console.error('DB.ads.getActive:', err.message); return []; }
        },
        async trackImpression(adId) {
            try {
                if (!adId) return;
                this._markSeen(adId);
                await window.supabaseClient.rpc('increment_ad_impressions', { p_ad_id: adId });
            } catch (err) { console.error('DB.ads.trackImpression:', err.message); }
        },
        async trackClick(adId) {
            try {
                if (!adId) return;
                await window.supabaseClient.rpc('increment_ad_clicks', { p_ad_id: adId });
            } catch (err) { console.error('DB.ads.trackClick:', err.message); }
        },
        async incrementImpressions(id) {
            try { await window.supabaseClient.rpc('increment_ad_impressions', { p_ad_id: id }); } catch (err) { console.error('DB.ads.incrementImpressions:', err.message); }
        },
        async incrementClicks(id) {
            try { await window.supabaseClient.rpc('increment_ad_clicks', { p_ad_id: id }); } catch (err) { console.error('DB.ads.incrementClicks:', err.message); }
        },
        async getInsights(userId) {
            try {
                if (!userId) return [];
                const { data, error } = await window.supabaseClient.rpc('get_ad_insights', { p_uid: userId });
                if (error) throw error;
                return Array.isArray(data) ? data : [];
            } catch (err) { console.error('DB.ads.getInsights:', err.message); return []; }
        }
    },
    stats: {
        async getGlobal() {
            try {
                const cached = CACHE.get('stats_global', CONFIG.cacheDurations.stats);
                if (cached) return cached;
                // Try dedicated stats table first
                const { data, error } = await window.supabaseClient.from('stats').select('*').eq('key', 'global').maybeSingle();
                if (!error && data && (data.total_groups || data.total_users)) {
                    CACHE.set('stats_global', data);
                    return data;
                }
                // Fallback: compute stats from actual tables when stats row is missing or empty
                const [groupsRes, usersRes] = await Promise.allSettled([
                    window.supabaseClient.from('groups').select('country', { count: 'exact', head: false }).eq('status', 'approved'),
                    window.supabaseClient.from('users').select('id', { count: 'exact', head: true })
                ]);
                var totalGroups = 0, totalUsers = 0, totalCountries = 0;
                if (groupsRes.status === 'fulfilled' && !groupsRes.value.error) {
                    totalGroups = groupsRes.value.count || (groupsRes.value.data ? groupsRes.value.data.length : 0);
                    // Count unique countries from group data
                    var countries = new Set();
                    (groupsRes.value.data || []).forEach(function(g) { if (g.country && g.country !== 'GLOBAL') countries.add(g.country); });
                    totalCountries = countries.size || 1; // at least 1 if there are groups
                }
                if (usersRes.status === 'fulfilled' && !usersRes.value.error) {
                    totalUsers = usersRes.value.count || 0;
                }
                var computed = { total_groups: totalGroups, total_users: totalUsers, total_countries: totalCountries };
                if (totalGroups || totalUsers) CACHE.set('stats_global', computed);
                return computed;
            } catch (err) { console.error('DB.stats.getGlobal:', err.message); return null; }
        }
    },
    config: {
        async getSettings() {
            try {
                const cached = CACHE.get('settings', CONFIG.cacheDurations.settings);
                if (cached) return cached;
                const { data, error } = await window.supabaseClient.from('config').select('value').eq('key', 'settings').single();
                if (error) throw error;
                CACHE.set('settings', data?.value || {});
                return data?.value || {};
            } catch (err) { console.error('DB.config.getSettings:', err.message); return {}; }
        },
        async updateSettings(value) {
            try {
                if (!Auth.requireAdmin()) return false;
                const { error } = await window.supabaseClient.from('config').update({ value }).eq('key', 'settings');
                if (error) throw error;
                CACHE.remove('settings');
                DB.admin.log('update_settings', { keys: Object.keys(value) });
                return true;
            } catch (err) { console.error('DB.config.updateSettings:', err.message); return false; }
        }
    },
    admin: {
        async log(action, details) {
            try {
                await window.supabaseClient.from('admin_log').insert({
                    action, details: details || {}, admin_uid: Auth.getUserId(), admin_email: Auth.getEmail() || ''
                });
            } catch (err) { console.error('DB.admin.log:', err.message); }
        },
        async getLog({ limit, offset } = {}) {
            try {
                if (!Auth.requireAdmin()) return { data: [], count: 0 };
                const l = limit || CONFIG.adminPerPage;
                const o = offset || 0;
                const { data, error, count } = await window.supabaseClient.from('admin_log').select('*', { count: 'exact' })
                    .order('created_at', { ascending: false }).range(o, o + l - 1);
                if (error) throw error;
                return { data: data || [], count: count || 0 };
            } catch (err) { console.error('DB.admin.getLog:', err.message); return { data: [], count: 0 }; }
        },
        async getStats() {
            try {
                if (!Auth.requireAdmin()) return null;
                const [groups, pending, users, payments, reports] = await Promise.all([
                    window.supabaseClient.from('groups').select('id', { count: 'exact', head: true }),
                    window.supabaseClient.from('pending').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
                    window.supabaseClient.from('users').select('id', { count: 'exact', head: true }),
                    window.supabaseClient.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
                    window.supabaseClient.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending')
                ]);
                return { totalGroups: groups.count || 0, pendingGroups: pending.count || 0, totalUsers: users.count || 0, pendingPayments: payments.count || 0, pendingReports: reports.count || 0 };
            } catch (err) { console.error('DB.admin.getStats:', err.message); return null; }
        },
        async getUsers({ limit, offset, search } = {}) {
            try {
                if (!Auth.requireAdmin()) return { data: [], count: 0 };
                const l = limit || CONFIG.adminPerPage;
                const o = offset || 0;
                let q = window.supabaseClient.from('users').select('*', { count: 'exact' });
                if (search) q = q.ilike('email', '%' + search + '%');
                q = q.order('created_at', { ascending: false }).range(o, o + l - 1);
                const { data, error, count } = await q;
                if (error) throw error;
                return { data: data || [], count: count || 0 };
            } catch (err) { console.error('DB.admin.getUsers:', err.message); return { data: [], count: 0 }; }
        },
        async updateUser(userId, updates) {
            try {
                if (!Auth.requireAdmin()) return false;
                const { error } = await window.supabaseClient.from('users').update(updates).eq('id', userId);
                if (error) throw error;
                DB.admin.log('update_user', { user_id: userId, updates });
                return true;
            } catch (err) { console.error('DB.admin.updateUser:', err.message); return false; }
        },
        async updateUserRole(userId, newRole) {
            try {
                if (!Auth.requireAdmin()) return false;
                const validRoles = ['admin', 'moderator', 'editor', 'user'];
                if (!validRoles.includes(newRole)) { UI.toast('Invalid role', 'error'); return false; }
                const { error } = await window.supabaseClient.rpc('update_user_role', { p_user_id: userId, p_new_role: newRole });
                if (error) throw error;
                DB.admin.log('update_user_role', { user_id: userId, new_role: newRole });
                return true;
            } catch (err) { console.error('DB.admin.updateUserRole:', err.message); UI.toast(err.message || 'Failed to update role', 'error'); return false; }
        },
        async getContacts({ limit, offset } = {}) {
            try {
                if (!Auth.requireAdmin()) return { data: [], count: 0 };
                const l = limit || CONFIG.adminPerPage;
                const o = offset || 0;
                const { data, error, count } = await window.supabaseClient.from('contacts').select('*', { count: 'exact' })
                    .order('created_at', { ascending: false }).range(o, o + l - 1);
                if (error) throw error;
                return { data: data || [], count: count || 0 };
            } catch (err) { console.error('DB.admin.getContacts:', err.message); return { data: [], count: 0 }; }
        },
        async updateContact(id, updates) {
            try {
                if (!Auth.requireAdmin()) return false;
                const { error } = await window.supabaseClient.from('contacts').update(updates).eq('id', id);
                if (error) throw error;
                return true;
            } catch (err) { console.error('DB.admin.updateContact:', err.message); return false; }
        },
        async getDonations({ limit, offset } = {}) {
            try {
                if (!Auth.requireAdmin()) return { data: [], count: 0 };
                const l = limit || CONFIG.adminPerPage;
                const o = offset || 0;
                const { data, error, count } = await window.supabaseClient.from('donations').select('*', { count: 'exact' })
                    .order('created_at', { ascending: false }).range(o, o + l - 1);
                if (error) throw error;
                return { data: data || [], count: count || 0 };
            } catch (err) { console.error('DB.admin.getDonations:', err.message); return { data: [], count: 0 }; }
        },
        async updateDonation(id, updates) {
            try {
                if (!Auth.requireAdmin()) return false;
                const { error } = await window.supabaseClient.from('donations').update(updates).eq('id', id);
                if (error) throw error;
                DB.admin.log('update_donation', { donation_id: id });
                return true;
            } catch (err) { console.error('DB.admin.updateDonation:', err.message); return false; }
        }
    }
};

// ═══════════════════════════════════════
// MODULE 5a: DB.marketplace (Marketplace Listings System)
// ═══════════════════════════════════════
const Marketplace = {
    // ── Digital product category definitions (whitelist — no freeform "Other") ──
    _categories: [
        {
            id: 'templates',
            name: 'Templates',
            icon: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>',
            platforms: []
        },
        {
            id: 'bots',
            name: 'Bots',
            icon: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><circle cx="9" cy="10" r="1"/><circle cx="15" cy="10" r="1"/><path d="M9 15h6"/><line x1="12" y1="1" x2="12" y2="4"/></svg>',
            platforms: []
        },
        {
            id: 'scripts',
            name: 'Scripts',
            icon: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
            platforms: []
        },
        {
            id: 'design_assets',
            name: 'Design Assets',
            icon: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>',
            platforms: []
        },
        {
            id: 'guides',
            name: 'Guides',
            icon: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
            platforms: []
        },
        {
            id: 'tools',
            name: 'Tools',
            icon: '<svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>',
            platforms: []
        }
    ],

    // ── Banned keywords — auto-reject listings containing these ──
    _bannedKeywords: [
        'account', 'followers', 'subscribers', 'verified badge',
        'hacked', 'cracked', 'leaked', 'stolen',
        'login', 'password', 'credentials',
        'exploit', 'crack', 'nulled', 'warez', 'pirated'
    ],

    /**
     * Get all marketplace categories.
     */
    getCategories() {
        return this._categories;
    },

    /**
     * Check if a category ID is valid (in the whitelist).
     */
    isValidCategory(categoryId) {
        return this._categories.some(function(c) { return c.id === categoryId; });
    },

    /**
     * Check text for banned keywords. Returns { banned: boolean, keyword: string }.
     */
    checkBannedKeywords(text) {
        var lower = (text || '').toLowerCase();
        for (var i = 0; i < this._bannedKeywords.length; i++) {
            if (lower.indexOf(this._bannedKeywords[i]) !== -1) {
                return { banned: true, keyword: this._bannedKeywords[i] };
            }
        }
        return { banned: false, keyword: '' };
    },

    /**
     * Check if current user is a verified seller (email + phone verified).
     * Returns { verified: boolean, reason: string }.
     */
    async checkSellerVerification() {
        try {
            var userId = Auth.getUserId();
            if (!userId) return { verified: false, reason: 'Not signed in' };
            var { data, error } = await window.supabaseClient
                .from('users').select('email, phone_verified').eq('id', userId).single();
            if (error) throw error;
            if (!data) return { verified: false, reason: 'User not found' };
            if (!data.email) return { verified: false, reason: 'Email not verified. Please verify your email in Settings.' };
            if (!data.phone_verified) return { verified: false, reason: 'Phone not verified. Please verify your phone number in Settings before selling.' };
            return { verified: true, reason: '' };
        } catch (err) {
            console.error('checkSellerVerification:', err.message);
            return { verified: false, reason: 'Could not verify seller status. Please try again.' };
        }
    },

    /**
     * Get active marketplace listings with shuffle + popularity weighting.
     * Each page load returns a different order. High-engagement listings appear more.
     * @param {Object} options - { platform, category, limit, offset, sort }
     * @returns {Promise<{data: Array, count: number}>}
     */
    async getListings(options) {
        try {
            var opts = options || {};
            var limit = opts.limit || 24;
            var offset = opts.offset || 0;
            var platform = opts.platform || '';
            var category = opts.category || '';
            var sort = opts.sort || 'smart';
            var cacheKey = 'mk_listings_' + [platform, category, sort, limit, offset].join('_');
            var cached = CACHE.get(cacheKey, 60000); // 1 min cache for freshness
            if (cached) return cached;

            var q = window.supabaseClient.from('marketplace_listings')
                .select('*', { count: 'exact' })
                .eq('status', 'active');
            if (platform) q = q.eq('platform', platform);
            if (category) {
                q = q.eq('product_category', category);
            }

            if (sort === 'newest') {
                q = q.order('created_at', { ascending: false });
            } else if (sort === 'price_low') {
                q = q.order('price', { ascending: true });
            } else if (sort === 'price_high') {
                q = q.order('price', { ascending: false });
            } else if (sort === 'popular') {
                q = q.order('clicks', { ascending: false });
            } else {
                // 'smart' sort: fetch more, then shuffle with popularity weighting
                q = q.order('created_at', { ascending: false }).limit(Math.min(limit * 3, 100));
            }

            if (sort !== 'smart') {
                q = q.range(offset, offset + limit - 1);
            }

            var { data, error, count } = await q;
            if (error) throw error;
            var listings = data || [];

            if (sort === 'smart' && listings.length > 0) {
                // Popularity-weighted shuffle algorithm
                listings = Marketplace._popularityShuffle(listings);
                listings = listings.slice(offset, offset + limit);
            }

            var result = { data: listings, count: count || 0 };
            CACHE.set(cacheKey, result);
            return result;
        } catch (err) {
            console.error('Marketplace.getListings:', err.message);
            return { data: [], count: 0 };
        }
    },

    /**
     * Popularity-weighted shuffle: items with more engagement appear more often
     * but order is randomized each time.
     * @param {Array} items
     * @returns {Array}
     */
    _popularityShuffle(items) {
        // Calculate engagement score for each item
        var scored = items.map(function(item) {
            var clickScore = (item.clicks || 0) * 2;
            var impressionScore = (item.impressions || 0) * 0.1;
            var recencyBonus = 1;
            if (item.created_at) {
                var daysSince = (Date.now() - new Date(item.created_at).getTime()) / (24 * 60 * 60 * 1000);
                if (daysSince <= 1) recencyBonus = 3;
                else if (daysSince <= 3) recencyBonus = 2;
                else if (daysSince <= 7) recencyBonus = 1.5;
                else recencyBonus = 1;
            }
            var score = (clickScore + impressionScore + 1) * recencyBonus;
            // Add randomness: multiply by random factor 0.5-1.5
            var randomFactor = 0.5 + Math.random();
            return { item: item, weight: score * randomFactor };
        });

        // Sort by weighted score (randomized)
        scored.sort(function(a, b) { return b.weight - a.weight; });
        return scored.map(function(s) { return s.item; });
    },

    /**
     * Get a single listing by ID.
     */
    async getOne(id) {
        try {
            if (!id) return null;
            var { data, error } = await window.supabaseClient
                .from('marketplace_listings').select('*').eq('id', id).single();
            if (error) throw error;
            return data;
        } catch (err) { console.error('Marketplace.getOne:', err.message); return null; }
    },

    /**
     * Get listings by a specific seller.
     */
    async getBySeller(sellerId) {
        try {
            if (!sellerId) return [];
            var { data, error } = await window.supabaseClient
                .from('marketplace_listings').select('*')
                .eq('seller_id', sellerId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        } catch (err) { console.error('Marketplace.getBySeller:', err.message); return []; }
    },

    /**
     * Submit a new marketplace listing.
     */
    async submit(listingData) {
        try {
            if (!Security.checkOnline()) { UI.toast('You appear to be offline.', 'error'); return null; }
            if (!Auth.requireAuth()) return null;
            if (!Security.checkRateLimit('submit')) { UI.toast('Too many submissions. Please wait.', 'error'); return null; }

            // Feature 1: Seller verification — require email + phone
            var verification = await Marketplace.checkSellerVerification();
            if (!verification.verified) {
                UI.toast(verification.reason, 'error');
                return null;
            }

            // Feature 2: Validate product category is in the whitelist
            var category = listingData.category || '';
            if (!Marketplace.isValidCategory(category)) {
                UI.toast('Please select a valid product category.', 'error');
                return null;
            }

            // Feature 5: Banned keywords filter
            var titleCheck = Marketplace.checkBannedKeywords(listingData.title || '');
            var descCheck = Marketplace.checkBannedKeywords(listingData.description || '');
            if (titleCheck.banned) {
                UI.toast('Listing rejected: title contains banned keyword "' + titleCheck.keyword + '". Please remove it.', 'error');
                return null;
            }
            if (descCheck.banned) {
                UI.toast('Listing rejected: description contains banned keyword "' + descCheck.keyword + '". Please remove it.', 'error');
                return null;
            }

            var row = {
                seller_id: Auth.getUserId(),
                platform: listingData.platform || '',
                product_category: category,
                title: Security.sanitize(listingData.title || '').slice(0, 100),
                description: Security.sanitize(listingData.description || '').slice(0, 1000),
                price: Math.max(1, parseInt(listingData.price) || 1),
                currency: 'coins',
                contact_link: Security.sanitize(listingData.contact_link || ''),
                delivery_url: Security.sanitize(listingData.delivery_url || ''),
                status: 'pending',
                seller_verified: true
            };

            var { data, error } = await window.supabaseClient
                .from('marketplace_listings').insert(row).select().single();
            if (error) {
                console.error('Marketplace.submit insert error:', error.code, error.message);
                if (error.code === '42501') {
                    UI.toast('Permission denied. Please sign out and sign in again.', 'error');
                } else {
                    UI.toast('Failed to submit listing: ' + (error.message || 'Unknown error'), 'error');
                }
                return null;
            }
            CACHE.clear();
            return data;
        } catch (err) {
            console.error('Marketplace.submit:', err.message);
            UI.toast('Failed to submit listing.', 'error');
            return null;
        }
    },

    /**
     * Update a listing (owner only).
     */
    async update(id, updates) {
        try {
            if (!id || !Auth.requireAuth()) return false;
            var allowed = {};
            if (updates.title !== undefined) allowed.title = Security.sanitize(updates.title).slice(0, 100);
            if (updates.description !== undefined) allowed.description = Security.sanitize(updates.description).slice(0, 1000);
            if (updates.price !== undefined) allowed.price = Math.max(0, parseFloat(updates.price) || 0);
            if (updates.status !== undefined) allowed.status = updates.status;
            allowed.updated_at = new Date().toISOString();

            var { error } = await window.supabaseClient
                .from('marketplace_listings').update(allowed).eq('id', id).eq('seller_id', Auth.getUserId());
            if (error) throw error;
            CACHE.clear();
            return true;
        } catch (err) { console.error('Marketplace.update:', err.message); return false; }
    },

    /**
     * Increment impressions for a listing.
     */
    async incrementImpressions(id) {
        try {
            if (!id) return;
            var key = 'mk_imp_' + id;
            var last = sessionStorage.getItem(key);
            if (last && Date.now() - parseInt(last) < 60000) return; // 1 min throttle
            await window.supabaseClient.rpc('increment_listing_impressions', { p_listing_id: id });
            sessionStorage.setItem(key, Date.now().toString());
        } catch (err) { console.error('Marketplace.incrementImpressions:', err.message); }
    },

    /**
     * Increment clicks for a listing.
     */
    async incrementClicks(id) {
        try {
            if (!id) return;
            await window.supabaseClient.rpc('increment_listing_clicks', { p_listing_id: id });
        } catch (err) { console.error('Marketplace.incrementClicks:', err.message); }
    },

    /**
     * Report a listing.
     */
    async reportListing(id) {
        try {
            if (!id) return;
            if (!Auth.requireAuth()) return;
            await window.supabaseClient.rpc('increment_listing_reports', { p_listing_id: id });
            UI.toast('Listing reported. Thank you.', 'success');
        } catch (err) { console.error('Marketplace.reportListing:', err.message); UI.toast('Failed to report.', 'error'); }
    },

    /**
     * Get seller profile info: user data + avg rating + review count.
     */
    async getSellerProfile(sellerId) {
        try {
            if (!sellerId) return null;
            var [userResult, statsResult, listingsResult] = await Promise.all([
                window.supabaseClient.from('users').select('id, auth_id, display_name, photo_url, gxp, level, created_at').eq('id', sellerId).single(),
                window.supabaseClient.rpc('get_seller_stats', { p_seller_id: sellerId }),
                window.supabaseClient.from('marketplace_listings').select('*').eq('seller_id', sellerId).eq('status', 'active').order('created_at', { ascending: false })
            ]);

            if (userResult.error) throw userResult.error;
            var user = userResult.data;
            var stats = statsResult.data || { avg_rating: 0, review_count: 0 };
            // Handle both array and single object returns from RPC
            if (Array.isArray(stats) && stats.length > 0) stats = stats[0];
            var listings = listingsResult.data || [];

            return {
                user: user,
                avg_rating: parseFloat(stats.avg_rating) || 0,
                review_count: parseInt(stats.review_count) || 0,
                listings: listings
            };
        } catch (err) { console.error('Marketplace.getSellerProfile:', err.message); return null; }
    },

    /**
     * Get reviews for a seller.
     */
    async getSellerReviews(sellerId, options) {
        try {
            if (!sellerId) return { data: [], count: 0 };
            var opts = options || {};
            var limit = opts.limit || 20;
            var offset = opts.offset || 0;
            var { data, error, count } = await window.supabaseClient
                .from('seller_reviews').select('*', { count: 'exact' })
                .eq('seller_id', sellerId)
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);
            if (error) throw error;
            return { data: data || [], count: count || 0 };
        } catch (err) { console.error('Marketplace.getSellerReviews:', err.message); return { data: [], count: 0 }; }
    },

    /**
     * Submit a review for a seller.
     */
    async submitReview(sellerId, rating, reviewText, listingId) {
        try {
            if (!Security.checkOnline()) { UI.toast('You appear to be offline.', 'error'); return null; }
            if (!Auth.requireAuth()) return null;
            if (!Security.checkRateLimit('review')) { UI.toast('Too many reviews. Please wait.', 'error'); return null; }
            if (sellerId === Auth.getUserId()) { UI.toast('You cannot review yourself.', 'warning'); return null; }

            var row = {
                seller_id: sellerId,
                reviewer_id: Auth.getUserId(),
                listing_id: listingId || null,
                rating: Math.max(1, Math.min(5, parseInt(rating) || 1)),
                review_text: Security.sanitize(reviewText || '').slice(0, 500)
            };

            var { data, error } = await window.supabaseClient
                .from('seller_reviews').insert(row).select().single();
            if (error) {
                if (error.code === '23505') {
                    UI.toast('You have already reviewed this seller.', 'warning');
                } else {
                    UI.toast('Failed to submit review: ' + (error.message || 'Unknown error'), 'error');
                }
                return null;
            }
            UI.toast('Review submitted!', 'success');
            return data;
        } catch (err) { console.error('Marketplace.submitReview:', err.message); UI.toast('Failed to submit review.', 'error'); return null; }
    },

    /**
     * Get trending listings (most clicked).
     * @param {number} limit - max items to return
     * @returns {Promise<Array>}
     */
    async getTrending(limit) {
        try {
            var l = limit || 6;
            var cacheKey = 'mk_trending_' + l;
            var cached = CACHE.get(cacheKey, 120000); // 2 min cache
            if (cached) return cached;
            var { data, error } = await window.supabaseClient
                .from('marketplace_listings').select('*')
                .eq('status', 'active')
                .order('clicks', { ascending: false })
                .limit(l);
            if (error) throw error;
            var result = data || [];
            // Only return items with some engagement
            result = result.filter(function(item) { return (item.clicks || 0) > 0; });
            CACHE.set(cacheKey, result);
            return result;
        } catch (err) { console.error('Marketplace.getTrending:', err.message); return []; }
    },

    /**
     * Track a custom platform name for auto-growth algorithm.
     * When 10+ users add the same platform, it auto-promotes to fixed options.
     */
    async trackCustomPlatform(name, category) {
        try {
            if (!name) return;
            await window.supabaseClient.rpc('increment_custom_platform', {
                p_name: name,
                p_category: category || 'other'
            });
        } catch (err) { console.error('Marketplace.trackCustomPlatform:', err.message); }
    },

    /**
     * Get auto-promoted custom platforms (usage >= 10).
     */
    async getPromotedPlatforms() {
        try {
            var cacheKey = 'mk_promoted_platforms';
            var cached = CACHE.get(cacheKey, 300000); // 5 min cache
            if (cached) return cached;
            var { data, error } = await window.supabaseClient.rpc('get_promoted_platforms');
            if (error) throw error;
            var result = data || [];
            CACHE.set(cacheKey, result);
            return result;
        } catch (err) { console.error('Marketplace.getPromotedPlatforms:', err.message); return []; }
    },

    /**
     * Validate a custom platform name via AI (OpenRouter).
     * Returns { valid: boolean, message: string }
     */
    async validatePlatformWithAI(platformName) {
        try {
            var res = await fetch('/api/validate-platform', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform: platformName })
            });
            if (!res.ok) {
                console.warn('Marketplace.validatePlatformWithAI: endpoint returned', res.status);
                return { valid: true, message: '' };
            }
            return await res.json();
        } catch (err) {
            console.warn('Marketplace.validatePlatformWithAI: unavailable, allowing');
            return { valid: true, message: '' };
        }
    },

    /**
     * Validate listing content via AI (OpenRouter) - calls Cloudflare Function.
     * Returns { valid: boolean, message: string }
     */
    async validateWithAI(title, description) {
        try {
            var res = await fetch('/api/validate-listing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: title, description: description })
            });
            if (!res.ok) {
                console.warn('Marketplace.validateWithAI: endpoint returned', res.status);
                // If endpoint unavailable, allow submission (graceful degradation)
                return { valid: true, message: '' };
            }
            var data = await res.json();
            return data;
        } catch (err) {
            console.warn('Marketplace.validateWithAI: endpoint unavailable, allowing submission');
            return { valid: true, message: '' };
        }
    },

    // ═══════════════════════════════════════
    // ESCROW SYSTEM — coin-based purchases
    // ═══════════════════════════════════════

    /**
     * Purchase a listing with coins (creates escrow hold).
     * Buyer's coins are held until they confirm delivery or 48h auto-release.
     */
    async purchaseWithCoins(listingId, coinAmount) {
        try {
            if (!Security.checkOnline()) { UI.toast('You appear to be offline.', 'error'); return null; }
            if (!Auth.requireAuth()) return null;
            var { data, error } = await window.supabaseClient.rpc('create_marketplace_escrow', {
                p_listing_id: listingId,
                p_buyer_id: Auth.getUserId(),
                p_coin_amount: coinAmount
            });
            if (error) throw error;
            UI.toast('Purchase successful! Coins held in escrow until you confirm delivery.', 'success');
            CACHE.clear();
            return data;
        } catch (err) {
            console.error('Marketplace.purchaseWithCoins:', err.message);
            UI.toast(err.message || 'Purchase failed.', 'error');
            return null;
        }
    },

    /**
     * Buyer confirms delivery — releases coins to seller.
     */
    async confirmDelivery(escrowId) {
        try {
            if (!Auth.requireAuth()) return null;
            var { data, error } = await window.supabaseClient.rpc('release_marketplace_escrow', {
                p_escrow_id: escrowId,
                p_buyer_id: Auth.getUserId()
            });
            if (error) throw error;
            UI.toast('Delivery confirmed! Coins released to seller.', 'success');
            return data;
        } catch (err) {
            console.error('Marketplace.confirmDelivery:', err.message);
            UI.toast(err.message || 'Failed to confirm delivery.', 'error');
            return null;
        }
    },

    /**
     * Get escrow transactions for current user (as buyer or seller).
     */
    async getMyEscrows() {
        try {
            if (!Auth.requireAuth()) return [];
            var userId = Auth.getUserId();
            var { data, error } = await window.supabaseClient
                .from('marketplace_escrow').select('*, marketplace_listings(title, description)')
                .or('buyer_id.eq.' + userId + ',seller_id.eq.' + userId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error('Marketplace.getMyEscrows:', err.message);
            return [];
        }
    },

    // ═══════════════════════════════════════
    // DISPUTE / REFUND SYSTEM
    // ═══════════════════════════════════════

    /**
     * Open a dispute on an escrow transaction (buyer only, within 24h).
     */
    async openDispute(escrowId, reason) {
        try {
            if (!Auth.requireAuth()) return null;
            if (!reason || reason.trim().length < 10) {
                UI.toast('Please provide a detailed reason for the dispute (at least 10 characters).', 'error');
                return null;
            }
            var { data, error } = await window.supabaseClient.rpc('create_marketplace_dispute', {
                p_escrow_id: escrowId,
                p_buyer_id: Auth.getUserId(),
                p_reason: reason.trim()
            });
            if (error) throw error;
            UI.toast('Dispute opened. An admin will review it within 24 hours.', 'success');
            return data;
        } catch (err) {
            console.error('Marketplace.openDispute:', err.message);
            UI.toast(err.message || 'Failed to open dispute.', 'error');
            return null;
        }
    },

    /**
     * Get disputes for current user.
     */
    async getMyDisputes() {
        try {
            if (!Auth.requireAuth()) return [];
            var userId = Auth.getUserId();
            var { data, error } = await window.supabaseClient
                .from('marketplace_disputes').select('*, marketplace_listings(title)')
                .or('buyer_id.eq.' + userId + ',seller_id.eq.' + userId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error('Marketplace.getMyDisputes:', err.message);
            return [];
        }
    },

    // ═══════════════════════════════════════
    // PRODUCT REVIEWS (buyer reviews on products)
    // ═══════════════════════════════════════

    /**
     * Submit a product review (only buyers who purchased via escrow can review).
     */
    async submitProductReview(listingId, escrowId, rating, reviewText) {
        try {
            if (!Security.checkOnline()) { UI.toast('You appear to be offline.', 'error'); return null; }
            if (!Auth.requireAuth()) return null;
            if (!Security.checkRateLimit('review')) { UI.toast('Too many reviews. Please wait.', 'error'); return null; }

            // Get listing to find seller
            var listing = await Marketplace.getOne(listingId);
            if (!listing) { UI.toast('Listing not found.', 'error'); return null; }
            if (listing.seller_id === Auth.getUserId()) { UI.toast('You cannot review your own product.', 'warning'); return null; }

            var row = {
                listing_id: listingId,
                escrow_id: escrowId || null,
                reviewer_id: Auth.getUserId(),
                seller_id: listing.seller_id,
                rating: Math.max(1, Math.min(5, parseInt(rating) || 1)),
                review_text: Security.sanitize(reviewText || '').slice(0, 500)
            };

            var { data, error } = await window.supabaseClient
                .from('product_reviews').insert(row).select().single();
            if (error) {
                if (error.code === '23505') {
                    UI.toast('You have already reviewed this product.', 'warning');
                } else {
                    UI.toast('Failed to submit review: ' + (error.message || 'Unknown error'), 'error');
                }
                return null;
            }

            // Feature 6: Check seller rating threshold for auto-delisting
            try {
                await window.supabaseClient.rpc('check_seller_rating_threshold', { p_seller_id: listing.seller_id });
            } catch (e) { console.warn('check_seller_rating_threshold:', e.message); }

            UI.toast('Review submitted!', 'success');
            return data;
        } catch (err) {
            console.error('Marketplace.submitProductReview:', err.message);
            UI.toast('Failed to submit review.', 'error');
            return null;
        }
    },

    /**
     * Get product reviews for a specific listing.
     */
    async getProductReviews(listingId, options) {
        try {
            if (!listingId) return { data: [], count: 0 };
            var opts = options || {};
            var limit = opts.limit || 20;
            var offset = opts.offset || 0;
            var { data, error, count } = await window.supabaseClient
                .from('product_reviews').select('*', { count: 'exact' })
                .eq('listing_id', listingId)
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);
            if (error) throw error;
            return { data: data || [], count: count || 0 };
        } catch (err) {
            console.error('Marketplace.getProductReviews:', err.message);
            return { data: [], count: 0 };
        }
    },

    /**
     * Get product review stats (average rating + count) for a listing.
     */
    async getProductReviewStats(listingId) {
        try {
            if (!listingId) return { avg_rating: 0, review_count: 0 };
            var { data, error } = await window.supabaseClient.rpc('get_product_review_stats', { p_listing_id: listingId });
            if (error) throw error;
            var stats = Array.isArray(data) && data.length > 0 ? data[0] : (data || {});
            return {
                avg_rating: parseFloat(stats.avg_rating) || 0,
                review_count: parseInt(stats.review_count) || 0
            };
        } catch (err) {
            console.error('Marketplace.getProductReviewStats:', err.message);
            return { avg_rating: 0, review_count: 0 };
        }
    },

    // ═══════════════════════════════════════
    // FEATURE 1: SELLER TRUST SCORING
    // ═══════════════════════════════════════

    /**
     * Compute a seller trust score (0–100) based on multiple factors.
     * Factors: account age, completed transactions, review ratings, response time, refund rate.
     * Returns { score, level, badges, factors }.
     */
    async getSellerTrustScore(sellerId) {
        try {
            if (!sellerId) return Marketplace._defaultTrustScore();
            var cacheKey = 'mk_trust_' + sellerId;
            var cached = CACHE.get(cacheKey, 120000);
            if (cached) return cached;

            // Try server-side RPC first
            try {
                var { data, error } = await window.supabaseClient.rpc('get_seller_trust_score', { p_seller_id: sellerId });
                if (!error && data) {
                    var serverScore = Array.isArray(data) ? data[0] : data;
                    if (serverScore && typeof serverScore.score === 'number') {
                        var result = Marketplace._enrichTrustScore(serverScore);
                        CACHE.set(cacheKey, result);
                        return result;
                    }
                }
            } catch (e) { /* RPC may not exist yet — fall back to client computation */ }

            // Client-side computation fallback
            var [profileResult, escrowResult, disputeResult] = await Promise.allSettled([
                Marketplace.getSellerProfile(sellerId),
                window.supabaseClient.from('marketplace_escrow').select('id, status, created_at', { count: 'exact' }).eq('seller_id', sellerId),
                window.supabaseClient.from('marketplace_disputes').select('id', { count: 'exact' }).eq('seller_id', sellerId)
            ]);

            var profile = profileResult.status === 'fulfilled' ? profileResult.value : null;
            var escrows = escrowResult.status === 'fulfilled' && !escrowResult.value.error ? escrowResult.value : { data: [], count: 0 };
            var disputes = disputeResult.status === 'fulfilled' && !disputeResult.value.error ? disputeResult.value : { data: [], count: 0 };

            if (!profile) return Marketplace._defaultTrustScore();

            // Factor 1: Account age (max 20 points)
            var accountAgeDays = 0;
            if (profile.user && profile.user.created_at) {
                accountAgeDays = (Date.now() - new Date(profile.user.created_at).getTime()) / (24 * 60 * 60 * 1000);
            }
            var ageScore = Math.min(20, Math.floor(accountAgeDays / 15));

            // Factor 2: Completed transactions (max 25 points)
            var completedCount = 0;
            if (escrows.data) {
                completedCount = escrows.data.filter(function(e) { return e.status === 'released' || e.status === 'completed'; }).length;
            }
            var txScore = Math.min(25, completedCount * 2.5);

            // Factor 3: Review rating (max 25 points)
            var avgRating = profile.avg_rating || 0;
            var reviewCount = profile.review_count || 0;
            var ratingScore = reviewCount > 0 ? (avgRating / 5) * 25 : 10;

            // Factor 4: Response consistency (max 15 points — based on listing count and activity)
            var listingCount = profile.listings ? profile.listings.length : 0;
            var responseScore = Math.min(15, listingCount * 3);

            // Factor 5: Refund/dispute rate (max 15 points — lower is better)
            var totalTx = escrows.count || 0;
            var disputeCount = disputes.count || 0;
            var disputeRate = totalTx > 0 ? disputeCount / totalTx : 0;
            var refundScore = Math.max(0, 15 - Math.floor(disputeRate * 100));

            var totalScore = Math.min(100, Math.round(ageScore + txScore + ratingScore + responseScore + refundScore));

            var result = Marketplace._enrichTrustScore({
                score: totalScore,
                factors: {
                    account_age: { score: ageScore, max: 20, days: Math.floor(accountAgeDays) },
                    transactions: { score: txScore, max: 25, count: completedCount },
                    ratings: { score: ratingScore, max: 25, avg: avgRating, count: reviewCount },
                    response: { score: responseScore, max: 15, listings: listingCount },
                    refund_rate: { score: refundScore, max: 15, rate: disputeRate, disputes: disputeCount }
                }
            });

            CACHE.set(cacheKey, result);
            return result;
        } catch (err) {
            console.error('Marketplace.getSellerTrustScore:', err.message);
            return Marketplace._defaultTrustScore();
        }
    },

    _defaultTrustScore() {
        return { score: 0, level: 'new', label: 'New Seller', color: '#9ca3af', badges: [], factors: {} };
    },

    _enrichTrustScore(raw) {
        var score = raw.score || 0;
        var level, label, color;
        if (score >= 90) { level = 'top'; label = 'Top Seller'; color = '#f59e0b'; }
        else if (score >= 70) { level = 'trusted'; label = 'Trusted Seller'; color = '#10b981'; }
        else if (score >= 50) { level = 'verified'; label = 'Verified Seller'; color = '#6366f1'; }
        else if (score >= 25) { level = 'active'; label = 'Active Seller'; color = '#3b82f6'; }
        else { level = 'new'; label = 'New Seller'; color = '#9ca3af'; }

        var badges = [];
        if (score >= 90) badges.push({ id: 'top_seller', label: 'Top Seller', icon: 'trophy', color: '#f59e0b' });
        if (score >= 50) badges.push({ id: 'verified_seller', label: 'Verified Seller', icon: 'shield', color: '#6366f1' });
        if (raw.factors && raw.factors.transactions && raw.factors.transactions.count >= 10) {
            badges.push({ id: 'experienced', label: '10+ Sales', icon: 'trending', color: '#10b981' });
        }
        if (raw.factors && raw.factors.ratings && raw.factors.ratings.avg >= 4.5 && raw.factors.ratings.count >= 5) {
            badges.push({ id: 'highly_rated', label: 'Highly Rated', icon: 'star', color: '#f59e0b' });
        }
        if (raw.factors && raw.factors.refund_rate && raw.factors.refund_rate.disputes === 0 && raw.factors.transactions && raw.factors.transactions.count >= 5) {
            badges.push({ id: 'zero_disputes', label: 'Zero Disputes', icon: 'check', color: '#10b981' });
        }

        return {
            score: score,
            level: level,
            label: label,
            color: color,
            badges: badges,
            factors: raw.factors || {}
        };
    },

    // ═══════════════════════════════════════
    // FEATURE 3: NEGOTIATION / OFFERS
    // ═══════════════════════════════════════

    /**
     * Make an offer on a listing (buyer).
     * @param {string} listingId
     * @param {number} offerAmount - GMX Coins offered
     * @param {string} message - optional message to seller
     */
    async makeOffer(listingId, offerAmount, message) {
        try {
            if (!Security.checkOnline()) { UI.toast('You appear to be offline.', 'error'); return null; }
            if (!Auth.requireAuth()) return null;
            if (!Security.checkRateLimit('offer')) { UI.toast('Too many offers. Please wait.', 'error'); return null; }

            var listing = await Marketplace.getOne(listingId);
            if (!listing) { UI.toast('Listing not found.', 'error'); return null; }
            if (listing.seller_id === Auth.getUserId()) { UI.toast('You cannot make an offer on your own listing.', 'warning'); return null; }
            if (offerAmount >= listing.price) { UI.toast('Offer must be below list price. Use Buy Now instead.', 'info'); return null; }
            if (offerAmount < 1) { UI.toast('Offer must be at least 1 GMX Coin.', 'error'); return null; }

            var row = {
                listing_id: listingId,
                buyer_id: Auth.getUserId(),
                seller_id: listing.seller_id,
                offer_amount: Math.floor(offerAmount),
                original_price: listing.price,
                message: Security.sanitize(message || '').slice(0, 300),
                status: 'pending'
            };

            var { data, error } = await window.supabaseClient
                .from('marketplace_offers').insert(row).select().single();
            if (error) {
                if (error.code === '23505') {
                    UI.toast('You already have a pending offer on this listing.', 'warning');
                } else {
                    UI.toast('Failed to submit offer: ' + (error.message || 'Unknown error'), 'error');
                }
                return null;
            }
            UI.toast('Offer sent! The seller will be notified.', 'success');
            CACHE.clear();
            return data;
        } catch (err) {
            console.error('Marketplace.makeOffer:', err.message);
            UI.toast('Failed to send offer.', 'error');
            return null;
        }
    },

    /**
     * Respond to an offer (seller): accept, reject, or counter.
     * @param {string} offerId
     * @param {string} action - 'accept' | 'reject' | 'counter'
     * @param {number} counterAmount - required if action is 'counter'
     */
    async respondToOffer(offerId, action, counterAmount) {
        try {
            if (!Auth.requireAuth()) return null;
            var validActions = ['accept', 'reject', 'counter'];
            if (validActions.indexOf(action) === -1) { UI.toast('Invalid action.', 'error'); return null; }

            var updates = { status: action === 'accept' ? 'accepted' : action === 'reject' ? 'rejected' : 'countered' };
            if (action === 'counter') {
                if (!counterAmount || counterAmount < 1) { UI.toast('Counter amount must be at least 1 GMX Coin.', 'error'); return null; }
                updates.counter_amount = Math.floor(counterAmount);
            }
            updates.responded_at = new Date().toISOString();

            var { data, error } = await window.supabaseClient
                .from('marketplace_offers').update(updates)
                .eq('id', offerId).eq('seller_id', Auth.getUserId())
                .select().single();
            if (error) throw error;

            var messages = { accepted: 'Offer accepted!', rejected: 'Offer rejected.', countered: 'Counter-offer sent!' };
            UI.toast(messages[updates.status] || 'Response sent.', 'success');

            // If accepted, auto-create escrow
            if (action === 'accept' && data) {
                try {
                    await Marketplace.purchaseWithCoins(data.listing_id, data.offer_amount);
                } catch (e) { console.warn('Auto-escrow after offer accept:', e.message); }
            }

            CACHE.clear();
            return data;
        } catch (err) {
            console.error('Marketplace.respondToOffer:', err.message);
            UI.toast('Failed to respond to offer.', 'error');
            return null;
        }
    },

    /**
     * Get offers for a listing (seller view).
     */
    async getListingOffers(listingId) {
        try {
            if (!listingId || !Auth.requireAuth()) return [];
            var { data, error } = await window.supabaseClient
                .from('marketplace_offers').select('*')
                .eq('listing_id', listingId).eq('seller_id', Auth.getUserId())
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        } catch (err) { console.error('Marketplace.getListingOffers:', err.message); return []; }
    },

    /**
     * Get all offers for the current user (as buyer or seller).
     */
    async getMyOffers() {
        try {
            if (!Auth.requireAuth()) return [];
            var userId = Auth.getUserId();
            var { data, error } = await window.supabaseClient
                .from('marketplace_offers').select('*, marketplace_listings(title, price)')
                .or('buyer_id.eq.' + userId + ',seller_id.eq.' + userId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        } catch (err) { console.error('Marketplace.getMyOffers:', err.message); return []; }
    },

    // ═══════════════════════════════════════
    // FEATURE 4: SMART PRICING SUGGESTIONS
    // ═══════════════════════════════════════

    /**
     * Get pricing suggestions based on similar active listings in same category.
     * Returns { min, max, median, avg, count, suggestion }.
     */
    async getSimilarPricing(category) {
        try {
            if (!category) return null;
            var cacheKey = 'mk_pricing_' + category;
            var cached = CACHE.get(cacheKey, 300000);
            if (cached) return cached;

            var { data, error } = await window.supabaseClient
                .from('marketplace_listings').select('price')
                .eq('product_category', category).eq('status', 'active')
                .order('price', { ascending: true });
            if (error) throw error;
            var prices = (data || []).map(function(l) { return l.price; }).filter(function(p) { return p > 0; });

            if (prices.length < 2) {
                var result = { min: 0, max: 0, median: 0, avg: 0, count: 0, suggestion: 'Not enough data — set any price you think is fair.' };
                CACHE.set(cacheKey, result);
                return result;
            }

            var min = prices[0];
            var max = prices[prices.length - 1];
            var sum = prices.reduce(function(a, b) { return a + b; }, 0);
            var avg = Math.round(sum / prices.length);
            var mid = Math.floor(prices.length / 2);
            var median = prices.length % 2 === 0 ? Math.round((prices[mid - 1] + prices[mid]) / 2) : prices[mid];

            // Suggest a competitive range (25th to 75th percentile)
            var p25 = prices[Math.floor(prices.length * 0.25)];
            var p75 = prices[Math.floor(prices.length * 0.75)];
            var categoryName = category.replace('_', ' ');
            var suggestion = 'Similar ' + categoryName + ' sell for ' + p25 + '–' + p75 + ' GMX Coins.';

            var result = { min: min, max: max, median: median, avg: avg, count: prices.length, p25: p25, p75: p75, suggestion: suggestion };
            CACHE.set(cacheKey, result);
            return result;
        } catch (err) {
            console.error('Marketplace.getSimilarPricing:', err.message);
            return null;
        }
    },

    // ═══════════════════════════════════════
    // FEATURE 5: LISTING QUALITY SCORE
    // ═══════════════════════════════════════

    /**
     * Compute a listing quality score (0–100) based on title, description, price, etc.
     * Returns { score, grade, tips }.
     */
    getListingQualityScore(listingData) {
        var score = 0;
        var tips = [];
        var title = listingData.title || '';
        var description = listingData.description || '';
        var price = listingData.price || 0;
        var category = listingData.category || '';
        var deliveryUrl = listingData.delivery_url || '';

        // Title quality (max 25)
        if (title.length >= 5) score += 5;
        if (title.length >= 20) score += 5;
        if (title.length >= 40) score += 5;
        if (/[A-Z]/.test(title.charAt(0))) score += 3; // starts with capital
        if (/[-—|:]/.test(title)) score += 4; // uses separator (more descriptive)
        if (title.split(/\s+/).length >= 5) score += 3; // at least 5 words
        if (title.length < 20) tips.push('Make your title longer and more descriptive (20+ chars)');
        if (title.split(/\s+/).length < 4) tips.push('Use 4+ words in your title for better visibility');

        // Description quality (max 30)
        if (description.length >= 20) score += 5;
        if (description.length >= 100) score += 5;
        if (description.length >= 250) score += 5;
        if (description.length >= 500) score += 5;
        var descWords = description.split(/\s+/).length;
        if (descWords >= 30) score += 5;
        if (descWords >= 60) score += 5;
        if (description.length < 100) tips.push('Write a detailed description (100+ chars) to get 3x more views');
        if (description.length < 250) tips.push('Descriptions over 250 chars convert 2x better');

        // Category selected (max 10)
        if (category) score += 10;
        else tips.push('Select a category to help buyers find your product');

        // Price set (max 10)
        if (price > 0) score += 10;
        else tips.push('Set a price to enable purchases');

        // Digital delivery provided (max 15)
        if (deliveryUrl) {
            score += 15;
        } else {
            tips.push('Add a preview image or download link to get 3x more views');
        }

        // Formatting bonus (max 10)
        if (/\n/.test(description) || /\r/.test(description)) score += 5; // uses line breaks
        if (/[•\-\*]/.test(description)) score += 5; // uses bullet points
        if (description.indexOf('\n') === -1 && description.length > 100) tips.push('Use line breaks or bullet points to make your description easier to read');

        score = Math.min(100, score);
        var grade;
        if (score >= 90) grade = 'A+';
        else if (score >= 80) grade = 'A';
        else if (score >= 70) grade = 'B';
        else if (score >= 60) grade = 'C';
        else if (score >= 40) grade = 'D';
        else grade = 'F';

        return { score: score, grade: grade, tips: tips.slice(0, 3) };
    },

    // ═══════════════════════════════════════
    // FEATURE 6: PURCHASE-BASED RECOMMENDATIONS
    // ═══════════════════════════════════════

    /**
     * Get "also bought" recommendations for a listing.
     * Finds other listings purchased by buyers who also bought this listing.
     */
    async getAlsoBought(listingId) {
        try {
            if (!listingId) return [];
            var cacheKey = 'mk_also_bought_' + listingId;
            var cached = CACHE.get(cacheKey, 300000);
            if (cached) return cached;

            // Try RPC first
            try {
                var { data, error } = await window.supabaseClient.rpc('get_also_bought', { p_listing_id: listingId });
                if (!error && data && data.length > 0) {
                    CACHE.set(cacheKey, data);
                    return data;
                }
            } catch (e) { /* RPC may not exist yet */ }

            // Fallback: get same-category listings
            var listing = await Marketplace.getOne(listingId);
            if (!listing) return [];
            var { data: similar, error: simErr } = await window.supabaseClient
                .from('marketplace_listings').select('*')
                .eq('product_category', listing.product_category)
                .eq('status', 'active')
                .neq('id', listingId)
                .order('clicks', { ascending: false })
                .limit(4);
            if (simErr) throw simErr;
            var result = similar || [];
            CACHE.set(cacheKey, result);
            return result;
        } catch (err) {
            console.error('Marketplace.getAlsoBought:', err.message);
            return [];
        }
    },

    // ═══════════════════════════════════════
    // FEATURE 7: SELLER ANALYTICS
    // ═══════════════════════════════════════

    /**
     * Get analytics data for the current seller.
     * Returns { totalViews, totalClicks, totalSales, totalRevenue, conversionRate, listings }.
     */
    async getSellerAnalytics() {
        try {
            if (!Auth.requireAuth()) return null;
            var sellerId = Auth.getUserId();
            var cacheKey = 'mk_analytics_' + sellerId;
            var cached = CACHE.get(cacheKey, 60000);
            if (cached) return cached;

            var [listingsResult, escrowResult, reviewResult] = await Promise.allSettled([
                window.supabaseClient.from('marketplace_listings').select('*').eq('seller_id', sellerId).order('created_at', { ascending: false }),
                window.supabaseClient.from('marketplace_escrow').select('*').eq('seller_id', sellerId),
                window.supabaseClient.from('product_reviews').select('rating').eq('seller_id', sellerId)
            ]);

            var listings = listingsResult.status === 'fulfilled' && !listingsResult.value.error ? (listingsResult.value.data || []) : [];
            var escrows = escrowResult.status === 'fulfilled' && !escrowResult.value.error ? (escrowResult.value.data || []) : [];
            var reviews = reviewResult.status === 'fulfilled' && !reviewResult.value.error ? (reviewResult.value.data || []) : [];

            var totalViews = 0;
            var totalClicks = 0;
            listings.forEach(function(l) {
                totalViews += (l.impressions || 0);
                totalClicks += (l.clicks || 0);
            });

            var completedSales = escrows.filter(function(e) { return e.status === 'released' || e.status === 'completed'; });
            var totalRevenue = completedSales.reduce(function(sum, e) { return sum + (e.coin_amount || 0); }, 0);
            var pendingSales = escrows.filter(function(e) { return e.status === 'held' || e.status === 'pending'; });

            var ctr = totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(1) : '0.0';
            var conversionRate = totalClicks > 0 ? ((completedSales.length / totalClicks) * 100).toFixed(1) : '0.0';

            var avgRating = 0;
            if (reviews.length > 0) {
                avgRating = reviews.reduce(function(sum, r) { return sum + r.rating; }, 0) / reviews.length;
            }

            // Best performing listings (by clicks)
            var bestPerforming = listings.slice().sort(function(a, b) { return (b.clicks || 0) - (a.clicks || 0); }).slice(0, 5);

            // Revenue by month (last 6 months)
            var revenueByMonth = {};
            completedSales.forEach(function(e) {
                if (e.created_at) {
                    var month = e.created_at.substring(0, 7); // YYYY-MM
                    revenueByMonth[month] = (revenueByMonth[month] || 0) + (e.coin_amount || 0);
                }
            });

            var result = {
                totalListings: listings.length,
                activeListings: listings.filter(function(l) { return l.status === 'active'; }).length,
                totalViews: totalViews,
                totalClicks: totalClicks,
                ctr: ctr,
                totalSales: completedSales.length,
                pendingSales: pendingSales.length,
                totalRevenue: totalRevenue,
                conversionRate: conversionRate,
                avgRating: avgRating.toFixed(1),
                reviewCount: reviews.length,
                bestPerforming: bestPerforming,
                revenueByMonth: revenueByMonth,
                listings: listings
            };

            CACHE.set(cacheKey, result);
            return result;
        } catch (err) {
            console.error('Marketplace.getSellerAnalytics:', err.message);
            return null;
        }
    },

    // ═══════════════════════════════════════
    // FEATURE 8: DISPUTE RESOLUTION FLOW
    // ═══════════════════════════════════════

    /**
     * Seller responds to a dispute.
     */
    async respondToDispute(disputeId, response) {
        try {
            if (!Auth.requireAuth()) return null;
            if (!response || response.trim().length < 10) {
                UI.toast('Please provide a detailed response (at least 10 characters).', 'error');
                return null;
            }
            var { data, error } = await window.supabaseClient
                .from('marketplace_disputes').update({
                    seller_response: Security.sanitize(response.trim()).slice(0, 1000),
                    seller_responded_at: new Date().toISOString(),
                    status: 'seller_responded'
                })
                .eq('id', disputeId).eq('seller_id', Auth.getUserId())
                .select().single();
            if (error) throw error;
            UI.toast('Response submitted. An admin will review the dispute.', 'success');
            return data;
        } catch (err) {
            console.error('Marketplace.respondToDispute:', err.message);
            UI.toast('Failed to respond to dispute.', 'error');
            return null;
        }
    },

    /**
     * Get dispute details with timeline.
     */
    async getDisputeDetails(disputeId) {
        try {
            if (!Auth.requireAuth()) return null;
            var { data, error } = await window.supabaseClient
                .from('marketplace_disputes').select('*, marketplace_escrow(*), marketplace_listings(title, description, price)')
                .eq('id', disputeId).single();
            if (error) throw error;
            return data;
        } catch (err) {
            console.error('Marketplace.getDisputeDetails:', err.message);
            return null;
        }
    },

    // ═══════════════════════════════════════
    // FEATURE 9: FLASH SALES
    // ═══════════════════════════════════════

    /**
     * Set a flash sale on a listing (seller only).
     * @param {string} listingId
     * @param {number} discountPercent - 5–80%
     * @param {number} durationHours - how long the sale lasts (1–168 hours / 1 week max)
     */
    async setFlashSale(listingId, discountPercent, durationHours) {
        try {
            if (!Auth.requireAuth()) return null;
            if (discountPercent < 5 || discountPercent > 80) {
                UI.toast('Discount must be between 5% and 80%.', 'error');
                return null;
            }
            if (durationHours < 1 || durationHours > 168) {
                UI.toast('Sale duration must be between 1 hour and 7 days.', 'error');
                return null;
            }

            var listing = await Marketplace.getOne(listingId);
            if (!listing) { UI.toast('Listing not found.', 'error'); return null; }
            if (listing.seller_id !== Auth.getUserId()) { UI.toast('You can only set sales on your own listings.', 'error'); return null; }

            var salePrice = Math.max(1, Math.floor(listing.price * (1 - discountPercent / 100)));
            var endsAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();

            var { error } = await window.supabaseClient
                .from('marketplace_listings').update({
                    sale_price: salePrice,
                    sale_ends_at: endsAt,
                    sale_discount: discountPercent,
                    updated_at: new Date().toISOString()
                })
                .eq('id', listingId).eq('seller_id', Auth.getUserId());
            if (error) throw error;

            UI.toast('Flash sale activated! ' + discountPercent + '% off for ' + durationHours + ' hours.', 'success');
            CACHE.clear();
            return { sale_price: salePrice, sale_ends_at: endsAt, discount: discountPercent };
        } catch (err) {
            console.error('Marketplace.setFlashSale:', err.message);
            UI.toast('Failed to set flash sale.', 'error');
            return null;
        }
    },

    /**
     * Remove a flash sale from a listing.
     */
    async removeFlashSale(listingId) {
        try {
            if (!Auth.requireAuth()) return false;
            var { error } = await window.supabaseClient
                .from('marketplace_listings').update({
                    sale_price: null,
                    sale_ends_at: null,
                    sale_discount: null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', listingId).eq('seller_id', Auth.getUserId());
            if (error) throw error;
            UI.toast('Flash sale removed.', 'success');
            CACHE.clear();
            return true;
        } catch (err) {
            console.error('Marketplace.removeFlashSale:', err.message);
            return false;
        }
    },

    /**
     * Get active flash sales across the marketplace.
     */
    async getFlashSales(limit) {
        try {
            var l = limit || 6;
            var cacheKey = 'mk_flash_sales_' + l;
            var cached = CACHE.get(cacheKey, 60000);
            if (cached) return cached;

            var { data, error } = await window.supabaseClient
                .from('marketplace_listings').select('*')
                .eq('status', 'active')
                .not('sale_price', 'is', null)
                .gt('sale_ends_at', new Date().toISOString())
                .order('sale_ends_at', { ascending: true })
                .limit(l);
            if (error) throw error;
            var result = data || [];
            CACHE.set(cacheKey, result);
            return result;
        } catch (err) {
            console.error('Marketplace.getFlashSales:', err.message);
            return [];
        }
    },

    // ═══════════════════════════════════════
    // FEATURE 10: REVIEW VERIFICATION
    // ═══════════════════════════════════════

    /**
     * Check if current user has purchased a listing (via escrow).
     * Returns true if there's a completed escrow for this buyer+listing.
     */
    async hasVerifiedPurchase(listingId) {
        try {
            if (!listingId || !Auth.getUserId()) return false;
            var { data, error } = await window.supabaseClient
                .from('marketplace_escrow').select('id')
                .eq('listing_id', listingId)
                .eq('buyer_id', Auth.getUserId())
                .in('status', ['released', 'completed'])
                .limit(1);
            if (error) throw error;
            return data && data.length > 0;
        } catch (err) {
            console.error('Marketplace.hasVerifiedPurchase:', err.message);
            return false;
        }
    },

    /**
     * Submit a verified product review (only if buyer has completed purchase).
     */
    async submitVerifiedReview(listingId, rating, reviewText) {
        try {
            if (!Security.checkOnline()) { UI.toast('You appear to be offline.', 'error'); return null; }
            if (!Auth.requireAuth()) return null;

            // Check verified purchase
            var hasPurchase = await Marketplace.hasVerifiedPurchase(listingId);
            if (!hasPurchase) {
                UI.toast('Only verified buyers can leave reviews. Please purchase this product first.', 'warning');
                return null;
            }

            // Get escrow ID for the purchase
            var { data: escrows } = await window.supabaseClient
                .from('marketplace_escrow').select('id')
                .eq('listing_id', listingId).eq('buyer_id', Auth.getUserId())
                .in('status', ['released', 'completed'])
                .limit(1);
            var escrowId = escrows && escrows.length > 0 ? escrows[0].id : null;

            return await Marketplace.submitProductReview(listingId, escrowId, rating, reviewText);
        } catch (err) {
            console.error('Marketplace.submitVerifiedReview:', err.message);
            UI.toast('Failed to submit review.', 'error');
            return null;
        }
    },

    /**
     * Get marketplace platforms config for sell form.
     * @param {string} categoryId - optional, filter by category
     * @returns {Array} platform objects with id, name, icon
     */
    getMarketplacePlatforms(categoryId) {
        var allPlatforms = {
            bot_templates: [
                { id: 'telegram_bot', name: 'Telegram Bot', icon: ICONS.telegram },
                { id: 'discord_bot', name: 'Discord Bot', icon: ICONS.discord },
                { id: 'whatsapp_bot', name: 'WhatsApp Bot', icon: ICONS.whatsapp },
                { id: 'slack_bot', name: 'Slack Bot', icon: ICONS.smartphone }
            ],
            design_templates: [
                { id: 'banners', name: 'Banners', icon: ICONS.monitor },
                { id: 'sticker_packs', name: 'Sticker Packs', icon: ICONS.smartphone },
                { id: 'welcome_images', name: 'Welcome Images', icon: ICONS.camera || ICONS.monitor },
                { id: 'logos', name: 'Logos', icon: ICONS.globe }
            ],
            guides_ebooks: [
                { id: 'growth_guides', name: 'Growth Guides', icon: ICONS.globe },
                { id: 'marketing_ebooks', name: 'Marketing Ebooks', icon: ICONS.globe },
                { id: 'community_playbooks', name: 'Community Playbooks', icon: ICONS.globe },
                { id: 'monetization_guides', name: 'Monetization Guides', icon: ICONS.globe }
            ],
            automation: [
                { id: 'zapier_templates', name: 'Zapier Templates', icon: ICONS.globe },
                { id: 'n8n_flows', name: 'n8n Flows', icon: ICONS.globe },
                { id: 'make_scenarios', name: 'Make Scenarios', icon: ICONS.globe },
                { id: 'api_scripts', name: 'API Scripts', icon: ICONS.globe }
            ],
            management_tools: [
                { id: 'group_tools', name: 'Group Tools', icon: ICONS.globe },
                { id: 'moderation_scripts', name: 'Moderation Scripts', icon: ICONS.globe },
                { id: 'analytics_dashboards', name: 'Analytics Dashboards', icon: ICONS.monitor },
                { id: 'reporting_templates', name: 'Reporting Templates', icon: ICONS.globe }
            ],
            premium_packs: [
                { id: 'welcome_packs', name: 'Welcome Packs', icon: ICONS.globe },
                { id: 'rules_templates', name: 'Rules Templates', icon: ICONS.globe },
                { id: 'onboarding_kits', name: 'Onboarding Kits', icon: ICONS.globe },
                { id: 'content_calendars', name: 'Content Calendars', icon: ICONS.globe }
            ],
            other: []
        };

        if (categoryId && allPlatforms[categoryId] !== undefined) {
            return allPlatforms[categoryId];
        }

        // Return all platforms flattened
        var all = [];
        Object.keys(allPlatforms).forEach(function(key) {
            all = all.concat(allPlatforms[key]);
        });
        all.push({ id: 'other', name: 'Other', icon: ICONS.globe });
        return all;
    },

};

// ═══════════════════════════════════════
// MODULE 5b: DB.interactions (Universal Interaction System)
// ═══════════════════════════════════════
const Interactions = {
    // In-memory cache of user interactions for current session
    _cache: {},
    _cacheKey(contentId, contentType) { return contentType + ':' + contentId; },

    async toggle(contentId, contentType, actionType) {
        try {
            if (!contentId || !contentType || !actionType) return null;
            if (!Auth.requireAuth()) return null;
            if (!Security.checkOnline()) { UI.toast('You appear to be offline.', 'error'); return null; }
            const userId = Auth.getUserId();
            if (!userId) { UI.authModal(); return null; }
            const { data, error } = await window.supabaseClient.rpc('handle_user_interaction', {
                p_user_id: userId,
                p_content_id: String(contentId),
                p_content_type: contentType,
                p_action: actionType
            });
            if (error) { UI.toast('Error updating interaction', 'error'); console.error('Interactions.toggle:', error.message); return null; }
            // Update local cache
            const key = this._cacheKey(contentId, contentType);
            if (!this._cache[key]) this._cache[key] = [];
            if (data && data.action === 'added') {
                if (!this._cache[key].includes(actionType)) this._cache[key].push(actionType);
                // If like added, remove dislike from cache and vice versa
                if (actionType === 'like') this._cache[key] = this._cache[key].filter(a => a !== 'dislike');
                if (actionType === 'dislike') this._cache[key] = this._cache[key].filter(a => a !== 'like');
            } else if (data && data.action === 'removed') {
                this._cache[key] = this._cache[key].filter(a => a !== actionType);
            }
            return data;
        } catch (err) { console.error('Interactions.toggle:', err.message); UI.toast('Something went wrong', 'error'); return null; }
    },

    async getUserInteractions(contentIds, contentType) {
        try {
            if (!contentIds || !contentIds.length || !contentType) return {};
            const userId = Auth.getUserId();
            if (!userId) return {};
            const { data, error } = await window.supabaseClient.rpc('get_user_interactions', {
                p_user_id: userId,
                p_content_ids: contentIds.map(String),
                p_content_type: contentType
            });
            if (error) { console.error('Interactions.getUserInteractions:', error.message); return {}; }
            // Populate cache
            if (data) {
                for (const [cid, actions] of Object.entries(data)) {
                    this._cache[this._cacheKey(cid, contentType)] = Array.isArray(actions) ? actions : [];
                }
            }
            return data || {};
        } catch (err) { console.error('Interactions.getUserInteractions:', err.message); return {}; }
    },

    async getCounts(contentId, contentType) {
        try {
            if (!contentId || !contentType) return { likes: 0, dislikes: 0, saves: 0 };
            const { data, error } = await window.supabaseClient.rpc('get_interaction_counts', {
                p_content_id: String(contentId),
                p_content_type: contentType
            });
            if (error) { console.error('Interactions.getCounts:', error.message); return { likes: 0, dislikes: 0, saves: 0 }; }
            return data || { likes: 0, dislikes: 0, saves: 0 };
        } catch (err) { console.error('Interactions.getCounts:', err.message); return { likes: 0, dislikes: 0, saves: 0 }; }
    },

    async getSavedItems(contentType) {
        try {
            const userId = Auth.getUserId();
            if (!userId) return [];
            const { data, error } = await window.supabaseClient.rpc('get_user_saved_items', {
                p_user_id: userId,
                p_content_type: contentType || null
            });
            if (error) { console.error('Interactions.getSavedItems:', error.message); return []; }
            return data || [];
        } catch (err) { console.error('Interactions.getSavedItems:', err.message); return []; }
    },

    isActive(contentId, contentType, actionType) {
        const key = this._cacheKey(contentId, contentType);
        return this._cache[key] ? this._cache[key].includes(actionType) : false;
    }
};

// ═══════════════════════════════════════
// MODULE 5c: Comments (On-Demand Comments System)
// ═══════════════════════════════════════
const Comments = {
    // Blacklist of banned words (basic list, extend as needed)
    _blacklist: ['spam', 'scam', 'hack', 'nigger', 'faggot', 'porn', 'xxx', 'viagra', 'casino'],

    _containsUrl(text) {
        return /https?:\/\/|www\.|\.com\/|\.net\/|\.org\/|\.io\/|bit\.ly|t\.co|goo\.gl/i.test(text);
    },

    // Audit fix #15: use word boundary regex to prevent false positives (e.g. "hackathon", "anti-scam")
    _containsBlacklisted(text) {
        const lower = text.toLowerCase();
        return Comments._blacklist.some(word => new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(lower));
    },

    _validate(body) {
        if (!body || body.trim().length < 1) return 'Comment cannot be empty.';
        if (body.length > 1000) return 'Comment must be under 1000 characters.';
        if (Comments._containsUrl(body)) return 'Links are not allowed in comments.';
        if (Comments._containsBlacklisted(body)) return 'Your comment contains inappropriate content.';
        return null;
    },

    async submit(contentId, contentType, body) {
        try {
            if (!Auth.requireAuth()) return null;
            const userId = Auth.getUserId();
            if (!userId) { UI.authModal(); return null; }
            if (!Security.checkOnline()) { UI.toast('You appear to be offline.', 'error'); return null; }
            if (!Security.checkRateLimit('comment')) { UI.toast('Too many comments. Please wait.', 'error'); return null; }
            const err = Comments._validate(body);
            if (err) { UI.toast(err, 'warning'); return null; }
            const user = Auth.getUser();
            const displayName = user?.display_name || user?.email?.split('@')[0] || 'User';
            const photoUrl = user?.photo_url || null;
            const { data, error } = await window.supabaseClient.from('comments').insert({
                user_id: userId,
                content_id: String(contentId),
                content_type: contentType,
                display_name: Security.sanitize(displayName),
                photo_url: photoUrl,
                body: Security.sanitize(body.trim())
            }).select().single();
            if (error) { UI.toast('Failed to post comment.', 'error'); console.error('Comments.submit:', error.message); return null; }
            return data;
        } catch (err) { console.error('Comments.submit:', err.message); UI.toast('Something went wrong.', 'error'); return null; }
    },

    async getByContent(contentId, contentType, limit, offset) {
        try {
            const l = limit || 20;
            const o = offset || 0;
            const { data, error, count } = await window.supabaseClient.from('comments')
                .select('*', { count: 'exact' })
                .eq('content_id', String(contentId))
                .eq('content_type', contentType)
                .eq('reported', false)
                .order('created_at', { ascending: false })
                .range(o, o + l - 1);
            if (error) { console.error('Comments.getByContent:', error.message); return { data: [], count: 0 }; }
            return { data: data || [], count: count || 0 };
        } catch (err) { console.error('Comments.getByContent:', err.message); return { data: [], count: 0 }; }
    },

    async getCount(contentId, contentType) {
        try {
            const { data, error } = await window.supabaseClient.rpc('get_comment_count', {
                p_content_id: String(contentId),
                p_content_type: contentType
            });
            if (error) { console.error('Comments.getCount:', error.message); return 0; }
            return data || 0;
        } catch (err) { console.error('Comments.getCount:', err.message); return 0; }
    },

    async report(commentId) {
        try {
            if (!commentId) return;
            const { error } = await window.supabaseClient.rpc('report_comment', { p_comment_id: commentId });
            if (error) { UI.toast('Failed to report.', 'error'); return; }
            UI.toast('Comment reported. Thank you.', 'success');
        } catch (err) { console.error('Comments.report:', err.message); }
    }
};

// ═══════════════════════════════════════
// MODULE 6: Theme
// ═══════════════════════════════════════
const Theme = {
    _current: 'dark',
    init() {
        const saved = localStorage.getItem('gm_theme');
        this._current = saved === 'light' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', this._current);
    },
    set(theme) {
        if (theme !== 'dark' && theme !== 'light') return;
        this._current = theme;
        document.documentElement.setAttribute('data-theme', this._current);
        localStorage.setItem('gm_theme', this._current);
        const btn = document.getElementById('theme-toggle');
        if (btn) btn.innerHTML = this._current === 'dark' ? ICONS.moon : ICONS.sun;
    },
    toggle() {
        // Add smooth transition class
        document.documentElement.classList.add('theme-transitioning');
        this._current = this._current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', this._current);
        localStorage.setItem('gm_theme', this._current);
        // Animate all theme toggle icons (header, dropdown, drawer)
        document.querySelectorAll('.theme-toggle-icon').forEach(function(icon) {
            icon.classList.add('theme-toggle-icon--spin');
            setTimeout(function() { icon.classList.remove('theme-toggle-icon--spin'); }, 500);
        });
        // Remove transition class after animation completes
        setTimeout(function() { document.documentElement.classList.remove('theme-transitioning'); }, 450);
    },
    get() { return this._current; }
};

// ═══════════════════════════════════════
// MODULE 7: Saved
// ═══════════════════════════════════════
const Saved = {
    _key: 'gm_saved_groups',
    getAll() {
        try { return JSON.parse(localStorage.getItem(this._key) || '[]'); } catch (err) { console.error('Saved.getAll:', err.message); return []; }
    },
    add(group) {
        if (!group?.id) return;
        const all = this.getAll();
        if (all.some(g => g.id === group.id)) return;
        all.unshift({ id: group.id, name: group.name, platform: group.platform, category: group.category, vip_tier: group.vip_tier, vip_expiry: group.vip_expiry });
        localStorage.setItem(this._key, JSON.stringify(all.slice(0, 100)));
    },
    remove(groupId) {
        const all = this.getAll().filter(g => g.id !== groupId);
        localStorage.setItem(this._key, JSON.stringify(all));
    },
    isSaved(groupId) { return this.getAll().some(g => g.id === groupId); },
    count() { return this.getAll().length; },
    clear() { localStorage.removeItem(this._key); }
};

// ═══════════════════════════════════════
// MODULE 8: RecentlyViewed
// ═══════════════════════════════════════
const RecentlyViewed = {
    _key: 'gm_recent_groups',
    _max: 20,
    getAll() {
        try { return JSON.parse(localStorage.getItem(this._key) || '[]'); } catch (err) { console.error('RecentlyViewed.getAll:', err.message); return []; }
    },
    add(group) {
        if (!group?.id) return;
        let all = this.getAll().filter(g => g.id !== group.id);
        all.unshift({ id: group.id, name: group.name, platform: group.platform, ts: Date.now() });
        localStorage.setItem(this._key, JSON.stringify(all.slice(0, this._max)));
    },
    clear() { localStorage.removeItem(this._key); }
};

// ═══════════════════════════════════════
// MODULE 9: Algorithms
// ═══════════════════════════════════════
const Algorithms = {
    calculateTrustScore(group) {
        if (!group) return 0;
        let score = 20;
        const vipBonus = { none: 0, verified: 15, niche: 20, global: 25, diamond: 30 };
        const tier = Algorithms.getEffectiveTier(group);
        score += vipBonus[tier] || 0;
        const avgRating = parseFloat(group.avg_rating) || 0;
        const reviewCount = group.review_count || 0;
        if (reviewCount >= 3) score += Math.min(25, Math.round(avgRating * 5));
        else if (reviewCount >= 1) score += Math.min(15, Math.round(avgRating * 3));
        const views = group.views || 0;
        if (views >= 1000) score += 15;
        else if (views >= 500) score += 10;
        else if (views >= 100) score += 5;
        else if (views >= 10) score += 2;
        const reports = group.reports || 0;
        if (reports === 0) score += 10;
        else if (reports <= 2) score += 5;
        else score -= Math.min(30, reports * 5);
        return Math.max(0, Math.min(100, score));
    },
    calculateRankingScore(group) {
        if (!group) return 0;
        const trust = Algorithms.calculateTrustScore(group);
        const views = group.views || 0;
        const clicks = group.clicks || 0;
        const rating = parseFloat(group.avg_rating) || 0;
        const reviews = group.review_count || 0;
        const tier = Algorithms.getEffectiveTier(group);
        const tierMultiplier = { none: 1, verified: 1.2, niche: 1.5, global: 2.0, diamond: 3.0 };
        const base = (trust * 2) + (views * 0.01) + (clicks * 0.05) + (rating * 10) + (reviews * 3);
        return Math.round(base * (tierMultiplier[tier] || 1) * 100) / 100;
    },
    getEffectiveTier(group) {
        if (!group?.vip_tier || group.vip_tier === 'none') return 'none';
        if (!group.vip_expiry) return 'none';
        const expiry = new Date(group.vip_expiry).getTime();
        if (isNaN(expiry) || Date.now() > expiry) return 'none';
        return group.vip_tier;
    },
    generateSearchTerms(name, description, tags, category, platform) {
        const terms = new Set();
        const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'is', 'it', 'this', 'that', 'are', 'was', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'shall', 'can', 'need', 'must', 'not', 'no', 'nor', 'so', 'if', 'then', 'than', 'too', 'very', 'just', 'about', 'above', 'after', 'again', 'all', 'also', 'any', 'because', 'before', 'between', 'both', 'each', 'few', 'how', 'into', 'more', 'most', 'other', 'out', 'over', 'own', 'same', 'some', 'such', 'their', 'them', 'these', 'those', 'through', 'under', 'until', 'up', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'you', 'your']);
        (name || '').toLowerCase().split(/\s+/).forEach(w => { const c = w.replace(/[^a-z0-9]/g, ''); if (c.length >= 2) terms.add(c); });
        (description || '').toLowerCase().split(/\s+/).forEach(w => { const c = w.replace(/[^a-z0-9]/g, ''); if (c.length >= 3 && !stopWords.has(c)) terms.add(c); });
        if (Array.isArray(tags)) tags.forEach(t => t.toLowerCase().split(/\s+/).forEach(w => { if (w.length >= 2) terms.add(w); }));
        if (category) terms.add(category.toLowerCase().replace(/[^a-z0-9]/g, ''));
        if (platform) terms.add(platform.toLowerCase());
        return Array.from(terms).slice(0, 40);
    },
    getLevelInfo(gxp) {
        const g = isNaN(gxp) ? 0 : Number(gxp);
        const levels = CONFIG.levels;
        let current = levels[0];
        for (let i = levels.length - 1; i >= 0; i--) {
            if (g >= levels[i].minGxp) { current = levels[i]; break; }
        }
        const next = levels.find(l => l.minGxp > g);
        const progress = next ? (g - current.minGxp) / (next.minGxp - current.minGxp) : 1;
        return { level: current.level, name: current.name, emoji: current.emoji, minGxp: current.minGxp, nextLevelGxp: next?.minGxp || current.minGxp, progress: Math.min(1, Math.max(0, progress)) };
    },
    // ═══════════════════════════════════════
    // Organic Ranking: Best Groups (7-day engagement)
    // Score = (Clicks * 0.4) + (Likes * 0.4) + (Reviews_Avg * 0.2)
    // ═══════════════════════════════════════
    calculateOrganicScore(group) {
        if (!group) return 0;
        var clicks = group.clicks || 0;
        var reviewCount = group.review_count || 0;
        var avgRating = parseFloat(group.avg_rating) || 0;
        return Math.round(((clicks * 0.4) + (reviewCount * 0.4) + (avgRating * 0.2)) * 100) / 100;
    },
    sortByOrganicRanking(groups) {
        if (!Array.isArray(groups)) return [];
        return groups.slice().sort(function(a, b) {
            return Algorithms.calculateOrganicScore(b) - Algorithms.calculateOrganicScore(a);
        });
    },
    async getBestGroups(options) {
        try {
            var limit = (options && options.limit) ? options.limit : 12;
            var category = (options && options.category) ? options.category : '';
            var cacheKey = 'best_groups' + (category ? '_' + category : '');
            var cached = CACHE.get(cacheKey, CONFIG.cacheDurations.lists);
            if (cached) return cached;
            var sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            var q = window.supabaseClient.from('groups').select('*')
                .eq('status', 'approved')
                .gte('approved_at', sevenDaysAgo)
                .order('clicks', { ascending: false })
                .limit(limit * 2);
            if (category) q = q.eq('category', category);
            var { data, error } = await q;
            if (error) throw error;
            var ranked = Algorithms.sortByOrganicRanking(data || []);
            var result = ranked.slice(0, limit);
            CACHE.set(cacheKey, result);
            return result;
        } catch (err) { console.error('Algorithms.getBestGroups:', err.message); return []; }
    },
    // ═══════════════════════════════════════
    // Trending / Velocity Detection
    // Groups with rapid click spikes in a short window
    // ═══════════════════════════════════════
    _velocityKey: 'gm_velocity_snapshots',
    _getVelocitySnapshots() {
        try {
            var raw = sessionStorage.getItem(this._velocityKey);
            return raw ? JSON.parse(raw) : {};
        } catch (err) { return {}; }
    },
    _saveVelocitySnapshot(groupId, clicks) {
        try {
            var snapshots = this._getVelocitySnapshots();
            snapshots[groupId] = { clicks: clicks, ts: Date.now() };
            sessionStorage.setItem(this._velocityKey, JSON.stringify(snapshots));
        } catch (err) { console.error('Algorithms._saveVelocitySnapshot:', err.message); }
    },
    calculateVelocity(group) {
        if (!group) return 0;
        var snapshots = this._getVelocitySnapshots();
        var prev = snapshots[group.id];
        var currentClicks = group.clicks || 0;
        if (!prev) {
            this._saveVelocitySnapshot(group.id, currentClicks);
            return 0;
        }
        var elapsed = (Date.now() - prev.ts) / 3600000;
        if (elapsed < 0.01) return 0;
        var clickDelta = currentClicks - (prev.clicks || 0);
        var velocity = clickDelta / elapsed;
        this._saveVelocitySnapshot(group.id, currentClicks);
        return Math.round(velocity * 100) / 100;
    },
    detectTrendingGroups(groups, options) {
        if (!Array.isArray(groups)) return [];
        var threshold = (options && options.threshold) ? options.threshold : 5;
        var limit = (options && options.limit) ? options.limit : 12;
        var withVelocity = groups.map(function(g) {
            return { group: g, velocity: Algorithms.calculateVelocity(g) };
        });
        var trending = withVelocity
            .filter(function(item) { return item.velocity >= threshold; })
            .sort(function(a, b) { return b.velocity - a.velocity; })
            .slice(0, limit)
            .map(function(item) { return item.group; });
        return trending;
    },
    async getTrendingByVelocity(options) {
        try {
            var limit = (options && options.limit) ? options.limit : 12;
            var cached = CACHE.get('trending_velocity', CONFIG.cacheDurations.groups);
            if (cached) return cached;
            var { data, error } = await window.supabaseClient.from('groups').select('*')
                .eq('status', 'approved')
                .order('clicks', { ascending: false })
                .limit(100);
            if (error) throw error;
            var trending = Algorithms.detectTrendingGroups(data || [], { threshold: 3, limit: limit });
            if (trending.length < limit) {
                var trendingIds = trending.map(function(g) { return g.id; });
                var fallback = (data || [])
                    .filter(function(g) { return trendingIds.indexOf(g.id) === -1; })
                    .sort(function(a, b) { return (b.clicks || 0) - (a.clicks || 0); })
                    .slice(0, limit - trending.length);
                trending = trending.concat(fallback);
            }
            CACHE.set('trending_velocity', trending);
            return trending;
        } catch (err) { console.error('Algorithms.getTrendingByVelocity:', err.message); return []; }
    },
    // ═══════════════════════════════════════
    // Smart Ads: Niche Targeting + Anti-Repetition Rotation
    // Selects ads matching user's current category/niche context,
    // rotates seen ads, and weights by niche pricing relevance.
    // ═══════════════════════════════════════
    _adRotationKey: 'gm_ad_rotation',
    _getAdRotationState() {
        try {
            var raw = sessionStorage.getItem(this._adRotationKey);
            var state = raw ? JSON.parse(raw) : { seen: [], lastCategory: '', rotationIndex: 0 };
            // Reset rotation if category context changed
            if (state.seen && state.seen.length > 50) {
                state.seen = state.seen.slice(-20);
            }
            return state;
        } catch (err) { return { seen: [], lastCategory: '', rotationIndex: 0 }; }
    },
    _saveAdRotationState(state) {
        try {
            sessionStorage.setItem(this._adRotationKey, JSON.stringify(state));
        } catch (err) { console.error('Algorithms._saveAdRotationState:', err.message); }
    },
    /**
     * Smart ad selection with niche targeting and rotation.
     * @param {Array} ads - Available ads from DB
     * @param {Object} options - { category, limit, position }
     * @returns {Array} Selected ads (rotated, niche-prioritized)
     */
    selectSmartAds(ads, options) {
        if (!Array.isArray(ads) || ads.length === 0) return [];
        var category = (options && options.category) ? options.category : '';
        var limit = (options && options.limit) ? options.limit : 2;
        var state = this._getAdRotationState();

        // 1. Score ads by niche relevance
        var scored = ads.map(function(ad) {
            var nicheScore = 0;
            // Boost ads targeting current category
            if (category && ad.target_category && ad.target_category.toLowerCase() === category.toLowerCase()) {
                nicheScore += (CONFIG.nichePricing[category.toLowerCase()] || 10) * 2;
            }
            // Boost by trust score
            var trust = ad.trust_score !== undefined ? (isNaN(ad.trust_score) ? 50 : Number(ad.trust_score)) : 50;
            nicheScore += trust * 0.5;
            // Penalize already-seen ads
            if (state.seen.indexOf(ad.id) !== -1) {
                nicheScore -= 30;
            }
            return { ad: ad, score: nicheScore };
        });

        // 2. Sort by score (highest first) with randomization for equal scores
        scored.sort(function(a, b) {
            var diff = b.score - a.score;
            if (Math.abs(diff) < 5) return Math.random() - 0.5;
            return diff;
        });

        // 3. Select top ads
        var selected = scored.slice(0, limit).map(function(item) { return item.ad; });

        // 4. Update rotation state
        selected.forEach(function(ad) {
            if (state.seen.indexOf(ad.id) === -1) {
                state.seen.push(ad.id);
            }
        });
        state.lastCategory = category;
        state.rotationIndex = (state.rotationIndex + 1) % Math.max(1, ads.length);
        this._saveAdRotationState(state);

        return selected;
    },
    /**
     * Calculate 7-day engagement score for a group.
     * Uses clicks, review count, average rating weighted by recency.
     * @param {Object} group - Group object
     * @param {string} [sinceDate] - ISO date string for the time window start
     * @returns {number} Engagement score
     */
    calculate7DayEngagement(group) {
        if (!group) return 0;
        var clicks = group.clicks || 0;
        var reviewCount = group.review_count || 0;
        var avgRating = parseFloat(group.avg_rating) || 0;
        var views = group.views || 0;

        // Check if group was active in last 7 days (use approved_at or updated_at as proxy)
        var lastActivity = group.updated_at || group.approved_at || group.created_at;
        var recencyBonus = 1;
        if (lastActivity) {
            var daysSince = (Date.now() - new Date(lastActivity).getTime()) / (24 * 60 * 60 * 1000);
            if (daysSince <= 1) recencyBonus = 2.0;
            else if (daysSince <= 3) recencyBonus = 1.5;
            else if (daysSince <= 7) recencyBonus = 1.2;
            else recencyBonus = 0.8;
        }

        // Weighted engagement: clicks (40%) + reviews (30%) + rating (20%) + views (10%)
        var baseScore = (clicks * 0.4) + (reviewCount * 5 * 0.3) + (avgRating * 4 * 0.2) + (views * 0.01 * 0.1);
        return Math.round(baseScore * recencyBonus * 100) / 100;
    },
    /**
     * Sort groups by 7-day engagement score.
     * @param {Array} groups
     * @returns {Array} Sorted groups (highest engagement first)
     */
    sortBy7DayEngagement(groups) {
        if (!Array.isArray(groups)) return [];
        var self = this;
        return groups.slice().sort(function(a, b) {
            return self.calculate7DayEngagement(b) - self.calculate7DayEngagement(a);
        });
    },
    /**
     * Get top engaged groups from last 7 days with optional category filter.
     * @param {Object} options - { limit, category }
     * @returns {Promise<Array>}
     */
    async getTopEngaged(options) {
        try {
            var limit = (options && options.limit) ? options.limit : 12;
            var category = (options && options.category) ? options.category : '';
            var cacheKey = 'top_engaged_7d' + (category ? '_' + category : '');
            var cached = CACHE.get(cacheKey, CONFIG.cacheDurations.lists);
            if (cached) return cached;
            var sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            var q = window.supabaseClient.from('groups').select('*')
                .eq('status', 'approved')
                .gte('updated_at', sevenDaysAgo)
                .order('clicks', { ascending: false })
                .limit(limit * 3);
            if (category) q = q.eq('category', category);
            var { data, error } = await q;
            if (error) throw error;
            var ranked = this.sortBy7DayEngagement(data || []);
            var result = ranked.slice(0, limit);
            CACHE.set(cacheKey, result);
            return result;
        } catch (err) { console.error('Algorithms.getTopEngaged:', err.message); return []; }
    }
};

// ═══════════════════════════════════════
// MODULE 10: getPrice
// ═══════════════════════════════════════
function getPrice(service, options = {}) {
    const prices = {
        vip_verified: { monthly: 5, quarterly: 12, yearly: 40 },
        vip_global: { monthly: 30, quarterly: 75, yearly: 250 },
        vip_diamond: { monthly: 50, quarterly: 130, yearly: 450 },
        boost_5: 5, boost_10: 10, boost_25: 25,
        priority_review: 10,
        ad_sponsored_weekly: 20, ad_banner_weekly: 30, ad_featured_weekly: 15, ad_profile_weekly: 10,
        audit_basic: 25, audit_pro: 50
    };
    if (service === 'vip_niche') {
        const base = CONFIG.nichePricing[options.category] || 10;
        if (options.period === 'quarterly') return Math.round(base * 2.5);
        if (options.period === 'yearly') return Math.round(base * 8);
        return base;
    }
    const p = prices[service];
    if (!p) return 0;
    if (typeof p === 'object') return p[options.period || 'monthly'] || p.monthly;
    return p;
}

// ═══════════════════════════════════════
// MODULE 11: renderHeader
// ═══════════════════════════════════════
function renderHeader() {
    const header = document.getElementById('site-header');
    if (!header) return;
    const isLoggedIn = Auth.isLoggedIn();
    const user = Auth.getUser();
    const unread = user?.unread_notifications || 0;
    const displayName = Security.sanitize(user?.display_name || 'User').slice(0, 16);
    const photoUrl = user?.photo_url || '';
    const avatarInitial = (user?.display_name || 'U').charAt(0).toUpperCase();

    // Build avatar HTML: use Google photo if available, otherwise initials
    // Issue #10 fix: use sanitizeUrl instead of sanitize to preserve forward slashes in URLs
    var avatarHtml = photoUrl
        ? '<img src="' + Security.sanitizeUrl(photoUrl) + '" alt="" class="header-avatar__img">'
        : '<span class="header-avatar__initials">' + avatarInitial + '</span>';

    // Determine active nav item from current path
    var currentPath = window.location.pathname;
    function navActive(paths) {
        for (var i = 0; i < paths.length; i++) {
            if (currentPath === paths[i] || currentPath.startsWith(paths[i] + '/') || currentPath.startsWith(paths[i] + '?')) return ' subnav__item--active';
        }
        return '';
    }

    // ── Build Top Header Bar ──
    header.innerHTML = '<nav class="site-header"><div class="site-header__inner">' +
        // ── Left: Hamburger Menu ──
        '<div class="site-header__left">' +
        '<button id="drawer-toggle" class="site-header__hamburger" aria-label="Open menu">' + ICONS.menu + '</button>' +
        '</div>' +
        // ── Center: Logo + Magic + Button ──
        '<div class="site-header__center">' +
        '<a href="/" class="site-header__logo"><img src="/assets/img/favicon.svg" alt="GroupsMix" class="site-header__logo-icon"><span class="site-header__logo-text">GroupsMix</span></a>' +
        '<div class="magic-plus-wrapper" style="position:relative">' +
        '<button id="magic-plus-btn" class="magic-plus-btn" aria-label="Submit Group, Post Job, or more" title="Submit Group, Post Job, or more">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
        '</button>' +
        '</div>' +
        '</div>' +
        // ── Right: Login / User Actions ──
        '<div class="site-header__right">' +
        (isLoggedIn ?
            '<div id="notification-wrapper" class="header-notification" style="position:relative">' +
            '<button id="notification-btn" class="header-notification__btn" aria-label="Notifications">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' +
            (unread > 0 ? '<span class="header-notification__dot"></span>' : '') +
            '</button>' +
            '</div>' +
            '<div id="user-menu-wrapper" style="position:relative">' +
            '<button id="user-menu-btn" class="header-user-link" title="Account menu" aria-label="Account menu" type="button">' +
            '<div class="header-avatar">' + avatarHtml + '</div>' +
            '</button>' +
            '</div>'
            :
            '<button id="auth-signup-btn" class="header-signup-btn">Sign Up Free</button>' +
            '<button id="auth-btn" class="header-login-btn">Login</button>'
        ) +
        '</div>' +
        '</div></nav>' +
        // ── Horizontal Sub-Navigation Bar (Expanded) ──
        '<div class="subnav" id="subnav">' +
        '<div class="subnav__inner">' +
                '<a href="/" class="subnav__item' + (currentPath === '/' ? ' subnav__item--active' : '') + '">All</a>' +
                '<a href="/jobs" class="subnav__item' + navActive(['/jobs', '/post-job']) + '">Jobs</a>' +
                '<a href="/marketplace" class="subnav__item' + navActive(['/marketplace']) + '">Markets</a>' +
                '<a href="/store" class="subnav__item' + navActive(['/store']) + '">Store</a>' +
                '<a href="/tools" class="subnav__item' + navActive(['/tools']) + '">AI Tools</a>' +
                '<a href="/articles" class="subnav__item' + navActive(['/articles']) + '">Articles</a>' +
                '<div class="subnav__more-wrapper" style="position:relative">' +
                '<button class="subnav__item subnav__more-btn" id="subnav-more-btn" type="button">More <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-left:2px"><polyline points="6 9 12 15 18 9"/></svg></button>' +
                '</div>' +
        '</div>' +
        '</div>';

    // ── Event listeners ──
    // Magic + button dropdown
    var magicBtn = document.getElementById('magic-plus-btn');
    if (magicBtn) {
        magicBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            var wrapper = magicBtn.closest('.magic-plus-wrapper');
            var existing = wrapper.querySelector('.magic-plus-dropdown');
            if (existing) { existing.remove(); return; }
            closeAllDropdowns();
            var dropdown = document.createElement('div');
            dropdown.className = 'magic-plus-dropdown';
            dropdown.innerHTML =
                                '<a href="/post-job" class="magic-plus-dropdown__item">' + ICONS.briefcase + ' <span>Post a Job</span></a>' +
                                '<a href="/submit" class="magic-plus-dropdown__item">' + ICONS.users + ' <span>Submit Group</span></a>' +
                                '<a href="/write-article" class="magic-plus-dropdown__item">' + ICONS.newspaper + ' <span>Write Article</span></a>' +
                                '<a href="/sell" class="magic-plus-dropdown__item">' + ICONS.store + ' <span>Sell Product</span></a>';
            wrapper.appendChild(dropdown);
        });
    }

    if (isLoggedIn) {
        document.getElementById('notification-btn')?.addEventListener('click', toggleNotificationDropdown);
        document.getElementById('user-menu-btn')?.addEventListener('click', function(e) { e.preventDefault(); toggleUserDropdown(); });
    } else {
        document.getElementById('auth-btn')?.addEventListener('click', () => UI.authModal('signin'));
        document.getElementById('auth-signup-btn')?.addEventListener('click', () => UI.authModal('signup'));
    }
    document.getElementById('drawer-toggle')?.addEventListener('click', openDrawer);

    // "More" dropdown in sub-nav
    var moreBtn = document.getElementById('subnav-more-btn');
    if (moreBtn) {
        moreBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            var subnav = document.getElementById('subnav');
            var existing = subnav.querySelector('.subnav__more-dropdown');
            if (existing) { existing.remove(); return; }
            closeAllDropdowns();
            var dd = document.createElement('div');
            dd.className = 'subnav__more-dropdown';
            dd.innerHTML =
                '<a href="/browse" class="subnav__more-item">' + ICONS.search + ' Browse Groups</a>' +
                '<a href="/submit" class="subnav__more-item">' + ICONS.upload + ' Submit Group</a>' +
                '<a href="/scam-wall" class="subnav__more-item">' + ICONS.shield + ' Scam Wall</a>' +
                '<a href="/leaderboard" class="subnav__more-item">' + ICONS.star + ' Leaderboard</a>' +
                '<a href="/stats" class="subnav__more-item">' + ICONS.zap + ' Stats</a>' +
                '<a href="/fuel" class="subnav__more-item">' + ICONS.heart + ' Fuel the Community</a>';
            // Position dropdown aligned to the More button, appended to subnav to avoid overflow clipping
            var btnRect = moreBtn.getBoundingClientRect();
            var subnavRect = subnav.getBoundingClientRect();
            dd.style.position = 'absolute';
            dd.style.top = (btnRect.bottom - subnavRect.top + 4) + 'px';
            dd.style.right = (subnavRect.right - btnRect.right) + 'px';
            subnav.appendChild(dd);
        });
    }

    renderAnnouncement();
}

function toggleNotificationDropdown() {
    const wrapper = document.getElementById('notification-wrapper');
    if (!wrapper) return;
    const existing = wrapper.querySelector('.notification-dropdown');
    if (existing) { existing.remove(); return; }
    closeAllDropdowns();
    const dropdown = document.createElement('div');
    dropdown.className = 'notification-dropdown';
    dropdown.innerHTML = '<div style="padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--border-primary);font-weight:var(--font-semibold);font-size:var(--text-sm)">Notifications</div>' +
        '<div id="notification-list" style="max-height:300px;overflow-y:auto"><div style="padding:var(--space-4);text-align:center;color:var(--text-tertiary);font-size:var(--text-sm)">Loading...</div></div>' +
        '<a href="/dashboard" style="display:block;text-align:center;padding:var(--space-3);border-top:1px solid var(--border-primary);font-size:var(--text-sm)">View All</a>';
    wrapper.appendChild(dropdown);
    loadNotificationDropdown();
}

async function loadNotificationDropdown() {
    const list = document.getElementById('notification-list');
    if (!list) return;
    try {
        const { data } = await DB.notifications.getByUser(Auth.getUserId(), { limit: 5 });
        if (!data?.length) { list.innerHTML = '<div style="padding:var(--space-4);text-align:center;color:var(--text-tertiary);font-size:var(--text-sm)">No notifications</div>'; return; }
        list.innerHTML = data.map(n => {
            const t = CONFIG.notificationTypes[n.type] || CONFIG.notificationTypes.info;
            return '<div class="notification-dropdown__item' + (n.read ? '' : ' notification-dropdown__item--unread') + '" data-id="' + n.id + '"' + (n.link ? ' data-link="' + Security.sanitize(n.link) + '"' : '') + '>' +
                '<span>' + t.icon + '</span><div><div style="font-weight:var(--font-semibold);font-size:var(--text-sm)">' + Security.sanitize(n.title || t.title) + '</div>' +
                '<div style="font-size:var(--text-xs);color:var(--text-tertiary)">' + Security.sanitize(n.message || '') + '</div></div></div>';
        }).join('');
        list.querySelectorAll('.notification-dropdown__item').forEach(item => {
            item.addEventListener('click', async () => {
                const id = item.dataset.id;
                if (id) await DB.notifications.markRead(id);
                // Security: validate notification URL before navigation to prevent XSS
                if (item.dataset.link && Security.isSafeNavigationUrl(item.dataset.link)) {
                    window.location.href = item.dataset.link;
                } else if (item.dataset.link) {
                    console.warn('Blocked unsafe notification link:', item.dataset.link);
                }
            });
        });
    } catch (err) { console.error('loadNotificationDropdown:', err.message); list.innerHTML = '<div style="padding:var(--space-4);text-align:center;color:var(--text-tertiary);font-size:var(--text-sm)">Unable to load</div>'; }
}

function toggleUserDropdown() {
    const wrapper = document.getElementById('user-menu-wrapper');
    if (!wrapper) return;
    const existing = wrapper.querySelector('.user-dropdown');
    if (existing) { existing.remove(); return; }
    closeAllDropdowns();
    const dropdown = document.createElement('div');
    dropdown.className = 'user-dropdown';
    // User info header in dropdown
    var userObj = Auth.getUser();
    var dropdownAvatarInitial = (userObj?.display_name || 'U').charAt(0).toUpperCase();
    var dropdownPhotoUrl = userObj?.photo_url || '';
    var dropdownAvatarHtml = dropdownPhotoUrl
        ? '<img src="' + Security.sanitizeUrl(dropdownPhotoUrl) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">'
        : '<span style="font-size:var(--text-base);font-weight:var(--font-bold);color:#6200ea">' + dropdownAvatarInitial + '</span>';
    let items = '<div class="user-dropdown__header">' +
        '<div class="user-dropdown__header-avatar">' + dropdownAvatarHtml + '</div>' +
        '<div class="user-dropdown__header-info">' +
        '<div class="user-dropdown__header-name">' + Security.sanitize(userObj?.display_name || 'User') + '</div>' +
        '<div class="user-dropdown__header-email">' + Security.sanitize(userObj?.email || '') + '</div>' +
        '</div></div>' +
        '<div class="user-dropdown__divider"></div>' +
        '<a href="/dashboard" class="user-dropdown__item"><span class="user-dropdown__icon">' + ICONS.dashboard + '</span> Dashboard</a>' +
        '<a href="/settings" class="user-dropdown__item"><span class="user-dropdown__icon">' + ICONS.settings + '</span> Settings</a>' +
        '<a href="/my-groups" class="user-dropdown__item"><span class="user-dropdown__icon">' + ICONS.clipboard + '</span> My Groups</a>' +
        '<a href="/saved" class="user-dropdown__item"><span class="user-dropdown__icon">' + ICONS.heart + '</span> Saved</a>' +
        '<div class="user-dropdown__divider"></div>' +
        '<a href="/dashboard" class="user-dropdown__item"><span class="user-dropdown__icon">' + ICONS.bell + '</span> Notifications' + (userObj?.unread_notifications > 0 ? ' <span style="background:var(--error);color:#fff;font-size:10px;padding:1px 6px;border-radius:var(--radius-full)">' + userObj.unread_notifications + '</span>' : '') + '</a>' +
        '<button id="dropdown-theme-toggle" class="user-dropdown__item" style="width:100%;border:none;background:none;cursor:pointer;text-align:left"><span class="user-dropdown__icon theme-toggle-icon">' + (Theme.get() === 'dark' ? ICONS.sun : ICONS.moon) + '</span> ' + (Theme.get() === 'dark' ? 'Light Mode' : 'Dark Mode') + '</button>';
    if (Auth.isAdmin() || Auth.isModerator() || Auth.isEditor()) items += '<a href="/admin" class="user-dropdown__item"><span class="user-dropdown__icon">' + ICONS.zap + '</span> Admin Panel</a>';
    items += '<div class="user-dropdown__divider"></div>' +
        '<button id="signout-btn" class="user-dropdown__item user-dropdown__item--danger" style="width:100%;border:none;background:none;cursor:pointer;text-align:left"><span class="user-dropdown__icon">' + ICONS.log_out + '</span> Sign Out</button>';
    dropdown.innerHTML = items;
    wrapper.appendChild(dropdown);
    document.getElementById('signout-btn')?.addEventListener('click', () => Auth.signOut());
    document.getElementById('dropdown-theme-toggle')?.addEventListener('click', function() { Theme.toggle(); closeAllDropdowns(); renderHeader(); });
}

function closeAllDropdowns() {
    document.querySelectorAll('.notification-dropdown, .user-dropdown, .magic-plus-dropdown, .subnav__more-dropdown').forEach(d => d.remove());
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('#notification-wrapper') && !e.target.closest('#user-menu-wrapper') && !e.target.closest('.magic-plus-wrapper') && !e.target.closest('.subnav__more-wrapper') && !e.target.closest('.subnav__more-dropdown')) closeAllDropdowns();
});

function openDrawer() {
    const overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';
    overlay.id = 'drawer-overlay';
    const drawer = document.createElement('div');
    drawer.className = 'drawer';
    drawer.id = 'main-drawer';
    const isLoggedIn = Auth.isLoggedIn();
    let links = '<div class="drawer__header"><span style="font-weight:var(--font-bold)">' + ICONS.globe + ' GroupsMix</span><button id="drawer-close" class="btn btn-ghost btn-icon" aria-label="Close menu">&times;</button></div>';
    // Mobile-only: user info, notifications, theme toggle at top of drawer
    if (isLoggedIn) {
        links += '<div class="drawer__item" style="font-weight:var(--font-semibold);color:var(--text-primary)">' + ICONS.user + ' ' + Security.sanitize(Auth.getUser()?.display_name || 'User') + '</div>';
        links += '<a href="/dashboard" class="drawer__item">' + ICONS.bell + ' Notifications' + (Auth.getUser()?.unread_notifications > 0 ? ' <span style="background:var(--error);color:#fff;font-size:10px;padding:1px 6px;border-radius:var(--radius-full);margin-left:4px">' + Auth.getUser().unread_notifications + '</span>' : '') + '</a>';
    }
    links += '<button id="drawer-theme-toggle" class="drawer__item" style="width:100%;border:none;background:none;cursor:pointer;text-align:left"><span class="theme-toggle-icon">' + (Theme.get() === 'dark' ? ICONS.sun : ICONS.moon) + '</span> ' + (Theme.get() === 'dark' ? 'Light Mode' : 'Dark Mode') + '</button>';
    links += '<div class="drawer__divider"></div>';
    // Main sections
    links += '<a href="/" class="drawer__item">' + ICONS.home + ' Home</a>';
    links += '<a href="/browse" class="drawer__item">' + ICONS.users + ' Groups</a>';
    links += '<a href="/jobs" class="drawer__item">' + ICONS.briefcase + ' Jobs</a>';
    links += '<a href="/marketplace" class="drawer__item">' + ICONS.store + ' Marketplace</a>';
    links += '<a href="/store" class="drawer__item">' + ICONS.shopping_cart + ' Store</a>';
    links += '<a href="/tools" class="drawer__item">' + ICONS.tools + ' Tools</a>';
    links += '<div class="drawer__divider"></div>';
    // User profile & settings
    if (isLoggedIn) {
        links += '<a href="/dashboard" class="drawer__item">' + ICONS.dashboard + ' Profile</a>';
        links += '<a href="/settings" class="drawer__item">' + ICONS.settings + ' Settings</a>';
        links += '<a href="/my-groups" class="drawer__item">' + ICONS.clipboard + ' My Groups</a>';
        if (Auth.isAdmin() || Auth.isModerator() || Auth.isEditor()) links += '<a href="/admin" class="drawer__item">' + ICONS.settings + ' Admin Panel</a>';
        links += '<div class="drawer__divider"></div>';
    }
    // More links
    links += '<a href="/search" class="drawer__item">' + ICONS.search + ' Search</a>';
    links += '<a href="/submit" class="drawer__item">' + ICONS.upload + ' Submit Group</a>';
    if (CONFIG.features.articles) links += '<a href="/articles" class="drawer__item">' + ICONS.newspaper + ' Articles</a>';
    links += '<div class="drawer__divider"></div>';
    links += '<a href="/about" class="drawer__item">' + ICONS.info + ' About</a>';
    links += '<a href="/contact" class="drawer__item">' + ICONS.phone + ' Contact</a>';
    links += '<a href="/privacy" class="drawer__item">' + ICONS.lock + ' Privacy</a>';
    links += '<a href="/terms" class="drawer__item">' + ICONS.file_text + ' Terms</a>';
    if (CONFIG.features.donate) { links += '<div class="drawer__divider"></div>'; links += '<a href="/fuel" class="drawer__item">' + ICONS.heart + ' Fuel the Community</a>'; }
    if (isLoggedIn) {
        links += '<div class="drawer__divider"></div>';
        links += '<button id="drawer-signout" class="drawer__item" style="width:100%;border:none;background:none;cursor:pointer;text-align:left">' + ICONS.log_out + ' Sign Out</button>';
    }
    drawer.innerHTML = links;
    document.body.appendChild(overlay);
    document.body.appendChild(drawer);
    const closeDrawer = () => { overlay.remove(); drawer.remove(); };
    overlay.addEventListener('click', closeDrawer);
    document.getElementById('drawer-close')?.addEventListener('click', closeDrawer);
    document.getElementById('drawer-signout')?.addEventListener('click', () => { closeDrawer(); Auth.signOut(); });
    document.getElementById('drawer-theme-toggle')?.addEventListener('click', () => { Theme.toggle(); closeDrawer(); });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { closeDrawer(); document.removeEventListener('keydown', esc); } });
}

function renderAnnouncement() {
    const bar = document.getElementById('announcement-bar');
    if (!bar) return;
    if (!CONFIG.announcement.enabled) { bar.innerHTML = ''; return; }
    if (sessionStorage.getItem('gm_announcement_dismissed')) { bar.innerHTML = ''; return; }
    const typeClass = 'announcement-bar--' + (CONFIG.announcement.type || 'info');
    bar.innerHTML = '<div class="announcement-bar ' + typeClass + '">' +
        '<span>' + Security.sanitize(CONFIG.announcement.text || '') +
        // Audit fix #3: use sanitizeUrl() for href to block javascript: protocol XSS
        (CONFIG.announcement.link ? ' <a href="' + Security.sanitizeUrl(CONFIG.announcement.link) + '" style="color:#fff;text-decoration:underline">Learn more</a>' : '') +
        '</span>' +
        '<button class="announcement-bar__close" aria-label="Dismiss announcement">✕</button>' +
        '</div>';
    bar.querySelector('.announcement-bar__close')?.addEventListener('click', () => {
        bar.innerHTML = '';
        sessionStorage.setItem('gm_announcement_dismissed', 'true');
    });
}

// ═══════════════════════════════════════
// MODULE 12: renderFooter
// ═══════════════════════════════════════
function renderFooter() {
    const footer = document.getElementById('site-footer');
    if (!footer) return;
    footer.innerHTML = '<div class="site-footer">' +
        '<div class="site-footer__grid">' +
        // Column 1: Explore
        '<div class="site-footer__column">' +
            '<div class="site-footer__heading">EXPLORE</div>' +
            '<a href="/search" class="site-footer__link">Search</a>' +
            '<a href="/browse" class="site-footer__link">Groups</a>' +
            '<a href="/articles" class="site-footer__link">Articles</a>' +
            '<a href="/stats" class="site-footer__link">Stats</a>' +
            '<a href="/scam-wall" class="site-footer__link">Scam Wall</a>' +
            '<a href="/tools" class="site-footer__link">Free Tools</a>' +
        '</div>' +
        // Column 2: Grow
        '<div class="site-footer__column">' +
            '<div class="site-footer__heading">GROW</div>' +
            '<a href="/promote" class="site-footer__link">Promote</a>' +
            '<a href="/advertise" class="site-footer__link">Advertise</a>' +
            '<a href="/store" class="site-footer__link">Store</a>' +
            '<a href="/marketplace" class="site-footer__link">Marketplace</a>' +
            '<a href="/jobs" class="site-footer__link">Jobs</a>' +
        '</div>' +
        // Column 3: Community
        '<div class="site-footer__column">' +
            '<div class="site-footer__heading">COMMUNITY</div>' +
            '<a href="/fuel" class="site-footer__link">Fuel the Community</a>' +
            '<a href="/leaderboard" class="site-footer__link">Leaderboard</a>' +
            '<a href="/submit" class="site-footer__link">Submit Group</a>' +
        '</div>' +
        // Column 4: Company
        '<div class="site-footer__column">' +
            '<div class="site-footer__heading">COMPANY</div>' +
            '<a href="/about" class="site-footer__link">About</a>' +
            '<a href="/contact" class="site-footer__link">Contact Us</a>' +
            '<a href="/faq" class="site-footer__link">FAQ</a>' +
            '<a href="/support" class="site-footer__link">Support Center</a>' +
            '<a href="/privacy" class="site-footer__link">Privacy</a>' +
            '<a href="/terms" class="site-footer__link">Terms</a>' +
        '</div>' +
        '</div>' +
        '<div class="site-footer__cta">' +
            '<a href="/fuel" class="site-footer__cta-link">' + ICONS.zap + ' Did GroupsMix help you? Help us keep going &amp; growing</a>' +
        '</div>' +
        '<div class="site-footer__bottom">&copy; ' + new Date().getFullYear() + ' GroupsMix.com. All rights reserved.</div>' +
        '</div>';
}

// ═══════════════════════════════════════
// MODULE 12.5: renderMobileNav
// ═══════════════════════════════════════
function renderMobileNav() {
    const nav = document.createElement('nav');
    nav.className = 'mobile-nav';
    nav.id = 'mobile-nav';
    const path = window.location.pathname;

    nav.innerHTML = '<a href="/" class="mobile-nav__item' + (path === '/' ? ' active' : '') + '"><span class="mobile-nav__icon">' + ICONS.home + '</span><span class="mobile-nav__label">Home</span></a>' +
        '<a href="/browse" class="mobile-nav__item' + (path.startsWith('/browse') || path.startsWith('/search') || path.startsWith('/category') || path.startsWith('/country') || path.startsWith('/platform') ? ' active' : '') + '"><span class="mobile-nav__icon">' + ICONS.users + '</span><span class="mobile-nav__label">Groups</span></a>' +
        '<a href="/submit" class="mobile-nav__item mobile-nav__item--primary"><span class="mobile-nav__icon">' + ICONS.plus + '</span><span class="mobile-nav__label">Submit</span></a>' +
        '<a href="/tools" class="mobile-nav__item' + (path.startsWith('/tools') ? ' active' : '') + '"><span class="mobile-nav__icon">' + ICONS.tools + '</span><span class="mobile-nav__label">Tools</span></a>' +
        '<button class="mobile-nav__item" id="mobile-nav-ai"><span class="mobile-nav__icon"><svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect x="2" y="8" width="20" height="12" rx="2"/><path d="M6 12h.01"/><path d="M18 12h.01"/><path d="M9 16s.9 1 3 1 3-1 3-1"/></svg></span><span class="mobile-nav__label">AI Chat</span></button>';
    document.body.appendChild(nav);
    // AI Chat button in bottom nav toggles chatbot
    document.getElementById('mobile-nav-ai')?.addEventListener('click', function() {
        if (typeof window.toggleChatbot === 'function') {
            window.toggleChatbot();
        }
    });
}

// ═══════════════════════════════════════
// MODULE 13: loadSettings
// ═══════════════════════════════════════
async function loadSettings() {
    try {
        const settings = await DB.config.getSettings();
        if (!settings || !Object.keys(settings).length) return;
        if (settings.features) Object.assign(CONFIG.features, settings.features);
        if (settings.announcement) Object.assign(CONFIG.announcement, settings.announcement);
        if (settings.cryptoWallets) Object.assign(CONFIG.cryptoWallets, settings.cryptoWallets);
        if (settings.lemonSqueezy) Object.assign(CONFIG.lemonSqueezy, settings.lemonSqueezy);
        if (settings.turnstileSiteKey) CONFIG.turnstileSiteKey = settings.turnstileSiteKey;
        renderAnnouncement();
        renderFooter();
    } catch (err) { console.error('loadSettings:', err.message); }
}

// ═══════════════════════════════════════
// MODULE 14: Cookie Consent
// ═══════════════════════════════════════
const CookieConsent = {
    _key: 'gm_cookie_consent',

    /** Returns 'accepted', 'rejected', or null (no choice yet) */
    getChoice() {
        try { return localStorage.getItem(this._key); } catch (e) { return null; }
    },

    /** Save user's choice and dismiss banner */
    _save(choice) {
        try { localStorage.setItem(this._key, choice); } catch (e) { /* private browsing */ }
        var banner = document.getElementById('cookie-banner');
        if (banner) { banner.style.animation = 'fadeOut 0.2s ease forwards'; setTimeout(function() { banner.remove(); }, 200); }
        if (choice === 'accepted') {
            CookieConsent._loadAnalytics();
        } else {
            CookieConsent._removeAnalytics();
        }
    },

    accept() { this._save('accepted'); },
    reject() { this._save('rejected'); },

    /** Load Cloudflare Web Analytics beacon (only when accepted) */
    _loadAnalytics() {
        if (document.querySelector('script[src*="cloudflareinsights.com/beacon"]')) return;
        var s = document.createElement('script');
        s.defer = true;
        s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
        // Audit fix #19: TODO — replace empty string with actual Cloudflare Web Analytics token
        s.setAttribute('data-cf-beacon', '{"token":""}');
        document.head.appendChild(s);
    },

    /** Remove Cloudflare analytics if already loaded */
    _removeAnalytics() {
        var el = document.querySelector('script[src*="cloudflareinsights.com/beacon"]');
        if (el) el.remove();
    },

    /** Show the consent banner if user hasn't chosen yet */
    init() {
        var choice = this.getChoice();
        if (choice === 'accepted') { this._loadAnalytics(); return; }
        if (choice === 'rejected') { this._removeAnalytics(); return; }
        // No choice yet — show banner
        var banner = document.createElement('div');
        banner.className = 'cookie-banner';
        banner.id = 'cookie-banner';
        banner.innerHTML =
            '<div class="cookie-banner__text">' +
            'We use cookies and local storage to improve your experience. ' +
            'Analytics help us understand how the site is used. ' +
            '<a href="/privacy">Privacy Policy</a>' +
            '</div>' +
            '<div class="cookie-banner__actions">' +
            '<button class="btn btn-secondary btn-sm" id="cookie-reject">Reject</button>' +
            '<button class="btn btn-primary btn-sm" id="cookie-accept">Accept</button>' +
            '</div>';
        document.body.appendChild(banner);
        document.getElementById('cookie-accept')?.addEventListener('click', function() { CookieConsent.accept(); });
        document.getElementById('cookie-reject')?.addEventListener('click', function() { CookieConsent.reject(); });
    }
};

// ═══════════════════════════════════════
// MODULE 14b: Maintenance Mode Middleware
// ═══════════════════════════════════════
const MaintenanceMode = {
    /**
     * Check site_settings in Supabase and enforce maintenance/store locks.
     * Admins bypass all restrictions.
     */
    async check() {
        try {
            // Skip check on maintenance page itself and admin panel
            var path = window.location.pathname;
            if (path === '/maintenance' || path === '/maintenance.html') return;
            if (path.indexOf('/admin') === 0 || path.indexOf('/pages/admin') === 0) return;

            var { data, error } = await window.supabaseClient
                .from('site_settings')
                .select('maintenance_mode, store_locked, maintenance_message')
                .eq('id', 1)
                .single();

            if (error || !data) return; // If table doesn't exist yet, do nothing

            // Check if current user is admin (bypass all restrictions)
            var isAdmin = false;
            try {
                var { data: sessionData } = await window.supabaseClient.auth.getSession();
                if (sessionData && sessionData.session) {
                    var uid = sessionData.session.user.id;
                    var { data: profile } = await window.supabaseClient
                        .from('profiles')
                        .select('role')
                        .eq('id', uid)
                        .single();
                    if (profile && profile.role === 'admin') isAdmin = true;
                }
            } catch (e) { /* not logged in or error, treat as non-admin */ }

            if (isAdmin) return; // Admins bypass everything

            // Full site maintenance mode
            if (data.maintenance_mode) {
                window.location.replace('/maintenance.html');
                return;
            }

            // Store lock: block access to store page
            if (data.store_locked && (path === '/store' || path === '/store.html' || path.indexOf('/store') === 0)) {
                if (typeof UI !== 'undefined' && UI.toast) {
                    // Defer toast to after page loads
                    setTimeout(function() { UI.toast('The store is temporarily closed for maintenance.', 'warning'); }, 500);
                }
                window.location.replace('/');
                return;
            }
        } catch (err) {
            console.warn('MaintenanceMode.check:', err.message);
        }
    }
};

// ═══════════════════════════════════════
// MODULE 14b: Realtime Live Stats
// ═══════════════════════════════════════
const LiveRealtime = {
    _channel: null,

    init() {
        if (!window.supabaseClient) return;
        try {
            // Subscribe to changes on the groups table for live stat updates
            this._channel = window.supabaseClient
                .channel('live-stats')
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'groups'
                }, (payload) => {
                    if (payload.new) LiveRealtime._handleGroupUpdate(payload.new);
                })
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'comments'
                }, (payload) => {
                    if (payload.new && payload.new.content_id) {
                        LiveRealtime._handleNewComment(payload.new.content_id);
                    }
                })
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        console.log('LiveRealtime: connected');
                    }
                });
        } catch (err) {
            console.warn('LiveRealtime.init:', err.message);
        }
    },

    _handleGroupUpdate(group) {
        var bar = document.querySelector('.group-card__live-stats[data-group-id="' + group.id + '"]');
        if (!bar) return;

        // Update views count
        var viewsEl = bar.querySelector('[data-count="views"]');
        if (viewsEl && group.views != null) {
            viewsEl.textContent = UI.formatNumber(group.views);
        }

        // Update rating
        var ratingEl = bar.querySelector('[data-count="rating"]');
        if (ratingEl && group.avg_rating != null) {
            ratingEl.textContent = parseFloat(group.avg_rating).toFixed(1);
            var starIcon = bar.querySelector('.live-stat__star');
            if (starIcon && parseFloat(group.avg_rating) > 0) {
                starIcon.setAttribute('fill', 'currentColor');
            }
        }

        // Update trust score
        var trustEl = bar.querySelector('[data-count="trust"]');
        if (trustEl && typeof Algorithms !== 'undefined') {
            trustEl.textContent = Algorithms.calculateTrustScore(group);
        }
    },

    _handleNewComment(contentId) {
        var bar = document.querySelector('.group-card__live-stats[data-group-id="' + contentId + '"]');
        if (!bar) return;
        var countEl = bar.querySelector('[data-count="comments"]');
        if (countEl) {
            var current = parseInt(countEl.textContent.replace(/[^\d]/g, '')) || 0;
            countEl.textContent = UI.formatNumber(current + 1);
        }
    },

    destroy() {
        if (this._channel) {
            try { window.supabaseClient.removeChannel(this._channel); } catch (e) { /* ignore */ }
            this._channel = null;
        }
    }
};

// ═══════════════════════════════════════
// MODULE 15: Global Init
// ═══════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    Theme.init();
    Security.init();
    // Start auth listener BEFORE rendering header so that
    // the INITIAL_SESSION callback can update the header with
    // the correct logged-in state as soon as possible.
    Auth._initListener();
    // Render header: if a Supabase session exists in localStorage the
    // header will briefly show "Sign In" until the INITIAL_SESSION
    // callback fires and re-renders it. We check localStorage here to
    // avoid the flash by rendering a placeholder instead.
    renderHeader();
    renderFooter();
    renderMobileNav();
    loadSettings();
    // Check maintenance mode (async, non-blocking for admins)
    MaintenanceMode.check();
    // Initialize real-time live stats (views, likes, ratings, comments)
    LiveRealtime.init();
    // Premium header scroll effect
    (function initHeaderScroll() {
        var header = document.querySelector('.site-header');
        if (!header) return;
        var onScroll = function() {
            if (window.scrollY > 20) { header.classList.add('scrolled'); }
            else { header.classList.remove('scrolled'); }
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    })();
    // CookieConsent.init(); // Disabled — no popup on page load
    // Load Turnstile SDK globally so auth modal CAPTCHA works on every page
    if (CONFIG.turnstileSiteKey && !document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) {
        const ts = document.createElement('script');
        ts.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        ts.async = true;
        ts.defer = true;
        document.head.appendChild(ts);
    }
});

// ═══════════════════════════════════════
// GROUP HEALTH — Link validity checking & caching
// Stores health check results in localStorage so badges
// can be shown on group cards and profile pages.
// ═══════════════════════════════════════
const GroupHealth = {
    _storageKey: 'gm_health_cache',
    _cacheDuration: 3600000 * 6, // 6 hours

    _getCache() {
        try {
            const raw = localStorage.getItem(this._storageKey);
            return raw ? JSON.parse(raw) : {};
        } catch { return {}; }
    },

    _setCache(cache) {
        try { localStorage.setItem(this._storageKey, JSON.stringify(cache)); } catch {}
    },

    getCachedStatus(groupId) {
        const cache = this._getCache();
        const entry = cache[groupId];
        if (!entry) return null;
        if (Date.now() - entry.ts > this._cacheDuration) {
            delete cache[groupId];
            this._setCache(cache);
            return null;
        }
        return entry;
    },

    setCachedStatus(groupId, status, extra) {
        const cache = this._getCache();
        cache[groupId] = { status: status, ts: Date.now(), ...(extra || {}) };
        // Limit cache size
        const keys = Object.keys(cache);
        if (keys.length > 500) {
            keys.sort(function(a, b) { return cache[a].ts - cache[b].ts; });
            for (let i = 0; i < keys.length - 400; i++) delete cache[keys[i]];
        }
        this._setCache(cache);
    },

    async checkLink(url) {
        try {
            const res = await fetch('/api/health-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url })
            });
            const data = await res.json();
            if (data.ok) return data;
            return { status: 'uncertain', checkedAt: new Date().toISOString() };
        } catch {
            return { status: 'uncertain', checkedAt: new Date().toISOString() };
        }
    },

    async checkGroup(group) {
        if (!group || !group.link) return { status: 'uncertain' };
        const cached = this.getCachedStatus(group.id);
        if (cached) return cached;
        const result = await this.checkLink(group.link);
        this.setCachedStatus(group.id, result.status, { platform: result.platform });
        return result;
    },

    healthBadge(status) {
        const badges = {
            active: '<span class="health-badge health-badge--active" title="Link verified active">' + ICONS.check_circle + ' Active</span>',
            dead: '<span class="health-badge health-badge--dead" title="Link expired or dead">' + ICONS.x_circle + ' Dead</span>',
            uncertain: '<span class="health-badge health-badge--uncertain" title="Status unknown">' + ICONS.alert_circle + ' Unknown</span>'
        };
        return badges[status] || badges.uncertain;
    }
};
window.GroupHealth = GroupHealth;

// ═══════════════════════════════════════
// SERVICE WORKER REGISTRATION & AUTO-UPDATE
// Registers the SW once, then checks for updates on every page load.
// When a new SW is found, it auto-activates and reloads the page so
// users always see the latest version without manually clearing cache.
// ═══════════════════════════════════════
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js').then(function(reg) {
            // Check for SW updates immediately and on every page load
            reg.update();

            // Also check for updates periodically (every 60 seconds)
            setInterval(function() { reg.update(); }, 60000);

            // When a new SW is found and installed, tell it to activate
            reg.addEventListener('updatefound', function() {
                var newWorker = reg.installing;
                if (!newWorker) return;
                newWorker.addEventListener('statechange', function() {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // New SW is ready — tell it to skip waiting
                        newWorker.postMessage({ type: 'SKIP_WAITING' });
                    }
                });
            });
        }).catch(function(err) {
            console.warn('SW registration failed:', err);
        });

        // When the new SW takes over, reload so user sees the latest content
        var refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', function() {
            if (!refreshing) {
                refreshing = true;
                window.location.reload();
            }
        });
    });
}

window.onerror = function (msg, src, line, col, err) {
    if (err && err.message) console.warn('GlobalError:', err.message, src, line);
};
window.onunhandledrejection = function (e) {
    if (e && e.reason) console.warn('UnhandledRejection:', e.reason.message || e.reason);
};

// ═══════════════════════════════════════
// BUTTON RIPPLE EFFECT
// ═══════════════════════════════════════
document.addEventListener('click', function(e) {
    var btn = e.target.closest('.btn');
    if (!btn || btn.disabled || btn.classList.contains('disabled')) return;
    var rect = btn.getBoundingClientRect();
    var ripple = document.createElement('span');
    ripple.className = 'btn-ripple';
    var size = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
    ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
    btn.appendChild(ripple);
    setTimeout(function() { ripple.remove(); }, 500);
});

// ═══════════════════════════════════════
// IMAGE BLUR-UP LOADING
// ═══════════════════════════════════════
(function() {
    function initBlurUp(img) {
        if (img.dataset.blurInit) return;
        img.dataset.blurInit = '1';
        if (img.complete && img.naturalWidth > 0) {
            img.classList.add('img-loaded');
            return;
        }
        img.classList.add('img-loading');
        img.addEventListener('load', function() {
            img.classList.remove('img-loading');
            img.classList.add('img-loaded');
        }, { once: true });
        img.addEventListener('error', function() {
            img.classList.remove('img-loading');
        }, { once: true });
    }

    function scanImages() {
        document.querySelectorAll('.img-blur-wrap img, .group-card img, .article-card__image').forEach(initBlurUp);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scanImages);
    } else {
        scanImages();
    }

    if (typeof MutationObserver !== 'undefined') {
        var imgObserver = new MutationObserver(function(mutations) {
            for (var i = 0; i < mutations.length; i++) {
                var added = mutations[i].addedNodes;
                for (var j = 0; j < added.length; j++) {
                    if (added[j].nodeType === 1) {
                        if (added[j].tagName === 'IMG') initBlurUp(added[j]);
                        else if (added[j].querySelectorAll) {
                            added[j].querySelectorAll('.img-blur-wrap img, .group-card img, .article-card__image').forEach(initBlurUp);
                        }
                    }
                }
            }
        });
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                imgObserver.observe(document.body, { childList: true, subtree: true });
            });
        } else {
            imgObserver.observe(document.body, { childList: true, subtree: true });
        }
    }
})();

// ═══════════════════════════════════════
// KEYBOARD SHORTCUTS
// ═══════════════════════════════════════
(function() {
    var shortcutsVisible = false;

    function isInputFocused() {
        var el = document.activeElement;
        if (!el) return false;
        var tag = el.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    }

    function showShortcutsOverlay() {
        if (shortcutsVisible) return;
        shortcutsVisible = true;
        var overlay = document.createElement('div');
        overlay.className = 'shortcuts-overlay';
        overlay.id = 'shortcuts-overlay';
        overlay.innerHTML =
            '<div class="shortcuts-panel">' +
            '<div class="shortcuts-panel__header">' +
            '<span class="shortcuts-panel__title">Keyboard Shortcuts</span>' +
            '<button class="btn btn-ghost btn-icon btn-sm" id="shortcuts-close" aria-label="Close">&times;</button>' +
            '</div>' +
            '<div class="shortcuts-panel__body">' +
            '<div class="shortcuts-section">' +
            '<div class="shortcuts-section__title">Navigation</div>' +
            '<div class="shortcut-row"><span class="shortcut-row__label">Focus search</span><span class="shortcut-row__keys"><kbd class="kbd">/</kbd></span></div>' +
            '<div class="shortcut-row"><span class="shortcut-row__label">Go to home</span><span class="shortcut-row__keys"><kbd class="kbd">g</kbd> <kbd class="kbd">h</kbd></span></div>' +
            '<div class="shortcut-row"><span class="shortcut-row__label">Go to dashboard</span><span class="shortcut-row__keys"><kbd class="kbd">g</kbd> <kbd class="kbd">d</kbd></span></div>' +
            '<div class="shortcut-row"><span class="shortcut-row__label">Go to articles</span><span class="shortcut-row__keys"><kbd class="kbd">g</kbd> <kbd class="kbd">a</kbd></span></div>' +
            '<div class="shortcut-row"><span class="shortcut-row__label">Go to jobs</span><span class="shortcut-row__keys"><kbd class="kbd">g</kbd> <kbd class="kbd">j</kbd></span></div>' +
            '</div>' +
            '<div class="shortcuts-section">' +
            '<div class="shortcuts-section__title">Actions</div>' +
            '<div class="shortcut-row"><span class="shortcut-row__label">Toggle dark/light theme</span><span class="shortcut-row__keys"><kbd class="kbd">t</kbd></span></div>' +
            '<div class="shortcut-row"><span class="shortcut-row__label">Close modal / overlay</span><span class="shortcut-row__keys"><kbd class="kbd">Esc</kbd></span></div>' +
            '<div class="shortcut-row"><span class="shortcut-row__label">Show this help</span><span class="shortcut-row__keys"><kbd class="kbd">?</kbd></span></div>' +
            '</div>' +
            '</div>' +
            '</div>';
        document.body.appendChild(overlay);
        document.getElementById('shortcuts-close').addEventListener('click', hideShortcutsOverlay);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) hideShortcutsOverlay(); });
    }

    function hideShortcutsOverlay() {
        var overlay = document.getElementById('shortcuts-overlay');
        if (overlay) overlay.remove();
        shortcutsVisible = false;
    }

    var goPrefix = false;
    var goTimer = null;

    document.addEventListener('keydown', function(e) {
        // Don't fire shortcuts when typing in inputs
        if (isInputFocused()) {
            // Exception: Esc should still blur inputs
            if (e.key === 'Escape') {
                document.activeElement.blur();
                e.preventDefault();
            }
            return;
        }

        // Don't interfere with modifier combos (Ctrl+C, etc.)
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        var key = e.key;

        // Close shortcuts overlay on Escape
        if (key === 'Escape' && shortcutsVisible) {
            hideShortcutsOverlay();
            e.preventDefault();
            return;
        }

        // ? — Show shortcuts help
        if (key === '?') {
            e.preventDefault();
            if (shortcutsVisible) hideShortcutsOverlay();
            else showShortcutsOverlay();
            return;
        }

        // / — Focus search
        if (key === '/') {
            e.preventDefault();
            var searchInput = document.querySelector('.hero__search-input') || document.querySelector('[name="q"]') || document.querySelector('input[type="search"]');
            if (searchInput) { searchInput.focus(); searchInput.select(); }
            return;
        }

        // t — Toggle theme
        if (key === 't') {
            e.preventDefault();
            if (typeof Theme !== 'undefined') Theme.toggle();
            return;
        }

        // g + second key — Go-to navigation
        if (key === 'g' && !goPrefix) {
            goPrefix = true;
            clearTimeout(goTimer);
            goTimer = setTimeout(function() { goPrefix = false; }, 1000);
            return;
        }

        if (goPrefix) {
            goPrefix = false;
            clearTimeout(goTimer);
            var routes = { h: '/', d: '/dashboard', a: '/articles', j: '/jobs', m: '/marketplace', s: '/search' };
            if (routes[key]) {
                e.preventDefault();
                window.location.href = routes[key];
            }
            return;
        }
    });
})();

// ═══════════════════════════════════════
// FORM VALIDATION UX
// ═══════════════════════════════════════
(function() {
    function validateField(input) {
        if (!input || !input.closest('.form-group')) return;
        var value = input.value.trim();
        var type = input.type;
        var required = input.hasAttribute('required');
        var minLength = input.getAttribute('minlength');
        var existingError = input.parentElement.querySelector('.form-error');

        // Clear previous state
        input.classList.remove('form-input--error', 'form-input--valid');
        if (existingError) existingError.remove();

        if (!value && !required) return;

        var isValid = true;
        var errorMsg = '';

        if (required && !value) {
            isValid = false;
            errorMsg = 'This field is required';
        } else if (type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            isValid = false;
            errorMsg = 'Please enter a valid email address';
        } else if (minLength && value.length < parseInt(minLength)) {
            isValid = false;
            errorMsg = 'Must be at least ' + minLength + ' characters';
        } else if (type === 'url' && value && !/^https?:\/\/.+/.test(value)) {
            isValid = false;
            errorMsg = 'Please enter a valid URL';
        }

        if (!isValid) {
            input.classList.add('form-input--error');
            var errorEl = document.createElement('div');
            errorEl.className = 'form-error';
            errorEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> ' + errorMsg;
            input.parentElement.appendChild(errorEl);
        } else if (value) {
            input.classList.add('form-input--valid');
        }
    }

    // Validate on blur for all form-input elements
    document.addEventListener('focusout', function(e) {
        if (e.target.classList && e.target.classList.contains('form-input')) {
            validateField(e.target);
        }
    });

    // Clear error styling when user starts typing
    document.addEventListener('input', function(e) {
        if (e.target.classList && e.target.classList.contains('form-input')) {
            e.target.classList.remove('form-input--error');
            var err = e.target.parentElement.querySelector('.form-error');
            if (err) err.remove();
        }
    });

    // Add shake animation on invalid form submit
    document.addEventListener('submit', function(e) {
        var form = e.target;
        var invalids = form.querySelectorAll('.form-input:invalid, .form-input--error');
        if (invalids.length > 0) {
            invalids.forEach(function(input) {
                validateField(input);
                input.classList.add('form-shake');
                setTimeout(function() { input.classList.remove('form-shake'); }, 400);
            });
        }
    }, true);
})();
