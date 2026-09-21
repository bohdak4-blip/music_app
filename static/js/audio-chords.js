// Вкладка "Розпізнавання акордів (аудіо)": відправляє обраний локальний
// аудіофайл на /api/detect-chords (див. app.py) і малює результат як
// таймлайн. Це read-only перегляд у v1 - акорди сюди не тягнуться назад
// у 4-слотовий інструмент голосоведення (див. AGENTS.md, розділ "Ідеї").

function formatAudioTime(seconds) {
    const total = Math.max(0, Math.floor(seconds || 0));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function renderChordTimeline(segments) {
    const container = document.getElementById('chordTimeline');
    container.innerHTML = '';

    if (!segments || segments.length === 0) {
        container.innerHTML = '<p style="color:#aaa; text-align:center;">Акордів не розпізнано.</p>';
        return;
    }

    segments.forEach(seg => {
        const isSilence = seg.chord === 'N';
        const row = document.createElement('div');
        row.className = 'chord-seg' + (isSilence ? ' chord-seg-silence' : '');

        const time = document.createElement('span');
        time.className = 'chord-seg-time';
        time.textContent = `${formatAudioTime(seg.start)} – ${formatAudioTime(seg.end)}`;

        const label = document.createElement('span');
        label.className = 'chord-seg-label';
        label.textContent = isSilence ? '—' : seg.chord;

        const dur = document.createElement('span');
        dur.className = 'chord-seg-dur';
        dur.textContent = `${(seg.end - seg.start).toFixed(1)}с`;

        row.appendChild(time);
        row.appendChild(label);
        row.appendChild(dur);
        container.appendChild(row);
    });
}

async function analyzeAudioFile() {
    const input = document.getElementById('audioFileInput');
    const status = document.getElementById('audioStatus');
    const btn = document.getElementById('analyzeAudioBtn');
    const timeline = document.getElementById('chordTimeline');

    if (!input.files || input.files.length === 0) {
        status.textContent = 'Спочатку оберіть аудіофайл.';
        status.style.color = '#FF9800';
        return;
    }

    const file = input.files[0];
    const formData = new FormData();
    formData.append('audio', file);

    status.textContent = `Аналізується «${file.name}»... для довгих файлів це може зайняти хвилину.`;
    status.style.color = '#aaa';
    timeline.innerHTML = '';
    btn.disabled = true;

    try {
        const res = await fetch('/api/detect-chords', { method: 'POST', body: formData });
        const data = await res.json();

        if (!res.ok || data.error) {
            status.textContent = data.error || 'Сталася помилка під час аналізу.';
            status.style.color = '#E53935';
            return;
        }

        status.textContent = `Готово: ${data.segments.length} сегментів, тривалість ~${formatAudioTime(data.duration)}.`;
        status.style.color = '#4CAF50';
        renderChordTimeline(data.segments);
    } catch (e) {
        console.error(e);
        status.textContent = 'Не вдалося з’єднатися з сервером аналізу.';
        status.style.color = '#E53935';
    } finally {
        btn.disabled = false;
    }
}
