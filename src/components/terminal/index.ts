// Terminal module exports
export { Terminal } from './Terminal';
export { TerminalContainer } from './TerminalContainer';
export { TerminalTabComponent } from './TerminalTab';
export { TerminalTabs } from './TerminalTabs';
export { TerminalSearch } from './TerminalSearch';
export { TerminalWelcome } from './TerminalWelcome';

// Re-export hooks from the unified store
export { 
  useTerminals, 
  useActiveTerminal, 
  useHasTerminals,
  useTerminalInstances 
} from '@/store';