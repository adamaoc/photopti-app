(function exposeRendererUtils(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RendererUtils = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createRendererUtils() {
  const SETTINGS_KEY = 'photopti.batchSettings.v1';
  const DEFAULT_SETTINGS = Object.freeze({
    resizeMode: 'width',
    width: 800,
    percentage: '',
    quality: 80,
    output: 'Opti',
    format: 'jpeg',
    background: '#ffffff',
    enlarge: false,
    keepMetadata: false
  });
  const OUTPUT_FORMATS = ['jpeg', 'webp', 'avif'];

  function getFileName(filePath) {
    return String(filePath).split(/[\\/]/).pop();
  }

  function getParentDir(filePath) {
    const value = String(filePath);
    const separatorIndex = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
    if (separatorIndex < 0) return '';
    if (separatorIndex === 0) return value[0];
    return value.slice(0, separatorIndex);
  }

  function normalizeForCompare(filePath) {
    return String(filePath).replace(/\\/g, '/').replace(/\/+$/, '');
  }

  function isPathInside(parent, child) {
    const base = normalizeForCompare(parent);
    const target = normalizeForCompare(child);
    if (!base || base === target) return false;
    const prefix = base.endsWith('/') ? base : `${base}/`;
    return target.startsWith(prefix);
  }

  /** Same rule as the main process: duplicate and nested roots count once. */
  function collapseRoots(roots) {
    const unique = Array.from(new Set((roots || []).filter(Boolean)))
      .sort((a, b) => normalizeForCompare(a).length - normalizeForCompare(b).length);
    const kept = [];
    unique.forEach((candidate) => {
      const covered = kept.some((parent) =>
        normalizeForCompare(parent) === normalizeForCompare(candidate) || isPathInside(parent, candidate)
      );
      if (!covered) kept.push(candidate);
    });
    return kept;
  }

  /** Keeps only source roots that still contain at least one listed image. */
  function pruneRoots(roots, imagePaths) {
    return (roots || []).filter((root) => (imagePaths || []).some((imagePath) => isPathInside(root, imagePath)));
  }

  function getSourceSummary(roots) {
    const collapsed = collapseRoots(roots);
    if (collapsed.length === 0) return 'No source selected';
    if (collapsed.length === 1) return collapsed[0];
    return `Multiple folders (${collapsed.length})`;
  }

  /** Converts a local path to a file URL, encoding characters such as # and ?. */
  function toFileUrl(filePath) {
    let normalized = String(filePath).replace(/\\/g, '/');
    if (/^[A-Za-z]:/.test(normalized)) normalized = `/${normalized}`;
    if (normalized.startsWith('//')) {
      // UNC path: //server/share/... becomes file://server/share/...
      return `file:${normalized.split('/').map((segment, index) => (index < 3 ? segment : encodeURIComponent(segment))).join('/')}`;
    }
    const encoded = normalized
      .split('/')
      .map((segment, index) => (index === 1 && /^[A-Za-z]:$/.test(segment) ? segment : encodeURIComponent(segment)))
      .join('/');
    return `file://${encoded}`;
  }

  function cssEscape(value) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
    return String(value).replace(/["\\]/g, '\\$&');
  }

  function formatFileSize(bytes) {
    if (!(bytes >= 0)) return 'Unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  function formatSavings(inputBytes, outputBytes) {
    if (!(inputBytes > 0) || !(outputBytes >= 0)) return '';
    const sizes = `${formatFileSize(inputBytes)} → ${formatFileSize(outputBytes)}`;
    const change = Math.round((1 - outputBytes / inputBytes) * 100);
    if (change > 0) return `Saved ${change}% (${sizes})`;
    if (change < 0) return `Output is ${-change}% larger (${sizes})`;
    return `Same total size (${sizes})`;
  }

  /** Returns a user-facing message when batch settings cannot be processed. */
  function validateBatchSettings({ resizeMode, width, percentage }) {
    if (resizeMode === 'percentage') {
      const value = Number(percentage);
      if (percentage === '' || percentage === null || percentage === undefined || !Number.isFinite(value) || value < 1 || value > 1000) {
        return 'Enter a resize percentage from 1 to 1000.';
      }
      return null;
    }
    const value = Number(width);
    if (!Number.isInteger(value) || value < 1 || value > 20000) {
      return 'Enter a whole-number width from 1 to 20000 px.';
    }
    return null;
  }

  function sanitizeSettings(raw) {
    const settings = { ...DEFAULT_SETTINGS };
    if (!raw || typeof raw !== 'object') return settings;
    if (raw.resizeMode === 'width' || raw.resizeMode === 'percentage') settings.resizeMode = raw.resizeMode;
    if (Number.isInteger(Number(raw.width)) && Number(raw.width) >= 1 && Number(raw.width) <= 20000) settings.width = Number(raw.width);
    if (raw.percentage === '' || (Number(raw.percentage) >= 1 && Number(raw.percentage) <= 1000)) settings.percentage = raw.percentage === '' ? '' : Number(raw.percentage);
    if (Number.isInteger(Number(raw.quality)) && Number(raw.quality) >= 1 && Number(raw.quality) <= 100) settings.quality = Number(raw.quality);
    if (typeof raw.output === 'string' && raw.output.trim()) settings.output = raw.output.trim();
    if (OUTPUT_FORMATS.includes(raw.format)) settings.format = raw.format;
    if (typeof raw.background === 'string' && /^#[0-9a-f]{6}$/i.test(raw.background)) settings.background = raw.background;
    settings.enlarge = raw.enlarge === true;
    settings.keepMetadata = raw.keepMetadata === true;
    return settings;
  }

  function loadSettings(storage) {
    try {
      const value = storage && storage.getItem(SETTINGS_KEY);
      return sanitizeSettings(value ? JSON.parse(value) : null);
    } catch (error) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings(storage, settings) {
    try {
      if (storage) storage.setItem(SETTINGS_KEY, JSON.stringify(sanitizeSettings(settings)));
      return true;
    } catch (error) {
      return false;
    }
  }

  return {
    DEFAULT_SETTINGS,
    SETTINGS_KEY,
    collapseRoots,
    cssEscape,
    formatFileSize,
    formatSavings,
    getFileName,
    getParentDir,
    getSourceSummary,
    isPathInside,
    loadSettings,
    pruneRoots,
    sanitizeSettings,
    saveSettings,
    toFileUrl,
    validateBatchSettings
  };
}));
