import type { GitCheckpointInfo, BranchInfo, TimelineTreeNode, ConnectionLine } from '../types/checkpoint';
import { getBranchColor } from './branch-colors';

// Enhanced layout constants for modern timeline visualization
// Note: Layout constants are now handled in the rendering layer for better flexibility

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
  priority: number; // Priority for lane assignment (higher = more important)
  commitDistance: number; // Distance from the tip of the branch
  laneReservation: string | null; // Reserved lane for this branch
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
      priority: 0, // Will be calculated
      commitDistance: 0, // Distance from tip
      laneReservation: null,
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

  // Enhanced lane management with priority system
  const activeLanes: (InternalGraphNode | null)[] = []; // Stores the node currently occupying a lane
  const branchLaneMap = new Map<string, number>(); // branchName -> columnIndex
  const laneReservation = new Map<number, string>(); // columnIndex -> branchName (for reserved lanes)
  const commitLaneMap = new Map<string, number>(); // commit hash -> lane index
  const lanePriority = new Map<number, number>(); // columnIndex -> priority score
  const branchCommitCount = new Map<string, number>(); // branchName -> commit count
  let maxColumns = 0;

  // Calculate branch priorities based on commit count and recency
  const calculateBranchPriorities = () => {
    // Count commits per branch
    checkpoints.forEach((checkpoint) => {
      const branchName = branchHeadToNameMap.get(checkpoint.hash) || 'main';
      branchCommitCount.set(branchName, (branchCommitCount.get(branchName) || 0) + 1);
    });

    // Assign priorities: main/master = highest, then by commit count
    const priorityMap = new Map<string, number>();
    priorityMap.set('main', 1000);
    priorityMap.set('master', 1000);
    
    Array.from(branchCommitCount.entries())
      .sort(([,a], [,b]) => b - a)
      .forEach(([branchName, _count], index) => {
        if (!priorityMap.has(branchName)) {
          priorityMap.set(branchName, 900 - index * 10);
        }
      });

    return priorityMap;
  };

  const branchPriorities = calculateBranchPriorities();

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

    // Enhanced lane assignment logic with priority system
    // 1. Calculate node priority
    const branchName = branchHeadToNameMap.get(node.checkpoint.hash) || 
                      (node.parents.length > 0 ? node.parents[0].primaryBranchName : null) || 
                      'main';
    node.priority = branchPriorities.get(branchName) || 100;
    
    // 2. For branch heads, reserve optimal lanes based on priority
    if (node.isHead) {
      node.primaryBranchName = branchName;
      
      // Try to get the best lane for this branch based on priority
      const preferredLane = findOptimalLaneForBranch(branchName, node.priority, activeLanes, lanePriority);
      if (preferredLane !== -1 && (activeLanes[preferredLane] === null || 
          (lanePriority.get(preferredLane) || 0) < node.priority)) {
        assignedColumn = preferredLane;
        branchLaneMap.set(branchName, assignedColumn);
      }
    }

    // 3. For non-head commits, try to inherit from primary parent
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

    // 4. For merge commits, consider special placement
    if (assignedColumn === -1 && node.isMergeCommit && node.parents.length > 1) {
      // Try to place merge commits optimally between parent lanes
      const parentLanes = node.parents.map(p => p.columnIndex).filter(lane => lane !== -1);
      if (parentLanes.length > 1) {
        const minLane = Math.min(...parentLanes);
        const maxLane = Math.max(...parentLanes);
        
        // Try to find a lane between the parents
        for (let lane = minLane; lane <= maxLane; lane++) {
          if (activeLanes[lane] === null) {
            assignedColumn = lane;
            break;
          }
        }
      }
    }

    // 5. Find the best available lane
    if (assignedColumn === -1) {
      assignedColumn = findBestAvailableLane(activeLanes, node.priority, lanePriority);
    }

    // Assign column and update lane tracking
    node.columnIndex = assignedColumn;
    activeLanes[assignedColumn] = node;
    commitLaneMap.set(chkpt.hash, assignedColumn);
    lanePriority.set(assignedColumn, node.priority);

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
    node.laneReservation = node.primaryBranchName;

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

    // --- Generate Enhanced Connections with Improved Paths ---
    node.parents.forEach((parentNode, parentIndex) => {
      const fromNode = node; // Current commit
      const toNode = parentNode; // Parent commit

      const connectionType = getConnectionType(fromNode, toNode, parentIndex);
      const strokeWidth = getConnectionStrokeWidth(connectionType);
      
      // Enhanced color logic for better visual distinction
      let connectionColor = fromNode.color;
      if (connectionType === 'merge' && parentIndex > 0) {
        // For merge commits, use parent's color for secondary connections
        connectionColor = toNode.color;
      } else if (connectionType === 'branch') {
        // For branch connections, use appropriate color
        connectionColor = fromNode.color;
      }

      // Create connection with all necessary data
      connections.push({
        from: { rowIndex: fromNode.rowIndex, columnIndex: fromNode.columnIndex },
        to: { rowIndex: toNode.rowIndex, columnIndex: toNode.columnIndex },
        type: connectionType,
        color: connectionColor,
        strokeWidth: strokeWidth,
        // pathData will be generated during rendering for better performance
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
 * Finds the optimal lane for a branch based on priority and current lane usage.
 */
function findOptimalLaneForBranch(
  _branchName: string,
  priority: number,
  activeLanes: (InternalGraphNode | null)[],
  lanePriority: Map<number, number>
): number {
  // Prefer lanes closer to the left for higher priority branches
  const maxLanesToConsider = Math.min(activeLanes.length + 2, 10);
  
  for (let lane = 0; lane < maxLanesToConsider; lane++) {
    if (lane >= activeLanes.length) {
      // New lane
      return lane;
    }
    
    if (activeLanes[lane] === null) {
      // Available lane
      return lane;
    }
    
    // Check if we can take over this lane based on priority
    const currentPriority = lanePriority.get(lane) || 0;
    if (priority > currentPriority * 1.2) { // 20% priority boost needed to take over
      return lane;
    }
  }
  
  return -1; // No suitable lane found
}

/**
 * Finds the best available lane considering priority and visual aesthetics.
 */
function findBestAvailableLane(
  activeLanes: (InternalGraphNode | null)[],
  priority: number,
  lanePriority: Map<number, number>
): number {
  // First, try to find an empty lane
  const emptyLaneIndex = activeLanes.findIndex(lane => lane === null);
  if (emptyLaneIndex !== -1) {
    return emptyLaneIndex;
  }
  
  // If no empty lanes, try to find a lane we can take over
  for (let lane = 0; lane < activeLanes.length; lane++) {
    const currentPriority = lanePriority.get(lane) || 0;
    if (priority > currentPriority * 1.5) { // Need significant priority to take over
      return lane;
    }
  }
  
  // Create a new lane
  activeLanes.push(null);
  return activeLanes.length - 1;
}

/**
 * Enhanced connection type detection with parent index consideration
 */
function getConnectionType(
  fromNode: InternalGraphNode, 
  toNode: InternalGraphNode, 
  parentIndex: number
): 'direct' | 'branch' | 'merge' {
  if (fromNode.isMergeCommit && parentIndex > 0) {
    return 'merge';
  }
  if (fromNode.columnIndex !== toNode.columnIndex) {
    return 'branch';
  }
  return 'direct';
}

/**
 * Determines optimal stroke width for connection with enhanced visual hierarchy
 */
function getConnectionStrokeWidth(connectionType: 'direct' | 'branch' | 'merge'): number {
  switch (connectionType) {
    case 'direct': return 3; // Thickest for main branch lines
    case 'branch': return 2.5; // Medium for branch connections
    case 'merge': return 2; // Thinner for merge lines to avoid visual clutter
    default: return 2.5;
  }
}