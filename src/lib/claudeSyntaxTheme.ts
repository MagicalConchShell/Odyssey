// Custom dark syntax highlighting theme for Odyssey
// Based on the main odyssey project's syntax theme
interface SyntaxTheme {
  [key: string]: React.CSSProperties;
}

export const claudeSyntaxTheme: SyntaxTheme = {
  'code[class*="language-"]': {
    color: '#e4e4e7',
    background: 'transparent',
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: '0.75rem',
    lineHeight: '1.6',
    direction: 'ltr',
    textAlign: 'left',
    whiteSpace: 'pre',
    wordSpacing: 'normal',
    wordBreak: 'normal',
    tabSize: 2,
    hyphens: 'none',
  },
  'pre[class*="language-"]': {
    color: '#e4e4e7',
    background: 'transparent',
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: '0.75rem',
    lineHeight: '1.6',
    direction: 'ltr',
    textAlign: 'left',
    whiteSpace: 'pre',
    wordSpacing: 'normal',
    wordBreak: 'normal',
    tabSize: 2,
    hyphens: 'none',
    padding: '1rem',
    margin: '0',
    overflow: 'auto',
  },
  comment: {
    color: '#71717a',
    fontStyle: 'italic',
  },
  prolog: {
    color: '#71717a',
    fontStyle: 'italic',
  },
  doctype: {
    color: '#71717a',
    fontStyle: 'italic',
  },
  cdata: {
    color: '#71717a',
    fontStyle: 'italic',
  },
  punctuation: {
    color: '#a1a1aa',
  },
  property: {
    color: '#fbbf24',
  },
  tag: {
    color: '#f87171',
  },
  constant: {
    color: '#a78bfa',
  },
  symbol: {
    color: '#a78bfa',
  },
  deleted: {
    color: '#f87171',
  },
  boolean: {
    color: '#a78bfa',
  },
  number: {
    color: '#a78bfa',
  },
  selector: {
    color: '#34d399',
  },
  'attr-name': {
    color: '#34d399',
  },
  string: {
    color: '#34d399',
  },
  char: {
    color: '#34d399',
  },
  builtin: {
    color: '#34d399',
  },
  inserted: {
    color: '#34d399',
  },
  operator: {
    color: '#60a5fa',
  },
  entity: {
    color: '#60a5fa',
    cursor: 'help',
  },
  url: {
    color: '#60a5fa',
  },
  variable: {
    color: '#e4e4e7',
  },
  atrule: {
    color: '#fbbf24',
  },
  'attr-value': {
    color: '#34d399',
  },
  function: {
    color: '#fbbf24',
  },
  'class-name': {
    color: '#fbbf24',
  },
  keyword: {
    color: '#c084fc',
  },
  regex: {
    color: '#f59e0b',
  },
  important: {
    color: '#f59e0b',
    fontWeight: 'bold',
  },
  bold: {
    fontWeight: 'bold',
  },
  italic: {
    fontStyle: 'italic',
  },
  // Line numbers styling
  '.line-numbers-rows > span:before': {
    color: '#52525b',
    content: 'counter(linenumber)',
  },
  '.line-numbers.line-numbers .line-numbers-rows': {
    borderRight: '1px solid #374151',
  },
  '.line-numbers .line-numbers-rows > span:before': {
    color: '#52525b',
    display: 'block',
    paddingRight: '0.8em',
    textAlign: 'right',
  },
}