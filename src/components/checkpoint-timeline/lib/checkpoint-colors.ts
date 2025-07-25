// src/lib/checkpoint-colors.ts
// Simplified color system for linear checkpoint timeline

// Primary checkpoint color (consistent blue for all checkpoints)
const CHECKPOINT_COLOR = '#3b82f6'; // Blue - consistent with the simplified timeline

/**
 * Gets the color for checkpoint nodes (always returns the same color for consistency)
 * This function is kept for compatibility with existing code that expects getBranchColor
 * @param _checkpointName Unused parameter, kept for compatibility
 * @returns A consistent blue color hex string
 */
export function getBranchColor(_checkpointName?: string): string {
  return CHECKPOINT_COLOR;
}

/**
 * Gets the checkpoint color (simplified version)
 * @returns The consistent checkpoint color
 */
export function getCheckpointColor(): string {
  return CHECKPOINT_COLOR;
}

/**
 * Sets the color theme (no-op for compatibility)
 * @param _theme Unused parameter, kept for compatibility
 */
export function setColorTheme(_theme: 'light' | 'dark'): void {
  // No-op: we use a consistent color regardless of theme
}

/**
 * Resets colors (no-op for compatibility)
 */
export function resetBranchColors(): void {
  // No-op: we use a consistent color
}

/**
 * Gets color palette (simplified)
 */
export function getColorPalette(): string[] {
  return [CHECKPOINT_COLOR];
}