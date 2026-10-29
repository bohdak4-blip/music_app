const ui = {
    tonic: document.getElementById('tonic'), baseScale: document.getElementById('baseScale'),
    mode: document.getElementById('mode'), viewMode: document.getElementById('viewMode'),
    instrumentView: document.getElementById('instrumentView'),
    fretboard: document.getElementById('fretboard'), chordDisplay: document.getElementById('chordDisplay'),
    legend: document.getElementById('legend'), playBtn: document.getElementById('playBtn'),
    bpm: document.getElementById('bpm'), beats: document.getElementById('beats'),
    slotsContainer: document.getElementById('slotsContainer'), algoSelect: document.getElementById('aiAlgorithm')
};

let playInterval = null, currentStep = 0, calculatedPath = null;
let columns = [], degreeSlots = [], typeSlots = [];

// Мапа id вкладки -> {порядковий номер кнопки (для CSS-селектора), id панелі}.
// Додавання нової вкладки = один новий запис тут (+ кнопка/панель у index.html).
const TAB_DEFS = {
    prog:   { btnIndex: 1, panelId: 'tabProg' },
    mod:    { btnIndex: 2, panelId: 'tabMod' },
    chords: { btnIndex: 3, panelId: 'tabChords' },
    ear:    { btnIndex: 4, panelId: 'tabEar' }
};

function switchTab(tabId) {
    const def = TAB_DEFS[tabId] || TAB_DEFS.prog;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`.tab-btn:nth-child(${def.btnIndex})`).classList.add('active');
    document.getElementById(def.panelId).classList.add('active');
    if (tabId === 'mod') generateModulations();
    // earInitIfNeeded живе в ear-training.js (завантажується після app.js) -
    // перевірка typeof, а не пряме ім'я, про всяк випадок захищає від
    // помилки завантаження, якщо колись порядок скриптів зламають.
    if (tabId === 'ear' && typeof earInitIfNeeded === 'function') earInitIfNeeded();
}

function initSlots() {
    const defaultDefs = [{deg: 0, type: "auto"}, {deg: 5, type: "auto"}, {deg: 7, type: "7"}, {deg: 0, type: "auto"}];
    for(let i=0; i<4; i++) {
        const col = document.createElement('div'); col.className = 'slot-col';
        const degSelect = document.createElement('select'); degSelect.className = 'chord-deg';

        chromaticDegrees.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.val; opt.textContent = d.text;
            if(d.val === defaultDefs[i].deg) opt.selected = true;
            degSelect.appendChild(opt);
        });

        const typeSelect = document.createElement('select'); typeSelect.className = 'chord-type';
        const typeOptions = [{val: "auto", text: "Авто (Діатоніка)"}, ...Object.keys(customChordTypes).map(k => ({val: k, text: k}))];
        typeOptions.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt.val; o.textContent = opt.text;
            if(opt.val === defaultDefs[i].type) o.selected = true;
            typeSelect.appendChild(o);
        });

        col.appendChild(degSelect); col.appendChild(typeSelect); ui.slotsContainer.appendChild(col);
        columns.push(col); degreeSlots.push(degSelect); typeSlots.push(typeSelect);

        const updateSlot = () => { invalidatePath(); if (!playInterval && ui.viewMode.value === 'chord') { columns.forEach(c => c.classList.remove('active-slot')); col.classList.add('active-slot'); currentStep = i; render(); } };
        col.addEventListener('click', () => { if (!playInterval && ui.viewMode.value === 'chord' && currentStep !== i) { columns.forEach(c => c.classList.remove('active-slot')); col.classList.add('active-slot'); currentStep = i; render(); } });
        degSelect.addEventListener('change', updateSlot); typeSelect.addEventListener('change', updateSlot);
    }
    columns[0].classList.add('active-slot');
}

function invalidatePath() { calculatedPath = null; }

function setSlotDirect(index, degVal, typeVal) {
    degreeSlots[index].value = degVal;
    typeSlots[index].value = typeVal;
}

function loadMod(id) {
    switchTab('prog');

    if(id === 1) { // 1. C -> G (Target G=7, Maj)
        ui.tonic.value = 7; ui.baseScale.value = "major"; updateModeDropdown();
        setSlotDirect(0, 5, "maj7"); // C (IV in G)
        setSlotDirect(1, 2, "m7");   // Am (ii in G)
        setSlotDirect(2, 7, "7");    // D7 (V in G)
        setSlotDirect(3, 0, "maj7"); // G (I in G)
    } else if(id === 2) { // 2. C -> Am (Target A=9, Min)
        ui.tonic.value = 9; ui.baseScale.value = "minor"; updateModeDropdown();
        setSlotDirect(0, 3, "maj7"); // C (bIII in Am)
        setSlotDirect(1, 10, "7");   // G7 (bVII in Am)
        setSlotDirect(2, 7, "7");    // E7 (V in Am)
        setSlotDirect(3, 0, "m7");   // Am (i in Am)
    } else if(id === 3) { // 3. C -> Ebm (Target Eb=3, Min)
        ui.tonic.value = 3; ui.baseScale.value = "minor"; updateModeDropdown();
        setSlotDirect(0, 9, "maj7"); // C
        setSlotDirect(1, 8, "dim7"); // Bdim7 / Cbdim7
        setSlotDirect(2, 11, "dim7"); // Ddim7
        setSlotDirect(3, 0, "m7");   // Ebm
    } else if(id === 4) { // 4. C -> Em (Target E=4, Min)
        ui.tonic.value = 4; ui.baseScale.value = "minor"; updateModeDropdown();
        setSlotDirect(0, 8, "maj7"); // C
        setSlotDirect(1, 7, "7");    // B7
        setSlotDirect(2, 0, "m7");   // Em
        setSlotDirect(3, 7, "7");    // B7 (повторення)
    } else if(id === 5) { // 5. C -> Gb (Target Gb=6, Maj)
        ui.tonic.value = 6; ui.baseScale.value = "major"; updateModeDropdown();
        setSlotDirect(0, 6, "maj7"); // C (bV)
        setSlotDirect(1, 1, "7");    // G7 (bII)
        setSlotDirect(2, 7, "7");    // Db7 (V)
        setSlotDirect(3, 0, "maj7"); // Gb
    } else if(id === 6) { // 6. C -> E (Target E=4, Maj)
        ui.tonic.value = 4; ui.baseScale.value = "major"; updateModeDropdown();
        setSlotDirect(0, 8, "maj7"); // C
        setSlotDirect(1, 8, "dim7"); // Cdim7
        setSlotDirect(2, 7, "7");    // B7
        setSlotDirect(3, 0, "maj7"); // E
    } else if(id === 7) { // 7. C -> Ab (Target Ab=8, Maj)
        ui.tonic.value = 8; ui.baseScale.value = "major"; updateModeDropdown();
        setSlotDirect(0, 4, "maj7"); // C (III)
        setSlotDirect(1, 0, "maj7"); // Ab
        setSlotDirect(2, 7, "7");    // Eb7
        setSlotDirect(3, 0, "maj7"); // Ab
    } else if(id === 8) { // 8. C -> Db (Target Db=1, Maj)
        ui.tonic.value = 1; ui.baseScale.value = "major"; updateModeDropdown();
        setSlotDirect(0, 11, "maj7"); // C
        setSlotDirect(1, 6, "7");    // G7
        setSlotDirect(2, 7, "7");    // Ab7
        setSlotDirect(3, 0, "maj7"); // Db
    } else if(id === 9) { // 9. F7 -> Ab (Target Ab=8, Maj)
        ui.tonic.value = 8; ui.baseScale.value = "major"; updateModeDropdown();
        setSlotDirect(0, 9, "7");    // F7 (VI)
        setSlotDirect(1, 2, "m7");   // Bbm7 (II)
        setSlotDirect(2, 7, "7");    // Eb7 (V)
        setSlotDirect(3, 0, "maj7"); // Ab (I)
    } else if(id === 10) { // 10. C -> Cm (Target C=0, Min)
        ui.tonic.value = 0; ui.baseScale.value = "minor"; updateModeDropdown();
        setSlotDirect(0, 0, "maj7"); // C
        setSlotDirect(1, 7, "7");    // G7
        setSlotDirect(2, 11, "dim7"); // Bdim7 (G7b9)
        setSlotDirect(3, 0, "m7");   // Cm
    } else if(id === 11) { // 11. C -> Fm (Target F=5, Min)
        ui.tonic.value = 5; ui.baseScale.value = "minor"; updateModeDropdown();
        setSlotDirect(0, 7, "maj7"); // C (V)
        setSlotDirect(1, 7, "7");    // C7
        setSlotDirect(2, 8, "maj7"); // Db
        setSlotDirect(3, 0, "m7");   // Fm
    }

    ui.viewMode.value = 'chord';
    calculateVoiceLeading();
}

function getChordInfo(slotIndex) {
    const tonic = parseInt(ui.tonic.value);
    const modeInfo = modesData[ui.baseScale.value][ui.mode.value];
    const degInterval = parseInt(degreeSlots[slotIndex].value);
    const type = typeSlots[slotIndex].value;

    const rootPc = (tonic + degInterval) % 12;
    let pcs = [], functions = {}, name = "";

    if (type === "auto") {
        const scaleIndex = modeInfo.intervals.indexOf(degInterval);
        if (scaleIndex !== -1) {
            const t3 = modeInfo.intervals[(scaleIndex + 2) % 7];
            const t5 = modeInfo.intervals[(scaleIndex + 4) % 7];
            const t7 = modeInfo.intervals[(scaleIndex + 6) % 7];
            pcs = [rootPc, (tonic + t3)%12, (tonic + t5)%12, (tonic + t7)%12];
            functions[rootPc] = 'R';
            functions[(tonic + t3)%12] = chordIntervalNames[(t3 - degInterval + 12)%12];
            functions[(tonic + t5)%12] = chordIntervalNames[(t5 - degInterval + 12)%12];
            functions[(tonic + t7)%12] = chordIntervalNames[(t7 - degInterval + 12)%12];
            let q = "maj7";
            if (functions[(tonic + t3)%12] === 'b3') q = functions[(tonic + t5)%12] === 'b5' ? "m7b5" : "m7";
            if (functions[(tonic + t3)%12] === '3' && functions[(tonic + t7)%12] === 'b7') q = "7";
            name = noteNames[rootPc] + " " + q;
        } else {
            const struct = customChordTypes["7"];
            pcs = struct.intervals.map(i => (rootPc + i) % 12);
            struct.intervals.forEach((int, idx) => functions[(rootPc + int) % 12] = struct.labels[idx]);
            name = noteNames[rootPc] + " 7 (Хромат.)";
        }
    } else {
        const struct = customChordTypes[type];
        pcs = struct.intervals.map(i => (rootPc + i) % 12);
        struct.intervals.forEach((int, idx) => functions[(rootPc + int) % 12] = struct.labels[idx]);
        name = noteNames[rootPc] + " " + type;
    }

    const degreeRoman = chromaticDegrees.find(d => d.val === degInterval).text;
    return { pcs, functions, name, rootPc, degreeRoman };
}

function generateModulations() {
    const container = document.getElementById('modRecommendations');
    container.innerHTML = '';

    const curT = parseInt(document.getElementById('modCurTonic').value);
    const curType = document.getElementById('modCurType').value;
    const tgtT = parseInt(document.getElementById('modTgtTonic').value);
    const tgtType = document.getElementById('modTgtType').value;

    let methods = [];

    const dist = Math.abs(curT - tgtT);
    const isRelative = ((curType==='maj7' && tgtType==='m7' && tgtT===(curT-3+12)%12) || (curType==='m7' && tgtType==='maj7' && tgtT===(curT+3)%12));
    const isParallel = (curT === tgtT && curType !== tgtType);

    if (isParallel) {
        methods.push({
            title: "Паралельна модуляція", badge: "rec", badgeText: "🔥 Ідеально",
            desc: "Найкращий спосіб змінити настрій не змінюючи тоніку (перехід в однойменну тональність).",
            chords: [
                { root: curT, type: curType, txt: "Початкова тоніка." },
                { root: (curT+7)%12, type: "7", txt: "Загальна домінанта для обох ладів." },
                { root: (curT+11)%12, type: "dim7", txt: "Зменшений акорд працює як V7b9, що налаштовує вухо на новий лад." },
                { root: tgtT, type: tgtType, txt: "Нова однойменна тоніка." }
            ]
        });
    }

    if (isRelative) {
        methods.push({
            title: "Перервана каденція (Deceptive Cadence)", badge: "rec", badgeText: "🔥 Ідеально",
            desc: "Класичний перехід у паралельну тональність через ламання очікувань слухача.",
            chords: [
                { root: curT, type: curType, txt: "Початкова тоніка." },
                { root: (curT+7)%12, type: "7", txt: "Домінанта. Слухач очікує повернення в I ступінь." },
                { root: (tgtT+7)%12, type: "7", txt: "Раптом граємо домінанту нової цілі замість розв'язання." },
                { root: tgtT, type: tgtType, txt: "Нова тоніка (перервали очікування)." }
            ]
        });
    }

    if (dist === 3 || dist === 4 || dist === 8 || dist === 9) {
        methods.push({
            title: "Хроматична медіанта", badge: "rec", badgeText: "🔥 Ідеально",
            desc: "Кінематографічний перехід на терцію. Зберігає спільний тон для плавності.",
            chords: [
                { root: curT, type: curType, txt: "Початкова тоніка." },
                { root: tgtT, type: tgtType, txt: "Різкий стрибок на нову тоніку (спільний тон склеює перехід)." },
                { root: (tgtT+7)%12, type: "7", txt: "Домінанта нової тональності для підтвердження." },
                { root: tgtT, type: tgtType, txt: "Закріплення нової тоніки." }
            ]
        });
    }

    methods.push({
        title: "Тритонова заміна (Tritone Sub)", badge: "uni", badgeText: "Універсально",
        desc: "Джазовий перехід. Домінанта цілі замінюється акордом на відстані тритону (bII7), створюючи хроматичний рух баса вниз.",
        chords: [
            { root: curT, type: curType, txt: "Старт." },
            { root: (tgtT+7)%12, type: "7", txt: "Класична домінанта нашої цілі (V7)." },
            { root: (tgtT+1)%12, type: "7", txt: "Тритонова заміна (bII7). Має той самий напружений тритон." },
            { root: tgtT, type: tgtType, txt: "М'яке розв'язання в нову тоніку." }
        ]
    });

    methods.push({
        title: "Енгармонічний зменшений (Dim7)", badge: "uni", badgeText: "Універсально",
        desc: "Оскільки dim7 симетричний, його можна переосмислити як ввідний до 4 різних тональностей.",
        chords: [
            { root: curT, type: curType, txt: "Старт." },
            { root: (curT+11)%12, type: "dim7", txt: "Ввідний зменшений до старої тоніки. Тягне назад." },
            { root: (tgtT+11)%12, type: "dim7", txt: "Той самий акорд (або його обернення), але тепер він тягне в нову тоніку." },
            { root: tgtT, type: tgtType, txt: "Розв'язання в нову тоніку." }
        ]
    });

    if(methods.length === 0) {
        container.innerHTML = '<p style="color:#aaa; text-align:center;">Для цього переходу краще використовувати Універсальні методи (Тритонова заміна або Dim7).</p>';
    }

    methods.forEach((m, idx) => {
        let html = `
            <div class="mod-card-dynamic ${m.badge === 'rec' ? 'recommended' : 'universal'}">
                <div class="mod-header">
                    <h3>${idx+1}. ${m.title}</h3>
                    <span class="badge ${m.badge}">${m.badgeText}</span>
                </div>
                <p style="color:#aaa; font-size:13px; margin-bottom:15px;">${m.desc}</p>
                <ul class="mod-steps">
        `;
        m.chords.forEach((c, i) => { html += `<li><b>${noteNames[c.root]} ${c.type}</b> — ${c.txt}</li>`; });
        html += `</ul>`;
        const jsonChords = JSON.stringify(m.chords);
        html += `<button class="btn-load-mod" onclick='applyDynamicModulation(${tgtT}, "${tgtType==='maj7'?'major':'minor'}", ${jsonChords})'>▶ Завантажити на гриф та знайти AI шлях</button>`;
        html += `</div>`;
        container.innerHTML += html;
    });
}

function applyDynamicModulation(targetTonic, targetBaseScale, chordsArr) {
    switchTab('prog');
    ui.tonic.value = targetTonic;
    ui.baseScale.value = targetBaseScale;
    updateModeDropdown(); // Оновлює доступні моди і встановлює базовий

    chordsArr.forEach((c, idx) => {
        let interval = (c.root - targetTonic + 12) % 12;
        degreeSlots[idx].value = interval;
        typeSlots[idx].value = c.type;
    });

    ui.viewMode.value = 'chord';
    calculateVoiceLeading();
}

async function calculateVoiceLeading() {
    const progression = [0, 1, 2, 3].map(i => getChordInfo(i).pcs);
    const algo = ui.algoSelect.value;
    try {
        const res = await fetch('/api/voice-lead', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ progression: progression, algorithm: algo })
        });
        const data = await res.json();
        if (data.path) {
            calculatedPath = data.path;
            ui.viewMode.value = 'chord';
            currentStep = 0;
            columns.forEach(c => c.classList.remove('active-slot'));
            columns[0].classList.add('active-slot');
            render();
        } else { alert(data.error); }
    } catch(e) { console.error(e); }
}

function togglePlayback() { if (playInterval) stopPlayback(); else startPlayback(); }

function startPlayback() {
    ui.playBtn.textContent = '⏸ Стоп';
    ui.playBtn.classList.add('playing');
    ui.viewMode.value = 'chord';
    ui.viewMode.disabled = true;

    const bpm = parseInt(ui.bpm.value) || 80;
    const beats = (ui.beats && ui.beats.value) ? parseInt(ui.beats.value) : 4;
    const msPerChord = (60000 / bpm) * beats;

    playNextChord();
    playInterval = setInterval(playNextChord, msPerChord);
}

function stopPlayback() { clearInterval(playInterval); playInterval = null; ui.playBtn.textContent = '▶ Грати'; ui.playBtn.classList.remove('playing'); ui.viewMode.disabled = false; }
function playNextChord() { columns.forEach(c => c.classList.remove('active-slot')); columns[currentStep].classList.add('active-slot'); render(); currentStep = (currentStep + 1) % 4; }

function updateModeDropdown() {
    const base = ui.baseScale.value;
    ui.mode.innerHTML = '';
    for (const key in modesData[base]) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = key;
        ui.mode.appendChild(option);
    }
    invalidatePath();
    render();
}

function render() {
    ui.fretboard.innerHTML = '';
    const tonic = parseInt(ui.tonic.value);
    const modeInfo = modesData[ui.baseScale.value][ui.mode.value];
    const alteredIndices = getAlteredIndices(ui.baseScale.value, ui.mode.value);
    const isChordMode = ui.viewMode.value === 'chord';
    const voicingToDraw = (calculatedPath && isChordMode) ? calculatedPath[currentStep] : null;

    let chordInfo = null;

    if (isChordMode) {
        chordInfo = getChordInfo(currentStep);
        const modeText = calculatedPath ? "[⚡ AI Шлях]" : "[Усі аплікатури]";
        ui.chordDisplay.innerHTML = `${chordInfo.name} <span style="font-size:16px; color:#bbb;">(Ступінь: ${chordInfo.degreeRoman})</span> <span style="font-size:14px; color:#E53935;">${modeText}</span>`;

        ui.legend.innerHTML = `
            <div class="legend-item"><div class="legend-color" style="background-color: #E53935; border: 2px solid #fff;"></div> Корінь</div>
            <div class="legend-item"><div class="legend-color" style="background-color: #4CAF50;"></div> Терції / Sus</div>
            <div class="legend-item"><div class="legend-color" style="background-color: #2196F3;"></div> Квінти</div>
            <div class="legend-item"><div class="legend-color" style="background-color: #9C27B0;"></div> 7 / 6</div>
        `;
    } else {
        ui.chordDisplay.innerHTML = `Відображення Гами`;
        ui.legend.innerHTML = `
            <div class="legend-item"><div class="legend-color" style="background-color: #E53935; border: 2px solid #fff;"></div> Тоніка ладу</div>
            <div class="legend-item"><div class="legend-color" style="background-color: #2196F3;"></div> Ступені гами</div>
            <div class="legend-item"><div class="legend-color" style="background-color: #FF9800;"></div> Змінений ступінь (відн. натур. мажору/мінору)</div>
        `;
    }

    const instrument = ui.instrumentView ? ui.instrumentView.value : 'guitar';

    if (instrument === 'piano') {
        renderPianoKeyboard(tonic, modeInfo, alteredIndices, isChordMode, chordInfo);
        return;
    }

    const stringMap = { 1: "2", 2: "3", 3: "4", 4: "5" };

    for (let s = 0; s < 6; s++) {
        const row = document.createElement('div'); row.className = 'string-row'; row.innerHTML = '<div class="string-line"></div>';
        const backendKey = stringMap[s];

        for (let f = 0; f < 15; f++) {
            const fretDiv = document.createElement('div'); fretDiv.className = 'fret';
            if (s === 2 && [3, 5, 7, 9].includes(f)) fretDiv.innerHTML += '<div class="dot"></div>';
            if ((s === 1 || s === 4) && f === 12) fretDiv.innerHTML += '<div class="dot"></div>';
            if (s === 5) fretDiv.innerHTML += `<div class="fret-number">${f}</div>`;

            const notePc = (tuning[s] + f) % 12;
            const intervalFromScaleTonic = (notePc - tonic + 12) % 12;
            const scaleIndex = modeInfo.intervals.indexOf(intervalFromScaleTonic);

            let noteDiv = null;

            if (!isChordMode) {
                if (scaleIndex !== -1) {
                    noteDiv = document.createElement('div'); noteDiv.className = 'note scale-regular';
                    noteDiv.textContent = modeInfo.labels[scaleIndex];
                    if (modeInfo.labels[scaleIndex] === "1") {
                        noteDiv.classList.add('scale-tonic');
                    } else if (alteredIndices.has(scaleIndex)) {
                        noteDiv.classList.remove('scale-regular');
                        noteDiv.classList.add('scale-altered');
                    }
                }
            } else {
                const isChordTone = chordInfo.pcs.includes(notePc);
                const isViterbiNote = voicingToDraw && backendKey && voicingToDraw[backendKey] === f;

                if (isChordTone) {
                    noteDiv = document.createElement('div'); noteDiv.className = 'note';
                    const funcLabel = chordInfo.functions[notePc];
                    noteDiv.textContent = funcLabel;

                    if (calculatedPath && !isViterbiNote) {
                        noteDiv.classList.add('scale-regular', 'dimmed');
                    } else {
                        if (funcLabel === 'R') noteDiv.classList.add('chord-R');
                        else if (['3', 'b3', '2', '4'].includes(funcLabel)) noteDiv.classList.add('chord-3');
                        else if (['5', 'b5', '#5'].includes(funcLabel)) noteDiv.classList.add('chord-5');
                        else noteDiv.classList.add('chord-7');
                    }
                } else if (scaleIndex !== -1) {
                    const altClass = alteredIndices.has(scaleIndex) ? 'scale-altered' : 'scale-regular';
                    noteDiv = document.createElement('div'); noteDiv.className = `note ${altClass} dimmed`;
                    noteDiv.textContent = modeInfo.labels[scaleIndex];
                }
            }

            if (noteDiv) fretDiv.appendChild(noteDiv);
            row.appendChild(fretDiv);
        }
        ui.fretboard.appendChild(row);
    }
}

// Клавіатура фортепіано (2 октави) - альтернатива грифу гітари. На відміну
// від гітарного акордового виду (де підсвічується лише конкретна знайдена
// AI-аплікатура), тут для акордового режиму просто яскраво підсвічуються
// ВСІ входження нот акорду в діапазоні клавіатури - у фортепіано немає
// поняття "аплікатури"/позиції на грифі, яке потрібно було б вибирати.
function renderPianoKeyboard(tonic, modeInfo, alteredIndices, isChordMode, chordInfo) {
    const layout = buildPianoLayout();

    const keyboard = document.createElement('div');
    keyboard.className = 'piano-keyboard';

    const whiteLayer = document.createElement('div');
    whiteLayer.className = 'piano-white-keys';
    const whiteWidthPct = 100 / layout.totalWhite;

    layout.whiteKeys.forEach(wk => {
        const keyDiv = document.createElement('div');
        keyDiv.className = 'piano-white-key';
        keyDiv.style.width = whiteWidthPct + '%';
        const marker = buildPianoNoteMarker(wk.pc, tonic, modeInfo, alteredIndices, isChordMode, chordInfo);
        if (marker) keyDiv.appendChild(marker);
        whiteLayer.appendChild(keyDiv);
    });

    const blackLayer = document.createElement('div');
    blackLayer.className = 'piano-black-keys';
    const blackWidthPct = whiteWidthPct * 0.62;

    layout.blackKeys.forEach(bk => {
        const keyDiv = document.createElement('div');
        keyDiv.className = 'piano-black-key';
        keyDiv.style.width = blackWidthPct + '%';
        keyDiv.style.left = ((bk.afterWhiteIndex + 1) * whiteWidthPct - blackWidthPct / 2) + '%';
        const marker = buildPianoNoteMarker(bk.pc, tonic, modeInfo, alteredIndices, isChordMode, chordInfo);
        if (marker) keyDiv.appendChild(marker);
        blackLayer.appendChild(keyDiv);
    });

    keyboard.appendChild(whiteLayer);
    keyboard.appendChild(blackLayer);
    ui.fretboard.appendChild(keyboard);
}

// Та ж класифікація ноти (тонічна/змінена/акордовий тон/фонова гама), що і
// на гітарному грифі в render(), але для одного пітч-класу замість
// струни+ладу - спільна логіка з render() навмисно продубльована тут
// невеликим шматком, а не винесена в спільну функцію, щоб не чіпайте
// перевірений гітарний рендер зайвим рефакторингом.
function buildPianoNoteMarker(pc, tonic, modeInfo, alteredIndices, isChordMode, chordInfo) {
    const intervalFromTonic = (pc - tonic + 12) % 12;
    const scaleIndex = modeInfo.intervals.indexOf(intervalFromTonic);

    if (!isChordMode) {
        if (scaleIndex === -1) return null;
        const div = document.createElement('div');
        div.className = 'note scale-regular';
        div.textContent = modeInfo.labels[scaleIndex];
        if (modeInfo.labels[scaleIndex] === '1') {
            div.classList.add('scale-tonic');
        } else if (alteredIndices.has(scaleIndex)) {
            div.classList.remove('scale-regular');
            div.classList.add('scale-altered');
        }
        return div;
    }

    const isChordTone = chordInfo.pcs.includes(pc);
    if (isChordTone) {
        const div = document.createElement('div');
        div.className = 'note';
        const funcLabel = chordInfo.functions[pc];
        div.textContent = funcLabel;
        if (funcLabel === 'R') div.classList.add('chord-R');
        else if (['3', 'b3', '2', '4'].includes(funcLabel)) div.classList.add('chord-3');
        else if (['5', 'b5', '#5'].includes(funcLabel)) div.classList.add('chord-5');
        else div.classList.add('chord-7');
        return div;
    }

    if (scaleIndex !== -1) {
        const altClass = alteredIndices.has(scaleIndex) ? 'scale-altered' : 'scale-regular';
        const div = document.createElement('div');
        div.className = `note ${altClass} dimmed`;
        div.textContent = modeInfo.labels[scaleIndex];
        return div;
    }

    return null;
}

// --- ВАЖЛИВЕ ВИПРАВЛЕННЯ: ОБРОБНИКИ ПОДІЙ ---
ui.tonic.addEventListener('change', () => { invalidatePath(); render(); });
ui.viewMode.addEventListener('change', render);
if (ui.instrumentView) ui.instrumentView.addEventListener('change', render);
ui.baseScale.addEventListener('change', updateModeDropdown);
ui.mode.addEventListener('change', () => { invalidatePath(); render(); });
ui.algoSelect.addEventListener('change', () => { invalidatePath(); render(); });

initSlots();
updateModeDropdown();
