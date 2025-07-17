import type { BranchValidationRules, BranchValidationResult } from '@/types/checkpoint'

// Branch name validation rules following Git conventions
export const BRANCH_VALIDATION_RULES: BranchValidationRules = {
  MAX_LENGTH: 250,
  MIN_LENGTH: 1,
  FORBIDDEN_CHARS: /[~^:?*\[\]\\@{}\s]/,
  RESERVED_NAMES: ['HEAD', 'ORIG_HEAD', 'FETCH_HEAD', 'MERGE_HEAD', 'refs', 'logs']
}

/**
 * Validates a branch name according to Git conventions
 */
export function validateBranchName(branchName: string): BranchValidationResult {
  // Check length
  if (branchName.length < BRANCH_VALIDATION_RULES.MIN_LENGTH) {
    return {
      isValid: false,
      error: 'Branch name cannot be empty'
    }
  }

  if (branchName.length > BRANCH_VALIDATION_RULES.MAX_LENGTH) {
    return {
      isValid: false,
      error: `Branch name cannot exceed ${BRANCH_VALIDATION_RULES.MAX_LENGTH} characters`
    }
  }

  // Check for forbidden characters
  if (BRANCH_VALIDATION_RULES.FORBIDDEN_CHARS.test(branchName)) {
    return {
      isValid: false,
      error: 'Branch name contains invalid characters (~^:?*[]\\@{} and spaces are not allowed)'
    }
  }

  // Check for reserved names
  if (BRANCH_VALIDATION_RULES.RESERVED_NAMES.includes(branchName.toUpperCase())) {
    return {
      isValid: false,
      error: 'Branch name is reserved and cannot be used'
    }
  }

  // Check for leading/trailing dots or slashes
  if (branchName.startsWith('.') || branchName.endsWith('.')) {
    return {
      isValid: false,
      error: 'Branch name cannot start or end with a dot'
    }
  }

  if (branchName.startsWith('/') || branchName.endsWith('/')) {
    return {
      isValid: false,
      error: 'Branch name cannot start or end with a slash'
    }
  }

  // Check for consecutive dots
  if (branchName.includes('..')) {
    return {
      isValid: false,
      error: 'Branch name cannot contain consecutive dots'
    }
  }

  // Check for ASCII control characters
  if (/[\x00-\x1f\x7f]/.test(branchName)) {
    return {
      isValid: false,
      error: 'Branch name cannot contain control characters'
    }
  }

  return {
    isValid: true
  }
}

/**
 * Suggests valid branch names based on invalid input
 */
export function suggestBranchName(invalidName: string): string[] {
  const suggestions: string[] = []
  
  // Clean up common issues
  let cleaned = invalidName
    .replace(BRANCH_VALIDATION_RULES.FORBIDDEN_CHARS, '-')
    .replace(/^[.\/]+|[.\/]+$/g, '') // Remove leading/trailing dots and slashes
    .replace(/\.{2,}/g, '-') // Replace consecutive dots with dash
    .replace(/^-+|-+$/g, '') // Remove leading/trailing dashes
    .replace(/-{2,}/g, '-') // Replace consecutive dashes with single dash
    .toLowerCase()
  
  // Ensure minimum length
  if (cleaned.length < BRANCH_VALIDATION_RULES.MIN_LENGTH) {
    cleaned = 'new-branch'
  }
  
  // Truncate if too long
  if (cleaned.length > BRANCH_VALIDATION_RULES.MAX_LENGTH) {
    cleaned = cleaned.substring(0, BRANCH_VALIDATION_RULES.MAX_LENGTH)
  }
  
  suggestions.push(cleaned)
  
  // Add common prefixes
  if (!cleaned.startsWith('feature/') && !cleaned.startsWith('bugfix/') && !cleaned.startsWith('hotfix/')) {
    suggestions.push(`feature/${cleaned}`)
    suggestions.push(`bugfix/${cleaned}`)
  }
  
  return suggestions.filter(name => validateBranchName(name).isValid)
}