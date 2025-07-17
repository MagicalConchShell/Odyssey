// src/lib/branch-colors.ts
// Professional color palette inspired by GitFork, VSCode, and PyCharm

// Primary color palette for main branches
const PRIMARY_COLORS = [
  '#2563EB', // Blue (main/master)
  '#059669', // Emerald (develop)
  '#DC2626', // Red (hotfix)
  '#7C3AED', // Violet (feature)
  '#EA580C', // Orange (release)
];

// Extended color palette for additional branches
const EXTENDED_COLORS = [
  '#0891B2', // Cyan
  '#BE185D', // Pink
  '#65A30D', // Lime
  '#C2410C', // Orange Red
  '#7E22CE', // Purple
  '#0D9488', // Teal
  '#B91C1C', // Red
  '#1D4ED8', // Blue
  '#16A34A', // Green
  '#CA8A04', // Yellow
  '#9333EA', // Violet
  '#0284C7', // Sky
  '#DB2777', // Pink
  '#84CC16', // Lime
  '#F59E0B', // Amber
  '#EF4444', // Red
];

// Complete color palette
const COLORS = [...PRIMARY_COLORS, ...EXTENDED_COLORS];

// Semantic color mappings for specific branch types
const SEMANTIC_COLORS = {
  // Main branches
  'main': '#2563EB',
  'master': '#2563EB',
  'develop': '#059669',
  'development': '#059669',
  'dev': '#059669',
  
  // Feature branches
  'feature': '#7C3AED',
  'feat': '#7C3AED',
  
  // Release branches
  'release': '#EA580C',
  'rel': '#EA580C',
  
  // Hotfix branches
  'hotfix': '#DC2626',
  'fix': '#DC2626',
  'bugfix': '#DC2626',
  
  // Experimental branches
  'experimental': '#BE185D',
  'exp': '#BE185D',
  'test': '#65A30D',
  'testing': '#65A30D',
};

// Color variations for different themes
const COLOR_VARIANTS = {
  light: {
    opacity: 1.0,
    saturation: 1.0,
    brightness: 1.0,
  },
  dark: {
    opacity: 0.9,
    saturation: 0.8,
    brightness: 1.1,
  },
};

const branchColorMap = new Map<string, string>();
let colorIndex = 0;
let currentTheme: 'light' | 'dark' = 'light';

// Pre-populate semantic color mappings
Object.entries(SEMANTIC_COLORS).forEach(([branchName, color]) => {
  branchColorMap.set(branchName, color);
});

/**
 * Sets the current theme for color adjustments
 */
export function setColorTheme(theme: 'light' | 'dark'): void {
  currentTheme = theme;
  // Re-process existing colors with new theme
  const entries = Array.from(branchColorMap.entries());
  branchColorMap.clear();
  Object.entries(SEMANTIC_COLORS).forEach(([branchName, color]) => {
    branchColorMap.set(branchName, adjustColorForTheme(color, theme));
  });
  entries.forEach(([branchName, color]) => {
    if (!SEMANTIC_COLORS[branchName as keyof typeof SEMANTIC_COLORS]) {
      branchColorMap.set(branchName, adjustColorForTheme(color, theme));
    }
  });
}

/**
 * Adjusts color based on current theme
 */
function adjustColorForTheme(color: string, theme: 'light' | 'dark'): string {
  if (theme === 'light') {
    return color;
  }
  
  // For dark theme, make colors slightly brighter and less saturated
  const variants = COLOR_VARIANTS[theme];
  
  // Convert hex to RGB, apply adjustments, convert back
  const hex = color.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // Apply brightness adjustment
  const adjustedR = Math.min(255, Math.round(r * variants.brightness));
  const adjustedG = Math.min(255, Math.round(g * variants.brightness));
  const adjustedB = Math.min(255, Math.round(b * variants.brightness));
  
  return `#${adjustedR.toString(16).padStart(2, '0')}${adjustedG.toString(16).padStart(2, '0')}${adjustedB.toString(16).padStart(2, '0')}`;
}

/**
 * Gets a consistent color for a given branch name with intelligent branch type detection.
 * @param branchName The name of the branch.
 * @returns A hex color string optimized for the current theme.
 */
export function getBranchColor(branchName: string): string {
  if (branchColorMap.has(branchName)) {
    return branchColorMap.get(branchName)!;
  }

  // Intelligent branch type detection
  const detectedType = detectBranchType(branchName);
  if (detectedType && SEMANTIC_COLORS[detectedType as keyof typeof SEMANTIC_COLORS]) {
    const semanticColor = SEMANTIC_COLORS[detectedType as keyof typeof SEMANTIC_COLORS];
    const adjustedColor = adjustColorForTheme(semanticColor, currentTheme);
    branchColorMap.set(branchName, adjustedColor);
    return adjustedColor;
  }

  // Find the next available color to assign
  let assignedColor: string;
  const usedColors = new Set(branchColorMap.values());

  // Find the first unused color from the main palette
  const unusedColor = COLORS.find(c => !usedColors.has(adjustColorForTheme(c, currentTheme)));

  if (unusedColor) {
    assignedColor = adjustColorForTheme(unusedColor, currentTheme);
  } else {
    // If all standard colors are used, cycle through them with slight variations
    const baseColor = COLORS[colorIndex % COLORS.length];
    assignedColor = generateColorVariation(baseColor, colorIndex);
    colorIndex++;
  }
  
  branchColorMap.set(branchName, assignedColor);
  return assignedColor;
}

/**
 * Detects branch type from branch name patterns
 */
function detectBranchType(branchName: string): string | null {
  const lowerName = branchName.toLowerCase();
  
  // Check for semantic patterns
  if (lowerName.includes('feature/') || lowerName.includes('feat/')) return 'feature';
  if (lowerName.includes('hotfix/') || lowerName.includes('fix/')) return 'hotfix';
  if (lowerName.includes('release/') || lowerName.includes('rel/')) return 'release';
  if (lowerName.includes('bugfix/') || lowerName.includes('bug/')) return 'fix';
  if (lowerName.includes('experimental/') || lowerName.includes('exp/')) return 'experimental';
  if (lowerName.includes('test/') || lowerName.includes('testing/')) return 'test';
  
  // Check exact matches
  if (Object.keys(SEMANTIC_COLORS).includes(lowerName)) {
    return lowerName;
  }
  
  return null;
}

/**
 * Generates a color variation for when all base colors are used
 */
function generateColorVariation(baseColor: string, variation: number): string {
  const hex = baseColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // Apply variation by shifting hue
  const shift = (variation * 30) % 360;
  const [h, s, l] = rgbToHsl(r, g, b);
  const newH = (h + shift) % 360;
  const [newR, newG, newB] = hslToRgb(newH, s, l);
  
  return `#${Math.round(newR).toString(16).padStart(2, '0')}${Math.round(newG).toString(16).padStart(2, '0')}${Math.round(newB).toString(16).padStart(2, '0')}`;
}

/**
 * Convert RGB to HSL
 */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  
  return [h * 360, s, l];
}

/**
 * Convert HSL to RGB
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360;
  
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  
  if (s === 0) {
    return [l * 255, l * 255, l * 255];
  }
  
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  
  const r = hue2rgb(p, q, h + 1/3);
  const g = hue2rgb(p, q, h);
  const b = hue2rgb(p, q, h - 1/3);
  
  return [r * 255, g * 255, b * 255];
}

/**
 * Resets the color assignments, preserving semantic color mappings.
 */
export function resetBranchColors(): void {
  colorIndex = 0;
  branchColorMap.clear();
  
  // Restore semantic color mappings with current theme
  Object.entries(SEMANTIC_COLORS).forEach(([branchName, color]) => {
    branchColorMap.set(branchName, adjustColorForTheme(color, currentTheme));
  });
}

/**
 * Gets the current color palette for display purposes
 */
export function getColorPalette(): string[] {
  return COLORS.map(color => adjustColorForTheme(color, currentTheme));
}

/**
 * Gets semantic color mappings for documentation
 */
export function getSemanticColors(): Record<string, string> {
  const result: Record<string, string> = {};
  Object.entries(SEMANTIC_COLORS).forEach(([key, color]) => {
    result[key] = adjustColorForTheme(color, currentTheme);
  });
  return result;
}

/**
 * Generates a preview of how colors will look for given branch names
 */
export function previewBranchColors(branchNames: string[]): Record<string, string> {
  const preview: Record<string, string> = {};
  branchNames.forEach(name => {
    preview[name] = getBranchColor(name);
  });
  return preview;
}

// Initialize with light theme by default
setColorTheme('light');