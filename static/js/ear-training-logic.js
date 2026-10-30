// Чиста логіка гри "Тренування слуху": генерація питань, перевірка
// відповіді, система рівнів. Без DOM, без Web Audio, без localStorage -
// легко тестувати напряму в Node (vm-контекст без жодного DOM-стабу,
// на відміну від app.js/audio-chords.js). За тим самим принципом, що
// backend/voice_leading.py і backend/chord_detection.py на бекенді: чиста
// логіка окремо від "контролера" (там Flask-маршрути, тут DOM/аудіо —
// ear-training.js).
//
// Залежить лише від "чистих даних" у ear-training-data.js (має бути
// завантажений раніше — класичний <script>, спільна глобальна область
// видимості, як і решта скриптів застосунку).

// Формули гам (у півтонах від тоніки) для мажору (Ionian) і натурального
// мінору (Aeolian). Навмисно продубльовано тут, а не взято з modesData у
// theory.js: вправа "Функція акорду" свідомо незалежна від системи ладів
// застосунку (яка підтримує усі 7 ладів) - лише звичайний мажор/мінор,
// де прийняті позначення I/ii/iii/IV/V/vi/vii° взагалі мають сенс.
const EAR_SCALE_INTERVALS = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10]
};

const EAR_HISTORY_WINDOW = 10;
const EAR_UNLOCK_MIN_ATTEMPTS = 8;
const EAR_UNLOCK_ACCURACY = 0.75;

function earPickRandomItem(arr, rng) {
    return arr[Math.floor(rng() * arr.length)];
}

// Fisher-Yates, з ін'єктованим rng (детерміновано для тестів).
function earShuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function earCumulativeTierPool(tiers, levelIndex) {
    const clamped = Math.max(0, Math.min(levelIndex, tiers.length - 1));
    let pool = [];
    for (let i = 0; i <= clamped; i++) pool = pool.concat(tiers[i]);
    return pool;
}

function earPickHint(hints, rng) {
    if (!hints || hints.length === 0) return "";
    return earPickRandomItem(hints, rng);
}

// Максимальний рівень (0-індексований) для кожного типу вправи - єдине
// джерело правди, яким користуються і генератор питань, і система рівнів
// (applyAnswerToStats), щоб не розсинхронізувати межі.
function earGetMaxLevel(exerciseType) {
    if (exerciseType === "quality") return EAR_QUALITY_LEVEL_TIERS.length - 1;
    if (exerciseType === "function") return EAR_FUNCTION_LEVEL_TIERS.major.length; // +1 рівень "змішування" ладів
    if (exerciseType === "progression") return EAR_PROGRESSION_TIERS.length - 1;
    if (exerciseType === "scale") return EAR_SCALE_LEVEL_TIERS.length - 1;
    throw new Error("Невідомий тип вправи: " + exerciseType);
}

// Будує тризвуччя на заданому ступені гами методом терцової надбудови
// (той самий прийом, що getChordInfo('auto') в app.js): беремо ноти через
// один ступінь гами (+2, +4 позиції по колу з 7 нот).
function earBuildTriadOnDegree(tonic, baseScale, degreeIndex) {
    const scale = EAR_SCALE_INTERVALS[baseScale];
    const root = (tonic + scale[degreeIndex]) % 12;
    const third = (tonic + scale[(degreeIndex + 2) % 7]) % 12;
    const fifth = (tonic + scale[(degreeIndex + 4) % 7]) % 12;
    return [root, third, fifth];
}

// --- Вправа 1: Тип акорду ---------------------------------------------------
function earGenerateQualityQuestion(levelIndex, rng) {
    rng = rng || Math.random;
    const pool = earCumulativeTierPool(EAR_QUALITY_LEVEL_TIERS, levelIndex);
    const root = Math.floor(rng() * 12);
    const qualityId = earPickRandomItem(pool, rng);
    const qualityDef = EAR_CHORD_QUALITIES.find(q => q.id === qualityId);
    const pcs = qualityDef.intervals.map(i => (root + i) % 12);
    const choices = earShuffle(pool, rng);
    const correctIndex = choices.indexOf(qualityId);
    return {
        type: "quality",
        levelIndex,
        root,
        qualityId,
        pcs,
        choices,
        correctIndex,
        hint: earPickHint(qualityDef.hints, rng)
    };
}

// --- Вправа 2: Функція акорду в тональності ---------------------------------
function earGenerateFunctionQuestion(levelIndex, rng) {
    rng = rng || Math.random;
    const majorTiers = EAR_FUNCTION_LEVEL_TIERS.major;
    const maxSingleScaleLevel = majorTiers.length - 1;

    let baseScale, pool;
    if (levelIndex <= maxSingleScaleLevel) {
        baseScale = "major";
        pool = earCumulativeTierPool(majorTiers, levelIndex);
    } else {
        // Рівень "змішування": обидва лади вже повністю розкриті,
        // тональність (мажор/мінор) обирається випадково щопитання.
        baseScale = rng() < 0.5 ? "major" : "minor";
        const tiers = EAR_FUNCTION_LEVEL_TIERS[baseScale];
        pool = earCumulativeTierPool(tiers, tiers.length - 1);
    }

    const tonic = Math.floor(rng() * 12);
    const degreeIndex = earPickRandomItem(pool, rng);
    const degreeDef = EAR_FUNCTION_DEGREES[baseScale][degreeIndex];
    const pcs = earBuildTriadOnDegree(tonic, baseScale, degreeIndex);

    // Коротка каденція i-iv-v-i (чи I-IV-V-I для мажору), щоб "встановити"
    // тональність у вусі слухача перед цільовим акордом.
    const cadenceDegrees = [0, 3, 4, 0];
    const cadence = cadenceDegrees.map(d => earBuildTriadOnDegree(tonic, baseScale, d));

    const choices = earShuffle(pool, rng);
    const correctIndex = choices.indexOf(degreeIndex);

    return {
        type: "function",
        levelIndex,
        baseScale,
        tonic,
        degreeIndex,
        pcs,
        cadence,
        choices,
        correctIndex,
        hint: earPickHint(degreeDef.hints, rng)
    };
}

// --- Вправа 3: Послідовність акордів ----------------------------------------
function earGenerateProgressionQuestion(levelIndex, rng) {
    rng = rng || Math.random;
    const pool = earCumulativeTierPool(EAR_PROGRESSION_TIERS, levelIndex);
    const tonic = Math.floor(rng() * 12);
    const targetIdx = Math.floor(rng() * pool.length);
    const target = pool[targetIdx];

    const numChoices = Math.min(4, pool.length);
    const others = pool.filter((_, i) => i !== targetIdx);
    const distractors = earShuffle(others, rng).slice(0, numChoices - 1);
    const choiceDefs = earShuffle([target].concat(distractors), rng);

    const labelFor = def => def.degrees
        .map(d => EAR_FUNCTION_DEGREES[def.baseScale][d].roman)
        .join("-");

    const choices = choiceDefs.map(def => ({
        baseScale: def.baseScale,
        degrees: def.degrees,
        label: labelFor(def)
    }));
    const correctIndex = choiceDefs.indexOf(target);

    const pcsSequence = target.degrees.map(d => earBuildTriadOnDegree(tonic, target.baseScale, d));

    return {
        type: "progression",
        levelIndex,
        baseScale: target.baseScale,
        tonic,
        degrees: target.degrees,
        label: labelFor(target),
        pcsSequence,
        choices,
        correctIndex,
        hint: target.hint
    };
}

// --- Вправа 4: Лад (гама) ---------------------------------------------------
// На відміну від попередніх трьох вправ, тут немає "pcs" одного акорду -
// контролер (ear-training.js) сам будує мелодичний прогін гами через
// audio-engine.js::earPlayScale(root, intervals, ...), використовуючи
// root + EAR_SCALES-запис за modeId. Тут лишається лише чиста музична
// теорія: який лад, з якої тоніки, і варіанти відповіді.
function earGenerateScaleQuestion(levelIndex, rng) {
    rng = rng || Math.random;
    const pool = earCumulativeTierPool(EAR_SCALE_LEVEL_TIERS, levelIndex);
    const root = Math.floor(rng() * 12);
    const modeId = earPickRandomItem(pool, rng);
    const modeDef = EAR_SCALES.find(m => m.id === modeId);
    const choices = earShuffle(pool, rng);
    const correctIndex = choices.indexOf(modeId);
    return {
        type: "scale",
        levelIndex,
        root,
        modeId,
        choices,
        correctIndex,
        hint: earPickHint(modeDef.hints, rng)
    };
}

function earGenerateQuestion(exerciseType, levelIndex, rng) {
    if (exerciseType === "quality") return earGenerateQualityQuestion(levelIndex, rng);
    if (exerciseType === "function") return earGenerateFunctionQuestion(levelIndex, rng);
    if (exerciseType === "progression") return earGenerateProgressionQuestion(levelIndex, rng);
    if (exerciseType === "scale") return earGenerateScaleQuestion(levelIndex, rng);
    throw new Error("Невідомий тип вправи: " + exerciseType);
}

function earCheckAnswer(question, choiceIndex) {
    return choiceIndex === question.correctIndex;
}

// --- Статистика / розблокування рівнів --------------------------------------
function earCreateDefaultStats() {
    return {
        quality: { level: 0, history: [] },
        function: { level: 0, history: [] },
        progression: { level: 0, history: [] },
        scale: { level: 0, history: [] }
    };
}

// Чистий редюсер: не мутує stats, повертає новий об'єкт + чи щойно
// розблокувався новий рівень. Ковзне вікно останніх EAR_HISTORY_WINDOW
// відповідей; розблокування рівня скидає вікно (наступний рівень
// оцінюється на власній, "чистій" статистиці).
function earApplyAnswerToStats(stats, exerciseType, correct) {
    const prev = stats[exerciseType] || { level: 0, history: [] };
    const maxLevel = earGetMaxLevel(exerciseType);
    const history = prev.history.concat([!!correct]).slice(-EAR_HISTORY_WINDOW);
    const correctCount = history.filter(Boolean).length;
    const accuracy = history.length ? correctCount / history.length : 0;

    let level = prev.level;
    let leveledUp = false;
    let newHistory = history;

    if (history.length >= EAR_UNLOCK_MIN_ATTEMPTS && accuracy >= EAR_UNLOCK_ACCURACY && level < maxLevel) {
        level = level + 1;
        leveledUp = true;
        newHistory = [];
    }

    const nextExerciseStats = { level, history: newHistory };
    const nextStats = Object.assign({}, stats, { [exerciseType]: nextExerciseStats });

    return { stats: nextStats, leveledUp, accuracy, level, maxLevel };
}
