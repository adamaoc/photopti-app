const $ = (s) => document.querySelector(s);
const CropGeometryApi = globalThis.CropGeometry;

let droppedPaths = [];
let imagePaths = [];
let selectedOutputFolder = null;
let selectedImagePath = null;
let coverImagePath = null;
let workspaceMode = 'gallery';
let thumbnailUrls = new Map();
let thumbnailRequestId = 0;
let inputDialogOpen = false;
let coverImageAspectRatio = null;
let coverDimensionAnchor = 'width';
let coverCrop = {
  aspectRatio: '16:9',
  orientation: 'landscape',
  width: 1920,
  height: 1080,
  box: { x: 5, y: 24.6875, width: 90, height: 50.625 }
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
    workspaceMode = 'gallery';
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
  updateWorkspaceUI();
  updateFooterStats();
}

function selectImage(path) {
  selectedImagePath = path;
  updateThumbnailSelectionUI();
}

function promoteToCover(path) {
  const isExistingCover = coverImagePath === path;
  coverImagePath = path;
  if (!isExistingCover) resetCoverCrop();
  renderThumbs(imagePaths);
  enterCoverCrop();
  updateFooterStats();
}

function enterCoverCrop() {
  if (!coverImagePath) return;
  workspaceMode = 'crop';
  updateWorkspaceUI();
  updateCoverCropUI();
}

function returnToGallery() {
  workspaceMode = 'gallery';
  updateWorkspaceUI();
  updateCoverCropUI();
  updateThumbnailSelectionUI();
}

function updateWorkspaceUI() {
  const cropMode = workspaceMode === 'crop' && Boolean(coverImagePath);
  const body = document.body;
  const thumbs = $('#thumbs');
  const batchSettings = $('#batchSettings');
  const process = $('#process');

  if (body) body.classList.toggle('crop-mode', cropMode);
  if (thumbs) thumbs.classList.toggle('hidden', cropMode || imagePaths.length === 0);
  if (batchSettings) batchSettings.classList.toggle('hidden', cropMode);
  if (process) process.classList.toggle('hidden', cropMode);
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
  coverImageAspectRatio = null;
  coverDimensionAnchor = 'width';
  coverCrop = {
    aspectRatio: '16:9',
    orientation: 'landscape',
    width: 1920,
    height: 1080,
    box: { x: 5, y: 24.6875, width: 90, height: 50.625 }
  };
}

function clamp(value, min, max) {
  return CropGeometryApi.clamp(value, min, max);
}

function getCoverRatio() {
  return CropGeometryApi.getPresetRatio(coverCrop.aspectRatio, coverCrop.orientation)
    || CropGeometryApi.getCropRatio(coverCrop.box, coverImageAspectRatio)
    || (coverCrop.width / coverCrop.height);
}

function fitCropBoxToRatio(scale) {
  const ratio = getCoverRatio();
  if (!(coverImageAspectRatio > 0)) return;
  coverCrop.box = CropGeometryApi.fitBoxToRatio(
    coverCrop.box,
    ratio,
    coverImageAspectRatio,
    scale
  );
}

function updateCoverOutputDimensions(anchor = 'width') {
  coverDimensionAnchor = anchor;
  const ratio = getCoverRatio();
  if (!(ratio > 0)) return false;
  const dimensions = CropGeometryApi.dimensionsForRatio(coverCrop[anchor], anchor, ratio);
  coverCrop.width = dimensions.width;
  coverCrop.height = dimensions.height;
  return true;
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
  const orientation = $('#coverOrientation');

  if (!editor || !controls || !img || !box) return;

  if (!coverImagePath || workspaceMode !== 'crop') {
    editor.classList.add('hidden');
    controls.classList.add('hidden');
    img.removeAttribute('src');
    return;
  }

  editor.classList.remove('hidden');
  controls.classList.remove('hidden');
  const imageSrc = `file://${coverImagePath}`;
  if (img.dataset.coverPath !== coverImagePath) {
    img.dataset.coverPath = coverImagePath;
    img.src = imageSrc;
  }
  if (file) file.textContent = coverImagePath.split('/').pop();
  if (aspect) aspect.value = coverCrop.aspectRatio;
  if (scale) scale.value = String(Math.round(coverCrop.box.width));
  if (scaleValue) scaleValue.textContent = String(Math.round(coverCrop.box.width));
  if (width) width.value = String(coverCrop.width);
  if (height) height.value = String(coverCrop.height);
  if (orientation) {
    const label = coverCrop.orientation === 'portrait' ? 'Portrait' : 'Landscape';
    orientation.textContent = label;
    orientation.setAttribute('aria-label', `Orientation: ${label}. Activate to flip`);
  }

  const imageRect = img.getBoundingClientRect?.();
  const stageRect = $('#coverCropStage')?.getBoundingClientRect?.();
  if (imageRect?.width > 0 && imageRect?.height > 0 && stageRect) {
    box.style.left = `${imageRect.left - stageRect.left + (coverCrop.box.x / 100) * imageRect.width}px`;
    box.style.top = `${imageRect.top - stageRect.top + (coverCrop.box.y / 100) * imageRect.height}px`;
    box.style.width = `${(coverCrop.box.width / 100) * imageRect.width}px`;
    box.style.height = `${(coverCrop.box.height / 100) * imageRect.height}px`;
  }
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
  const backToGallery = $('#backToGallery');

  if (!stage || !box || !handle) return;

  if (backToGallery) backToGallery.addEventListener('click', returnToGallery);

  const cropImage = $('#coverCropImage');
  if (cropImage) {
    cropImage.addEventListener('load', () => {
      if (!(cropImage.naturalWidth > 0) || !(cropImage.naturalHeight > 0)) return;
      coverImageAspectRatio = cropImage.naturalWidth / cropImage.naturalHeight;
      fitCropBoxToRatio();
      if (coverCrop.aspectRatio === 'free') updateCoverOutputDimensions(coverDimensionAnchor);
      updateCoverCropUI();
    });
  }

  let dragState = null;

  box.addEventListener('pointerdown', (event) => {
    if (event.target === handle) return;
    event.preventDefault();
    box.setPointerCapture(event.pointerId);
    const point = getPointerPercent(event, cropImage || stage);
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
      const point = getPointerPercent(event, cropImage || stage);
      coverCrop.box.x = clamp(point.x - dragState.offsetX, 0, 100 - coverCrop.box.width);
      coverCrop.box.y = clamp(point.y - dragState.offsetY, 0, 100 - coverCrop.box.height);
    } else {
      const rect = (cropImage || stage).getBoundingClientRect();
      const deltaX = ((event.clientX - dragState.startX) / rect.width) * 100;
      const deltaY = ((event.clientY - dragState.startY) / rect.height) * 100;
      coverCrop.box.width = clamp(dragState.box.width + deltaX, CropGeometryApi.MIN_CROP_PERCENT, 100 - dragState.box.x);
      if (coverCrop.aspectRatio === 'free') {
        coverCrop.box.height = clamp(dragState.box.height + deltaY, CropGeometryApi.MIN_CROP_PERCENT, 100 - dragState.box.y);
        updateCoverOutputDimensions(coverDimensionAnchor);
      } else {
        const normalizedRatio = getCoverRatio() / coverImageAspectRatio;
        const maxWidth = Math.min(
          100 - dragState.box.x,
          (100 - dragState.box.y) * normalizedRatio
        );
        const fitted = CropGeometryApi.fitBoxToRatio(
          dragState.box,
          getCoverRatio(),
          coverImageAspectRatio,
          Math.min(coverCrop.box.width, maxWidth)
        );
        coverCrop.box = fitted;
      }
    }
    updateCoverCropUI();
  };

  const onPointerUp = () => {
    dragState = null;
  };

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('resize', updateCoverCropUI);
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(updateCoverCropUI).observe(stage);
  }

  if (aspect) {
    aspect.addEventListener('change', () => {
      coverCrop.aspectRatio = aspect.value;
      updateCoverOutputDimensions(coverCrop.orientation === 'portrait' ? 'height' : 'width');
      fitCropBoxToRatio();
      updateCoverCropUI();
    });
  }

  if (orientation) {
    orientation.addEventListener('click', () => {
      const oldRatio = getCoverRatio();
      coverCrop.orientation = coverCrop.orientation === 'landscape' ? 'portrait' : 'landscape';
      const oldWidth = coverCrop.width;
      coverCrop.width = coverCrop.height;
      coverCrop.height = oldWidth;
      coverDimensionAnchor = coverDimensionAnchor === 'width' ? 'height' : 'width';
      if (coverCrop.aspectRatio === 'free' && coverImageAspectRatio > 0) {
        coverCrop.box = CropGeometryApi.fitBoxToRatio(coverCrop.box, 1 / oldRatio, coverImageAspectRatio);
        updateCoverOutputDimensions(coverDimensionAnchor);
      } else {
        fitCropBoxToRatio();
      }
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
      try {
        coverCrop.width = CropGeometryApi.parseOutputDimension(width.value);
        width.setCustomValidity('');
        updateCoverOutputDimensions('width');
      } catch (error) {
        width.setCustomValidity(error.message);
        return;
      }
      updateCoverCropUI();
    });
  }

  if (height) {
    height.addEventListener('input', () => {
      try {
        coverCrop.height = CropGeometryApi.parseOutputDimension(height.value);
        height.setCustomValidity('');
        updateCoverOutputDimensions('height');
      } catch (error) {
        height.setCustomValidity(error.message);
        return;
      }
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
    coverBtn.setAttribute('aria-label', isCover ? `Edit cover crop for ${getFileName(p)}` : `Promote ${getFileName(p)} to cover and edit crop`);
    coverBtn.setAttribute('title', isCover ? 'Edit cover crop' : 'Promote to cover and edit crop');
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
  thumbs.classList.toggle('hidden', workspaceMode === 'crop');
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
    if (coverImagePath) {
      const dimensionInputs = [$('#coverWidth'), $('#coverHeight')];
      const invalidInput = dimensionInputs.find((input) => input && !input.checkValidity());
      if (invalidInput) {
        invalidInput.reportValidity();
        status.textContent = 'Enter valid cover output dimensions before processing.';
        return;
      }
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
        dimensionAnchor: coverDimensionAnchor,
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
    workspaceMode = 'gallery';
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
    updateWorkspaceUI();
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
  updateWorkspaceUI();
  updateFooterStats();
});

// Escape for use in CSS attribute selectors
function cssEscape(str) {
  return str.replace(/"/g, '\\"').replace(/\\/g, '\\\\');
}
