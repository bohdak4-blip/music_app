// DOM-контролер вкладки "Тренування слуху": в'яже кнопки/вибір типу вправи
// з чистою логікою (ear-training-logic.js) і звуком (audio-engine.js),
// зберігає прогрес у localStorage. За тим самим принципом, що app.js для
// вкладок 1-2: сам жодної музичної математики не містить.
//
// Прогрес навмисно зберігається в localStorage, а не на бекенді: це
// нативний pywebview-застосунок з постійним профілем WebView2 (не
// ефемерний прев'ю-фрейм), тож localStorage тут поводиться як у звичайному
// браузері - переживає перезапуски застосунку. Якщо колись знадобиться
// синхронізація прогресу між пристроями чи бекап - можна буде перенести цю
// статистику на /api-ендпоінт з файлом на диску, але для одного користувача
// локально це зайва складність.

const EAR_STORAGE_KEY = "musicApp.earTraining.v1";

const earUi = {
    typeSwitch: document.getElementById("earTypeSwitch"),
    levelBadge: document.getElementById("earLevelBadge"),
    progressFill: document.getElementById("earProgressFill"),
    accuracyText: document.getElementById("earAccuracyText"),
    playBtn: document.getElementById("earPlayBtn"),
    hintBtn: document.getElementById("earHintBtn"),
    hintText: document.getElementById("earHintText"),
    choices: document.getElementById("earChoices"),
    feedback: document.getElementById("earFeedback")
};

// var (не let) навмисно: top-level `let` у класичному <script> НЕ стає
// властивістю глобального об'єкта (на відміну від `var`), тож цей стан
// інакше був би недоступний ні для дебагу з консолі браузера, ні для
// хенд-ролд Node vm-тестів цього проєкту, які читають стан саме так.
var earStats = earLoadStats();
var earCurrentType = "quality";
var earCurrentQuestion = null;
var earAnswered = false;
var earAdvanceTimer = null;
var earInitialized = false;

function earLoadStats() {
    try {
        const raw = localStorage.getItem(EAR_STORAGE_KEY);
        if (!raw) return earCreateDefaultStats();
        const parsed = JSON.parse(raw);
        // Захисне злиття зі стандартною формою - якщо збережена версія була
        // неповною/старішою, відсутні поля все одно отримають дефолти.
        return Object.assign(earCreateDefaultStats(), parsed);
    } catch (e) {
        console.warn("Не вдалося прочитати збережений прогрес тренування слуху:", e);
        return earCreateDefaultStats();
    }
}

function earSaveStats() {
    try {
        localStorage.setItem(EAR_STORAGE_KEY, JSON.stringify(earStats));
    } catch (e) {
        console.warn("Не вдалося зберегти прогрес тренування слуху:", e);
    }
}

// Викликається з app.js::switchTab('ear') - тобто лише в момент реального
// кліку користувача по вкладці. Важливо: це і є той "жест користувача",
// без якого AudioContext не стартував би автоматично.
function earInitIfNeeded() {
    if (earInitialized) return;
    earInitialized = true;
    earNextQuestion();
}

function earSwitchType(type) {
    earCurrentType = type;
    document.querySelectorAll(".ear-type-btn").forEach(b => b.classList.toggle("active", b.dataset.type === type));
    earNextQuestion();
}

function earRenderLevelStatus() {
    const s = earStats[earCurrentType];
    const maxLevel = earGetMaxLevel(earCurrentType);
    earUi.levelBadge.textContent = `Рівень ${s.level + 1} / ${maxLevel + 1}`;

    const correctCount = s.history.filter(Boolean).length;
    const widthPct = Math.min(100, Math.round((s.history.length / EAR_HISTORY_WINDOW) * 100));
    earUi.progressFill.style.width = widthPct + "%";
    earUi.accuracyText.textContent = `${correctCount}/${s.history.length} у поточній серії (потрібно 8+ із ≥75%, щоб відкрити наступний рівень)`;
}

function earChoiceLabel(question, choice) {
    if (question.type === "quality") return EAR_CHORD_QUALITIES.find(q => q.id === choice).label;
    if (question.type === "function") return EAR_FUNCTION_DEGREES[question.baseScale][choice].roman;
    if (question.type === "progression") return choice.label;
    if (question.type === "scale") return EAR_SCALES.find(m => m.id === choice).label;
    return String(choice);
}

function earRenderChoices() {
    earUi.choices.innerHTML = "";
    earCurrentQuestion.choices.forEach((choice, idx) => {
        const btn = document.createElement("button");
        btn.className = "ear-choice-btn";
        btn.textContent = earChoiceLabel(earCurrentQuestion, choice);
        btn.addEventListener("click", () => earSubmitAnswer(idx));
        earUi.choices.appendChild(btn);
    });
}

function earPlayCurrentQuestion() {
    const q = earCurrentQuestion;
    if (!q) return;
    if (q.type === "quality") {
        earPlayChord(q.pcs, { duration: 1.6 });
    } else if (q.type === "function") {
        // Спершу коротка каденція, щоб "встановити" тональність у вусі,
        // потім, з невеликою паузою, цільовий акорд.
        const afterCadence = earPlaySequence(q.cadence, { chordDuration: 0.5, gap: 0.08 });
        earPlayChord(q.pcs, { duration: 1.6, delay: afterCadence + 0.3 });
    } else if (q.type === "progression") {
        earPlaySequence(q.pcsSequence, { chordDuration: 0.85, gap: 0.12 });
    } else if (q.type === "scale") {
        const modeDef = EAR_SCALES.find(m => m.id === q.modeId);
        earPlayScale(q.root, modeDef.intervals, { noteDuration: 0.32 });
    }
}

function earNextQuestion() {
    clearTimeout(earAdvanceTimer);
    earAnswered = false;
    earUi.feedback.textContent = "";
    earUi.feedback.className = "ear-feedback";
    earUi.hintText.style.display = "none";
    earUi.hintText.textContent = "";

    const level = earStats[earCurrentType].level;
    earCurrentQuestion = earGenerateQuestion(earCurrentType, level);
    earRenderLevelStatus();
    earRenderChoices();
    earPlayCurrentQuestion();
}

function earSubmitAnswer(choiceIndex) {
    if (earAnswered || !earCurrentQuestion) return;
    earAnswered = true;

    const q = earCurrentQuestion;
    const correct = earCheckAnswer(q, choiceIndex);

    Array.from(earUi.choices.children).forEach((btn, idx) => {
        btn.disabled = true;
        if (idx === q.correctIndex) btn.classList.add("ear-choice-correct");
        else if (idx === choiceIndex) btn.classList.add("ear-choice-wrong");
    });

    const result = earApplyAnswerToStats(earStats, earCurrentType, correct);
    earStats = result.stats;
    earSaveStats();
    earRenderLevelStatus();

    if (correct) {
        earUi.feedback.textContent = result.leveledUp
            ? `✅ Правильно! 🎉 Рівень ${result.level + 1} розблоковано!`
            : "✅ Правильно!";
        earUi.feedback.className = "ear-feedback ear-feedback-correct";
    } else {
        const correctLabel = earChoiceLabel(q, q.choices[q.correctIndex]);
        earUi.feedback.textContent = `❌ Неправильно. Правильна відповідь: ${correctLabel}.`;
        earUi.feedback.className = "ear-feedback ear-feedback-wrong";
    }

    earAdvanceTimer = setTimeout(earNextQuestion, 2200);
}

function earToggleHint() {
    if (!earCurrentQuestion) return;
    const isVisible = earUi.hintText.style.display !== "none";
    if (isVisible) {
        earUi.hintText.style.display = "none";
    } else {
        earUi.hintText.textContent = "💡 " + earCurrentQuestion.hint;
        earUi.hintText.style.display = "block";
    }
}

if (earUi.typeSwitch) {
    earUi.typeSwitch.querySelectorAll(".ear-type-btn").forEach(btn => {
        btn.addEventListener("click", () => earSwitchType(btn.dataset.type));
    });
}
if (earUi.playBtn) earUi.playBtn.addEventListener("click", earPlayCurrentQuestion);
if (earUi.hintBtn) earUi.hintBtn.addEventListener("click", earToggleHint);
