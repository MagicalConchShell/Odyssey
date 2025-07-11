import type { GitCheckpointInfo, BranchInfo, TimelineTreeNode, ConnectionLine } from '../types/checkpoint';
import { getBranchColor } from './branch-colors';

// Constants for layout
const NODE_HEIGHT = 48; // Height of each commit node in pixels
const COLUMN_WIDTH = 30; // Width of each branch column in pixels
const NODE_RADIUS = 4; // Radius of the commit circle

interface InternalGraphNode {
  checkpoint: GitCheckpointInfo;
  parents: InternalGraphNode[];
  children: InternalGraphNode[];
  rowIndex: number;
  columnIndex: number;
  branchName: string | null;
  color: string;
  isMergeCommit: boolean;
  isBranchPoint: boolean;
  isHead: boolean; // Is this the head of a branch?
  isCurrent: boolean; // Is this the current HEAD?
  primaryBranchName: string | null; // Primary branch this commit belongs to
  secondaryBranchNames: string[]; // Secondary branches (for merge commits)
  laneActive: boolean; // Whether this lane should remain active
  mergeParentLanes: number[]; // Lanes of merge parents
}



/**
 * Calculates the layout for a Git-like graph visualization.
 * This function implements a column-based layout similar to git log --graph.
 *
 * @param checkpoints A list of checkpoints, assumed to be sorted by date descending (newest first).
 * @param branches A list of branch information.
 * @param currentHeadRef The hash or branch name of the current HEAD.
 * @returns An object containing nodes and connections with their positions and path data.
 */
export function calculateGitGraphLayout(
  checkpoints: GitCheckpointInfo[],
  branches: BranchInfo[],
  currentHeadRef: string | null
): { nodes: TimelineTreeNode[]; connections: ConnectionLine[]; maxColumns: number } {
  const connections: ConnectionLine[] = [];
  const internalNodeMap = new Map<string, InternalGraphNode>(); // hash -> InternalGraphNode

  // Map branch head commit hashes to branch names
  const branchHeadToNameMap = new Map<string, string>();
  branches.forEach((b) => branchHeadToNameMap.set(b.commitHash, b.name));

  // Initialize internal graph nodes and build parent/child relationships
  checkpoints.forEach((chkpt) => {
    const node: InternalGraphNode = {
      checkpoint: chkpt,
      parents: [],
      children: [],
      rowIndex: -1, // Will be set later
      columnIndex: -1, // Will be set later
      branchName: null, // Will be set later
      color: '', // Will be set later
      isMergeCommit: chkpt.parents.length > 1,
      isBranchPoint: false, // Will be set later
      isHead: branchHeadToNameMap.has(chkpt.hash),
      isCurrent: chkpt.hash === currentHeadRef || branches.some(b => b.name === currentHeadRef && b.commitHash === chkpt.hash),
      primaryBranchName: null,
      secondaryBranchNames: [],
      laneActive: false,
      mergeParentLanes: [],
    };
    internalNodeMap.set(chkpt.hash, node);
  });

  // Establish parent-child links and identify branch points
  internalNodeMap.forEach((node) => {
    node.checkpoint.parents.forEach((parentId) => {
      const parentNode = internalNodeMap.get(parentId);
      if (parentNode) {
        node.parents.push(parentNode);
        parentNode.children.push(node);
        if (parentNode.children.length > 1) {
          parentNode.isBranchPoint = true;
        }
      }
    });
  });

  // Enhanced lane management
  const activeLanes: (InternalGraphNode | null)[] = []; // Stores the node currently occupying a lane
  const branchLaneMap = new Map<string, number>(); // branchName -> columnIndex
  const laneReservation = new Map<number, string>(); // columnIndex -> branchName (for reserved lanes)
  const commitLaneMap = new Map<string, number>(); // commit hash -> lane index
  let maxColumns = 0;

  // Assign branch colors consistently
  const branchColorCache = new Map<string, string>();
  const getConsistentBranchColor = (branchName: string): string => {
    if (!branchColorCache.has(branchName)) {
      branchColorCache.set(branchName, getBranchColor(branchName));
    }
    return branchColorCache.get(branchName)!;
  };

  // Process commits in reverse chronological order (already sorted)
  checkpoints.forEach((chkpt, index) => {
    const node = internalNodeMap.get(chkpt.hash)!;
    node.rowIndex = index; // Row index is simply its position in the sorted list

    let assignedColumn = -1;

    // Enhanced lane assignment logic
    // 1. For branch heads, try to get a consistent lane
    if (node.isHead) {
      const branchName = branchHeadToNameMap.get(node.checkpoint.hash)!;
      node.primaryBranchName = branchName;
      
      // Check if this branch already has a reserved lane
      if (branchLaneMap.has(branchName)) {
        const reservedLane = branchLaneMap.get(branchName)!;
        if (activeLanes[reservedLane] === null) {
          assignedColumn = reservedLane;
        }
      }
    }

    // 2. For non-head commits, try to inherit from primary parent
    if (assignedColumn === -1 && node.parents.length > 0) {
      const primaryParent = node.parents[0];
      if (primaryParent.columnIndex !== -1) {
        // Check if we can continue in the same lane
        if (activeLanes[primaryParent.columnIndex] === null || 
            activeLanes[primaryParent.columnIndex] === primaryParent) {
          assignedColumn = primaryParent.columnIndex;
          node.primaryBranchName = primaryParent.primaryBranchName;
        }
      }
    }

    // 3. Find the first available lane
    if (assignedColumn === -1) {
      const freeLaneIndex = activeLanes.findIndex(lane => lane === null);
      if (freeLaneIndex !== -1) {
        assignedColumn = freeLaneIndex;
      } else {
        // Create a new lane
        assignedColumn = activeLanes.length;
        activeLanes.push(null);
      }
    }

    // Assign column and update lane tracking
    node.columnIndex = assignedColumn;
    activeLanes[assignedColumn] = node;
    commitLaneMap.set(chkpt.hash, assignedColumn);

    // Set branch name and color
    if (!node.primaryBranchName) {
      if (node.isHead) {
        node.primaryBranchName = branchHeadToNameMap.get(node.checkpoint.hash)!;
      } else if (node.parents.length > 0 && node.parents[0].primaryBranchName) {
        node.primaryBranchName = node.parents[0].primaryBranchName;
      } else {
        node.primaryBranchName = `commit-${node.checkpoint.hash.substring(0, 7)}`;
      }
    }
    
    node.branchName = node.primaryBranchName;
    node.color = getConsistentBranchColor(node.primaryBranchName);

    // Handle merge commits - track parent lanes
    if (node.isMergeCommit) {
      node.mergeParentLanes = node.parents.map(parent => parent.columnIndex);
      node.secondaryBranchNames = node.parents.slice(1)
        .map(parent => parent.primaryBranchName)
        .filter(name => name !== null) as string[];
    }

    // Update branch-to-lane mapping
    if (node.isHead && node.primaryBranchName) {
      branchLaneMap.set(node.primaryBranchName, node.columnIndex);
      laneReservation.set(node.columnIndex, node.primaryBranchName);
    }

    maxColumns = Math.max(maxColumns, node.columnIndex + 1);

    // --- Generate Enhanced Connections ---
    node.parents.forEach((parentNode, parentIndex) => {
      const fromNode = node; // Current commit
      const toNode = parentNode; // Parent commit

      const connectionType = getConnectionType(fromNode, toNode);
      const pathData = generateConnectionPath(fromNode, toNode);
      const strokeWidth = getConnectionStrokeWidth(connectionType);
      
      // Use appropriate color based on connection type
      let connectionColor = fromNode.color;
      if (connectionType === 'merge' && parentIndex > 0) {
        // For merge commits, use parent's color for secondary connections
        connectionColor = toNode.color;
      }

      connections.push({
        from: { rowIndex: fromNode.rowIndex, columnIndex: fromNode.columnIndex },
        to: { rowIndex: toNode.rowIndex, columnIndex: toNode.columnIndex },
        type: connectionType,
        color: connectionColor,
        strokeWidth: strokeWidth,
        pathData: pathData,
      });
    });

    // --- Enhanced lane management ---
    // Free current lane if this is not a continuing commit
    const shouldFreeLane = !node.children.some(child => 
      child.columnIndex === node.columnIndex && 
      child.primaryBranchName === node.primaryBranchName
    );
    
    if (shouldFreeLane) {
      activeLanes[node.columnIndex] = null;
    }

    // Keep parent lanes active if they have more children
    node.parents.forEach(parent => {
      if (parent.children.length > 1) {
        // Parent has multiple children, keep its lane active
        parent.laneActive = true;
      }
    });
  });

  // Convert internal nodes to public TimelineTreeNode format
  const finalNodes: TimelineTreeNode[] = checkpoints.map((chkpt) => {
    const internalNode = internalNodeMap.get(chkpt.hash)!;
    return {
      checkpoint: internalNode.checkpoint,
      columnIndex: internalNode.columnIndex,
      rowIndex: internalNode.rowIndex,
      branchColor: internalNode.color,
      isCurrent: internalNode.isCurrent,
      isMergeCommit: internalNode.isMergeCommit,
      isBranchPoint: internalNode.isBranchPoint,
      branchName: internalNode.primaryBranchName || internalNode.branchName!,
    };
  });

  return { nodes: finalNodes, connections, maxColumns };
}

/**
 * Generates SVG path data for a connection line with improved curves.
 * @param fromNode The source node.
 * @param toNode The target node (parent).
 * @returns SVG path data string.
 */
function generateConnectionPath(fromNode: InternalGraphNode, toNode: InternalGraphNode): string {
  const fromX = fromNode.columnIndex * COLUMN_WIDTH + NODE_RADIUS;
  const fromY = fromNode.rowIndex * NODE_HEIGHT + NODE_HEIGHT / 2;

  const toX = toNode.columnIndex * COLUMN_WIDTH + NODE_RADIUS;
  const toY = toNode.rowIndex * NODE_HEIGHT + NODE_HEIGHT / 2;

  if (fromNode.columnIndex === toNode.columnIndex) {
    // Straight vertical line for same column
    return `M ${fromX} ${fromY} L ${toX} ${toY}`;
  } else {
    // Enhanced curved line for branching/merging
    const deltaX = Math.abs(fromX - toX);
    
    // Adaptive curve control points for better visual flow
    const curveStrength = Math.min(deltaX * 0.5, NODE_HEIGHT * 0.7);
    
    const controlPointX1 = fromX;
    const controlPointY1 = fromY + curveStrength;

    const controlPointX2 = toX;
    const controlPointY2 = toY - curveStrength;

    return `M ${fromX} ${fromY} C ${controlPointX1} ${controlPointY1}, ${controlPointX2} ${controlPointY2}, ${toX} ${toY}`;
  }
}

/**
 * Generates connection type based on commit relationship
 */
function getConnectionType(fromNode: InternalGraphNode, toNode: InternalGraphNode): 'direct' | 'branch' | 'merge' {
  if (fromNode.isMergeCommit && toNode !== fromNode.parents[0]) {
    return 'merge';
  }
  if (fromNode.columnIndex !== toNode.columnIndex) {
    return 'branch';
  }
  return 'direct';
}

/**
 * Determines optimal stroke width for connection
 */
function getConnectionStrokeWidth(connectionType: 'direct' | 'branch' | 'merge'): number {
  switch (connectionType) {
    case 'direct': return 2;
    case 'branch': return 1.5;
    case 'merge': return 1.5;
    default: return 1.5;
  }
}