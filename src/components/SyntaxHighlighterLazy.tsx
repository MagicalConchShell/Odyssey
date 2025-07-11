import React, { Suspense, lazy } from 'react';

// Lazy load the syntax highlighter to reduce initial bundle size
const SyntaxHighlighter = lazy(() => 
  import('react-syntax-highlighter').then(module => ({
    default: module.Prism as React.ComponentType<any>
  }))
);

interface LazyCodeBlockProps {
  children: string;
  language?: string;
  showLineNumbers?: boolean;
  startingLineNumber?: number;
  wrapLongLines?: boolean;
  customStyle?: React.CSSProperties;
  codeTagProps?: any;
  lineNumberStyle?: any;
  className?: string;
}

export const LazyCodeBlock: React.FC<LazyCodeBlockProps> = ({
  children,
  language = 'text',
  showLineNumbers = false,
  startingLineNumber = 1,
  wrapLongLines = true,
  customStyle = {},
  codeTagProps = {},
  lineNumberStyle = {},
  className = '',
}) => {
  return (
    <Suspense
      fallback={
        <div className={`bg-zinc-950 rounded-lg p-4 ${className}`}>
          <div className="animate-pulse">
            <div className="h-4 bg-zinc-800 rounded mb-2"></div>
            <div className="h-4 bg-zinc-800 rounded w-5/6 mb-2"></div>
            <div className="h-4 bg-zinc-800 rounded w-4/6"></div>
          </div>
        </div>
      }
    >
      <React.Suspense
        fallback={
          <pre className={`bg-zinc-950 text-zinc-300 p-4 rounded-lg overflow-auto ${className}`}>
            <code>{children}</code>
          </pre>
        }
      >
        <SyntaxHighlighter
          language={language}
          showLineNumbers={showLineNumbers}
          startingLineNumber={startingLineNumber}
          wrapLongLines={wrapLongLines}
          customStyle={{
            margin: 0,
            background: 'transparent',
            lineHeight: '1.6',
            ...customStyle,
          }}
          codeTagProps={{
            style: {
              fontSize: '0.75rem',
              ...codeTagProps.style,
            },
            ...codeTagProps,
          }}
          lineNumberStyle={{
            minWidth: '3.5rem',
            paddingRight: '1rem',
            textAlign: 'right',
            opacity: 0.5,
            ...lineNumberStyle,
          }}
          className={className}
        >
          {children}
        </SyntaxHighlighter>
      </React.Suspense>
    </Suspense>
  );
};

export default LazyCodeBlock;