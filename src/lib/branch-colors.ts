// src/lib/branch-colors.ts

const COLORS = [
  '#4285F4', // Google Blue
  '#DB4437', // Google Red
  '#F4B400', // Google Yellow
  '#0F9D58', // Google Green
  '#AB47BC', // Purple
  '#00ACC1', // Cyan
  '#FF7043', // Orange
  '#78909C', // Blue Grey
  '#5C6BC0', // Indigo
  '#43A047', // Light Green
];

const branchColorMap = new Map<string, string>();
let colorIndex = 0;

// Assign fixed colors for common branches
branchColorMap.set('main', COLORS[0]);
branchColorMap.set('master', COLORS[0]);
branchColorMap.set('develop', COLORS[3]);

/**
 * Gets a consistent color for a given branch name.
 * @param branchName The name of the branch.
 * @returns A hex color string.
 */
export function getBranchColor(branchName: string): string {
  if (branchColorMap.has(branchName)) {
    return branchColorMap.get(branchName)!;
  }

  // Find the next available color to assign
  let assignedColor: string;
  const usedColors = new Set(branchColorMap.values());

  // Find the first unused color from the main palette
  const unusedColor = COLORS.find(c => !usedColors.has(c));

  if (unusedColor) {
    assignedColor = unusedColor;
  } else {
    // If all standard colors are used, cycle through them
    assignedColor = COLORS[colorIndex % COLORS.length];
    colorIndex++;
  }
  
  branchColorMap.set(branchName, assignedColor);
  return assignedColor;
}

/**
 * Resets the color assignments, except for default branches.
 */
export function resetBranchColors(): void {
    colorIndex = 0;
    const mainColor = branchColorMap.get('main');
    const masterColor = branchColorMap.get('master');
    const developColor = branchColorMap.get('develop');

    branchColorMap.clear();

    if (mainColor) branchColorMap.set('main', mainColor);
    if (masterColor) branchColorMap.set('master', masterColor);
    if (developColor) branchColorMap.set('develop', developColor);
}
