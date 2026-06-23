const $ = (s) => document.querySelector(s);

let droppedPaths = [];
let imagePaths = [];
let selectedOutputFolder = null;
let selectedImagePath = null;
let coverImagePath = null;
let thumbnailUrls = new Map();
let thumbnailRequestId = 0;
let inputDialogOpen = false;
let coverCrop = {
  aspectRatio: '16:9',
  orientation: 'landscape',
  width: 1920,
  height: 1080,
  box: { x: 5, y: 24.6875, width: 90, height: 50.625 }
};

const ASPECT_RATIOS = {
  '16:9': [16, 9],
  '1:1': [1, 1],
  '4:3': [4, 3]
};

const MAX_VISIBLE_THUMBNAILS = 200;
const THUMBNAIL_BATCH_SIZE = 40;

function setLogo() {
  if (!window.photopti?.getLogoPath) return;
  window.photopti.getLogoPath().then((p) => {
    const el = $('#logo');
    if (el && p) {
      el.src = `file://${p}`;
    }
  });
}

function initDnD() {
  const dropzone = $('#dropzone');
  const dropSection = $('#drop-section');
  const dropzoneTrigger = $('#dropzoneTrigger');
  const inputChoices = $('#inputChoices');
  const selectImages = $('#selectImages');
  const selectFolder = $('#selectFolder');

  // Handle drag events on dropzone (when visible)
  ['dragenter','dragover'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('hover');
    });
  });
  ;['dragleave','drop'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('hover');
    });
  });

  // Handle drag events on drop-section (always active, even when dropzone is hidden)
  ['dragenter','dragover'].forEach(evt => {
    dropSection.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!dropzone.classList.contains('hidden')) {
        dropzone.classList.add('hover');
      }
    });
  });
  ;['dragleave','drop'].forEach(evt => {
    dropSection.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('hover');
    });
  });

  const addInputPaths = async (newPaths) => {
    if (newPaths.length === 0) return;

    // Append new paths, avoiding duplicates
    const existingSet = new Set(droppedPaths);
    const uniqueNewPaths = Array.from(new Set(newPaths)).filter(p => !existingSet.has(p));
    if (uniqueNewPaths.length === 0) return;

    try {
      const newImagePaths = await window.photopti.listImages(uniqueNewPaths);
      droppedPaths = [...droppedPaths, ...uniqueNewPaths];
      // Merge new image paths with existing ones, avoiding duplicates
      const existingImageSet = new Set(imagePaths);
      const uniqueNewImages = newImagePaths.filter(p => !existingImageSet.has(p));
      imagePaths = [...imagePaths, ...uniqueNewImages];
      
      // Reset selected folder when new files are added
      selectedOutputFolder = null;
      
      renderThumbs(imagePaths);
      updateFolderSelectionUI();
      updateFooterStats();
      setChoicesOpen(false);
      $('#status').textContent = '';
    } catch (error) {
      $('#status').textContent = `Could not add images: ${error.message || error}`;
    }
  };

  const handleDrop = (e) => {
    const files = Array.from(e.dataTransfer.files || []);
    const newPaths = files.map(f => f.path);
    addInputPaths(newPaths);
  };

  dropzone.addEventListener('drop', handleDrop);
  dropSection.addEventListener('drop', handleDrop);

  const setChoicesOpen = (open) => {
    inputChoices.classList.toggle('hidden', !open);
    dropzoneTrigger.setAttribute('aria-expanded', String(open));
  };

  dropzoneTrigger.addEventListener('click', () => {
    const isOpen = !inputChoices.classList.contains('hidden');
    setChoicesOpen(!isOpen);
    if (!isOpen) selectImages.focus();
  });

  dropzone.addEventListener('click', (event) => {
    if (event.target === dropzone || event.target.closest('.drop-destination')) {
      dropzoneTrigger.click();
    }
  });

  const selectFromDialog = async (kind) => {
    if (inputDialogOpen || !window.photopti?.showInputDialog) return;
    inputDialogOpen = true;
    selectImages.disabled = true;
    selectFolder.disabled = true;
    try {
      const paths = await window.photopti.showInputDialog(kind);
      if (paths) await addInputPaths(paths);
    } catch (error) {
      $('#status').textContent = `Could not open selection dialog: ${error.message || error}`;
    } finally {
      inputDialogOpen = false;
      selectImages.disabled = false;
      selectFolder.disabled = false;
      setChoicesOpen(false);
    }
  };

  selectImages.addEventListener('click', () => selectFromDialog('images'));
  selectFolder.addEventListener('click', () => selectFromDialog('folder'));
}

function getUniqueFolders(paths) {
  const folders = new Set();
  paths.forEach(p => {
    const separatorIndex = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
    const dir = p.substring(0, separatorIndex);
    if (dir) folders.add(dir);
  });
  return Array.from(folders);
}

function hasMultipleFolders(paths) {
  const folders = getUniqueFolders(paths);
  return folders.length > 1;
}

function getFileName(path) {
  return path.split(/[\\/]/).pop();
}

function getSourceSummary(paths) {
  if (paths.length === 0) return 'No source selected';
  if (paths.length === 1) return paths[0];
  const folders = getUniqueFolders(paths);
  return folders.length === 1 ? folders[0] : `Multiple folders (${folders.length})`;
}

function updateFooterStats() {
  const source = $('#footerSource');
  const count = $('#footerImageCount');
  const coverStat = $('#footerCoverStat');
  const cover = $('#footerCover');
  if (!source || !count || !coverStat || !cover) return;

  const sourceText = getSourceSummary(droppedPaths);
  source.textContent = sourceText;
  source.title = sourceText;
  source.setAttribute('aria-label', `Source: ${sourceText}`);
  count.textContent = String(imagePaths.length);
  count.setAttribute('aria-label', `Images: ${imagePaths.length}`);

  coverStat.classList.toggle('hidden', !coverImagePath);
  if (coverImagePath) {
    cover.textContent = getFileName(coverImagePath);
    cover.title = coverImagePath;
    cover.setAttribute('aria-label', `Cover: ${coverImagePath}`);
  } else {
    cover.textContent = '';
    cover.removeAttribute('title');
    cover.removeAttribute('aria-label');
  }
}

function updateFolderSelectionUI() {
  const folderSelection = $('#folderSelection');
  const folderSelectBtn = $('#folderSelectBtn');
  const folderDisplay = $('#folderDisplay');
  
  if (!folderSelection || !folderSelectBtn || !folderDisplay) return;
  
  if (hasMultipleFolders(droppedPaths)) {
    folderSelection.classList.remove('hidden');
    if (selectedOutputFolder) {
      folderDisplay.textContent = `Output: ${selectedOutputFolder}`;
      folderDisplay.classList.remove('hidden');
    } else {
      folderDisplay.classList.add('hidden');
    }
  } else {
    folderSelection.classList.add('hidden');
    selectedOutputFolder = null;
  }
}

function removePhoto(path) {
  droppedPaths = droppedPaths.filter(p => p !== path);
  imagePaths = imagePaths.filter(p => p !== path);
  thumbnailUrls.delete(path);
  if (selectedImagePath === path) {
    selectedImagePath = null;
  }
  if (coverImagePath === path) {
    coverImagePath = null;
    resetCoverCrop();
  }
  
  if (imagePaths.length === 0) {
    const thumbs = $('#thumbs');
    const dropzone = $('#dropzone');
    thumbs.classList.add('hidden');
    dropzone.classList.remove('hidden');
    droppedPaths = [];
    selectedOutputFolder = null;
    selectedImagePath = null;
    coverImagePath = null;
    resetCoverCrop();
    $('#folderSelection').classList.add('hidden');
  } else {
    renderThumbs(imagePaths);
    updateFolderSelectionUI();
    updateCoverCropUI();
  }
  updateFooterStats();
}

function selectImage(path) {
  selectedImagePath = path;
  updateThumbnailSelectionUI();
}

function promoteToCover(path) {
  coverImagePath = path;
  resetCoverCrop();
  renderThumbs(imagePaths);
  updateCoverCropUI();
  updateFooterStats();
}

function getThumbnailLabel(path, isSelected, isCover) {
  const states = [];
  if (isSelected) states.push('selected');
  if (isCover) states.push('cover image');
  return `${getFileName(path)}${states.length ? `, ${states.join(', ')}` : ''}`;
}

function updateThumbnailSelectionUI() {
  document.querySelectorAll('.thumb').forEach((thumb) => {
    const path = thumb.dataset.path;
    const isSelected = selectedImagePath === path;
    const isCover = coverImagePath === path;
    thumb.classList.toggle('thumb-selected', isSelected);
    thumb.setAttribute('aria-pressed', String(isSelected));
    thumb.setAttribute('aria-label', getThumbnailLabel(path, isSelected, isCover));
  });
}

function resetCoverCrop() {
  coverCrop = {
    aspectRatio: '16:9',
    orientation: 'landscape',
    width: 1920,
    height: 1080,
    box: { x: 5, y: 24.6875, width: 90, height: 50.625 }
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getCoverRatio() {
  if (coverCrop.aspectRatio === 'free') return null;
  const [wide, tall] = ASPECT_RATIOS[coverCrop.aspectRatio] || ASPECT_RATIOS['16:9'];
  return coverCrop.orientation === 'portrait' ? tall / wide : wide / tall;
}

function fitCropBoxToRatio(scale = coverCrop.box.width) {
  const ratio = getCoverRatio();
  const width = clamp(scale, 10, 100);
  let nextWidth = width;
  let nextHeight = coverCrop.aspectRatio === 'free'
    ? clamp(coverCrop.box.height || width, 10, 100)
    : width / ratio;

  if (nextHeight > 100) {
    nextHeight = 100;
    nextWidth = coverCrop.aspectRatio === 'free' ? nextWidth : nextHeight * ratio;
  }

  coverCrop.box.width = clamp(nextWidth, 10, 100);
  coverCrop.box.height = clamp(nextHeight, 10, 100);
  coverCrop.box.x = clamp(coverCrop.box.x, 0, 100 - coverCrop.box.width);
  coverCrop.box.y = clamp(coverCrop.box.y, 0, 100 - coverCrop.box.height);
}

function updateCoverOutputDimensions(anchor = 'width') {
  if (coverCrop.aspectRatio === 'free') return;
  const [wide, tall] = ASPECT_RATIOS[coverCrop.aspectRatio] || ASPECT_RATIOS['16:9'];
  const ratio = coverCrop.orientation === 'portrait' ? tall / wide : wide / tall;
  if (anchor === 'height') {
    coverCrop.width = Math.max(1, Math.round(coverCrop.height * ratio));
  } else {
    coverCrop.height = Math.max(1, Math.round(coverCrop.width / ratio));
  }
}

function updateCoverCropUI() {
  const editor = $('#coverEditor');
  const controls = $('#coverControls');
  const img = $('#coverCropImage');
  const file = $('#coverEditorFile');
  const box = $('#coverCropBox');
  const aspect = $('#coverAspect');
  const scale = $('#coverCropScale');
  const scaleValue = $('#coverCropScaleValue');
  const width = $('#coverWidth');
  const height = $('#coverHeight');

  if (!editor || !controls || !img || !box) return;

  if (!coverImagePath) {
    editor.classList.add('hidden');
    controls.classList.add('hidden');
    img.removeAttribute('src');
    return;
  }

  editor.classList.remove('hidden');
  controls.classList.remove('hidden');
  const imageSrc = `file://${coverImagePath}`;
  if (img.src !== imageSrc) {
    img.src = imageSrc;
  }
  if (file) file.textContent = coverImagePath.split('/').pop();
  if (aspect) aspect.value = coverCrop.aspectRatio;
  if (scale) scale.value = String(Math.round(coverCrop.box.width));
  if (scaleValue) scaleValue.textContent = String(Math.round(coverCrop.box.width));
  if (width) width.value = String(coverCrop.width);
  if (height) height.value = String(coverCrop.height);

  box.style.left = `${coverCrop.box.x}%`;
  box.style.top = `${coverCrop.box.y}%`;
  box.style.width = `${coverCrop.box.width}%`;
  box.style.height = `${coverCrop.box.height}%`;
}

function getPointerPercent(event, element) {
  const rect = element.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * 100,
    y: ((event.clientY - rect.top) / rect.height) * 100
  };
}

function initCoverCropControls() {
  const stage = $('#coverCropStage');
  const box = $('#coverCropBox');
  const handle = $('#coverCropHandle');
  const aspect = $('#coverAspect');
  const orientation = $('#coverOrientation');
  const scale = $('#coverCropScale');
  const width = $('#coverWidth');
  const height = $('#coverHeight');

  if (!stage || !box || !handle) return;

  let dragState = null;

  box.addEventListener('pointerdown', (event) => {
    if (event.target === handle) return;
    event.preventDefault();
    box.setPointerCapture(event.pointerId);
    const point = getPointerPercent(event, stage);
    dragState = {
      mode: 'move',
      offsetX: point.x - coverCrop.box.x,
      offsetY: point.y - coverCrop.box.y
    };
  });

  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    handle.setPointerCapture(event.pointerId);
    dragState = {
      mode: 'resize',
      startX: event.clientX,
      startY: event.clientY,
      box: { ...coverCrop.box }
    };
  });

  const onPointerMove = (event) => {
    if (!dragState || !coverImagePath) return;
    if (dragState.mode === 'move') {
      const point = getPointerPercent(event, stage);
      coverCrop.box.x = clamp(point.x - dragState.offsetX, 0, 100 - coverCrop.box.width);
      coverCrop.box.y = clamp(point.y - dragState.offsetY, 0, 100 - coverCrop.box.height);
    } else {
      const rect = stage.getBoundingClientRect();
      const deltaX = ((event.clientX - dragState.startX) / rect.width) * 100;
      const deltaY = ((event.clientY - dragState.startY) / rect.height) * 100;
      coverCrop.box.width = clamp(dragState.box.width + deltaX, 10, 100 - dragState.box.x);
      if (coverCrop.aspectRatio === 'free') {
        coverCrop.box.height = clamp(dragState.box.height + deltaY, 10, 100 - dragState.box.y);
      } else {
        const ratio = getCoverRatio();
        coverCrop.box.height = clamp(coverCrop.box.width / ratio, 10, 100 - dragState.box.y);
      }
    }
    updateCoverCropUI();
  };

  const onPointerUp = () => {
    dragState = null;
  };

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  if (aspect) {
    aspect.addEventListener('change', () => {
      coverCrop.aspectRatio = aspect.value;
      updateCoverOutputDimensions(coverCrop.orientation === 'portrait' ? 'height' : 'width');
      fitCropBoxToRatio(Math.max(coverCrop.box.width, 70));
      updateCoverCropUI();
    });
  }

  if (orientation) {
    orientation.addEventListener('click', () => {
      coverCrop.orientation = coverCrop.orientation === 'landscape' ? 'portrait' : 'landscape';
      const oldWidth = coverCrop.width;
      coverCrop.width = coverCrop.height;
      coverCrop.height = oldWidth;
      fitCropBoxToRatio(Math.max(coverCrop.box.width, 45));
      updateCoverCropUI();
    });
  }

  if (scale) {
    scale.addEventListener('input', () => {
      fitCropBoxToRatio(parseFloat(scale.value) || 90);
      updateCoverCropUI();
    });
  }

  if (width) {
    width.addEventListener('input', () => {
      coverCrop.width = parseInt(width.value, 10) || 1920;
      updateCoverOutputDimensions();
      updateCoverCropUI();
    });
  }

  if (height) {
    height.addEventListener('input', () => {
      coverCrop.height = parseInt(height.value, 10) || 1080;
      updateCoverOutputDimensions('height');
      updateCoverCropUI();
    });
  }
}

function renderThumbs(imagePaths) {
  const thumbs = $('#thumbs');
  const dropzone = $('#dropzone');
  if (!thumbs) return;
  thumbs.innerHTML = '';
  if (imagePaths.length === 0) {
    thumbs.classList.add('hidden');
    dropzone.classList.remove('hidden');
    return;
  }
  const frag = document.createDocumentFragment();
  const visiblePaths = imagePaths.slice(0, MAX_VISIBLE_THUMBNAILS);
  visiblePaths.forEach(p => {
    const isSelected = selectedImagePath === p;
    const isCover = coverImagePath === p;
    const div = document.createElement('div');
    div.className = [
      'thumb',
      isSelected ? 'thumb-selected' : '',
      isCover ? 'thumb-cover' : ''
    ].filter(Boolean).join(' ');
    div.dataset.path = p;
    div.tabIndex = 0;
    div.setAttribute('role', 'button');
    div.setAttribute('aria-label', getThumbnailLabel(p, isSelected, isCover));
    div.setAttribute('aria-pressed', String(isSelected));
    div.addEventListener('click', () => selectImage(p));
    div.addEventListener('keydown', (e) => {
      if (e.target === div && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        selectImage(p);
      }
    });
    const img = document.createElement('img');
    const thumbnailUrl = thumbnailUrls.get(p);
    if (thumbnailUrl) {
      img.src = thumbnailUrl;
    } else {
      img.className = 'thumb-loading';
      img.removeAttribute('src');
    }
    img.alt = p.split('/').pop();
    div.appendChild(img);
    const badge = document.createElement('div');
    badge.className = 'thumb-badge hidden';
    badge.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path fill="white" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>';
    div.appendChild(badge);
    const coverBadge = document.createElement('div');
    coverBadge.className = isCover ? 'thumb-cover-badge' : 'thumb-cover-badge hidden';
    coverBadge.textContent = 'Cover';
    div.appendChild(coverBadge);
    const removeBtn = document.createElement('button');
    removeBtn.className = 'thumb-remove';
    removeBtn.type = 'button';
    removeBtn.setAttribute('aria-label', `Remove ${getFileName(p)}`);
    removeBtn.setAttribute('title', `Remove ${getFileName(p)}`);
    removeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removePhoto(p);
    });
    div.appendChild(removeBtn);
    const coverBtn = document.createElement('button');
    coverBtn.className = 'thumb-cover-action';
    coverBtn.setAttribute('aria-label', isCover ? `${getFileName(p)} is the cover image` : `Promote ${getFileName(p)} to cover`);
    coverBtn.setAttribute('title', isCover ? 'Current cover image' : 'Promote to cover');
    coverBtn.type = 'button';
    coverBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m12 3 2.7 5.47 6.03.88-4.36 4.25 1.03 6-5.4-2.84-5.4 2.84 1.03-6-4.36-4.25 6.03-.88L12 3z"></path></svg>';
    coverBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      promoteToCover(p);
    });
    div.appendChild(coverBtn);
    frag.appendChild(div);
  });
  if (imagePaths.length > MAX_VISIBLE_THUMBNAILS) {
    const more = document.createElement('div');
    more.className = 'thumb-overflow';
    more.textContent = `Showing first ${MAX_VISIBLE_THUMBNAILS} of ${imagePaths.length}`;
    frag.appendChild(more);
  }
  thumbs.appendChild(frag);
  thumbs.classList.remove('hidden');
  dropzone.classList.add('hidden');
  loadVisibleThumbnails(visiblePaths);
}

async function loadVisibleThumbnails(paths) {
  if (!window.photopti?.getThumbnails) return;

  const missing = paths.filter(p => !thumbnailUrls.has(p));
  if (missing.length === 0) return;

  const requestId = ++thumbnailRequestId;
  for (let i = 0; i < missing.length; i += THUMBNAIL_BATCH_SIZE) {
    const batch = missing.slice(i, i + THUMBNAIL_BATCH_SIZE);
    const results = await window.photopti.getThumbnails(batch, { size: 220 });
    if (requestId !== thumbnailRequestId) return;

    Object.entries(results || {}).forEach(([filePath, dataUrl]) => {
      if (dataUrl) {
        thumbnailUrls.set(filePath, dataUrl);
        const img = document.querySelector(`.thumb[data-path="${cssEscape(filePath)}"] img`);
        if (img) {
          img.src = dataUrl;
          img.classList.remove('thumb-loading');
        }
      }
    });
  }
}

function initControls() {
  const quality = $('#quality');
  const qualityValue = $('#qualityValue');
  quality.addEventListener('input', () => qualityValue.textContent = quality.value);

  const widthRadio = document.querySelector('input[name="resizeMode"][value="width"]');
  const percentRadio = document.querySelector('input[name="resizeMode"][value="percentage"]');
  const widthInput = $('#width');
  const percentInput = $('#percentage');

  const updateMode = () => {
    const byWidth = widthRadio.checked;
    widthInput.disabled = !byWidth;
    percentInput.disabled = byWidth;
  };
  widthRadio.addEventListener('change', updateMode);
  percentRadio.addEventListener('change', updateMode);
}

function initProcess() {
  const btn = $('#process');
  const cancelBtn = $('#cancel');
  const resetBtn = $('#reset');
  const status = $('#status');
  const progressWrap = $('#progressWrap');
  const progressBar = $('#progressBar');

  window.photopti.onProgress((data) => {
    const { current, total, processed, errors, file, ok, kind } = data || {};
    progressWrap.classList.remove('hidden');
    const pct = Math.round(((current || 0) / (total || 1)) * 100);
    progressBar.style.width = pct + '%';
    status.textContent = kind === 'cover'
      ? `Creating cover image… ✓ ${processed}${errors ? `, errors: ${errors}` : ''}`
      : `Processing ${current}/${total}… ✓ ${processed}${errors ? `, errors: ${errors}` : ''}`;
    if (file && ok) {
      const el = document.querySelector(`.thumb[data-path="${cssEscape(file)}"] .thumb-badge`);
      if (el) el.classList.remove('hidden');
    }
  });

  window.photopti.onComplete((res) => {
    btn.disabled = false;
    if (cancelBtn) cancelBtn.classList.add('hidden');
    btn.classList.add('hidden');
    resetBtn.classList.remove('hidden');
    if (res.ok) {
      const { summary } = res;
      const coverText = summary.cover?.processed
        ? ` Cover: ${summary.cover.dest}`
        : '';
      const coverErrors = summary.cover?.errors ? `, Cover errors: ${summary.cover.errors}` : '';
      const failureText = formatFailureSummary(summary.failures);
      if (summary.canceled) {
        status.textContent = `Canceled. Processed: ${summary.processed}, Skipped: ${summary.skipped}, Errors: ${summary.errors}. Output: ${summary.outputDir}.${failureText}`;
      } else {
        status.textContent = `Done. Processed: ${summary.processed}, Errors: ${summary.errors}${coverErrors}. Output: ${summary.outputDir}.${coverText}${failureText}`;
      }
    } else {
      status.textContent = `Error: ${res.error}`;
    }
  });

  btn.addEventListener('click', async () => {
    if (!imagePaths.length) {
      status.textContent = 'Drop a folder or images first.';
      return;
    }
    
    // Check if files are from multiple folders
    if (hasMultipleFolders(droppedPaths) && !selectedOutputFolder) {
      status.textContent = 'Please select an output folder first.';
      return;
    }
    
    btn.disabled = true;
    if (cancelBtn) cancelBtn.classList.remove('hidden');
    resetBtn.classList.add('hidden');
    progressBar.style.width = '0%';
    $('#status').textContent = 'Starting…';
    // Reset badges
    document.querySelectorAll('.thumb .thumb-badge').forEach(el => el.classList.add('hidden'));

    const mode = document.querySelector('input[name="resizeMode"]:checked').value;
    const options = {
      width: mode === 'width' ? parseInt($('#width').value, 10) || 800 : undefined,
      percentage: mode === 'percentage' ? parseFloat($('#percentage').value) || undefined : undefined,
      quality: parseInt($('#quality').value, 10) || 80,
      output: ($('#output').value || 'Opti').trim(),
      rename: ($('#rename').value || '').trim() || undefined,
      outputBaseDir: selectedOutputFolder || undefined,
      coverImagePath: coverImagePath || undefined,
      cover: coverImagePath ? {
        width: coverCrop.width,
        height: coverCrop.height,
        aspectRatio: coverCrop.aspectRatio,
        orientation: coverCrop.orientation,
        crop: { ...coverCrop.box },
        suffix: 'cover'
      } : undefined
    };

    window.photopti.processImages(imagePaths, options);
  });

  if (cancelBtn) {
    cancelBtn.addEventListener('click', async () => {
      cancelBtn.disabled = true;
      const requested = await window.photopti.cancelProcessing();
      status.textContent = requested ? 'Canceling after the current image…' : 'Nothing is processing.';
    });
  }

  resetBtn.addEventListener('click', () => {
    droppedPaths = [];
    imagePaths = [];
    selectedOutputFolder = null;
    selectedImagePath = null;
    coverImagePath = null;
    thumbnailUrls = new Map();
    thumbnailRequestId++;
    resetCoverCrop();
    $('#dropzone').classList.remove('hidden');
    $('#thumbs').classList.add('hidden');
    $('#thumbs').innerHTML = '';
    $('#folderSelection').classList.add('hidden');
    progressBar.style.width = '0%';
    progressWrap.classList.add('hidden');
    status.textContent = '';
    if (cancelBtn) {
      cancelBtn.disabled = false;
      cancelBtn.classList.add('hidden');
    }
    resetBtn.classList.add('hidden');
    btn.classList.remove('hidden');
    updateCoverCropUI();
    updateFooterStats();
  });

  // Folder selection button handler
  const folderSelectBtn = $('#folderSelectBtn');
  if (folderSelectBtn) {
    folderSelectBtn.addEventListener('click', async () => {
      const folder = await window.photopti.showFolderDialog();
      if (folder) {
        selectedOutputFolder = folder;
        updateFolderSelectionUI();
        status.textContent = '';
      }
    });
  }
}

function formatFailureSummary(failures = []) {
  if (!failures.length) return '';
  const first = failures[0];
  const name = first.source ? first.source.split('/').pop() : first.kind;
  const more = failures.length > 1 ? ` and ${failures.length - 1} more` : '';
  return ` Failed: ${name}${more} (${first.message}).`;
}

window.addEventListener('DOMContentLoaded', () => {
  setLogo();
  initDnD();
  initControls();
  initCoverCropControls();
  initProcess();
  updateFooterStats();
});

// Escape for use in CSS attribute selectors
function cssEscape(str) {
  return str.replace(/"/g, '\\"').replace(/\\/g, '\\\\');
}
