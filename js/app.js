
"use strict";

/* ============================================================
   EXAM LAB
   Motor principal del simulador DP-600

   Tipos soportados:
   - multiple
   - multiple-select
   - dropdown-group
   - matrix
   - dragdrop
   - dragdrop-code
   ============================================================ */

/* ============================================================
   ESTADO GLOBAL
   ============================================================ */

let caseStudies = [];
let catalog = [];
let activeExam = null;
let questions = [];
let current = 0;
let answers = {};
let examStartedAt = null;
let timerInterval = null;
let examFinished = false;

const $ = id => document.getElementById(id);

const STORE = {
    profile: "examLab.profile",
    history: "examLab.history",
    settings: "examLab.settings"
};

const defaultSettings = {
    defaultCount: 10,
    shuffle: true,
    showTimer: false,
    passMark: 70
};

const QUESTION_TYPE_LABELS = {
    multiple: "Selección única",
    "multiple-select": "Selección múltiple",
    "dropdown-group": "Selección por grupos",
    matrix: "Matriz de respuestas",
    dragdrop: "Relacionar elementos",
    "dragdrop-code": "Completar código"
};

/* ============================================================
   UTILIDADES
   ============================================================ */

function readStore(key, fallback) {
    try {
        const value = JSON.parse(localStorage.getItem(key));
        return value ?? fallback;
    } catch (error) {
        console.warn(`No se pudo leer ${key}:`, error);
        return fallback;
    }
}

function writeStore(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        console.error(`No se pudo guardar ${key}:`, error);
        alert("No fue posible guardar la información en este navegador.");
        return false;
    }
}

function settings() {
    return {
        ...defaultSettings,
        ...readStore(STORE.settings, {})
    };
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function shuffleArray(array) {
    const result = [...array];

    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
}

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeComparable(value) {
    if (value === null || value === undefined) return "";

    return String(value)
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
}

function getOptionValue(option) {
    if (option && typeof option === "object") {
        return option.value ?? option.id ?? option.label ?? option.text ?? "";
    }

    return option;
}

function getOptionLabel(option) {
    if (option && typeof option === "object") {
        return option.label ?? option.text ?? option.value ?? option.id ?? "";
    }

    return option;
}

function getItemLabel(item) {
    if (item && typeof item === "object") {
        return item.label ?? item.name ?? item.value ?? item.id ?? "";
    }

    return item;
}

function getQuestionAnswer(question) {
    return question.answer ?? question.answers ?? null;
}

function getQuestionItems(question) {
    return Array.isArray(question.items)
        ? question.items
        : [];
}

function isEmptyAnswer(value) {
    if (value === null || value === undefined || value === "") {
        return true;
    }

    if (Array.isArray(value)) {
        return value.length === 0;
    }

    if (typeof value === "object") {
        return Object.keys(value).length === 0;
    }

    return false;
}

function formatDuration(seconds) {
    const safeSeconds = Math.max(0, Math.floor(seconds || 0));

    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const remainingSeconds = safeSeconds % 60;

    const pad = value => String(value).padStart(2, "0");

    return hours > 0
        ? `${pad(hours)}:${pad(minutes)}:${pad(remainingSeconds)}`
        : `${pad(minutes)}:${pad(remainingSeconds)}`;
}

async function loadJson(path) {
    const response = await fetch(path, {
        cache: "no-cache"
    });

    if (!response.ok) {
        throw new Error(
            `No se pudo cargar ${path}. Código HTTP: ${response.status}`
        );
    }

    return response.json();
}

function showAppError(message) {
    const container = $("app-error");

    if (!container) {
        console.error(message);
        alert(message);
        return;
    }

    container.classList.remove("hidden");
    container.textContent = message;
}

function hideAppError() {
    const container = $("app-error");

    if (container) {
        container.classList.add("hidden");
        container.textContent = "";
    }
}

function setText(id, value) {
    const element = $(id);

    if (element) {
        element.textContent = value ?? "";
    }
}

function setValue(id, value) {
    const element = $(id);

    if (element) {
        element.value = value ?? "";
    }
}

function setChecked(id, value) {
    const element = $(id);

    if (element) {
        element.checked = Boolean(value);
    }
}

function setVisible(id, visible) {
    const element = $(id);

    if (element) {
        element.classList.toggle("hidden", !visible);
    }
}

/* ============================================================
   INICIALIZACIÓN
   ============================================================ */

async function init() {
    hideAppError();

    try {
        await loadCaseStudies();
        await loadCatalog();

        renderDashboard();
        navigate("dashboard");

    } catch (error) {
        console.error("Error al inicializar Exam Lab:", error);

        showAppError(
            `${error.message}. Verifica los archivos JSON y ejecuta la aplicación mediante un servidor local. No abras index.html directamente con file://.`
        );
    }
}

async function loadCaseStudies() {
    try {
        const data = await loadJson("data/case-studies.json");

        if (Array.isArray(data)) {
            caseStudies = data;
        } else if (Array.isArray(data.caseStudies)) {
            caseStudies = data.caseStudies;
        } else {
            caseStudies = [];
            console.warn(
                "El archivo de casos de estudio no contiene un arreglo reconocido."
            );
        }

    } catch (error) {
        caseStudies = [];

        console.warn(
            "No fue posible cargar los casos de estudio:",
            error.message
        );
    }
}

async function loadCatalog() {
    const data = await loadJson("data/catalog.json");

    catalog = Array.isArray(data)
        ? data
        : Array.isArray(data.exams)
            ? data.exams
            : [];

    if (!catalog.length) {
        throw new Error("El catálogo no contiene certificaciones.");
    }
}

function isExamActive(exam) {
    return exam.active !== false;
}

/* ============================================================
   NAVEGACIÓN
   ============================================================ */

function navigate(page) {
    document.querySelectorAll(".nav").forEach(nav => {
        nav.classList.toggle(
            "active",
            nav.dataset.page === page
        );
    });

    document.querySelectorAll(".page").forEach(container => {
        container.classList.add("hidden");
    });

    const selectedPage = $("page-" + page);

    if (selectedPage) {
        selectedPage.classList.remove("hidden");
    }

    const names = {
        dashboard: "Dashboard",
        certifications: "Certificaciones",
        profile: "Perfil",
        history: "Historial de exámenes",
        settings: "Configuración"
    };

    setText("breadcrumb", names[page] || "Exam Lab");

    switch (page) {
        case "dashboard":
            renderDashboard();
            break;

        case "certifications":
            renderCertifications();
            break;

        case "profile":
            renderProfile();
            break;

        case "history":
            renderHistory();
            break;

        case "settings":
            renderSettings();
            break;
    }
}

/* ============================================================
   DASHBOARD Y CERTIFICACIONES
   ============================================================ */

function examCard(exam) {
    return `
        <article class="card exam-card">

            <div class="exam-top">
                <span class="exam-code">
                    ${escapeHtml(exam.id)}
                </span>

                <span class="pill">
                    ${escapeHtml(exam.level || "Certificación")}
                </span>
            </div>

            <h3>${escapeHtml(exam.name)}</h3>

            <p>
                ${escapeHtml(
                    exam.description ||
                    "Banco de preguntas de práctica."
                )}
            </p>

            <div class="exam-meta">
                Banco de preguntas JSON · Idioma español
            </div>

            <div class="exam-actions">

                <button data-start="${escapeHtml(exam.id)}">
                    Comenzar examen
                </button>

                <button
                    class="secondary"
                    data-info="${escapeHtml(exam.id)}"
                >
                    Detalles
                </button>

            </div>

        </article>
    `;
}

function bindExamButtons() {
    document.querySelectorAll("[data-start]").forEach(button => {
        button.onclick = () => {
            configureExam(button.dataset.start);
        };
    });

    document.querySelectorAll("[data-info]").forEach(button => {
        button.onclick = () => {
            const exam = catalog.find(
                item => String(item.id) === String(button.dataset.info)
            );

            if (!exam) return;

            alert(
                `${exam.id} · ${exam.name}\n${exam.description || ""}`
            );
        };
    });
}

function renderDashboard() {
    const history = readStore(STORE.history, []);

    const average = history.length
        ? Math.round(
            history.reduce((sum, item) => sum + Number(item.percent || 0), 0) /
            history.length
        )
        : 0;

    setText("stat-exams", history.length);
    setText("stat-average", average + "%");

    const best = history.length
        ? Math.max(...history.map(item => Number(item.percent || 0)))
        : 0;

    setText("stat-best", best + "%");

    setText(
        "stat-available",
        catalog.filter(isExamActive).length
    );

    const dashboardExams = $("dashboard-exams");

    if (dashboardExams) {
        dashboardExams.innerHTML = catalog
            .filter(isExamActive)
            .slice(0, 2)
            .map(examCard)
            .join("");

        bindExamButtons();
    }

    const recent = history.slice(-4).reverse();

    const dashboardHistory = $("dashboard-history");

    if (dashboardHistory) {
        dashboardHistory.innerHTML = recent.length
            ? recent.map(item => `
                <tr>
                    <td>${escapeHtml(item.examId)}</td>
                    <td>${escapeHtml(item.dateLabel)}</td>
                    <td class="score">${Number(item.percent || 0)}%</td>
                    <td>${Number(item.correct || 0)}/${Number(item.total || 0)}</td>
                </tr>
            `).join("")
            : `
                <tr>
                    <td colspan="4" class="empty">
                        Aún no tienes intentos registrados.
                    </td>
                </tr>
            `;
    }
}

function renderCertifications() {
    const container = $("certification-list");

    if (!container) return;

    const activeCatalog = catalog.filter(isExamActive);

    container.innerHTML = activeCatalog.length
        ? activeCatalog.map(examCard).join("")
        : `<div class="empty">No hay certificaciones disponibles.</div>`;

    bindExamButtons();
}

/* ============================================================
   PERFIL
   ============================================================ */

function renderProfile() {
    const profile = readStore(
        STORE.profile,
        {
            name: "Estudiante",
            email: ""
        }
    );

    const history = readStore(STORE.history, []);

    setValue("profile-name", profile.name || "");
    setValue("profile-email", profile.email || "");

    setText("profile-total", history.length);

    const average = history.length
        ? Math.round(
            history.reduce((sum, item) => sum + Number(item.percent || 0), 0) /
            history.length
        )
        : 0;

    setText("profile-average", average + "%");
}

/* ============================================================
   HISTORIAL
   ============================================================ */

function renderHistory() {
    const container = $("history-rows");

    if (!container) return;

    const history = readStore(STORE.history, []).slice().reverse();

    container.innerHTML = history.length
        ? history.map(item => `
            <tr>
                <td>${escapeHtml(item.dateLabel)}</td>
                <td>${escapeHtml(item.examId)}</td>
                <td>${Number(item.total || 0)}</td>
                <td>${Number(item.correct || 0)}</td>
                <td class="score">${Number(item.percent || 0)}%</td>
                <td>
                    ${
                        Number(item.percent || 0) >= settings().passMark
                            ? "Aprobado"
                            : "Por mejorar"
                    }
                </td>
            </tr>
        `).join("")
        : `
            <tr>
                <td colspan="6" class="empty">
                    No hay exámenes completados todavía.
                </td>
            </tr>
        `;
}

/* ============================================================
   CONFIGURACIÓN
   ============================================================ */

function renderSettings() {
    const config = settings();

    setValue("setting-count", config.defaultCount);
    setChecked("setting-shuffle", config.shuffle);
    setChecked("setting-timer", config.showTimer);
    setValue("setting-pass", config.passMark);
}

/* ============================================================
   CONFIGURACIÓN DEL EXAMEN
   ============================================================ */

function configureExam(id) {
    activeExam = catalog.find(
        exam => String(exam.id) === String(id)
    );

    if (!activeExam) {
        alert("No se encontró la certificación seleccionada.");
        return;
    }

    setText("modal-title", `Configurar ${activeExam.id}`);
    setText("modal-description", activeExam.name);

    setValue("exam-count", settings().defaultCount);

    setVisible("exam-modal", true);

    const launchButton = $("launch-exam");

    if (launchButton) {
        launchButton.disabled = false;

        launchButton.onclick = () => {
            const count = Number($("exam-count").value);

            if (!Number.isInteger(count) || count < 1) {
                alert("Ingresa una cantidad válida de preguntas.");
                return;
            }

            launchExam(count);
        };
    }
}

/* ============================================================
   CARGA DEL BANCO DE PREGUNTAS
   ============================================================ */

async function launchExam(count) {
    const launchButton = $("launch-exam");

    try {
        if (!activeExam) {
            throw new Error("No hay una certificación seleccionada.");
        }

        if (!activeExam.questionFile) {
            throw new Error(
                "La certificación no tiene definido questionFile en el catálogo."
            );
        }

        if (launchButton) {
            launchButton.disabled = true;
            launchButton.textContent = "Cargando...";
        }

        const data = await loadJson(activeExam.questionFile);

        const bank = Array.isArray(data)
            ? data
            : Array.isArray(data.questions)
                ? data.questions
                : [];

        if (!bank.length) {
            throw new Error("El banco de preguntas está vacío.");
        }

        const supportedTypes = Object.keys(QUESTION_TYPE_LABELS);

        const validBank = bank.filter(question => {
            return (
                question &&
                question.id !== undefined &&
                question.type &&
                question.question &&
                supportedTypes.includes(question.type)
            );
        });

        if (!validBank.length) {
            throw new Error(
                "No se encontraron preguntas válidas con tipos soportados."
            );
        }

        if (validBank.length !== bank.length) {
            console.warn(
                `Se omitieron ${bank.length - validBank.length} preguntas incompletas o con tipos no soportados.`
            );
        }

        const config = settings();

        const selectedBank = config.shuffle
            ? shuffleArray(validBank)
            : [...validBank];

        questions = selectedBank.slice(
            0,
            Math.min(count, selectedBank.length)
        );

        current = 0;
        answers = {};
        examStartedAt = Date.now();
        examFinished = false;

        stopTimer();

        setVisible("exam-modal", false);
        setVisible("result-screen", false);
        setVisible("exam-screen", true);

        startTimer();

        renderQuestion();

    } catch (error) {
        console.error("Error al iniciar examen:", error);
        alert(error.message);

    } finally {
        if (launchButton) {
            launchButton.disabled = false;
            launchButton.textContent = "Iniciar examen";
        }
    }
}

/* ============================================================
   TEMPORIZADOR
   ============================================================ */

function startTimer() {
    stopTimer();

    const timer = $("quiz-timer");

    if (!timer) return;

    if (!settings().showTimer) {
        timer.classList.add("hidden");
        return;
    }

    timer.classList.remove("hidden");

    updateTimer();

    timerInterval = setInterval(updateTimer, 1000);
}

function updateTimer() {
    const timer = $("quiz-timer");

    if (!timer || !examStartedAt) return;

    const elapsedSeconds = Math.floor(
        (Date.now() - examStartedAt) / 1000
    );

    timer.textContent = formatDuration(elapsedSeconds);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

/* ============================================================
   ELEMENTOS DE RESPUESTA
   ============================================================ */

function createSelect(options, selectedValue, onChange) {
    const select = document.createElement("select");

    select.className = "pick-select";

    const placeholder = document.createElement("option");

    placeholder.value = "";
    placeholder.textContent = "Selecciona una respuesta...";

    select.append(placeholder);

    (options || []).forEach(option => {
        const element = document.createElement("option");

        element.value = getOptionValue(option);
        element.textContent = getOptionLabel(option);

        select.append(element);
    });

    select.value = selectedValue ?? "";

    select.onchange = () => {
        onChange(select.value);
    };

    return select;
}

function createOption(option, selected, onChange, inputType = "radio") {
    const label = document.createElement("label");

    label.className = "option";

    const input = document.createElement("input");

    input.type = inputType;
    input.value = getOptionValue(option);

    if (inputType === "radio") {
        input.name = "response";
    }

    input.checked = selected;

    input.onchange = () => {
        onChange(input.checked);
    };

    const span = document.createElement("span");

    span.textContent = getOptionLabel(option);

    label.append(input, span);

    return label;
}

/* ============================================================
   RENDERIZADO PRINCIPAL
   ============================================================ */

function renderQuestion() {
    const question = questions[current];

    if (!question) return;

    renderCaseStudy(question);

    setText("quiz-exam", activeExam.id);

    setText(
        "quiz-counter",
        `Pregunta ${current + 1} de ${questions.length}`
    );

    updateProgress();

    setText(
        "quiz-type",
        QUESTION_TYPE_LABELS[question.type] || question.type
    );

    setText("quiz-question", question.question);

    const answerContainer = $("quiz-answer");

    if (!answerContainer) return;

    answerContainer.innerHTML = "";

    renderQuestionImage(question, answerContainer);

    switch (question.type) {
        case "multiple":
            renderMultiple(question, answerContainer);
            break;

        case "multiple-select":
            renderMultipleSelect(question, answerContainer);
            break;

        case "dropdown-group":
            renderDropdownGroup(question, answerContainer);
            break;

        case "matrix":
            renderMatrix(question, answerContainer);
            break;

        case "dragdrop":
            renderDragDrop(question, answerContainer);
            break;

        case "dragdrop-code":
            renderDragDropCode(question, answerContainer);
            break;

        default:
            answerContainer.textContent =
                `Tipo de pregunta no soportado: ${question.type}`;
    }

    renderCodeTemplate(question, answerContainer);

    const previous = $("quiz-prev");
    const next = $("quiz-next");

    if (previous) {
        previous.disabled = current === 0;
    }

    if (next) {
        next.textContent =
            current === questions.length - 1
                ? "Finalizar examen"
                : "Siguiente";
    }

    updateTimer();
}

function updateProgress() {
    const progress = $("quiz-progress");

    if (!progress || !questions.length) return;

    const percentage = ((current + 1) / questions.length) * 100;

    let bar = progress.querySelector("div");

    if (!bar) {
        bar = document.createElement("div");
        progress.append(bar);
    }

    bar.style.width = `${percentage}%`;

    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuemax", "100");
    progress.setAttribute("aria-valuenow", String(Math.round(percentage)));
}

/* ============================================================
   IMÁGENES
   ============================================================ */

function resolveAssetPath(imagePath) {
    if (!imagePath) return "";

    const base = activeExam?.assetsPath;

    if (!base) return imagePath;

    if (/^(https?:|data:|\/)/i.test(imagePath)) {
        return imagePath;
    }

    return `${base.replace(/\/+$/, "")}/${imagePath.replace(/^\/+/, "")}`;
}

function renderQuestionImage(question, container) {
    const imagePaths = [
        question.image,
        question.answerAreaImage
    ].filter(Boolean);

    imagePaths.forEach((imagePath, index) => {
        const image = document.createElement("img");

        image.src = resolveAssetPath(imagePath);

        image.alt = index === 0
            ? "Imagen de referencia de la pregunta"
            : "Imagen del área de respuesta";

        image.className = "question-image";
        image.loading = "lazy";

        image.onerror = () => image.remove();

        container.append(image);
    });
}

/* ============================================================
   TIPO: MULTIPLE
   ============================================================ */

function renderMultiple(question, container) {
    const selected = answers[question.id];

    (question.options || []).forEach(option => {
        const value = getOptionValue(option);

        container.append(
            createOption(
                option,
                normalizeComparable(selected) === normalizeComparable(value),
                () => {
                    answers[question.id] = value;
                }
            )
        );
    });
}

/* ============================================================
   TIPO: MULTIPLE-SELECT
   ============================================================ */

function renderMultipleSelect(question, container) {
    const selected = Array.isArray(answers[question.id])
        ? answers[question.id]
        : [];

    (question.options || []).forEach(option => {
        const value = getOptionValue(option);

        container.append(
            createOption(
                option,
                selected.some(
                    item => normalizeComparable(item) === normalizeComparable(value)
                ),
                checked => {
                    let currentSelection = [
                        ...(answers[question.id] || [])
                    ];

                    if (checked) {
                        if (!currentSelection.includes(value)) {
                            currentSelection.push(value);
                        }
                    } else {
                        currentSelection = currentSelection.filter(
                            item => normalizeComparable(item) !== normalizeComparable(value)
                        );
                    }

                    answers[question.id] = currentSelection;
                },
                "checkbox"
            )
        );
    });
}

/* ============================================================
   TIPO: DROPDOWN-GROUP
   ============================================================ */

function renderDropdownGroup(question, container) {
    const saved = answers[question.id] || {};

    getQuestionItems(question).forEach(item => {
        const labelText = getItemLabel(item);
        const options = item.options || question.options || [];

        const wrapper = document.createElement("div");

        wrapper.className = "dropdown-item";

        const label = document.createElement("b");

        label.textContent = labelText;

        const select = createSelect(
            options,
            saved[labelText],
            value => {
                answers[question.id] = {
                    ...(answers[question.id] || {}),
                    [labelText]: value
                };
            }
        );

        wrapper.append(label, select);

        container.append(wrapper);
    });
}

/* ============================================================
   TIPO: MATRIX
   ============================================================ */

function renderMatrix(question, container) {
    const saved = answers[question.id] || {};

    const columns = question.columns || [];
    const rows = question.rows || [];

    const wrapper = document.createElement("div");

    wrapper.className = "table-wrap matrix-wrapper";

    const table = document.createElement("table");

    table.className = "matrix-table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    const statementHeader = document.createElement("th");

    statementHeader.textContent = "Enunciado";

    headerRow.append(statementHeader);

    columns.forEach(column => {
        const th = document.createElement("th");

        th.textContent = getOptionLabel(column);

        headerRow.append(th);
    });

    thead.append(headerRow);
    table.append(thead);

    const tbody = document.createElement("tbody");

    rows.forEach((row, index) => {
        const tr = document.createElement("tr");

        const statement = document.createElement("td");

        statement.textContent = row.statement ?? row.label ?? `Elemento ${index + 1}`;

        tr.append(statement);

        columns.forEach(column => {
            const columnValue = getOptionValue(column);

            const td = document.createElement("td");

            const label = document.createElement("label");

            label.className = "matrix-cell";

            const input = document.createElement("input");

            input.type = "radio";
            input.name = `matrix-${question.id}-${index}`;
            input.value = columnValue;

            const rowKey = row.statement ?? row.label ?? `Elemento ${index + 1}`;

            input.checked =
                normalizeComparable(saved[rowKey]) ===
                normalizeComparable(columnValue);

            input.onchange = () => {
                answers[question.id] = {
                    ...(answers[question.id] || {}),
                    [rowKey]: columnValue
                };
            };

            label.append(input);
            td.append(label);
            tr.append(td);
        });

        tbody.append(tr);
    });

    table.append(tbody);
    wrapper.append(table);
    container.append(wrapper);
}

/* ============================================================
   TIPO: DRAGDROP
   ============================================================ */

function renderDragDrop(question, container) {
    renderMatchingQuestion(question, container, false);
}

/* ============================================================
   TIPO: DRAGDROP-CODE
   ============================================================ */

function renderDragDropCode(question, container) {
    renderMatchingQuestion(question, container, true);
}

/* ============================================================
   RENDERIZADO COMPARTIDO DE RELACIONES
   ============================================================ */

function renderMatchingQuestion(question, container, isCode) {
    const saved = answers[question.id] || {};

    if (isCode) {
        const description = document.createElement("p");

        description.className = "muted";
        description.textContent =
            "Selecciona el elemento que corresponde a cada espacio.";

        container.append(description);
    }

    const grid = document.createElement("div");

    grid.className = "match-grid";

    getQuestionItems(question).forEach(item => {
        const labelText = getItemLabel(item);

        const wrapper = document.createElement("div");

        wrapper.className = "match-item";

        const label = document.createElement("b");

        label.textContent = labelText;

        const options = question.targets || question.options || [];

        const select = createSelect(
            options,
            saved[labelText],
            value => {
                answers[question.id] = {
                    ...(answers[question.id] || {}),
                    [labelText]: value
                };
            }
        );

        wrapper.append(label, select);
        grid.append(wrapper);
    });

    container.append(grid);
}

/* ============================================================
   PLANTILLAS DE CÓDIGO
   ============================================================ */

function renderCodeTemplate(question, container) {
    if (!Array.isArray(question.codeTemplate) || !question.codeTemplate.length) {
        return;
    }

    const wrapper = document.createElement("div");

    wrapper.className = "code-template";

    const title = document.createElement("h4");

    title.textContent = "Código de referencia";

    const pre = document.createElement("pre");

    const code = document.createElement("code");

    code.textContent = question.codeTemplate.join("\n");

    pre.append(code);
    wrapper.append(title, pre);

    container.append(wrapper);
}

/* ============================================================
   NAVEGACIÓN ENTRE PREGUNTAS
   ============================================================ */

function previousQuestion() {
    if (current > 0 && !examFinished) {
        current--;
        renderQuestion();
    }
}

function nextQuestion() {
    if (examFinished) return;

    if (current < questions.length - 1) {
        current++;
        renderQuestion();
    } else {
        finishExam();
    }
}

/* ============================================================
   COMPARACIÓN DE RESPUESTAS
   ============================================================ */

function arraysEqual(first, second) {
    if (!Array.isArray(first) || !Array.isArray(second)) {
        return false;
    }

    if (first.length !== second.length) {
        return false;
    }

    const a = first
        .map(normalizeComparable)
        .sort();

    const b = second
        .map(normalizeComparable)
        .sort();

    return a.every((value, index) => value === b[index]);
}

function objectsEqual(first, second) {
    if (
        !first ||
        !second ||
        typeof first !== "object" ||
        typeof second !== "object" ||
        Array.isArray(first) ||
        Array.isArray(second)
    ) {
        return false;
    }

    const firstKeys = Object.keys(first);
    const secondKeys = Object.keys(second);

    if (firstKeys.length !== secondKeys.length) {
        return false;
    }

    return firstKeys.every(key => {
        return (
            Object.prototype.hasOwnProperty.call(second, key) &&
            normalizeComparable(first[key]) ===
            normalizeComparable(second[key])
        );
    });
}

function compareAnswer(userAnswer, expectedAnswer) {
    if (Array.isArray(expectedAnswer)) {
        return arraysEqual(userAnswer, expectedAnswer);
    }

    if (
        expectedAnswer &&
        typeof expectedAnswer === "object"
    ) {
        return objectsEqual(userAnswer, expectedAnswer);
    }

    return (
        normalizeComparable(userAnswer) ===
        normalizeComparable(expectedAnswer)
    );
}

/* ============================================================
   EVALUACIÓN POR TIPO DE PREGUNTA
   ============================================================ */

function correct(question) {
    const userAnswer = answers[question.id];

    if (isEmptyAnswer(userAnswer)) {
        return false;
    }

    switch (question.type) {
        case "multiple":
            return compareAnswer(
                userAnswer,
                getQuestionAnswer(question)
            );

        case "multiple-select":
            return compareAnswer(
                userAnswer,
                getQuestionAnswer(question)
            );

        case "dropdown-group":
        case "matrix":
            return correctGroupedAnswer(question, userAnswer);

        case "dragdrop":
        case "dragdrop-code":
            return compareAnswer(
                userAnswer,
                getQuestionAnswer(question)
            );

        default:
            return false;
    }
}

function correctGroupedAnswer(question, userAnswer) {
    if (!userAnswer || typeof userAnswer !== "object") {
        return false;
    }

    const items = getQuestionItems(question);
    const rows = question.rows || [];

    const expected = {};

    if (question.type === "dropdown-group") {
        items.forEach(item => {
            const key = getItemLabel(item);

            if (item.answer !== undefined) {
                expected[key] = item.answer;
            }
        });
    }

    if (question.type === "matrix") {
        rows.forEach((row, index) => {
            const key = row.statement ?? row.label ?? `Elemento ${index + 1}`;

            if (row.answer !== undefined) {
                expected[key] = row.answer;
            }
        });
    }

    // Algunas estructuras pueden definir la respuesta en question.answer.
    const declaredAnswer = getQuestionAnswer(question);

    if (
        declaredAnswer &&
        typeof declaredAnswer === "object" &&
        !Array.isArray(declaredAnswer)
    ) {
        Object.assign(expected, declaredAnswer);
    }

    if (!Object.keys(expected).length) {
        return false;
    }

    return objectsEqual(userAnswer, expected);
}

/* ============================================================
   PRESENTACIÓN DE RESPUESTAS
   ============================================================ */

function answerLabel(question, value) {
    if (isEmptyAnswer(value)) {
        return "Sin responder";
    }

    if (Array.isArray(value)) {
        return value.map(String).join(" · ");
    }

    if (typeof value === "object") {
        return Object.entries(value)
            .map(([key, item]) => {
                return `${key} → ${item || "Sin asignar"}`;
            })
            .join(" · ");
    }

    return String(value);
}

function correctAnswerLabel(question) {
    const answer = getQuestionAnswer(question);

    if (answer === null || answer === undefined) {
        if (question.type === "dropdown-group") {
            return (question.items || [])
                .map(item => `${getItemLabel(item)} → ${item.answer ?? "No disponible"}`)
                .join(" · ");
        }

        if (question.type === "matrix") {
            return (question.rows || [])
                .map(row => `${row.statement ?? row.label} → ${row.answer ?? "No disponible"}`)
                .join(" · ");
        }

        return "No disponible";
    }

    if (Array.isArray(answer)) {
        return answer.join(" · ");
    }

    if (typeof answer === "object") {
        return Object.entries(answer)
            .map(([key, value]) => `${key} → ${value}`)
            .join(" · ");
    }

    return String(answer);
}

/* ============================================================
   EXPLICACIONES
   ============================================================ */

function renderExplanation(explanation) {
    if (!explanation) {
        return "No hay explicación disponible.";
    }

    if (typeof explanation === "string") {
        return escapeHtml(explanation);
    }

    if (Array.isArray(explanation)) {
        return explanation
            .map(item => `<p>${escapeHtml(item)}</p>`)
            .join("");
    }

    if (typeof explanation === "object") {
        return Object.entries(explanation)
            .map(([key, value]) => `
                <p>
                    <b>${escapeHtml(key)}:</b>
                    ${escapeHtml(
                        typeof value === "object"
                            ? JSON.stringify(value)
                            : value
                    )}
                </p>
            `)
            .join("");
    }

    return "No hay explicación disponible.";
}

/* ============================================================
   FINALIZAR EXAMEN
   ============================================================ */

function finishExam() {
    if (examFinished || !questions.length) return;

    examFinished = true;

    stopTimer();

    const right = questions.filter(correct).length;

    const percent = Math.round(
        (right / questions.length) * 100
    );

    const date = new Date();

    const durationSeconds = Math.round(
        (Date.now() - examStartedAt) / 1000
    );

    const record = {
        examId: activeExam.id,
        date: date.toISOString(),
        dateLabel: date.toLocaleString("es-CO"),
        total: questions.length,
        correct: right,
        percent,
        durationSeconds
    };

    const history = readStore(STORE.history, []);

    history.push(record);

    writeStore(STORE.history, history);

    setVisible("exam-screen", false);
    setVisible("result-screen", true);

    setText("result-score", percent + "%");

    setText(
        "result-summary",
        `${right} de ${questions.length} respuestas correctas · Tiempo: ${formatDuration(durationSeconds)}`
    );

    renderResults();

    renderDashboard();
}

function renderResults() {
    const container = $("result-reviews");

    if (!container) return;

    container.innerHTML = questions
        .map((question, index) => {
            const isCorrect = correct(question);

            const userResponse = answerLabel(
                question,
                answers[question.id]
            );

            const expectedResponse = correctAnswerLabel(question);

            return `
                <article class="review ${isCorrect ? "good" : "bad"}">

                    <b>
                        ${index + 1}.
                        ${escapeHtml(question.question)}
                    </b>

                    <p>
                        <strong>
                            ${isCorrect ? "Correcta" : "Incorrecta"}
                        </strong>
                    </p>

                    <p>
                        <b>Tu respuesta:</b>
                        ${escapeHtml(userResponse)}
                    </p>

                    <p>
                        <b>Respuesta correcta:</b>
                        ${escapeHtml(expectedResponse)}
                    </p>

                    <div class="explain">
                        <b>Explicación:</b>
                        ${renderExplanation(question.explanation)}
                    </div>

                </article>
            `;
        })
        .join("");
}

/* ============================================================
   CASOS DE ESTUDIO
   ============================================================ */

function renderCaseStudy(question) {
    const container = $("case-study");

    if (!container) return;

    container.innerHTML = "";

    if (!question.caseStudyId) {
        container.classList.add("hidden");
        return;
    }

    const study = caseStudies.find(
        item => String(item.id) === String(question.caseStudyId)
    );

    if (!study) {
        container.classList.add("hidden");
        return;
    }

    container.classList.remove("hidden");

    const title = document.createElement("h3");

    title.textContent = study.title || "Caso de estudio";

    const details = document.createElement("details");

    const summary = document.createElement("summary");

    summary.textContent = "Ver caso de estudio";

    const content = document.createElement("div");

    content.className = "case-study-content";

    const source = getCaseStudyContent(study);

    renderCaseStudyObject(source, content);

    details.append(summary, content);

    container.append(title, details);
}

function getCaseStudyContent(study) {
    if (study.fullText) {
        return study.fullText;
    }

    if (study.scenario) {
        return study.scenario;
    }

    // Estructuras habituales de casos de estudio.
    const sections = [
        "overview",
        "existingEnvironment",
        "requirements",
        "technicalRequirements",
        "securityRequirements",
        "reportRequirements"
    ];

    const content = {};

    sections.forEach(key => {
        if (study[key] !== undefined) {
            content[key] = study[key];
        }
    });

    if (Object.keys(content).length) {
        return content;
    }

    const excluded = ["id", "title", "questionCount", "questionNumbers"];

    return Object.fromEntries(
        Object.entries(study).filter(
            ([key]) => !excluded.includes(key)
        )
    );
}

function renderCaseStudyObject(object, container, level = 0) {
    if (object === null || object === undefined) return;

    if (
        typeof object === "string" ||
        typeof object === "number" ||
        typeof object === "boolean"
    ) {
        const paragraph = document.createElement("p");

        paragraph.textContent = String(object);

        container.append(paragraph);

        return;
    }

    if (Array.isArray(object)) {
        const list = document.createElement("ul");

        object.forEach(item => {
            const li = document.createElement("li");

            if (typeof item === "object" && item !== null) {
                renderCaseStudyObject(item, li, level + 1);
            } else {
                li.textContent = String(item);
            }

            list.append(li);
        });

        container.append(list);

        return;
    }

    Object.entries(object).forEach(([key, value]) => {
        const section = document.createElement("section");

        section.className = "case-study-section";

        const heading = document.createElement(
            level === 0 ? "h4" : "h5"
        );

        heading.textContent = formatCaseStudyTitle(key);

        section.append(heading);

        if (typeof value === "object" && value !== null) {
            renderCaseStudyObject(
                value,
                section,
                level + 1
            );
        } else {
            const paragraph = document.createElement("p");

            paragraph.textContent = String(value);

            section.append(paragraph);
        }

        container.append(section);
    });
}

function formatCaseStudyTitle(value) {
    return String(value)
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/[_-]/g, " ")
        .replace(/\b\w/g, character => character.toUpperCase());
}

/* ============================================================
   EVENTOS DE INTERFAZ
   ============================================================ */

function bindInterfaceEvents() {
    document.querySelectorAll(".nav").forEach(nav => {
        nav.onclick = event => {
            event.preventDefault();

            if (examStartedAt && !examFinished &&
                $("exam-screen") &&
                !$("exam-screen").classList.contains("hidden")) {
                return;
            }

            navigate(nav.dataset.page);
        };
    });

    if ($("modal-close")) {
        $("modal-close").onclick = () => {
            setVisible("exam-modal", false);
        };
    }

    if ($("exam-cancel")) {
        $("exam-cancel").onclick = () => {
            setVisible("exam-modal", false);
        };
    }

    if ($("quiz-prev")) {
        $("quiz-prev").onclick = previousQuestion;
    }

    if ($("quiz-next")) {
        $("quiz-next").onclick = nextQuestion;
    }

    if ($("quiz-exit")) {
        $("quiz-exit").onclick = () => {
            if (
                confirm(
                    "¿Salir del examen? Se perderán las respuestas de este intento."
                )
            ) {
                stopTimer();

                examFinished = true;
                examStartedAt = null;

                setVisible("exam-screen", false);

                navigate("certifications");
            }
        };
    }

    if ($("result-home")) {
        $("result-home").onclick = () => {
            setVisible("result-screen", false);

            examStartedAt = null;
            questions = [];
            answers = {};

            navigate("dashboard");
        };
    }

    if ($("profile-save")) {
        $("profile-save").onclick = saveProfile;
    }

    if ($("settings-save")) {
        $("settings-save").onclick = saveSettings;
    }

    if ($("history-clear")) {
        $("history-clear").onclick = clearHistory;
    }

    document.addEventListener("keydown", event => {
        if (
            event.key === "Escape" &&
            $("exam-modal") &&
            !$("exam-modal").classList.contains("hidden")
        ) {
            setVisible("exam-modal", false);
        }
    });
}

/* ============================================================
   GUARDAR PERFIL
   ============================================================ */

function saveProfile() {
    const name = $("profile-name")?.value.trim() || "Estudiante";
    const email = $("profile-email")?.value.trim() || "";

    writeStore(STORE.profile, {
        name,
        email
    });

    alert("Perfil guardado en este navegador.");
}

/* ============================================================
   GUARDAR CONFIGURACIÓN
   ============================================================ */

function saveSettings() {
    const count = Number($("setting-count")?.value);
    const passMark = Number($("setting-pass")?.value);

    if (!Number.isInteger(count) || count < 1) {
        alert("La cantidad de preguntas debe ser un entero mayor que cero.");
        return;
    }

    if (
        !Number.isFinite(passMark) ||
        passMark < 0 ||
        passMark > 100
    ) {
        alert("El porcentaje mínimo debe estar entre 0 y 100.");
        return;
    }

    writeStore(STORE.settings, {
        defaultCount: count,
        shuffle: Boolean($("setting-shuffle")?.checked),
        showTimer: Boolean($("setting-timer")?.checked),
        passMark
    });

    alert("Configuración guardada.");
}

/* ============================================================
   LIMPIAR HISTORIAL
   ============================================================ */

function clearHistory() {
    if (
        confirm(
            "¿Eliminar todo el historial guardado en este navegador?"
        )
    ) {
        writeStore(STORE.history, []);

        renderHistory();
        renderDashboard();
    }
}

/* ============================================================
   INICIAR APLICACIÓN
   ============================================================ */

bindInterfaceEvents();
init();