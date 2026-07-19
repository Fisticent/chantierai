import React, { useState, useEffect, useRef } from 'react';
import localforage from 'localforage';
import {
  Mic, MicOff, Camera, Plus, Trash2, Share2, Bell, Sparkles, User, Check, X,
  FileText, Users, Edit2, BookOpen, Home, ChevronRight, ChevronDown,
  Download, Images, Pause, Play, Search, MoreHorizontal
} from 'lucide-react';

localforage.config({ name: 'ChantierExpress', storeName: 'interventions_store' });

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || '';

// Vocabulaire et style extraits de comptes rendus de chantier réels (dossier
// compte_rendu_exemples/) — utilisés pour aider Gemini à corriger le jargon métier
// mal transcrit lors de la structuration du texte (pas pour Groq, voir plus bas :
// un LLM comme Gemini connaît déjà ce vocabulaire, ce qui l'aide surtout c'est le
// style attendu, pas la liste de mots).
const TRADE_VOCABULARY = [
  'tapée', 'plinthe', 'frisette', 'faïence', 'crépis', 'seuil', 'chape', 'gaine',
  'VMC', 'faux-plafond', 'cloison', 'huisserie', 'galandage', 'calepinage',
  'coffret', 'mitigeur', 'SDB', 'placo', 'goulotte', 'boisseau', 'encadrement',
  'niche', 'menuiserie', 'agencement', 'carrelage', 'chauffe-eau',
  'groupe de sécurité', 'disjoncteur', 'différentiel', 'étanchéité', 'ragréage',
  'banc-coffre', 'fenestron', 'balustrade', 'muret', 'poutre', 'corps encastré',
  'coffret gaz', 'tuyau de gaz', 'siphon', 'robinetterie', 'insert', 'hammam',
  'sauna', 'adoucisseur', 'porte à galandage', 'porte accordéon', 'variateur'
].join(', ');

// Puces réelles tirées des CR de compte_rendu_exemples/, utilisées pour montrer à Gemini
// le style télégraphique attendu (bien plus efficace qu'une simple consigne "sois concis").
const REAL_TASK_EXAMPLES = [
  'Fermer les gaines du plombier',
  'Tapées fenêtres cuisine abîmées',
  "Remplacer le groupe de sécurité et purger le ballon d'eau chaude",
].join(' / ');

// Whisper (contrairement à un LLM comme Gemini) n'a pas de connaissance du monde : il a
// besoin qu'on lui donne explicitement le registre attendu. Une phrase de contexte
// naturelle + un exemple de phrase orale pèsent bien plus qu'une liste de mots brute,
// car le modèle conditionne sur le style/registre des tokens précédents, pas seulement
// sur des mots isolés.
const GROQ_TRANSCRIPTION_PROMPT =
  "Compte rendu de chantier dicté à voix haute par un artisan du bâtiment qui se déplace " +
  "pièce par pièce. Vocabulaire courant : plomberie (mitigeur, chauffe-eau, groupe de " +
  "sécurité, siphon, VMC), électricité (tableau électrique, disjoncteur, différentiel, " +
  "gaine), maçonnerie (chape, ragréage, linteau, crépis), menuiserie (huisserie, tapée, " +
  "plinthe, porte à galandage), plâtrerie (placo, cloison, faux-plafond). Exemple : " +
  "\"Dans la salle de bain, j'ai remplacé le mitigeur et vérifié l'étanchéité du receveur " +
  "de douche. En cuisine, j'ai raccordé le nouveau chauffe-eau.\"";

const PHOTO_MARKER_REGEX = /\[Photo (\d+)\]/g;

function loadPersisted(key, fallback) {
  return localforage.getItem(key).then((v) => (v === null || v === undefined ? fallback : v));
}

const EMPTY_INTERVENTION_DRAFT = () => ({ id: null, clientId: '', status: 'encours', description: '', photos: [], structuredReport: null });
const EMPTY_CLIENT_DRAFT = () => ({ id: null, name: '', company: '', phone: '', email: '', address: '' });
const EMPTY_ARTISAN = { logo: '', company: '', contact: '', job: '', phone: '', email: '', address: '' };

// Données de démonstration reprises de la maquette (nouveau_design/Chantier App.dc.html),
// chargées uniquement au tout premier lancement (rien n'écrase des données déjà saisies).
const SEED_CLIENTS = [
  { id: 'c1', name: 'Martin Dubois', company: 'Dubois Rénovation', phone: '06 12 34 56 78', email: 'martin.dubois@email.fr', address: '12 rue des Lilas, 69003 Lyon' },
  { id: 'c2', name: 'Sophie Lefèvre', company: 'Cabinet Lefèvre', phone: '06 98 76 54 32', email: 's.lefevre@gmail.com', address: '45 avenue Foch, 69006 Lyon' },
  { id: 'c3', name: 'Karim Haddad', company: '', phone: '07 45 12 89 33', email: 'karim.haddad@outlook.fr', address: '8 impasse des Vignes, 69008 Lyon' }
];

function seedIntervention(id, clientId, daysAgo, time, status, title, description, photoUrls) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return {
    id, clientId, date: d.toISOString(), time, status, title,
    description, conclusion: '', structuredReport: null,
    photos: photoUrls.map((url, i) => ({ id: id + '-p' + i, url }))
  };
}

// Photos de démonstration (domaine public / Wikimedia Commons, libres de droits) illustrant
// chaque type d'intervention — plomberie, électricité, peinture.
const SEED_PHOTOS = {
  plumbing: [
    'https://upload.wikimedia.org/wikipedia/commons/c/c8/Plumber_soldering_pipe_above_new_water_heater.JPG',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/2025-04-10_19_35_17_Newly_installed_water_heater_in_a_house_in_the_Mountainview_section_of_Ewing_Township%2C_Mercer_County%2C_New_Jersey.jpg/500px-2025-04-10_19_35_17_Newly_installed_water_heater_in_a_house_in_the_Mountainview_section_of_Ewing_Township%2C_Mercer_County%2C_New_Jersey.jpg'
  ],
  electrical: [
    'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Electrical_panel_and_subpanel_with_cover_removed_from_subpanel.jpg/500px-Electrical_panel_and_subpanel_with_cover_removed_from_subpanel.jpg'
  ],
  painting: [
    'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Paint_roller_4.jpg/500px-Paint_roller_4.jpg',
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/US_Navy_070823-N-9195K-025_Aerographer%27s_Mate_1st_Class_William_Palmer_uses_a_roller_to_add_a_second_coat_of_paint_to_a_wall_during_a_community_relations_project_at_Voza_Medical_Clinic_in_support_of_Pacific_Partnership.jpg/500px-thumbnail.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/US_Navy_090416-F-7522G-006_Aerographer%27s_Mate_Gina_Hegg%2C_embarked_aboard_the_Military_Sealift_Command_hospital_ship_USNS_Comfort_%28T-AH_20%29_paints_the_wall_of_a_pediatric_medical_facility_at_Emmanuel_Christian_School.jpg/500px-thumbnail.jpg"
  ]
};

const SEED_INTERVENTIONS = [
  seedIntervention('i1', 'c1', 0, '09:15', 'termine', 'Intervention plomberie', "Remplacement du groupe de sécurité et purge du ballon d'eau chaude. Vérification de la pression du circuit. RAS sur le reste de l'installation.", SEED_PHOTOS.plumbing),
  seedIntervention('i2', 'c2', 0, '11:30', 'encours', 'Mise aux normes électriques', "Mise aux normes du tableau électrique — remplacement de 3 disjoncteurs et ajout d'un différentiel 30mA sur le circuit salle de bain.", SEED_PHOTOS.electrical),
  seedIntervention('i3', 'c3', 1, '14:00', 'termine', 'Peinture salon', "Reprise d'enduit et peinture 2 couches dans le salon, 22m². Rebouchage des fissures avant application.", SEED_PHOTOS.painting)
];

// Simple monogram logo, rendered to a raster PNG via canvas (no external file needed) and
// used as a placeholder for the demo artisan profile. Rendered as a PNG rather than SVG
// because jsPDF's addImage() cannot rasterize an SVG-sourced <img> element — it expects
// already-decoded bitmap data, so an SVG source silently fails to embed in the PDF.
function makePlaceholderLogo() {
  const canvas = document.createElement('canvas');
  canvas.width = 200; canvas.height = 200;
  const ctx = canvas.getContext('2d');
  const r = 36;
  ctx.fillStyle = '#26314f';
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(200, 0, 200, 200, r);
  ctx.arcTo(200, 200, 0, 200, r);
  ctx.arcTo(0, 200, 0, 0, r);
  ctx.arcTo(0, 0, 200, 0, r);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#faf8f5';
  ctx.font = "800 86px Outfit, system-ui, sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('AP', 100, 110);
  return canvas.toDataURL('image/png');
}
const PLACEHOLDER_LOGO = typeof document !== 'undefined' ? makePlaceholderLogo() : '';

const DEFAULT_ARTISAN = {
  logo: PLACEHOLDER_LOGO, company: 'Artis’Pro Bâtiment', contact: 'Julien Moreau',
  job: 'Plombier - Électricien', phone: '06 70 11 22 33', email: 'contact@artispro-batiment.fr',
  address: '3 rue de l’Industrie, 69100 Villeurbanne'
};

function App() {
  const [tab, setTab] = useState('journal'); // journal | clients | profil | guide
  const [clients, setClients] = useState([]);
  const [interventions, setInterventions] = useState([]);
  const [artisan, setArtisan] = useState(EMPTY_ARTISAN);
  const [artisanSaved, setArtisanSaved] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  const [interventionModalOpen, setInterventionModalOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_INTERVENTION_DRAFT());
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [clientQuery, setClientQuery] = useState('');
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [expandedJournalClients, setExpandedJournalClients] = useState(() => new Set());
  const journalAutoExpandedRef = useRef(false);
  const [cardMenuOpenId, setCardMenuOpenId] = useState(null);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [clientDraft, setClientDraft] = useState(EMPTY_CLIENT_DRAFT());

  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfIntervId, setPdfIntervId] = useState(null);
  const [pdfDraft, setPdfDraft] = useState({ title: '', conclusion: '' });
  const [pdfGenerating, setPdfGenerating] = useState(false);

  const [toastMessage, setToastMessage] = useState('');
  const toastTimerRef = useRef(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  const [notificationStatus, setNotificationStatus] = useState(
    'Notification' in window ? Notification.permission : 'default'
  );
  const [showNotificationsPopover, setShowNotificationsPopover] = useState(false);
  const notificationsPopoverRef = useRef(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingStartTimeRef = useRef(0);
  const pausedAccumMsRef = useRef(0);
  const pauseStartedAtRef = useRef(null);
  const photoMarkersRef = useRef([]);
  const clientPickerRef = useRef(null);
  const micStreamRef = useRef(null);

  // Live waveform while recording — an AnalyserNode tapped off the same mic stream
  // MediaRecorder uses (read-only tap, never connected to the speakers).
  const [waveLevels, setWaveLevels] = useState([0, 0, 0, 0, 0]);
  const audioContextRef = useRef(null);
  const waveRafRef = useRef(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(''), 4200);
  };

  // ---- Load persisted data on start (seed demo data once, on the very first launch) ----
  useEffect(() => {
    const SEED_VERSION = 4; // bump to re-seed everyone once (e.g. when seed photos/logo change)
    Promise.all([
      loadPersisted('seedVersion', 0),
      loadPersisted('clients', []),
      loadPersisted('interventions', []),
      loadPersisted('artisan', EMPTY_ARTISAN),
    ]).then(([seedVersion, c, iv, a]) => {
      if (seedVersion < SEED_VERSION) {
        c = SEED_CLIENTS;
        iv = SEED_INTERVENTIONS;
        a = DEFAULT_ARTISAN;
        localforage.setItem('seedVersion', SEED_VERSION);
      }
      setClients(c);
      setInterventions(iv);
      setArtisan(a);
      setDataLoaded(true);
    });

    document.documentElement.setAttribute('data-theme', 'light');

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setInterventionModalOpen(false);
        setClientModalOpen(false);
        setPdfModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const handleClickOutside = (e) => {
      if (notificationsPopoverRef.current && !notificationsPopoverRef.current.contains(e.target)) {
        setShowNotificationsPopover(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    const checkDailyReminder = () => {
      const now = new Date();
      if (now.getHours() === 17 && now.getMinutes() === 30) {
        showLocalNotification('Rappel ChantierExpress', {
          body: "C'est l'heure du bilan ! Pensez à générer et envoyer votre rapport de travaux.",
          icon: '/icon.svg',
          tag: 'daily-reminder'
        });
      }
    };
    const reminderInterval = setInterval(checkDailyReminder, 60000);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
      clearInterval(reminderInterval);
    };
  }, []);

  // ---- Persist on change (skip the initial load tick) ----
  useEffect(() => { if (dataLoaded) localforage.setItem('clients', clients); }, [clients, dataLoaded]);
  useEffect(() => { if (dataLoaded) localforage.setItem('interventions', interventions); }, [interventions, dataLoaded]);
  useEffect(() => { if (dataLoaded) localforage.setItem('artisan', artisan); }, [artisan, dataLoaded]);

  useEffect(() => {
    if (!clientPickerOpen) return;
    const onPointerDown = (e) => {
      if (clientPickerRef.current && !clientPickerRef.current.contains(e.target)) {
        setClientPickerOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [clientPickerOpen]);

  // Auto-expand every client group that has at least one CR "en cours" (once per session load on journal).
  useEffect(() => {
    if (tab !== 'journal' || !dataLoaded) return;
    if (journalAutoExpandedRef.current) return;
    const pendingIds = interventions
      .filter((i) => i.status === 'encours')
      .map((i) => i.clientId || '__orphan__');
    if (pendingIds.length === 0) return;
    journalAutoExpandedRef.current = true;
    setExpandedJournalClients(new Set(pendingIds));
  }, [tab, dataLoaded, interventions]);

  const toggleJournalClient = (clientId) => {
    setExpandedJournalClients((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // ---- PWA install detection ----
  useEffect(() => {
    const standaloneMode = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    setIsStandalone(standaloneMode);
    setIsIos(/iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase()));

    const handleInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);

    loadPersisted('visits', 0).then((v) => {
      const visits = v + 1;
      localforage.setItem('visits', visits);
      Promise.all([
        loadPersisted('installDismissed', false),
        loadPersisted('hasCompletedCr', false),
      ]).then(([dismissed, hasCompletedCr]) => {
        // Banner only after the artisan has produced at least one CR (value before install ask).
        if (visits >= 3 && hasCompletedCr && !dismissed && !standaloneMode) setShowInstallBanner(true);
      });
    });

    return () => window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
  }, []);

  const dismissInstall = () => {
    localforage.setItem('installDismissed', true);
    setShowInstallBanner(false);
  };

  const installApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      setShowInstallBanner(false);
    } else {
      showToast(isIos
        ? "Utilise le bouton de partage de Safari → « Sur l'écran d'accueil »"
        : "Utilise le menu de ton navigateur → « Installer l'application »");
      setShowInstallBanner(false);
    }
  };

  // ---- Notifications ----
  const showLocalNotification = (title, options) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (navigator.serviceWorker) {
      navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, options)).catch(() => {
        try { new Notification(title, options); } catch (e) { /* unsupported */ }
      });
    } else {
      try { new Notification(title, options); } catch (e) { /* unsupported */ }
    }
  };

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      showToast('Notifications non supportées par ce navigateur.');
      return;
    }
    const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
    if (!isSecure) {
      showToast('Les notifications nécessitent une connexion HTTPS.');
    }
    const permission = await Notification.requestPermission();
    setNotificationStatus(permission);
    if (permission === 'granted') {
      showLocalNotification('ChantierExpress', {
        body: 'Rappels quotidiens activés ! Vous serez averti à 17h30.',
        icon: '/icon.svg'
      });
    }
  };

  // ---- Navigation ----
  const goTab = (t) => setTab(t);

  // ---- Clients ----
  const openNewClient = () => { setClientDraft(EMPTY_CLIENT_DRAFT()); setClientModalOpen(true); };
  const openClientEdit = (id) => {
    const c = clients.find((c) => c.id === id);
    setClientDraft({ ...c });
    setClientModalOpen(true);
  };
  const closeClientModal = () => setClientModalOpen(false);
  const setClientField = (field, value) => setClientDraft((d) => ({ ...d, [field]: value }));

  const saveClientDraft = () => {
    if (!clientDraft.name.trim()) return;
    if (clientDraft.id) {
      setClients((prev) => prev.map((c) => (c.id === clientDraft.id ? { ...clientDraft } : c)));
    } else {
      const newClient = { ...clientDraft, id: 'c' + Date.now() };
      setClients((prev) => [...prev, newClient]);
      if (interventionModalOpen) {
        setDraft((d) => ({ ...d, clientId: newClient.id }));
        setClientQuery(newClient.name);
      }
    }
    setClientModalOpen(false);
    showToast('Client enregistré');
  };

  const deleteClientDraft = () => {
    setClients((prev) => prev.filter((c) => c.id !== clientDraft.id));
    setClientModalOpen(false);
    showToast('Client supprimé');
  };

  const selectClientForDraft = (client) => {
    setDraftField('clientId', client.id);
    setClientQuery(client.name);
    setClientPickerOpen(false);
  };

  const filteredClientsForPicker = clients.filter((c) => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return true;
    return [c.name, c.company, c.phone].filter(Boolean).some((s) => s.toLowerCase().includes(q));
  });

  // ---- Intervention modal ----
  const resetPhotoMarkers = () => { photoMarkersRef.current = []; };

  const syncClientQueryFromDraft = (clientId) => {
    const c = clients.find((x) => x.id === clientId);
    setClientQuery(c ? c.name : '');
    setClientPickerOpen(false);
  };

  const openNewIntervention = (prefillClientId = '') => {
    const clientId = typeof prefillClientId === 'string' ? prefillClientId : '';
    setDraft({ ...EMPTY_INTERVENTION_DRAFT(), clientId });
    resetPhotoMarkers();
    syncClientQueryFromDraft(clientId);
    setInterventionModalOpen(true);
  };

  const openNewInterventionFromClient = () => {
    if (!clientDraft.id) return;
    const id = clientDraft.id;
    setClientModalOpen(false);
    openNewIntervention(id);
  };

  const openQuickDictation = () => {
    setDraft(EMPTY_INTERVENTION_DRAFT());
    resetPhotoMarkers();
    setClientQuery('');
    setClientPickerOpen(false);
    setInterventionModalOpen(true);
    // Dictation-first : on parle tout de suite, le client se rattache après.
    setTimeout(() => startDictation(), 250);
  };

  const openInterventionEdit = (id) => {
    const it = interventions.find((i) => i.id === id);
    setDraft({
      id: it.id, clientId: it.clientId, status: it.status,
      description: it.description, photos: it.photos || [],
      structuredReport: it.structuredReport || null
    });
    resetPhotoMarkers();
    syncClientQueryFromDraft(it.clientId);
    setClientModalOpen(false);
    setInterventionModalOpen(true);
  };

  const forceCloseInterventionModal = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
    }
    stopWaveform();
    setDiscardConfirmOpen(false);
    setInterventionModalOpen(false);
    setIsRecording(false);
    setIsPaused(false);
    pauseStartedAtRef.current = null;
    pausedAccumMsRef.current = 0;
  };

  const isDraftDirty = () =>
    !!(draft.description.trim() || (draft.photos && draft.photos.length) || isRecording || isPaused);

  const closeInterventionModal = () => {
    if (isDraftDirty()) {
      setDiscardConfirmOpen(true);
      return;
    }
    forceCloseInterventionModal();
  };

  const setDraftField = (field, value) => setDraft((d) => ({ ...d, [field]: value }));

  // ---- Dictation: MediaRecorder + Groq Whisper (batch, not live) so opening the
  // camera to take a photo mid-sentence never interrupts the recording. Photos are
  // timestamped and matched to the Whisper segment spoken at that moment. ----
  const transcribeWithGroq = async (audioBlob) => {
    if (!GROQ_API_KEY) throw new Error("Clé Groq manquante (VITE_GROQ_API_KEY dans .env).");
    const form = new FormData();
    form.append('file', audioBlob, 'dictee.webm');
    form.append('model', 'whisper-large-v3-turbo');
    form.append('language', 'fr');
    form.append('prompt', GROQ_TRANSCRIPTION_PROMPT);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: form
    });
    if (!response.ok) {
      const err = await response.json().catch(() => null);
      throw new Error(err?.error?.message || 'Erreur du service de transcription Groq');
    }
    const data = await response.json();
    return { text: data.text || '', segments: data.segments || [] };
  };

  const buildDescriptionFromSegments = (text, segments, markers) => {
    if (!segments || segments.length === 0 || markers.length === 0) {
      const trailing = markers.map((m) => `[Photo ${m.photoNumber}]`).join(' ');
      return trailing ? `${text} ${trailing}`.trim() : text;
    }
    const remaining = [...markers].sort((a, b) => a.atMs - b.atMs);
    let result = '';
    segments.forEach((seg, idx) => {
      result += seg.text.trim() + ' ';
      const segEndMs = seg.end * 1000;
      const isLast = idx === segments.length - 1;
      while (remaining.length > 0 && (isLast || remaining[0].atMs <= segEndMs)) {
        result += `[Photo ${remaining.shift().photoNumber}] `;
      }
    });
    return result.trim();
  };

  const stopWaveform = () => {
    if (waveRafRef.current) cancelAnimationFrame(waveRafRef.current);
    waveRafRef.current = null;
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setWaveLevels([0, 0, 0, 0, 0]);
  };

  // Taps the same mic stream MediaRecorder is using (read-only, never routed to the
  // speakers) to animate a live waveform while the artisan talks.
  const startWaveform = (stream) => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const audioCtx = new AudioContextClass();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);
    audioContextRef.current = audioCtx;

    const BAR_COUNT = 5;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const step = Math.max(1, Math.floor(data.length / BAR_COUNT));
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const levels = Array.from({ length: BAR_COUNT }, (_, i) => {
        const slice = data.slice(i * step, i * step + step);
        const avg = slice.reduce((a, b) => a + b, 0) / (slice.length || 1);
        return Math.min(1, avg / 150);
      });
      setWaveLevels(levels);
      waveRafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const getRecordingElapsedMs = () => {
    let paused = pausedAccumMsRef.current;
    if (pauseStartedAtRef.current) paused += Date.now() - pauseStartedAtRef.current;
    return Date.now() - recordingStartTimeRef.current - paused;
  };

  const startDictation = async () => {
    if (isRecording || isTranscribing) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recordingStartTimeRef.current = Date.now();
      pausedAccumMsRef.current = 0;
      pauseStartedAtRef.current = null;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        if (micStreamRef.current) {
          micStreamRef.current.getTracks().forEach((t) => t.stop());
          micStreamRef.current = null;
        }
        stopWaveform();
        setIsRecording(false);
        setIsPaused(false);
        pauseStartedAtRef.current = null;
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size === 0) return;
        setIsTranscribing(true);
        try {
          const { text, segments } = await transcribeWithGroq(audioBlob);
          const merged = buildDescriptionFromSegments(text, segments, photoMarkersRef.current);
          photoMarkersRef.current = [];
          setDraft((d) => ({ ...d, description: `${d.description}${d.description ? ' ' : ''}${merged}`.trim() }));
        } catch (err) {
          console.error(err);
          showToast(`Erreur de transcription : ${err.message}`);
        } finally {
          setIsTranscribing(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      startWaveform(stream);
      setIsRecording(true);
      setIsPaused(false);
    } catch (err) {
      console.error(err);
      showToast("Impossible d'accéder au microphone.");
    }
  };

  const pauseDictation = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    if (typeof recorder.pause !== 'function') {
      showToast('Pause non supportée sur cet appareil — arrête puis relance.');
      return;
    }
    try {
      recorder.pause();
      if (recorder.state !== 'paused') {
        showToast('Pause non supportée sur cet appareil — arrête puis relance.');
        return;
      }
      pauseStartedAtRef.current = Date.now();
      stopWaveform();
      setIsPaused(true);
    } catch (err) {
      console.error(err);
      showToast('Impossible de mettre en pause.');
    }
  };

  const resumeDictation = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'paused') return;
    try {
      if (pauseStartedAtRef.current) {
        pausedAccumMsRef.current += Date.now() - pauseStartedAtRef.current;
        pauseStartedAtRef.current = null;
      }
      recorder.resume();
      if (micStreamRef.current) startWaveform(micStreamRef.current);
      setIsPaused(false);
    } catch (err) {
      console.error(err);
      showToast('Impossible de reprendre.');
    }
  };

  const stopDictation = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    if (pauseStartedAtRef.current) {
      pausedAccumMsRef.current += Date.now() - pauseStartedAtRef.current;
      pauseStartedAtRef.current = null;
    }
    try { if (recorder.state === 'paused') recorder.resume(); } catch (_) { /* ignore */ }
    recorder.stop();
    stopWaveform();
    setIsPaused(false);
  };

  // ---- Gemini: structure the dictated text into zones/tasks/photos ----
  const optimizeText = async () => {
    const raw = (draft.description || '').trim();
    if (!raw) { showToast("Dicte ou saisis d'abord une description."); return; }
    if (!GEMINI_API_KEY) { showToast('Clé Gemini manquante (VITE_GEMINI_API_KEY dans .env).'); return; }

    setIsOptimizing(true);
    try {
      const responseSchema = {
        type: 'OBJECT',
        properties: {
          zones: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                title: { type: 'STRING' },
                tasks: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      text: { type: 'STRING' },
                      photos: { type: 'ARRAY', items: { type: 'INTEGER' } }
                    },
                    required: ['text']
                  }
                }
              },
              required: ['title', 'tasks']
            }
          }
        },
        required: ['zones']
      };

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `Tu es un assistant qui aide des artisans du bâtiment à rédiger leur compte rendu de chantier.

Le texte ci-dessous a été dicté à la voix par un artisan qui se déplace de pièce en pièce en racontant les travaux et en prenant des photos au fur et à mesure. Il contient parfois des repères "[Photo N]" insérés au moment exact où une photo a été prise.

Tâche :
1. Corrige les fautes de transcription, en particulier le jargon du bâtiment mal reconnu. Vocabulaire fréquent du métier : ${TRADE_VOCABULARY}.
2. Regroupe les tâches par zone/pièce mentionnée (ex: "Salle de bain", "Cuisine", "Chambre 2"). Si aucune zone n'est identifiable, utilise une seule zone "Général".
3. Puces courtes et factuelles, exactement le style télégraphique d'un vrai compte rendu de chantier — voici des exemples réels du registre attendu : ${REAL_TASK_EXAMPLES}. Jamais de phrases commerciales, jamais de tournures rédigées à la première personne.
4. Pour chaque tâche, si un ou plusieurs repères "[Photo N]" étaient à proximité dans le texte source, référence leur(s) numéro(s) N dans le champ "photos" (entiers). Ne laisse jamais "[Photo N]" dans le texte de la tâche.
5. Assigne TOUS les numéros de photo présents dans le texte (et tous les indices de 1 à ${draft.photos.length || 0} s'il y a des photos) à au moins une tâche. Aucune photo ne doit rester orpheline.
6. N'invente aucune information absente du texte source.

Texte dicté :
"${raw}"`
              }]
            }],
            generationConfig: { responseMimeType: 'application/json', responseSchema }
          })
        }
      );
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err?.error?.message || "Erreur du service d'optimisation");
      }
      const data = await response.json();
      const parsed = JSON.parse(data.candidates[0].content.parts[0].text);
      let zones = (parsed.zones || []).filter((z) => z.tasks && z.tasks.length > 0);

      // Rattache les photos non référencées (ex. ajoutées depuis la photothèque hors dictée)
      // à la dernière tâche, pour qu'elles apparaissent dans le PDF structuré.
      const photoCount = draft.photos.length;
      if (photoCount > 0 && zones.length > 0) {
        const referenced = new Set();
        zones.forEach((z) => z.tasks.forEach((t) => (t.photos || []).forEach((n) => referenced.add(n))));
        const orphans = [];
        for (let i = 1; i <= photoCount; i++) {
          if (!referenced.has(i)) orphans.push(i);
        }
        if (orphans.length > 0) {
          const lastZone = zones[zones.length - 1];
          const lastTask = lastZone.tasks[lastZone.tasks.length - 1];
          lastTask.photos = [...(lastTask.photos || []), ...orphans];
        }
      }

      const flattened = zones.map((zone) => {
        const header = zones.length > 1 || zone.title.toLowerCase() !== 'général' ? `${zone.title.toUpperCase()}\n` : '';
        return header + zone.tasks.map((t) => `- ${t.text}`).join('\n');
      }).join('\n\n');

      setDraft((d) => ({ ...d, description: flattened, structuredReport: { zones } }));
      showToast('Texte optimisé');
    } catch (err) {
      console.error(err);
      showToast(`Erreur d'optimisation : ${err.message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  // ---- Photos ----
  const onPhotosChange = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX = 800;
          let { width, height } = img;
          if (width > height) { if (width > MAX) { height *= MAX / width; width = MAX; } }
          else { if (height > MAX) { width *= MAX / height; height = MAX; } }
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          const url = canvas.toDataURL('image/jpeg', 0.6);
          const photoId = 'p' + Date.now() + Math.random();
          setDraft((d) => {
            const photos = [...d.photos, { id: photoId, url }];
            const photoNumber = photos.length;
            if (mediaRecorderRef.current?.state === 'recording') {
              photoMarkersRef.current.push({ photoNumber, atMs: getRecordingElapsedMs() });
            }
            return { ...d, photos };
          });
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removePhoto = (photoId) => setDraft((d) => ({ ...d, photos: d.photos.filter((p) => p.id !== photoId) }));

  // ---- Save / delete intervention ----
  const saveIntervention = () => {
    if (!draft.clientId || !draft.description.trim()) return;
    const now = new Date();
    if (draft.id) {
      setInterventions((prev) => prev.map((it) => (
        it.id === draft.id
          ? { ...it, clientId: draft.clientId, status: draft.status, description: draft.description, photos: draft.photos, structuredReport: draft.structuredReport }
          : it
      )));
    } else {
      setInterventions((prev) => [{
        id: 'i' + Date.now(), clientId: draft.clientId, date: now.toISOString(),
        time: now.toTimeString().slice(0, 5), status: draft.status, title: 'Intervention',
        description: draft.description, conclusion: '', photos: draft.photos, structuredReport: draft.structuredReport
      }, ...prev]);
    }
    localforage.setItem('hasCompletedCr', true);
    forceCloseInterventionModal();
    showToast('Fiche enregistrée');
  };

  const deleteIntervention = (id) => {
    if (!confirm('Supprimer cette fiche ?')) return;
    setInterventions((prev) => prev.filter((i) => i.id !== id));
    showToast('Fiche supprimée');
  };

  // ---- Artisan profile ----
  const setArtisanField = (field, value) => { setArtisan((a) => ({ ...a, [field]: value })); setArtisanSaved(false); };

  const onLogoChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_W = 300, MAX_H = 150;
        let { width, height } = img;
        if (width > height) { if (width > MAX_W) { height *= MAX_W / width; width = MAX_W; } }
        else { if (height > MAX_H) { width *= MAX_H / height; height = MAX_H; } }
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        setArtisan((a) => ({ ...a, logo: canvas.toDataURL('image/jpeg', 0.8) }));
        setArtisanSaved(false);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const saveArtisan = () => {
    setArtisanSaved(true);
    showToast('Profil enregistré');
    setTimeout(() => setArtisanSaved(false), 2000);
  };

  // ---- PDF ----
  const openPdfModal = (id) => {
    const it = interventions.find((i) => i.id === id);
    setPdfIntervId(id);
    setPdfDraft({ title: it.title || "Rapport d'intervention", conclusion: it.conclusion || '' });
    setPdfModalOpen(true);
  };
  const closePdfModal = () => setPdfModalOpen(false);

  // Loads an <img> element for a photo (data URI or remote URL) so jsPDF can read its real
  // width/height — needed to place it without stretching, and to embed remote demo photos
  // (jsPDF can't fetch a URL itself, only accepts already-loaded image data).
  const loadImageEl = (src) => new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

  const detectImageFormat = (src) => {
    if (src.startsWith('data:image/png')) return 'PNG';
    if (src.startsWith('data:image/webp')) return 'WEBP';
    return 'JPEG';
  };

  // "Contain" fit: scales the image to fill as much of the maxW×maxH box as possible
  // without cropping or distorting its aspect ratio.
  const fitBox = (img, maxW, maxH) => {
    const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
    return { w: img.naturalWidth * ratio, h: img.naturalHeight * ratio };
  };

  // Brand palette for the PDF, matching the app's design tokens (RGB triplets for jsPDF).
  const PDF_COLOR = {
    navy: [38, 49, 79],
    cream: [250, 248, 245],
    card: [247, 245, 241],
    divider: [225, 220, 210],
    text: [28, 27, 25],
    muted: [107, 99, 82],
    success: [37, 169, 90],
    successBg: [222, 243, 231],
    warning: [180, 83, 9],
    warningBg: [253, 237, 214],
    shadow: [222, 217, 207],
  };

  const generatePdf = async (mode = 'download') => {
    const it = interventions.find((i) => i.id === pdfIntervId);
    if (!it) return;
    const client = clients.find((c) => c.id === it.clientId);
    const { title, conclusion } = pdfDraft;

    setInterventions((prev) => prev.map((i) => (i.id === it.id ? { ...i, title, conclusion } : i)));

    setPdfGenerating(true);
    try {
      const { jsPDF } = await import('jspdf');

      // Preload every image used in the PDF up front (logo + all photos), so drawing below
      // can read real dimensions instead of guessing/forcing a square.
      const allPhotoUrls = (it.photos || []).map((p) => p.url).filter(Boolean);
      const urlsToLoad = [...new Set([...(artisan.logo ? [artisan.logo] : []), ...allPhotoUrls])];
      const loadedPairs = await Promise.all(urlsToLoad.map(async (url) => [url, await loadImageEl(url)]));
      const imageCache = new Map(loadedPairs);

      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const PAGE_W = doc.internal.pageSize.getWidth();
      const PAGE_H = doc.internal.pageSize.getHeight();
      const MARGIN = 42;
      const CONTENT_W = PAGE_W - MARGIN * 2;
      const CONTENT_TOP = 48;
      const BOTTOM_LIMIT = PAGE_H - 66;

      const checkBreak = (yPos, needed) => {
        if (yPos + needed > BOTTOM_LIMIT) { doc.addPage(); return CONTENT_TOP; }
        return yPos;
      };

      const drawStatusPill = (rightX, topY, status) => {
        const isDone = status === 'termine';
        const label = isDone ? 'TERMINÉ' : 'EN COURS';
        const ink = isDone ? PDF_COLOR.success : PDF_COLOR.warning;
        const bg = isDone ? PDF_COLOR.successBg : PDF_COLOR.warningBg;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
        const pillW = doc.getTextWidth(label) + 16;
        const pillH = 16;
        doc.setFillColor(...bg);
        doc.roundedRect(rightX - pillW, topY, pillW, pillH, pillH / 2, pillH / 2, 'F');
        doc.setTextColor(...ink);
        doc.text(label, rightX - pillW / 2, topY + pillH / 2 + 2.8, { align: 'center' });
        doc.setTextColor(...PDF_COLOR.text);
      };

      const drawZoneHeader = (yPos, label) => {
        yPos = checkBreak(yPos, 30);
        doc.setFillColor(...PDF_COLOR.navy);
        doc.roundedRect(MARGIN, yPos, CONTENT_W, 22, 4, 4, 'F');
        doc.setTextColor(...PDF_COLOR.cream);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
        doc.text(label.toUpperCase(), MARGIN + 10, yPos + 14.5);
        doc.setTextColor(...PDF_COLOR.text);
        return yPos + 22 + 12;
      };

      const drawTask = (yPos, text) => {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
        const lines = doc.splitTextToSize(text, CONTENT_W - 20);
        yPos = checkBreak(yPos, lines.length * 13 + 6);
        doc.setFillColor(...PDF_COLOR.navy);
        doc.circle(MARGIN + 5, yPos - 3, 1.8, 'F');
        doc.setTextColor(...PDF_COLOR.text);
        doc.text(lines, MARGIN + 16, yPos);
        return yPos + lines.length * 13 + 6;
      };

      const drawParagraph = (yPos, text) => {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
        doc.setTextColor(...PDF_COLOR.text);
        const lines = doc.splitTextToSize(text, CONTENT_W);
        yPos = checkBreak(yPos, lines.length * 13);
        doc.text(lines, MARGIN, yPos);
        return yPos + lines.length * 13 + 10;
      };

      // Photo grid with a subtle drop-shadow + thin border for a "card" feel, wrapping to a
      // new row (and new page if needed) — never stretches a photo out of its aspect ratio.
      const drawPhotoGrid = (yPos, photos, boxSize) => {
        const usableW = CONTENT_W - 16;
        const perRow = Math.max(1, Math.floor((usableW + 10) / (boxSize + 10)));
        let col = 0, rowMaxH = 0, x = MARGIN + 16;
        photos.forEach((p) => {
          const img = imageCache.get(p.url);
          if (!img) return;
          if (col === perRow) { yPos += rowMaxH + 10; col = 0; x = MARGIN + 16; rowMaxH = 0; }
          yPos = checkBreak(yPos, boxSize + 10);
          const { w, h } = fitBox(img, boxSize, boxSize);
          try {
            doc.setFillColor(...PDF_COLOR.shadow);
            doc.rect(x + 2, yPos + 2, w, h, 'F');
            doc.addImage(img, detectImageFormat(p.url), x, yPos, w, h);
            doc.setDrawColor(...PDF_COLOR.divider);
            doc.setLineWidth(0.75);
            doc.rect(x, yPos, w, h, 'S');
          } catch (e) { /* skip */ }
          rowMaxH = Math.max(rowMaxH, h);
          x += boxSize + 10;
          col++;
        });
        return yPos + rowMaxH + 14;
      };

      // ═══════ Header band ═══════
      doc.setFillColor(...PDF_COLOR.navy);
      doc.rect(0, 0, PAGE_W, 94, 'F');

      const logoImg = artisan.logo && imageCache.get(artisan.logo);
      let textX = MARGIN;
      if (logoImg) {
        const box = 54;
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(MARGIN, 20, box, box, 8, 8, 'F');
        textX = MARGIN + box + 14; // reserve the space even if the image itself fails to draw
        try {
          const { w, h } = fitBox(logoImg, box, box);
          doc.addImage(logoImg, detectImageFormat(artisan.logo), MARGIN + (box - w) / 2, 20 + (box - h) / 2, w, h);
        } catch (e) { /* white backing plate stays empty, layout is unaffected */ }
      }
      doc.setTextColor(...PDF_COLOR.cream);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
      doc.text(artisan.company || "ChantierExpress", textX, 40);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
      doc.setTextColor(205, 211, 224);
      const line1 = [artisan.contact, artisan.job].filter(Boolean).join(' · ');
      const line2 = [artisan.phone, artisan.email].filter(Boolean).join(' · ');
      if (line1) doc.text(line1, textX, 54);
      if (line2) doc.text(line2, textX, 65);
      if (artisan.address) doc.text(artisan.address, textX, 76);

      doc.setTextColor(...PDF_COLOR.cream);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
      doc.text((title || "Rapport d'intervention").toUpperCase(), PAGE_W - MARGIN, 40, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
      doc.setTextColor(205, 211, 224);
      const dateStr = new Date(it.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
      doc.text(`${dateStr} à ${it.time}`, PAGE_W - MARGIN, 54, { align: 'right' });

      let y = 94 + 26;

      // ═══════ Client card ═══════
      const clientSub = [client?.company, client?.address].filter(Boolean).join(' · ');
      const cardH = clientSub ? 56 : 42;
      doc.setFillColor(...PDF_COLOR.card);
      doc.roundedRect(MARGIN, y, CONTENT_W, cardH, 6, 6, 'F');
      doc.setTextColor(...PDF_COLOR.text);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5);
      doc.text(client ? client.name : 'Client inconnu', MARGIN + 14, y + 22);
      if (clientSub) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
        doc.setTextColor(...PDF_COLOR.muted);
        doc.text(clientSub, MARGIN + 14, y + 37);
      }
      drawStatusPill(PAGE_W - MARGIN - 14, y + (cardH - 16) / 2, it.status);
      y += cardH + 22;

      // ═══════ Content: zones/tasks or flat description ═══════
      const referencedPhotoIdx = new Set();
      const zones = it.structuredReport?.zones?.filter((z) => z.tasks && z.tasks.length > 0);
      if (zones && zones.length > 0) {
        zones.forEach((zone) => {
          y = drawZoneHeader(y, zone.title);
          zone.tasks.forEach((task) => {
            y = drawTask(y, task.text);
            const taskPhotos = (task.photos || [])
              .map((n) => {
                referencedPhotoIdx.add(n);
                return it.photos && it.photos[n - 1];
              })
              .filter((p) => p && p.url && imageCache.get(p.url));
            if (taskPhotos.length > 0) y = drawPhotoGrid(y, taskPhotos, 118);
            y += 2;
          });
          y += 8;
        });
        // Photos non référencées (photothèque hors dictée, etc.)
        const orphanPhotos = (it.photos || [])
          .map((p, idx) => ({ p, n: idx + 1 }))
          .filter(({ p, n }) => p.url && imageCache.get(p.url) && !referencedPhotoIdx.has(n))
          .map(({ p }) => p);
        if (orphanPhotos.length > 0) {
          y = drawZoneHeader(y, 'Photos');
          y = drawPhotoGrid(y, orphanPhotos, 118);
        }
      } else {
        y = drawZoneHeader(y, 'Description des travaux');
        const cleanDescription = (it.description || '').replace(PHOTO_MARKER_REGEX, '').replace(/\s{2,}/g, ' ').trim();
        y = drawParagraph(y, cleanDescription);
        const realPhotos = (it.photos || []).filter((p) => p.url && imageCache.get(p.url));
        if (realPhotos.length) y = drawPhotoGrid(y, realPhotos, 150);
      }

      // ═══════ Conclusion ═══════
      if (conclusion && conclusion.trim()) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
        const clines = doc.splitTextToSize(conclusion, CONTENT_W - 28);
        const boxH = clines.length * 13 + 34;
        y = checkBreak(y, boxH);
        doc.setFillColor(...PDF_COLOR.card);
        doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 6, 6, 'F');
        doc.setTextColor(...PDF_COLOR.navy);
        doc.text('CONCLUSION', MARGIN + 14, y + 18);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
        doc.setTextColor(...PDF_COLOR.text);
        doc.text(clines, MARGIN + 14, y + 34);
        y += boxH + 10;
      }

      // ═══════ Footer (every page) ═══════
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setDrawColor(...PDF_COLOR.divider);
        doc.setLineWidth(0.5);
        doc.line(MARGIN, PAGE_H - 34, PAGE_W - MARGIN, PAGE_H - 34);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
        doc.setTextColor(...PDF_COLOR.muted);
        doc.text('ChantierExpress', MARGIN, PAGE_H - 22);
        doc.text(`Page ${i} / ${pageCount}`, PAGE_W - MARGIN, PAGE_H - 22, { align: 'right' });
      }

      const fname = `rapport-${(client ? client.name : 'client').replace(/\s+/g, '-').toLowerCase()}-${it.date.slice(0, 10)}.pdf`;
      const blob = doc.output('blob');
      const pdfFile = new File([blob], fname, { type: 'application/pdf' });
      const shareText = buildShareText({ ...it, title, conclusion });

      if (mode === 'share') {
        try {
          if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
            await navigator.share({ files: [pdfFile], title: title || "Rapport d'intervention", text: shareText });
            showToast('PDF partagé');
            setPdfModalOpen(false);
            return;
          }
        } catch (err) {
          if (err?.name === 'AbortError') return;
          console.error(err);
        }
        // Pas de partage fichier (souvent iOS) : enregistrer le PDF + ouvrir WhatsApp avec le texte.
        // Évite le share sheet qui n'ouvre pas WhatsApp directement.
        doc.save(fname);
        const waUrl = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(shareText);
        window.open(waUrl, '_self');
        showToast('PDF enregistré — WhatsApp ouvert');
        setPdfModalOpen(false);
        return;
      }

      doc.save(fname);
      showToast('PDF enregistré');
      setPdfModalOpen(false);
    } finally {
      setPdfGenerating(false);
    }
  };

  // ---- Share ----
  const buildShareText = (it) => {
    const client = clients.find((c) => c.id === it.clientId);
    const dateStr = new Date(it.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    const cleanDescription = (it.description || '').replace(PHOTO_MARKER_REGEX, '').replace(/\s{2,}/g, ' ').trim();
    return `Rapport d'intervention — ${client ? client.name : ''}\n${dateStr} à ${it.time} (${it.status === 'termine' ? 'Terminé' : 'En cours'})\n\n${cleanDescription}`;
  };

  // Deep-link WhatsApp (pas le share sheet). Sur iOS Safari/PWA, navigator.share
  // n'ouvre jamais WhatsApp directement ; api.whatsapp.com + navigation _self oui.
  // Doit rester synchrone au clic (pas d'await avant) sinon iOS bloque le handoff.
  const openWhatsApp = (text) => {
    const url = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(text);
    window.open(url, '_self');
  };

  const shareIntervention = (id) => {
    const it = interventions.find((i) => i.id === id);
    if (!it) return;
    openWhatsApp(buildShareText(it));
  };

  // ---- Derived render data ----
  const TAB_TITLES = { journal: 'Journal de chantier', clients: 'Annuaire Clients', profil: 'Profil Artisan', guide: 'Guide & Aide' };
  const artisanInitial = (artisan.company || artisan.contact || 'C').trim().charAt(0).toUpperCase();
  const pendingInterventions = interventions.filter((i) => i.status === 'encours');

  const dateLabelFor = (dateIso) => {
    const d = new Date(dateIso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
    const yest = new Date(today); yest.setDate(yest.getDate() - 1);
    if (d.toDateString() === yest.toDateString()) return 'Hier';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  };

  const journalGroups = (() => {
    const map = new Map();
    interventions.forEach((it) => {
      const key = it.clientId || '__orphan__';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    });
    return [...map.entries()].map(([clientId, items]) => {
      const client = clients.find((c) => c.id === clientId);
      const sorted = [...items].sort((a, b) => new Date(b.date) - new Date(a.date));
      return {
        clientId,
        client,
        name: client ? client.name : 'Client supprimé',
        subline: client ? [client.company, client.phone].filter(Boolean).join(' · ') : '',
        items: sorted,
        latest: sorted[0]?.date
      };
    }).sort((a, b) => new Date(b.latest) - new Date(a.latest));
  })();

  const clientHistory = clientDraft.id
    ? interventions
      .filter((i) => i.clientId === clientDraft.id)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
    : [];

  const renderInterventionCard = (it) => (
    <div key={it.id} className="intervention-card">
      <div className="intervention-card-body">
        <div className="intervention-card-head">
          <div>
            <div className="intervention-card-date">{dateLabelFor(it.date)} · {it.time}</div>
          </div>
          <span className={`tag ${it.status === 'termine' ? 'tag-accent' : 'tag-neutral'}`}>
            {it.status === 'termine' ? 'Terminé' : 'En cours'}
          </span>
        </div>
        <p className="intervention-card-desc">{(it.description || '').replace(PHOTO_MARKER_REGEX, '').replace(/\s{2,}/g, ' ').trim()}</p>
      </div>

      {(it.photos || []).length > 0 && (
        <div className="intervention-card-photos">
          {it.photos.map((p) => (
            p.url
              ? <img key={p.id} src={p.url} alt="Chantier" className="intervention-card-photo" />
              : <div key={p.id} className="intervention-card-photo photo-placeholder"><Camera size={18} /></div>
          ))}
        </div>
      )}

      <div className="intervention-card-footer">
        <button type="button" className="intervention-card-action primary" onClick={() => openPdfModal(it.id)}>
          <FileText size={17} /><span>PDF</span>
        </button>
        <button type="button" className="intervention-card-action whatsapp" onClick={() => shareIntervention(it.id)}>
          <Share2 size={17} /><span>WhatsApp</span>
        </button>
        <div className="intervention-card-menu-wrap">
          <button
            type="button"
            className="intervention-card-action"
            aria-label="Plus d'actions"
            onClick={() => setCardMenuOpenId((id) => (id === it.id ? null : it.id))}
          >
            <MoreHorizontal size={17} /><span>Plus</span>
          </button>
          {cardMenuOpenId === it.id && (
            <div className="intervention-card-menu">
              <button
                type="button"
                className="intervention-card-menu-item"
                onClick={() => { setCardMenuOpenId(null); openInterventionEdit(it.id); }}
              >
                <Edit2 size={15} /> Modifier
              </button>
              <button
                type="button"
                className="intervention-card-menu-item danger"
                onClick={() => { setCardMenuOpenId(null); deleteIntervention(it.id); }}
              >
                <Trash2 size={15} /> Supprimer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="phone-shell">
      {/* ═══════════════ HEADER ═══════════════ */}
      <header className="app-header">
        {artisan.logo ? (
          <img src={artisan.logo} alt="Logo" className="header-avatar" />
        ) : (
          <div className="header-avatar header-avatar-fallback">{artisanInitial}</div>
        )}
        <div className="header-titles">
          <div className="header-title">{TAB_TITLES[tab]}</div>
          <div className="header-subtitle">{artisan.company || artisan.contact || ''}</div>
        </div>
        <div className={`offline-badge ${isOnline ? 'online' : 'offline'}`} title={isOnline ? 'En ligne — données aussi en local' : 'Hors-ligne — données locales'}>
          {isOnline ? 'Local' : 'Hors-ligne'}
        </div>
        <div style={{ position: 'relative' }} ref={notificationsPopoverRef}>
          <button
            className={`icon-btn ${showNotificationsPopover ? 'active' : ''}`}
            onClick={() => setShowNotificationsPopover((v) => !v)}
            title="Notifications"
            style={{ position: 'relative' }}
          >
            <Bell size={18} />
            {pendingInterventions.length > 0 && <span className="notification-badge">{pendingInterventions.length}</span>}
          </button>
          {showNotificationsPopover && (
            <div className="notification-popover">
              <div className="notification-popover-header">
                <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Notifications</span>
                <button className="text-link-btn" onClick={() => setShowNotificationsPopover(false)}>Fermer</button>
              </div>
              {notificationStatus !== 'granted' && (
                <div style={{ padding: 10, background: 'var(--color-accent-100)', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Activer les rappels quotidiens de 17h30 ?</span>
                  <button className="btn btn-primary" style={{ padding: '6px 10px', fontSize: '0.75rem' }} onClick={requestNotificationPermission}>Activer</button>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-neutral-700)' }}>Chantiers à finaliser :</span>
                {pendingInterventions.length === 0 ? (
                  <div style={{ padding: 8, textAlign: 'center', fontSize: '0.78rem', color: 'var(--color-neutral-600)' }}>Tous les chantiers sont terminés !</div>
                ) : pendingInterventions.map((item) => {
                  const client = clients.find((c) => c.id === item.clientId);
                  return (
                    <div key={item.id} className="notification-item" style={{ cursor: 'pointer' }} onClick={() => { openInterventionEdit(item.id); setShowNotificationsPopover(false); }}>
                      <span className="notification-item-title">{client ? client.name : 'Client inconnu'}</span>
                      <span className="notification-item-desc">Dicté à {item.time} — appuie pour compléter.</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Clés API : plus de bannière rouge en tête — toast au moment d'utiliser Dicter/Optimiser */}

      {/* ═══════════════ INSTALL BANNER ═══════════════ */}
      {showInstallBanner && !isStandalone && (
        <div className="install-banner">
          <Download size={20} />
          <div className="install-banner-text">Installe l'app sur ton écran d'accueil pour l'utiliser hors-ligne, même sans réseau chantier.</div>
          <button className="install-banner-btn" onClick={installApp}>Installer</button>
          <button className="install-banner-close" onClick={dismissInstall} aria-label="Fermer"><X size={16} /></button>
        </div>
      )}

      {/* ═══════════════ MAIN CONTENT ═══════════════ */}
      <main className="app-main">
        {/* ---------- TAB: JOURNAL ---------- */}
        {tab === 'journal' && (
          <div>
            {pendingInterventions.length > 0 ? (
              <button
                type="button"
                className="journal-pending-strip"
                onClick={() => {
                  const first = pendingInterventions[0];
                  const cid = first.clientId || '__orphan__';
                  setExpandedJournalClients((prev) => new Set([...prev, cid]));
                  openInterventionEdit(first.id);
                }}
              >
                <span className="journal-pending-count">{pendingInterventions.length}</span>
                <span className="journal-pending-text">
                  {pendingInterventions.length === 1
                    ? 'chantier à finaliser — reprendre'
                    : 'chantiers à finaliser — reprendre le plus récent'}
                </span>
                <ChevronRight size={18} />
              </button>
            ) : interventions.length > 0 ? (
              <div className="journal-pending-strip done">
                <Check size={16} />
                <span className="journal-pending-text">Tous les chantiers sont terminés</span>
              </div>
            ) : null}

            <button className="btn btn-primary btn-block" onClick={openNewIntervention} style={{ minHeight: 52, fontSize: 14, marginBottom: 22 }}>
              <Plus size={18} strokeWidth={2.4} /> Nouvelle Fiche
            </button>

            {journalGroups.length > 0 ? (
              <div className="journal-client-groups">
                {journalGroups.map((group) => {
                  const expanded = expandedJournalClients.has(group.clientId);
                  return (
                    <div key={group.clientId} className={`journal-client-group ${expanded ? 'expanded' : ''}`}>
                      <button
                        type="button"
                        className="journal-client-header"
                        onClick={() => toggleJournalClient(group.clientId)}
                      >
                        <div className="client-row-avatar">{(group.name || '?').trim().charAt(0).toUpperCase()}</div>
                        <div className="client-row-info">
                          <div className="client-row-name">{group.name}</div>
                          <div className="client-row-subline">
                            {group.items.length} compte-rendu{group.items.length > 1 ? 's' : ''}
                            {group.subline ? ` · ${group.subline}` : ''}
                          </div>
                        </div>
                        {expanded ? <ChevronDown size={18} className="client-row-chevron" /> : <ChevronRight size={18} className="client-row-chevron" />}
                      </button>
                      {expanded && (
                        <div className="intervention-list journal-client-crs">
                          {group.items.map((it) => renderInterventionCard(it))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                <h4>Aucune fiche pour l'instant</h4>
                <p className="empty-state-sub">Crée ta première fiche d'intervention en 4 étapes.</p>
                <div className="empty-state-steps">
                  {[
                    ['1', 'Choisir un client', "Sélectionne une fiche dans l'annuaire, ou crée-la à la volée."],
                    ['2', "Dicter l'intervention", 'Appuie sur le micro et décris les travaux à voix haute.'],
                    ['3', 'Optimiser le texte', 'Notre outil structure ta description en tâches claires.'],
                    ['4', 'Générer le PDF', 'Exporte ou partage le rapport en un geste.'],
                  ].map(([num, title, desc]) => (
                    <div className="empty-state-step" key={num}>
                      <div className="empty-state-step-num">{num}</div>
                      <div>
                        <div className="empty-state-step-title">{title}</div>
                        <div className="empty-state-step-desc">{desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---------- TAB: CLIENTS ---------- */}
        {tab === 'clients' && (
          <div>
            <button className="btn btn-primary btn-block" onClick={openNewClient} style={{ minHeight: 52, fontSize: 14, marginBottom: 20 }}>
              <Plus size={18} strokeWidth={2.4} /> Nouveau Client
            </button>
            <div className="client-list">
              {clients.map((c) => (
                <button key={c.id} className="client-row" onClick={() => openClientEdit(c.id)}>
                  <div className="client-row-avatar">{(c.name || '?').trim().charAt(0).toUpperCase()}</div>
                  <div className="client-row-info">
                    <div className="client-row-name">{c.name}</div>
                    <div className="client-row-subline">{[c.company, c.phone].filter(Boolean).join(' · ') || 'Aucun détail'}</div>
                  </div>
                  <ChevronRight size={16} className="client-row-chevron" />
                </button>
              ))}
            </div>
            {clients.length === 0 && (
              <div className="empty-state">
                <h4>Aucun client pour l'instant</h4>
                <p className="empty-state-sub">Ajoute ton premier client pour rattacher les comptes rendus.</p>
                <button className="btn btn-primary" onClick={openNewClient} style={{ minHeight: 48 }}>
                  <Plus size={16} /> Nouveau Client
                </button>
              </div>
            )}
          </div>
        )}

        {/* ---------- TAB: PROFIL ---------- */}
        {tab === 'profil' && (
          <div>
            <div className="profil-header">
              <label style={{ cursor: 'pointer', flexShrink: 0 }}>
                {artisan.logo ? (
                  <img src={artisan.logo} alt="Logo" className="profil-avatar" />
                ) : (
                  <div className="profil-avatar profil-avatar-fallback"><Camera size={22} /></div>
                )}
                <input type="file" accept="image/*" onChange={onLogoChange} style={{ display: 'none' }} />
              </label>
              <div>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14 }}>Logo entreprise</div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>Apparaît en en-tête de chaque PDF</div>
              </div>
            </div>

            <div className="profil-fields">
              <div className="field"><label>Nom entreprise</label><input className="input" value={artisan.company} onChange={(e) => setArtisanField('company', e.target.value)} /></div>
              <div className="field"><label>Nom du contact</label><input className="input" value={artisan.contact} onChange={(e) => setArtisanField('contact', e.target.value)} /></div>
              <div className="field"><label>Métier / spécialité</label><input className="input" value={artisan.job} onChange={(e) => setArtisanField('job', e.target.value)} /></div>
              <div className="field"><label>Téléphone</label><input className="input" value={artisan.phone} onChange={(e) => setArtisanField('phone', e.target.value)} /></div>
              <div className="field"><label>Email</label><input className="input" value={artisan.email} onChange={(e) => setArtisanField('email', e.target.value)} /></div>
              <div className="field"><label>Adresse professionnelle</label><textarea className="input" style={{ minHeight: 64 }} value={artisan.address} onChange={(e) => setArtisanField('address', e.target.value)} /></div>
            </div>
            <button className="btn btn-primary btn-block" onClick={saveArtisan} style={{ minHeight: 50, marginTop: 20 }}>
              {artisanSaved ? 'Enregistré ✓' : 'Enregistrer le profil'}
            </button>
          </div>
        )}

        {/* ---------- TAB: GUIDE ---------- */}
        {tab === 'guide' && (
          <div className="guide-list">
            <div className="guide-row">
              <div className="guide-row-head"><Mic size={22} color="var(--color-accent)" /><h4>Dictée vocale</h4></div>
              <p>Appuie sur Dicter pour démarrer, Pause si tu es interrompu, puis Arrêter pour lancer la transcription. Tu peux prendre des photos pendant l'enregistrement.</p>
            </div>
            <div className="guide-row">
              <div className="guide-row-head"><Sparkles size={22} color="var(--color-accent)" /><h4>Optimisation automatique</h4></div>
              <p>Le bouton "Optimiser" reformule ta description dictée en tâches claires, groupées par pièce, prêtes à être lues par le client.</p>
            </div>
            <div className="guide-row">
              <div className="guide-row-head"><FileText size={22} color="var(--color-accent)" /><h4>PDF & partage</h4></div>
              <p>Relis et édite le rapport, télécharge le PDF ou partage-le (fichier réel, pas un lien) — tout fonctionne hors-ligne.</p>
            </div>
          </div>
        )}
      </main>

      {/* ═══════════════ BOTTOM NAV ═══════════════ */}
      <nav className="bottom-nav">
        <button className={`nav-btn ${tab === 'journal' ? 'active' : ''}`} onClick={() => goTab('journal')}>
          <Home size={21} /><span>Journal</span>
        </button>
        <button className={`nav-btn ${tab === 'clients' ? 'active' : ''}`} onClick={() => goTab('clients')}>
          <Users size={21} /><span>Clients</span>
        </button>
        <button className={`nav-mic-btn ${isRecording ? 'recording' : ''}`} onClick={openQuickDictation} aria-label="Dicter une nouvelle intervention">
          {isRecording ? <MicOff size={24} /> : <Mic size={24} />}
        </button>
        <button className={`nav-btn ${tab === 'guide' ? 'active' : ''}`} onClick={() => goTab('guide')}>
          <BookOpen size={21} /><span>Guide</span>
        </button>
        <button className={`nav-btn ${tab === 'profil' ? 'active' : ''}`} onClick={() => goTab('profil')}>
          <User size={21} /><span>Profil</span>
        </button>
      </nav>

      {/* ═══════════════ MODAL: NEW/EDIT INTERVENTION ═══════════════ */}
      {interventionModalOpen && (
        <div className="dialog-backdrop">
          <div className="dialog">
            <div className="dialog-head">
              <div className="dialog-title">{draft.id ? 'Modifier la fiche' : "Nouvelle fiche d'intervention"}</div>
              <button className="dialog-close" onClick={closeInterventionModal}><X size={20} /></button>
            </div>

            <div className="field">
              <label>Description de l'intervention</label>
              <textarea
                className="input" style={{ minHeight: 130 }}
                placeholder="Dicte ou saisis les travaux réalisés…"
                value={draft.description}
                onChange={(e) => setDraftField('description', e.target.value)}
              />
              {(isRecording || isTranscribing) && (
                <div className={`recording-indicator ${isPaused ? 'paused' : ''}`}>
                  {isRecording && !isPaused ? (
                    <div className="waveform" aria-hidden="true">
                      {waveLevels.map((lvl, i) => (
                        <span key={i} className="waveform-bar" style={{ height: `${6 + lvl * 18}px` }} />
                      ))}
                    </div>
                  ) : (
                    <span className={`recording-dot ${isPaused ? 'paused' : ''}`}></span>
                  )}
                  {isTranscribing
                    ? 'Transcription en cours…'
                    : isPaused
                      ? 'En pause — appuie sur Reprendre pour continuer'
                      : "Enregistrement en cours — tu peux prendre des photos sans l'interrompre"}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {!isRecording ? (
                  <button className="btn btn-secondary" style={{ flex: 1, minHeight: 48 }} onClick={startDictation} disabled={isTranscribing}>
                    <Mic size={16} />
                    &nbsp;{isTranscribing ? 'Transcription…' : 'Dicter'}
                  </button>
                ) : (
                  <>
                    <button className="btn btn-secondary" style={{ flex: 1, minHeight: 48 }} onClick={isPaused ? resumeDictation : pauseDictation} disabled={isTranscribing}>
                      {isPaused ? <Play size={16} /> : <Pause size={16} />}
                      &nbsp;{isPaused ? 'Reprendre' : 'Pause'}
                    </button>
                    <button className="btn btn-secondary" style={{ flex: 1, minHeight: 48 }} onClick={stopDictation} disabled={isTranscribing}>
                      <MicOff size={16} />
                      &nbsp;Arrêter
                    </button>
                  </>
                )}
                <button className="btn btn-ai" style={{ flex: 1, minHeight: 48 }} onClick={optimizeText} disabled={isOptimizing || !draft.description.trim()}>
                  <Sparkles size={16} />&nbsp;{isOptimizing ? 'Optimisation…' : 'Optimiser'}
                </button>
              </div>
              <p className="form-hint sheet-tip">Optimiser regroupe ta dictée par pièce (cuisine, SDB…) pour le PDF client.</p>
            </div>

            <div className="field">
              <label>Photos de chantier</label>
              <div className="photo-grid">
                {draft.photos.map((p) => (
                  <div key={p.id} className="photo-thumb">
                    {p.url
                      ? <img src={p.url} alt="Preview" />
                      : <div className="photo-thumb photo-placeholder" style={{ width: 64, height: 64 }}><Camera size={20} /></div>}
                    <button className="photo-thumb-remove" onClick={() => removePhoto(p.id)}><X size={11} /></button>
                  </div>
                ))}
                <label className="photo-add-btn" title="Prendre une photo">
                  <Camera size={20} />
                  <span className="photo-add-label">Photo</span>
                  <input type="file" accept="image/*" capture="environment" onChange={onPhotosChange} style={{ display: 'none' }} />
                </label>
                <label className="photo-add-btn" title="Choisir depuis la bibliothèque">
                  <Images size={20} />
                  <span className="photo-add-label">Galerie</span>
                  <input type="file" accept="image/*" multiple onChange={onPhotosChange} style={{ display: 'none' }} />
                </label>
              </div>
            </div>

            <div className="field">
              <label>Client</label>
              <div className="client-combobox" ref={clientPickerRef}>
                <div className="client-combobox-input-wrap">
                  <Search size={16} className="client-combobox-search-icon" />
                  <input
                    className="input client-combobox-input"
                    placeholder="Rechercher un client…"
                    value={clientQuery}
                    onChange={(e) => {
                      const value = e.target.value;
                      setClientQuery(value);
                      setClientPickerOpen(true);
                      // Ne clear le clientId que si la saisie ne correspond plus au client sélectionné
                      // (évite de perdre la sélection en corrigeant une lettre).
                      if (draft.clientId) {
                        const selected = clients.find((c) => c.id === draft.clientId);
                        const name = (selected?.name || '').toLowerCase();
                        const q = value.trim().toLowerCase();
                        if (q && !name.startsWith(q) && !name.includes(q)) {
                          setDraftField('clientId', '');
                        }
                      }
                    }}
                    onFocus={() => setClientPickerOpen(true)}
                    autoComplete="off"
                  />
                </div>
                {clientPickerOpen && (
                  <div className="client-combobox-dropdown">
                    {filteredClientsForPicker.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        className={`client-combobox-option ${draft.clientId === c.id ? 'selected' : ''}`}
                        onClick={() => selectClientForDraft(c)}
                      >
                        <span className="client-combobox-option-name">{c.name}</span>
                        {(c.company || c.phone) && (
                          <span className="client-combobox-option-sub">{[c.company, c.phone].filter(Boolean).join(' · ')}</span>
                        )}
                      </button>
                    ))}
                    {filteredClientsForPicker.length === 0 && (
                      <div className="client-combobox-empty">Aucun client trouvé</div>
                    )}
                    <button
                      type="button"
                      className="client-combobox-option new"
                      onClick={() => { setClientPickerOpen(false); openNewClient(); }}
                    >
                      <Plus size={15} /> Nouveau client
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="field">
              <label>Statut</label>
              <div className="seg">
                <label className={`seg-opt ${draft.status === 'encours' ? 'active' : ''}`}>
                  <input type="radio" name="status" checked={draft.status === 'encours'} onChange={() => setDraftField('status', 'encours')} />En cours
                </label>
                <label className={`seg-opt ${draft.status === 'termine' ? 'active' : ''}`}>
                  <input type="radio" name="status" checked={draft.status === 'termine'} onChange={() => setDraftField('status', 'termine')} />Terminé
                </label>
              </div>
            </div>

            <div className="dialog-actions" style={{ flexDirection: 'column', gap: 8 }}>
              {(!draft.clientId || !draft.description.trim()) && (
                <p className="form-hint">
                  {!draft.clientId && !draft.description.trim()
                    ? 'Dicte ou saisis une description, puis rattache un client pour enregistrer.'
                    : !draft.clientId
                      ? 'Rattache un client pour enregistrer la fiche.'
                      : 'Ajoute une description (dicte ou saisis) pour enregistrer.'}
                </p>
              )}
              <button className="btn btn-primary btn-block" onClick={saveIntervention} disabled={!draft.clientId || !draft.description.trim()} style={{ minHeight: 52 }}>
                Enregistrer la fiche
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ MODAL: CLIENT ═══════════════ */}
      {clientModalOpen && (
        <div className="dialog-backdrop centered">
          <div className="dialog dialog-client-fiche">
            <div className="dialog-head">
              <div className="dialog-title">{clientDraft.id ? 'Fiche client' : 'Nouveau client'}</div>
              <button className="dialog-close" onClick={closeClientModal}><X size={20} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field"><label>Nom</label><input className="input" value={clientDraft.name} onChange={(e) => setClientField('name', e.target.value)} /></div>
              <div className="field"><label>Société (optionnel)</label><input className="input" value={clientDraft.company} onChange={(e) => setClientField('company', e.target.value)} /></div>
              <div className="field"><label>Téléphone</label><input className="input" value={clientDraft.phone} onChange={(e) => setClientField('phone', e.target.value)} /></div>
              <div className="field"><label>Email</label><input className="input" value={clientDraft.email} onChange={(e) => setClientField('email', e.target.value)} /></div>
              <div className="field"><label>Adresse</label><textarea className="input" style={{ minHeight: 60 }} value={clientDraft.address} onChange={(e) => setClientField('address', e.target.value)} /></div>
            </div>

            {clientDraft.id && (
              <div className="client-history">
                <div className="client-history-head">
                  <h4>Historique des comptes rendus</h4>
                  <button type="button" className="btn btn-secondary" style={{ minHeight: 36, fontSize: 12, padding: '0 12px' }} onClick={openNewInterventionFromClient}>
                    <Plus size={14} /> Nouvelle fiche
                  </button>
                </div>
                {clientHistory.length === 0 ? (
                  <p className="client-history-empty">Aucun compte rendu pour ce client.</p>
                ) : (
                  <div className="client-history-list">
                    {clientHistory.map((it) => (
                      <button
                        type="button"
                        key={it.id}
                        className="client-history-row"
                        onClick={() => openInterventionEdit(it.id)}
                      >
                        <div>
                          <div className="client-history-row-date">{dateLabelFor(it.date)} · {it.time}</div>
                          <div className="client-history-row-desc">
                            {(it.description || '').replace(PHOTO_MARKER_REGEX, '').replace(/\s{2,}/g, ' ').trim().slice(0, 90) || 'Sans description'}
                            {(it.description || '').length > 90 ? '…' : ''}
                          </div>
                        </div>
                        <span className={`tag ${it.status === 'termine' ? 'tag-accent' : 'tag-neutral'}`}>
                          {it.status === 'termine' ? 'Terminé' : 'En cours'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="dialog-actions" style={{ justifyContent: 'space-between' }}>
              {clientDraft.id ? (
                <button className="text-link-btn danger" onClick={deleteClientDraft}>Supprimer</button>
              ) : <span />}
              <button className="btn btn-primary" onClick={saveClientDraft} disabled={!clientDraft.name.trim()} style={{ minHeight: 44 }}>
                <Check size={16} /> Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ MODAL: PDF PREVIEW / EXPORT ═══════════════ */}
      {pdfModalOpen && pdfIntervId && (() => {
        const it = interventions.find((i) => i.id === pdfIntervId);
        const client = it ? clients.find((c) => c.id === it.clientId) : null;
        return (
          <div className="dialog-backdrop">
            <div className="dialog">
              <div className="dialog-head">
                <div className="dialog-title">Aperçu du rapport</div>
                <button className="dialog-close" onClick={closePdfModal}><X size={20} /></button>
              </div>
              <div className="field"><label>Titre du rapport</label><input className="input" value={pdfDraft.title} onChange={(e) => setPdfDraft((d) => ({ ...d, title: e.target.value }))} /></div>
              <div className="pdf-preview-box">
                <div className="pdf-preview-client">{client ? client.name : ''}</div>
                <div className="pdf-preview-meta">
                  {it && new Date(it.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })} · {it && (it.status === 'termine' ? 'Terminé' : 'En cours')}
                </div>
                {(() => {
                  const zones = it?.structuredReport?.zones?.filter((z) => z.tasks && z.tasks.length > 0);
                  if (zones && zones.length > 0) {
                    return (
                      <div className="pdf-preview-structured">
                        {zones.map((zone, zi) => (
                          <div key={zi} className="pdf-preview-zone">
                            <div className="pdf-preview-zone-title">{zone.title}</div>
                            <ul>
                              {zone.tasks.map((task, ti) => (
                                <li key={ti}>
                                  {task.text}
                                  {(task.photos || []).length > 0 && (
                                    <span className="pdf-preview-photo-ref"> · Photo{(task.photos.length > 1 ? 's' : '')} {task.photos.join(', ')}</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  const clean = (it?.description || '').replace(PHOTO_MARKER_REGEX, '').replace(/\s{2,}/g, ' ').trim();
                  return (
                    <>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{clean}</div>
                      {clean && (
                        <p className="pdf-preview-hint">Pas encore structuré — utilise Optimiser sur la fiche pour un CR par pièce.</p>
                      )}
                    </>
                  );
                })()}
              </div>
              <div className="field"><label>Conclusion</label><textarea className="input" style={{ minHeight: 70 }} placeholder="Recommandations, points de vigilance…" value={pdfDraft.conclusion} onChange={(e) => setPdfDraft((d) => ({ ...d, conclusion: e.target.value }))} /></div>
              <div className="dialog-actions" style={{ flexDirection: 'column', gap: 8 }}>
                <button className="btn btn-primary btn-block" onClick={() => generatePdf('download')} disabled={pdfGenerating} style={{ minHeight: 52 }}>
                  <Download size={16} />&nbsp;{pdfGenerating ? 'Génération…' : 'Télécharger le PDF'}
                </button>
                <button className="btn btn-secondary btn-block" onClick={() => generatePdf('share')} disabled={pdfGenerating} style={{ minHeight: 52 }}>
                  <Share2 size={16} />&nbsp;{pdfGenerating ? 'Génération…' : 'Partager le PDF'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══════════════ CONFIRM: abandon fiche ═══════════════ */}
      {discardConfirmOpen && (
        <div
          className="dialog-backdrop centered confirm"
          onClick={() => setDiscardConfirmOpen(false)}
        >
          <div
            className="dialog confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="discard-title"
            aria-describedby="discard-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialog-title" id="discard-title">Abandonner cette fiche ?</div>
            <p className="confirm-dialog-body" id="discard-desc">
              Les modifications non enregistrées seront perdues.
            </p>
            <div className="dialog-actions">
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1, minHeight: 48 }}
                onClick={() => setDiscardConfirmOpen(false)}
              >
                Continuer
              </button>
              <button
                type="button"
                className="btn btn-danger"
                style={{ flex: 1, minHeight: 48 }}
                onClick={forceCloseInterventionModal}
              >
                Abandonner
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ TOAST ═══════════════ */}
      {toastMessage && <div className="toast">{toastMessage}</div>}
    </div>
  );
}

export default App;
