import type { CheckpointInfo, TimelineTreeNode, ConnectionLine } from '@/types/checkpoint';

// Constants for simple linear timeline visualization (exported for external use)
export const NODE_HEIGHT = 48;
export const COLUMN_WIDTH = 32;

/**
 * Calculates a simple linear layout for checkpoint timeline visualization.
 * All checkpoints are displayed in a single vertical column with simple connections.
 *
 * @param checkpoints A list of checkpoints, sorted by date descending (newest first).
 * @param _branches Unused parameter kept for compatibility
 * @param currentHeadRef The hash of the current checkpoint
 * @returns An object containing nodes and connections with their positions
 */
export function calculateGitGraphLayout(
  checkpoints: CheckpointInfo[],
  _branches: never[], // Unused but kept for compatibility
  currentHeadRef: string | null
): { nodes: TimelineTreeNode[]; connections: ConnectionLine[]; maxColumns: number } {
  if (checkpoints.length === 0) {
    return { nodes: [], connections: [], maxColumns: 0 };
  }

  // Create timeline nodes - all in column 0 for linear history
  const nodes: TimelineTreeNode[] = checkpoints.map((checkpoint, index) => ({
    checkpoint,
    columnIndex: 0, // All nodes in single column for linear timeline
    rowIndex: index, // Position in chronological order
    timelineColor: '#3b82f6', // Consistent blue color for all checkpoints
    isCurrent: checkpoint.hash === currentHeadRef,
  }));

  // Create simple vertical connections between adjacent checkpoints
  const connections: ConnectionLine[] = [];
  
  for (let i = 0; i < checkpoints.length - 1; i++) {
    const fromNode = nodes[i];
    const toNode = nodes[i + 1];
    
    // Only create connection if the child actually connects to this parent
    if (checkpoints[i].parent === checkpoints[i + 1].hash) {
      connections.push({
        from: { rowIndex: fromNode.rowIndex, columnIndex: 0 },
        to: { rowIndex: toNode.rowIndex, columnIndex: 0 },
        color: '#3b82f6', // Same blue color for consistency
        strokeWidth: 2,
      });
    }
  }

  return {
    nodes,
    connections,
    maxColumns: 1, // Always 1 column for linear timeline
  };
}