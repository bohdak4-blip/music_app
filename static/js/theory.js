const tuning = [4, 11, 7, 2, 9, 4];
const noteNames = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

const modesData = {
    major: {
        "Ionian": { intervals: [0, 2, 4, 5, 7, 9, 11], labels: ["1", "2", "3", "4", "5", "6", "7"] },
        "Lydian": { intervals: [0, 2, 4, 6, 7, 9, 11], labels: ["1", "2", "3", "#4", "5", "6", "7"] },
        "Mixolydian": { intervals: [0, 2, 4, 5, 7, 9, 10], labels: ["1", "2", "3", "4", "5", "6", "b7"] }
    },
    minor: {
        "Aeolian": { intervals: [0, 2, 3, 5, 7, 8, 10], labels: ["1", "2", "b3", "4", "5", "b6", "b7"] },
        "Dorian": { intervals: [0, 2, 3, 5, 7, 9, 10], labels: ["1", "2", "b3", "4", "5", "6", "b7"] },
        "Phrygian": { intervals: [0, 1, 3, 5, 7, 8, 10], labels: ["1", "b2", "b3", "4", "5", "b6", "b7"] },
        "Locrian": { intervals: [0, 1, 3, 5, 6, 8, 10], labels: ["1", "b2", "b3", "4", "b5", "b6", "b7"] }
    }
};

// Еталонний лад для кожної групи: Іонійський = натуральний мажор, Еолійський = натуральний мінор.
// Порівнюючи з ним, визначаємо, які ступені ладу "змінені" відносно стандартного мажору/мінору
// (напр. для Лідійського це #4, для Міксолідійського b7, для Дорійського натуральна 6 тощо).
const referenceMode = { major: "Ionian", minor: "Aeolian" };

function getAlteredIndices(baseScaleKey, modeKey) {
    const modeInfo = modesData[baseScaleKey][modeKey];
    const refInfo = modesData[baseScaleKey][referenceMode[baseScaleKey]];
    const altered = new Set();
    modeInfo.labels.forEach((label, idx) => {
        if (refInfo.labels[idx] !== label) altered.add(idx);
    });
    return altered;
}

const chordIntervalNames = { 0: 'R', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4', 6: 'b5', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: 'maj7' };

const chromaticDegrees = [
    { val: 0, text: "I" }, { val: 1, text: "bII" }, { val: 2, text: "II" }, { val: 3, text: "bIII" },
    { val: 4, text: "III" }, { val: 5, text: "IV" }, { val: 6, text: "#IV/bV" }, { val: 7, text: "V" },
    { val: 8, text: "bVI" }, { val: 9, text: "VI" }, { val: 10, text: "bVII" }, { val: 11, text: "VII" }
];

const customChordTypes = {
    "maj7": { intervals: [0, 4, 7, 11], labels: ["R", "3", "5", "maj7"] },
    "m7": { intervals: [0, 3, 7, 10], labels: ["R", "b3", "5", "b7"] },
    "7": { intervals: [0, 4, 7, 10], labels: ["R", "3", "5", "b7"] },
    "m7b5": { intervals: [0, 3, 6, 10], labels: ["R", "b3", "b5", "b7"] },
    "dim7": { intervals: [0, 3, 6, 9], labels: ["R", "b3", "b5", "bb7"] },
    "aug7": { intervals: [0, 4, 8, 10], labels: ["R", "3", "#5", "b7"] },
    "6": { intervals: [0, 4, 7, 9], labels: ["R", "3", "5", "6"] },
    "m6": { intervals: [0, 3, 7, 9], labels: ["R", "b3", "5", "6"] },
    "sus2": { intervals: [0, 2, 7], labels: ["R", "2", "5"] },
    "sus4": { intervals: [0, 5, 7], labels: ["R", "4", "5"] }
};

// Розкладка клавіш фортепіано (2 октави) - чиста геометрія, без DOM.
// pc = пітч-клас (0-11). Білі клавіші йдуть по порядку зліва направо;
// кожна чорна клавіша "прив'язана" до індексу білої клавіші (в межах
// абсолютної нумерації, не однієї октави), одразу після якої вона стоїть.
const PIANO_OCTAVES = 2;
const PIANO_WHITE_PCS = new Set([0, 2, 4, 5, 7, 9, 11]); // C D E F G A B
const PIANO_BLACK_AFTER_WHITE_LOCAL_INDEX = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 }; // C#,D#,F#,G#,A#

function buildPianoLayout() {
    const whiteKeys = [];
    const blackKeys = [];
    let whiteIndex = 0;
    for (let oct = 0; oct < PIANO_OCTAVES; oct++) {
        for (let localPc = 0; localPc < 12; localPc++) {
            if (PIANO_WHITE_PCS.has(localPc)) {
                whiteKeys.push({ pc: localPc, whiteIndex });
                whiteIndex++;
            } else {
                const afterWhiteIndex = oct * 7 + PIANO_BLACK_AFTER_WHITE_LOCAL_INDEX[localPc];
                blackKeys.push({ pc: localPc, afterWhiteIndex });
            }
        }
    }
    return { whiteKeys, blackKeys, totalWhite: whiteIndex };
}
