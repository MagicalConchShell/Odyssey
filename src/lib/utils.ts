import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Get syntax highlighting language from file path
 */
export function getLanguageFromPath(path?: string): string {
  if (!path) return "text";
  const ext = path.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    cpp: "cpp",
    c: "c",
    cs: "csharp",
    php: "php",
    rb: "ruby",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    yaml: "yaml",
    yml: "yaml",
    json: "json",
    xml: "xml",
    html: "html",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",
    sql: "sql",
    md: "markdown",
    toml: "ini",
    ini: "ini",
    dockerfile: "dockerfile",
    makefile: "makefile"
  };
  return languageMap[ext || ""] || "text";
}

/**
 * Parse content with line numbers from Claude CLI output
 */
export function parseClaudeContent(rawContent: string) {
  const lines = rawContent.split('\n');
  const codeLines: string[] = [];
  let minLineNumber = Infinity;

  // Check if content has line numbers in Claude CLI format (123→content)
  const nonEmptyLines = lines.filter(line => line.trim() !== '');
  if (nonEmptyLines.length === 0) {
    return { codeContent: rawContent, startLineNumber: 1 };
  }
  
  const parsableLines = nonEmptyLines.filter(line => /^\s*\d+→/.test(line)).length;
  const isLikelyNumbered = (parsableLines / nonEmptyLines.length) > 0.5;

  if (!isLikelyNumbered) {
    return { codeContent: rawContent, startLineNumber: 1 };
  }
  
  // Parse numbered content
  for (const line of lines) {
    const trimmedLine = line.trimStart();
    const match = trimmedLine.match(/^(\d+)→(.*)$/);
    if (match) {
      const lineNum = parseInt(match[1], 10);
      if (minLineNumber === Infinity) {
        minLineNumber = lineNum;
      }
      codeLines.push(match[2]);
    } else if (line.trim() === '') {
      codeLines.push('');
    } else {
      codeLines.push('');
    }
  }
  
  // Remove trailing empty lines
  while (codeLines.length > 0 && codeLines[codeLines.length - 1] === '') {
    codeLines.pop();
  }
  
  return {
    codeContent: codeLines.join('\n'),
    startLineNumber: minLineNumber === Infinity ? 1 : minLineNumber
  };
}