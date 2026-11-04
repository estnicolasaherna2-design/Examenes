"use strict";

/* ============================================================
   EXAM LAB
   Motor principal del simulador de exámenes

   Tipos soportados:
   - multiple
   - true-false
   - multiple-select
   - dropdown-group
   - matrix
   - dragdrop
   - dragdrop-code
   - picklist

   Estructura:
   - data/catalog.json
   - data/exams/{EXAM}/metadata.json
   - data/exams/{EXAM}/questions.json
   - data/exams/{EXAM}/case-studies-*.json
   - data/exams/{EXAM}/images/

   Persistencia:
   - examLab.profile
   - examLab.history
   - examLab.settings
   ============================================================ */


/* ============================================================
   1. CONFIGURACIÓN Y ESTADO GLOBAL
   ============================================================ */

const STORAGE_KEYS = {
    profile: "examLab.profile",
    history: "examLab.history",
    settings: "examLab.settings"
};

const DEFAULT_SETTINGS = {
    defaultCount: 10,
    shuffle: true,
    showTimer: false,
    passMark: 70,
    confirmExit: true
};

const DEFAULT_PROFILE = {
    name: "Usuario",
    email: ""
};

const DATA_PATHS = {
    catalog: "data/catalog.json"
};

const CASE_STUDY_CANDIDATES = [
    "case-studies-contoso.json",
    "case-studies-litware.json"
];

const SUPPORTED_QUESTION_TYPES = [
    "multiple",
    "true-false",
    "multiple-select",
    "dropdown-group",
    "matrix",
    "dragdrop",
    "dragdrop-code",
    "picklist"
];

let catalog = [];
let activeExam = null;
let activeMetadata = {};
let activeQuestions = [];
let currentQuestionIndex = 0;

let answers = {};
let examStartedAt = null;
let timerInterval = null;
let elapsedSeconds = 0;

let examSettings = {};
let examWindowMode = false;
let examFinished = false;

let caseStudies = [];
let questionNavigationEnabled = true;

let dragState = {
    source: null,
    itemId: null,
    questionId: null
};


/* ============================================================
   2. UTILIDADES GENERALES
   ============================================================ */

function getElement(id) {
    return document.getElementById(id);
}

function query(selector, parent = document) {
    return parent.querySelector(selector);
}

function queryAll(selector, parent = document) {
    return Array.from(parent.querySelectorAll(selector));
}

function showElement(element) {
    if (element) {
        element.classList.remove("hidden");
    }
}

function hideElement(element) {
    if (element) {
        element.classList.add("hidden");
    }
}

function setText(id, value) {
    const element = getElement(id);

    if (element) {
        element.textContent = value ?? "";
    }
}

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function deepClone(value) {
    if (value === undefined) {
        return undefined;
    }

    return JSON.parse(JSON.stringify(value));
}

function normalizeArray(value) {
    if (Array.isArray(value)) {
        return value;
    }

    if (value === undefined || value === null) {
        return [];
    }

    return [value];
}

function normalizeString(value) {
    return String(value ?? "").trim();
}

function normalizeBoolean(value) {
    if (typeof value === "boolean") {
        return value;
    }

    if (typeof value === "number") {
        return value !== 0;
    }

    const normalized = String(value ?? "")
        .trim()
        .toLowerCase();

    if ([
        "true",
        "1",
        "yes",
        "si",
        "sí",
        "verdadero"
    ].includes(normalized)) {
        return true;
    }

    if ([
        "false",
        "0",
        "no",
        "falso"
    ].includes(normalized)) {
        return false;
    }

    return value;
}

function shuffleArray(items) {
    const result = [...items];

    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        [result[i], result[j]] = [
            result[j],
            result[i]
        ];
    }

    return result;
}

function formatDuration(totalSeconds) {
    const seconds = Math.max(0, Math.floor(totalSeconds));

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
        return [
            String(hours).padStart(2, "0"),
            String(minutes).padStart(2, "0"),
            String(remainingSeconds).padStart(2, "0")
        ].join(":");
    }

    return [
        String(minutes).padStart(2, "0"),
        String(remainingSeconds).padStart(2, "0")
    ].join(":");
}

function formatDate(value) {
    if (!value) {
        return "";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return date.toLocaleString("es-CO", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function safeNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : fallback;
}

function showMessage(message) {
    window.alert(message);
}

function getDataPath(path) {
    return String(path ?? "")
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\/+/, "");
}

function getDirectoryPath(path) {
    const normalized = getDataPath(path);

    const lastSlash = normalized.lastIndexOf("/");

    return lastSlash >= 0
        ? normalized.substring(0, lastSlash + 1)
        : "";
}

function getOptionText(option) {
    if (
        typeof option === "string" ||
        typeof option === "number" ||
        typeof option === "boolean"
    ) {
        return String(option);
    }

    return String(
        option?.text ??
        option?.label ??
        option?.value ??
        option?.name ??
        option?.statement ??
        ""
    );
}

function getOptionValue(option, index) {
    if (
        typeof option === "string" ||
        typeof option === "number" ||
        typeof option === "boolean"
    ) {
        return String(option);
    }

    return String(
        option?.value ??
        option?.id ??
        option?.key ??
        option?.text ??
        option?.label ??
        index
    );
}

function getQuestionId(question, index) {
    return String(
        question?.id ??
        question?.questionId ??
        question?.number ??
        `question-${index + 1}`
    );
}

function getQuestionType(question) {
    const type = normalizeString(question?.type).toLowerCase();

    const aliases = {
        boolean: "true-false",
        truefalse: "true-false",
        true_false: "true-false",
        "multiple-choice": "multiple",
        single: "multiple",
        "single-choice": "multiple",
        multiple_selection: "multiple-select",
        drag: "dragdrop",
        "drag-drop": "dragdrop",
        drag_drop: "dragdrop",
        dragdropcode: "dragdrop-code",
        "drag-drop-code": "dragdrop-code",
        drag_drop_code: "dragdrop-code"
    };

    return aliases[type] ?? type;
}

function getQuestionOptions(question) {
    return normalizeArray(
        question?.options ??
        question?.choices ??
        question?.alternatives
    );
}

function getQuestionText(question) {
    return (
        question?.question ??
        question?.text ??
        question?.prompt ??
        question?.statement ??
        ""
    );
}

function getQuestionExplanation(question) {
    return (
        question?.explanation ??
        question?.rationale ??
        question?.feedback ??
        question?.justification ??
        ""
    );
}

function formatFieldName(value) {
    return String(value)
        .replace(/([A-Z])/g, " $1")
        .replace(/[_-]/g, " ")
        .replace(/^./, character => character.toUpperCase());
}

function isValidPassMark(value) {
    const number = Number(value);

    return Number.isFinite(number) &&
        number >= 0 &&
        number <= 100;
}

function getValidPassMark(value, fallback = DEFAULT_SETTINGS.passMark) {
    const number = Number(value);

    return isValidPassMark(number)
        ? number
        : fallback;
}

function isAbsoluteResourcePath(path) {
    return /^(https?:\/\/|data:|blob:)/i.test(
        String(path ?? "").trim()
    );
}


/* ============================================================
   3. PERSISTENCIA
   ============================================================ */

function readStorage(key, fallback) {
    try {
        const value = localStorage.getItem(key);

        return value
            ? JSON.parse(value)
            : deepClone(fallback);
    } catch (error) {
        console.error(
            `Error leyendo almacenamiento ${key}:`,
            error
        );

        return deepClone(fallback);
    }
}

function writeStorage(key, value) {
    try {
        localStorage.setItem(
            key,
            JSON.stringify(value)
        );

        return true;
    } catch (error) {
        console.error(
            `Error guardando almacenamiento ${key}:`,
            error
        );

        return false;
    }
}

function getProfile() {
    return {
        ...DEFAULT_PROFILE,
        ...readStorage(
            STORAGE_KEYS.profile,
            DEFAULT_PROFILE
        )
    };
}

function saveProfile(profile) {
    writeStorage(STORAGE_KEYS.profile, {
        ...getProfile(),
        ...profile
    });

    renderProfile();
    renderUserInformation();
}

function getSettings() {
    const stored = readStorage(
        STORAGE_KEYS.settings,
        DEFAULT_SETTINGS
    );

    return {
        ...DEFAULT_SETTINGS,
        ...stored,
        passMark: getValidPassMark(
            stored?.passMark,
            DEFAULT_SETTINGS.passMark
        )
    };
}

function saveSettings(settings) {
    const current = getSettings();

    const nextSettings = {
        ...current,
        ...settings
    };

    nextSettings.passMark = getValidPassMark(
        nextSettings.passMark,
        DEFAULT_SETTINGS.passMark
    );

    writeStorage(
        STORAGE_KEYS.settings,
        nextSettings
    );
}

function getHistory() {
    const history = readStorage(
        STORAGE_KEYS.history,
        []
    );

    return Array.isArray(history)
        ? history
        : [];
}

function saveHistory(history) {
    writeStorage(
        STORAGE_KEYS.history,
        history
    );
}

function clearApplicationData() {
    if (!window.confirm(
        "¿Deseas eliminar el historial y los datos guardados de Exam Lab?"
    )) {
        return;
    }

    localStorage.removeItem(STORAGE_KEYS.history);
    localStorage.removeItem(STORAGE_KEYS.profile);
    localStorage.removeItem(STORAGE_KEYS.settings);

    renderDashboard();
    renderHistory();
    renderProfile();
    renderUserInformation();
    initializeSettings();

    showMessage(
        "Los datos guardados han sido eliminados."
    );
}


/* ============================================================
   4. CARGA DE ARCHIVOS JSON
   ============================================================ */

async function loadJSON(path) {
    const normalizedPath = getDataPath(path);

    if (!normalizedPath) {
        throw new Error(
            "La ruta del archivo JSON está vacía."
        );
    }

    const response = await fetch(normalizedPath, {
        cache: "no-store"
    });

    if (!response.ok) {
        throw new Error(
            `No fue posible cargar ${normalizedPath}. HTTP ${response.status}`
        );
    }

    return response.json();
}

function extractCollection(data, possibleKeys = []) {
    if (Array.isArray(data)) {
        return data;
    }

    if (!data || typeof data !== "object") {
        return [];
    }

    for (const key of possibleKeys) {
        if (Array.isArray(data[key])) {
            return data[key];
        }
    }

    return [];
}

function extractCaseStudies(data) {
    if (Array.isArray(data)) {
        return data;
    }

    if (!data || typeof data !== "object") {
        return [];
    }

    for (const key of [
        "caseStudies",
        "cases",
        "items",
        "data"
    ]) {
        if (Array.isArray(data[key])) {
            return data[key];
        }
    }

    if (
        data.id ||
        data.caseId ||
        data.caseStudyId
    ) {
        return [data];
    }

    return [];
}

async function loadApplicationData() {
    const catalogData = await loadJSON(
        DATA_PATHS.catalog
    );

    catalog = extractCollection(catalogData, [
        "exams",
        "certifications",
        "catalog",
        "items"
    ]).filter(exam =>
        exam.active !== false &&
        String(exam.status ?? "active").toLowerCase() !== "inactive"
    );

    if (!catalog.length) {
        throw new Error(
            "El catálogo no contiene exámenes activos. Revisa data/catalog.json."
        );
    }

    validateCatalog();
}

function validateCatalog() {
    const ids = new Set();

    catalog.forEach(exam => {
        const id = getExamId(exam);

        if (!id) {
            console.warn(
                "Se encontró un examen sin identificador:",
                exam
            );

            return;
        }

        if (ids.has(id)) {
            console.warn(
                `Identificador de examen duplicado: ${id}`
            );
        }

        ids.add(id);

        if (!getExamQuestionFile(exam)) {
            console.warn(
                `El examen ${id} no tiene questionFile.`
            );
        }
    });
}

async function loadQuestionBank(questionFile) {
    if (!questionFile) {
        throw new Error(
            "El examen no tiene definido questionFile."
        );
    }

    // El catálogo ya contiene la ruta completa.
    // No se debe anteponer nuevamente data/.
    const data = await loadJSON(questionFile);

    const questions = extractCollection(data, [
        "questions",
        "items",
        "data"
    ]);

    if (!questions.length) {
        throw new Error(
            `El banco ${questionFile} no contiene preguntas.`
        );
    }

    validateQuestionBank(
        questions,
        questionFile
    );

    return questions;
}

function validateQuestionBank(questions, questionFile) {
    const ids = new Set();

    questions.forEach((question, index) => {
        const id = getQuestionId(question, index);
        const type = getQuestionType(question);

        if (ids.has(id)) {
            console.warn(
                `ID de pregunta duplicado en ${questionFile}: ${id}`
            );
        }

        ids.add(id);

        if (!SUPPORTED_QUESTION_TYPES.includes(type)) {
            console.warn(
                `Tipo de pregunta no soportado en ${questionFile}: ${type}`
            );
        }
    });
}

async function loadExamMetadata(exam) {
    const metadataFile = getExamMetadataFile(exam);

    if (!metadataFile) {
        return {};
    }

    try {
        const metadata = await loadJSON(metadataFile);

        if (
            metadata.id &&
            String(metadata.id) !== getExamId(exam)
        ) {
            console.warn(
                "El identificador de metadata no coincide con el catálogo."
            );
        }

        return metadata;
    } catch (error) {
        console.warn(
            "No fue posible cargar metadata:",
            error
        );

        return {};
    }
}

async function loadExamCaseStudies(exam, metadata = {}) {
    const directory = getDirectoryPath(
        getExamQuestionFile(exam)
    );

    const configuredFiles = normalizeArray(
        metadata.caseStudyFiles ??
        metadata.caseStudiesFiles ??
        exam.caseStudyFiles
    );

    const files = [
        ...configuredFiles,
        ...CASE_STUDY_CANDIDATES
    ];

    const uniqueFiles = [
        ...new Set(files.filter(Boolean))
    ];

    const results = await Promise.all(
        uniqueFiles.map(async file => {
            const normalizedFile = getDataPath(file);

            const path = normalizedFile.includes("/")
                ? normalizedFile
                : `${directory}${normalizedFile}`;

            try {
                const data = await loadJSON(path);

                const loadedCases = extractCaseStudies(data);

                // Se conserva la ruta de origen para resolver
                // correctamente las imágenes de cada caso.
                return loadedCases.map(item => ({
                    ...item,
                    __sourceFile: path
                }));
            } catch (error) {
                console.warn(
                    `No fue posible cargar el archivo de casos ${path}:`,
                    error
                );

                return [];
            }
        })
    );

    const unique = new Map();

    results.flat().forEach(item => {
        const id = getCaseStudyId(item);

        if (id) {
            unique.set(id, item);
        }
    });

    caseStudies = [...unique.values()];

    return caseStudies;
}


/* ============================================================
   5. CATÁLOGO DE EXÁMENES
   ============================================================ */

function getExamId(exam) {
    return String(
        exam?.id ??
        exam?.examId ??
        ""
    );
}

function getExamName(exam) {
    return String(
        exam?.name ??
        exam?.title ??
        exam?.displayName ??
        "Examen sin nombre"
    );
}

function getExamDisplayName(exam) {
    if (!exam) {
        return "Examen";
    }

    const code = getExamId(exam);
    const name = getExamName(exam);

    return code
        ? `${code} — ${name}`
        : name;
}

function getExamDescription(exam) {
    return String(
        exam?.description ??
        exam?.summary ??
        ""
    );
}

function getExamQuestionFile(exam) {
    return (
        exam?.questionFile ??
        exam?.questionsFile ??
        exam?.file ??
        ""
    );
}

function getExamMetadataFile(exam) {
    return (
        exam?.metadataFile ??
        exam?.metadata ??
        ""
    );
}

function getExamQuestionCount(exam) {
    return safeNumber(
        exam?.questionCount ??
        exam?.totalQuestions ??
        exam?.questionsCount ??
        0
    );
}

function getExamDuration(exam) {
    const metadataDuration = activeExam === exam
        ? activeMetadata.durationMinutes
        : undefined;

    return safeNumber(
        metadataDuration ??
        exam?.durationMinutes ??
        exam?.duration ??
        exam?.timeLimit,
        0
    );
}

function getExamLevel(exam) {
    return String(
        exam?.level ??
        exam?.category ??
        "Certificación"
    );
}

function findExam(examId) {
    return catalog.find(
        exam => getExamId(exam) === String(examId)
    );
}

function renderCertifications() {
    const container = getElement("certification-grid");

    if (!container) {
        return;
    }

    const search = normalizeString(
        getElement("certification-search")?.value
    ).toLowerCase();

    const filter = normalizeString(
        getElement("certification-filter")?.value
    ).toLowerCase();

    const filtered = catalog.filter(exam => {
        const name = getExamName(exam).toLowerCase();
        const description = getExamDescription(exam).toLowerCase();
        const level = getExamLevel(exam).toLowerCase();

        const matchesSearch =
            !search ||
            name.includes(search) ||
            description.includes(search) ||
            getExamId(exam).toLowerCase().includes(search);

        const matchesFilter =
            !filter ||
            filter === "all" ||
            level === filter ||
            String(exam.category ?? "").toLowerCase() === filter;

        return matchesSearch && matchesFilter;
    });

    if (!filtered.length) {
        container.innerHTML = `
            <div class="empty-state">
                <strong>No se encontraron exámenes</strong>
                <p>Prueba con otro término de búsqueda o filtro.</p>
            </div>
        `;

        return;
    }

    container.innerHTML = filtered.map(exam => {
        const id = escapeHTML(getExamId(exam));
        const name = escapeHTML(getExamDisplayName(exam));
        const description = escapeHTML(getExamDescription(exam));
        const count = getExamQuestionCount(exam);
        const duration = getExamDuration(exam);
        const level = escapeHTML(getExamLevel(exam));

        return `
            <article class="certification-card">
                <div class="certification-header">
                    <span class="certification-category">${level}</span>
                </div>

                <h3>${name}</h3>
                <p>${description}</p>

                <div class="certification-footer">
                    <div class="certification-meta">
                        ${count || "Variable"} preguntas
                        ${duration ? ` · ${duration} min` : ""}
                    </div>

                    <button
                        type="button"
                        class="btn btn-primary"
                        data-action="open-exam"
                        data-exam-id="${id}">
                        Iniciar
                    </button>
                </div>
            </article>
        `;
    }).join("");
}

function renderDashboardCertifications() {
    const container = getElement(
        "dashboard-certifications"
    );

    if (!container) {
        return;
    }

    const exams = catalog.slice(0, 4);

    if (!exams.length) {
        container.innerHTML = `
            <div class="empty-state">
                <strong>No hay exámenes disponibles</strong>
                <p>Agrega exámenes al catálogo para comenzar.</p>
            </div>
        `;

        return;
    }

    container.innerHTML = exams.map(exam => `
        <article class="certification-card">
            <div class="certification-header">
                <span class="certification-category">
                    ${escapeHTML(getExamLevel(exam))}
                </span>
            </div>

            <h3>${escapeHTML(getExamDisplayName(exam))}</h3>
            <p>${escapeHTML(getExamDescription(exam))}</p>

            <div class="certification-footer">
                <span class="certification-meta">
                    ${getExamQuestionCount(exam) || "Variable"} preguntas
                </span>

                <button
                    type="button"
                    class="btn btn-primary"
                    data-action="open-exam"
                    data-exam-id="${escapeHTML(getExamId(exam))}">
                    Iniciar
                </button>
            </div>
        </article>
    `).join("");
}


/* ============================================================
   6. PERFIL Y USUARIO
   ============================================================ */

function getInitials(name) {
    const words = normalizeString(name)
        .split(/\s+/)
        .filter(Boolean);

    if (!words.length) {
        return "U";
    }

    return words
        .slice(0, 2)
        .map(word => word[0].toUpperCase())
        .join("");
}

function renderUserInformation() {
    const profile = getProfile();
    const initials = getInitials(profile.name);

    setText("user-name", profile.name);
    setText("sidebar-name", profile.name);
    setText("user-avatar", initials);
    setText("sidebar-avatar", initials);
}

function renderProfile() {
    const profile = getProfile();

    setText("profile-name", profile.name);
    setText("profile-email", profile.email);
    setText("profile-avatar", getInitials(profile.name));

    const nameInput = getElement("profile-name-input");
    const emailInput = getElement("profile-email-input");

    if (nameInput) {
        nameInput.value = profile.name;
    }

    if (emailInput) {
        emailInput.value = profile.email;
    }
}


/* ============================================================
   7. HISTORIAL Y DASHBOARD
   ============================================================ */

function renderHistory() {
    const tbody = getElement("history-table-body");

    if (!tbody) {
        return;
    }

    const filter = normalizeString(
        getElement("history-filter")?.value
    ).toLowerCase();

    const history = getHistory()
        .sort((a, b) =>
            new Date(b.date) - new Date(a.date)
        )
        .filter(item => {
            if (!filter || filter === "all") {
                return true;
            }

            if (filter === "passed") {
                return item.passed === true;
            }

            if (filter === "failed") {
                return item.passed === false;
            }

            return true;
        });

    if (!history.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5">No hay intentos registrados.</td>
            </tr>
        `;

        return;
    }

    tbody.innerHTML = history.map(item => {
        const exam = findExam(item.examId);

        const examName = item.examName ||
            (exam
                ? getExamDisplayName(exam)
                : item.examId);

        const status = item.passed
            ? `<span class="status status-passed">Aprobado</span>`
            : `<span class="status status-failed">No aprobado</span>`;

        return `
            <tr>
                <td>${escapeHTML(examName)}</td>
                <td>${escapeHTML(formatDate(item.date))}</td>
                <td>${Number(item.percent ?? 0)}%</td>
                <td>
                    ${Number(item.correct ?? 0)}
                    /
                    ${Number(item.total ?? 0)}
                </td>
                <td>${status}</td>
            </tr>
        `;
    }).join("");
}

function renderDashboardHistory() {
    const container = getElement("dashboard-history");

    if (!container) {
        return;
    }

    const history = getHistory()
        .sort((a, b) =>
            new Date(b.date) - new Date(a.date)
        )
        .slice(0, 5);

    if (!history.length) {
        container.innerHTML = `
            <div class="empty-state">
                <strong>Sin actividad reciente</strong>
                <p>Cuando completes un examen, aparecerá aquí.</p>
            </div>
        `;

        return;
    }

    container.innerHTML = history.map(item => `
        <div class="activity-item">
            <div>
                <strong>${escapeHTML(item.examName ?? item.examId)}</strong>
                <small>${escapeHTML(formatDate(item.date))}</small>
            </div>

            <span class="activity-score">
                ${Number(item.percent ?? 0)}%
            </span>
        </div>
    `).join("");
}

function renderDashboard() {
    const history = getHistory();

    const totalExams = history.length;

    const average = totalExams
        ? Math.round(
            history.reduce(
                (sum, item) => sum + Number(item.percent ?? 0),
                0
            ) / totalExams
        )
        : 0;

    const passed = history.filter(
        item => item.passed
    ).length;

    const totalSeconds = history.reduce(
        (sum, item) =>
            sum + Number(item.durationSeconds ?? 0),
        0
    );

    setText("stat-exams", totalExams);
    setText("stat-average", `${average}%`);
    setText("stat-passed", passed);
    setText("stat-time", formatDuration(totalSeconds));

    renderDashboardCertifications();
    renderDashboardHistory();
}


/* ============================================================
   8. CONFIGURACIÓN
   ============================================================ */

function initializeSettings() {
    const settings = getSettings();

    const shuffle = getElement("setting-shuffle");
    const timer = getElement("setting-timer");
    const confirmExit = getElement("setting-confirm-exit");

    if (shuffle) {
        shuffle.checked = Boolean(settings.shuffle);
    }

    if (timer) {
        timer.checked = Boolean(settings.showTimer);
    }

    if (confirmExit) {
        confirmExit.checked = Boolean(settings.confirmExit);
    }
}

function readSettingsFromInterface() {
    const current = getSettings();

    saveSettings({
        ...current,
        shuffle:
            getElement("setting-shuffle")?.checked ??
            current.shuffle,

        showTimer:
            getElement("setting-timer")?.checked ??
            current.showTimer,

        confirmExit:
            getElement("setting-confirm-exit")?.checked ??
            current.confirmExit
    });
}


/* ============================================================
   9. NAVEGACIÓN GENERAL
   ============================================================ */

const PAGE_LABELS = {
    dashboard: "Dashboard",
    certifications: "Certificaciones",
    profile: "Perfil",
    history: "Historial",
    settings: "Configuración"
};

function navigateTo(pageName) {
    const pages = [
        "dashboard",
        "certifications",
        "profile",
        "history",
        "settings"
    ];

    if (!pages.includes(pageName)) {
        return;
    }

    pages.forEach(page => {
        const element = getElement(`page-${page}`);

        if (element) {
            element.classList.toggle(
                "hidden",
                page !== pageName
            );
        }
    });

    queryAll(".nav-link").forEach(link => {
        link.classList.toggle(
            "active",
            link.dataset.page === pageName
        );
    });

    setText(
        "breadcrumb-current",
        PAGE_LABELS[pageName]
    );

    if (pageName === "dashboard") {
        renderDashboard();
    }

    if (pageName === "certifications") {
        renderCertifications();
    }

    if (pageName === "profile") {
        renderProfile();
    }

    if (pageName === "history") {
        renderHistory();
    }

    if (pageName === "settings") {
        initializeSettings();
    }

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


/* ============================================================
   10. MODAL DE CONFIGURACIÓN DEL EXAMEN
   ============================================================ */

function openExamModal(examId) {
    const exam = findExam(examId);

    if (!exam) {
        showMessage(
            "No se encontró el examen seleccionado."
        );

        return;
    }

    activeExam = exam;

    setText(
        "exam-modal-title",
        getExamDisplayName(exam)
    );

    setText(
        "exam-modal-description",
        getExamDescription(exam)
    );

    const countInput = getElement("exam-count");
    const settings = getSettings();
    const availableQuestions = getExamQuestionCount(exam);

    if (countInput) {
        const defaultCount = Math.max(
            1,
            safeNumber(settings.defaultCount, 10)
        );

        countInput.value = availableQuestions > 0
            ? Math.min(defaultCount, availableQuestions)
            : defaultCount;

        if (availableQuestions > 0) {
            countInput.max = availableQuestions;
        } else {
            countInput.removeAttribute("max");
        }
    }

    const shuffle = getElement("exam-shuffle");
    const timer = getElement("exam-show-timer");
    const passMark = getElement("exam-pass-mark");

    if (shuffle) {
        shuffle.checked = Boolean(settings.shuffle);
    }

    if (timer) {
        timer.checked = Boolean(settings.showTimer);
    }

    // Se valida el valor almacenado antes de mostrarlo.
    if (passMark) {
        const configuredPassMark = Number(
            settings.passMark
        );

        passMark.value =
            Number.isFinite(configuredPassMark) &&
            configuredPassMark >= 0 &&
            configuredPassMark <= 100
                ? configuredPassMark
                : DEFAULT_SETTINGS.passMark;
    }

    showElement(
        getElement("exam-advanced-config")
    );

    showElement(
        getElement("exam-modal")
    );
}

function closeExamModal() {
    hideElement(
        getElement("exam-modal")
    );

    activeExam = null;
}

async function launchExam() {
    if (!activeExam) {
        return;
    }

    const count = Number(
        getElement("exam-count")?.value ?? 0
    );

    const availableQuestions = getExamQuestionCount(
        activeExam
    );

    if (!Number.isInteger(count) || count < 1) {
        showMessage(
            "La cantidad de preguntas debe ser mayor que cero."
        );

        return;
    }

    if (
        availableQuestions > 0 &&
        count > availableQuestions
    ) {
        showMessage(
            `La cantidad máxima disponible es ${availableQuestions} preguntas.`
        );

        return;
    }

    const passMarkInput = getElement("exam-pass-mark");

    const passMark = !passMarkInput ||
        passMarkInput.value === ""
            ? getSettings().passMark
            : Number(passMarkInput.value);

    if (!isValidPassMark(passMark)) {
        showMessage(
            "El porcentaje mínimo debe estar entre 0 y 100."
        );

        return;
    }

    const settings = {
        count,
        shuffle: Boolean(
            getElement("exam-shuffle")?.checked
        ),
        showTimer: Boolean(
            getElement("exam-show-timer")?.checked
        ),
        passMark
    };

    const params = new URLSearchParams({
        mode: "exam",
        examId: getExamId(activeExam),
        count: String(settings.count),
        shuffle: String(settings.shuffle),
        showTimer: String(settings.showTimer),
        passMark: String(settings.passMark)
    });

    const examUrl =
        `${window.location.pathname}?${params.toString()}`;

    const newWindow = window.open(
        examUrl,
        "_blank"
    );

    if (!newWindow) {
        showMessage(
            "El navegador bloqueó la nueva ventana. Permite las ventanas emergentes para Exam Lab."
        );

        return;
    }

    closeExamModal();
}


/* ============================================================
   11. INICIALIZACIÓN DE LA VENTANA DE EXAMEN
   ============================================================ */

function getExamParameters() {
    const params = new URLSearchParams(
        window.location.search
    );

    if (params.get("mode") !== "exam") {
        return null;
    }

    const countValue = params.get("count");
    const passMarkValue = params.get("passMark");

    return {
        examId: params.get("examId"),

        count: countValue === null
            ? 10
            : Number(countValue),

        shuffle: params.get("shuffle") === "true",

        showTimer: params.get("showTimer") === "true",

        passMark: passMarkValue === null
            ? DEFAULT_SETTINGS.passMark
            : Number(passMarkValue)
    };
}

async function initializeExamWindow() {
    const params = getExamParameters();

    if (!params) {
        return false;
    }

    examWindowMode = true;

    const app = query(".app");

    if (app) {
        app.classList.add("exam-mode");
    }

    document.body.classList.add("exam-mode");

    // El catálogo ya debe estar cargado antes de esta función.
    const exam = findExam(params.examId);

    if (!exam) {
        showMessage(
            "No se encontró el examen solicitado."
        );

        return true;
    }

    if (
        !Number.isInteger(params.count) ||
        params.count < 1 ||
        !isValidPassMark(params.passMark)
    ) {
        showMessage(
            "Los parámetros del examen no son válidos."
        );

        return true;
    }

    activeExam = exam;

    examSettings = {
        count: params.count,
        shuffle: params.shuffle,
        showTimer: params.showTimer,
        passMark: params.passMark
    };

    try {
        activeMetadata = await loadExamMetadata(exam);

        const [bank] = await Promise.all([
            loadQuestionBank(
                getExamQuestionFile(exam)
            ),
            loadExamCaseStudies(
                exam,
                activeMetadata
            )
        ]);

        examSettings.count = Math.min(
            params.count,
            bank.length
        );

        startExam(bank);
    } catch (error) {
        console.error(
            "Error iniciando el examen:",
            error
        );

        showMessage(
            `No fue posible iniciar el examen.\n\n${error.message}`
        );
    }

    return true;
}


/* ============================================================
   12. PREPARACIÓN DEL EXAMEN
   ============================================================ */

function prepareQuestions(bank) {
    let questions = [...bank];

    if (examSettings.shuffle) {
        questions = shuffleArray(questions);
    }

    if (examSettings.count > 0) {
        questions = questions.slice(
            0,
            examSettings.count
        );
    }

    const usedIds = new Set();

    return questions.map((question, index) => {
        const originalId = getQuestionId(
            question,
            index
        );

        let uniqueId = originalId;
        let suffix = 2;

        while (usedIds.has(uniqueId)) {
            uniqueId = `${originalId}-${suffix++}`;
        }

        usedIds.add(uniqueId);

        return {
            ...question,
            __examIndex: index,
            __examId: uniqueId
        };
    });
}

function startExam(bank) {
    activeQuestions = prepareQuestions(bank);

    if (!activeQuestions.length) {
        showMessage(
            "El examen no contiene preguntas disponibles."
        );

        return;
    }

    answers = {};
    currentQuestionIndex = 0;
    examFinished = false;
    elapsedSeconds = 0;
    examStartedAt = Date.now();

    dragState = {
        source: null,
        itemId: null,
        questionId: null
    };

    [
        "page-dashboard",
        "page-certifications",
        "page-profile",
        "page-history",
        "page-settings",
        "result-screen"
    ].forEach(id => {
        hideElement(getElement(id));
    });

    showElement(
        getElement("exam-screen")
    );

    setText(
        "quiz-exam",
        getExamDisplayName(activeExam)
    );

    setText(
        "quiz-timer",
        "00:00"
    );

    renderCurrentQuestion();
    updateTimerVisibility();
    startTimer();

    window.scrollTo(0, 0);
}


/* ============================================================
   13. CASOS DE ESTUDIO
   ============================================================ */

function getCaseStudyId(caseStudy) {
    return String(
        caseStudy?.id ??
        caseStudy?.caseStudyId ??
        caseStudy?.caseId ??
        ""
    );
}

function findCaseStudy(question) {
    const reference =
        question?.caseStudyId ??
        question?.caseStudy ??
        question?.caseId;

    if (!reference) {
        return null;
    }

    if (typeof reference === "object") {
        return reference;
    }

    return caseStudies.find(item =>
        getCaseStudyId(item) === String(reference)
    ) ?? null;
}

function resolveCaseStudyResourcePath(resourcePath, caseStudy) {
    if (
        !resourcePath ||
        typeof resourcePath !== "string"
    ) {
        return "";
    }

    const resource = resourcePath.trim();

    if (!resource) {
        return "";
    }

    if (isAbsoluteResourcePath(resource)) {
        return resource;
    }

    const normalized = resource.replace(/\\/g, "/");

    if (normalized.startsWith("/")) {
        return normalized;
    }

    if (/^data\//i.test(normalized)) {
        return normalized;
    }

    const sourceFile = caseStudy?.__sourceFile;

    if (sourceFile) {
        return (
            getDirectoryPath(sourceFile) +
            normalized
        ).replace(/\/+/g, "/");
    }

    return normalized;
}

function renderCaseStudy(question) {
    const container = getElement("case-study");

    if (!container) {
        return;
    }

    const caseStudy = findCaseStudy(question);

    if (!caseStudy) {
        hideElement(container);
        return;
    }

    const titleElement = getElement(
        "case-study-title"
    );

    const contentElement = getElement(
        "case-study-content"
    );

    if (titleElement) {
        titleElement.textContent =
            caseStudy.title ??
            caseStudy.name ??
            "Caso de estudio";
    }

    if (contentElement) {
        let content;

        if (
            caseStudy.fullText !== undefined &&
            caseStudy.fullText !== null
        ) {
            content = caseStudy.fullText;
        } else if (
            caseStudy.scenario !== undefined &&
            caseStudy.scenario !== null
        ) {
            content = caseStudy.scenario;
        } else {
            content = { ...caseStudy };

            [
                "id",
                "caseId",
                "caseStudyId",
                "title",
                "name",
                "__sourceFile"
            ].forEach(key => {
                delete content[key];
            });
        }

        contentElement.innerHTML =
            renderCaseStudyObject(
                content,
                caseStudy
            );
    }

    showElement(container);
}

function renderCaseStudyImage(path, caseStudy, alt = "") {
    const imagePath = resolveCaseStudyResourcePath(
        path,
        caseStudy
    );

    if (!imagePath) {
        return "";
    }

    return `
        <div class="case-study-image-container">
            <img
                class="case-study-image"
                src="${escapeHTML(imagePath)}"
                alt="${escapeHTML(alt || "Imagen del caso de estudio")}"
                loading="lazy"
                onerror="this.parentElement.style.display='none'">
        </div>
    `;
}

function renderCaseStudyObject(value, caseStudy, key = "") {
    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
    ) {
        const normalizedKey = String(key).toLowerCase();

        if (
            typeof value === "string" &&
            (
                normalizedKey === "image" ||
                normalizedKey === "imageurl" ||
                normalizedKey === "diagram" ||
                normalizedKey.endsWith("image")
            )
        ) {
            return renderCaseStudyImage(
                value,
                caseStudy,
                formatFieldName(key)
            );
        }

        return `<p>${escapeHTML(value)}</p>`;
    }

    if (Array.isArray(value)) {
        return `
            <ul>
                ${value.map(item => `
                    <li>
                        ${renderCaseStudyObject(
                            item,
                            caseStudy,
                            key
                        )}
                    </li>
                `).join("")}
            </ul>
        `;
    }

    if (typeof value === "object") {
        return Object.entries(value)
            .filter(([property]) =>
                property !== "__sourceFile"
            )
            .map(([property, item]) => {
                const normalizedKey = property.toLowerCase();

                if (
                    normalizedKey === "image" ||
                    normalizedKey === "imageurl" ||
                    normalizedKey === "diagram" ||
                    normalizedKey.endsWith("image")
                ) {
                    return renderCaseStudyImage(
                        item,
                        caseStudy,
                        formatFieldName(property)
                    );
                }

                if (
                    normalizedKey === "images" &&
                    Array.isArray(item)
                ) {
                    return item.map(image => {
                        const path = typeof image === "string"
                            ? image
                            : image?.url ?? image?.src ?? image?.path;

                        const alt = typeof image === "object"
                            ? image?.alt ?? ""
                            : "";

                        return renderCaseStudyImage(
                            path,
                            caseStudy,
                            alt
                        );
                    }).join("");
                }

                return `
                    <section class="case-study-section">
                        <strong>
                            ${escapeHTML(formatFieldName(property))}
                        </strong>

                        ${renderCaseStudyObject(
                            item,
                            caseStudy,
                            property
                        )}
                    </section>
                `;
            })
            .join("");
    }

    return "";
}


/* ============================================================
   14. RENDERIZADO DE PREGUNTAS
   ============================================================ */

function renderCurrentQuestion() {
    const question = activeQuestions[
        currentQuestionIndex
    ];

    if (!question) {
        return;
    }

    const total = activeQuestions.length;
    const position = currentQuestionIndex + 1;

    setText(
        "quiz-counter",
        `${position} / ${total}`
    );

    setText(
        "quiz-progress-label",
        `${position} de ${total}`
    );

    setText(
        "quiz-question-number",
        `PREGUNTA ${position}`
    );

    const progress = getElement("quiz-progress");

    if (progress) {
        progress.style.width =
            `${(position / total) * 100}%`;
    }

    const questionElement = getElement(
        "quiz-question"
    );

    if (questionElement) {
        questionElement.textContent =
            getQuestionText(question);
    }

    const type = getQuestionType(question);

    setText(
        "quiz-type",
        getQuestionTypeLabel(type)
    );

    renderCaseStudy(question);
    renderQuestionImage(question);
    renderQuestionCode(question);
    renderAnswer(question);

    const previous = getElement("quiz-prev");
    const next = getElement("quiz-next");

    if (previous) {
        previous.disabled =
            currentQuestionIndex === 0;
    }

    if (next) {
        next.textContent =
            currentQuestionIndex === total - 1
                ? "Finalizar examen"
                : "Siguiente";
    }

    renderQuestionNavigation();
}

function getQuestionTypeLabel(type) {
    const labels = {
        multiple: "Selección única",
        "true-false": "Verdadero o falso",
        "multiple-select": "Selección múltiple",
        "dropdown-group": "Grupo de listas",
        matrix: "Matriz",
        dragdrop: "Arrastrar y soltar",
        "dragdrop-code": "Asignación de bloques de código",
        picklist: "Lista de selección"
    };

    return labels[type] ?? "Pregunta";
}


/* ============================================================
   15. IMÁGENES Y BLOQUES DE CÓDIGO
   ============================================================ */

function resolveQuestionImagePath(imagePath, questionFile) {
    if (
        !imagePath ||
        typeof imagePath !== "string"
    ) {
        return "";
    }

    const image = imagePath.trim();

    if (!image) {
        return "";
    }

    if (isAbsoluteResourcePath(image)) {
        return image;
    }

    const normalizedImage = image.replace(/\\/g, "/");

    if (normalizedImage.startsWith("/")) {
        return normalizedImage;
    }

    if (/^data\//i.test(normalizedImage)) {
        return normalizedImage;
    }

    const directory = getDirectoryPath(questionFile);

    return (
        directory + normalizedImage
    ).replace(/\/+/g, "/");
}

function getQuestionImages(question) {
    const candidates = [];

    if (question.image) {
        candidates.push(question.image);
    }

    if (question.imageUrl) {
        candidates.push(question.imageUrl);
    }

    if (question.diagram) {
        candidates.push(question.diagram);
    }

    if (question.images !== undefined) {
        candidates.push(
            ...normalizeArray(question.images)
        );
    }

    const unique = new Map();

    candidates.forEach((item, index) => {
        const path = typeof item === "string"
            ? item
            : item?.url ??
              item?.src ??
              item?.path ??
              item?.image;

        if (!path || typeof path !== "string") {
            return;
        }

        const normalizedPath = path.trim();

        if (!normalizedPath) {
            return;
        }

        if (!unique.has(normalizedPath)) {
            unique.set(normalizedPath, {
                path: normalizedPath,
                alt: typeof item === "object"
                    ? item.alt ?? question.imageAlt ?? `Imagen ${index + 1} de la pregunta`
                    : question.imageAlt ?? `Imagen ${index + 1} de la pregunta`
            });
        }
    });

    return [...unique.values()];
}

function renderQuestionImage(question) {
    let container = getElement(
        "quiz-image-container"
    );

    if (!container) {
        const questionElement = getElement(
            "quiz-question"
        );

        if (!questionElement) {
            return;
        }

        container = document.createElement("div");
        container.id = "quiz-image-container";
        container.className = "quiz-image-container";

        questionElement.insertAdjacentElement(
            "afterend",
            container
        );
    }

    const images = getQuestionImages(question);

    if (!images.length) {
        container.innerHTML = "";
        hideElement(container);
        return;
    }

    const questionFile = getExamQuestionFile(
        activeExam
    );

    container.innerHTML = images.map(image => {
        const imagePath = resolveQuestionImagePath(
            image.path,
            questionFile
        );

        return `
            <figure class="quiz-question-image-wrapper">
                <img
                    src="${escapeHTML(imagePath)}"
                    alt="${escapeHTML(image.alt)}"
                    loading="lazy"
                    class="quiz-question-image"
                    data-question-image="true">

                <figcaption class="quiz-image-error hidden">
                    No fue posible cargar esta imagen.
                    <span>${escapeHTML(imagePath)}</span>
                </figcaption>
            </figure>
        `;
    }).join("");

    queryAll(
        'img[data-question-image="true"]',
        container
    ).forEach(imageElement => {
        imageElement.addEventListener(
            "load",
            () => {
                showElement(container);
            },
            { once: true }
        );

        imageElement.addEventListener(
            "error",
            () => {
                const figure = imageElement.closest(
                    ".quiz-question-image-wrapper"
                );

                const errorElement = query(
                    ".quiz-image-error",
                    figure
                );

                imageElement.classList.add("hidden");
                showElement(errorElement);
                showElement(container);
            },
            { once: true }
        );
    });

    showElement(container);
}

function renderQuestionCode(question) {
    const container = getElement(
        "quiz-code-container"
    );

    const codeElement = getElement(
        "quiz-code-content"
    );

    const languageElement = getElement(
        "quiz-code-language"
    );

    const code =
        question.code ??
        question.codeSnippet ??
        (
            getQuestionType(question) !== "dragdrop-code"
                ? question.codeTemplate
                : ""
        );

    if (!code) {
        hideElement(container);
        return;
    }

    if (codeElement) {
        codeElement.textContent = Array.isArray(code)
            ? code.join("\n")
            : String(code);
    }

    if (languageElement) {
        languageElement.textContent =
            question.language ??
            question.codeLanguage ??
            "Código";
    }

    showElement(container);
}


/* ============================================================
   16. RENDERIZADOR PRINCIPAL DE RESPUESTAS
   ============================================================ */

function renderAnswer(question) {
    const container = getElement("quiz-answer");

    if (!container) {
        return;
    }

    const type = getQuestionType(question);
    const questionId = question.__examId;

    container.innerHTML = "";

    switch (type) {
        case "multiple":
            renderMultiple(
                question,
                container,
                questionId
            );
            break;

        case "true-false":
            renderTrueFalse(
                question,
                container,
                questionId
            );
            break;

        case "multiple-select":
            renderMultipleSelect(
                question,
                container,
                questionId
            );
            break;

        case "dropdown-group":
            renderDropdownGroup(
                question,
                container,
                questionId
            );
            break;

        case "matrix":
            renderMatrix(
                question,
                container,
                questionId
            );
            break;

        case "dragdrop":
            renderDragDrop(
                question,
                container,
                questionId
            );
            break;

        case "dragdrop-code":
            renderDragDropCode(
                question,
                container,
                questionId
            );
            break;

        case "picklist":
            renderPicklist(
                question,
                container,
                questionId
            );
            break;

        default:
            container.innerHTML = `
                <div class="empty-state">
                    <strong>Tipo de pregunta no soportado</strong>
                    <p>
                        Tipo recibido:
                        ${escapeHTML(type || "No definido")}
                    </p>
                </div>
            `;
    }
}


/* ============================================================
   17. MULTIPLE Y TRUE-FALSE
   ============================================================ */

function renderMultiple(question, container, questionId) {
    const options = getQuestionOptions(question);
    const selected = answers[questionId];

    if (!options.length) {
        container.innerHTML = `
            <div class="empty-state">
                <strong>La pregunta no tiene opciones.</strong>
            </div>
        `;

        return;
    }

    container.innerHTML = options.map((option, index) => {
        const value = getOptionValue(
            option,
            index
        );

        const checked = String(selected ?? "") === value;

        return `
            <label class="answer-option ${checked ? "selected" : ""}">
                <input
                    type="radio"
                    name="answer-${escapeHTML(questionId)}"
                    value="${escapeHTML(value)}"
                    ${checked ? "checked" : ""}
                    data-answer-type="multiple"
                    data-question-id="${escapeHTML(questionId)}">

                <span class="answer-letter">
                    ${String.fromCharCode(65 + index)}
                </span>

                <span class="answer-option-content">
                    ${escapeHTML(getOptionText(option))}
                </span>
            </label>
        `;
    }).join("");
}

function renderTrueFalse(question, container, questionId) {
    const options = question.options?.length
        ? question.options
        : [
            { value: true, text: "Verdadero" },
            { value: false, text: "Falso" }
        ];

    const selected = answers[questionId];

    container.innerHTML = `
        <div class="true-false-options">
            ${options.map((option, index) => {
                const value = getOptionValue(
                    option,
                    index
                );

                const checked =
                    selected !== undefined &&
                    String(selected) === String(
                        normalizeBoolean(value)
                    );

                return `
                    <button
                        type="button"
                        class="true-false-option ${checked ? "selected" : ""}"
                        data-answer-type="true-false"
                        data-question-id="${escapeHTML(questionId)}"
                        data-value="${escapeHTML(value)}">

                        ${escapeHTML(getOptionText(option))}
                    </button>
                `;
            }).join("")}
        </div>
    `;
}


/* ============================================================
   18. MULTIPLE SELECT
   ============================================================ */

function renderMultipleSelect(question, container, questionId) {
    const options = getQuestionOptions(question);

    const selected = normalizeArray(
        answers[questionId]
    ).map(String);

    if (!options.length) {
        container.innerHTML = `
            <div class="empty-state">
                <strong>La pregunta no tiene opciones.</strong>
            </div>
        `;

        return;
    }

    container.innerHTML = options.map((option, index) => {
        const value = getOptionValue(
            option,
            index
        );

        const checked = selected.includes(value);

        return `
            <label class="answer-option ${checked ? "selected" : ""}">
                <input
                    type="checkbox"
                    value="${escapeHTML(value)}"
                    ${checked ? "checked" : ""}
                    data-answer-type="multiple-select"
                    data-question-id="${escapeHTML(questionId)}">

                <span class="answer-letter">
                    ${String.fromCharCode(65 + index)}
                </span>

                <span class="answer-option-content">
                    ${escapeHTML(getOptionText(option))}
                </span>
            </label>
        `;
    }).join("");
}


/* ============================================================
   19. DROPDOWN GROUP Y PICKLIST
   ============================================================ */

function getDropdownItems(question) {
    return normalizeArray(
        question.items ??
        question.fields ??
        question.statements
    );
}

function getDropdownItemId(item, index) {
    if (
        typeof item === "string" ||
        typeof item === "number"
    ) {
        return String(item);
    }

    return String(
        item?.id ??
        item?.key ??
        item?.name ??
        `item-${index + 1}`
    );
}

function renderDropdownGroup(question, container, questionId) {
    const items = getDropdownItems(question);

    const options = normalizeArray(
        question.options ?? question.choices
    );

    const selected = answers[questionId] ?? {};

    if (!items.length) {
        container.innerHTML = `
            <div class="empty-state">
                <strong>No hay elementos para seleccionar.</strong>
            </div>
        `;

        return;
    }

    container.innerHTML = `
        <div class="dropdown-group">
            ${items.map((item, index) => {
                const id = getDropdownItemId(
                    item,
                    index
                );

                const itemOptions = normalizeArray(
                    item?.options ?? options
                );

                return `
                    <div class="dropdown-group-item">
                        <label>
                            ${escapeHTML(
                                getOptionText(item) ||
                                item?.question ||
                                `Elemento ${index + 1}`
                            )}
                        </label>

                        <select
                            data-answer-type="dropdown-group"
                            data-question-id="${escapeHTML(questionId)}"
                            data-item-id="${escapeHTML(id)}">

                            <option value="">
                                Selecciona una opción
                            </option>

                            ${itemOptions.map((option, optionIndex) => {
                                const value = getOptionValue(
                                    option,
                                    optionIndex
                                );

                                return `
                                    <option
                                        value="${escapeHTML(value)}"
                                        ${String(selected[id] ?? "") === value ? "selected" : ""}>
                                        ${escapeHTML(getOptionText(option))}
                                    </option>
                                `;
                            }).join("")}
                        </select>
                    </div>
                `;
            }).join("")}
        </div>
    `;
}

function renderPicklist(question, container, questionId) {
    const items = getDropdownItems(question);

    const sharedOptions = normalizeArray(
        question.options ?? question.choices
    );

    const selected = answers[questionId] ?? {};

    if (!items.length) {
        container.innerHTML = `
            <div class="empty-state">
                <strong>No hay elementos para seleccionar.</strong>
            </div>
        `;

        return;
    }

    container.innerHTML = `
        <div class="picklist-container">
            ${items.map((item, index) => {
                const id = getDropdownItemId(
                    item,
                    index
                );

                const options = normalizeArray(
                    item?.options ?? sharedOptions
                );

                return `
                    <div class="picklist-item">
                        <label>
                            ${escapeHTML(
                                getOptionText(item) ||
                                `Elemento ${index + 1}`
                            )}
                        </label>

                        <select
                            data-answer-type="picklist"
                            data-question-id="${escapeHTML(questionId)}"
                            data-item-id="${escapeHTML(id)}">

                            <option value="">
                                Selecciona una opción
                            </option>

                            ${options.map((option, optionIndex) => {
                                const value = getOptionValue(
                                    option,
                                    optionIndex
                                );

                                return `
                                    <option
                                        value="${escapeHTML(value)}"
                                        ${String(selected[id] ?? "") === value ? "selected" : ""}>
                                        ${escapeHTML(getOptionText(option))}
                                    </option>
                                `;
                            }).join("")}
                        </select>
                    </div>
                `;
            }).join("")}
        </div>
    `;
}


/* ============================================================
   20. MATRIX
   ============================================================ */

function getMatrixRows(question) {
    return normalizeArray(question.rows);
}

function getMatrixColumns(question) {
    return normalizeArray(question.columns);
}

function getMatrixRowText(row, index) {
    if (
        typeof row === "string" ||
        typeof row === "number"
    ) {
        return String(row);
    }

    return String(
        row?.statement ??
        row?.text ??
        row?.label ??
        row?.name ??
        `Fila ${index + 1}`
    );
}

function renderMatrix(question, container, questionId) {
    const rows = getMatrixRows(question);
    const columns = getMatrixColumns(question);
    const selected = answers[questionId] ?? {};

    if (!rows.length || !columns.length) {
        container.innerHTML = `
            <div class="empty-state">
                <strong>La matriz no está configurada correctamente.</strong>
                <p>Se requieren filas y columnas.</p>
            </div>
        `;

        return;
    }

    const multiple = question.selectionMode === "multiple";

    container.innerHTML = `
        <div class="matrix-container">
            <table class="matrix-table">
                <thead>
                    <tr>
                        <th></th>

                        ${columns.map((column, index) => `
                            <th>
                                ${escapeHTML(
                                    getOptionText(column) ||
                                    `Opción ${index + 1}`
                                )}
                            </th>
                        `).join("")}
                    </tr>
                </thead>

                <tbody>
                    ${rows.map((row, rowIndex) => {
                        const rowId = getDropdownItemId(
                            row,
                            rowIndex
                        );

                        return `
                            <tr>
                                <td>
                                    ${escapeHTML(
                                        getMatrixRowText(row, rowIndex)
                                    )}
                                </td>

                                ${columns.map((column, columnIndex) => {
                                    const columnValue = getOptionValue(
                                        column,
                                        columnIndex
                                    );

                                    const inputType = multiple
                                        ? "checkbox"
                                        : "radio";

                                    const checked = multiple
                                        ? normalizeArray(selected[rowId])
                                            .map(String)
                                            .includes(columnValue)
                                        : String(selected[rowId] ?? "") === columnValue;

                                    return `
                                        <td>
                                            <input
                                                type="${inputType}"
                                                name="matrix-${escapeHTML(questionId)}-${escapeHTML(rowId)}"
                                                value="${escapeHTML(columnValue)}"
                                                data-answer-type="matrix"
                                                data-question-id="${escapeHTML(questionId)}"
                                                data-row-id="${escapeHTML(rowId)}"
                                                ${checked ? "checked" : ""}>
                                        </td>
                                    `;
                                }).join("")}
                            </tr>
                        `;
                    }).join("")}
                </tbody>
            </table>
        </div>
    `;
}


/* ============================================================
   21. DRAG AND DROP
   Asignación de elementos a destinos.
   ============================================================ */

function getDragItems(question) {
    return normalizeArray(
        question.items ??
        question.options ??
        question.draggables
    );
}

function getDragTargets(question) {
    return normalizeArray(
        question.targets ??
        question.destinations ??
        question.zones
    );
}

function getDragItemId(item, index) {
    if (
        typeof item === "string" ||
        typeof item === "number"
    ) {
        return String(item);
    }

    return String(
        item?.id ??
        item?.value ??
        item?.key ??
        item?.text ??
        `drag-item-${index + 1}`
    );
}

function getDragTargetId(target, index) {
    if (
        typeof target === "string" ||
        typeof target === "number"
    ) {
        return String(target);
    }

    return String(
        target?.id ??
        target?.value ??
        target?.key ??
        target?.text ??
        `target-${index + 1}`
    );
}

function getDragItemText(item, fallback) {
    if (
        typeof item === "string" ||
        typeof item === "number"
    ) {
        return String(item);
    }

    return String(
        item?.text ??
        item?.label ??
        item?.name ??
        item?.value ??
        fallback
    );
}

function getDragTargetText(target, fallback) {
    if (
        typeof target === "string" ||
        typeof target === "number"
    ) {
        return String(target);
    }

    return String(
        target?.text ??
        target?.label ??
        target?.name ??
        target?.value ??
        fallback
    );
}

function targetAllowsMultiple(target, question) {
    if (target?.multiple !== undefined) {
        return normalizeBoolean(target.multiple);
    }

    return normalizeBoolean(
        question.allowMultiplePerTarget ?? false
    );
}

function getDragAnswer(question, questionId) {
    const current = answers[questionId];

    if (current?.placements) {
        return deepClone(current);
    }

    return {
        placements: {},
        unused: getDragItems(question).map(
            (item, index) =>
                getDragItemId(item, index)
        )
    };
}

function renderDragDrop(question, container, questionId) {
    const items = getDragItems(question);
    const targets = getDragTargets(question);

    if (!items.length || !targets.length) {
        container.innerHTML = `
            <div class="empty-state">
                <strong>El ejercicio drag and drop no está configurado.</strong>
                <p>Se requieren elementos y destinos.</p>
            </div>
        `;

        return;
    }

    const current = getDragAnswer(
        question,
        questionId
    );

    const placements = current.placements ?? {};

    const assignedIds = Object.values(placements)
        .flatMap(value => normalizeArray(value))
        .map(String);

    const unused = items.filter((item, index) => {
        const id = getDragItemId(item, index);

        return !assignedIds.includes(id);
    });

    const targetMarkup = targets.map((target, index) => {
        const targetId = getDragTargetId(
            target,
            index
        );

        const assigned = normalizeArray(
            placements[targetId]
        );

        return `
            <div
                class="dragdrop-column"
                tabindex="0"
                role="group"
                data-drop-zone="target"
                data-target-id="${escapeHTML(targetId)}"
                data-question-id="${escapeHTML(questionId)}">

                <h4>
                    ${escapeHTML(
                        getDragTargetText(
                            target,
                            `Destino ${index + 1}`
                        )
                    )}
                </h4>

                <div class="dragdrop-items">
                    ${assigned.map(itemId => {
                        const itemIndex = items.findIndex((entry, i) =>
                            getDragItemId(entry, i) === String(itemId)
                        );

                        if (itemIndex < 0) {
                            return "";
                        }

                        return renderDragItem(
                            items[itemIndex],
                            String(itemId),
                            questionId
                        );
                    }).join("")}

                    ${assigned.length === 0
                        ? `
                            <div class="dragdrop-placeholder">
                                Arrastra aquí un elemento
                            </div>
                        `
                        : ""}
                </div>
            </div>
        `;
    }).join("");

    container.innerHTML = `
        <div class="dragdrop-container">
            <div
                class="dragdrop-column"
                tabindex="0"
                role="group"
                data-drop-zone="source"
                data-question-id="${escapeHTML(questionId)}">

                <h4>Elementos disponibles</h4>

                <div class="dragdrop-items">
                    ${unused.map(item => {
                        const index = items.indexOf(item);

                        return renderDragItem(
                            item,
                            getDragItemId(item, index),
                            questionId
                        );
                    }).join("")}

                    ${unused.length === 0
                        ? `
                            <div class="dragdrop-placeholder">
                                Todos los elementos han sido asignados
                            </div>
                        `
                        : ""}
                </div>
            </div>

            ${targetMarkup}
        </div>
    `;
}

function renderDragItem(item, itemId, questionId) {
    return `
        <div
            class="dragdrop-item"
            draggable="true"
            tabindex="0"
            role="button"
            aria-label="Elemento arrastrable"
            data-drag-item="${escapeHTML(itemId)}"
            data-question-id="${escapeHTML(questionId)}">

            <span class="dragdrop-handle" aria-hidden="true">::</span>

            <span>
                ${escapeHTML(
                    getDragItemText(item, itemId)
                )}
            </span>
        </div>
    `;
}

function updateDragDropAnswer(questionId, targetId, itemId) {
    const question = activeQuestions.find(
        item => item.__examId === questionId
    );

    if (!question) {
        return;
    }

    const items = getDragItems(question);
    const targets = getDragTargets(question);

    const validItem = items.some((item, index) =>
        getDragItemId(item, index) === itemId
    );

    if (!validItem) {
        return;
    }

    const placements = deepClone(
        answers[questionId]?.placements ?? {}
    );

    // El elemento se retira de su ubicación anterior.
    Object.keys(placements).forEach(key => {
        placements[key] = normalizeArray(
            placements[key]
        ).filter(value =>
            String(value) !== itemId
        );
    });

    if (targetId !== "source") {
        const targetIndex = targets.findIndex(
            (entry, index) =>
                getDragTargetId(entry, index) === targetId
        );

        if (targetIndex < 0) {
            return;
        }

        const target = targets[targetIndex];

        const allowMultiple = targetAllowsMultiple(
            target,
            question
        );

        const existing = normalizeArray(
            placements[targetId]
        );

        if (allowMultiple) {
            if (!existing.map(String).includes(itemId)) {
                existing.push(itemId);
            }

            placements[targetId] = existing;
        } else {
            // El elemento anterior queda disponible.
            placements[targetId] = [itemId];
        }
    }

    const assignedIds = Object.values(placements)
        .flatMap(value => normalizeArray(value))
        .map(String);

    answers[questionId] = {
        placements,
        unused: items
            .map((item, index) =>
                getDragItemId(item, index)
            )
            .filter(id =>
                !assignedIds.includes(id)
            )
    };

    renderAnswer(question);
    renderQuestionNavigation();
}


/* ============================================================
   22. DRAG AND DROP CODE
   Asignación de bloques a destinos.
   No es un ejercicio de ordenamiento.
   ============================================================ */

function getCodeTargets(question) {
    return getDragTargets(question);
}

function getCodeTemplate(question) {
    const template =
        question.codeTemplate ??
        question.code ??
        [];

    if (Array.isArray(template)) {
        return template.map(String);
    }

    if (typeof template === "string") {
        return template.split("\n");
    }

    return [];
}

function renderDragDropCode(question, container, questionId) {
    const items = getDragItems(question);
    const targets = getCodeTargets(question);

    if (!items.length || !targets.length) {
        container.innerHTML = `
            <div class="empty-state">
                <strong>El ejercicio de código no está configurado.</strong>
                <p>Se requieren bloques disponibles y destinos.</p>
            </div>
        `;

        return;
    }

    const current = answers[questionId] ?? {
        placements: {}
    };

    const placements = current.placements ?? {};

    const assignedIds = Object.values(placements)
        .flatMap(value => normalizeArray(value))
        .map(String);

    const availableItems = items.filter((item, index) =>
        !assignedIds.includes(
            getDragItemId(item, index)
        )
    );

    const sourceMarkup = availableItems.map(item => {
        const index = items.indexOf(item);
        const id = getDragItemId(item, index);

        return renderCodeDragItem(
            item,
            id,
            questionId
        );
    }).join("");

    const targetsMarkup = targets.map((target, index) => {
        const targetId = getDragTargetId(
            target,
            index
        );

        const assigned = normalizeArray(
            placements[targetId]
        );

        return `
            <div
                class="dragdrop-code-target"
                tabindex="0"
                role="group"
                data-code-zone="target"
                data-target-id="${escapeHTML(targetId)}"
                data-question-id="${escapeHTML(questionId)}">

                <h4>
                    ${escapeHTML(
                        getDragTargetText(
                            target,
                            `Destino ${index + 1}`
                        )
                    )}
                </h4>

                <div class="dragdrop-items">
                    ${assigned.map(itemId => {
                        const itemIndex = items.findIndex((entry, i) =>
                            getDragItemId(entry, i) === String(itemId)
                        );

                        if (itemIndex < 0) {
                            return "";
                        }

                        return renderCodeDragItem(
                            items[itemIndex],
                            String(itemId),
                            questionId
                        );
                    }).join("")}

                    ${assigned.length === 0
                        ? `
                            <div class="dragdrop-placeholder">
                                Arrastra aquí el bloque correspondiente
                            </div>
                        `
                        : ""}
                </div>
            </div>
        `;
    }).join("");

    const template = getCodeTemplate(question);

    container.innerHTML = `
        <div class="dragdrop-code-container">

            ${template.length ? `
                <div class="dragdrop-code-source">
                    <h4>Plantilla de código</h4>

                    <pre class="quiz-code"><code>${escapeHTML(
                        renderCodeTemplate(question, placements)
                    )}</code></pre>
                </div>
            ` : ""}

            <div class="dragdrop-code-source">
                <h4>Bloques disponibles</h4>

                <div
                    class="dragdrop-items"
                    tabindex="0"
                    data-code-zone="source"
                    data-question-id="${escapeHTML(questionId)}">

                    ${sourceMarkup || `
                        <div class="dragdrop-placeholder">
                            Todos los bloques están asignados.
                        </div>
                    `}
                </div>
            </div>

            <div class="dragdrop-code-targets">
                ${targetsMarkup}
            </div>
        </div>
    `;
}

function renderCodeDragItem(item, id, questionId) {
    return `
        <div
            class="dragdrop-code-block"
            draggable="true"
            tabindex="0"
            role="button"
            data-code-item="${escapeHTML(id)}"
            data-question-id="${escapeHTML(questionId)}">

            <span class="dragdrop-handle">::</span>

            <code>
                ${escapeHTML(
                    getDragItemText(item, id)
                )}
            </code>
        </div>
    `;
}

function normalizeCodePlaceholder(value) {
    return String(value ?? "")
        .replace(/[^a-z0-9]/gi, "")
        .toUpperCase();
}

function getCodeItemPlaceholders(item, itemId) {
    const values = [
        itemId,
        item?.id,
        item?.key,
        item?.name,
        item?.placeholder,
        item?.token,
        item?.code
    ];

    return [...new Set(
        values
            .filter(value =>
                value !== undefined &&
                value !== null &&
                String(value).trim() !== ""
            )
            .map(normalizeCodePlaceholder)
            .filter(Boolean)
    )];
}

function renderCodeTemplate(question, placements) {
    const items = getDragItems(question);
    const targets = getCodeTargets(question);

    const replacements = new Map();

    targets.forEach((target, index) => {
        const targetId = getDragTargetId(
            target,
            index
        );

        const itemId = normalizeArray(
            placements[targetId]
        )[0];

        if (!itemId) {
            return;
        }

        const itemIndex = items.findIndex((item, i) =>
            getDragItemId(item, i) === String(itemId)
        );

        if (itemIndex < 0) {
            return;
        }

        const item = items[itemIndex];

        const value = getDragItemText(
            item,
            itemId
        );

        // Se reemplazan placeholders asociados al ID,
        // nombre, token o propiedad placeholder del elemento.
        getCodeItemPlaceholders(
            item,
            itemId
        ).forEach(placeholder => {
            replacements.set(
                placeholder,
                value
            );
        });

        // También se conserva compatibilidad con placeholders
        // derivados del identificador del destino.
        replacements.set(
            normalizeCodePlaceholder(targetId),
            value
        );
    });

    const template = getCodeTemplate(question);

    return template.map(line => {
        let result = line;

        replacements.forEach((value, placeholder) => {
            const expression = new RegExp(
                `\\{${placeholder}\\}`,
                "gi"
            );

            result = result.replace(
                expression,
                () => value
            );
        });

        return result;
    }).join("\n");
}

function updateDragDropCodeAnswer(
    questionId,
    itemId,
    destination
) {
    const question = activeQuestions.find(
        item => item.__examId === questionId
    );

    if (!question) {
        return;
    }

    const items = getDragItems(question);
    const targets = getCodeTargets(question);

    const validItem = items.some((item, index) =>
        getDragItemId(item, index) === itemId
    );

    if (!validItem) {
        return;
    }

    const placements = deepClone(
        answers[questionId]?.placements ?? {}
    );

    // El bloque se retira de su destino anterior.
    Object.keys(placements).forEach(key => {
        placements[key] = normalizeArray(
            placements[key]
        ).filter(value =>
            String(value) !== itemId
        );
    });

    if (destination !== "source") {
        const targetIndex = targets.findIndex(
            (target, index) =>
                getDragTargetId(target, index) === destination
        );

        if (targetIndex < 0) {
            return;
        }

        // Cada destino admite un bloque.
        // El bloque reemplazado vuelve a estar disponible.
        placements[destination] = [itemId];
    }

    answers[questionId] = {
        placements
    };

    renderAnswer(question);
    renderQuestionNavigation();
}


/* ============================================================
   23. EVENTOS DE RESPUESTAS
   ============================================================ */

function initializeAnswerEvents() {
    const container = getElement("quiz-answer");

    if (!container) {
        return;
    }

    container.addEventListener("change", event => {
        const element = event.target;

        const type = element.dataset.answerType;
        const questionId = element.dataset.questionId;

        if (!type || !questionId) {
            return;
        }

        switch (type) {
            case "multiple":
                answers[questionId] = element.value;
                break;

            case "multiple-select":
                answers[questionId] = queryAll(
                    'input[data-answer-type="multiple-select"]:checked',
                    container
                )
                    .filter(input =>
                        input.dataset.questionId === questionId
                    )
                    .map(input => input.value);
                break;

            case "dropdown-group":
            case "picklist": {
                const current = {
                    ...(answers[questionId] ?? {})
                };

                current[element.dataset.itemId] =
                    element.value;

                answers[questionId] = current;
                break;
            }

            case "matrix":
                updateMatrixAnswer(
                    element,
                    questionId
                );
                break;
        }

        updateAnswerStyles();
        renderQuestionNavigation();
    });

    container.addEventListener("click", event => {
        const button = event.target.closest(
            '[data-answer-type="true-false"]'
        );

        if (button) {
            const questionId = button.dataset.questionId;

            answers[questionId] = normalizeBoolean(
                button.dataset.value
            );

            renderAnswer(
                activeQuestions[currentQuestionIndex]
            );

            renderQuestionNavigation();

            return;
        }

        // Primero se comprueba si el clic fue sobre un elemento.
        // Así se evita interpretar el clic sobre un bloque como
        // un clic sobre la zona que lo contiene.
        const dragItem = event.target.closest(
            "[data-drag-item], [data-code-item]"
        );

        if (
            dragItem &&
            event.detail !== 0 &&
            window.matchMedia("(pointer: coarse)").matches
        ) {
            handleAccessibleDragClick(dragItem);
            return;
        }

        const zone = event.target.closest(
            "[data-drop-zone], [data-code-zone]"
        );

        if (zone && event.detail !== 0) {
            handleAccessibleDropZoneClick(zone);
        }
    });

    container.addEventListener("keydown", event => {
        if (!["Enter", " "].includes(event.key)) {
            return;
        }

        const item = event.target.closest(
            "[data-drag-item], [data-code-item]"
        );

        if (item) {
            event.preventDefault();
            handleAccessibleDragClick(item);
            return;
        }

        const zone = event.target.closest(
            "[data-drop-zone], [data-code-zone]"
        );

        if (zone) {
            event.preventDefault();
            handleAccessibleDropZoneClick(zone);
        }
    });

    initializeDragEvents(container);
}

function updateMatrixAnswer(element, questionId) {
    const rowId = element.dataset.rowId;

    const current = {
        ...(answers[questionId] ?? {})
    };

    const question = activeQuestions.find(
        item => item.__examId === questionId
    );

    if (!question) {
        return;
    }

    if (question.selectionMode === "multiple") {
        current[rowId] = queryAll(
            'input[data-answer-type="matrix"]:checked',
            getElement("quiz-answer")
        )
            .filter(input =>
                input.dataset.questionId === questionId &&
                input.dataset.rowId === rowId
            )
            .map(input => input.value);
    } else {
        current[rowId] = element.value;
    }

    answers[questionId] = current;
}

function updateAnswerStyles() {
    const container = getElement("quiz-answer");

    if (!container) {
        return;
    }

    queryAll(
        ".answer-option",
        container
    ).forEach(option => {
        const input = query(
            "input",
            option
        );

        option.classList.toggle(
            "selected",
            Boolean(input?.checked)
        );
    });
}


/* ============================================================
   24. EVENTOS DRAG AND DROP
   ============================================================ */

function initializeDragEvents(container) {
    container.addEventListener("dragstart", event => {
        const item = event.target.closest(
            "[data-drag-item], [data-code-item]"
        );

        if (!item) {
            return;
        }

        dragState = {
            source: item.hasAttribute("data-code-item")
                ? "code"
                : "drag",

            itemId:
                item.dataset.dragItem ??
                item.dataset.codeItem,

            questionId: item.dataset.questionId
        };

        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";

            event.dataTransfer.setData(
                "text/plain",
                dragState.itemId
            );
        }

        item.classList.add("dragging");
    });

    container.addEventListener("dragend", event => {
        const item = event.target.closest(
            "[data-drag-item], [data-code-item]"
        );

        item?.classList.remove("dragging");

        queryAll(
            ".drag-over",
            container
        ).forEach(element => {
            element.classList.remove("drag-over");
        });

        dragState = {
            source: null,
            itemId: null,
            questionId: null
        };
    });

    container.addEventListener("dragover", event => {
        const zone = event.target.closest(
            "[data-drop-zone], [data-code-zone]"
        );

        if (!zone) {
            return;
        }

        event.preventDefault();

        zone.classList.add("drag-over");
    });

    container.addEventListener("dragleave", event => {
        const zone = event.target.closest(
            "[data-drop-zone], [data-code-zone]"
        );

        if (!zone) {
            return;
        }

        if (!zone.contains(event.relatedTarget)) {
            zone.classList.remove("drag-over");
        }
    });

    container.addEventListener("drop", event => {
        const zone = event.target.closest(
            "[data-drop-zone], [data-code-zone]"
        );

        if (!zone) {
            return;
        }

        event.preventDefault();

        zone.classList.remove("drag-over");

        const itemId = event.dataTransfer
            ? event.dataTransfer.getData("text/plain")
            : "";

        const questionId = zone.dataset.questionId;

        if (!itemId || !questionId) {
            return;
        }

        if (dragState.questionId !== questionId) {
            return;
        }

        const isCodeZone = zone.hasAttribute(
            "data-code-zone"
        );

        if (
            isCodeZone &&
            dragState.source !== "code"
        ) {
            return;
        }

        if (
            !isCodeZone &&
            dragState.source !== "drag"
        ) {
            return;
        }

        if (zone.hasAttribute("data-drop-zone")) {
            const targetId =
                zone.dataset.dropZone === "source"
                    ? "source"
                    : zone.dataset.targetId;

            updateDragDropAnswer(
                questionId,
                targetId,
                itemId
            );
        } else {
            const destination =
                zone.dataset.codeZone === "source"
                    ? "source"
                    : zone.dataset.targetId;

            updateDragDropCodeAnswer(
                questionId,
                itemId,
                destination
            );
        }

        dragState = {
            source: null,
            itemId: null,
            questionId: null
        };
    });
}

function handleAccessibleDragClick(item) {
    const questionId = item.dataset.questionId;

    const itemId =
        item.dataset.dragItem ??
        item.dataset.codeItem;

    const isCode = item.hasAttribute(
        "data-code-item"
    );

    if (!questionId || !itemId) {
        return;
    }

    const source = isCode
        ? "code"
        : "drag";

    // Selecciona el elemento. Si ya había otro seleccionado,
    // se reemplaza por el nuevo.
    if (
        !dragState.itemId ||
        dragState.questionId !== questionId ||
        dragState.source !== source
    ) {
        dragState = {
            source,
            itemId,
            questionId
        };

        showMessage(
            "Elemento seleccionado. Selecciona el destino correspondiente."
        );

        return;
    }

    // Permite cancelar la selección pulsando nuevamente
    // sobre el mismo elemento.
    if (dragState.itemId === itemId) {
        dragState = {
            source: null,
            itemId: null,
            questionId: null
        };

        return;
    }

    // Si se selecciona otro elemento, se cambia la selección.
    dragState.itemId = itemId;
}

function handleAccessibleDropZoneClick(zone) {
    if (
        !dragState.itemId ||
        !dragState.questionId
    ) {
        return;
    }

    const questionId = zone.dataset.questionId;

    if (questionId !== dragState.questionId) {
        return;
    }

    const isCodeZone = zone.hasAttribute(
        "data-code-zone"
    );

    if (
        isCodeZone &&
        dragState.source !== "code"
    ) {
        return;
    }

    if (
        !isCodeZone &&
        dragState.source !== "drag"
    ) {
        return;
    }

    const itemId = dragState.itemId;

    if (zone.hasAttribute("data-drop-zone")) {
        const targetId =
            zone.dataset.dropZone === "source"
                ? "source"
                : zone.dataset.targetId;

        updateDragDropAnswer(
            questionId,
            targetId,
            itemId
        );
    } else {
        const destination =
            zone.dataset.codeZone === "source"
                ? "source"
                : zone.dataset.targetId;

        updateDragDropCodeAnswer(
            questionId,
            itemId,
            destination
        );
    }

    dragState = {
        source: null,
        itemId: null,
        questionId: null
    };
}


/* ============================================================
   25. NAVEGACIÓN ENTRE PREGUNTAS
   ============================================================ */

function goToQuestion(index) {
    if (
        index < 0 ||
        index >= activeQuestions.length
    ) {
        return;
    }

    currentQuestionIndex = index;

    dragState = {
        source: null,
        itemId: null,
        questionId: null
    };

    renderCurrentQuestion();

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

function goToPreviousQuestion() {
    if (currentQuestionIndex > 0) {
        goToQuestion(
            currentQuestionIndex - 1
        );
    }
}

function goToNextQuestion() {
    if (
        currentQuestionIndex <
        activeQuestions.length - 1
    ) {
        goToQuestion(
            currentQuestionIndex + 1
        );

        return;
    }

    finishExam();
}

function renderQuestionNavigation() {
    const container = getElement(
        "question-navigation"
    );

    if (!container) {
        return;
    }

    if (!questionNavigationEnabled) {
        hideElement(container);
        return;
    }

    showElement(container);

    container.innerHTML = activeQuestions.map(
        (question, index) => {
            const answered = isQuestionAnswered(
                question,
                answers[question.__examId]
            );

            return `
                <button
                    type="button"
                    class="
                        ${index === currentQuestionIndex ? "active" : ""}
                        ${answered ? "answered" : ""}
                    "
                    data-action="go-question"
                    data-index="${index}"
                    aria-label="Ir a la pregunta ${index + 1}">

                    ${index + 1}
                </button>
            `;
        }
    ).join("");
}


/* ============================================================
   26. VALIDACIÓN DE RESPUESTAS
   ============================================================ */

function isQuestionAnswered(question, answer) {
    if (
        answer === undefined ||
        answer === null
    ) {
        return false;
    }

    const type = getQuestionType(question);

    switch (type) {
        case "multiple":
        case "true-false":
            return answer !== "";

        case "multiple-select":
            return Array.isArray(answer) &&
                answer.length > 0;

        case "dropdown-group":
        case "picklist": {
            const items = getDropdownItems(question);

            if (!items.length) {
                return false;
            }

            return items.every((item, index) => {
                const id = getDropdownItemId(
                    item,
                    index
                );

                const value = answer[id];

                return value !== "" &&
                    value !== null &&
                    value !== undefined;
            });
        }

        case "matrix": {
            const rows = getMatrixRows(question);

            return rows.length > 0 &&
                rows.every((row, index) => {
                    const id = getDropdownItemId(
                        row,
                        index
                    );

                    const value = answer[id];

                    return Array.isArray(value)
                        ? value.length > 0
                        : value !== "" &&
                          value !== null &&
                          value !== undefined;
                });
        }

        case "dragdrop": {
            const targets = getDragTargets(question);
            const placements = answer.placements ?? {};

            if (!targets.length) {
                return false;
            }

            // Cada destino debe tener al menos un elemento.
            return targets.every((target, index) => {
                const targetId = getDragTargetId(
                    target,
                    index
                );

                return normalizeArray(
                    placements[targetId]
                ).length > 0;
            });
        }

        case "dragdrop-code": {
            const targets = getCodeTargets(question);
            const placements = answer.placements ?? {};

            if (!targets.length) {
                return false;
            }

            // Cada destino debe tener exactamente un bloque.
            return targets.every((target, index) => {
                const targetId = getDragTargetId(
                    target,
                    index
                );

                return normalizeArray(
                    placements[targetId]
                ).length === 1;
            });
        }

        default:
            return false;
    }
}


/* ============================================================
   27. TEMPORIZADOR
   ============================================================ */

function updateTimerVisibility() {
    const timer = getElement("quiz-timer");

    if (!timer) {
        return;
    }

    timer.classList.toggle(
        "hidden",
        !examSettings.showTimer
    );
}

function startTimer() {
    stopTimer();

    timerInterval = window.setInterval(() => {
        elapsedSeconds += 1;

        if (examSettings.showTimer) {
            setText(
                "quiz-timer",
                formatDuration(elapsedSeconds)
            );
        }
    }, 1000);
}

function stopTimer() {
    if (timerInterval !== null) {
        window.clearInterval(timerInterval);
        timerInterval = null;
    }
}


/* ============================================================
   28. EVALUACIÓN
   ============================================================ */

function normalizeComparable(value) {
    if (Array.isArray(value)) {
        return value.map(normalizeComparable);
    }

    if (value && typeof value === "object") {
        if (
            Object.prototype.hasOwnProperty.call(
                value,
                "value"
            ) &&
            Object.keys(value).length === 1
        ) {
            return normalizeComparable(
                value.value
            );
        }

        return Object.keys(value)
            .sort()
            .reduce((result, key) => {
                result[key] = normalizeComparable(
                    value[key]
                );

                return result;
            }, {});
    }

    if (typeof value === "string") {
        return value.trim();
    }

    return value;
}

function valuesEqual(actual, expected) {
    return JSON.stringify(
        normalizeComparable(actual)
    ) === JSON.stringify(
        normalizeComparable(expected)
    );
}

function getExpectedAnswer(question) {
    if (question.answer !== undefined) {
        return question.answer;
    }

    if (question.answers !== undefined) {
        return question.answers;
    }

    return null;
}

function evaluateQuestion(question, answer) {
    switch (getQuestionType(question)) {
        case "multiple":
            return evaluateSimpleAnswer(
                question,
                answer
            );

        case "true-false":
            return valuesEqual(
                normalizeBoolean(answer),
                normalizeBoolean(
                    getExpectedAnswer(question)
                )
            );

        case "multiple-select":
            return evaluateMultipleSelect(
                question,
                answer
            );

        case "dropdown-group":
        case "picklist":
            return evaluateGroupedAnswer(
                question,
                answer
            );

        case "matrix":
            return evaluateMatrix(
                question,
                answer
            );

        case "dragdrop":
            return evaluateDragDrop(
                question,
                answer
            );

        case "dragdrop-code":
            return evaluateDragDropCode(
                question,
                answer
            );

        default:
            return false;
    }
}

function evaluateSimpleAnswer(question, answer) {
    return valuesEqual(
        answer,
        getExpectedAnswer(question)
    );
}

function evaluateMultipleSelect(question, answer) {
    const expected = normalizeArray(
        question.answers ?? question.answer
    );

    const actual = normalizeArray(answer);

    if (!expected.length) {
        return false;
    }

    return valuesEqual(
        actual.map(String).sort(),
        expected.map(String).sort()
    );
}

function evaluateGroupedAnswer(question, answer) {
    const expected =
        question.answer ??
        question.answers ??
        {};

    if (
        !expected ||
        typeof expected !== "object"
    ) {
        return false;
    }

    const actual = answer ?? {};

    const entries = Array.isArray(expected)
        ? expected.map((item, index) => [
            getDropdownItemId(item, index),
            item.answer ?? item.value
        ])
        : Object.entries(expected);

    if (!entries.length) {
        return false;
    }

    return entries.every(([key, value]) =>
        actual[key] !== undefined &&
        actual[key] !== "" &&
        valuesEqual(actual[key], value)
    );
}

function evaluateMatrix(question, answer) {
    const rows = getMatrixRows(question);
    const actual = answer ?? {};

    if (!rows.length) {
        return false;
    }

    return rows.every((row, index) => {
        const id = getDropdownItemId(
            row,
            index
        );

        const expected =
            row?.answer ??
            question.answer?.[id] ??
            question.answers?.[id];

        if (expected === undefined) {
            return false;
        }

        return valuesEqual(
            actual[id],
            expected
        );
    });
}

/*
   Convierte respuestas de tipo:

   {
       "Run VACUUM": "Remove files",
       "Run OPTIMIZE": "Combine files"
   }

   A:

   {
       "Remove files": ["Run VACUUM"],
       "Combine files": ["Run OPTIMIZE"]
   }
*/

function normalizeExpectedPlacements(question, expected) {
    if (expected?.placements) {
        return expected.placements;
    }

    const targets = getDragTargets(question);
    const items = getDragItems(question);

    const targetIds = targets.map(
        (target, index) =>
            getDragTargetId(target, index)
    );

    const keys = Object.keys(expected ?? {});

    if (!keys.length) {
        return {};
    }

    const isTargetMapping = keys.every(key =>
        targetIds.includes(key)
    );

    if (isTargetMapping) {
        const normalized = {};

        keys.forEach(key => {
            normalized[key] = normalizeArray(
                expected[key]
            ).map(String);
        });

        return normalized;
    }

    const converted = {};

    keys.forEach(itemKey => {
        const targetValue = String(
            expected[itemKey]
        );

        const target = targets.find(
            (entry, index) =>
                getDragTargetId(entry, index) === targetValue ||
                getDragTargetText(entry, "") === targetValue
        );

        if (!target) {
            return;
        }

        const targetId = getDragTargetId(
            target,
            targets.indexOf(target)
        );

        const item = items.find(
            (entry, index) =>
                getDragItemId(entry, index) === itemKey ||
                getDragItemText(entry, "") === itemKey
        );

        if (!item) {
            return;
        }

        const itemId = getDragItemId(
            item,
            items.indexOf(item)
        );

        converted[targetId] ??= [];
        converted[targetId].push(itemId);
    });

    return converted;
}

function evaluatePlacements(question, answer) {
    const expected = getExpectedAnswer(question);

    if (
        !expected ||
        typeof expected !== "object"
    ) {
        return false;
    }

    const targets = getDragTargets(question);

    if (!targets.length) {
        return false;
    }

    const actual = answer?.placements ?? answer ?? {};

    const expectedPlacements = normalizeExpectedPlacements(
        question,
        expected
    );

    const allExpected = [];
    const allActual = [];

    for (const values of Object.values(expectedPlacements)) {
        allExpected.push(
            ...normalizeArray(values).map(String)
        );
    }

    for (const values of Object.values(actual)) {
        allActual.push(
            ...normalizeArray(values).map(String)
        );
    }

    // Un bloque no puede estar asignado a más de un destino.
    if (new Set(allActual).size !== allActual.length) {
        return false;
    }

    // No se admiten bloques adicionales ni faltantes.
    if (!valuesEqual(
        [...allActual].sort(),
        [...allExpected].sort()
    )) {
        return false;
    }

    return targets.every((target, index) => {
        const targetId = getDragTargetId(
            target,
            index
        );

        const expectedItems = normalizeArray(
            expectedPlacements[targetId]
        ).map(String).sort();

        const actualItems = normalizeArray(
            actual[targetId]
        ).map(String).sort();

        return valuesEqual(
            actualItems,
            expectedItems
        );
    });
}

function evaluateDragDrop(question, answer) {
    return evaluatePlacements(
        question,
        answer
    );
}

function evaluateDragDropCode(question, answer) {
    // El ejercicio utiliza asignaciones elemento -> destino.
    if (getCodeTargets(question).length) {
        return evaluatePlacements(
            question,
            answer
        );
    }

    // Compatibilidad con bancos antiguos basados en orden.
    const expected = getExpectedAnswer(question);

    if (
        !Array.isArray(expected) &&
        !Array.isArray(expected?.order)
    ) {
        return false;
    }

    const expectedOrder = Array.isArray(expected)
        ? expected
        : expected.order;

    return valuesEqual(
        answer?.order ?? [],
        expectedOrder
    );
}


/* ============================================================
   29. RESULTADOS Y REVISIÓN
   ============================================================ */

function calculateResults() {
    const reviews = activeQuestions.map(
        (question, index) => {
            const id = question.__examId;
            const answer = answers[id];

            return {
                question,
                index,
                answer: deepClone(answer),
                correct: evaluateQuestion(
                    question,
                    answer
                ),
                expected: deepClone(
                    getExpectedAnswer(question)
                ),
                explanation: getQuestionExplanation(question)
            };
        }
    );

    const correct = reviews.filter(
        item => item.correct
    ).length;

    const total = reviews.length;

    const percent = total
        ? Math.round(
            (correct / total) * 100
        )
        : 0;

    return {
        reviews,
        correct,
        total,
        percent,
        passed: percent >= examSettings.passMark
    };
}

function finishExam() {
    if (examFinished) {
        return;
    }

    const unanswered = activeQuestions.filter(
        question =>
            !isQuestionAnswered(
                question,
                answers[question.__examId]
            )
    );

    if (unanswered.length > 0) {
        const confirmed = window.confirm(
            `Tienes ${unanswered.length} pregunta(s) sin responder. ¿Deseas finalizar el examen?`
        );

        if (!confirmed) {
            return;
        }
    }

    examFinished = true;

    stopTimer();

    const results = calculateResults();

    const record = {
        id: `attempt-${Date.now()}`,
        examId: getExamId(activeExam),
        examName: getExamDisplayName(activeExam),
        date: new Date().toISOString(),
        total: results.total,
        correct: results.correct,
        percent: results.percent,
        passed: results.passed,
        passMark: examSettings.passMark,
        durationSeconds: elapsedSeconds,
        answers: deepClone(answers),

        reviews: results.reviews.map(item => ({
            questionId: item.question.__examId,
            correct: item.correct,
            answer: item.answer,
            expected: item.expected
        }))
    };

    const history = getHistory();

    history.push(record);

    saveHistory(history);

    renderResults(results);
}


/* ============================================================
   30. RENDERIZADO DE RESULTADOS
   ============================================================ */

function renderResults(results) {
    hideElement(
        getElement("exam-screen")
    );

    showElement(
        getElement("result-screen")
    );

    const status = getElement("result-status");

    setText(
        "result-score",
        `${results.percent}%`
    );

    setText(
        "result-summary",
        `Obtuviste ${results.correct} respuestas correctas de ${results.total}. ` +
        `El porcentaje mínimo requerido era ${examSettings.passMark}%.`
    );

    if (status) {
        status.textContent = results.passed
            ? "Examen aprobado"
            : "Examen no aprobado";

        status.classList.toggle(
            "failed",
            !results.passed
        );

        status.classList.toggle(
            "passed",
            results.passed
        );
    }

    renderResultReviews(
        results.reviews
    );

    window.scrollTo(0, 0);
}

function formatExplanation(explanation, question) {
    if (
        explanation === null ||
        explanation === undefined ||
        explanation === ""
    ) {
        return "";
    }

    if (typeof explanation === "string") {
        return `<p>${escapeHTML(explanation)}</p>`;
    }

    if (
        typeof explanation === "number" ||
        typeof explanation === "boolean"
    ) {
        return `<p>${escapeHTML(explanation)}</p>`;
    }

    if (Array.isArray(explanation)) {
        return explanation.map(item =>
            formatExplanation(
                item,
                question
            )
        ).join("");
    }

    if (typeof explanation === "object") {
        const rows = getMatrixRows(question);

        return Object.entries(explanation)
            .map(([key, value]) => {
                const rowMatch = key.match(
                    /^row(\d+)$/i
                );

                if (rowMatch) {
                    const index =
                        Number(rowMatch[1]) - 1;

                    const rowText = rows[index]
                        ? getMatrixRowText(
                            rows[index],
                            index
                        )
                        : `Fila ${index + 1}`;

                    return `
                        <section class="result-explanation-section">
                            <strong>
                                ${escapeHTML(rowText)}
                            </strong>

                            ${formatExplanation(
                                value,
                                question
                            )}
                        </section>
                    `;
                }

                return `
                    <section class="result-explanation-section">
                        <strong>
                            ${escapeHTML(formatFieldName(key))}
                        </strong>

                        ${formatExplanation(
                            value,
                            question
                        )}
                    </section>
                `;
            })
            .join("");
    }

    return `<p>${escapeHTML(explanation)}</p>`;
}

function renderResultReviews(reviews) {
    const container = getElement(
        "result-reviews"
    );

    if (!container) {
        return;
    }

    container.innerHTML = reviews.map(item => {
        const question = item.question;
        const questionNumber = item.index + 1;

        return `
            <article class="result-review ${item.correct ? "correct" : "incorrect"}">

                <div class="result-review-header">
                    <strong>Pregunta ${questionNumber}</strong>

                    <span class="status ${item.correct ? "status-passed" : "status-failed"}">
                        ${item.correct ? "Correcta" : "Incorrecta"}
                    </span>
                </div>

                <div class="result-review-question">
                    ${escapeHTML(getQuestionText(question))}
                </div>

                <div class="result-review-answer">
                    <strong>Tu respuesta</strong>
                    <span>
                        ${escapeHTML(
                            formatAnswer(
                                question,
                                item.answer
                            )
                        )}
                    </span>
                </div>

                ${!item.correct ? `
                    <div class="result-review-answer">
                        <strong>Respuesta esperada</strong>
                        <span>
                            ${escapeHTML(
                                formatAnswer(
                                    question,
                                    item.expected
                                )
                            )}
                        </span>
                    </div>
                ` : ""}

                ${item.explanation ? `
                    <div class="result-review-explanation">
                        <strong>Explicación</strong>
                        ${formatExplanation(
                            item.explanation,
                            question
                        )}
                    </div>
                ` : ""}

            </article>
        `;
    }).join("");
}

function formatAnswer(question, answer) {
    if (
        answer === undefined ||
        answer === null ||
        answer === ""
    ) {
        return "Sin responder";
    }

    const type = getQuestionType(question);

    if (
        type === "multiple" ||
        type === "true-false"
    ) {
        if (type === "true-false") {
            const booleanValue = normalizeBoolean(
                answer
            );

            if (booleanValue === true) {
                return "Verdadero";
            }

            if (booleanValue === false) {
                return "Falso";
            }
        }

        const options = getQuestionOptions(question);

        const option = options.find(
            (item, index) =>
                getOptionValue(item, index) === String(answer)
        );

        return option
            ? getOptionText(option)
            : String(answer);
    }

    if (type === "multiple-select") {
        const options = getQuestionOptions(question);

        return normalizeArray(answer)
            .map(value => {
                const option = options.find(
                    (item, index) =>
                        getOptionValue(item, index) === String(value)
                );

                return option
                    ? getOptionText(option)
                    : String(value);
            })
            .join(", ");
    }

    if (
        type === "dropdown-group" ||
        type === "picklist" ||
        type === "matrix"
    ) {
        const items = type === "matrix"
            ? getMatrixRows(question)
            : getDropdownItems(question);

        return Object.entries(answer)
            .map(([key, value]) => {
                const index = items.findIndex(
                    (item, i) =>
                        getDropdownItemId(item, i) === key
                );

                const label = index >= 0
                    ? type === "matrix"
                        ? getMatrixRowText(
                            items[index],
                            index
                        )
                        : getOptionText(items[index]) || key
                    : key;

                const values = normalizeArray(value)
                    .map(String);

                return `${label}: ${values.join(", ")}`;
            })
            .join(" | ");
    }

    if (
        type === "dragdrop" ||
        type === "dragdrop-code"
    ) {
        const placements = answer?.placements ?? {};

        const targets = type === "dragdrop-code"
            ? getCodeTargets(question)
            : getDragTargets(question);

        const items = getDragItems(question);

        return targets.map((target, index) => {
            const targetId = getDragTargetId(
                target,
                index
            );

            const assigned = normalizeArray(
                placements[targetId]
            );

            const labels = assigned.map(itemId => {
                const itemIndex = items.findIndex(
                    (item, i) =>
                        getDragItemId(item, i) === String(itemId)
                );

                return itemIndex >= 0
                    ? getDragItemText(
                        items[itemIndex],
                        itemId
                    )
                    : String(itemId);
            });

            return (
                `${getDragTargetText(target, targetId)}: ` +
                `${labels.join(", ") || "Sin asignar"}`
            );
        }).join(" | ");
    }

    if (typeof answer === "object") {
        return JSON.stringify(answer);
    }

    return String(answer);
}


/* ============================================================
   31. SALIDA DEL EXAMEN
   ============================================================ */

function exitExam() {
    const settings = getSettings();

    if (
        !examFinished &&
        settings.confirmExit
    ) {
        const confirmed = window.confirm(
            "¿Deseas salir del examen? El progreso de este intento se perderá."
        );

        if (!confirmed) {
            return;
        }
    }

    stopTimer();

    if (window.opener) {
        window.close();
        return;
    }

    window.location.href = window.location.pathname;
}

function returnHome() {
    stopTimer();

    if (window.opener) {
        window.close();
        return;
    }

    window.location.href = window.location.pathname;
}


/* ============================================================
   32. EVENTOS GENERALES
   ============================================================ */

function initializeGeneralEvents() {
    document.addEventListener("click", event => {
        const actionElement = event.target.closest(
            "[data-action]"
        );

        if (!actionElement) {
            return;
        }

        switch (actionElement.dataset.action) {
            case "navigate":
                navigateTo(
                    actionElement.dataset.page
                );
                break;

            case "open-exam":
                openExamModal(
                    actionElement.dataset.examId
                );
                break;

            case "go-question":
                goToQuestion(
                    Number(actionElement.dataset.index)
                );
                break;
        }
    });

    getElement("exam-close")?.addEventListener(
        "click",
        closeExamModal
    );

    getElement("exam-cancel")?.addEventListener(
        "click",
        closeExamModal
    );

    getElement("launch-exam")?.addEventListener(
        "click",
        launchExam
    );

    getElement("quiz-prev")?.addEventListener(
        "click",
        goToPreviousQuestion
    );

    getElement("quiz-next")?.addEventListener(
        "click",
        goToNextQuestion
    );

    getElement("quiz-exit")?.addEventListener(
        "click",
        exitExam
    );

    getElement("result-home")?.addEventListener(
        "click",
        returnHome
    );

    getElement("certification-search")?.addEventListener(
        "input",
        renderCertifications
    );

    getElement("certification-filter")?.addEventListener(
        "change",
        renderCertifications
    );

    getElement("history-filter")?.addEventListener(
        "change",
        renderHistory
    );

    getElement("setting-shuffle")?.addEventListener(
        "change",
        readSettingsFromInterface
    );

    getElement("setting-timer")?.addEventListener(
        "change",
        readSettingsFromInterface
    );

    getElement("setting-confirm-exit")?.addEventListener(
        "change",
        readSettingsFromInterface
    );

    getElement("clear-data")?.addEventListener(
        "click",
        clearApplicationData
    );

    getElement("profile-form")?.addEventListener(
        "submit",
        event => {
            event.preventDefault();

            saveProfile({
                name: normalizeString(
                    getElement("profile-name-input")?.value
                ) || DEFAULT_PROFILE.name,

                email: normalizeString(
                    getElement("profile-email-input")?.value
                )
            });

            showMessage(
                "Perfil actualizado."
            );
        }
    );

    getElement("exam-modal")?.addEventListener(
        "click",
        event => {
            if (
                event.target === getElement("exam-modal")
            ) {
                closeExamModal();
            }
        }
    );

    document.addEventListener("keydown", event => {
        if (
            event.key === "Escape" &&
            !getElement("exam-modal")?.classList.contains("hidden")
        ) {
            closeExamModal();
        }
    });
}


/* ============================================================
   33. INICIALIZACIÓN DE LA APLICACIÓN
   ============================================================ */

async function initializeApplication() {
    initializeGeneralEvents();
    initializeAnswerEvents();

    renderUserInformation();
    renderProfile();
    initializeSettings();

    try {
        // Primero se carga el catálogo.
        await loadApplicationData();

        // Después se determina si esta ventana ejecuta un examen.
        const isExam = await initializeExamWindow();

        if (isExam) {
            return;
        }

        renderDashboard();
        renderCertifications();
        renderHistory();

        navigateTo("dashboard");
    } catch (error) {
        console.error(
            "Error inicializando Exam Lab:",
            error
        );

        const container = getElement(
            "page-dashboard"
        );

        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <strong>No fue posible cargar Exam Lab</strong>
                    <p>${escapeHTML(error.message)}</p>
                    <p>
                        Verifica los archivos JSON y ejecuta la aplicación
                        desde un servidor HTTP.
                    </p>
                </div>
            `;

            showElement(container);
        } else {
            showMessage(
                `No fue posible inicializar Exam Lab.\n\n${error.message}`
            );
        }
    }
}


/* ============================================================
   34. ARRANQUE
   ============================================================ */

document.addEventListener(
    "DOMContentLoaded",
    initializeApplication
);