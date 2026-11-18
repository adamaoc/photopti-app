const $ = (s) => document.querySelector(s);
const CropGeometryApi = globalThis.CropGeometry;
const Utils = globalThis.RendererUtils;
const { getFileName, toFileUrl, cssEscape, formatFileSize } = Utils;

// Folders the current images came from (a dropped folder, or a file's parent).
let sourceRoots = [];
let imagePaths = [];
let selectedOutputFolder = null;
let selectedImagePath = null;
let coverImagePath = null;
let workspaceMode = 'gallery';
let thumbnailUrls = new Map();
// Images whose preview could not be generated (corrupt or unreadable files).
let failedThumbnails = new Set();
let thumbnailRequestId = 0;
let imageInfoCache = new Map();
let selectedImageInfoRequestId = 0;
let inputDialogOpen = false;
let isProcessing = false;
let lastOutputDir = null;
let renderedThumbnailLimit = 0;
let thumbnailPageObserver = null;
let coverImageAspectRatio = null;
let coverDimensionAnchor = 'width';
let coverCrop = createDefaultCoverCrop();

const THUMBNAIL_PAGE_SIZE = 200;
const THUMBNAIL_BATCH_SIZE = 40;
const CROP_KEY_STEP = 1;
const CROP_KEY_LARGE_STEP = 5;
const CROP_KEY_RESIZE_STEP = 2;

function createDefaultCoverCrop() {
  return {
    aspectRatio: '16:9',
    orientation: 'landscape',
    width: 1920,
    height: 1080,
    box: { x: 5, y: 24.6875, width: 90, height: 50.625 }
  };
}

function setStatus(text) {
  const status = $('#status');
  if (status) status.textContent = text;
}

function getStorage() {
  try {
    return window.localStorage || null;
  } catch (error) {
    return null;
  }
}

function setLogo() {
  if (!window.photopti?.getLogoUrl) return;
  window.photopti.getLogoUrl().then((url) => {
    const el = $('#logo');
    if (el && url) el.src = url;
  }).catch(() => {});
}

function getOutputFolderName() {
  return ($('#output')?.value || '').trim() || 'Opti';
}

function getDroppedFilePath(file) {
  if (window.photopti?.getPathForFile) {
    try {
      return window.photopti.getPathForFile(file);
    } catch (error) {
      return '';
    }
  }
  return file.path || '';
}

async function addInputPaths(newPaths) {
  const candidates = Array.from(new Set((newPaths || []).filter(Boolean)));
  if (candidates.length === 0) return;
  if (isProcessing) {
    setStatus('Wait for the current batch to finish before adding images.');
    return;
  }

  try {
    const result = await window.photopti.listImages(candidates, {
      outputFolderName: getOutputFolderName()
    });
    const existing = new Set(imagePaths);
    const added = (result.files || []).filter((p) => !existing.has(p));
    imagePaths = [...imagePaths, ...added];
    sourceRoots = Array.from(new Set([...sourceRoots, ...(result.roots || [])]));

    // A different set of sources may need a different output location.
    selectedOutputFolder = null;

    updateDiscoveryNotice(result, added.length);
    renderThumbs(imagePaths);
    updateFolderSelectionUI();
    updateFooterStats();
    setChoicesOpen(false);
    if (added.length === 0 && !result.truncated) {
      setStatus('No new supported images were found.');
    } else {
      setStatus('');
    }
  } catch (error) {
    setStatus(`Could not add images: ${error.message || error}`);
  }
}

function updateDiscoveryNotice(result, addedCount) {
  const notice = $('#discoveryNotice');
  if (!notice) return;
  if (result && result.truncated) {
    notice.textContent = `Stopped after ${imagePaths.length.toLocaleString()} images. Add smaller folders to include the rest.`;
    notice.classList.remove('hidden');
  } else if (addedCount > 0) {
    notice.textContent = '';
    notice.classList.add('hidden');
  }
}

function setChoicesOpen(open) {
  const inputChoices = $('#inputChoices');
  const dropzoneTrigger = $('#dropzoneTrigger');
  if (!inputChoices || !dropzoneTrigger) return;
  inputChoices.classList.toggle('hidden', !open);
  dropzoneTrigger.setAttribute('aria-expanded', String(open));
}

async function selectFromDialog(kind) {
  if (inputDialogOpen || !window.photopti?.showInputDialog) return;
  const buttons = ['#selectImages', '#selectFolder', '#addImages', '#addFolder'].map($).filter(Boolean);
  inputDialogOpen = true;
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const paths = await window.photopti.showInputDialog(kind);
    if (paths) await addInputPaths(paths);
  } catch (error) {
    setStatus(`Could not open selection dialog: ${error.message || error}`);
  } finally {
    inputDialogOpen = false;
    buttons.forEach((button) => { button.disabled = false; });
    setChoicesOpen(false);
  }
}

function initDnD() {
  const dropzone = $('#dropzone');
  const dropzoneTrigger = $('#dropzoneTrigger');
  const inputChoices = $('#inputChoices');
  const selectImages = $('#selectImages');
  const selectFolder = $('#selectFolder');
  let dragDepth = 0;

  const isFileDrag = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');

  // Handle drops anywhere in the window. Without this, Chromium's default is
  // to open a file dropped outside the drop zone in place of the app.
  document.addEventListener('dragenter', (event) => {
    event.preventDefault();
    if (!isFileDrag(event)) return;
    dragDepth++;
    document.body.classList.add('drag-active');
    if (!dropzone.classList.contains('hidden')) dropzone.classList.add('hover');
  });
  document.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = isFileDrag(event) ? 'copy' : 'none';
  });
  document.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      document.body.classList.remove('drag-active');
      dropzone.classList.remove('hover');
    }
  });
  document.addEventListener('drop', (event) => {
    event.preventDefault();
    dragDepth = 0;
    document.body.classList.remove('drag-active');
    dropzone.classList.remove('hover');
    const files = Array.from(event.dataTransfer?.files || []);
    addInputPaths(files.map(getDroppedFilePath));
  });

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

  selectImages.addEventListener('click', () => selectFromDialog('images'));
  selectFolder.addEventListener('click', () => selectFromDialog('folder'));
  $('#addImages')?.addEventListener('click', () => selectFromDialog('images'));
  $('#addFolder')?.addEventListener('click', () => selectFromDialog('folder'));
}

function getEffectiveRoots() {
  return Utils.collapseRoots(sourceRoots);
}

function hasMultipleFolders() {
  return getEffectiveRoots().length > 1;
}

function setSelectedImageDetail(id, text, { title } = {}) {
  const element = $(id);
  if (!element) return;
  element.textContent = text;
  if (title) {
    element.title = title;
    element.setAttribute('aria-label', title);
  } else {
    element.removeAttribute('title');
    element.removeAttribute('aria-label');
  }
}

async function updateSelectedImageInfo() {
  const panel = $('#selectedImageInfo');
  const role = $('#selectedImageRole');
  if (!panel) return;

  if (!selectedImagePath || workspaceMode === 'crop') {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  const requestId = ++selectedImageInfoRequestId;
  const path = selectedImagePath;

  setSelectedImageDetail('#selectedImageName', getFileName(path), { title: getFileName(path) });
  setSelectedImageDetail('#selectedImageDimensions', 'Loading…');
  setSelectedImageDetail('#selectedImageSize', 'Loading…');
  setSelectedImageDetail('#selectedImageFormat', 'Loading…');
  setSelectedImageDetail('#selectedImageLocation', path, { title: path });
  if (role) role.classList.toggle('hidden', path !== coverImagePath);

  try {
    let info = imageInfoCache.get(path);
    if (!info) {
      if (!window.photopti?.getImageInfo) throw new Error('Image info is unavailable');
      info = await window.photopti.getImageInfo(path);
      imageInfoCache.set(path, info);
    }
    if (requestId !== selectedImageInfoRequestId || selectedImagePath !== path) return;

    setSelectedImageDetail('#selectedImageName', info.name || getFileName(path), {
      title: info.name || getFileName(path)
    });
    setSelectedImageDetail(
      '#selectedImageDimensions',
      info.width > 0 && info.height > 0 ? `${info.width} × ${info.height}` : 'Unknown'
    );
    setSelectedImageDetail('#selectedImageSize', formatFileSize(info.size));
    setSelectedImageDetail('#selectedImageFormat', info.format || 'Unknown');
    setSelectedImageDetail('#selectedImageLocation', info.folder || path, {
      title: info.path || path
    });
    if (role) role.classList.toggle('hidden', path !== coverImagePath);
  } catch (error) {
    if (requestId !== selectedImageInfoRequestId || selectedImagePath !== path) return;
    setSelectedImageDetail('#selectedImageDimensions', 'Unavailable');
    setSelectedImageDetail('#selectedImageSize', 'Unavailable');
    setSelectedImageDetail('#selectedImageFormat', 'Unavailable');
  }
}

function getSourceSummary(roots) {
  return Utils.getSourceSummary(roots);
}

function updateFooterStats() {
  const source = $('#footerSource');
  const count = $('#footerImageCount');
  const coverStat = $('#footerCoverStat');
  const cover = $('#footerCover');
  const galleryCount = $('#galleryCount');
  if (galleryCount) {
    galleryCount.textContent = `${imagePaths.length.toLocaleString()} image${imagePaths.length === 1 ? '' : 's'}`;
  }
  if (!source || !count || !coverStat || !cover) return;

  const sourceText = getSourceSummary(sourceRoots);
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

  if (hasMultipleFolders()) {
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

function showEmptyState() {
  $('#thumbs')?.classList.add('hidden');
  $('#dropzone')?.classList.remove('hidden');
  $('#galleryToolbar')?.classList.add('hidden');
  $('#discoveryNotice')?.classList.add('hidden');
  $('#folderSelection')?.classList.add('hidden');
}

function removePhoto(path) {
  if (isProcessing) {
    setStatus('Wait for the current batch to finish before removing images.');
    return;
  }
  imagePaths = imagePaths.filter(p => p !== path);
  sourceRoots = Utils.pruneRoots(sourceRoots, imagePaths);
  thumbnailUrls.delete(path);
  failedThumbnails.delete(path);
  imageInfoCache.delete(path);
  if (selectedImagePath === path) {
    selectedImagePath = null;
  }
  if (coverImagePath === path) {
    coverImagePath = null;
    workspaceMode = 'gallery';
    resetCoverCrop();
  }

  if (imagePaths.length === 0) {
    sourceRoots = [];
    selectedOutputFolder = null;
    selectedImagePath = null;
    coverImagePath = null;
    resetCoverCrop();
    showEmptyState();
  } else {
    renderThumbs(imagePaths);
    updateFolderSelectionUI();
    updateCoverCropUI();
  }
  updateWorkspaceUI();
  updateFooterStats();
  updateSelectedImageInfo();
}

function selectImage(path) {
  selectedImagePath = path;
  updateThumbnailSelectionUI();
  updateSelectedImageInfo();
}

function promoteToCover(path) {
  const isExistingCover = coverImagePath === path;
  coverImagePath = path;
  if (!isExistingCover) resetCoverCrop();
  renderThumbs(imagePaths);
  enterCoverCrop();
  updateFooterStats();
  updateSelectedImageInfo();
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
  updateSelectedImageInfo();
}

function updateWorkspaceUI() {
  const cropMode = workspaceMode === 'crop' && Boolean(coverImagePath);
  const body = document.body;
  const thumbs = $('#thumbs');
  const batchSettings = $('#batchSettings');
  const process = $('#process');
  const toolbar = $('#galleryToolbar');

  if (body) body.classList.toggle('crop-mode', cropMode);
  if (thumbs) thumbs.classList.toggle('hidden', cropMode || imagePaths.length === 0);
  if (toolbar) toolbar.classList.toggle('hidden', cropMode || imagePaths.length === 0);
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
  coverCrop = createDefaultCoverCrop();
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
    delete img.dataset.coverPath;
    return;
  }

  editor.classList.remove('hidden');
  controls.classList.remove('hidden');
  if (img.dataset.coverPath !== coverImagePath) {
    img.dataset.coverPath = coverImagePath;
    img.src = toFileUrl(coverImagePath);
  }
  if (file) file.textContent = getFileName(coverImagePath);
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
  box.setAttribute?.(
    'aria-valuetext',
    `Crop at ${Math.round(coverCrop.box.x)}% left, ${Math.round(coverCrop.box.y)}% top, ${Math.round(coverCrop.box.width)}% wide`
  );

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

function moveCropBy(deltaX, deltaY) {
  coverCrop.box.x = clamp(coverCrop.box.x + deltaX, 0, 100 - coverCrop.box.width);
  coverCrop.box.y = clamp(coverCrop.box.y + deltaY, 0, 100 - coverCrop.box.height);
}

function resizeCropBy(deltaWidth) {
  if (coverCrop.aspectRatio === 'free') {
    const scale = (coverCrop.box.width + deltaWidth) / coverCrop.box.width;
    const width = clamp(coverCrop.box.width * scale, CropGeometryApi.MIN_CROP_PERCENT, 100 - coverCrop.box.x);
    const height = clamp(coverCrop.box.height * scale, CropGeometryApi.MIN_CROP_PERCENT, 100 - coverCrop.box.y);
    coverCrop.box.width = width;
    coverCrop.box.height = height;
    updateCoverOutputDimensions(coverDimensionAnchor);
    return;
  }
  fitCropBoxToRatio(coverCrop.box.width + deltaWidth);
}

/** Keyboard control for the crop box. Returns true when the key was handled. */
function handleCropKey(event) {
  if (!coverImagePath || workspaceMode !== 'crop') return false;
  const step = event.shiftKey ? CROP_KEY_LARGE_STEP : CROP_KEY_STEP;
  switch (event.key) {
    case 'ArrowLeft': moveCropBy(-step, 0); break;
    case 'ArrowRight': moveCropBy(step, 0); break;
    case 'ArrowUp': moveCropBy(0, -step); break;
    case 'ArrowDown': moveCropBy(0, step); break;
    case '+':
    case '=': resizeCropBy(CROP_KEY_RESIZE_STEP); break;
    case '-':
    case '_': resizeCropBy(-CROP_KEY_RESIZE_STEP); break;
    default: return false;
  }
  updateCoverCropUI();
  return true;
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
    box.focus({ preventScroll: true });
    box.setPointerCapture(event.pointerId);
    const point = getPointerPercent(event, cropImage || stage);
    dragState = {
      mode: 'move',
      offsetX: point.x - coverCrop.box.x,
      offsetY: point.y - coverCrop.box.y
    };
  });

  box.addEventListener('keydown', (event) => {
    if (handleCropKey(event)) event.preventDefault();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && workspaceMode === 'crop') {
      returnToGallery();
    }
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

const COVER_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m12 3 2.7 5.47 6.03.88-4.36 4.25 1.03 6-5.4-2.84-5.4 2.84 1.03-6-4.36-4.25 6.03-.88L12 3z"></path></svg>';
const REMOVE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
const DONE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path fill="white" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>';

function createThumbElement(p) {
  const isSelected = selectedImagePath === p;
  const isCover = coverImagePath === p;
  const div = document.createElement('div');
  div.className = [
    'thumb',
    isSelected ? 'thumb-selected' : '',
    isCover ? 'thumb-cover' : '',
    failedThumbnails.has(p) ? 'thumb-unavailable' : ''
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
  } else if (!failedThumbnails.has(p)) {
    img.className = 'thumb-loading';
    img.removeAttribute('src');
  }
  // The tile itself carries the accessible name; the image is decorative.
  img.alt = '';
  div.appendChild(img);
  const badge = document.createElement('div');
  badge.className = 'thumb-badge hidden';
  badge.innerHTML = DONE_ICON;
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
  removeBtn.innerHTML = REMOVE_ICON;
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
  coverBtn.innerHTML = COVER_ICON;
  coverBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    promoteToCover(p);
  });
  div.appendChild(coverBtn);
  return div;
}

function createShowMoreElement(remaining) {
  const more = document.createElement('div');
  more.className = 'thumb-overflow';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button-outline button-small thumb-show-more';
  const nextCount = Math.min(THUMBNAIL_PAGE_SIZE, remaining);
  button.textContent = `Show ${nextCount.toLocaleString()} more`;
  button.setAttribute('aria-label', `Show ${nextCount} more images (${remaining} not shown)`);
  button.addEventListener('click', showMoreThumbnails);
  more.appendChild(button);
  return more;
}

function showMoreThumbnails() {
  renderedThumbnailLimit += THUMBNAIL_PAGE_SIZE;
  renderThumbs(imagePaths);
}

function observeShowMore(element) {
  if (thumbnailPageObserver) thumbnailPageObserver.disconnect();
  thumbnailPageObserver = null;
  if (!element || typeof IntersectionObserver !== 'function') return;
  thumbnailPageObserver = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) showMoreThumbnails();
  }, { root: $('#drop-section'), rootMargin: '400px' });
  thumbnailPageObserver.observe(element);
}

function renderThumbs(imagePaths) {
  const thumbs = $('#thumbs');
  const dropzone = $('#dropzone');
  if (!thumbs) return;
  thumbs.innerHTML = '';
  if (imagePaths.length === 0) {
    renderedThumbnailLimit = 0;
    observeShowMore(null);
    showEmptyState();
    if (dropzone) dropzone.classList.remove('hidden');
    return;
  }
  renderedThumbnailLimit = Math.min(
    imagePaths.length,
    Math.max(renderedThumbnailLimit, THUMBNAIL_PAGE_SIZE)
  );
  const frag = document.createDocumentFragment();
  const visiblePaths = imagePaths.slice(0, renderedThumbnailLimit);
  visiblePaths.forEach((p) => frag.appendChild(createThumbElement(p)));
  let showMore = null;
  if (imagePaths.length > visiblePaths.length) {
    showMore = createShowMoreElement(imagePaths.length - visiblePaths.length);
    frag.appendChild(showMore);
  }
  thumbs.appendChild(frag);
  const cropMode = workspaceMode === 'crop';
  thumbs.classList.toggle('hidden', cropMode);
  $('#galleryToolbar')?.classList.toggle('hidden', cropMode);
  if (dropzone) dropzone.classList.add('hidden');
  observeShowMore(showMore);
  loadVisibleThumbnails(visiblePaths);
}

async function loadVisibleThumbnails(paths) {
  if (!window.photopti?.getThumbnails) return;

  const missing = paths.filter(p => !thumbnailUrls.has(p) && !failedThumbnails.has(p));
  if (missing.length === 0) return;

  const requestId = ++thumbnailRequestId;
  for (let i = 0; i < missing.length; i += THUMBNAIL_BATCH_SIZE) {
    const batch = missing.slice(i, i + THUMBNAIL_BATCH_SIZE);
    let results;
    try {
      results = await window.photopti.getThumbnails(batch, { size: 220 });
    } catch (error) {
      return;
    }
    if (requestId !== thumbnailRequestId) return;

    Object.entries(results || {}).forEach(([filePath, dataUrl]) => {
      const thumb = document.querySelector(`.thumb[data-path="${cssEscape(filePath)}"]`);
      const img = thumb?.querySelector('img');
      if (dataUrl) {
        thumbnailUrls.set(filePath, dataUrl);
        if (img) {
          img.src = dataUrl;
          img.classList.remove('thumb-loading');
        }
      } else {
        failedThumbnails.add(filePath);
        if (thumb) thumb.classList.add('thumb-unavailable');
        if (img) img.classList.remove('thumb-loading');
      }
    });
  }
}

function readSettingsFromForm() {
  return {
    resizeMode: document.querySelector('input[name="resizeMode"]:checked')?.value || 'width',
    width: $('#width')?.value,
    percentage: $('#percentage')?.value ?? '',
    quality: $('#quality')?.value,
    output: $('#output')?.value,
    format: $('#format')?.value,
    background: $('#background')?.value,
    enlarge: Boolean($('#enlarge')?.checked),
    keepMetadata: Boolean($('#keepMetadata')?.checked)
  };
}

function applySettingsToForm(settings) {
  const radio = document.querySelector(`input[name="resizeMode"][value="${settings.resizeMode}"]`);
  if (radio) radio.checked = true;
  $('#width').value = String(settings.width);
  $('#percentage').value = settings.percentage === '' ? '' : String(settings.percentage);
  $('#quality').value = String(settings.quality);
  $('#qualityValue').textContent = String(settings.quality);
  $('#output').value = settings.output;
  $('#format').value = settings.format;
  $('#background').value = settings.background;
  $('#enlarge').checked = settings.enlarge;
  $('#keepMetadata').checked = settings.keepMetadata;
}

function initControls() {
  const quality = $('#quality');
  const qualityValue = $('#qualityValue');
  const widthRadio = document.querySelector('input[name="resizeMode"][value="width"]');
  const percentRadio = document.querySelector('input[name="resizeMode"][value="percentage"]');
  const widthInput = $('#width');
  const percentInput = $('#percentage');
  const format = $('#format');
  const backgroundRow = $('#backgroundRow');
  const enlarge = $('#enlarge');
  const output = $('#output');
  const outputNameHint = $('#outputNameHint');

  applySettingsToForm(Utils.loadSettings(getStorage()));

  const updateMode = () => {
    const byWidth = widthRadio.checked;
    widthInput.disabled = !byWidth;
    percentInput.disabled = byWidth;
    // Percentages above 100% already mean "enlarge".
    enlarge.disabled = !byWidth;
  };
  const updateFormatControls = () => {
    backgroundRow.classList.toggle('hidden', format.value !== 'jpeg');
  };
  const updateOutputHint = () => {
    outputNameHint.textContent = getOutputFolderName();
  };
  const persist = () => Utils.saveSettings(getStorage(), readSettingsFromForm());

  quality.addEventListener('input', () => { qualityValue.textContent = quality.value; });
  widthRadio.addEventListener('change', updateMode);
  percentRadio.addEventListener('change', updateMode);
  format.addEventListener('change', updateFormatControls);
  output.addEventListener('input', updateOutputHint);
  $('#batchSettings').addEventListener('change', persist);

  updateMode();
  updateFormatControls();
  updateOutputHint();
}

function setProcessingState(processing) {
  isProcessing = processing;
  document.body.classList.toggle('processing', processing);
  ['#addImages', '#addFolder'].forEach((selector) => {
    const button = $(selector);
    if (button) button.disabled = processing;
  });
}

function renderResults(summary) {
  const results = $('#results');
  const savings = $('#resultsSavings');
  const outputLine = $('#resultsOutput');
  const failureDetails = $('#failureDetails');
  const failureSummary = $('#failureSummary');
  const failureList = $('#failureList');
  if (!results) return;

  if (!summary) {
    results.classList.add('hidden');
    lastOutputDir = null;
    return;
  }

  lastOutputDir = summary.outputDir;
  results.classList.remove('hidden');
  savings.textContent = Utils.formatSavings(summary.inputBytes, summary.outputBytes);
  savings.classList.toggle('hidden', !savings.textContent);
  outputLine.textContent = summary.outputDir;
  outputLine.title = summary.outputDir;

  failureList.innerHTML = '';
  const failures = summary.failures || [];
  failureDetails.classList.toggle('hidden', failures.length === 0);
  failureDetails.open = failures.length > 0 && failures.length <= 3;
  failureSummary.textContent = `${failures.length} file${failures.length === 1 ? '' : 's'} could not be processed`;
  failures.forEach((failure) => {
    const item = document.createElement('li');
    const name = document.createElement('strong');
    name.textContent = failure.source ? getFileName(failure.source) : failure.kind;
    name.title = failure.source || '';
    item.appendChild(name);
    item.appendChild(document.createTextNode(`${failure.kind === 'cover' ? ' (cover)' : ''}: ${failure.message}`));
    failureList.appendChild(item);
  });
}

function formatCompletionStatus(summary) {
  const coverText = summary.cover?.processed ? ' Cover created.' : '';
  const coverErrors = summary.cover?.errors ? ' The cover could not be created.' : '';
  const errors = summary.errors ? `, ${summary.errors} failed` : '';
  if (summary.canceled) {
    return `Canceled. ${summary.processed} processed, ${summary.skipped} skipped${errors}.`;
  }
  return `Done. ${summary.processed} processed${errors}.${coverText}${coverErrors}`;
}

function collectProcessOptions() {
  const settings = readSettingsFromForm();
  return {
    width: settings.resizeMode === 'width' ? parseInt(settings.width, 10) : undefined,
    percentage: settings.resizeMode === 'percentage' ? parseFloat(settings.percentage) : undefined,
    quality: parseInt(settings.quality, 10) || 80,
    output: getOutputFolderName(),
    rename: ($('#rename').value || '').trim() || undefined,
    format: settings.format,
    background: settings.background,
    enlarge: settings.enlarge,
    keepMetadata: settings.keepMetadata,
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
}

function initProcess() {
  const btn = $('#process');
  const cancelBtn = $('#cancel');
  const resetBtn = $('#reset');
  const progressWrap = $('#progressWrap');
  const progressBar = $('#progressBar');
  const openOutput = $('#openOutput');

  window.photopti.onProgress((data) => {
    const { current, total, processed, errors, file, ok, kind } = data || {};
    progressWrap.classList.remove('hidden');
    const pct = Math.round(((current || 0) / (total || 1)) * 100);
    progressBar.style.width = pct + '%';
    const errorText = errors ? `, ${errors} failed` : '';
    setStatus(kind === 'cover'
      ? `Creating cover image… ${processed} done${errorText}`
      : `Processing ${current}/${total}… ${processed} done${errorText}`);
    if (file && ok && kind !== 'cover') {
      const el = document.querySelector(`.thumb[data-path="${cssEscape(file)}"] .thumb-badge`);
      if (el) el.classList.remove('hidden');
    }
  });

  window.photopti.onComplete((res) => {
    setProcessingState(false);
    btn.disabled = false;
    btn.textContent = 'Process again';
    cancelBtn.classList.add('hidden');
    cancelBtn.disabled = false;
    resetBtn.classList.remove('hidden');
    if (res.ok) {
      setStatus(formatCompletionStatus(res.summary));
      renderResults(res.summary);
    } else {
      progressWrap.classList.add('hidden');
      setStatus(`Error: ${res.error}`);
      renderResults(null);
    }
  });

  btn.addEventListener('click', () => {
    if (!imagePaths.length) {
      setStatus('Add images or a folder first.');
      return;
    }
    const settingsError = Utils.validateBatchSettings(readSettingsFromForm());
    if (settingsError) {
      setStatus(settingsError);
      const field = readSettingsFromForm().resizeMode === 'percentage' ? $('#percentage') : $('#width');
      field?.focus();
      return;
    }
    if (coverImagePath) {
      const dimensionInputs = [$('#coverWidth'), $('#coverHeight')];
      const invalidInput = dimensionInputs.find((input) => input && !input.checkValidity());
      if (invalidInput) {
        invalidInput.reportValidity();
        setStatus('Enter valid cover output dimensions before processing.');
        return;
      }
    }

    if (hasMultipleFolders() && !selectedOutputFolder) {
      setStatus('Images come from multiple folders. Select an output folder first.');
      $('#folderSelectBtn')?.focus();
      return;
    }

    setProcessingState(true);
    btn.disabled = true;
    cancelBtn.classList.remove('hidden');
    resetBtn.classList.add('hidden');
    renderResults(null);
    progressBar.style.width = '0%';
    progressWrap.classList.remove('hidden');
    setStatus('Starting…');
    document.querySelectorAll('.thumb .thumb-badge').forEach(el => el.classList.add('hidden'));

    window.photopti.processImages(imagePaths, sourceRoots, collectProcessOptions());
  });

  cancelBtn.addEventListener('click', async () => {
    cancelBtn.disabled = true;
    const requested = await window.photopti.cancelProcessing();
    setStatus(requested ? 'Canceling after the images in progress…' : 'Nothing is processing.');
  });

  openOutput?.addEventListener('click', async () => {
    if (!lastOutputDir) return;
    try {
      await window.photopti.openOutputFolder(lastOutputDir);
    } catch (error) {
      setStatus(`Could not open the output folder: ${error.message || error}`);
    }
  });

  resetBtn.addEventListener('click', () => {
    sourceRoots = [];
    imagePaths = [];
    selectedOutputFolder = null;
    selectedImagePath = null;
    coverImagePath = null;
    workspaceMode = 'gallery';
    thumbnailUrls = new Map();
    failedThumbnails = new Set();
    imageInfoCache = new Map();
    renderedThumbnailLimit = 0;
    thumbnailRequestId++;
    resetCoverCrop();
    observeShowMore(null);
    $('#thumbs').innerHTML = '';
    showEmptyState();
    progressBar.style.width = '0%';
    progressWrap.classList.add('hidden');
    setStatus('');
    renderResults(null);
    cancelBtn.disabled = false;
    cancelBtn.classList.add('hidden');
    resetBtn.classList.add('hidden');
    btn.textContent = 'Process images';
    btn.classList.remove('hidden');
    updateCoverCropUI();
    updateWorkspaceUI();
    updateFooterStats();
    updateSelectedImageInfo();
  });

  const folderSelectBtn = $('#folderSelectBtn');
  if (folderSelectBtn) {
    folderSelectBtn.addEventListener('click', async () => {
      const folder = await window.photopti.showFolderDialog();
      if (folder) {
        selectedOutputFolder = folder;
        updateFolderSelectionUI();
        setStatus('');
      }
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  if (window.photopti?.platform) {
    document.body.classList.add(`platform-${window.photopti.platform}`);
  }
  setLogo();
  initDnD();
  initControls();
  initCoverCropControls();
  initProcess();
  updateWorkspaceUI();
  updateFooterStats();
  updateSelectedImageInfo();
});
