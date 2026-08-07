let video;
let analyserNode;
let frequencyData;
let playing = false;
let videoStarted = false;
let scrollX;
let textHeight;
let videoDuration;
let videoNativeWidth = 0;
let videoNativeHeight = 0;
let videoLayout = { x: 0, y: 0, w: 0, h: 0 };
let videoZoom = 1;
let targetVideoZoom = 1;
const MIN_VIDEO_ZOOM = 1;
const MAX_VIDEO_ZOOM = 3.5;
const VIDEO_ZOOM_STEP = 0.06;
const VIDEO_ZOOM_SMOOTH = 0.055;
const TICKER_SPEED = 0.936;
const SOLARIZE_COOLDOWN_MS = 30000;
let loopMode = false;
let showInstructions = true;
let autoMode = false;
let audioConnected = false;
let smoothBass = 0;
let smoothMid = 0;
let smoothTreble = 0;
let smoothLevel = 0;
let smoothPeak = 0;
let smoothRedSat = 0;
let smoothBlueSat = 0;
let smoothSolarize = 0;
let prevInstantPeak = 0;
let prevBass = 0;
let prevTreble = 0;
let lastSolarizeFlash = -SOLARIZE_COOLDOWN_MS;
let recording = false;
let mediaRecorder;
let recordedChunks = [];
let lastRecordingUrl = null;
let lastRecordingBlob = null;
let recordingExtension = 'mp4';
let recordingNeedsConversion = false;
let hasRecording = false;
let converting = false;
let videoPausedInit = false;

// Text scroll variables – lyrics with section labels
let poem = "(Verse 1 – Baritone, march-like cadence) We wear our polos like armor plates, drink craft beer while we guard the gates. We chant old glories we never knew, and call it war if we lose on the news. — (Chorus – Mock gospel harmony) Oh say can you see our delicate pride? Built on fear and a long, slow slide. We lost the crown, so now we shout loud: \"We're not angry — just Boys, and Proud.\" — (Verse 2 – Solo voice, theatrical) They took our jobs, our flags, our fate, we blame the world, but show up late. We scream \"tradition,\" punch the air, but can't define what's truly fair. — (Chorus – Call and response) (Call): Who are we? (Response): The last real men! (Call): What do we want? (Response): 1950 again! (All): We'll fight the mirror, not the lie, and call it \"freedom\" when others die. — (Bridge – Spoken word, processed voice) We cosplay as patriots, wielding memes like swords. We tattoo Rome on our flesh but don't read the fall. We fear being replaced… Because we replaced everyone else first. — (Final Chorus – Slow, ironic uplift) Oh say can you see, through the smoke and the crowd? It's just scared little boys in supremacist shrouds. History won't remember the volume we howled — Just the silence that followed when    the    flag    was    unfurled.";

function preload() {
    video = createVideo('all.mov', videoLoaded);
}

function initPausedVideo() {
    if (!video) return;

    playing = false;
    video.pause();
    video.volume(1);

    let el = video.elt;
    el.preload = 'auto';
    el.autoplay = false;
    el.playsInline = true;
    el.muted = false;

    let holdFirstFrame = () => {
        playing = false;
        video.pause();
        if (el.readyState >= 2 && el.currentTime > 0.05) {
            el.currentTime = 0;
        }
        lockVideoDimensions();
    };

    if (!videoPausedInit) {
        videoPausedInit = true;
        el.addEventListener('loadedmetadata', lockVideoDimensions);
        el.addEventListener('loadeddata', holdFirstFrame);
        el.addEventListener('seeked', () => {
            playing = false;
            video.pause();
        });
    }

    if (el.readyState >= 1) {
        lockVideoDimensions();
    }
    if (el.readyState >= 2) {
        holdFirstFrame();
    }
}

function videoLoaded() {
    initPausedVideo();
}

function lockVideoDimensions() {
    let nativeW = video.elt.videoWidth;
    let nativeH = video.elt.videoHeight;
    if (!nativeW || !nativeH) return;

    videoNativeWidth = nativeW;
    videoNativeHeight = nativeH;
    videoDuration = video.duration();
    scrollX = width;
    updateVideoLayout();
    videoStarted = true;
}

function updateVideoLayout() {
    if (!videoNativeWidth || !videoNativeHeight) return;

    let baseScale = height / videoNativeHeight;
    let baseW = videoNativeWidth * baseScale;
    let pairW = baseW * 2 * videoZoom;
    let fit = pairW > width ? width / pairW : 1;
    let panelW = baseW * videoZoom * fit;
    let panelH = height * videoZoom * fit;
    let totalW = panelW * 2;
    let startX = (width - totalW) / 2;
    let startY = (height - panelH) / 2;

    videoLayout.left = { x: startX, y: startY, w: panelW, h: panelH };
    videoLayout.right = { x: startX + panelW, y: startY, w: panelW, h: panelH };
    videoLayout.w = totalW;
    videoLayout.h = panelH;
    videoLayout.x = startX;
    videoLayout.y = startY;
}

function updateVideoZoom() {
    if (keyIsDown(90)) {
        targetVideoZoom = min(MAX_VIDEO_ZOOM, targetVideoZoom + VIDEO_ZOOM_STEP * 0.25);
    }
    if (keyIsDown(70)) {
        targetVideoZoom = max(MIN_VIDEO_ZOOM, targetVideoZoom - VIDEO_ZOOM_STEP * 0.25);
    }

    videoZoom = lerp(videoZoom, targetVideoZoom, VIDEO_ZOOM_SMOOTH);
    if (abs(videoZoom - targetVideoZoom) < 0.001) {
        videoZoom = targetVideoZoom;
    }
    updateVideoLayout();
}

function zoomVideoIn() {
    targetVideoZoom = min(MAX_VIDEO_ZOOM, targetVideoZoom + VIDEO_ZOOM_STEP);
}

function zoomVideoOut() {
    targetVideoZoom = max(MIN_VIDEO_ZOOM, targetVideoZoom - VIDEO_ZOOM_STEP);
}

function setup() {
    createCanvas(windowWidth, windowHeight);
    video.hide();
    initPausedVideo();
    
    textHeight = height * 0.93;
    
    textSize(20);
    textFont('Courier');
    textAlign(LEFT, CENTER);
}

function updateCursorVisibility() {
    document.body.style.cursor = playing ? 'none' : 'default';
}

function draw() {
    updateCursorVisibility();
    background(0);

    if (!videoStarted || !videoLayout.w || !videoLayout.h) {
        drawInstructions();
        return;
    }

    if (playing && autoMode) {
        updateAudioLevels();
    } else {
        decayAudioLevels();
    }

    updateVideoZoom();

    drawVideoPanels();

    drawScrollingLyrics();
    
    push();
    
    drawInstructions();
    
    if (recording) {
        drawRecordingIndicator();
    } else if (converting) {
        drawConvertingIndicator();
    } else if (autoMode) {
        drawAutoIndicator();
    }
    
    pop();
}

function connectVideoAudioAnalysis() {
    if (audioConnected) return;
    try {
        userStartAudio();
        let audioContext = getAudioContext();
        video.volume(1);
        video.elt.muted = false;

        let source = audioContext.createMediaElementSource(video.elt);
        analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = 1024;
        analyserNode.smoothingTimeConstant = 0.03;
        frequencyData = new Uint8Array(analyserNode.frequencyBinCount);

        source.connect(analyserNode);
        source.connect(audioContext.destination);
        audioConnected = true;
    } catch (err) {
        console.warn('Video audio analysis unavailable:', err);
    }
}

function readVideoAudioBands() {
    if (!analyserNode || !frequencyData) {
        return { bass: 0, mid: 0, treble: 0, level: 0, peak: 0 };
    }

    analyserNode.getByteFrequencyData(frequencyData);
    let len = frequencyData.length;
    let bassSum = 0;
    let midSum = 0;
    let trebleSum = 0;
    let totalSum = 0;
    let peak = 0;
    let bassEnd = floor(len * 0.12);
    let midEnd = floor(len * 0.5);

    for (let i = 0; i < len; i++) {
        let value = frequencyData[i];
        peak = max(peak, value);
        totalSum += value;
        if (i < bassEnd) bassSum += value;
        else if (i < midEnd) midSum += value;
        else trebleSum += value;
    }

    return {
        bass: amplifyAudio(bassSum / max(1, bassEnd)),
        mid: amplifyAudio(midSum / max(1, midEnd - bassEnd)),
        treble: amplifyAudio(trebleSum / max(1, len - midEnd)),
        level: amplifyAudio(totalSum / len),
        peak: amplifyAudio(peak)
    };
}

function amplifyAudio(value) {
    let normalized = value / 255;
    return constrain(pow(normalized, 0.45) * 2.8, 0, 1);
}

function shapeSatDrive(value) {
    if (value < 0.14) return 0;
    return pow((value - 0.14) / 0.86, 2.2);
}

function updateAudioLevels() {
    connectVideoAudioAnalysis();
    let bands = readVideoAudioBands();
    let bassHit = max(0, bands.bass - prevBass * 0.72);
    let trebleHit = max(0, bands.treble - prevTreble * 0.72);
    prevBass = bands.bass;
    prevTreble = bands.treble;

    smoothBass = lerp(smoothBass, bands.bass, 0.82);
    smoothMid = lerp(smoothMid, bands.mid, 0.72);
    smoothTreble = lerp(smoothTreble, bands.treble, 0.82);
    smoothLevel = lerp(smoothLevel, bands.level, 0.75);
    smoothPeak = lerp(smoothPeak, bands.peak, 0.94);

    let rawRed = constrain(bands.bass * 0.45 + bassHit * 2.1 + bands.peak * 0.55, 0, 1);
    let rawBlue = constrain(bands.treble * 0.45 + trebleHit * 1.6 + bands.mid * 0.3, 0, 1);
    let targetRed = shapeSatDrive(rawRed);
    let targetBlue = shapeSatDrive(rawBlue);

    if (targetRed > smoothRedSat) {
        smoothRedSat = lerp(smoothRedSat, targetRed, 0.62);
    } else {
        smoothRedSat = lerp(smoothRedSat, targetRed, 0.24);
    }
    if (targetBlue > smoothBlueSat) {
        smoothBlueSat = lerp(smoothBlueSat, targetBlue, 0.58);
    } else {
        smoothBlueSat = lerp(smoothBlueSat, targetBlue, 0.22);
    }

    let peak = bands.peak;
    let spike = max(0, peak - max(prevInstantPeak * 0.9, smoothLevel + 0.28));
    prevInstantPeak = peak;

    let flashTarget = 0;
    if (peak > 0.78 && spike > 0.14) {
        flashTarget = constrain(spike * 2.2, 0, 1);
    }

    if (flashTarget > 0 && millis() - lastSolarizeFlash >= SOLARIZE_COOLDOWN_MS) {
        smoothSolarize = flashTarget;
        lastSolarizeFlash = millis();
    } else {
        smoothSolarize *= 0.4;
    }
}

function decayAudioLevels() {
    smoothBass = lerp(smoothBass, 0, 0.12);
    smoothMid = lerp(smoothMid, 0, 0.12);
    smoothTreble = lerp(smoothTreble, 0, 0.12);
    smoothLevel = lerp(smoothLevel, 0, 0.12);
    smoothPeak = lerp(smoothPeak, 0, 0.12);
    smoothRedSat = lerp(smoothRedSat, 0, 0.12);
    smoothBlueSat = lerp(smoothBlueSat, 0, 0.12);
    smoothSolarize = 0;
    prevInstantPeak = 0;
    prevBass = 0;
    prevTreble = 0;
}

function toggleAutoMode() {
    autoMode = !autoMode;
    if (autoMode) connectVideoAudioAnalysis();
}

function getPanelVideoRect(panelW, panelH, seamSide) {
    let drawH = panelH;
    let drawW = drawH * (videoNativeWidth / videoNativeHeight);
    let drawX = seamSide === 'right' ? panelW - drawW : 0;
    return { x: drawX, y: 0, w: drawW, h: drawH };
}

function drawVideoPanels() {
    let left = videoLayout.left;
    let right = videoLayout.right;
    drawVideoPanel(left.x, left.y, left.w, left.h, false);
    drawVideoPanel(right.x, right.y, right.w, right.h, true);
}

function drawVideoPanel(x, y, w, h, flipX) {
    push();
    translate(x, y);
    if (flipX) {
        translate(w, 0);
        scale(-1, 1);
    }

    let ctx = drawingContext;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();

    let vr = getPanelVideoRect(w, h, flipX ? 'left' : 'right');
    drawVideoContent(vr.x, vr.y, vr.w, vr.h, w, h);

    ctx.restore();
    pop();
}

function drawVideoContent(vx, vy, vw, vh, panelW, panelH) {
    image(video, vx, vy, vw, vh);

    if (autoMode && playing) {
        applyRedBlueSaturation(vx, vy, vw, vh, panelW, panelH);
        applyWhiteSolarizeFlash(vx, vy, vw, vh, panelW, panelH);
    }
}

function applyWhiteSolarizeFlash(vx, vy, vw, vh, panelW, panelH) {
    if (smoothSolarize < 0.18) return;

    let amp = smoothSolarize;
    let ctx = drawingContext;
    let contrast = 2.6 + amp * 1.1;
    let bright = 1.14 + amp * 0.18;

    push();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, panelW, panelH);
    ctx.clip();

    ctx.filter = `grayscale(1) contrast(${contrast}) brightness(${bright})`;
    tint(255, 255, 255, amp * 220);
    image(video, vx, vy, vw, vh);

    blendMode(SCREEN);
    ctx.filter = `grayscale(1) invert(1) contrast(${contrast * 0.8}) brightness(${bright})`;
    tint(255, 255, 255, amp * 180);
    image(video, vx, vy, vw, vh);

    ctx.filter = 'none';
    ctx.restore();
    pop();
}

function applyRedBlueSaturation(vx, vy, vw, vh, panelW, panelH) {
    if (smoothRedSat < 0.03 && smoothBlueSat < 0.03) return;

    let ctx = drawingContext;

    push();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, panelW, panelH);
    ctx.clip();

    if (smoothRedSat > 0.03) {
        blendMode(SOFT_LIGHT);
        tint(255, 28, 28, smoothRedSat * 200);
        image(video, vx, vy, vw, vh);
        if (smoothRedSat > 0.45) {
            blendMode(SCREEN);
            tint(255, 18, 18, (smoothRedSat - 0.45) * 260);
            image(video, vx, vy, vw, vh);
        }
    }

    if (smoothBlueSat > 0.03) {
        blendMode(SOFT_LIGHT);
        tint(28, 48, 255, smoothBlueSat * 200);
        image(video, vx, vy, vw, vh);
        if (smoothBlueSat > 0.45) {
            blendMode(SCREEN);
            tint(18, 36, 255, (smoothBlueSat - 0.45) * 260);
            image(video, vx, vy, vw, vh);
        }
    }

    ctx.restore();
    pop();
}

function drawScrollingLyrics() {
    push();
    noStroke();
    fill(0, 0, 0, 200);
    rect(0, textHeight - 25, width, 50);

    for (let i = 0; i < 10; i++) {
        let alpha = map(i, 0, 10, 100, 0);
        fill(0, 0, 0, alpha);
        rect(0, textHeight - 25 - i, width, 1);
        rect(0, textHeight + 24 + i, width, 1);
    }

    if (videoStarted && videoDuration) {
        fill(255);
        textSize(20);
        textFont('Courier');
        textAlign(LEFT, CENTER);
        let textW = textWidth(poem);
        let totalScrollWidth = width + textW;
        let progress = (video.time() / videoDuration) * TICKER_SPEED;
        scrollX = width - (totalScrollWidth * progress);
        text(poem, scrollX, textHeight);

        if (scrollX < width / 2) {
            text(poem, scrollX + totalScrollWidth, textHeight);
        }
    }
    pop();
}

function getRecordingFormat() {
    let formats = [
        { mimeType: 'video/mp4;codecs="avc1.42E01E,mp4a.40.2"', extension: 'mp4' },
        { mimeType: 'video/mp4', extension: 'mp4' },
        { mimeType: 'video/quicktime', extension: 'mov' },
        { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
        { mimeType: 'video/webm', extension: 'webm' }
    ];
    
    for (let format of formats) {
        if (MediaRecorder.isTypeSupported(format.mimeType)) {
            return format;
        }
    }
    
    return { mimeType: '', extension: 'webm' };
}

async function downloadRecording() {
    if (!lastRecordingBlob || !hasRecording || converting) return;
    
    let blob = lastRecordingBlob;
    let extension = recordingExtension;
    
    if (recordingNeedsConversion) {
        converting = true;
        try {
            blob = await convertRecordingToMp4(blob);
            extension = 'mp4';
        } catch (err) {
            console.error('Could not convert recording to MP4:', err);
            converting = false;
            return;
        }
        converting = false;
    }
    
    let link = document.createElement('a');
    let url = URL.createObjectURL(blob);
    link.href = url;
    link.download = 'boys-will-be-proud-' + Date.now() + '.' + extension;
    link.click();
    URL.revokeObjectURL(url);
}

async function convertRecordingToMp4(inputBlob) {
    const { FFmpeg } = await import('https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js');
    const { fetchFile, toBlobURL } = await import('https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js');
    
    const ffmpeg = new FFmpeg();
    const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
    await ffmpeg.load({
        coreURL: await toBlobURL(baseURL + '/ffmpeg-core.js', 'text/javascript'),
        wasmURL: await toBlobURL(baseURL + '/ffmpeg-core.wasm', 'application/wasm')
    });
    
    await ffmpeg.writeFile('input.webm', await fetchFile(inputBlob));
    await ffmpeg.exec(['-i', 'input.webm', '-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart', 'output.mp4']);
    let data = await ffmpeg.readFile('output.mp4');
    return new Blob([data.buffer], { type: 'video/mp4' });
}

function drawInstructions() {
    if (!showInstructions) return;
    
    push();
    textAlign(LEFT, TOP);
    textSize(9);
    textFont('Courier');
    fill(255, 255, 255, 90);
    noStroke();
    
    let x = 62;
    let y = 60;
    let lineHeight = 11;
    let lines = [
        'space  play / pause',
        'a  automate',
        'l  loop',
        'z  zoom in',
        'f  zoom out',
        'r  record',
        'd  download',
        'h  hide'
    ];
    
    for (let i = 0; i < lines.length; i++) {
        text(lines[i], x, y);
        y += lineHeight;
    }
    
    pop();
}

function drawConvertingIndicator() {
    push();
    textAlign(RIGHT, TOP);
    textSize(9);
    textFont('Courier');
    fill(255, 255, 255, 120);
    noStroke();
    text('saving mp4…', width - 12, 12);
    pop();
}

function drawAutoIndicator() {
    push();
    textAlign(RIGHT, TOP);
    textSize(9);
    textFont('Courier');
    fill(255, 255, 255, 120);
    noStroke();
    text('auto', width - 12, 12);
    pop();
}

function drawRecordingIndicator() {
    push();
    noStroke();
    fill(220, 40, 40, 200);
    ellipse(width - 16, 16, 8, 8);
    textAlign(RIGHT, TOP);
    textSize(9);
    textFont('Courier');
    fill(255, 255, 255, 120);
    text('rec', width - 24, 12);
    pop();
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    textHeight = height * 0.93;
    updateVideoLayout();
}

function keyPressed() {
    if (keyCode === 32) {
        togglePlayPause();
        return false;
    } else if (key.toLowerCase() === 'a') {
        toggleAutoMode();
    } else if (key.toLowerCase() === 'l') {
        toggleLoop();
    } else if (key.toLowerCase() === 'z') {
        zoomVideoIn();
    } else if (key.toLowerCase() === 'f') {
        zoomVideoOut();
    } else if (key.toLowerCase() === 'r') {
        toggleRecording();
    } else if (key.toLowerCase() === 'd') {
        downloadRecording();
    } else if (key.toLowerCase() === 'h') {
        showInstructions = !showInstructions;
    }
}

function togglePlayPause() {
    if (playing) {
        video.pause();
        playing = false;
    } else {
        video.play();
        playing = true;
    }
}

function toggleLoop() {
    loopMode = !loopMode;
    if (loopMode) {
        video.loop();
    } else {
        video.noLoop();
    }
}

function toggleRecording() {
    if (recording) {
        stopRecording();
    } else {
        startRecording();
    }
}

function startRecording() {
    let canvas = document.querySelector('canvas');
    if (!canvas || !canvas.captureStream) return;
    
    let stream = canvas.captureStream(30);
    let videoEl = video.elt;
    
    if (videoEl && videoEl.captureStream) {
        let videoStream = videoEl.captureStream();
        videoStream.getAudioTracks().forEach(track => stream.addTrack(track));
    }
    
    recordedChunks = [];
    let format = getRecordingFormat();
    recordingExtension = format.extension;
    recordingNeedsConversion = format.extension === 'webm';
    
    let options = format.mimeType ? { mimeType: format.mimeType } : {};
    mediaRecorder = new MediaRecorder(stream, options);
    mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
        if (lastRecordingUrl) URL.revokeObjectURL(lastRecordingUrl);
        let mimeType = format.mimeType || mediaRecorder.mimeType || 'video/webm';
        lastRecordingBlob = new Blob(recordedChunks, { type: mimeType });
        lastRecordingUrl = URL.createObjectURL(lastRecordingBlob);
        hasRecording = true;
    };
    mediaRecorder.start();
    recording = true;
    
    if (!playing) {
        video.play();
        playing = true;
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    recording = false;
}
