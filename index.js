(function () {
  'use strict';

  function setupDotGrid() {
    const canvas = document.getElementById('dot-grid');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const spacing = 34;
    const dotRadius = 0.9;
    const baseAlpha = 0.16;
    const influence = 280;
    const boost = 0.52;
    let width = 0;
    let height = 0;
    let mouseX = -9999;
    let mouseY = -9999;
    let lerpX = -9999;
    let lerpY = -9999;

    function resize() {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    }

    function vignette(x, y) {
      const dx = (x - width / 2) / (width * 0.5);
      const dy = (y - height / 2) / (height * 0.5);
      const distance = Math.sqrt(dx * dx + dy * dy);
      return 1 - Math.max(0, Math.min(1, (distance - 0.38) / (0.72 - 0.38)));
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);
      lerpX += (mouseX < -999 ? -9999 : mouseX - lerpX) * (mouseX < -999 ? 0.04 : 0.085);
      lerpY += (mouseY < -999 ? -9999 : mouseY - lerpY) * (mouseY < -999 ? 0.04 : 0.085);
      const cols = Math.ceil(width / spacing) + 2;
      const rows = Math.ceil(height / spacing) + 2;
      for (let row = -1; row < rows; row += 1) {
        for (let col = -1; col < cols; col += 1) {
          const x = col * spacing + spacing / 2;
          const y = row * spacing + spacing / 2;
          const fade = vignette(x, y);
          if (fade <= 0) continue;
          let lit = 0;
          if (lerpX > -999) {
            const dx = x - lerpX;
            const dy = y - lerpY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < influence) lit = boost * Math.pow(1 - distance / influence, 2);
          }
          ctx.beginPath();
          ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${((baseAlpha + lit) * fade).toFixed(3)})`;
          ctx.fill();
        }
      }
      requestAnimationFrame(draw);
    }

    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', (event) => {
      mouseX = event.clientX;
      mouseY = event.clientY;
    }, { passive: true });
    window.addEventListener('pointerleave', () => {
      mouseX = -9999;
      mouseY = -9999;
    });
    resize();
    draw();
  }

  function setupPlayground() {
    const editor = document.getElementById('cherry-editor');
    const output = document.getElementById('cherry-output');
    const runBtn = document.getElementById('run-btn');
    const clearBtn = document.getElementById('clear-btn');
    const inputRow = document.getElementById('input-row');
    const programInput = document.getElementById('program-input');
    const inputSubmit = document.getElementById('input-submit');
    const packageUpload = document.getElementById('package-upload');
    const packageUploadPanel = document.getElementById('package-upload-panel');
    const packageStatus = document.getElementById('package-status');
    const loadedPackages = document.getElementById('loaded-packages');
    if (!editor || !output || !runBtn || !clearBtn || !inputRow || !programInput || !inputSubmit) return;

    let running = false;
    let pendingInputResolve = null;
    const packageNames = [];

    function appendOutput(text, cls) {
      const placeholder = output.querySelector('.out-muted');
      if (placeholder) placeholder.remove();
      const span = document.createElement('span');
      span.className = cls;
      span.textContent = text;
      output.appendChild(span);
      output.scrollTop = output.scrollHeight;
    }
    const printLine = (text) => appendOutput(text, 'out-line');
    const printError = (text) => appendOutput(text, 'out-error');
    const printInfo = (text) => appendOutput(text, 'out-info');
    const printEcho = (text) => appendOutput('> ' + text, 'out-echo');
    const printPrompt = (text) => {
      if (text) appendOutput(text, 'out-prompt');
    };

    function showInputRow() {
      inputRow.classList.remove('hidden');
      programInput.value = '';
      programInput.focus();
    }

    function hideInputRow() {
      inputRow.classList.add('hidden');
    }

    function submitInput() {
      if (!pendingInputResolve) return;
      const value = programInput.value;
      const resolve = pendingInputResolve;
      pendingInputResolve = null;
      printEcho(value);
      hideInputRow();
      resolve(value);
    }

    function input(prompt) {
      return new Promise((resolve) => {
        printPrompt(prompt);
        showInputRow();
        pendingInputResolve = resolve;
      });
    }

    async function uploadPackage(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      try {
        if (!window.CherryEmulator || !window.CherryEmulator.loadPackageArchive) {
          throw new Error('Cherry emulator package loader is not available');
        }
        const result = await window.CherryEmulator.loadPackageArchive(file);
        if (!packageNames.includes(result.name)) packageNames.push(result.name);
        if (packageStatus) packageStatus.textContent = `loaded ${result.name}`;
        if (loadedPackages) loadedPackages.textContent = packageNames.join(', ');
        printInfo(`package loaded: ${result.name}`);
      } catch (error) {
        if (packageStatus) packageStatus.textContent = 'package failed';
        printError(`package error: ${error.message}`);
      } finally {
        event.target.value = '';
      }
    }

    async function runCode() {
      if (running) return;
      running = true;
      output.innerHTML = '';
      runBtn.classList.add('running');
      runBtn.textContent = '◼ Running';
      hideInputRow();
      pendingInputResolve = null;

      try {
        await window.CherryEmulator.run(editor.value, { print: printLine, input });
        printInfo('- program finished -');
      } catch (error) {
        const line = error.line ? ` at line ${error.line}` : '';
        printError(`error${line}: ${error.message}`);
      } finally {
        running = false;
        hideInputRow();
        pendingInputResolve = null;
        runBtn.classList.remove('running');
        runBtn.textContent = '▶ Run';
      }
    }

    function resetOutput() {
      if (running && pendingInputResolve) pendingInputResolve('');
      running = false;
      pendingInputResolve = null;
      hideInputRow();
      runBtn.classList.remove('running');
      runBtn.textContent = '▶ Run';
      output.innerHTML = '<span class="out-muted">Press ▶ Run to execute your Cherry code.</span>';
    }

    function autoResize() {
      editor.style.height = 'auto';
      editor.style.height = Math.min(Math.max(editor.scrollHeight, 160), 380) + 'px';
    }

    inputSubmit.addEventListener('click', submitInput);
    if (packageUpload) packageUpload.addEventListener('change', uploadPackage);
    if (packageUploadPanel) packageUploadPanel.addEventListener('change', uploadPackage);
    programInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitInput();
      }
    });
    runBtn.addEventListener('click', runCode);
    clearBtn.addEventListener('click', resetOutput);
    editor.addEventListener('keydown', (event) => {
      if (event.key === 'Tab') {
        event.preventDefault();
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        editor.value = editor.value.substring(0, start) + '    ' + editor.value.substring(end);
        editor.selectionStart = editor.selectionEnd = start + 4;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        runCode();
      }
    });
    editor.addEventListener('input', autoResize);

    const handle = document.getElementById('pg-resize');
    if (handle) {
      let dragging = false;
      let startY = 0;
      let startHeight = 0;
      handle.addEventListener('mousedown', (event) => {
        dragging = true;
        startY = event.clientY;
        startHeight = editor.offsetHeight;
        document.body.style.userSelect = 'none';
      });
      window.addEventListener('mousemove', (event) => {
        if (!dragging) return;
        editor.style.height = Math.min(Math.max(startHeight + event.clientY - startY, 100), 500) + 'px';
      });
      window.addEventListener('mouseup', () => {
        dragging = false;
        document.body.style.userSelect = '';
      });
    }

    autoResize();
  }

  setupDotGrid();
  setupPlayground();
})();
