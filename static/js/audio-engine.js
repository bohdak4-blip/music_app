// Легкий синтезатор на Web Audio API - грає ноти/акорди для вкладки
// "Тренування слуху". Жодних зовнішніх бібліотек чи аудіофайлів: усе —
// прості осцилятори з ADSR-подібною обвідною гучності, згенеровані на льоту.
// Чистий DOM/браузерний модуль (не тестується в Node - там немає
// AudioContext); уся музична логіка, яку він озвучує, живе окремо в
// ear-training-logic.js і тестується без нього.

const EAR_AUDIO_A4_FREQ = 440;

let _earAudioCtx = null;
let _earMasterGain = null;

// AudioContext створюється лише за першого реального виклику (ліниво), бо
// браузери не дозволяють стартувати аудіо без жесту користувача (клік по
// кнопці "Грати" це і є той жест) — спроба створити його раніше просто
// лишила б його в стані "suspended".
function earAudioGetContext() {
    if (_earAudioCtx) {
        if (_earAudioCtx.state === "suspended") _earAudioCtx.resume();
        return _earAudioCtx;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    _earAudioCtx = new Ctx();

    // Спільний майстер-ланцюг: невеликий компресор перед виходом, щоб
    // кілька одночасних нот (акорд з 3-4 голосів) не клікали/не клипали.
    _earMasterGain = _earAudioCtx.createGain();
    _earMasterGain.gain.value = 0.5;
    const compressor = _earAudioCtx.createDynamicsCompressor();
    _earMasterGain.connect(compressor);
    compressor.connect(_earAudioCtx.destination);

    return _earAudioCtx;
}

function earAudioGetMasterGain() {
    earAudioGetContext();
    return _earMasterGain;
}

// Пітч-клас (0-11, 0=C) + октава -> частота в Гц. Стандартний стрій, A4=440Гц.
// MIDI-номер: octave=4,pc=0 (C4) -> 60; pc=9,octave=4 (A4) -> 69 -> 440Гц.
function earPcToFrequency(pc, octave) {
    const midi = 12 * (octave + 1) + pc;
    return EAR_AUDIO_A4_FREQ * Math.pow(2, (midi - 69) / 12);
}

// Одна нота: осцилятор + обвідна гучності (швидка атака, плавний спад —
// без цього кожна нота клацала б на початку/кінці).
function earPlayTone(freq, startTime, duration) {
    const ctx = earAudioGetContext();
    const master = earAudioGetMasterGain();

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, startTime);

    const gain = ctx.createGain();
    const peak = 0.28;
    const attack = 0.02;
    const release = Math.min(0.25, duration * 0.3);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(peak, startTime + attack);
    gain.gain.setValueAtTime(peak, Math.max(startTime + attack, startTime + duration - release));
    gain.gain.linearRampToValueAtTime(0, startTime + duration);

    osc.connect(gain);
    gain.connect(master);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
}

// Грає кілька пітч-класів одночасно як акорд, в заданій октаві (базові ноти
// акорду в octave, усе інше піднімається в межах тієї ж октави відносно
// найближчого розташування - тут спрощено: усі ноти в одній октаві).
function earPlayChord(pcs, options) {
    options = options || {};
    const octave = options.octave != null ? options.octave : 4;
    const duration = options.duration != null ? options.duration : 1.4;
    const delay = options.delay != null ? options.delay : 0;

    const ctx = earAudioGetContext();
    const startTime = ctx.currentTime + delay;
    pcs.forEach(pc => earPlayTone(earPcToFrequency(pc, octave), startTime, duration));
    return delay + duration;
}

// Грає послідовність акордів один за одним (каденція або прогресія).
// Повертає сумарну тривалість (с), щоб виклик міг запланувати щось "після".
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
        earPlayTone(earPcToFrequency(pc, octave), baseTime + t, noteDuration);
        t += noteDuration + gap;
    });
    return startDelay + t;
}

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
