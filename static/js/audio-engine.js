// Прошарок Web Audio API для вкладки "Тренування слуху". Грає ноти/акорди
// з реальних записаних семплів фортепіано (а не синтезованих осциляторів —
// оригінальний варіант звучав надто штучно й заважав розрізняти тембри
// акордів на слух). Семпли: FluidR3_GM soundfont, через проєкт
// gleitz/midi-js-soundfonts (CC BY 3.0 - дивись README.md / AGENTS.md щодо
// атрибуції). Чистий DOM/браузерний модуль (не тестується в Node - там
// немає AudioContext/fetch-у такого роду); уся музична логіка, яку він
// озвучує, живе окремо в ear-training-logic.js і тестується без нього.

// Лише дві октави реально записані й завантажуються (4 і 5) - саме стільки
// фактично потрібно для всіх чотирьох вправ (акорди/каденції/прогресії
// грають в octave=4; гама (earPlayScale) може підніматись до октави 5, але
// не вище - дивись математику в earPlayScale нижче). Якщо колись знадобиться
// ширший діапазон - треба буде довантажити ще файлів за тим самим шаблоном
// назв, а не міняти цю логіку.
const EAR_SAMPLE_OCTAVES = [4, 5];
const EAR_SAMPLE_NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

let _earAudioCtx = null;
let _earMasterGain = null;
let _earSampleBuffers = new Map(); // ключ "pc-octave" -> AudioBuffer
let _earSampleLoadPromise = null;

function earSampleKey(pc, octave) {
    return pc + "-" + octave;
}

function earSampleUrl(pc, octave) {
    return "/static/audio/piano/" + EAR_SAMPLE_NOTE_NAMES[pc] + octave + ".mp3";
}

// AudioContext створюється лише за першого реального виклику (ліниво), бо
// браузери не дозволяють стартувати аудіо без жесту користувача (клік по
// кнопці "Грати" це і є той жест) — спроба створити його раніше просто
// лишила б його в стані "suspended". Той самий викличок одразу ставить у
// черзі завантаження всіх фортепіанних семплів (earLoadAllSamples), поки
// контекст ще "теплий" від жесту користувача.
function earAudioGetContext() {
    if (_earAudioCtx) {
        if (_earAudioCtx.state === "suspended") _earAudioCtx.resume();
        return _earAudioCtx;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    _earAudioCtx = new Ctx();

    // Спільний майстер-ланцюг: невеликий компресор перед виходом, щоб
    // кілька одночасних нот (акорд з 3-4 голосів, кожна - семпл фортепіано
    // з власним природним "тілом" звуку) не клипали.
    _earMasterGain = _earAudioCtx.createGain();
    _earMasterGain.gain.value = 0.9;
    const compressor = _earAudioCtx.createDynamicsCompressor();
    _earMasterGain.connect(compressor);
    compressor.connect(_earAudioCtx.destination);

    earLoadAllSamples();

    return _earAudioCtx;
}

function earAudioGetMasterGain() {
    earAudioGetContext();
    return _earMasterGain;
}

// Завантажує й декодує всі 24 семпли (12 пітч-класів × 2 октави) один раз;
// повторні виклики повертають той самий проміс. Семпли, що не вдалось
// завантажити (напр. мережева проблема), просто лишаються відсутніми в
// Map-і - earPlayTone для них тихо нічого не грає, решта акорду/послідовності
// все одно звучить, без винятку, що зламав би весь показ питання.
function earLoadAllSamples() {
    if (_earSampleLoadPromise) return _earSampleLoadPromise;
    const ctx = earAudioGetContext();
    const jobs = [];
    EAR_SAMPLE_OCTAVES.forEach(octave => {
        for (let pc = 0; pc < 12; pc++) {
            const key = earSampleKey(pc, octave);
            const url = earSampleUrl(pc, octave);
            jobs.push(
                fetch(url)
                    .then(r => r.arrayBuffer())
                    .then(buf => ctx.decodeAudioData(buf))
                    .then(audioBuffer => { _earSampleBuffers.set(key, audioBuffer); })
                    .catch(err => { console.warn("Не вдалося завантажити семпл фортепіано", url, err); })
            );
        }
    });
    _earSampleLoadPromise = Promise.all(jobs);
    return _earSampleLoadPromise;
}

// Одна нота: семпл фортепіано + коротка обвідна гучності. Семпли мають
// власну природну атаку (тож тут майже миттєвий fade-in, лише щоб уникнути
// клацання при старті), а fade-out тут контрольований - самі файли ~3.2с
// природного згасання, довше за більшість потрібних тут тривалостей, тож
// плавно глушимо його до нуля саме в момент startTime+duration, а не
// обрізаємо різко.
function earPlayTone(pc, octave, startTime, duration) {
    const ctx = earAudioGetContext();
    const master = earAudioGetMasterGain();

    const clampedOctave = Math.max(
        EAR_SAMPLE_OCTAVES[0],
        Math.min(EAR_SAMPLE_OCTAVES[EAR_SAMPLE_OCTAVES.length - 1], octave)
    );
    const buffer = _earSampleBuffers.get(earSampleKey(pc, clampedOctave));
    if (!buffer) return; // ще не завантажено (чи не вдалось) - пропускаємо саме цю ноту

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    const peak = 0.85;
    const fadeIn = 0.012;
    const release = Math.min(0.35, Math.max(0.05, duration * 0.35));

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(peak, startTime + fadeIn);
    gain.gain.setValueAtTime(peak, Math.max(startTime + fadeIn, startTime + duration - release));
    gain.gain.linearRampToValueAtTime(0, startTime + duration);

    source.connect(gain);
    gain.connect(master);

    source.start(startTime);
    source.stop(startTime + duration + 0.05);
}

// Грає кілька пітч-класів одночасно як акорд, в заданій октаві.
function earPlayChord(pcs, options) {
    options = options || {};
    const octave = options.octave != null ? options.octave : 4;
    const duration = options.duration != null ? options.duration : 1.4;
    const delay = options.delay != null ? options.delay : 0;

    const ctx = earAudioGetContext();
    const startTime = ctx.currentTime + delay;
    pcs.forEach(pc => earPlayTone(pc, octave, startTime, duration));
    return delay + duration;
}

// Мелодичний прогін гами (на відміну від earPlayChord/earPlaySequence, що
// грають ноти одночасно): ноти звучать одна за одною, з правильним
// переходом між октавами (root+interval може перевищити 11 - тоді нота
// справді вища, а не "той самий pc в тій самій октаві"). Завершується
// тонікою на октаву вище, щоб було чутно, що гама "замкнулася".
function earPlayScale(root, intervals, options) {
    options = options || {};
    const baseOctave = options.octave != null ? options.octave : 4;
    const noteDuration = options.noteDuration != null ? options.noteDuration : 0.32;
    const gap = options.gap != null ? options.gap : 0.03;
    const startDelay = options.delay != null ? options.delay : 0;
    const ctx = earAudioGetContext();
    const baseTime = ctx.currentTime + startDelay;
    const steps = intervals.concat([12]); // +тоніка зверху, замикає октаву
    let t = 0;
    steps.forEach(iv => {
        const sum = root + iv;
        const pc = sum % 12;
        const octave = baseOctave + Math.floor(sum / 12);
        earPlayTone(pc, octave, baseTime + t, noteDuration);
        t += noteDuration + gap;
    });
    return startDelay + t;
}

// Грає послідовність акордів один за одним (каденція або прогресія).
// Повертає сумарну тривалість (с), щоб виклик міг запланувати щось "після".
function earPlaySequence(chordsPcsArray, options) {
    options = options || {};
    const octave = options.octave != null ? options.octave : 4;
    const chordDuration = options.chordDuration != null ? options.chordDuration : 0.9;
    const gap = options.gap != null ? options.gap : 0.15;
    const startDelay = options.delay != null ? options.delay : 0;

    let t = startDelay;
    chordsPcsArray.forEach(pcs => {
        earPlayChord(pcs, { octave, duration: chordDuration, delay: t });
        t += chordDuration + gap;
    });
    return t;
}
